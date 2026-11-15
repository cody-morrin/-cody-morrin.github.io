// Wordle where the hints lie. Scored exactly like Wordle (greens first, then yellows for the letters left over, so a
// letter is yellow only as many times as the word still has it), but every square then has a LIE chance of showing one
// of the other two colours instead, each as likely. The keyboard is coloured by what the squares showed, never by the
// truth. A right guess is all green, honestly, and when the game is over "Show the truth" shows which squares lied.
// Daily (/): one word per local calendar day, the same for everyone; the game is kept in this browser, lies included,
// so reloading changes nothing. Random (random.html, or /random): a new word, and new lies, on every load. All links are
// relative, so the site works from any address, in a subfolder too.
// 🤫 A secret: the ±15% badge in the header sets how often squares lie (see "the secret" below).
(() => {
  'use strict';
  const ROWS = 6, LEN = 5;
  const LIE = 15; // % of squares that lie, unless the secret has set another rate in this browser
  const COLORS = ['correct', 'present', 'absent'];
  const RANK = { absent: 1, present: 2, correct: 3 };
  const EMOJI = { correct: '🟩', present: '🟨' };
  const START = Date.UTC(2026, 10, 14); // daily #1 is 14 Nov 2026
  const ANSWERS = WORDS.answers.split(' ');
  const VALID = new Set([...WORDS.guesses.split(' '), ...ANSWERS]);
  const MODE = /\/random(\.html)?$/.test(location.pathname) ? 'random' : 'daily'; // (a folder called random/ is a daily)
  const KEY = { game: 'w15:daily', stats: `w15:stats:${MODE}` };
  const $ = (id) => document.getElementById(id);

  // ---- randomness: the lies (and the random word) come from the browser's cryptographic generator ----
  const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: just not kept */ } },
  };

  // ---- the rules ----
  function score(guess, answer) {
    const out = Array(LEN).fill('absent'), left = {};
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === answer[i]) out[i] = 'correct';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
      if (out[i] !== 'correct' && left[guess[i]] > 0) { out[i] = 'present'; left[guess[i]]--; }
    }
    return out;
  }
  let lie = LIE;
  const fib = (truth) => truth.map((c) => {
    if (rand() >= lie / 100) return c;
    const others = COLORS.filter((x) => x !== c);
    return others[rand() < 0.5 ? 0 : 1];
  });

  // ---- which game: today's (kept) or a random one ----
  const today = () => { const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - START) / 864e5); };
  const DAY = today();
  const dailyWord = (day) => ANSWERS[((day % ANSWERS.length) + ANSWERS.length) % ANSWERS.length];
  let game; // { day?, answer, guesses: [], shown: [[colour]], over: '' | 'won' | 'lost' }
  function newGame() {
    if (MODE === 'daily') {
      const kept = store.get(KEY.game);
      const answer = dailyWord(DAY);
      const sound = kept && kept.day === DAY && kept.answer === answer && Array.isArray(kept.guesses) && Array.isArray(kept.shown)
        && kept.guesses.length === kept.shown.length && kept.guesses.length <= ROWS
        && kept.guesses.every((g) => typeof g === 'string' && /^[a-z]{5}$/.test(g))
        && kept.shown.every((r) => Array.isArray(r) && r.length === LEN && r.every((c) => COLORS.includes(c)))
        && (kept.rates === undefined || (Array.isArray(kept.rates) && kept.rates.every((x) => Number.isFinite(x) && x >= 0 && x <= 100)));
      if (sound) return kept;
      return { day: DAY, answer, guesses: [], shown: [], over: '' };
    }
    return { answer: ANSWERS[Math.floor(rand() * ANSWERS.length)], guesses: [], shown: [], over: '' };
  }
  const save = () => { if (MODE === 'daily') store.set(KEY.game, game); };

  // ---- stats (each mode its own; daily streaks are days in a row, random streaks are wins in a row) ----
  function stats() {
    const s = store.get(KEY.stats);
    return s && Array.isArray(s.dist) && s.dist.length === ROWS ? s : { played: 0, wins: 0, streak: 0, best: 0, dist: Array(ROWS).fill(0), lastWin: null, counted: null };
  }
  function record(won, tries) {
    const s = stats();
    if (MODE === 'daily') {
      if (s.counted === DAY) return; // already counted today (another tab)
      s.counted = DAY;
      s.streak = won ? (s.lastWin === DAY - 1 ? s.streak + 1 : 1) : 0;
      if (won) s.lastWin = DAY;
    } else s.streak = won ? s.streak + 1 : 0;
    s.played++;
    if (won) { s.wins++; s.dist[tries - 1]++; }
    s.best = Math.max(s.best, s.streak);
    store.set(KEY.stats, s);
  }
  const streakNow = (s) => (MODE === 'daily' && s.lastWin !== DAY && s.lastWin !== DAY - 1 ? 0 : s.streak);

  // ---- the board ----
  const board = $('board');
  let typed = '', busy = false, truth = false;
  function drawBoard() {
    board.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');
      for (let i = 0; i < LEN; i++) {
        const t = document.createElement('div');
        t.className = 'tile';
        t.setAttribute('role', 'gridcell');
        row.append(t);
      }
      board.append(row);
    }
    game.guesses.forEach((g, r) => paintRow(r, false));
    paintTyped();
  }
  const NAMES = { correct: 'green', present: 'yellow', absent: 'grey' };
  function paintRow(r, animate) {
    const g = game.guesses[r], shown = game.shown[r], real = score(g, game.answer);
    [...board.children[r].children].forEach((t, i) => {
      const c = truth ? real[i] : shown[i];
      t.textContent = g[i];
      t.className = `tile ${c}${animate ? ' reveal' : ''}${truth && shown[i] !== real[i] ? ' lied' : ''}`;
      t.style.setProperty('--d', `${i * 300}ms`);
      t.style.setProperty('--claimed', `var(--${shown[i]})`);
      t.setAttribute('aria-label', `${g[i].toUpperCase()}, ${truth && shown[i] !== real[i] ? `really ${NAMES[real[i]]}, showed ${NAMES[shown[i]]}` : NAMES[c]}`);
    });
  }
  function paintTyped() {
    const r = game.guesses.length;
    if (r >= ROWS || game.over) return;
    [...board.children[r].children].forEach((t, i) => {
      t.textContent = typed[i] || '';
      t.className = `tile${typed[i] ? ' tbd' : ''}`;
      t.removeAttribute('aria-label');
    });
  }
  function shake() {
    const row = board.children[game.guesses.length];
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
  }
  function sizeBoard() {
    const y = scrollY; // (measuring without the scroll class loses the scroll position)
    document.body.classList.remove('scroll');
    const main = $('main'); // the board gets what the buttons and the legend under it leave
    const others = [...main.children].filter((el) => el !== board && !el.hidden).reduce((sum, el) => sum + el.offsetHeight + 10, 0);
    const h = main.clientHeight - 16 - others;
    const w = Math.min(main.clientWidth - 32, 350);
    if ((h - 5 * 5) / 6 < 34) { // too short (a phone on its side): the page scrolls, and the board fits above the keyboard
      document.body.classList.add('scroll');
      const fit = Math.floor((innerHeight - $('keyboard').offsetHeight - 16 - 5 * 5 - others) / 6);
      document.documentElement.style.setProperty('--tile', `${Math.max(28, Math.min(fit, Math.floor((w - 4 * 5) / 5), 52))}px`);
      return scrollTo(0, y);
    }
    const tile = Math.max(28, Math.floor(Math.min((w - 4 * 5) / 5, (h - 5 * 5) / 6, 62)));
    document.documentElement.style.setProperty('--tile', `${tile}px`);
  }

  // ---- the keyboard: coloured by what the squares showed ----
  const LAYOUT = ['qwertyuiop', '-asdfghjkl-', '>zxcvbnm<'];
  const keys = {};
  function drawKeyboard() {
    const kb = $('keyboard');
    for (const line of LAYOUT) {
      const row = document.createElement('div');
      row.className = 'krow';
      for (const ch of line) {
        const b = document.createElement('button');
        b.type = 'button';
        if (ch === '-') { b.className = 'key spacer'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); row.append(b); continue; }
        b.className = ch === '>' || ch === '<' ? 'key wide' : 'key';
        b.dataset.key = ch === '>' ? 'Enter' : ch === '<' ? 'Backspace' : ch;
        b.textContent = ch === '>' ? 'Enter' : ch === '<' ? '⌫' : ch;
        if (ch === '<') b.setAttribute('aria-label', 'Backspace');
        if (ch.length === 1 && /[a-z]/.test(ch)) keys[ch] = b;
        row.append(b);
      }
      kb.append(row);
    }
    kb.addEventListener('click', (e) => { const b = e.target.closest('[data-key]'); if (b) { press(b.dataset.key); b.blur(); } });
  }
  function paintKeys() {
    const best = {};
    game.guesses.forEach((g, r) => [...g].forEach((ch, i) => {
      const c = game.shown[r][i];
      if (!best[ch] || RANK[c] > RANK[best[ch]]) best[ch] = c;
    }));
    for (const [ch, b] of Object.entries(keys)) b.className = `key${best[ch] ? ` ${best[ch]}` : ''}`;
  }

  // ---- playing ----
  // a daily tab left open past midnight, or another tab that has played on: start again from what's saved
  function stale() {
    if (MODE !== 'daily') return false;
    const kept = store.get(KEY.game); // (null: this browser keeps nothing, so there's nothing newer either)
    if (today() === DAY && (kept === null || JSON.stringify(kept) === JSON.stringify(game))) return false;
    location.reload();
    return true;
  }
  function press(k) {
    if (busy || game.over || stale()) return;
    if (k === 'Enter') return submit();
    if (k === 'Backspace') { typed = typed.slice(0, -1); return paintTyped(); }
    if (/^[a-z]$/i.test(k) && typed.length < LEN) { typed += k.toLowerCase(); paintTyped(); }
  }
  function submit() {
    if (typed.length < LEN) { shake(); return toast('Not enough letters'); }
    if (!VALID.has(typed)) { shake(); return toast('Not in word list'); }
    const g = typed, real = score(g, game.answer), won = g === game.answer;
    game.guesses.push(g);
    game.shown.push(won ? real : fib(real));
    game.rates = [...(game.rates || []), lie]; // the lie rate each guess was made at (the secret can change it)
    if (won) game.over = 'won';
    else if (game.guesses.length === ROWS) game.over = 'lost';
    typed = '';
    save();
    if (game.over) record(game.over === 'won', game.guesses.length);
    const r = game.guesses.length - 1, quick = matchMedia('(prefers-reduced-motion: reduce)').matches;
    busy = true;
    paintRow(r, !quick);
    setTimeout(() => {
      busy = false;
      paintKeys();
      if (game.over === 'won') {
        [...board.children[r].children].forEach((t, i) => { t.classList.remove('reveal'); t.style.setProperty('--d', `${i * 100}ms`); if (!quick) t.classList.add('win'); });
        toast(['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'][r], 1800);
      } else if (game.over === 'lost') toast(game.answer.toUpperCase(), 3000);
      if (game.over) { showAfter(); setTimeout(() => openEnd(), quick ? 600 : 1900); } else paintTyped();
    }, quick ? 0 : 300 * (LEN - 1) + 500);
  }
  function lies() {
    let n = 0;
    game.guesses.forEach((g, r) => { const real = score(g, game.answer); game.shown[r].forEach((c, i) => { if (c !== real[i]) n++; }); });
    return n;
  }

  // ---- after the game ----
  function setTruth(on) {
    if (!game.over) return;
    truth = on;
    for (const id of ['truth-btn', 'truth-btn-2']) { $(id).setAttribute('aria-pressed', String(on)); $(id).textContent = on ? 'Show what I saw' : 'Show the truth'; }
    game.guesses.forEach((g, r) => paintRow(r, false));
    let legend = document.querySelector('.legend');
    if (on && !legend) {
      legend = document.createElement('p');
      legend.className = 'legend';
      legend.textContent = 'True colours. Dashed squares lied: the corner is the colour they showed you.';
      $('after').before(legend);
    } else if (!on && legend) legend.remove();
    sizeBoard();
  }
  function showAfter() {
    $('after').hidden = false;
    $('again-btn').hidden = $('again-btn-2').hidden = MODE !== 'random';
    sizeBoard();
  }
  function openEnd() {
    const dlg = $('end-dlg'), s = stats(), over = game.over;
    $('end-title').textContent = over === 'won' ? 'You got it!' : over === 'lost' ? 'Out of guesses' : 'Statistics';
    $('end-answer').innerHTML = over ? `The word was <b>${game.answer}</b>.` : '';
    const n = lies();
    $('end-lies').textContent = over ? (n ? `${n} square${n === 1 ? '' : 's'} lied to you.` : 'No square lied to you this time.') : '';
    $('share-btn').hidden = $('truth-btn-2').hidden = !over;
    $('again-btn-2').hidden = !over || MODE !== 'random';
    $('stats').hidden = false;
    $('s-played').textContent = s.played;
    $('s-win').textContent = s.played ? Math.round((100 * s.wins) / s.played) : 0;
    $('s-streak').textContent = streakNow(s);
    $('s-best').textContent = s.best;
    const most = Math.max(1, ...s.dist), dist = $('dist');
    dist.innerHTML = '';
    s.dist.forEach((v, i) => {
      const bar = document.createElement('div');
      bar.className = `bar${over === 'won' && game.guesses.length === i + 1 ? ' now' : ''}`;
      const n = document.createElement('span'), fill = document.createElement('i');
      n.textContent = i + 1;
      fill.textContent = v;
      fill.style.width = `${Math.max(8, (100 * v) / most)}%`; // (set here: the page's rules allow no inline styles)
      bar.append(n, fill);
      dist.append(bar);
    });
    $('next').textContent = MODE === 'daily' && over ? nextIn() : '';
    if (!dlg.open) dlg.showModal();
  }
  function nextIn() {
    const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const m = Math.max(0, Math.round((next - now) / 60000));
    return `Next word in ${Math.floor(m / 60)} h ${m % 60} min`;
  }
  async function share() {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const grid = game.shown.map((row) => row.map((c) => EMOJI[c] || (dark ? '⬛' : '⬜')).join('')).join('\n');
    const used = game.guesses.map((g, r) => game.rates?.[r] ?? LIE), lo = Math.min(...used), hi = Math.max(...used);
    const head = `Wordle ±${lo === hi ? lo : `${lo}–${hi}`}% ${MODE === 'daily' ? `#${DAY + 1}` : '(random)'} ${game.over === 'won' ? game.guesses.length : 'X'}/6 · ${lies()} lies`;
    const text = `${head}\n\n${grid}\n${location.origin}${location.pathname}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    } catch (e) { if (e?.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Could not copy'); }
  }

  // ---- toasts ----
  const toastBox = () => { // above an open dialog, not behind it (or inside a closed one)
    const box = $('toasts');
    (document.querySelector('dialog[open]') || document.body).append(box);
    return box;
  };
  function toast(msg, ms = 1200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toastBox().prepend(el);
    setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 300); }, ms);
  }

  // ---- 🤫 the secret: the badge sets the lie rate (0–100%), kept in this browser. Scroll on it (1% a notch), swipe up
  // or down on it (1% every 12 px), or click/tap it (up to the next 5%, from 100% back to 0%). It counts for guesses
  // from then on; squares already shown keep what they showed. Nothing shows it can be touched.
  const badge = $('rate-badge');
  let rateToast = null, rateTimer = 0;
  function setLie(v, say) {
    lie = Math.max(0, Math.min(100, Math.round(v)));
    badge.textContent = `±${lie}%`;
    badge.title = `Every coloured square has a ${lie}% chance of lying`;
    document.title = `Wordle ±${lie}%`;
    for (const el of document.querySelectorAll('[data-rate]')) el.textContent = `${lie}%`;
    if (!say) return;
    store.set('w15:lie', lie);
    badge.classList.remove('nudge');
    void badge.offsetWidth;
    badge.classList.add('nudge');
    const box = toastBox();
    if (!rateToast?.isConnected) { rateToast = document.createElement('div'); rateToast.className = 'toast'; box.prepend(rateToast); }
    rateToast.classList.remove('gone');
    rateToast.textContent = lie === LIE ? `Squares lie ${lie}% of the time (as normal)` : `Squares now lie ${lie}% of the time`;
    clearTimeout(rateTimer);
    rateTimer = setTimeout(() => { const el = rateToast; el.classList.add('gone'); setTimeout(() => { if (el.classList.contains('gone')) el.remove(); }, 300); }, 1400);
  }
  { const kept = store.get('w15:lie'); if (Number.isFinite(kept)) setLie(kept, false); }
  let wheel = 0;
  badge.addEventListener('wheel', (e) => {
    if (e.ctrlKey) return; // (a pinch or Ctrl+wheel: zooming, not the secret)
    e.preventDefault();
    const dy = e.deltaMode ? e.deltaY * 40 : e.deltaY; // (lines → pixels)
    if (Math.abs(dy) >= 50) { wheel = 0; return setLie(lie - Math.sign(dy), true); } // a mouse wheel: a notch, 1%
    wheel += dy; // a touchpad: little by little
    if (Math.abs(wheel) >= 50) { const n = Math.trunc(wheel / 50); wheel -= n * 50; setLie(lie - n, true); }
  }, { passive: false });
  let swipe = null, swiped = 0;
  badge.addEventListener('touchstart', (e) => { swipe = { y: e.touches[0].clientY, from: lie, moved: false }; }, { passive: true });
  badge.addEventListener('touchmove', (e) => {
    if (!swipe) return;
    e.preventDefault();
    const dy = swipe.y - e.touches[0].clientY;
    if (Math.abs(dy) > 8) swipe.moved = true;
    const v = Math.max(0, Math.min(100, swipe.from + Math.round(dy / 12)));
    if (swipe.moved && v !== lie) setLie(v, true);
  }, { passive: false });
  badge.addEventListener('touchend', () => { if (swipe?.moved) swiped = Date.now(); swipe = null; });
  badge.addEventListener('click', () => {
    if (Date.now() - swiped < 500) return; // (the end of a swipe, not a tap)
    setLie(lie >= 100 ? 0 : Math.floor(lie / 5) * 5 + 5, true);
  });

  // ---- start ----
  game = newGame();
  if (MODE === 'daily') save();
  $(`tab-${MODE}`).setAttribute('aria-current', 'page');
  $('label').textContent = MODE === 'daily' ? `#${DAY + 1} · ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'new word each load';
  drawKeyboard();
  drawBoard();
  paintKeys();
  if (game.over) showAfter();
  sizeBoard();
  addEventListener('resize', sizeBoard);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) {
      const focused = e.target.closest?.('a, button');
      if (e.key === 'Enter' && focused) { // Enter on a key types it, on a link follows it, and on a button after the game presses it
        if (focused.matches('#keyboard [data-key], a') || game.over) return;
        e.preventDefault();
      }
      press(e.key);
    }
  });
  const again = () => location.reload();
  $('again-btn').addEventListener('click', again);
  $('again-btn-2').addEventListener('click', again);
  $('truth-btn').addEventListener('click', () => setTruth(!truth));
  $('truth-btn-2').addEventListener('click', () => setTruth(!truth));
  $('share-btn').addEventListener('click', share);
  $('help-btn').addEventListener('click', () => $('help-dlg').showModal());
  $('stats-btn').addEventListener('click', openEnd);
  for (const d of document.querySelectorAll('dialog')) d.addEventListener('click', (e) => { // a click on the backdrop closes it
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && MODE === 'daily' && today() !== DAY) location.reload(); });
  if (!store.get('w15:seen-help')) { store.set('w15:seen-help', true); $('help-dlg').showModal(); }
  if (game.over && MODE === 'daily') setTimeout(openEnd, 400);
})();
