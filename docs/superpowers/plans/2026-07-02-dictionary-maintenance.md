# Offline Dictionary Maintenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deterministic local dictionary update pipeline that merges pinned ECDICT data with reviewed custom words and a blocklist, validates the result, and opens a monthly GitHub update PR without changing runtime privacy.

**Architecture:** TypeScript build tools run through `tsx` and share a pure pipeline module that parses, normalizes, merges, validates, and reports without touching the filesystem. Thin CLI modules handle downloads, ignored source metadata, atomic publication, and GitHub Actions integration; the extension continues to consume committed JSON shards exactly as it does today.

**Tech Stack:** Node.js 20+, TypeScript, `tsx`, `csv-parse`, Vitest, WXT, GitHub Actions, GitHub CLI.

---

## File map

| File | Responsibility |
| --- | --- |
| `scripts/dictionary/pipeline.ts` | Pure parsing, normalization, merge, shard, manifest, report, and quality-gate logic. |
| `scripts/dictionary/files.ts` | Read inputs, write temporary output, validate it, and atomically replace the committed dictionary. |
| `scripts/dictionary/build.ts` | Offline CLI using existing ignored source files. |
| `scripts/dictionary/check.ts` | Read-only validation CLI for committed output. |
| `scripts/dictionary/update.ts` | Resolve a pinned ECDICT commit, download source data, build, check, and write reports. |
| `data/custom-words.csv` | Reviewed additions and corrections committed to Git. |
| `data/dictionary-blocklist.txt` | Reviewed exclusions committed to Git. |
| `public/dictionary/manifest.json` | Deterministic source provenance and build statistics shipped with the extension. |
| `tests/fixtures/dictionary/*` | Small deterministic upstream/custom/blocklist test inputs. |
| `tests/unit/dictionary-pipeline.test.ts` | Pure pipeline tests. |
| `tests/unit/dictionary-files.test.ts` | Atomic publication and no-overwrite-on-failure tests. |
| `.github/workflows/update-dictionary.yml` | Monthly/manual update, verification, fixed branch, and PR creation. |
| `docs/dictionary-maintenance.md` | Maintainer runbook. |
| `README.md` | Short link to the maintainer runbook. |
| `package.json` / `pnpm-lock.yaml` | `tsx` and dictionary scripts. |

## Task 1: Establish typed dictionary parsing

**Files:**
- Create: `scripts/dictionary/pipeline.ts`
- Create: `tests/fixtures/dictionary/ecdict.csv`
- Create: `tests/unit/dictionary-pipeline.test.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install the TypeScript script runner**

Run:

```bash
pnpm add -D tsx
```

Expected: `tsx` appears in `devDependencies`, and `pnpm-lock.yaml` changes without unrelated package upgrades.

- [ ] **Step 2: Add the small ECDICT fixture**

Create `tests/fixtures/dictionary/ecdict.csv`:

```csv
word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio
ability,əˈbɪləti,,n. 能力,n: ability,4,1,CET4,1200,900,,,
running,ˈrʌnɪŋ,,n. 跑步,n: running,3,0,,2500,2200,,,
rare-filtered,,,adj. 极少见,adj: rare,0,0,,0,0,,,
bad123,,,无效词,n: invalid,5,1,CET4,1,1,,,
```

- [ ] **Step 3: Write failing parsing tests**

Create `tests/unit/dictionary-pipeline.test.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  parseEcdict,
  type DictionaryBuildEntry,
} from '../../scripts/dictionary/pipeline';

const fixtureUrl = new URL(
  '../fixtures/dictionary/ecdict.csv',
  import.meta.url,
);

describe('dictionary pipeline', () => {
  it('parses eligible ECDICT rows into runtime entries', async () => {
    const csv = await readFile(fixtureUrl, 'utf8');

    expect(parseEcdict(csv)).toEqual<Map<string, DictionaryBuildEntry>>(
      new Map([
        ['ability', {
          lemma: 'ability',
          phonetic: 'əˈbɪləti',
          partOfSpeech: ['n'],
          definitionsZh: ['n. 能力'],
          frequencyRank: 900,
          source: 'ecdict',
        }],
        ['running', {
          lemma: 'running',
          phonetic: 'ˈrʌnɪŋ',
          partOfSpeech: ['n'],
          definitionsZh: ['n. 跑步'],
          frequencyRank: 2200,
          source: 'ecdict',
        }],
      ]),
    );
  });

  it('rejects ECDICT files missing required columns', () => {
    expect(() => parseEcdict('word,translation\nability,能力\n'))
      .toThrow('ECDICT_MISSING_COLUMNS:phonetic,pos,oxford,tag,bnc,frq');
  });
});
```

- [ ] **Step 4: Run the parsing tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-pipeline.test.ts
```

