import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

const sourcePath = new URL('../data/source/ecdict.csv', import.meta.url);
const outputDirectory = new URL('../public/dictionary/', import.meta.url);
const csv = await readFile(sourcePath, 'utf8');
const rows = parse(csv, {
  columns: true,
  bom: true,
  skip_empty_lines: true,
});
const shards = new Map();
let includedEntries = 0;

for (const row of rows) {
  const word = String(row.word ?? '')
    .trim()
    .toLocaleLowerCase('en')
    .replaceAll('’', "'");
  const definitionsZh = String(row.translation ?? '')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 6);
  const bncRank = Number(row.bnc) || 0;
  const contemporaryRank = Number(row.frq) || 0;
  const isCurriculumWord = String(row.tag ?? '').trim().length > 0;
  const isOxfordCore = String(row.oxford ?? '').trim() === '1';
  const isFrequent = (
    bncRank > 0 && bncRank <= 50_000
  ) || (
    contemporaryRank > 0 && contemporaryRank <= 50_000
  );

  if (
    !/^[a-z][a-z'-]*$/.test(word)
    || definitionsZh.length === 0
    || (!isCurriculumWord && !isOxfordCore && !isFrequent)
  ) {
    continue;
  }

  const shardKey = word.charAt(0);
  const partOfSpeech = [
    ...String(row.pos ?? '').matchAll(/([a-z]+):/gi),
  ].map((match) => match[1].toLocaleLowerCase('en'));
  const ranks = [bncRank, contemporaryRank].filter((rank) => rank > 0);
  const entry = {
    lemma: word,
    phonetic: String(row.phonetic ?? '').trim() || undefined,
    partOfSpeech: [...new Set(partOfSpeech)],
    definitionsZh,
    frequencyRank: ranks.length > 0 ? Math.min(...ranks) : undefined,
  };
  const shard = shards.get(shardKey) ?? {};
  shard[word] = entry;
  shards.set(shardKey, shard);
  includedEntries += 1;
}

await mkdir(outputDirectory, { recursive: true });
const index = {};

for (const [shardKey, entries] of [...shards.entries()].sort()) {
  const filename = `${shardKey}.json`;
  await writeFile(
    new URL(filename, outputDirectory),
    JSON.stringify(entries),
  );
  index[shardKey] = filename;
}

await writeFile(
  new URL('index.json', outputDirectory),
  JSON.stringify({
    version: 1,
    source: 'ECDICT',
    entryCount: includedEntries,
    shards: index,
  }, null, 2),
);

console.log(
  `Built ${Object.keys(index).length} dictionary shards with ${includedEntries} entries`,
);
