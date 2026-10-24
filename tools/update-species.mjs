// Copies the hand-written fields of tools/species.json (tips, families, lookalikes, status…)
// into app/data/birds.json without re-downloading any media. Run after editing species.json:
//   node tools/update-species.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const TOOLS = import.meta.dirname;
const file = path.join(TOOLS, '..', 'app', 'data', 'birds.json');
const species = JSON.parse(await readFile(path.join(TOOLS, 'species.json'), 'utf8'));
const birds = JSON.parse(await readFile(file, 'utf8'));
const out = species.map(sp => {
  const b = birds.find(x => x.id === sp.id);
  if (!b) throw new Error(`No media yet for ${sp.id}; run fetch-media.mjs build`);
  return { ...sp, taxonId: b.taxonId, photos: b.photos, calls: b.calls };
});
await writeFile(file, JSON.stringify(out, null, 1));
console.log(`Updated ${out.length} birds in app/data/birds.json`);