Expected: FAIL because `scripts/dictionary/pipeline.ts` does not exist.

- [ ] **Step 5: Implement normalized ECDICT parsing**

Create `scripts/dictionary/pipeline.ts` with these exported contracts and behavior:

```ts
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
```

- [ ] **Step 6: Run tests and type checking**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-pipeline.test.ts
pnpm typecheck
```

Expected: 2 dictionary pipeline tests PASS and TypeScript exits with code 0.

- [ ] **Step 7: Commit parsing**

```bash
git add package.json pnpm-lock.yaml scripts/dictionary/pipeline.ts tests/fixtures/dictionary/ecdict.csv tests/unit/dictionary-pipeline.test.ts
git commit -m "feat: add typed dictionary parser"
```

## Task 2: Merge custom words and blocklist

**Files:**
- Modify: `scripts/dictionary/pipeline.ts`
- Create: `data/custom-words.csv`
- Create: `data/dictionary-blocklist.txt`
- Create: `tests/fixtures/dictionary/custom-words.csv`
- Create: `tests/fixtures/dictionary/blocklist.txt`
- Modify: `tests/unit/dictionary-pipeline.test.ts`

- [ ] **Step 1: Add committed data templates**

Create `data/custom-words.csv`:

```csv
word,phonetic,part_of_speech,definitions_zh,source,note
```

Create an empty `data/dictionary-blocklist.txt` with a comment:

```text
# One normalized English word per line. Blank lines and lines starting with # are ignored.
```

Create `tests/fixtures/dictionary/custom-words.csv`:

```csv
word,phonetic,part_of_speech,definitions_zh,source,note
ability,əˈbɪləti,n,本领|能力,maintainer,override order
cloud-native,,adj,云原生,maintainer,new term
```

Create `tests/fixtures/dictionary/blocklist.txt`:

```text
# reviewed exclusions
running
```

- [ ] **Step 2: Add failing merge tests**

Append to `tests/unit/dictionary-pipeline.test.ts`:

```ts
import {
  mergeDictionaryEntries,
  parseBlocklist,
  parseCustomWords,
} from '../../scripts/dictionary/pipeline';

it('lets custom words override ECDICT and applies the blocklist', async () => {
  const [ecdictCsv, customCsv, blocklist] = await Promise.all([
    readFile(fixtureUrl, 'utf8'),
    readFile(new URL('../fixtures/dictionary/custom-words.csv', import.meta.url), 'utf8'),
    readFile(new URL('../fixtures/dictionary/blocklist.txt', import.meta.url), 'utf8'),
  ]);

  const merged = mergeDictionaryEntries(
    parseEcdict(ecdictCsv),
    parseCustomWords(customCsv),
    parseBlocklist(blocklist),
  );

  expect(merged.get('ability')?.definitionsZh).toEqual(['本领', '能力']);
  expect(merged.get('ability')?.source).toBe('custom');
  expect(merged.get('cloud-native')?.definitionsZh).toEqual(['云原生']);
  expect(merged.has('running')).toBe(false);
});

it('reports the row for duplicate custom keys', () => {
  const csv = [
    'word,phonetic,part_of_speech,definitions_zh,source,note',
    'Ability,,n,能力,maintainer,first',
    'ability,,n,本领,maintainer,duplicate',
  ].join('\n');

  expect(() => parseCustomWords(csv))
    .toThrow('CUSTOM_DUPLICATE_WORD:ability:row=3');
});

it('reports invalid blocklist rows', () => {
  expect(() => parseBlocklist('valid\nbad123\n'))
    .toThrow('BLOCKLIST_INVALID_WORD:bad123:row=2');
});
```

- [ ] **Step 3: Run the merge tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-pipeline.test.ts
```

Expected: FAIL because the three merge functions are not exported.

