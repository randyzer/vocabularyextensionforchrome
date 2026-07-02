import { parse } from 'csv-parse/sync';

const WORD_PATTERN = /^[a-z][a-z'-]*$/;
const REQUIRED_ECDICT_COLUMNS = [
  'word',
  'phonetic',
  'pos',
  'translation',
  'oxford',
  'tag',
  'bnc',
  'frq',
] as const;

export interface DictionaryBuildEntry {
  lemma: string;
  phonetic?: string;
  partOfSpeech?: string[];
  definitionsZh: string[];
  frequencyRank?: number;
  source: 'ecdict' | 'custom';
}

export interface ParsedCustomWords {
  entries: Map<string, DictionaryBuildEntry>;
  notes: Map<string, { source: string; note?: string }>;
}

export interface DictionarySourceMetadata {
  source: 'ECDICT';
  commit: string;
  committedAt: string;
  url: string;
  sha256: string;
}

export interface DictionaryManifest {
  version: 1;
  source: 'ECDICT';
  ecdictCommit: string;
  ecdictCommittedAt: string;
  ecdictUrl: string;
  ecdictSha256: string;
  upstreamEntryCount: number;
  customEntryCount: number;
  blocklistCount: number;
  entryCount: number;
}

export interface DictionaryArtifacts {
  shards: Record<
    string,
    Record<string, Omit<DictionaryBuildEntry, 'source'>>
  >;
  index: {
    version: 1;
    source: 'ECDICT';
    entryCount: number;
    shards: Record<string, string>;
  };
  manifest: DictionaryManifest;
  report: {
    overriddenWords: string[];
    blockedWords: string[];
    shardCounts: Record<string, number>;
  };
}

export interface DictionaryArtifactOptions {
  sourceMetadata: DictionarySourceMetadata;
  upstreamEntryCount: number;
  customEntryCount: number;
  blocklistCount: number;
  overriddenWords: string[];
  blockedWords: string[];
}

export interface DictionaryUpdateReport {
  sourceMetadata: DictionarySourceMetadata;
  previousEntryCount: number;
  nextEntryCount: number;
  added: string[];
  removed: string[];
  changed: string[];
}

export function normalizeDictionaryWord(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('en')
    .replaceAll('’', "'");
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function assertColumns(csv: string): void {
  const [header = ''] = csv.replace(/^\uFEFF/, '').split(/\r?\n/, 1);
  const columns = header.split(',').map((value) => value.trim());
  const missing = REQUIRED_ECDICT_COLUMNS.filter(
    (column) => !columns.includes(column),
  );

  if (missing.length > 0) {
    throw new Error(`ECDICT_MISSING_COLUMNS:${missing.join(',')}`);
  }
}

export function parseEcdict(csv: string): Map<string, DictionaryBuildEntry> {
  assertColumns(csv);
  const rows = parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as Array<Record<string, string>>;
  const entries = new Map<string, DictionaryBuildEntry>();

  for (const row of rows) {
    const lemma = normalizeDictionaryWord(row.word ?? '');
    const definitionsZh = uniqueNonEmpty(
      String(row.translation ?? '').split(/\r?\n/),
    ).slice(0, 6);
    const bncRank = Number(row.bnc) || 0;
    const contemporaryRank = Number(row.frq) || 0;
    const eligible = (
      String(row.tag ?? '').trim().length > 0
      || String(row.oxford ?? '').trim() === '1'
      || (bncRank > 0 && bncRank <= 50_000)
      || (contemporaryRank > 0 && contemporaryRank <= 50_000)
    );

    if (!WORD_PATTERN.test(lemma) || definitionsZh.length === 0 || !eligible) {
      continue;
    }

    const ranks = [bncRank, contemporaryRank].filter((rank) => rank > 0);
    entries.set(lemma, {
      lemma,
      phonetic: String(row.phonetic ?? '').trim() || undefined,
      partOfSpeech: uniqueNonEmpty(
        [...String(row.pos ?? '').matchAll(/([a-z]+):/gi)]
          .map((match) => match[1] ?? ''),
      ),
      definitionsZh,
      frequencyRank: ranks.length > 0 ? Math.min(...ranks) : undefined,
      source: 'ecdict',
    });
  }

  return entries;
}

export function parseCustomWords(csv: string): ParsedCustomWords {
  const rows = parse(csv, {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    info: true,
  }) as Array<{
    record: Record<string, string>;
    info: { lines: number };
  }>;
  const entries = new Map<string, DictionaryBuildEntry>();
  const notes = new Map<string, { source: string; note?: string }>();

  for (const { record, info } of rows) {
    const lemma = normalizeDictionaryWord(record.word ?? '');
    if (!WORD_PATTERN.test(lemma)) {
      throw new Error(`CUSTOM_INVALID_WORD:${lemma}:row=${info.lines}`);
    }
    if (entries.has(lemma)) {
      throw new Error(`CUSTOM_DUPLICATE_WORD:${lemma}:row=${info.lines}`);
    }

    const definitionsZh = uniqueNonEmpty(
      String(record.definitions_zh ?? '').split('|'),
    ).slice(0, 6);
    const source = String(record.source ?? '').trim();
    if (definitionsZh.length === 0 || source.length === 0) {
      throw new Error(`CUSTOM_REQUIRED_FIELD:${lemma}:row=${info.lines}`);
    }
    if (!definitionsZh.some((definition) => /[\u3400-\u9fff]/u.test(
      definition,
    ))) {
      throw new Error(
        `CUSTOM_DEFINITION_NOT_CHINESE:${lemma}:row=${info.lines}`,
      );
    }

    entries.set(lemma, {
      lemma,
      phonetic: String(record.phonetic ?? '').trim() || undefined,
      partOfSpeech: uniqueNonEmpty(
        String(record.part_of_speech ?? '').split('|'),
      ),
      definitionsZh,
      source: 'custom',
    });
    notes.set(lemma, {
      source,
      note: String(record.note ?? '').trim() || undefined,
    });
  }

  return { entries, notes };
}

export function parseBlocklist(text: string): Set<string> {
  const words = new Set<string>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const value = raw.trim();
    if (!value || value.startsWith('#')) {
      return;
    }

    const word = normalizeDictionaryWord(value);
    if (!WORD_PATTERN.test(word)) {
      throw new Error(`BLOCKLIST_INVALID_WORD:${word}:row=${index + 1}`);
    }
    words.add(word);
  });

  return words;
}

