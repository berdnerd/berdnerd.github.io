// Builds app/data/seasonality.json from Atlas of Living Australia occurrence records:
// for each bird, records per month within 100 km of Sydney, divided by all-bird records
// per month (to cancel out observer effort), as a percentage of the bird's own yearly mean.
//   node tools/fetch-seasonality.mjs
// Re-run about once a year. Manual classifications live in tools/seasonality-overrides.json.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TOOLS = import.meta.dirname;
const APP = path.join(TOOLS, '..', 'app');
const SYDNEY = 'lat=-33.87&lon=151.21&radius=100';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = { headers: { 'User-Agent': 'berdnerd (personal bird-learning app)' } };

async function monthCounts(q) {
  const url = `https://biocache-ws.ala.org.au/ws/occurrences/search?q=${encodeURIComponent(q)}&${SYDNEY}&facets=month&flimit=13&pageSize=0`;
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`${res.status} for ${q}`);
  const data = await res.json();
  const facet = data.facetResults?.find(f => f.fieldName === 'month')?.fieldResult || [];
  const counts = MONTHS.map(m => facet.find(f => f.label === m)?.count || 0);
  return { total: data.totalRecords, counts };
}

async function lsid(sci) {
  const res = await fetch(`https://api.ala.org.au/namematching/api/search?q=${encodeURIComponent(sci)}`, UA);
  const data = await res.json();
  return data.success ? data.taxonConceptID : null;
}

const species = JSON.parse(await readFile(path.join(TOOLS, 'species.json'), 'utf8'));
const overrides = JSON.parse(await readFile(path.join(TOOLS, 'seasonality-overrides.json'), 'utf8').catch(() => '{}'));

console.log('All birds baseline…');
const base = await monthCounts('class:Aves');
await sleep(1000);

const out = { _about: {
  source: 'Atlas of Living Australia occurrence records within 100 km of Sydney, normalised against all bird records per month',
  accessed: new Date().toISOString().slice(0, 10),
  providers: 'eBird Australia, NSW BioNet Atlas, iNaturalist Australia, BirdLife Australia and others',
  index: 'percentage of the species’ own 12-month mean reporting rate, January first',
}, birds: {} };

for (const sp of species) {
  const id = await lsid(sp.sci);
  await sleep(600);
  const { total, counts } = await monthCounts(id ? `lsid:${id}` : sp.sci);
  const rate = counts.map((c, i) => base.counts[i] ? c / base.counts[i] : 0);
  const mean = rate.reduce((a, b) => a + b, 0) / 12;
  const index = rate.map(r => Math.round(100 * r / mean));
  const ratio = Math.max(...index) / Math.max(1, Math.min(...index));
  const peak = index.indexOf(Math.max(...index));
  const season = peak >= 11 || peak <= 1 ? 'summer' : peak <= 4 ? 'autumn' : peak <= 7 ? 'winter' : 'spring';
  const auto = ratio >= 3 ? `strong ${season}` : ratio >= 1.5 ? season : 'resident';
  out.birds[sp.id] = { records: total, index, ratio: Math.round(ratio * 10) / 10, auto, ...(overrides[sp.id] || {}) };
  console.log(`${sp.name.padEnd(30)} ${String(total).padStart(7)}  ratio ${out.birds[sp.id].ratio}  ${out.birds[sp.id].label || auto}`);
  await sleep(600);
}
await writeFile(path.join(APP, 'data', 'seasonality.json'), JSON.stringify(out, null, 1));
console.log('Wrote app/data/seasonality.json');
