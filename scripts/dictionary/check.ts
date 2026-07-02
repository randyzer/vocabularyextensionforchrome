import { resolve } from 'node:path';
import { readCommittedDictionary } from './files';

const outputDirectory = resolve(
  import.meta.dirname,
  '../../public/dictionary',
);
const dictionary = await readCommittedDictionary(outputDirectory);

if (dictionary.entryCount < 50_000) {
  throw new Error(
    `DICTIONARY_TOO_SMALL:minimum=50000:actual=${dictionary.entryCount}`,
  );
}

console.log(
  `Validated 26 dictionary shards with ${dictionary.entryCount} entries`,
);
