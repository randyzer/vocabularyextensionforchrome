import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildDictionaryArtifacts,
  type DictionaryArtifacts,
} from '../../scripts/dictionary/pipeline';
import { publishDictionaryArtifacts } from '../../scripts/dictionary/files';

let temporaryRoot: string;
let outputDirectory: string;
let licensePath: string;
let validArtifacts: DictionaryArtifacts;

beforeEach(async () => {
  temporaryRoot = await mkdtemp(join(tmpdir(), 'dictionary-files-'));
  outputDirectory = join(temporaryRoot, 'dictionary');
  licensePath = join(temporaryRoot, 'LICENSE');
  await mkdir(outputDirectory);
  await writeFile(licensePath, 'Test license\n');

  validArtifacts = buildDictionaryArtifacts(new Map([
    ['ability', {
      lemma: 'ability',
      definitionsZh: ['能力'],
      source: 'ecdict',
    }],
  ]), {
    sourceMetadata: {
      source: 'ECDICT',
      commit: '0123456789abcdef',
      committedAt: '2026-07-01T00:00:00Z',
      url: 'https://example.test/ecdict.csv',
      sha256: 'a'.repeat(64),
    },
    upstreamEntryCount: 1,
    customEntryCount: 0,
    blocklistCount: 0,
    overriddenWords: [],
    blockedWords: [],
  });
});

afterEach(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

describe('dictionary file publication', () => {
  it('replaces the output only after every artifact validates', async () => {
    await writeFile(join(outputDirectory, 'sentinel.txt'), 'old');

    await publishDictionaryArtifacts(validArtifacts, {
      outputDirectory,
      licensePath,
      quality: {
        minimumEntries: 1,
        maximumChangeRatio: 0.1,
      },
    });

    await expect(readFile(join(outputDirectory, 'index.json'), 'utf8'))
      .resolves.toContain('"entryCount"');
    await expect(readFile(join(outputDirectory, 'LICENSE'), 'utf8'))
      .resolves.toBe('Test license\n');
    await expect(access(join(outputDirectory, 'sentinel.txt')))
      .rejects.toThrow();
  });

  it('preserves the old output when validation fails', async () => {
    await writeFile(join(outputDirectory, 'sentinel.txt'), 'old');

    await expect(publishDictionaryArtifacts(validArtifacts, {
      outputDirectory,
      licensePath,
      quality: {
        minimumEntries: 50_000,
        maximumChangeRatio: 0.1,
      },
    })).rejects.toThrow('DICTIONARY_TOO_SMALL');

    await expect(readFile(join(outputDirectory, 'sentinel.txt'), 'utf8'))
      .resolves.toBe('old');
  });
});
