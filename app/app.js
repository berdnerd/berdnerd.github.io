'use strict';

const $main = document.getElementById('main');
const audio = new Audio();
audio.setAttribute('playsinline', '');

let BIRDS = [];
const byId = id => BIRDS.find(b => b.id === id);

const MEDIA_CACHE = 'sydney-birds-media';

// ---------- Storage (per device) ----------
const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};
const savedSettings = store.get('settings', {});
const settings = Object.assign(
  { photoChoices: 4, callChoices: 4, lookalikes: true, roundLength: 10, callAnswer: 'photos', palette: 'standard' },
  // People who were already quizzing before the starter pack existed keep all 50 birds.
  Object.keys(store.get('stats', {})).length ? { scope: 'all' } : { scope: 'starter' },
  // Earlier versions had one "choices" setting for both quizzes.
  savedSettings.choices ? { photoChoices: savedSettings.choices, callChoices: savedSettings.choices } : {},
  savedSettings);
delete settings.choices;
const stats = store.get('stats', {});
const saveSettings = () => { store.set('settings', settings); applyPalette(); };
function applyPalette() {
  if (settings.palette === 'cvd') document.documentElement.dataset.palette = 'cvd';
  else delete document.documentElement.dataset.palette;
}
applyPalette();
const saveStats = () => store.set('stats', stats);

// Spaced repetition: each bird sits in a Leitner box 0-4. A right answer moves it up a box and
// schedules the next review further out; a wrong answer drops it to box 0 and makes it due now.
const DAY = 86400000;
const INTERVALS = [0, 1, 3, 7, 21].map(d => d * DAY);
const now = () => Date.now();
function entry(id) {
  const s = stats[id] || (stats[id] = { right: 0, wrong: 0, streak: 0 });
  if (s.box === undefined) {        // stats saved before spaced repetition existed
    s.box = Math.min(s.streak || 0, 4);
    s.due = 0;
    s.last = 0;
  }
  s.mixedWith ||= {};
  return s;
}
function record(id, correct, chosenId) {
  const s = entry(id);
  if (correct) { s.right++; s.streak++; s.box = Math.min(s.box + 1, 4); }
  else { s.wrong++; s.streak = 0; s.box = 0; if (chosenId && chosenId !== id) s.mixedWith[chosenId] = (s.mixedWith[chosenId] || 0) + 1; }
  s.last = now();
  s.due = s.last + INTERVALS[s.box];
  saveStats();
}
function status(id) {
  const s = stats[id];
  if (!s || s.right + s.wrong === 0) return 'new';
  return entry(id).box >= 3 ? 'mastered' : 'learning';
}
const isDue = id => { const s = stats[id]; return !!s && now() >= entry(id).due; };
// The pairs you mix up most, across all birds, as [targetId, chosenId, count].
function worstMixUps(limit = 3) {
  const pairs = {};
  for (const [id, s] of Object.entries(stats)) {
    for (const [other, n] of Object.entries(s.mixedWith || {})) {
      const key = [id, other].sort().join('|');
      pairs[key] = (pairs[key] || 0) + n;
    }
  }
  return Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([key, n]) => [...key.split('|'), n]);
}

// ---------- Helpers ----------
const FEATHER_ICON = `<svg viewBox="-20 -56 40 122" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M0,-50 C13,-42 16,-20 14,-2 L8,2 L13,6 C11,24 6,36 0,44 C-6,36 -12,22 -13,6 C-15,-16 -13,-40 0,-50 Z" fill="currentColor" fill-opacity=".18"/>
  <path d="M0,-46 C0.8,-10 0.8,24 -1,62"/></svg>`;