- [ ] **Step 4: Implement custom parsing, blocklist parsing, and merge**

Add these exports to `scripts/dictionary/pipeline.ts`:

```ts
export interface ParsedCustomWords {
  entries: Map<string, DictionaryBuildEntry>;
  notes: Map<string, { source: string; note?: string }>;
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
```

- [ ] **Step 5: Run focused and full unit tests**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-pipeline.test.ts
pnpm test
```

Expected: dictionary tests and the existing full suite PASS.

- [ ] **Step 6: Commit merge policy**

```bash
git add scripts/dictionary/pipeline.ts data/custom-words.csv data/dictionary-blocklist.txt tests/fixtures/dictionary tests/unit/dictionary-pipeline.test.ts
git commit -m "feat: merge custom dictionary data"
```

## Task 3: Generate deterministic artifacts and reports

**Files:**
- Modify: `scripts/dictionary/pipeline.ts`
- Modify: `tests/unit/dictionary-pipeline.test.ts`

- [ ] **Step 1: Add failing artifact tests**

Add tests that use the merged fixture and assert:

```ts
import {
  buildDictionaryArtifacts,
  compareDictionaryIndexes,
  validateDictionaryArtifacts,
} from '../../scripts/dictionary/pipeline';

const sourceMetadata = {
  source: 'ECDICT' as const,
  commit: '0123456789abcdef',
  committedAt: '2026-07-01T00:00:00Z',
  url: 'https://raw.githubusercontent.com/skywind3000/ECDICT/0123456789abcdef/ecdict.mini.csv',
  sha256: 'a'.repeat(64),
};

it('generates stable shards, index, manifest, and report', () => {
  const artifacts = buildDictionaryArtifacts(mergedFixture, {
    sourceMetadata,
    upstreamEntryCount: 2,
    customEntryCount: 2,
    blocklistCount: 1,
    overriddenWords: ['ability'],
    blockedWords: ['running'],
  });
  const repeated = buildDictionaryArtifacts(mergedFixture, {
    sourceMetadata,
    upstreamEntryCount: 2,
    customEntryCount: 2,
    blocklistCount: 1,
    overriddenWords: ['ability'],
    blockedWords: ['running'],
  });

  expect(artifacts).toEqual(repeated);
  expect(artifacts.index.entryCount).toBe(2);
  expect(artifacts.manifest.ecdictCommit).toBe('0123456789abcdef');
  expect(Object.keys(artifacts.shards)).toEqual(
    'abcdefghijklmnopqrstuvwxyz'.split(''),
  );
});

it('rejects entry-count changes beyond ten percent', () => {
  expect(() => validateDictionaryArtifacts(artifactsFixture, {
    minimumEntries: 1,
    previousEntryCount: 100,
    maximumChangeRatio: 0.1,
  })).toThrow('DICTIONARY_ENTRY_CHANGE_EXCEEDED');
});

it('reports added, removed, and changed words', () => {
  expect(compareDictionaryIndexes(
    new Map([['old', '{"lemma":"old"}'], ['same', '{"lemma":"same"}']]),
    new Map([['new', '{"lemma":"new"}'], ['same', '{"lemma":"changed"}']]),
  )).toEqual({
    added: ['new'],
    removed: ['old'],
    changed: ['same'],
  });
});
```

Define `mergedFixture` and `artifactsFixture` once at the top of the test file from the Task 2 fixtures; do not duplicate parsing setup in individual tests.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-pipeline.test.ts
```

Expected: FAIL because artifact and validation functions do not exist.

- [ ] **Step 3: Implement deterministic artifact contracts**

Add these types and functions to `pipeline.ts`:

```ts
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
  shards: Record<string, Record<string, Omit<DictionaryBuildEntry, 'source'>>>;
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
```

Implement `buildDictionaryArtifacts()` so it:

1. Creates all 26 shard objects before assigning entries.
2. Iterates the already sorted merged map.
3. Removes build-only `source` from runtime entries.
4. Sorts every emitted list and object key using `localeCompare(..., 'en')`.
5. Builds `index.shards` as `{ a: 'a.json', ..., z: 'z.json' }`.
6. Uses only source commit time, never current wall-clock time.

Implement:

