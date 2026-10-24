// Builds numbered review sheets of photo candidates (4 birds per sheet, 12 numbered thumbs per bird).
// Usage: node tools/candidate-sheets.mjs <ffmpeg> <out-dir>
import { readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);
const TOOLS = import.meta.dirname;
const [FFMPEG, OUT] = process.argv.slice(2);
const FONT = 'C\\:/Windows/Fonts/arialbd.ttf';
const candidates = JSON.parse(await readFile(path.join(TOOLS, 'candidates.json'), 'utf8'));
const species = JSON.parse(await readFile(path.join(TOOLS, 'species.json'), 'utf8'));
await mkdir(OUT, { recursive: true });

const label = (text, size, x, y) =>
  `drawtext=fontfile='${FONT}':text='${text.replace(/'/g, '')}':fontsize=${size}:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=4:x=${x}:y=${y}`;

const rows = [];
for (const sp of species) {
  const photos = candidates[sp.id].photos;
  const inputs = [], filters = [];
  for (let i = 0; i < 12; i++) {
    const p = photos[i] || photos[0];
    inputs.push('-i', path.join(TOOLS, 'candidates', `${sp.id}-${p.obsId}.jpg`));
    const tag = photos[i] ? String(i + 1) : '-';
    filters.push(`[${i}:v]scale=200:150:force_original_aspect_ratio=increase,crop=200:150,${label(tag, 22, 4, 4)}[t${i}]`);
  }
  filters.push(`${Array.from({ length: 12 }, (_, i) => `[t${i}]`).join('')}xstack=inputs=12:grid=6x2,` +
    `pad=iw:ih+30:0:30:color=0x2f5d46,${label(sp.name, 22, 8, 2)}`);
  const out = path.join(OUT, `cand-${sp.id}.jpg`);
  await run(FFMPEG, ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filters.join(';'), out]);
  rows.push(out);
}
for (let s = 0, n = 0; s < rows.length; s += 4, n++) {
  const chunk = rows.slice(s, s + 4);
  const args = chunk.flatMap(r => ['-i', r]);
  const filter = chunk.length > 1 ? `vstack=inputs=${chunk.length}` : 'null';
  await run(FFMPEG, ['-y', '-loglevel', 'error', ...args, '-filter_complex', filter, path.join(OUT, `cands-${n}.jpg`)]);
}
console.log(`Built ${Math.ceil(rows.length / 4)} sheets in ${OUT}`);
