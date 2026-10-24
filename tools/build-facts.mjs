// Writes app/data/facts.json from tools/facts.json (hand-checked facts) plus the Wikipedia
// source links recorded when the facts were drafted. Edit tools/facts.json, then run:
//   node tools/build-facts.mjs
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const TOOLS = import.meta.dirname;
const facts = JSON.parse(await readFile(path.join(TOOLS, 'facts.json'), 'utf8'));
const species = JSON.parse(await readFile(path.join(TOOLS, 'species.json'), 'utf8'));
const out = { _about: 'Facts for the knowledge quiz, checked by hand against the English Wikipedia article linked for each bird (text CC BY-SA 4.0). Edit tools/facts.json, not this file.' };
for (const sp of species) {
  const f = facts[sp.id];
  if (!f) { console.warn(`no facts for ${sp.id}`); continue; }
  out[sp.id] = { diet: f.diet || null, names: f.names || [], status: sp.status, fact: f.fact, source: f.source };
}
await writeFile(path.join(TOOLS, '..', 'app', 'data', 'facts.json'), JSON.stringify(out, null, 1));
console.log(`Wrote facts for ${Object.keys(out).length - 1} birds`);
