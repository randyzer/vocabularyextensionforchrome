import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  validateDictionaryArtifacts,
  type DictionaryArtifacts,
  type DictionarySourceMetadata,
} from './pipeline';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseSourceMetadata(value: string): DictionarySourceMetadata {
  const parsed = JSON.parse(value) as Partial<DictionarySourceMetadata>;
  if (
    parsed.source !== 'ECDICT'
    || typeof parsed.commit !== 'string'
    || typeof parsed.committedAt !== 'string'
    || typeof parsed.url !== 'string'
    || typeof parsed.sha256 !== 'string'
  ) {
    throw new Error('DICTIONARY_INVALID_SOURCE_METADATA');
  }
  return parsed as DictionarySourceMetadata;
}

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
}> {
  const [ecdictCsv, metadataJson, customWordsCsv, blocklistText] = (
    await Promise.all([
      readFile(paths.ecdictCsv, 'utf8'),
      readFile(paths.sourceMetadata, 'utf8'),
      readFile(paths.customWords, 'utf8'),
      readFile(paths.blocklist, 'utf8'),
    ])
  );

  return {
    ecdictCsv,
    sourceMetadata: parseSourceMetadata(metadataJson),
    customWordsCsv,
    blocklistText,
  };
}

async function writeArtifacts(
  directory: string,
  artifacts: DictionaryArtifacts,
  licensePath: string,
): Promise<void> {
  await Promise.all(
    Object.entries(artifacts.shards).map(async ([letter, shard]) => {
      await writeFile(join(directory, `${letter}.json`), JSON.stringify(shard));
    }),
  );
  await writeFile(
    join(directory, 'index.json'),
    `${JSON.stringify(artifacts.index, null, 2)}\n`,
  );
  await writeFile(
    join(directory, 'manifest.json'),
    `${JSON.stringify(artifacts.manifest, null, 2)}\n`,
  );
  await copyFile(licensePath, join(directory, 'LICENSE'));
}

async function readWrittenArtifacts(
  directory: string,
  report: DictionaryArtifacts['report'],
): Promise<DictionaryArtifacts> {
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
  const shardPairs = await Promise.all(letters.map(async (letter) => {
    const value = JSON.parse(
      await readFile(join(directory, `${letter}.json`), 'utf8'),
    ) as DictionaryArtifacts['shards'][string];
    return [letter, value] as const;
  }));
  const index = JSON.parse(
    await readFile(join(directory, 'index.json'), 'utf8'),
  ) as DictionaryArtifacts['index'];
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  ) as DictionaryArtifacts['manifest'];

  return {
    shards: Object.fromEntries(shardPairs),
    index,
    manifest,
    report,
  };
}

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
): Promise<void> {
  validateDictionaryArtifacts(artifacts, options.quality);

  const parent = dirname(options.outputDirectory);
  const name = basename(options.outputDirectory);
  await mkdir(parent, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(parent, `.${name}-tmp-`));
  const backupDirectory = join(
    parent,
    `.${name}-backup-${process.pid}-${randomUUID()}`,
  );
  let hasBackup = false;

  try {
    await writeArtifacts(
      temporaryDirectory,
      artifacts,
      options.licensePath,
    );
    const written = await readWrittenArtifacts(
      temporaryDirectory,
      artifacts.report,
    );
    validateDictionaryArtifacts(written, options.quality);

    if (await pathExists(options.outputDirectory)) {
      await rename(options.outputDirectory, backupDirectory);
      hasBackup = true;
    }

    try {
      await rename(temporaryDirectory, options.outputDirectory);
    } catch (error) {
      if (hasBackup) {
        await rename(backupDirectory, options.outputDirectory);
        hasBackup = false;
      }
      throw error;
    }

    if (hasBackup) {
      await rm(backupDirectory, { recursive: true, force: true });
      hasBackup = false;
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
    if (hasBackup && !await pathExists(options.outputDirectory)) {
      await rename(backupDirectory, options.outputDirectory);
      hasBackup = false;
    }
  }
}

export async function readCommittedDictionary(
  outputDirectory: string,
): Promise<{
  entryCount: number;
  serializedEntries: Map<string, string>;
}> {
  const index = JSON.parse(
    await readFile(join(outputDirectory, 'index.json'), 'utf8'),
  ) as DictionaryArtifacts['index'];
  const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');

  if (
    index.version !== 1
    || index.source !== 'ECDICT'
    || Object.keys(index.shards).length !== letters.length
  ) {
    throw new Error('DICTIONARY_INVALID_COMMITTED_INDEX');
  }

  const serializedEntries = new Map<string, string>();
  for (const letter of letters) {
    if (index.shards[letter] !== `${letter}.json`) {
      throw new Error(`DICTIONARY_INVALID_COMMITTED_SHARD:${letter}`);
    }

    const shard = JSON.parse(
      await readFile(join(outputDirectory, `${letter}.json`), 'utf8'),
    ) as DictionaryArtifacts['shards'][string];
    for (const [word, entry] of Object.entries(shard)) {
      if (
        word.charAt(0) !== letter
        || entry.lemma !== word
        || !Array.isArray(entry.definitionsZh)
        || entry.definitionsZh.length === 0
      ) {
        throw new Error(`DICTIONARY_INVALID_COMMITTED_ENTRY:${word}`);
      }
      if (serializedEntries.has(word)) {
        throw new Error(`DICTIONARY_DUPLICATE_COMMITTED_ENTRY:${word}`);
      }
      serializedEntries.set(word, JSON.stringify(entry));
    }
  }

  if (serializedEntries.size !== index.entryCount) {
    throw new Error(
      `DICTIONARY_COMMITTED_COUNT_MISMATCH:index=${index.entryCount}:actual=${serializedEntries.size}`,
    );
  }

  const manifestPath = join(outputDirectory, 'manifest.json');
  if (await pathExists(manifestPath)) {
    const manifest = JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as DictionaryArtifacts['manifest'];
    if (
      manifest.version !== 1
      || manifest.source !== 'ECDICT'
      || manifest.entryCount !== index.entryCount
    ) {
      throw new Error('DICTIONARY_INVALID_COMMITTED_MANIFEST');
    }
  }

  return {
    entryCount: serializedEntries.size,
    serializedEntries,
  };
}
