'use strict';

const $main = document.getElementById('main');
const audio = new Audio();
audio.setAttribute('playsinline', '');

let BIRDS = [];
const byId = id => BIRDS.find(b => b.id === id);

// ---------- Storage (per device) ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};
const settings = Object.assign(
  { choices: 4, lookalikes: true, roundLength: 10, callAnswer: 'photos' },
  store.get('settings', {}));
const stats = store.get('stats', {});
const saveSettings = () => store.set('settings', settings);
const saveStats = () => store.set('stats', stats);

function record(id, correct) {
  const s = stats[id] || (stats[id] = { right: 0, wrong: 0, streak: 0 });
  if (correct) { s.right++; s.streak++; } else { s.wrong++; s.streak = 0; }
  saveStats();
}
function status(id) {
  const s = stats[id];
  if (!s || s.right + s.wrong === 0) return 'new';
  return s.streak >= 3 ? 'mastered' : 'learning';
}

// ---------- Helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const licenceLabel = code => (code || '').toUpperCase().replace(/^CC-/, 'CC ') || 'licence unknown';
function shortCredit(item) {
  const credit = item.credit || '';
  // Public-domain items read "no rights reserved, uploaded by Name": show the name instead.
  const uploader = /uploaded by (.+)$/i.exec(credit)?.[1];
  if (/^no rights reserved/i.test(credit)) return esc(uploader || 'Public domain');
  return esc(credit.replace(/^\(c\)\s*/, '© ').replace(/,? (some|all) rights reserved.*$/i, '').replace(/,? uploaded by.*$/i, ''));
}

function playClip(src, button) {
  document.querySelectorAll('.playing').forEach(el => el.classList.remove('playing'));
  if (audio.dataset.src === src && !audio.paused) { audio.pause(); return; }
  audio.dataset.src = src;
  audio.src = src;
  audio.currentTime = 0;
  audio.play().catch(() => {});
  if (button) {
    button.classList.add('playing');
    audio.onended = audio.onpause = () => button.classList.remove('playing');
  }
}
function stopAudio() { audio.pause(); }