```ts
export function compareDictionaryIndexes(
  previous: Map<string, string>,
  next: Map<string, string>,
): { added: string[]; removed: string[]; changed: string[] };

export function validateDictionaryArtifacts(
  artifacts: DictionaryArtifacts,
  options: {
    minimumEntries: number;
    previousEntryCount?: number;
    maximumChangeRatio: number;
  },
): void;
```

Validation must check 26 shards, lemma/key equality, non-empty definitions, exact index/manifest counts, minimum count, and:

```ts
const ratio = Math.abs(next - previous) / previous;
if (ratio > options.maximumChangeRatio) {
  throw new Error(
    `DICTIONARY_ENTRY_CHANGE_EXCEEDED:previous=${previous}:next=${next}:ratio=${ratio}`,
  );
}
```

- [ ] **Step 4: Run dictionary tests**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-pipeline.test.ts
pnpm typecheck
```

Expected: artifact tests PASS and TypeScript exits successfully.

- [ ] **Step 5: Commit deterministic generation**

```bash
git add scripts/dictionary/pipeline.ts tests/unit/dictionary-pipeline.test.ts
git commit -m "feat: generate deterministic dictionary artifacts"
```

## Task 4: Add safe file publication and offline CLIs

**Files:**
- Create: `scripts/dictionary/files.ts`
- Create: `scripts/dictionary/build.ts`
- Create: `scripts/dictionary/check.ts`
- Create: `tests/unit/dictionary-files.test.ts`
- Modify: `package.json`
- Delete: `scripts/build-dictionary.mjs`

- [ ] **Step 1: Write failing atomic-publication tests**

Create `tests/unit/dictionary-files.test.ts` using a temporary directory from `node:os` and assert:

```ts
it('replaces the output only after every artifact validates', async () => {
  await writeFile(join(output, 'sentinel.txt'), 'old');
  await publishDictionaryArtifacts(validArtifacts, {
    outputDirectory: output,
    licensePath,
    quality: {
      minimumEntries: 1,
      maximumChangeRatio: 0.1,
    },
  });

  await expect(readFile(join(output, 'index.json'), 'utf8'))
    .resolves.toContain('"entryCount"');
  await expect(access(join(output, 'sentinel.txt'))).rejects.toThrow();
});

it('preserves the old output when validation fails', async () => {
  await writeFile(join(output, 'sentinel.txt'), 'old');

  await expect(publishDictionaryArtifacts(invalidArtifacts, {
    outputDirectory: output,
    licensePath,
    quality: {
      minimumEntries: 50_000,
      maximumChangeRatio: 0.1,
    },
  })).rejects.toThrow();

  await expect(readFile(join(output, 'sentinel.txt'), 'utf8'))
    .resolves.toBe('old');
});
```

Use `afterEach` to remove only the temporary test directory.

- [ ] **Step 2: Run the file tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-files.test.ts
```

Expected: FAIL because `publishDictionaryArtifacts` does not exist.

- [ ] **Step 3: Implement filesystem orchestration**

Create `scripts/dictionary/files.ts` exporting:

```ts
export async function loadDictionaryInputs(paths: {
  ecdictCsv: string;
  sourceMetadata: string;
  customWords: string;
  blocklist: string;
}): Promise<{
  ecdictCsv: string;
  sourceMetadata: DictionarySourceMetadata;
  customWordsCsv: string;
  blocklistText: string;
}>;

export async function publishDictionaryArtifacts(
  artifacts: DictionaryArtifacts,
  options: {
    outputDirectory: string;
    licensePath: string;
    quality: {
      minimumEntries: number;
      previousEntryCount?: number;
      maximumChangeRatio: number;
    };
  },
): Promise<void>;

export async function readCommittedDictionary(
  outputDirectory: string,
): Promise<{
  entryCount: number;
  serializedEntries: Map<string, string>;
}>;
```

`publishDictionaryArtifacts` must:

1. Validate before writing.
2. Create a sibling temporary directory.
3. Write sorted shard JSON, `index.json`, `manifest.json`, and copy `LICENSE`.
4. Re-read and validate every written JSON file.
5. Rename current output to a backup.
6. Rename temporary output into place.
7. Restore the backup if the second rename fails.
8. Delete the backup only after successful publication.

- [ ] **Step 4: Replace the old build script with typed CLIs**

Create `scripts/dictionary/build.ts` that:

1. Reads `data/source/ecdict.csv` and `data/source/ecdict-source.json`.
2. Reads committed custom words and blocklist.
3. Reads the previous committed dictionary count.
4. Builds and publishes artifacts with production quality options:

```ts
{
  minimumEntries: 50_000,
  previousEntryCount,
  maximumChangeRatio: 0.1,
}
```

Create `scripts/dictionary/check.ts` that reads the committed output, validates all JSON structures and counts, and exits without modifying files.

Modify `package.json`:

```json
{
  "scripts": {
    "dict:build": "tsx scripts/dictionary/build.ts",
    "dict:check": "tsx scripts/dictionary/check.ts"
  }
}
```

Delete `scripts/build-dictionary.mjs`.

- [ ] **Step 5: Run file tests and offline command checks**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-files.test.ts tests/unit/dictionary-pipeline.test.ts
pnpm dict:check
pnpm typecheck
```

Expected: tests and type checking PASS; `dict:check` validates the current 57,833-entry committed dictionary before a manifest exists by using `index.json` as the initial baseline.

- [ ] **Step 6: Commit safe publication**

```bash
git add package.json scripts/dictionary scripts/build-dictionary.mjs tests/unit/dictionary-files.test.ts
git commit -m "feat: add safe dictionary build commands"
```

## Task 5: Add pinned upstream update and diff reporting

**Files:**
- Create: `scripts/dictionary/update.ts`
- Create: `tests/unit/dictionary-update.test.ts`
- Modify: `scripts/dictionary/pipeline.ts`
- Modify: `scripts/dictionary/files.ts`
- Modify: `tests/unit/dictionary-pipeline.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing source and report tests**

Add tests for:

```ts
expect(parseGithubCommitResponse({
  sha: '0123456789abcdef',
  commit: { committer: { date: '2026-07-01T00:00:00Z' } },
})).toEqual({
  commit: '0123456789abcdef',
  committedAt: '2026-07-01T00:00:00Z',
  url: 'https://raw.githubusercontent.com/skywind3000/ECDICT/0123456789abcdef/ecdict.mini.csv',
});

expect(renderDictionaryReport(reportFixture)).toContain(
  'Added: 2 · Removed: 1 · Changed: 3',
);
```

Mock `globalThis.fetch` in a focused update-module test and assert:

- GitHub commit API is requested first.
- Raw CSV URL contains the returned full commit SHA.
- A non-2xx response throws `ECDICT_DOWNLOAD_FAILED:<status>`.
- SHA-256 recorded in metadata matches the downloaded bytes.

- [ ] **Step 2: Run update tests and verify RED**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-pipeline.test.ts tests/unit/dictionary-update.test.ts
```

Expected: FAIL because source parsing, report rendering, and update module do not exist.

- [ ] **Step 3: Implement pinned update**

Create `scripts/dictionary/update.ts` with dependency-injectable exports:

```ts
export async function resolveLatestEcdictCommit(
  fetcher: typeof fetch = fetch,
): Promise<{ commit: string; committedAt: string; url: string }>;

export async function downloadEcdictSource(
  source: { commit: string; committedAt: string; url: string },
  fetcher: typeof fetch = fetch,
): Promise<{ csv: string; metadata: DictionarySourceMetadata }>;

export async function updateDictionary(): Promise<void>;
```

Use:

```text
https://api.github.com/repos/skywind3000/ECDICT/commits/master
```

and then pin the raw download to:

```text
https://raw.githubusercontent.com/skywind3000/ECDICT/<full-sha>/ecdict.mini.csv
```

Send a descriptive `User-Agent`, reject non-2xx responses, calculate SHA-256 with `node:crypto`, and only write `data/source/ecdict.csv` plus `ecdict-source.json` after the complete download succeeds.

`updateDictionary()` then:

1. Reads the previous committed dictionary.
2. builds and publishes the new one;
3. computes added, removed, and changed words;
4. writes ignored reports:
   - `data/source/dictionary-update-report.json`
   - `data/source/dictionary-update-report.md`
5. prints the Markdown summary.

Add:

```json
{
  "scripts": {
    "dict:update": "tsx scripts/dictionary/update.ts"
  }
}
```

- [ ] **Step 4: Run mocked tests**

Run:

```bash
pnpm exec vitest run tests/unit/dictionary-update.test.ts tests/unit/dictionary-pipeline.test.ts
pnpm typecheck
```

Expected: all update tests PASS without real network access.

- [ ] **Step 5: Run one real update**

Run:

```bash
pnpm dict:update
pnpm dict:check
git diff --stat public/dictionary
```

Expected: network download succeeds, `public/dictionary/manifest.json` is created, all 26 shards pass checks, and the command prints a reviewable diff report. If the 10% threshold fails, stop and investigate upstream/filter changes rather than weakening the gate.

- [ ] **Step 6: Verify the regenerated dictionary**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
test -s .output/chrome-mv3/dictionary/manifest.json
test -s .output/chrome-mv3/dictionary/LICENSE
```

