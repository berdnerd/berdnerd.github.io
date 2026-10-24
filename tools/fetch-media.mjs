// Builds the app's bird media from iNaturalist, in stages:
//   node tools/fetch-media.mjs candidates [ffmpeg]       -> tools/candidates.json + photo thumbnails to review
//   node tools/fetch-media.mjs call-candidates [ffmpeg]  -> tools/call-candidates.json + FLAC copies for BirdNET
//   (then tools/check-calls.py picks the best calls and where to cut them -> tools/call-picks.json)
//   node tools/fetch-media.mjs build [ffmpeg]            -> picked photos + calls, and app/data/birds.json
// Photo picks live in tools/picks.json: { "<bird id>": [coverObsId, obsId, ...] }.
// Safe to re-run: files already downloaded are skipped.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const APP = path.join(ROOT, 'app');
const TOOLS = path.join(ROOT, 'tools');
const RAW = path.join(TOOLS, 'raw');
const THUMBS = path.join(TOOLS, 'candidates');
const ANALYSIS = path.join(TOOLS, 'analysis');
const [stage = 'build', FFMPEG = 'ffmpeg'] = process.argv.slice(2);

const CANDIDATES_PER_BIRD = 12;
const CALL_CANDIDATES_PER_BIRD = 8;
const PHOTOS_PER_BIRD = 4;
const CLIP_SECONDS = 20;
// BirdNET only needs the first few minutes of a recording to find the best part.
const ANALYSIS_SECONDS = 300;
// Licences that allow reuse with attribution. No-derivatives excluded because media is resized and trimmed.
const LICENCES = 'cc0,cc-by,cc-by-nc,cc-by-sa,cc-by-nc-sa';
// Skip observations annotated as dead, juvenile, or evidence other than the bird itself (feathers, nests...).
const NOT_LIVE_ADULT = 'without_term_value_id=19,8,23,25,26,27,28,30,35';
const SYDNEY = 'lat=-33.87&lng=151.21';
const AUSTRALIA_PLACE_ID = 6744;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const exists = p => access(p).then(() => true, () => false);
const readJson = async (file, fallback) => JSON.parse(await readFile(file, 'utf8').catch(() => JSON.stringify(fallback)));

let lastCall = 0;
async function api(query) {
  // iNaturalist asks for no more than ~1 request per second.
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
  const res = await fetch(`https://api.inaturalist.org/v1/${query}`, {
    headers: { 'User-Agent': 'sydney-birds-quiz (personal learning app)' },
  });
  if (!res.ok) throw new Error(`${res.status} for ${query}`);
  return res.json();
}

async function download(url, dest) {
  if (await exists(dest)) return;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} downloading ${url}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
      await sleep(2000 * attempt);
    }
  }
}

async function resolveTaxon(sp) {
  const { results } = await api(`taxa?q=${encodeURIComponent(sp.sci)}&rank=species&per_page=5`);
  const exact = results.find(t => t.name === sp.sci) || results[0];
  if (!exact) throw new Error(`No taxon for ${sp.sci}`);
  if (exact.name !== sp.sci) console.warn(`  ! ${sp.sci} resolved to ${exact.name} (${exact.preferred_common_name})`);
  return exact.id;
}

function pickDistinctObservers(observations, count, mediaKey, exclude = []) {
  const picked = [], seen = new Set();
  for (const pass of [true, false]) {
    for (const o of observations) {
      if (picked.length >= count) return picked;
      const media = o[mediaKey]?.[0];
      if (!media || exclude.includes(o.id) || picked.some(p => p.media.id === media.id)) continue;
      if (pass && seen.has(o.user.id)) continue;
      seen.add(o.user.id);
      picked.push({ obs: o, media });
    }
  }
  return picked;
}

const mediaEntry = (src, obs, media) =>
  ({ src, obsId: obs.id, credit: media.attribution, licence: media.license_code, url: obs.uri });

// ---------- Stage 1: photo candidates ----------
async function photoCandidates(sp, taxonId) {
  const { results } = await api(
    `observations?taxon_id=${taxonId}&quality_grade=research&photos=true&photo_license=${LICENCES}` +
    `&${NOT_LIVE_ADULT}&${SYDNEY}&radius=150&order_by=votes&per_page=80`);
  const out = [];
  for (const { obs, media } of pickDistinctObservers(results, CANDIDATES_PER_BIRD, 'photos')) {
    const large = media.url.replace('/square.', '/large.');
    await download(media.url.replace('/square.', '/small.'), path.join(THUMBS, `${sp.id}-${obs.id}.jpg`));
    out.push({ ...mediaEntry(null, obs, media), large });
  }
  return out;
}

// ---------- Stage 2: picked photos and calls ----------
async function pickedPhotos(sp, candidates, picks) {
  const chosen = picks?.length
    ? picks.map(id => candidates.find(c => c.obsId === id)).filter(Boolean)
    : candidates.slice(0, PHOTOS_PER_BIRD);
  const out = [];
  for (const c of chosen) {
    const raw = path.join(RAW, `${sp.id}-p${c.obsId}.jpg`);
    const file = `media/photos/${sp.id}-${c.obsId}.jpg`;
    await download(c.large, raw);
    if (!(await exists(path.join(APP, file)))) {
      await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw,
        '-vf', "scale='min(900,iw)':-2", '-q:v', '4', path.join(APP, file)]);
    }
    const { large, ...entry } = c;
    out.push({ ...entry, src: file });
  }
  return out;
}

