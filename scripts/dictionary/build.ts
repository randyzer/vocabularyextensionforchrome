import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadDictionaryInputs,
  publishDictionaryArtifacts,
  readCommittedDictionary,
} from './files';
import {
  buildDictionaryArtifacts,
  mergeDictionaryEntries,
  parseBlocklist,
  parseCustomWords,
  parseEcdict,
} from './pipeline';

const projectRoot = resolve(import.meta.dirname, '../..');
const outputDirectory = resolve(projectRoot, 'public/dictionary');

export async function buildDictionary(): Promise<void> {
  const inputs = await loadDictionaryInputs({
    ecdictCsv: resolve(projectRoot, 'data/source/ecdict.csv'),
    sourceMetadata: resolve(
      projectRoot,
      'data/source/ecdict-source.json',
    ),
    customWords: resolve(projectRoot, 'data/custom-words.csv'),
    blocklist: resolve(projectRoot, 'data/dictionary-blocklist.txt'),
  });
  const upstream = parseEcdict(inputs.ecdictCsv);
  const custom = parseCustomWords(inputs.customWordsCsv);
  const blocklist = parseBlocklist(inputs.blocklistText);
  const merged = mergeDictionaryEntries(upstream, custom, blocklist);
  const previous = await readCommittedDictionary(outputDirectory);
  const artifacts = buildDictionaryArtifacts(merged, {
    sourceMetadata: inputs.sourceMetadata,
    upstreamEntryCount: upstream.size,
    customEntryCount: custom.entries.size,
    blocklistCount: blocklist.size,
    overriddenWords: [...custom.entries.keys()].filter(
      (word) => upstream.has(word),
    ),
    blockedWords: [...blocklist].filter(
      (word) => upstream.has(word) || custom.entries.has(word),
    ),
  });

  await publishDictionaryArtifacts(artifacts, {
    outputDirectory,
    licensePath: resolve(outputDirectory, 'LICENSE'),
    quality: {
      minimumEntries: 50_000,
      previousEntryCount: previous.entryCount,
      maximumChangeRatio: 0.1,
    },
  });

  console.log(
    `Built 26 dictionary shards with ${artifacts.index.entryCount} entries`,
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : undefined;

if (import.meta.url === invokedPath) {
  await buildDictionary();
}