export function mergeDictionaryEntries(
  upstream: Map<string, DictionaryBuildEntry>,
  custom: ParsedCustomWords,
  blocklist: Set<string>,
): Map<string, DictionaryBuildEntry> {
  const merged = new Map(upstream);

  for (const [word, entry] of custom.entries) {
    merged.set(word, entry);
  }
  for (const word of blocklist) {
    merged.delete(word);
  }

  return new Map([...merged.entries()].sort(([left], [right]) => (
    left.localeCompare(right, 'en')
  )));
}

function compareWords(left: string, right: string): number {
  return left.localeCompare(right, 'en');
}

function dictionaryLetters(): string[] {
  return 'abcdefghijklmnopqrstuvwxyz'.split('');
}

export function buildDictionaryArtifacts(
  entries: Map<string, DictionaryBuildEntry>,
  options: DictionaryArtifactOptions,
): DictionaryArtifacts {
  const shards: DictionaryArtifacts['shards'] = {};
  const shardFiles: Record<string, string> = {};
  const shardCounts: Record<string, number> = {};

  for (const letter of dictionaryLetters()) {
    shards[letter] = {};
    shardFiles[letter] = `${letter}.json`;
    shardCounts[letter] = 0;
  }

  for (const [word, entry] of [...entries.entries()].sort(
    ([left], [right]) => compareWords(left, right),
  )) {
    const shardKey = word.charAt(0);
    const shard = shards[shardKey];
    if (!shard) {
      throw new Error(`DICTIONARY_INVALID_SHARD_KEY:${word}`);
    }

    const { source: _source, ...runtimeEntry } = entry;
    shard[word] = runtimeEntry;
    shardCounts[shardKey] = (shardCounts[shardKey] ?? 0) + 1;
  }

  const entryCount = entries.size;
  return {
    shards,
    index: {
      version: 1,
      source: 'ECDICT',
      entryCount,
      shards: shardFiles,
    },
    manifest: {
      version: 1,
      source: options.sourceMetadata.source,
      ecdictCommit: options.sourceMetadata.commit,
      ecdictCommittedAt: options.sourceMetadata.committedAt,
      ecdictUrl: options.sourceMetadata.url,
      ecdictSha256: options.sourceMetadata.sha256,
      upstreamEntryCount: options.upstreamEntryCount,
      customEntryCount: options.customEntryCount,
      blocklistCount: options.blocklistCount,
      entryCount,
    },
    report: {
      overriddenWords: [...options.overriddenWords].sort(compareWords),
      blockedWords: [...options.blockedWords].sort(compareWords),
      shardCounts,
    },
  };
}