Expected: full tests and build PASS; manifest and license are present in production output.

- [ ] **Step 7: Commit updater and regenerated artifacts**

```bash
git add package.json scripts/dictionary tests public/dictionary data/custom-words.csv data/dictionary-blocklist.txt
git commit -m "feat: add reproducible dictionary updates"
```

Do not add `data/source/`; confirm it remains ignored with:

```bash
git status --ignored --short data/source
```

## Task 6: Add monthly GitHub update PR automation

**Files:**
- Create: `.github/workflows/update-dictionary.yml`

- [ ] **Step 1: Create the workflow**

Create `.github/workflows/update-dictionary.yml`:

```yaml
name: Update offline dictionary

on:
  schedule:
    - cron: '17 3 1 * *'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: dictionary-update
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
        with:
          version: 10.14.0

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Update and verify dictionary
        run: |
          pnpm dict:update
          pnpm dict:check
          pnpm test
          pnpm typecheck
          pnpm build

      - name: Detect dictionary changes
        id: changes
        run: |
          if git diff --quiet -- public/dictionary; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
          else
            echo "changed=true" >> "$GITHUB_OUTPUT"
          fi

      - name: Create or update dictionary branch
        if: steps.changes.outputs.changed == 'true'
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          branch="automation/dictionary-update"
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git checkout -B "$branch"
          git add public/dictionary
          git commit -m "chore: update offline dictionary"
          git push --force-with-lease origin "$branch"

          pr_number="$(gh pr list \
            --head "$branch" \
            --state open \
            --json number \
            --jq '.[0].number // empty')"

          if [ -n "$pr_number" ]; then
            gh pr edit "$pr_number" \
              --title "chore: update offline dictionary" \
              --body-file data/source/dictionary-update-report.md
          else
            gh pr create \
              --base "${{ github.event.repository.default_branch }}" \
              --head "$branch" \
              --title "chore: update offline dictionary" \
              --body-file data/source/dictionary-update-report.md
          fi
```

- [ ] **Step 2: Validate workflow syntax and policy**

Run:

```bash
node -e "const fs=require('fs'); const text=fs.readFileSync('.github/workflows/update-dictionary.yml','utf8'); for (const value of ['workflow_dispatch','dictionary-update','pull-requests: write','pnpm dict:update','gh pr create']) if (!text.includes(value)) throw new Error(value)"
git diff --check
```

Expected: command exits 0 and no whitespace errors are reported.

- [ ] **Step 3: Commit automation**

```bash
git add .github/workflows/update-dictionary.yml
git commit -m "ci: automate dictionary update pull requests"
```

Repository setup required after push:

1. GitHub → Settings → Actions → General.
2. Enable “Allow GitHub Actions to create and approve pull requests”.
3. Run the workflow manually once.
4. Confirm either “no changes” or one `automation/dictionary-update` PR.

## Task 7: Add maintainer documentation