// Simple line icons (24-unit grid, stroked in the brand colour by CSS) so every platform shows the same thing.
const ICONS = {
  photo: '<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M8.5 7l1.5-2.5h4L15.5 7"/>',
  call: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="13" width="4" height="7" rx="1.5"/><rect x="17" y="13" width="4" height="7" rx="1.5"/>',
  browse: '<path d="M12 6.5C10.5 5 8 4.5 4 4.8v13.7c4-.3 6.5.2 8 1.5 1.5-1.3 4-1.8 8-1.5V4.8c-4-.3-6.5.2-8 1.7z"/><path d="M12 6.5V20"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  learn: '<rect x="3" y="6" width="14" height="11" rx="2.5"/><path d="M7 20h11.5a2.5 2.5 0 0 0 2.5-2.5V9"/><path d="M7 11h6"/>',
  facts: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1.1 2.2h5c.1-1 .5-1.7 1.1-2.2A6 6 0 0 0 12 3z"/>',
  seasons: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7.5 15.5l2 2 3-3.5 2 1.5 2.5-3"/>',
  odd: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><circle cx="17.5" cy="17.5" r="3.5"/>',
  basics: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M8 10.5h5M10.5 8v5"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const FAMILIES = [
  ['parrots', 'Parrots & cockatoos'], ['honeyeaters', 'Honeyeaters'], ['black-white', 'Black-and-white birds'],
  ['bush', 'Bush birds'], ['night-cuckoos', 'Cuckoos & night birds'], ['ground', 'Ground & forest birds'],
  ['water', 'Water & shore'], ['introduced', 'Introduced birds'],
];
const familyName = key => FAMILIES.find(([k]) => k === key)?.[1] || key;
// Twelve birds almost everyone in Sydney meets, to learn first.
const STARTER = ['australian-magpie', 'laughing-kookaburra', 'sulphur-crested-cockatoo', 'galah', 'rainbow-lorikeet', 'noisy-miner',
  'pied-currawong', 'australian-raven', 'magpie-lark', 'australian-white-ibis', 'silver-gull', 'australian-wood-duck'];
const inScope = b => settings.scope !== 'starter' || STARTER.includes(b.id);
const starterDone = () => STARTER.filter(id => (stats[id]?.box ?? 0) >= 2).length;
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
// Creative Commons asks for a link to the licence itself, not just its name.
const licenceUrl = code => code === 'cc0'
  ? 'https://creativecommons.org/publicdomain/zero/1.0/'
  : `https://creativecommons.org/licenses/${(code || 'by').replace(/^cc-/, '')}/4.0/`;
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