export function compareDictionaryIndexes(
  previous: Map<string, string>,
  next: Map<string, string>,
): { added: string[]; removed: string[]; changed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const [word, serializedEntry] of next) {
    const previousEntry = previous.get(word);
    if (previousEntry === undefined) {
      added.push(word);
    } else if (previousEntry !== serializedEntry) {
      changed.push(word);
    }
  }

  for (const word of previous.keys()) {
    if (!next.has(word)) {
      removed.push(word);
    }
  }

  return {
    added: added.sort(compareWords),
    removed: removed.sort(compareWords),
    changed: changed.sort(compareWords),
  };
}

function renderWordList(title: string, words: string[]): string {
  const limit = 100;
  const visible = words.slice(0, limit);
  const lines = visible.length > 0
    ? visible.map((word) => `- \`${word}\``)
    : ['- None'];
  if (words.length > limit) {
    lines.push(`- …and ${words.length - limit} more`);
  }
  return [`## ${title}`, '', ...lines].join('\n');
}

export function renderDictionaryReport(
  report: DictionaryUpdateReport,
): string {
  return [
    '# Offline dictionary update',
    '',
    `ECDICT commit: \`${report.sourceMetadata.commit}\``,
    `ECDICT committed at: ${report.sourceMetadata.committedAt}`,
    `ECDICT SHA-256: \`${report.sourceMetadata.sha256}\``,
    '',
    `Entries: ${report.previousEntryCount} → ${report.nextEntryCount}`,
    `Added: ${report.added.length} · Removed: ${report.removed.length} · Changed: ${report.changed.length}`,
    '',
    renderWordList('Added words', report.added),
    '',
    renderWordList('Removed words', report.removed),
    '',
    renderWordList('Changed words', report.changed),
    '',
  ].join('\n');
}

export function validateDictionaryArtifacts(
  artifacts: DictionaryArtifacts,
  options: {
    minimumEntries: number;
    previousEntryCount?: number;
    maximumChangeRatio: number;
  },
): void {
  const letters = dictionaryLetters();
  const shardKeys = Object.keys(artifacts.shards);
  const indexShardKeys = Object.keys(artifacts.index.shards);

  if (
    shardKeys.length !== letters.length
    || !letters.every((letter, index) => shardKeys[index] === letter)
  ) {
    throw new Error('DICTIONARY_INVALID_SHARDS');
  }
  if (
    indexShardKeys.length !== letters.length
    || !letters.every(
      (letter, index) => (
        indexShardKeys[index] === letter
        && artifacts.index.shards[letter] === `${letter}.json`
      ),
    )
  ) {
    throw new Error('DICTIONARY_INVALID_INDEX_SHARDS');
  }

  let countedEntries = 0;
  for (const letter of letters) {
    const shard = artifacts.shards[letter];
    if (!shard) {
      throw new Error(`DICTIONARY_MISSING_SHARD:${letter}`);
    }

    const words = Object.keys(shard);
    if (!words.every((word, index) => (
      word.charAt(0) === letter
      && (index === 0 || compareWords(words[index - 1] ?? '', word) < 0)
    ))) {
      throw new Error(`DICTIONARY_UNSORTED_SHARD:${letter}`);
    }

    for (const [word, entry] of Object.entries(shard)) {
      if (entry.lemma !== word) {
        throw new Error(`DICTIONARY_LEMMA_MISMATCH:${word}`);
      }
      if (
        !Array.isArray(entry.definitionsZh)
        || entry.definitionsZh.length === 0
        || entry.definitionsZh.some((definition) => !definition.trim())
      ) {
        throw new Error(`DICTIONARY_EMPTY_DEFINITION:${word}`);
      }
      countedEntries += 1;
    }

    if (artifacts.report.shardCounts[letter] !== words.length) {
      throw new Error(`DICTIONARY_SHARD_COUNT_MISMATCH:${letter}`);
    }
  }

  if (
    artifacts.index.entryCount !== countedEntries
    || artifacts.manifest.entryCount !== countedEntries
  ) {
    throw new Error(
      `DICTIONARY_ENTRY_COUNT_MISMATCH:counted=${countedEntries}`,
    );
  }
  if (countedEntries < options.minimumEntries) {
    throw new Error(
      `DICTIONARY_TOO_SMALL:minimum=${options.minimumEntries}:actual=${countedEntries}`,
    );
  }

  const previous = options.previousEntryCount;
  if (previous !== undefined && previous > 0) {
    const ratio = Math.abs(countedEntries - previous) / previous;
    if (ratio > options.maximumChangeRatio) {
      throw new Error(
        `DICTIONARY_ENTRY_CHANGE_EXCEEDED:previous=${previous}:next=${countedEntries}:ratio=${ratio}`,
      );
    }
  }
}