**Files:**
- Create: `docs/dictionary-maintenance.md`
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md`

- [ ] **Step 1: Create the maintenance runbook**

Create `docs/dictionary-maintenance.md` with these exact sections:

````markdown
# 离线词典维护

## 数据来源

运行时词典派生自 ECDICT，并合并仓库维护的自定义词条和 blocklist。扩展运行时不访问任何词典服务器。

## 本地更新

```bash
pnpm dict:update
pnpm dict:check
pnpm test
pnpm typecheck
pnpm build
```

`dict:update` 需要网络；`dict:build` 和 `dict:check` 使用已有本地输入。

## 添加或修正词条

编辑 `data/custom-words.csv`。字段为：

```text
word,phonetic,part_of_speech,definitions_zh,source,note
```

多个词性或释义使用 `|` 分隔。自定义词条覆盖同名 ECDICT 词条。

## 排除词条

在 `data/dictionary-blocklist.txt` 中每行添加一个规范化英文单词。blocklist 优先于所有来源。

## 审核更新 PR

1. 检查 ECDICT commit 与 SHA-256。
2. 检查新增、删除、修改词条统计。
3. 调查总词条数或体积异常。
4. 检查自定义覆盖和 blocklist 结果。
5. 确认测试、类型检查和生产构建通过。
6. 合并后重新运行 `pnpm zip` 发布扩展安装包。

## GitHub Actions 设置

仓库必须允许 GitHub Actions 创建 Pull Request。工作流每月检查一次，也可手动触发；它不会自动合并或发布。
````

- [ ] **Step 2: Link the runbook from README**

Under README’s developer section, add:

````markdown
### 更新离线词典

```bash
pnpm dict:update
```

词典来源、人工补词、质量检查和自动更新 PR 的完整流程见
[docs/dictionary-maintenance.md](./docs/dictionary-maintenance.md)。
````

- [ ] **Step 3: Update third-party provenance wording**

Update `THIRD_PARTY_NOTICES.md` to state that:

- the pinned commit and SHA-256 are recorded in `public/dictionary/manifest.json`;
- custom reviewed entries may override ECDICT;
- the extension remains offline at runtime.

Do not change or remove ECDICT’s MIT attribution.

- [ ] **Step 4: Verify documentation**

Run:

```bash
test -f docs/dictionary-maintenance.md
test -f public/dictionary/manifest.json
rg -n "dict:update|dictionary-maintenance" README.md docs/dictionary-maintenance.md
rg -n "manifest.json|SHA-256|offline" THIRD_PARTY_NOTICES.md
git diff --check
```

Expected: all files and references exist, and diff checking reports no errors.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md THIRD_PARTY_NOTICES.md docs/dictionary-maintenance.md
git commit -m "docs: add dictionary maintenance guide"
```

## Task 8: Final verification and handoff

**Files:**
- Verify: all dictionary pipeline, automation, documentation, and generated artifacts

- [ ] **Step 1: Run all automated checks**

Run:

```bash
pnpm dict:check
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

Expected: dictionary check, all Vitest tests, TypeScript, production build, and all Playwright journeys PASS.

- [ ] **Step 2: Verify reproducibility**

Run:

```bash
pnpm dict:build
git diff --exit-code -- public/dictionary
```

Expected: rebuilding from unchanged inputs produces no tracked dictionary diff.

- [ ] **Step 3: Verify package contents**

Run:

```bash
pnpm zip
test -s .output/contextual-vocabulary-0.1.0-chrome.zip
test -s .output/chrome-mv3/dictionary/index.json
test -s .output/chrome-mv3/dictionary/manifest.json
test -s .output/chrome-mv3/dictionary/LICENSE
shasum -a 256 .output/contextual-vocabulary-0.1.0-chrome.zip
```

Expected: installable ZIP and all dictionary provenance files exist; record the final SHA-256 in the handoff.

- [ ] **Step 4: Confirm Git scope**

Run:

```bash
git status --short --branch
git log --oneline --decorate -8
git status --ignored --short data/source
```

Expected: no tracked changes remain; ignored upstream CSV, metadata, and report files may appear only with `!!`.

## Acceptance checklist

- [ ] `pnpm dict:update` pins an ECDICT commit and records its SHA-256.
- [ ] `pnpm dict:build` works offline from existing ignored inputs.
- [ ] `pnpm dict:check` never modifies files.
- [ ] Custom entries override ECDICT deterministically.
- [ ] Blocklist removes entries from either source.
- [ ] Invalid inputs report file/row context and preserve the old output.
- [ ] Twenty-six deterministic shards, index, manifest, and license are generated.
- [ ] Entry-count and 10% change gates are enforced.
- [ ] A monthly/manual workflow creates or updates one review PR only when dictionary files change.
- [ ] Runtime extension behavior, permissions, and privacy remain unchanged.
- [ ] Maintenance docs explain local updates, custom additions, blocklist, PR review, and packaging.