// Birds you haven't met, keep getting wrong, or are due for review come up more often;
// birds comfortably ahead of their review date mostly rest.
function weightFor(id) {
  const s = stats[id];
  if (!s) return 3;
  const e = entry(id);
  const base = Math.max(0.3, 1 + e.wrong * 0.5 - e.box * 0.25);
  if (now() >= e.due) {
    const overdueDays = (now() - e.due) / DAY;
    return base * Math.min(4, 2 + overdueDays / 7);
  }
  return base * 0.35;
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
// Wrong answers: first the birds this one is actually confused with (and any you have mixed it up
// with yourself), then birds of the same family, then anything.
function pickOptions(target, pool, n) {
  const others = shuffle(pool.filter(b => b.id !== target.id));
  const chosen = [];
  const add = b => { if (b && !chosen.includes(b) && chosen.length < n - 1) chosen.push(b); };
  if (settings.lookalikes) {
    const mine = Object.entries(stats[target.id]?.mixedWith || {}).sort((a, b) => b[1] - a[1]).map(([id]) => id);
    [...mine, ...(target.confusedWith || [])].forEach(id => add(others.find(b => b.id === id)));
    others.filter(b => b.family === target.family).forEach(add);
  }
  others.forEach(add);
  return shuffle([target, ...chosen]);
}

// ---------- Screens ----------
function home() {
  if (updateReady) return location.reload();
  stopAudio();
  const seen = BIRDS.filter(b => status(b.id) !== 'new').length;
  const mastered = BIRDS.filter(b => status(b.id) === 'mastered').length;
  const due = BIRDS.filter(b => isDue(b.id)).length;
  const totals = Object.values(stats).reduce((a, s) => ({ r: a.r + s.right, w: a.w + s.wrong }), { r: 0, w: 0 });
  const accuracy = totals.r + totals.w ? Math.round(100 * totals.r / (totals.r + totals.w)) + '%' : '–';
  $main.innerHTML = `
    <div class="hero">
      <div class="wordmark">${FEATHER_ICON}<h1>berdnerd</h1></div>
      <p class="muted">Learn ${BIRDS.length} Sydney birds by sight and sound.</p>
    </div>
    <div class="stat-row">
      <div class="stat"><b>${mastered}</b><span>mastered</span></div>
      <div class="stat"><b>${seen ? due : BIRDS.length}</b><span>${seen ? 'due for review' : 'to meet'}</span></div>
      <div class="stat"><b>${accuracy}</b><span>accuracy</span></div>
    </div>
    ${settings.scope === 'starter' ? `<div class="banner">
      <b>Starter pack: ${starterDone()} of ${STARTER.length} birds learnt.</b>
      ${starterDone() >= 9
        ? '<span>Nice work. Ready for all 50?</span><button class="btn" data-unlock>Unlock all 50</button>'
        : '<span>Quizzes use 12 everyday birds until you know them. Change this in Settings.</span>'}
    </div>` : ''}
    <button class="mode learn" data-go="learn">
      <div class="emoji">${icon('learn')}</div>
      <div><h3>Learn</h3><p>Meet the birds family by family, no scores.</p></div>
    </button>
    <button class="mode photo" data-go="photo">
      <div class="emoji">${icon('photo')}</div>
      <div><h3>Photo quiz</h3><p>See a bird, pick its name.</p></div>
    </button>
    <button class="mode call" data-go="call">
      <div class="emoji">${icon('call')}</div>
      <div><h3>Call quiz</h3><p>Hear a call, match it to the bird.</p></div>
    </button>
    ${factBirds().length >= 4 ? `<button class="mode facts" data-go="facts">
      <div class="emoji">${icon('facts')}</div>
      <div><h3>Knowledge quiz</h3><p>What they eat, what else they're called, and more.</p></div>
    </button>` : ''}
    <button class="mode browse" data-go="browse">
      <div class="emoji">${icon('browse')}</div>
      <div><h3>Field guide</h3><p>Browse all the birds, photos and calls.</p></div>
    </button>
    <button class="mode settings" data-go="settings">
      <div class="emoji">${icon('settings')}</div>
      <div><h3>Settings</h3><p>Choices, round length, colours, offline download.</p></div>
    </button>`;
  $main.querySelectorAll('[data-go]').forEach(btn => btn.onclick = () => {
    const go = btn.dataset.go;
    if (go === 'photo' || go === 'call') startRound(go);
    else if (go === 'browse') browse();
    else if (go === 'learn') learnFamilies();
    else if (go === 'facts') startKnowledge();
    else settingsScreen();
  });
  const unlock = $main.querySelector('[data-unlock]');
  if (unlock) unlock.onclick = () => { settings.scope = 'all'; saveSettings(); home(); };
}

// ---------- Learn: flashcards by family ----------
function learnFamilies() {
  stopAudio();
  $main.innerHTML = `
    ${topBar('<h2 class="grow">Learn</h2>')}
    <p class="muted">Pick a family. Each card shows the bird, its name, what to look for and its call.</p>
    <div class="families">${FAMILIES.map(([key, label]) => {
      const birds = BIRDS.filter(b => b.family === key);
      const known = birds.filter(b => status(b.id) === 'mastered').length;
      return `<button class="row" data-family="${key}">
        <img src="${esc(birds[0].photos[0]?.src)}" alt="">
        <div class="grow"><b>${label}</b><div class="sub">${birds.length} birds${known ? ` · ${known} mastered` : ''}</div></div>
        <span class="chev">›</span>
      </button>`;
    }).join('')}</div>`;
  wireBack();
  $main.querySelectorAll('[data-family]').forEach(el => el.onclick = () => learnCards(el.dataset.family, 0));
}

function learnCards(family, index) {
  stopAudio();
  const birds = BIRDS.filter(b => b.family === family);
  const b = birds[index];
  const photo = b.photos[0];
  $main.innerHTML = `
    ${topBar(`<h2 class="grow">${familyName(family)}</h2><span class="score-pill">${index + 1}/${birds.length}</span>`)}
    <div class="card">
      <div class="media"><img src="${esc(photo.src)}" alt="${esc(b.name)}"><div class="credit">${shortCredit(photo)} · ${esc(licenceLabel(photo.licence))}</div></div>
      <div class="card-body">
        <h2>${esc(b.name)}</h2>
        <p class="muted small"><i>${esc(b.sci)}</i>${b.status === 'introduced' ? ' · introduced' : ''}</p>
        <p>${esc(b.tip)}</p>
        ${b.confusedWith?.length ? `<p class="muted small">Often confused with ${b.confusedWith.map(id => esc(byId(id).name)).join(', ')}.</p>` : ''}
        <div class="actions">
          ${b.calls.length ? '<button class="btn secondary" data-hear>🔊 Hear its call</button>' : ''}
          <button class="btn secondary" data-more>More photos</button>
        </div>
      </div>
    </div>
    <div class="dock">
      <button class="btn secondary" data-prev ${index === 0 ? 'disabled' : ''}>‹ Back</button>
      ${index + 1 < birds.length
        ? '<button class="btn block" data-next>Next bird ›</button>'
        : '<button class="btn block" data-quiz>Quiz me on these</button>'}
    </div>`;
  wireBack(learnFamilies);
  $main.querySelector('[data-hear]')?.addEventListener('click', e => playClip(rand(b.calls).src, e.currentTarget));
  $main.querySelector('[data-more]').onclick = () => birdDetail(b.id, () => learnCards(family, index));
  $main.querySelector('[data-prev]').onclick = () => learnCards(family, index - 1);
  $main.querySelector('[data-next]')?.addEventListener('click', () => learnCards(family, index + 1));
  $main.querySelector('[data-quiz]')?.addEventListener('click', () => startRound('photo', birds));
}

function topBar(inner = '') {
  return `<div class="bar"><button class="icon-btn" data-back aria-label="Back">←</button>${inner}</div>`;
}
function wireBack(fn = home) {
  $main.querySelector('[data-back]').onclick = fn;
}

// ---------- Quiz ----------
let round;

function startRound(mode, birds = BIRDS.filter(inScope)) {
  const pool = mode === 'call' ? birds.filter(b => b.calls.length) : birds.filter(b => b.photos.length);
  round = { mode, pool, index: 0, score: 0, recent: [], missed: [], birds };
  nextQuestion();
}

function nextQuestion() {
  stopAudio();
  if (round.index >= settings.roundLength) return results();
  const target = pickTarget(round.pool, round.recent);
  round.recent = [...round.recent, target.id].slice(-Math.min(6, round.pool.length - 1));
  const options = pickOptions(target, round.pool, round.mode === 'call' ? settings.callChoices : settings.photoChoices);
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

  // The call quiz's play button lives in the bottom dock, within thumb reach.
  const prompt = round.mode === 'photo'
    ? `<div class="media"><img src="${esc(photo.src)}" alt="Mystery bird"><div class="credit">${shortCredit(photo)} · ${esc(licenceLabel(photo.licence))}</div></div>`
    : '';

  const showPhotos = round.mode === 'call' && settings.callAnswer === 'photos';
  const choiceClass = (o) => {
    if (!answered) return '';
    if (o.id === target.id) return 'right';
    if (o.id === answeredId) return 'wrong';
    return 'dim';
  };
  const choices = showPhotos
    ? `<div class="choices photos${options.length === 3 ? ' three' : ''}">${options.map((o, i) => `
        <button data-id="${o.id}" class="${choiceClass(o)}" ${answered ? 'disabled' : ''} aria-label="${answered ? esc(o.name) : `Option ${i + 1}`}">
          <img src="${esc(optionPhotos[o.id].src)}" alt="">
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
    // After a wrong answer, show what you picked next to what it was, so the difference sticks.
    const chosen = !correct && byId(answeredId);
    const compare = chosen ? `
        <div class="compare">
          <img src="${esc((optionPhotos[chosen.id] || chosen.photos[0]).src)}" alt="">
          <div><b>You picked ${esc(chosen.name)}</b><div class="sub">${esc(chosen.tip)}</div></div>
        </div>` : '';
    feedback = `
      <div class="feedback ${correct ? 'good' : 'bad'}" aria-live="polite">
        <h3>${correct ? `Correct, ${/^[AEIOU]/.test(target.name) ? 'an' : 'a'} ${esc(target.name)}!` : `It was the ${esc(target.name)}`}</h3>
        ${seePhoto}
        <p>${esc(target.tip)}</p>
        ${compare}
        ${round.mode === 'call' ? `<p class="muted small">Recording: ${shortCredit(call)} · ${esc(licenceLabel(call.licence))}</p>` : ''}
        ${extra ? `<div class="actions">${extra}</div>` : ''}
      </div>`;
  }

  const nextButton = answered
    ? `<button class="btn block" data-next>${round.index + 1 >= settings.roundLength ? 'See results' : 'Next'}</button>` : '';
  const dock = round.mode === 'call'
    ? `<div class="dock">
         <button class="play" aria-label="Play call">▶</button>
         ${answered ? nextButton : '<div class="dock-text"><b>Play the call</b><span>Tap to hear it again</span></div>'}
       </div>`
    : answered ? `<div class="dock">${nextButton}</div>` : '';

  $main.innerHTML = `
    ${topBar(`<div class="progress" role="progressbar" aria-valuenow="${round.index}" aria-valuemax="${settings.roundLength}"><span></span></div><span class="score-pill" aria-label="Score">${round.score}</span>`)}
    ${prompt}
    ${choices}
    ${feedback}
    ${dock}`;
  // Set from script rather than a style attribute, so the page's Content-Security-Policy can forbid inline styles.
  $main.querySelector('.progress > span').style.width = `${pct}%`;
  wireBack(() => { stopAudio(); home(); });

  const play = $main.querySelector('.play');
  if (play) play.onclick = () => playClip(call.src, play);
  $main.querySelectorAll('.choices button:not(:disabled)').forEach(btn => btn.onclick = () => answer(btn.dataset.id));
  const hear = $main.querySelector('[data-hear]');
  if (hear) hear.onclick = () => playClip(rand(target.calls).src);
  const next = $main.querySelector('[data-next]');
  if (next) next.onclick = () => { round.index++; nextQuestion(); };
  $main.querySelector('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function answer(id) {
  const { target } = round.q;
  const correct = id === target.id;
  record(target.id, correct, id);
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
  const mixUps = worstMixUps(3).filter(([, , n]) => n >= 2);
  $main.innerHTML = `
    ${topBar('<h2 class="grow">Results</h2>')}
    <div class="score"><b>${round.score}/${total}</b><p class="muted">${message}</p></div>
    ${mixUps.length ? `<h3>Your usual mix-ups</h3>
      <div class="mixups">${mixUps.map(([a, b, n]) => `<div class="row static">
        <img src="${esc(byId(a).photos[0]?.src)}" alt=""><img src="${esc(byId(b).photos[0]?.src)}" alt="">
        <div class="grow"><b>${esc(byId(a).name)} ↔ ${esc(byId(b).name)}</b><div class="sub">${n} time${n === 1 ? '' : 's'}</div></div>
      </div>`).join('')}</div>` : ''}
    ${round.missed.length ? `<h3>To work on</h3>
      <div class="missed">${round.missed.map(id => byId(id)).map(b => `
        <button class="row" data-bird="${b.id}">
          <img src="${esc(b.photos[0]?.src)}" alt="">
          <div class="grow"><b>${esc(b.name)}</b><div class="sub">${esc(b.tip)}</div></div>
        </button>`).join('')}</div>` : ''}
    <button class="btn block" data-again>Play again</button>
    <button class="btn block secondary" data-home>Home</button>`;
  wireBack();
  $main.querySelector('[data-again]').onclick = () => round.mode === 'facts' ? startKnowledge() : startRound(round.mode, round.birds);
  $main.querySelector('[data-home]').onclick = home;
  $main.querySelectorAll('[data-bird]').forEach(el => el.onclick = () => birdDetail(el.dataset.bird, results));
}

// ---------- Knowledge quiz ----------
// Questions are built from data/facts.json: diet, other names, native/introduced and one notable fact
// per bird. Each answer shows the bird and where the fact came from.
let FACTS = {};
const factBirds = () => BIRDS.filter(b => FACTS[b.id]);

function startKnowledge() {
  const pool = factBirds();
  if (pool.length < 4) return;
  round = { mode: 'facts', pool, index: 0, score: 0, recent: [], missed: [], birds: pool };
  nextFactQuestion();
}

function makeFactQuestion(target, pool) {
  const f = FACTS[target.id];
  const others = shuffle(pool.filter(b => b.id !== target.id));
  const birdOptions = () => {
    const chosen = [];
    const add = b => { if (b && !chosen.includes(b) && chosen.length < 3) chosen.push(b); };
    (target.confusedWith || []).forEach(id => add(others.find(b => b.id === id)));
    others.filter(b => b.family === target.family).forEach(add);
    others.forEach(add);
    return shuffle([target, ...chosen]).map(b => ({ id: b.id, text: b.name }));
  };
  const kinds = ['fact'];
  if (f.diet) kinds.push('diet');
  if (f.names?.length) kinds.push('name');
  if (f.status === 'introduced' || Math.random() < 0.15) kinds.push('status');
  const kind = rand(kinds);
  if (kind === 'diet') {
    // Other birds' diets as wrong answers, skipping ones that read the same as the right one.
    const key = s => s.toLowerCase().replace(/[^a-z]/g, '').slice(0, 24);
    const used = new Set([key(f.diet)]);
    const wrong = [];
    for (const b of others) {
      const d = FACTS[b.id].diet;
      if (!d || used.has(key(d))) continue;
      used.add(key(d)); wrong.push({ id: b.id, text: d });
      if (wrong.length === 3) break;
    }
    return { kind, target, prompt: `What do ${esc(plural(target.name))} mainly eat?`,
      options: shuffle([{ id: target.id, text: f.diet }, ...wrong]) };
  }
  if (kind === 'name') {
    return { kind, target, prompt: `Which bird is also called the <b>${esc(rand(f.names))}</b>?`, options: birdOptions() };
  }
  if (kind === 'status') {
    const introduced = pool.filter(b => FACTS[b.id].status === 'introduced');
    const native = pool.filter(b => FACTS[b.id].status !== 'introduced');
    if (f.status === 'introduced') {
      return { kind, target, prompt: 'Which of these birds was <b>introduced</b> to Australia?',
        options: shuffle([target, ...shuffle(native).slice(0, 3)]).map(b => ({ id: b.id, text: b.name })) };
    }
    return { kind, target, prompt: 'Which of these birds is <b>native</b> to Australia?',
      options: shuffle([target, ...shuffle(introduced).slice(0, 3)]).map(b => ({ id: b.id, text: b.name })) };
  }
  return { kind, target, prompt: `Which bird ${esc(f.fact.replace(/\.$/, ''))}?`, options: birdOptions() };
}

function nextFactQuestion() {
  stopAudio();
  if (round.index >= settings.roundLength) return results();
  const target = pickTarget(round.pool, round.recent);
  round.recent = [...round.recent, target.id].slice(-6);
  round.q = makeFactQuestion(target, round.pool);
  round.q.photo = rand(target.photos);
  renderFactQuestion();
}

function renderFactQuestion(answeredId) {
  const { target, prompt, options, photo } = round.q;
  const f = FACTS[target.id];
  const answered = answeredId !== undefined;
  const correct = answeredId === target.id;
  const cls = o => !answered ? '' : o.id === target.id ? 'right' : o.id === answeredId ? 'wrong' : 'dim';
  $main.innerHTML = `
    ${topBar(`<div class="progress" role="progressbar" aria-valuenow="${round.index}" aria-valuemax="${settings.roundLength}"><span></span></div><span class="score-pill" aria-label="Score">${round.score}</span>`)}
    <h2 class="question">${prompt}</h2>
    <div class="choices names">${options.map(o => `
      <button data-id="${o.id}" class="${cls(o)}" ${answered ? 'disabled' : ''}>${esc(o.text)}</button>`).join('')}</div>
    ${answered ? `
      <div class="feedback ${correct ? 'good' : 'bad'}" aria-live="polite">
        <h3>${correct ? 'Correct!' : `It's the ${esc(target.name)}`}</h3>
        <div class="compare">
          <img src="${esc(photo.src)}" alt="">
          <div><b>${esc(target.name)}</b><div class="sub">${esc(f.fact)}</div></div>
        </div>
        <p class="muted small">Source: <a href="${esc(f.source.url)}" target="_blank" rel="noopener">Wikipedia, ${esc(f.source.title)}</a></p>
      </div>
      <div class="dock"><button class="btn block" data-next>${round.index + 1 >= settings.roundLength ? 'See results' : 'Next'}</button></div>` : ''}`;
  $main.querySelector('.progress > span').style.width = `${100 * round.index / settings.roundLength}%`;
  wireBack(home);
  $main.querySelectorAll('.choices button:not(:disabled)').forEach(btn => btn.onclick = () => {
    const ok = btn.dataset.id === target.id;
    if (ok) round.score++; else { if (!round.missed.includes(target.id)) round.missed.push(target.id); navigator.vibrate?.(120); }
    renderFactQuestion(btn.dataset.id);
  });
  const next = $main.querySelector('[data-next]');
  if (next) next.onclick = () => { round.index++; nextFactQuestion(); };
  $main.querySelector('.feedback')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

const plural = name => /s$/.test(name) ? name : /y$/.test(name) && !/[aeiou]y$/.test(name) ? name.replace(/y$/, 'ies') : name + 's';

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
  const tile = b => {
    const st = status(b.id);
    return `<button class="tile" data-bird="${b.id}">
      <img src="${esc(b.photos[0]?.src)}" alt="" loading="lazy">
      ${st !== 'new' ? `<i class="dot ${st}" title="${st === 'mastered' ? 'Mastered' : 'Still learning'}"></i>` : ''}
      <span>${esc(b.name)}</span>
    </button>`;
  };
  const draw = () => {
    const q = browseFilter.toLowerCase();
    const matches = BIRDS.filter(b => !q || b.name.toLowerCase().includes(q) || b.sci.toLowerCase().includes(q));
    // Grouped by family when browsing; a flat alphabetical list when searching.
    grid.innerHTML = q
      ? matches.slice().sort((a, b) => a.name.localeCompare(b.name)).map(tile).join('')
      : FAMILIES.map(([key, label]) => {
          const birds = matches.filter(b => b.family === key).sort((a, b) => a.name.localeCompare(b.name));
          return birds.length ? `<h3 class="family">${label}</h3>${birds.map(tile).join('')}` : '';
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
    <h3 class="section">📷 Photo quiz</h3>
    <div class="panel">
      <div class="setting"><span>Answer choices</span>${seg('photoChoices', [2, 3, 4])}</div>
    </div>
    <h3 class="section">🎧 Call quiz</h3>
    <div class="panel">
      <div class="setting"><span>Answer choices</span>${seg('callChoices', [2, 3, 4])}</div>
      <div class="setting"><span>Answer with</span>${seg('callAnswer', ['photos', 'names'], ['Photos', 'Names'])}</div>
    </div>
    <h3 class="section">Both quizzes</h3>
    <div class="panel">
      <div class="setting"><span>Birds in quizzes</span>${seg('scope', ['starter', 'all'], ['Starter 12', 'All 50'])}</div>
      <div class="setting"><span>Questions per round</span>${seg('roundLength', [10, 20, 30])}</div>
      <div class="setting"><span>Tricky lookalikes</span>${seg('lookalikes', [true, false], ['On', 'Off'])}</div>
    </div>
    <p class="muted small">Tricky lookalikes fills the wrong answers with birds that really get mixed up (Noisy Miner with Common Myna, Crimson with Eastern Rosella), including ones you have confused yourself.</p>
    <h3 class="section">Colours</h3>
    <div class="panel">
      <div class="setting"><span>Right / wrong colours</span>${seg('palette', ['standard', 'cvd'], ['Green & red', 'Blue & orange'])}</div>
    </div>
    <p class="muted small">Blue & orange suits red–green colour blindness. Right and wrong answers always get a tick or a cross as well.</p>
    <h3 class="section">This phone</h3>
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

const ICON_CREDIT = { credit: '(c) Jude Wright, some rights reserved (CC BY-NC)', licence: 'cc-by-nc', url: 'https://www.inaturalist.org/observations/150118680' };

function credits() {
  const item = (kind, m) => `<li>${kind}: <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.credit)}</a>
    · <a href="${licenceUrl(m.licence)}" target="_blank" rel="noopener">${esc(licenceLabel(m.licence))}</a></li>`;
  $main.innerHTML = `
    ${topBar('<h2 class="grow">Credits</h2>')}
    <p class="muted small">Photos and recordings were shared by observers on <a href="https://www.inaturalist.org" target="_blank" rel="noopener">iNaturalist</a>
      and recordists on <a href="https://xeno-canto.org" target="_blank" rel="noopener">xeno-canto</a>, and are used here under the Creative Commons licences they chose.
      Tap a name to see the original, or a licence to read it.</p>
    <p class="muted small">Changes made: photos are resized and cropped; recordings are trimmed to about 20 seconds and their volume evened out.
      Where an original is ShareAlike, our changed copy is available under that same licence.
      This app is free and non-commercial.</p>
    <div class="credits">
      <h3>App icon</h3>
      <ul>${item('Kookaburra photo', ICON_CREDIT)}</ul>
      ${BIRDS.map(b => `
      <h3>${esc(b.name)}</h3>
      <ul>${[...b.photos.map(p => ['Photo', p]), ...b.calls.map(c => ['Call', c])].map(([kind, m]) => item(kind, m)).join('')}</ul>`).join('')}
    </div>`;
  wireBack(settingsScreen);
}

// ---------- Start ----------
async function start() {
  try {
    BIRDS = await (await fetch('data/birds.json')).json();
    FACTS = await fetch('data/facts.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
  } catch {
    $main.innerHTML = '<p>Could not load the bird list. Check your connection and reopen the app.</p>';
    return;
  }
  home();
  if ('serviceWorker' in navigator) watchForUpdates();
}

// When a new version of the app is published, switch to it: straight away on the home
// screen, otherwise next time the home screen is shown (so a quiz round isn't lost).
let updateReady = false;
function watchForUpdates() {
  // On a first visit the offline layer takes over part-way through; only later changes are updates.
  let controlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(reg => {
    // Phones often resume the app from memory rather than restarting it, so check again on return.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) { controlled = true; return; }
    updateReady = true;
    if ($main.querySelector('.hero')) location.reload();
  });
}
start();