async function callCandidates(sp, taxonId) {
  const base = `observations?taxon_id=${taxonId}&quality_grade=research&sounds=true&sound_license=${LICENCES}&order_by=votes&per_page=40`;
  // Prefer recordings made around Sydney; top up from the rest of Australia.
  let { results } = await api(`${base}&${SYDNEY}&radius=200`);
  results = results.filter(o => o.sounds?.[0]?.file_url);
  if (results.length < CALL_CANDIDATES_PER_BIRD) {
    const more = (await api(`${base}&place_id=${AUSTRALIA_PLACE_ID}`)).results.filter(o => o.sounds?.[0]?.file_url);
    results = [...results, ...more.filter(m => !results.some(r => r.id === m.id))];
  }
  const out = [];
  for (const { obs, media } of pickDistinctObservers(results, CALL_CANDIDATES_PER_BIRD, 'sounds')) {
    const ext = path.extname(new URL(media.file_url).pathname) || '.audio';
    const raw = path.join(RAW, `${sp.id}-c${obs.id}${ext}`);
    const analysis = path.join(ANALYSIS, `${sp.id}-${obs.id}.flac`);
    try {
      await download(media.file_url, raw);
      if (!(await exists(analysis))) {
        await run(FFMPEG, ['-y', '-loglevel', 'error', '-i', raw, '-t', String(ANALYSIS_SECONDS), '-ac', '1', '-ar', '48000', analysis]);
      }
      out.push({ ...mediaEntry(null, obs, media), raw: path.relative(TOOLS, raw), analysis: path.relative(TOOLS, analysis) });
    } catch (e) {
      console.warn(`  ! skipped call for ${sp.name}: ${e.message}`);
    }
  }
  return out;
}

async function pickedCalls(sp, candidates, picks = []) {
  const out = [];
  for (const { obsId, start } of picks) {
    const c = candidates.find(c => c.obsId === obsId);
    if (!c) continue;
    const file = `media/calls/${sp.id}-${obsId}.mp3`;
    // Clips are always re-cut, because the chosen start point can change between runs.
    await run(FFMPEG, ['-y', '-loglevel', 'error', '-ss', String(start), '-i', path.join(TOOLS, c.raw),
      '-t', String(CLIP_SECONDS), '-ac', '1',
      '-af', `afade=t=in:d=0.3,loudnorm=I=-16:TP=-1.5,afade=t=out:st=${CLIP_SECONDS - 2}:d=2`,
      '-ar', '44100', '-b:a', '64k', path.join(APP, file)]);
    const { raw, analysis, ...entry } = c;
    out.push({ ...entry, src: file });
  }
  return out;
}

// ---------- Main ----------
const species = await readJson(path.join(TOOLS, 'species.json'), []);
const candidatesFile = path.join(TOOLS, 'candidates.json');
const callCandidatesFile = path.join(TOOLS, 'call-candidates.json');
for (const dir of [RAW, THUMBS, ANALYSIS, path.join(APP, 'media', 'photos'), path.join(APP, 'media', 'calls'), path.join(APP, 'data')]) {
  await mkdir(dir, { recursive: true });
}

if (stage === 'candidates') {
  const all = {};
  for (const sp of species) {
    const taxonId = await resolveTaxon(sp);
    all[sp.id] = { taxonId, photos: await photoCandidates(sp, taxonId) };
    console.log(`${sp.name}: ${all[sp.id].photos.length} candidates`);
  }
  await writeFile(candidatesFile, JSON.stringify(all, null, 1));
} else if (stage === 'call-candidates') {
  const photoCandidatesData = await readJson(candidatesFile, {});
  const all = {};
  for (const sp of species) {
    const taxonId = photoCandidatesData[sp.id]?.taxonId ?? await resolveTaxon(sp);
    all[sp.id] = await callCandidates(sp, taxonId);
    console.log(`${sp.name}: ${all[sp.id].length} call candidates`);
  }
  await writeFile(callCandidatesFile, JSON.stringify(all, null, 1));
} else {
  const candidates = await readJson(candidatesFile, null);
  const callCandidatesData = await readJson(callCandidatesFile, null);
  if (!candidates || !callCandidatesData) throw new Error('Run the candidates and call-candidates stages first.');
  const picks = await readJson(path.join(TOOLS, 'picks.json'), {});
  const callPicks = await readJson(path.join(TOOLS, 'call-picks.json'), {});
  const birds = [];
  for (const sp of species) {
    const { taxonId, photos: pool } = candidates[sp.id];
    const photos = await pickedPhotos(sp, pool, picks[sp.id]);
    const calls = await pickedCalls(sp, callCandidatesData[sp.id], callPicks[sp.id]);
    console.log(`${sp.name}: ${photos.length} photos, ${calls.length} calls`);
    birds.push({ ...sp, taxonId, photos, calls });
  }
  await writeFile(path.join(APP, 'data', 'birds.json'), JSON.stringify(birds, null, 1));
  console.log(`Wrote ${birds.length} birds.`);
}
