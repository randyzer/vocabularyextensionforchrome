import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDictionaryArtifacts,
  compareDictionaryIndexes,
  mergeDictionaryEntries,
  parseBlocklist,
  parseCustomWords,
  parseEcdict,
  renderDictionaryReport,
  validateDictionaryArtifacts,
  type DictionaryBuildEntry,
  type DictionarySourceMetadata,
} from '../../scripts/dictionary/pipeline';

const fixturePath = resolve(
  process.cwd(),
  'tests/fixtures/dictionary/ecdict.csv',
);
const customFixturePath = resolve(
  process.cwd(),
  'tests/fixtures/dictionary/custom-words.csv',
);
const blocklistFixturePath = resolve(
  process.cwd(),
  'tests/fixtures/dictionary/blocklist.txt',
);
const ecdictFixture = readFileSync(fixturePath, 'utf8');
const customFixture = readFileSync(customFixturePath, 'utf8');
const blocklistFixture = readFileSync(blocklistFixturePath, 'utf8');
const parsedEcdictFixture = parseEcdict(ecdictFixture);
const parsedCustomFixture = parseCustomWords(customFixture);
const parsedBlocklistFixture = parseBlocklist(blocklistFixture);
const mergedFixture = mergeDictionaryEntries(
  parsedEcdictFixture,
  parsedCustomFixture,
  parsedBlocklistFixture,
);
const sourceMetadata: DictionarySourceMetadata = {
  source: 'ECDICT',
  commit: '0123456789abcdef',
  committedAt: '2026-07-01T00:00:00Z',
  url: 'https://raw.githubusercontent.com/skywind3000/ECDICT/0123456789abcdef/ecdict.mini.csv',
  sha256: 'a'.repeat(64),
};
const artifactOptions = {
  sourceMetadata,
  upstreamEntryCount: parsedEcdictFixture.size,
  customEntryCount: parsedCustomFixture.entries.size,
  blocklistCount: parsedBlocklistFixture.size,
  overriddenWords: ['ability'],
  blockedWords: ['running'],
};

describe('dictionary pipeline', () => {
  it('parses eligible ECDICT rows into runtime entries', () => {
    expect(parseEcdict(ecdictFixture)).toEqual<
      Map<string, DictionaryBuildEntry>
    >(
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

  it('lets custom words override ECDICT and applies the blocklist', () => {
    const merged = mergeDictionaryEntries(
      parseEcdict(ecdictFixture),
      parseCustomWords(customFixture),
      parseBlocklist(blocklistFixture),
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

  it('requires Chinese definitions for custom words', () => {
    const csv = [
      'word,phonetic,part_of_speech,definitions_zh,source,note',
      'ability,,n,ability,maintainer,missing Chinese',
    ].join('\n');

    expect(() => parseCustomWords(csv))
      .toThrow('CUSTOM_DEFINITION_NOT_CHINESE:ability:row=2');
  });

  it('reports invalid blocklist rows', () => {
    expect(() => parseBlocklist('valid\nbad123\n'))
      .toThrow('BLOCKLIST_INVALID_WORD:bad123:row=2');
  });

  it('generates stable shards, index, manifest, and report', () => {
    const artifacts = buildDictionaryArtifacts(mergedFixture, artifactOptions);
    const repeated = buildDictionaryArtifacts(mergedFixture, artifactOptions);

    expect(artifacts).toEqual(repeated);
    expect(artifacts.index.entryCount).toBe(2);
    expect(artifacts.manifest.ecdictCommit).toBe('0123456789abcdef');
    expect(Object.keys(artifacts.shards)).toEqual(
      'abcdefghijklmnopqrstuvwxyz'.split(''),
    );
  });

  it('rejects entry-count changes beyond ten percent', () => {
    const artifacts = buildDictionaryArtifacts(
      mergedFixture,
      artifactOptions,
    );

    expect(() => validateDictionaryArtifacts(artifacts, {
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

  it('renders a reviewable dictionary diff summary', () => {
    expect(renderDictionaryReport({
      sourceMetadata,
      previousEntryCount: 100,
      nextEntryCount: 104,
      added: ['new-one', 'new-two'],
      removed: ['old-one'],
      changed: ['a', 'b', 'c'],
    })).toContain('Added: 2 · Removed: 1 · Changed: 3');
  });
});
