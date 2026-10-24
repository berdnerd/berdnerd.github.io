// Adds a photo from an iNaturalist observation to a bird, optionally replacing one of its current photos:
//   node tools/add-photo.mjs <bird id> <observation id> [replace observation id]
// Downloads the large photo, resizes it like fetch-media.mjs does, records the pick in tools/picks.json
// and the candidate in tools/candidates.json, and updates app/data/birds.json. Then run update-species.mjs
// if the photo needs a plumage label from photo-labels.json.
import { readFile, writeFile, mkdir, access, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const TOOLS = import.meta.dirname;
const APP = path.join(TOOLS, '..', 'app');
const RAW = path.join(TOOLS, 'raw');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const [birdId, obsIdText, replaceText] = process.argv.slice(2);
if (!birdId || !obsIdText) throw new Error('usage: node tools/add-photo.mjs <bird id> <observation id> [replace observation id]');
const obsId = Number(obsIdText), replaceId = replaceText ? Number(replaceText) : null;

const readJson = async f => JSON.parse(await readFile(f, 'utf8'));
const exists = p => access(p).then(() => true, () => false);

const res = await fetch(`https://api.inaturalist.org/v1/observations/${obsId}`, { headers: { 'User-Agent': 'berdnerd (personal learning app)' } });
const obs = (await res.json()).results?.[0];
if (!obs?.photos?.[0]) throw new Error(`Observation ${obsId} has no photo`);
const media = obs.photos[0];
if (!/^(cc0|cc-by|cc-by-nc|cc-by-sa|cc-by-nc-sa)$/.test(media.license_code || '')) throw new Error(`Licence ${media.license_code} not allowed`);

await mkdir(RAW, { recursive: true });
const raw = path.join(RAW, `${birdId}-p${obsId}.jpg`);
if (!(await exists(raw))) {
  const img = await fetch(media.url.replace('/square.', '/large.'));
  await writeFile(raw, Buffer.from(await img.arrayBuffer()));
}
const file = `media/photos/${birdId}-${obsId}.jpg`;
await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-vf', "scale='min(900,iw)':-2", '-q:v', '4', path.join(APP, file)]);

const entry = { src: file, obsId, credit: media.attribution, licence: media.license_code, url: obs.uri };

// candidates.json so a future `fetch-media.mjs build` knows the photo
const candidates = await readJson(path.join(TOOLS, 'candidates.json'));
const pool = candidates[birdId].photos;
if (!pool.some(c => c.obsId === obsId)) pool.push({ ...entry, src: null, large: media.url.replace('/square.', '/large.') });
await writeFile(path.join(TOOLS, 'candidates.json'), JSON.stringify(candidates, null, 1));

// picks.json
const picks = await readJson(path.join(TOOLS, 'picks.json'));
let list = picks[birdId] || [];
if (replaceId) list = list.map(id => (id === replaceId ? obsId : id));
if (!list.includes(obsId)) list.push(obsId);
picks[birdId] = list;
await writeFile(path.join(TOOLS, 'picks.json'), JSON.stringify(picks, null, 1));

// birds.json
const birdsFile = path.join(APP, 'data', 'birds.json');
const birds = await readJson(birdsFile);
const bird = birds.find(b => b.id === birdId);
if (replaceId) {
  const old = bird.photos.find(p => p.obsId === replaceId);
  bird.photos = bird.photos.map(p => (p.obsId === replaceId ? entry : p));
  if (old && await exists(path.join(APP, old.src))) await unlink(path.join(APP, old.src));
}
if (!bird.photos.some(p => p.obsId === obsId)) bird.photos.push(entry);
await writeFile(birdsFile, JSON.stringify(birds, null, 1));
console.log(`${bird.name}: added ${file} (${media.attribution})${replaceId ? `, replacing ${replaceId}` : ''}`);
