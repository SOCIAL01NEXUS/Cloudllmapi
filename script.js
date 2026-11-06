/* =====================================================================
 * StudyDesk – RAM-only study portal with private signals (Supabase Realtime)
 *
 *  Features
 *   1. Glossary terms: tap a term -> it GLOWS on the other person's screen.
 *   2. Topic reactions: pick a reaction on a chapter -> the other person sees it.
 *   3. "Doubts & Discussion": normal-looking chat with extra safety
 *      (privacy blur, auto-vanish, idle lock, clear button).
 *
 *  Safety (unchanged + extended)
 *   - No localStorage / sessionStorage / cookies / IndexedDB. Supabase auth
 *     is forced into an in-memory adapter.
 *   - Everything sent (messages, glows, reactions) is end-to-end encrypted
 *     with AES-GCM; key derived from the shared group code.
 *   - Broadcast only: nothing is stored on the server.
 *   - Panic (blur / tab hidden / minimise / idle / Ctrl+Shift+X): wipe DOM,
 *     purge RAM, close sockets, location.replace() to PANIC_URL.
 * ===================================================================== */
'use strict';

(() => {
  /* ------------------------- CONFIG ------------------------- */
  const CONFIG = {
    SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',   // <-- replace
    SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',          // <-- replace (anon key is public by design)
    PANIC_URL: 'https://www.pw.live/',
    PANIC_ON_BLUR: true,
    PANIC_ON_HIDDEN: true,

    // Your private vocabulary. Every word here must appear in the notes text;
    // it gets wrapped as a tappable glossary term. Only YOU TWO know what each means.
    // Add/remove words freely (lowercase). Edit the notes in index.html to include them.
    GLOW_WORDS: [
      'velocity', 'acceleration', 'inertia', 'momentum', 'friction',
      'equilibrium', 'energy', 'pendulum', 'resonance', 'gravity', 'orbit', 'horizon',
    ],

    // Reactions shown under each chapter title (id is sent, label is shown)
    REACTIONS: [
      { id: 'ok', label: '✓ Got it' },
      { id: 'q',  label: '? Doubt' },
      { id: 'st', label: '★ Important' },
      { id: 'rv', label: '↻ Revise' },
    ],

    GLOW_MS: 6000,               // how long a glow lasts
    VANISH_MS: 10 * 60 * 1000,   // doubts disappear after 10 minutes
    IDLE_MS: 3 * 60 * 1000,      // no activity for 3 minutes -> panic
    MAX_MESSAGES_IN_RAM: 100,
  };

  /* ------------------ VOLATILE STATE (RAM only) ------------------ */
  let sb = null, channel = null, cryptoKey = null;
  let nick = '';
  let armed = false, dead = false;
  let idleTimer = null, sweepTimer = null;
  const myId = crypto.getRandomValues(new Uint32Array(2)).join('-'); // per-page id
  let msgs = [];                 // {el, ts}
  let reactions = {};            // { ch1: { name: reactionId } }

  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const wordSet = new Set(CONFIG.GLOW_WORDS.map((w) => w.toLowerCase()));
  const rxIds = new Set(CONFIG.REACTIONS.map((r) => r.id));

  // In-memory storage adapter (replaces localStorage for Supabase auth)
  const mem = new Map();
  const memoryStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, v); },
    removeItem: (k) => { mem.delete(k); },
  };

  /* ------------------------- PANIC SYSTEM ------------------------- */
  function panic() {
    if (dead) return;
    dead = true;
    // 1) instant DOM destruction
    try { document.documentElement.innerHTML = ''; } catch (_) {}
    // 2) memory purge + close sockets
    try { clearTimeout(idleTimer); clearInterval(sweepTimer); } catch (_) {}
    try { msgs = []; reactions = {}; cryptoKey = null; nick = ''; mem.clear(); } catch (_) {}
    try { if (channel && sb) sb.removeChannel(channel); } catch (_) {}
    try { if (sb) sb.realtime.disconnect(); } catch (_) {}
    channel = null; sb = null;
    // 3) redirect + overwrite current history entry
    window.location.replace(CONFIG.PANIC_URL);
  }

  function resetIdle() {
    if (!armed) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(panic, CONFIG.IDLE_MS);
  }

  function arm() {
    armed = true;
    if (CONFIG.PANIC_ON_BLUR) window.addEventListener('blur', () => { if (armed) panic(); }, true);
    if (CONFIG.PANIC_ON_HIDDEN) {
      document.addEventListener('visibilitychange', () => { if (armed && document.hidden) panic(); }, true);
      window.addEventListener('pagehide', () => { if (armed) panic(); }, true);
    }
    ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach((ev) =>
      window.addEventListener(ev, resetIdle, { passive: true, capture: true }));
    resetIdle();
    sweepTimer = setInterval(sweep, 15000);
  }

  /* ------------------------- CRYPTO ------------------------- */
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  async function roomIdFrom(phrase) {
    return hex(await crypto.subtle.digest('SHA-256', enc.encode('room:' + phrase))).slice(0, 32);
  }
  async function deriveKey(phrase) {
    const base = await crypto.subtle.importKey('raw', enc.encode(phrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('studydesk:v2'), iterations: 200000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function encrypt(obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, enc.encode(JSON.stringify(obj)));
    return b64(iv) + '.' + b64(ct);
  }
  async function decrypt(str) {
    try {
      const [iv, ct] = String(str).split('.');
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, cryptoKey, unb64(ct));
      return JSON.parse(dec.decode(pt));
    } catch (_) { return null; }
  }

  /* ------------------ STUDY UI: pages, chapters, search ------------------ */
  // "Pages" are views inside this ONE document, so the Supabase socket and the
  // RAM-only state survive navigation, and the URL / history never changes.
  const SUBJECTS = { physics: 'Class 11 Physics', chemistry: 'Class 11 Chemistry', maths: 'Class 11 Maths' };
  let curView = 'home';

  function setView(v) {
    curView = v;
    const target = SUBJECTS[v] ? 'study' : v;
    document.querySelectorAll('.view').forEach((s) => { s.hidden = s.dataset.view !== target; });
    document.querySelectorAll('#mainNav button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    if (SUBJECTS[v]) buildSide(v);
  }

  function buildSide(subj) {
    $('sideTitle').textContent = SUBJECTS[subj];
    const ul = $('chapterList');
    ul.textContent = '';
    let n = 0;
    document.querySelectorAll('.chapter[data-subj="' + subj + '"]').forEach((c) => {
      n += 1;
      const li = document.createElement('li');
      li.dataset.ch = c.id;
      li.tabIndex = 0;
      const b = document.createElement('b'); b.textContent = 'Chapter ' + n;
      const sp = document.createElement('span'); sp.textContent = c.querySelector('h2').textContent;
      li.append(b, sp);
      ul.append(li);
    });
  }

  function showChapter(id) {
    const el = $(id);
    if (!el) return;
    if (curView !== el.dataset.subj) setView(el.dataset.subj);
    document.querySelectorAll('.chapter').forEach((s) => { s.hidden = s.id !== id; });
    document.querySelectorAll('#chapterList li').forEach((li) => li.classList.toggle('active', li.dataset.ch === id));
  }

  function showView(v) {
    if (SUBJECTS[v]) showChapter(document.querySelector('.chapter[data-subj="' + v + '"]').id);
    else setView(v);
    window.scrollTo(0, 0);
  }

  // top nav, logo, home cards (anything with data-v)
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-v]');
    if (t) showView(t.dataset.v);
  });
  // sidebar chapters
  $('chapterList').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) showChapter(li.dataset.ch);
  });
  $('chapterList').addEventListener('keydown', (e) => {
    const li = e.target.closest('li');
    if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showChapter(li.dataset.ch); }
  });
  // search: filters the sidebar; Enter opens the first matching chapter in any subject
  $('search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#chapterList li').forEach((li) => {
      li.style.display = !q || li.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
  $('search').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const hit = [...document.querySelectorAll('.chapter')].find((c) => c.querySelector('h2').textContent.toLowerCase().includes(q));
    if (hit) { showChapter(hit.id); window.scrollTo(0, 0); }
  });

  // ads are decorative placeholders: clicking does nothing
  document.querySelectorAll('.ad').forEach((a) => a.addEventListener('click', (e) => e.preventDefault()));

  /* ------------------------- Practice quiz ------------------------- */
  const QUIZ = [
    { q: 'A ball is thrown upward at 20 m/s (g = 10 m/s²). Maximum height?', o: ['10 m', '20 m', '40 m', '5 m'], a: 1 },
    { q: 'Maximum horizontal force on a 2 kg block with μₛ = 0.5 before it slides (g = 10)?', o: ['5 N', '10 N', '20 N', '1 N'], a: 1 },
    { q: 'How many moles are in 36 g of water?', o: ['1 mol', '3 mol', '2 mol', '0.5 mol'], a: 2 },
    { q: 'Maximum electrons in the n = 3 shell?', o: ['8', '18', '32', '9'], a: 1 },
    { q: 'If n(A) = 20, n(B) = 15, n(A ∩ B) = 8, then n(A ∪ B) is?', o: ['27', '35', '43', '12'], a: 0 },
  ];
  function buildQuiz() {
    const f = $('quiz');
    f.textContent = '';
    QUIZ.forEach((item, i) => {
      const box = document.createElement('fieldset');
      box.className = 'qbox';
      const lg = document.createElement('legend');
      lg.textContent = (i + 1) + '. ' + item.q;
      box.append(lg);
      item.o.forEach((opt, j) => {
        const lab = document.createElement('label');
        lab.className = 'opt';
        const r = document.createElement('input');
        r.type = 'radio'; r.name = 'q' + i; r.value = String(j);
        lab.append(r, document.createTextNode(' ' + opt));
        box.append(lab);
      });
      f.append(box);
    });
    $('quizScore').textContent = '';
  }
  $('quizCheck').addEventListener('click', () => {
    let score = 0;
    QUIZ.forEach((item, i) => {
      const box = $('quiz').children[i];
      const sel = box.querySelector('input:checked');
      box.classList.remove('right', 'wrong');
      if (sel && Number(sel.value) === item.a) { score += 1; box.classList.add('right'); }
      else box.classList.add('wrong');
    });
    $('quizScore').textContent = 'Score: ' + score + ' / ' + QUIZ.length;
  });
  $('quizReset').addEventListener('click', buildQuiz);

  /* ------------- Glossary terms: wrap words in the notes ------------- */
  function wrapTerms() {
    const pattern = new RegExp('\\b(' + [...wordSet].join('|') + ')\\b', 'gi');
    const walker = document.createTreeWalker($('notes'), NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('pre, summary, details, h2, h3, .react, .kw')
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const text = node.nodeValue;
      pattern.lastIndex = 0;
      if (!pattern.test(text)) return;
      pattern.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0, m;
      while ((m = pattern.exec(text))) {
        frag.append(text.slice(last, m.index));
        const s = document.createElement('span');
        s.className = 'kw';
        s.dataset.w = m[0].toLowerCase();
        s.textContent = m[0];
        frag.append(s);
        last = m.index + m[0].length;
      }
      frag.append(text.slice(last));
      node.replaceWith(frag);
    });
  }
  // Also wrap <b> terms that are in the list (they're inside <b>, still allowed)

  $('notes').addEventListener('click', (e) => {
    const kw = e.target.closest('.kw');
    if (!kw) return;
    kw.classList.add('tap');
    setTimeout(() => kw.classList.remove('tap'), 200);
    sendEvent({ k: 'glow', w: kw.dataset.w });     // does nothing until joined
  });

  function glowWord(w) {
    if (!wordSet.has(w)) return;
    const spans = [...document.querySelectorAll('.kw[data-w="' + w + '"]')];
    if (!spans.length) return;
    // jump to the chapter that contains it so the glow is actually visible
    const chap = spans[0].closest('.chapter');
    if (chap) showChapter(chap.id);
    spans[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    document.documentElement.style.setProperty('--glow-ms', CONFIG.GLOW_MS + 'ms');
    spans.forEach((s) => {
      s.classList.remove('glow'); void s.offsetWidth;   // restart animation
      s.classList.add('glow');
      setTimeout(() => s.classList.remove('glow'), CONFIG.GLOW_MS);
    });
  }

  /* ------------------------- Reactions ------------------------- */
  function buildReactions() {
    document.querySelectorAll('.react').forEach((box) => {
      const btns = document.createElement('div');
      btns.className = 'btns';
      CONFIG.REACTIONS.forEach((r) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.label;
        b.addEventListener('click', () => sendEvent({ k: 'react', ch: box.dataset.ch, r: r.id }));
        btns.append(b);
      });
      const list = document.createElement('div');
      list.className = 'list';
      box.append(btns, list);
    });
  }

  function renderReactions(ch, glowName) {
    const list = document.querySelector('.react[data-ch="' + ch + '"] .list');
    if (!list) return;
    list.textContent = '';
    const map = reactions[ch] || {};
    Object.keys(map).forEach((name) => {
      const def = CONFIG.REACTIONS.find((r) => r.id === map[name]);
      if (!def) return;
      const chip = document.createElement('span');
      chip.className = 'chip' + (name === glowName ? ' glow' : '');
      chip.textContent = name + ': ' + def.label;
      list.append(chip);
    });
  }

  /* ------------------------- Doubts chat ------------------------- */
  function renderMsg(m, mine) {
    const log = $('log');
    const div = document.createElement('div');
    div.className = 'm' + (mine ? ' me' : '') + ($('blurToggle').checked ? ' blurred' : '');
    div.addEventListener('click', () => div.classList.toggle('show'));
    const small = document.createElement('small');
    small.textContent = m.n + ' · ' + new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const body = document.createElement('span');
    body.textContent = m.t;                         // textContent => no XSS
    div.append(small, body);
    log.append(div);
    msgs.push({ el: div, ts: m.ts });
    while (msgs.length > CONFIG.MAX_MESSAGES_IN_RAM) msgs.shift().el.remove();
    log.scrollTop = log.scrollHeight;
  }

  function sweep() {       // auto-vanish old doubts
    const cutoff = Date.now() - CONFIG.VANISH_MS;
    msgs = msgs.filter((x) => (x.ts < cutoff ? (x.el.remove(), false) : true));
  }

  $('blurToggle').addEventListener('change', (e) => {
    msgs.forEach((x) => { x.el.classList.toggle('blurred', e.target.checked); x.el.classList.remove('show'); });
  });
  $('clearBtn').addEventListener('click', () => { msgs.forEach((x) => x.el.remove()); msgs = []; });

  /* ------------------------- Event bus ------------------------- */
  async function sendEvent(obj) {
    if (!channel || !cryptoKey) return;
    obj.n = nick; obj.i = myId; obj.ts = Date.now();
    const c = await encrypt(obj);
    channel.send({ type: 'broadcast', event: 'e', payload: { c } });
  }

  async function onCipher(c) {
    const e = await decrypt(c);
    if (!e || typeof e.n !== 'string' || typeof e.k !== 'string') return;
    const mine = e.i === myId;
    const name = e.n.slice(0, 20);
    if (e.k === 'msg' && typeof e.t === 'string') {
      renderMsg({ n: name, t: e.t.slice(0, 500), ts: Number(e.ts) || Date.now() }, mine);
    } else if (e.k === 'glow' && typeof e.w === 'string') {
      if (!mine) glowWord(e.w);                    // glow only on the OTHER person's screen
    } else if (e.k === 'react' && rxIds.has(e.r) && document.getElementById(e.ch)) {
      (reactions[e.ch] = reactions[e.ch] || {})[name] = e.r;
      renderReactions(e.ch, mine ? null : name);
    }
  }

  /* ------------------------- Join ------------------------- */
  async function join() {
    const phrase = $('phrase').value;
    nick = $('nick').value.trim() || 'Guest';
    $('joinErr').textContent = '';
    if (phrase.length < 8) { $('joinErr').textContent = 'Group code must be at least 8 characters.'; return; }
    if (!window.supabase) { $('joinErr').textContent = 'Could not load the study group service.'; return; }

    cryptoKey = await deriveKey(phrase);
    const room = await roomIdFrom(phrase);
    $('phrase').value = '';

    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storage: memoryStorage },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    channel = sb.channel('sd-' + room, { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'e' }, (p) => onCipher(p.payload.c))
      .subscribe();

    $('join').hidden = true;
    $('chat').hidden = false;
    arm();
  }

  /* ------------------------- Wiring ------------------------- */
  $('joinBtn').addEventListener('click', join);
  $('phrase').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  $('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const t = $('msg').value.trim();
    if (t) { $('msg').value = ''; sendEvent({ k: 'msg', t }); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') panic();   // manual panic
  });

  buildReactions();
  wrapTerms();
  buildQuiz();
  setView('home');
})();