// Weight birds you get wrong (or haven't seen) more heavily, so they come up more often.
function weightFor(id) {
  const s = stats[id];
  if (!s) return 3;
  return Math.max(0.4, 1 + s.wrong * 1.5 - s.streak * 0.6);
}
function pickTarget(pool, recent) {
  const candidates = pool.filter(b => !recent.includes(b.id));
  const weights = candidates.map(b => weightFor(b.id));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
function pickOptions(target, pool, n) {
  const others = shuffle(pool.filter(b => b.id !== target.id));
  let chosen = [];
  if (settings.lookalikes) chosen = others.filter(b => b.group === target.group).slice(0, n - 1);
  for (const b of others) {
    if (chosen.length >= n - 1) break;
    if (!chosen.includes(b)) chosen.push(b);
  }
  return shuffle([target, ...chosen]);
}

// ---------- Screens ----------
function home() {
  stopAudio();
  const seen = BIRDS.filter(b => status(b.id) !== 'new').length;
  const mastered = BIRDS.filter(b => status(b.id) === 'mastered').length;
  const totals = Object.values(stats).reduce((a, s) => ({ r: a.r + s.right, w: a.w + s.wrong }), { r: 0, w: 0 });
  const accuracy = totals.r + totals.w ? Math.round(100 * totals.r / (totals.r + totals.w)) + '%' : '–';
  $main.innerHTML = `
    <div class="hero">
      <h1>Sydney Birds</h1>
      <p class="muted">Learn ${BIRDS.length} local birds by sight and sound.</p>
    </div>
    <div class="stat-row">
      <div class="stat"><b>${mastered}</b><span>mastered</span></div>
      <div class="stat"><b>${seen}</b><span>seen</span></div>
      <div class="stat"><b>${accuracy}</b><span>accuracy</span></div>
    </div>
    <button class="mode" data-go="photo">
      <div class="emoji">📷</div>
      <div><h3>Photo quiz</h3><p>See a bird, pick its name.</p></div>
    </button>
    <button class="mode" data-go="call">
      <div class="emoji">🎧</div>
      <div><h3>Call quiz</h3><p>Hear a call, match it to the bird.</p></div>
    </button>
    <button class="mode" data-go="browse">
      <div class="emoji">📖</div>
      <div><h3>Field guide</h3><p>Browse all the birds, photos and calls.</p></div>
    </button>
    <button class="mode" data-go="settings">
      <div class="emoji">⚙️</div>
      <div><h3>Settings</h3><p>Choices, round length, offline download.</p></div>
    </button>`;
  $main.querySelectorAll('[data-go]').forEach(btn => btn.onclick = () => {
    const go = btn.dataset.go;
    if (go === 'photo' || go === 'call') startRound(go);
    else if (go === 'browse') browse();
    else settingsScreen();
  });
}

function topBar(inner = '') {
  return `<div class="bar"><button class="icon-btn" data-back aria-label="Back">←</button>${inner}</div>`;
}
function wireBack(fn = home) {
  $main.querySelector('[data-back]').onclick = fn;
}

// ---------- Quiz ----------
let round;

function startRound(mode) {
  const pool = mode === 'call' ? BIRDS.filter(b => b.calls.length) : BIRDS.filter(b => b.photos.length);
  round = { mode, pool, index: 0, score: 0, recent: [], missed: [] };
  nextQuestion();
}

function nextQuestion() {
  if (round.index >= settings.roundLength) return results();
  const target = pickTarget(round.pool, round.recent);
  round.recent = [...round.recent, target.id].slice(-Math.min(6, round.pool.length - 1));
  const options = pickOptions(target, round.pool, settings.choices);
  round.q = { target, options, photo: rand(target.photos), call: rand(target.calls) };
  // Photos for picture answers are chosen once, so they don't change on re-render.
  round.q.optionPhotos = Object.fromEntries(options.map(o => [o.id, rand(o.photos)]));
  renderQuestion();
  if (round.mode === 'call') playClip(round.q.call.src, $main.querySelector('.play'));
}

function renderQuestion(answeredId) {
  const { target, options, photo, call, optionPhotos } = round.q;
  const answered = answeredId !== undefined;
  const pct = 100 * round.index / settings.roundLength;

  const prompt = round.mode === 'photo'
    ? `<div class="media"><img src="${esc(photo.src)}" alt="Mystery bird"><div class="credit">${shortCredit(photo)} · ${esc(licenceLabel(photo.licence))}</div></div>`
    : `<div class="media listen">
         <button class="play" aria-label="Play call">▶</button>
         <p class="muted small">Tap to play again · ${shortCredit(call)}</p>
       </div>`;

  const showPhotos = round.mode === 'call' && settings.callAnswer === 'photos';
  const choiceClass = (o) => {
    if (!answered) return '';
    if (o.id === target.id) return 'right';
    if (o.id === answeredId) return 'wrong';
    return 'dim';
  };
  const choices = showPhotos
    ? `<div class="choices photos">${options.map(o => `
        <button data-id="${o.id}" class="${choiceClass(o)}" ${answered ? 'disabled' : ''}>
          <img src="${esc(optionPhotos[o.id].src)}" alt="${answered ? esc(o.name) : 'Option'}">
          ${answered ? `<span class="label">${esc(o.name)}</span>` : ''}
        </button>`).join('')}</div>`
    : `<div class="choices names">${options.map(o => `
        <button data-id="${o.id}" class="${choiceClass(o)}" ${answered ? 'disabled' : ''}>${esc(o.name)}</button>`).join('')}</div>`;

  let feedback = '';
  if (answered) {
    const correct = answeredId === target.id;
    const extra = round.mode === 'photo' && target.calls.length
      ? `<button class="btn secondary" data-hear>🔊 Hear its call</button>` : '';
    const seePhoto = round.mode === 'call' && !showPhotos
      ? `<div class="media"><img src="${esc(optionPhotos[target.id].src)}" alt="${esc(target.name)}"></div>` : '';
    feedback = `
      <div class="feedback ${correct ? 'good' : 'bad'}">
        <h3>${correct ? 'Correct!' : `It was the ${esc(target.name)}`}</h3>
        ${seePhoto}
        <p>${esc(target.tip)}</p>
        ${extra ? `<div class="actions">${extra}</div>` : ''}
      </div>
      <button class="btn block sticky-next" data-next>${round.index + 1 >= settings.roundLength ? 'See results' : 'Next'}</button>`;
  }

  $main.innerHTML = `
    ${topBar(`<div class="progress"><span style="width:${pct}%"></span></div><b>${round.score}</b>`)}
    ${prompt}
    ${choices}
    ${feedback}`;
  wireBack(() => { stopAudio(); home(); });

  const play = $main.querySelector('.play');
  if (play) play.onclick = () => playClip(call.src, play);
  $main.querySelectorAll('.choices button:not(:disabled)').forEach(btn => btn.onclick = () => answer(btn.dataset.id));
  const hear = $main.querySelector('[data-hear]');
  if (hear) hear.onclick = () => playClip(rand(target.calls).src);
  const next = $main.querySelector('[data-next]');
  if (next) {
    next.onclick = () => { round.index++; nextQuestion(); };
    next.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function answer(id) {
  const { target } = round.q;
  const correct = id === target.id;
  record(target.id, correct);
  if (correct) round.score++;
  else {
    if (!round.missed.includes(target.id)) round.missed.push(target.id);
    navigator.vibrate?.(120);
  }
  renderQuestion(id);
}

function results() {
  stopAudio();
  const total = settings.roundLength;
  const pct = round.score / total;
  const message = pct === 1 ? 'Perfect round!' : pct >= .8 ? 'Great birding!' : pct >= .5 ? 'Getting there.' : 'Keep practising.';
  $main.innerHTML = `
    ${topBar('<h2 class="grow">Results</h2>')}
    <div class="score"><b>${round.score}/${total}</b><p class="muted">${message}</p></div>
    ${round.missed.length ? `<h3>To work on</h3>
      <div class="missed">${round.missed.map(id => byId(id)).map(b => `
        <button class="row" data-bird="${b.id}">
          <img src="${esc(b.photos[0]?.src)}" alt="">
          <div class="grow"><b>${esc(b.name)}</b><div class="sub">${esc(b.tip)}</div></div>
        </button>`).join('')}</div>` : ''}
    <button class="btn block" data-again>Play again</button>
    <button class="btn block secondary" data-home>Home</button>`;
  wireBack();
  $main.querySelector('[data-again]').onclick = () => startRound(round.mode);
  $main.querySelector('[data-home]').onclick = home;
  $main.querySelectorAll('[data-bird]').forEach(el => el.onclick = () => birdDetail(el.dataset.bird, results));
}

// ---------- Field guide ----------
let browseFilter = '';

function browse() {
  stopAudio();
  $main.innerHTML = `
    ${topBar('<h2 class="grow">Field guide</h2>')}
    <input class="search" type="search" placeholder="Search birds" value="${esc(browseFilter)}" aria-label="Search birds">
    <div class="grid"></div>
    <p class="muted small">Green dot: mastered (3 right in a row). Orange: still learning.</p>`;
  wireBack();
  const grid = $main.querySelector('.grid');
  const draw = () => {
    const q = browseFilter.toLowerCase();
    grid.innerHTML = BIRDS
      .filter(b => !q || b.name.toLowerCase().includes(q) || b.sci.toLowerCase().includes(q))
      .slice().sort((a, b) => a.name.localeCompare(b.name))
      .map(b => {
        const st = status(b.id);
        return `<button class="tile" data-bird="${b.id}">
          <img src="${esc(b.photos[0]?.src)}" alt="" loading="lazy">
          ${st !== 'new' ? `<i class="dot ${st}"></i>` : ''}
          <span>${esc(b.name)}</span>
        </button>`;
      }).join('');
    grid.querySelectorAll('[data-bird]').forEach(el => el.onclick = () => birdDetail(el.dataset.bird, browse));
  };
  const input = $main.querySelector('.search');
  input.oninput = () => { browseFilter = input.value; draw(); };
  draw();
}

function birdDetail(id, back) {
  stopAudio();
  const b = byId(id);
  const s = stats[id];
  $main.innerHTML = `
    ${topBar(`<h2 class="grow">${esc(b.name)}</h2>`)}
    <div class="gallery">${b.photos.map(p => `
      <div class="media"><img src="${esc(p.src)}" alt="${esc(b.name)}" loading="lazy">
        <div class="credit">${shortCredit(p)} · ${esc(licenceLabel(p.licence))}</div></div>`).join('')}</div>
    <p class="muted small">${b.photos.length > 1 ? 'Swipe for more photos · ' : ''}<i>${esc(b.sci)}</i></p>
    <div class="tip">${esc(b.tip)}</div>
    ${b.calls.length ? `<h3>Calls</h3><div class="calls">${b.calls.map((c, i) => `
      <div class="call-row">
        <button class="icon-btn" data-call="${i}" aria-label="Play call ${i + 1}">▶</button>
        <div class="grow"><b>Recording ${i + 1}</b><div class="sub">${shortCredit(c)} · ${esc(licenceLabel(c.licence))}</div></div>
      </div>`).join('')}</div>` : ''}
    <p class="muted small">${s ? `Your record: ${s.right} right, ${s.wrong} wrong.` : 'Not quizzed yet.'}
      <a href="https://www.inaturalist.org/taxa/${b.taxonId}" target="_blank" rel="noopener">More on iNaturalist</a></p>`;
  wireBack(() => { stopAudio(); back(); });
  $main.querySelectorAll('[data-call]').forEach(btn => btn.onclick = () => playClip(b.calls[btn.dataset.call].src, btn));
}

// ---------- Settings ----------
function seg(name, values, labels = values) {
  return `<div class="seg" data-setting="${name}">${values.map((v, i) =>
    `<button data-value="${v}" aria-pressed="${String(settings[name]) === String(v)}">${labels[i]}</button>`).join('')}</div>`;
}

function settingsScreen() {
  $main.innerHTML = `
    ${topBar('<h2 class="grow">Settings</h2>')}
    <div class="panel">
      <div class="setting"><span>Answer choices</span>${seg('choices', [2, 3, 4])}</div>
      <div class="setting"><span>Questions per round</span>${seg('roundLength', [10, 20, 30])}</div>
      <div class="setting"><span>Tricky lookalikes</span>${seg('lookalikes', [true, false], ['On', 'Off'])}</div>
      <div class="setting"><span>Call quiz answers</span>${seg('callAnswer', ['photos', 'names'], ['Photos', 'Names'])}</div>
    </div>
    <p class="muted small">Tricky lookalikes fills the wrong answers with similar birds (ravens with currawongs, rosellas with rosellas) instead of random ones.</p>
    <div class="panel">
      <div class="setting"><div><b>Use offline</b><div class="muted small" data-offline-status>Save every photo and call to this phone.</div></div>
        <button class="btn" data-offline>Download</button></div>
      <div class="setting"><span>Reset my progress</span><button class="btn secondary" data-reset>Reset</button></div>
      <div class="setting"><span>Photo and sound credits</span><button class="btn secondary" data-credits>View</button></div>
    </div>`;
  wireBack();
  $main.querySelectorAll('[data-setting]').forEach(group => group.querySelectorAll('button').forEach(btn => btn.onclick = () => {
    const raw = btn.dataset.value;
    settings[group.dataset.setting] = raw === 'true' ? true : raw === 'false' ? false : isNaN(raw) ? raw : Number(raw);
    saveSettings();
    settingsScreen();
  }));
  $main.querySelector('[data-reset]').onclick = () => {
    if (!confirm('Reset your scores for every bird?')) return;
    for (const k of Object.keys(stats)) delete stats[k];
    saveStats();
    settingsScreen();
  };
  $main.querySelector('[data-credits]').onclick = credits;
  $main.querySelector('[data-offline]').onclick = downloadAll;
}

async function downloadAll() {
  const label = $main.querySelector('[data-offline-status]');
  const button = $main.querySelector('[data-offline]');
  if (!('caches' in window)) { label.textContent = 'This browser cannot save files offline.'; return; }
  button.disabled = true;
  const urls = BIRDS.flatMap(b => [...b.photos, ...b.calls].map(m => m.src));
  const cache = await caches.open(MEDIA_CACHE);
  let done = 0, failed = 0;
  const queue = urls.slice();
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res); else failed++;
        }
      } catch { failed++; }
      done++;
      label.textContent = `Saving… ${done} of ${urls.length}`;
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  label.textContent = failed ? `Saved, but ${failed} files failed. Try again on Wi-Fi.` : 'All birds saved. Works offline now.';
  button.disabled = false;
}

function credits() {
  $main.innerHTML = `
    ${topBar('<h2 class="grow">Credits</h2>')}
    <p class="muted small">Photos and recordings come from iNaturalist observers and are used under their Creative Commons licences. Tap a credit to see the original observation.</p>
    <div class="credits">${BIRDS.map(b => `
      <h3>${esc(b.name)}</h3>
      <ul>${[...b.photos.map(p => ['Photo', p]), ...b.calls.map(c => ['Call', c])].map(([kind, m]) =>
        `<li>${kind}: <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.credit)}</a></li>`).join('')}</ul>`).join('')}
    </div>`;
  wireBack(settingsScreen);
}

// ---------- Start ----------
const MEDIA_CACHE = 'sydney-birds-media';

async function start() {
  try {
    BIRDS = await (await fetch('data/birds.json')).json();
  } catch {
    $main.innerHTML = '<p>Could not load the bird list. Check your connection and reopen the app.</p>';
    return;
  }
  home();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
start();
