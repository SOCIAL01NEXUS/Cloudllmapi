'use strict';

(() => {
  
  const CONFIG = {
    SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
    SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',
    GROUP_CODE: 'change-this-secret-phrase',
    PANIC_URL: 'https://www.pw.live/',
    PANIC_ON_BLUR: true,
    PANIC_ON_HIDDEN: true,

    GLOW_WORDS: [
      'fine', 'tired', 'sleep', 'hurt', 'pain', 'sad', 'cry', 'tears',
      'angry', 'happy', 'fear', 'heart', 'food', 'eat', 'fever', 'alone',
      'together', 'home', 'miss', 'busy', 'wait', 'safe', 'danger', 'stress',
      'strain', 'pressure', 'relax', 'dream', 'morning', 'night', 'late', 'early',
      'parents', 'mother', 'father', 'sister',
    ],

    UNDERLINE_TERMS: true,

    TARGET_DATE: '2027-05-02',

    REACTIONS: [
      { id: 'ok', label: '✓ Got it' },
      { id: 'q',  label: '? Doubt' },
      { id: 'st', label: '★ Important' },
      { id: 'rv', label: '↻ Revise' },
    ],

    GLOW_MS: 6000,
    VANISH_MS: 10 * 60 * 1000,
    IDLE_MS: 3 * 60 * 1000,
    MAX_MESSAGES_IN_RAM: 100,
  };

  
  let sb = null, channel = null, cryptoKey = null;
  let nick = '';
  let armed = false, dead = false;
  let idleTimer = null, sweepTimer = null;
  const myId = crypto.getRandomValues(new Uint32Array(2)).join('-');
  let msgs = [];
  let reactions = {};
  let recent = [];

  const $ = (id) => document.getElementById(id);
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const wordSet = new Set(CONFIG.GLOW_WORDS.map((w) => w.toLowerCase()));
  const rxIds = new Set(CONFIG.REACTIONS.map((r) => r.id));

  const mem = new Map();
  const memoryStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, v); },
    removeItem: (k) => { mem.delete(k); },
  };

  
  function panic() {
    if (dead) return;
    dead = true;
    try { document.documentElement.innerHTML = ''; } catch (_) {}
    try { clearTimeout(idleTimer); clearInterval(sweepTimer); } catch (_) {}
    try { msgs = []; reactions = {}; recent = []; cryptoKey = null; nick = ''; mem.clear(); } catch (_) {}
    try { if (channel && sb) sb.removeChannel(channel); } catch (_) {}
    try { if (sb) sb.realtime.disconnect(); } catch (_) {}
    channel = null; sb = null;
    window.location.replace(CONFIG.PANIC_URL);
  }

  function resetIdle() {
    if (!armed) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(panic, CONFIG.IDLE_MS);
  }

  let armedAt = 0;
  function arm() {
    armed = true;
    armedAt = Date.now();
    if (CONFIG.PANIC_ON_BLUR) window.addEventListener('blur', (e) => { if (armed && e.target === window && Date.now() - armedAt > 1500) panic(); });
    if (CONFIG.PANIC_ON_HIDDEN) {
      document.addEventListener('visibilitychange', () => { if (armed && document.hidden) panic(); }, true);
      window.addEventListener('pagehide', () => { if (armed) panic(); }, true);
    }
    ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach((ev) =>
      window.addEventListener(ev, resetIdle, { passive: true, capture: true }));
    resetIdle();
  }

  
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

  
  const SUBJECTS = { physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology' };
  let curView = 'home';

  function setView(v) {
    curView = v;
    const target = SUBJECTS[v] ? 'study' : v;
    document.querySelectorAll('.view').forEach((s) => { s.hidden = s.dataset.view !== target; });
    document.querySelectorAll('#mainNav button').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    if (SUBJECTS[v]) {
      document.querySelector('.view[data-view="study"]').dataset.subj = v;
      buildSide(v);
    }
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
    const items = [...document.querySelectorAll('#chapterList li')];
    items.forEach((li) => li.classList.toggle('active', li.dataset.ch === id));
    const idx = items.findIndex((li) => li.dataset.ch === id) + 1;
    $('crumb').textContent = SUBJECTS[el.dataset.subj] + ' · Chapter ' + idx + ' of ' + items.length;
  }

  function showView(v) {
    if (SUBJECTS[v]) showChapter(document.querySelector('.chapter[data-subj="' + v + '"]').id);
    else setView(v);
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-v]');
    if (t) showView(t.dataset.v);
  });
  $('chapterList').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (li) showChapter(li.dataset.ch);
  });
  $('chapterList').addEventListener('keydown', (e) => {
    const li = e.target.closest('li');
    if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showChapter(li.dataset.ch); }
  });
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

  
  function updateCountdown() {
    const target = new Date(CONFIG.TARGET_DATE + 'T00:00:00');
    const days = Math.ceil((target - new Date()) / 86400000);
    if (isNaN(days)) { $('countNum').textContent = '–'; return; }
    if (days > 0) {
      $('countNum').textContent = String(days);
      $('countLabel').textContent = (days === 1 ? 'day' : 'days') + ' to your target date';
    } else if (days === 0) {
      $('countNum').textContent = '0';
      $('countLabel').textContent = 'Today is the day';
    } else {
      $('countNum').textContent = '–';
      $('countLabel').textContent = 'Set a new target date';
    }
  }

  
  const BANK = window.QBANK || {};
  let QUIZ = [];

  function pickRandom(arr, n) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a.slice(0, n);
  }

  function updateBankInfo() {
    const parts = [];
    let total = 0;
    Object.keys(SUBJECTS).forEach((k) => {
      const n = (BANK[k] || []).length;
      total += n;
      parts.push(SUBJECTS[k] + ' ' + n);
    });
    $('bankInfo').textContent = total
      ? 'Question bank: ' + parts.join(' · ') + ' · ' + total + ' in total. Each test picks a fresh random set.'
      : 'No questions loaded. Check that the bank-*.js files are uploaded next to index.html.';
  }

  function startQuiz() {
    const subj = $('qSubject').value;
    const want = Number($('qCount').value);
    const pool = [];
    (subj === 'all' ? Object.keys(SUBJECTS) : [subj]).forEach((k) => {
      (BANK[k] || []).forEach((item, idx) => pool.push(Object.assign({ s: k, id: k + ':' + idx }, item)));
    });
    if (!pool.length) { updateBankInfo(); return; }
    QUIZ = pickRandom(pool, Math.min(want, pool.length));
    buildQuiz();
    $('quizSetup').hidden = true;
    $('quizRun').hidden = false;
    window.scrollTo(0, 0);
  }

  function buildQuiz() {
    const f = $('quiz');
    f.textContent = '';
    QUIZ.forEach((item, i) => {
      const box = document.createElement('fieldset');
      box.className = 'qbox';
      const lg = document.createElement('legend');
      const tag = document.createElement('span');
      tag.className = 'qtag ' + item.s;
      tag.textContent = SUBJECTS[item.s] + (item.t ? ' · ' + item.t : '');
      lg.append(tag, document.createTextNode((i + 1) + '. ' + item.q));
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
    $('quizResult').hidden = true;
  }

  $('quizStart').addEventListener('click', startQuiz);

  function signalQuestion(el) {
    const box = el.closest('.qbox');
    if (!box) return;
    const item = QUIZ[[...$('quiz').children].indexOf(box)];
    if (item) sendEvent({ k: 'qa', q: item.id });
  }
  $('quiz').addEventListener('change', (e) => { if (e.target.type === 'radio') signalQuestion(e.target); });
  $('quiz').addEventListener('click', (e) => { if (e.target.closest('legend')) signalQuestion(e.target); });

  const pact = [];
  function partnerAttempt(id) {
    const m = /^(\w+):(\d+)$/.exec(id);
    const item = m && BANK[m[1]] && BANK[m[1]][Number(m[2])];
    if (!item || !SUBJECTS[m[1]]) return;
    pact.unshift({ s: m[1], t: item.t, q: item.q });
    if (pact.length > 5) pact.pop();
    const ul = $('pactList');
    ul.textContent = '';
    pact.forEach((p, n) => {
      const li = document.createElement('li');
      if (n === 0) li.className = 'glow';
      const sm = document.createElement('small');
      sm.textContent = SUBJECTS[p.s] + (p.t ? ' · ' + p.t : '');
      li.append(sm, document.createTextNode(p.q));
      ul.append(li);
    });
    $('partnerAct').hidden = false;
    document.documentElement.style.setProperty('--glow-ms', CONFIG.GLOW_MS + 'ms');
    const nav = document.querySelector('#mainNav [data-v="practice"]');
    if (nav) { nav.classList.remove('glow'); void nav.offsetWidth; nav.classList.add('glow'); setTimeout(() => nav.classList.remove('glow'), 4000); }
    const idx = QUIZ.findIndex((x) => x.id === id);
    const box = idx > -1 && $('quiz').children[idx];
    if (box) {
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
      box.classList.remove('glow'); void box.offsetWidth; box.classList.add('glow');
      setTimeout(() => box.classList.remove('glow'), CONFIG.GLOW_MS);
    }
  }


  $('quizCheck').addEventListener('click', () => {
    let total = 0, right = 0, wrong = 0, skipped = 0;
    const per = {}, cnt = {};
    Object.keys(SUBJECTS).forEach((k) => { per[k] = 0; cnt[k] = 0; });
    QUIZ.forEach((item, i) => {
      const box = $('quiz').children[i];
      const sel = box.querySelector('input:checked');
      box.classList.remove('right', 'wrong', 'skipped');
      const old = box.querySelector('.expl'); if (old) old.remove();
      let pts = 0;
      if (!sel) { skipped += 1; box.classList.add('skipped'); }
      else if (Number(sel.value) === item.a) { right += 1; pts = 4; box.classList.add('right'); }
      else { wrong += 1; pts = -1; box.classList.add('wrong'); }
      total += pts; per[item.s] += pts; cnt[item.s] += 1;
      const ex = document.createElement('p');
      ex.className = 'expl';
      ex.textContent = 'Answer: ' + item.o[item.a] + '. ' + item.e;
      box.append(ex);
    });
    const r = $('quizResult');
    r.textContent = '';
    const big = document.createElement('b');
    big.textContent = total + ' / ' + (QUIZ.length * 4);
    const p = document.createElement('p');
    const bySubject = Object.keys(SUBJECTS).filter((k) => cnt[k]).map((k) => SUBJECTS[k] + ' ' + per[k] + '/' + (cnt[k] * 4));
    p.textContent = right + ' correct, ' + wrong + ' wrong, ' + skipped + ' skipped. ' + bySubject.join(', ') + '.';
    r.append(big, p);
    r.hidden = false;
    r.scrollIntoView({ block: 'nearest' });
  });

  $('quizReset').addEventListener('click', () => {
    QUIZ = [];
    $('quiz').textContent = '';
    $('quizRun').hidden = true;
    $('quizResult').hidden = true;
    $('quizSetup').hidden = false;
    window.scrollTo(0, 0);
  });

  
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

  const GLOSS = {
    fine: "Fine adjustment: a screw or knob that moves a stage or pointer in very small steps, for precise measurement or focusing.",
    tired: "Fatigue: a material or muscle that is stressed again and again loses strength, or loses its ability to produce force.",
    sleep: "Sleep: a recurring state of reduced activity and awareness. The sleep–wake cycle is controlled by the hypothalamus and by melatonin.",
    hurt: "Hurt: tissue damage detected by nociceptors. In physics, the damage depends on the force, which is impulse divided by the stopping time.",
    pain: "Pain: the sensation produced when nociceptors (pain receptors) are stimulated by damage or by harmful stimuli.",
    sad: "Low mood: mood is influenced by neurotransmitters such as serotonin and dopamine.",
    cry: "Cry: in biology, crying releases tears from the lacrimal glands. In physics, a high-pitched cry has a high frequency.",
    tears: "Tears: fluid from the lacrimal glands that keeps the eye moist and contains lysozyme, an enzyme that kills bacteria.",
    angry: "Anger: a strong emotion that triggers adrenaline release, preparing the body for fight or flight.",
    happy: "Positive mood: linked with dopamine, serotonin and endorphins in the brain.",
    fear: "Fear: an alarm response that activates the sympathetic nervous system and adrenaline release.",
    heart: "Heart: a four-chambered muscular pump. At rest it beats about 72 times a minute and pumps roughly 5 litres of blood per minute.",
    food: "Food: material that supplies energy and raw materials. Food energy is measured in kilocalories (1 kcal = 4184 J).",
    eat: "Eat: to take in food. Some cells also \"eat\" by phagocytosis, engulfing particles such as bacteria.",
    fever: "Fever: body temperature raised above about 38 °C, usually because the hypothalamus resets its set point during infection.",
    alone: "Alone: a single, isolated entity. A lone pair is a pair of valence electrons that is not shared in a bond.",
    together: "Together: acting as one unit, for example atoms held together by bonds, or bodies moving together after a perfectly inelastic collision.",
    home: "Home: the starting or equilibrium position. A restoring force pulls a displaced system back to its home (mean) position.",
    miss: "Miss: falling short of a target. For a projectile, small errors in angle or speed change the range, R = u² sin2θ / g.",
    busy: "Busy junction: a point carrying a large flow. At any junction, current in equals current out (Kirchhoff's junction rule).",
    wait: "Wait: allow time for a process to finish, for example until a system reaches equilibrium or a titration reaches its end point.",
    safe: "Safe: within limits that avoid damage. A fuse, a safe working load or a factor of safety keeps a system below failure.",
    danger: "Danger: risk of harm, such as high voltage, concentrated acids or strong bases. Follow the safety rules.",
    stress: "Stress: in physics, restoring force per unit area (N/m²). In biology, a stressor activates the hypothalamus and releases cortisol.",
    strain: "Strain: the fractional change in dimension under stress. It is a ratio, so it has no unit.",
    pressure: "Pressure: force per unit area, measured in pascal (N/m²). Blood pressure is the force of blood on the vessel walls.",
    relax: "Relax: return to a lower-tension state. Muscles relax when stimulation stops, and a stretched spring relaxes when the load is removed.",
    dream: "Dream: vivid imagery that occurs mostly during REM (rapid eye movement) sleep.",
    morning: "Morning: the early part of the day. Morning light raises photosynthesis, opens stomata and suppresses melatonin.",
    night: "Night: the dark period. Melatonin peaks at night, and CAM plants open their stomata at night.",
    late: "Late: toward the end of a stage, as in late anaphase, when sister chromatids reach the poles.",
    early: "Early: toward the start of a stage, as in early prophase, when chromatin begins to condense.",
    parents: "Parents: the two individuals whose gametes combine. Offspring receive one allele of each gene from each parent.",
    mother: "Mother: the female parent. Mitochondrial DNA comes almost entirely from the mother. A mother cell is the cell that divides.",
    father: "Father: the male parent. Gregor Mendel is called the father of genetics.",
    sister: "Sister chromatids: the two identical copies of a chromosome, joined at the centromere after replication.",
  };

  
  let glossTimer = null;
  function hideGloss() {
    const g = $('gloss');
    if (g) g.hidden = true;
    clearTimeout(glossTimer);
  }
  function showGloss(kw) {
    const text = GLOSS[kw.dataset.w];
    if (!text) return;
    let g = $('gloss');
    if (!g) {
      g = document.createElement('div');
      g.id = 'gloss';
      g.className = 'gloss';
      g.setAttribute('role', 'tooltip');
      document.body.append(g);
    }
    g.textContent = text;
    g.hidden = false;
    const r = kw.getBoundingClientRect();
    const w = Math.min(g.offsetWidth, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 8));
    g.style.left = left + 'px';
    g.style.top = (r.bottom + window.scrollY + 8) + 'px';
    clearTimeout(glossTimer);
    glossTimer = setTimeout(hideGloss, 8000);
  }
  document.addEventListener('click', (e) => { if (!e.target.closest('.kw')) hideGloss(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideGloss(); });

  function renderRecent() {
    const box = $('recent');
    box.textContent = '';
    if (!recent.length) { box.hidden = true; return; }
    const lab = document.createElement('span');
    lab.className = 'recent-label';
    lab.textContent = 'Recently viewed terms';
    box.append(lab);
    recent.forEach((w) => {
      const c = document.createElement('span');
      c.className = 'rchip';
      c.textContent = w;
      box.append(c);
    });
    box.hidden = false;
  }
  function pushRecent(w) {
    recent.push(w);
    if (recent.length > 8) recent.shift();
    renderRecent();
  }

  $('notes').addEventListener('click', (e) => {
    const kw = e.target.closest('.kw');
    if (!kw) return;
    kw.classList.add('tap');
    setTimeout(() => kw.classList.remove('tap'), 200);
    showGloss(kw);
    sendEvent({ k: 'glow', w: kw.dataset.w });
  });

  function glowWord(w) {
    if (!wordSet.has(w)) return;
    pushRecent(w);
    const spans = [...document.querySelectorAll('.kw[data-w="' + w + '"]')];
    if (!spans.length) return;
    const chap = spans[0].closest('.chapter');
    if (chap) showChapter(chap.id);
    spans[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    document.documentElement.style.setProperty('--glow-ms', CONFIG.GLOW_MS + 'ms');
    spans.forEach((s) => {
      s.classList.remove('glow'); void s.offsetWidth;
      s.classList.add('glow');
      setTimeout(() => s.classList.remove('glow'), CONFIG.GLOW_MS);
    });
  }

  
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

  

  
  async function sendEvent(obj) {
    if (!channel || !cryptoKey) return;
    if (!armed) arm();
    obj.n = nick; obj.i = myId; obj.ts = Date.now();
    const c = await encrypt(obj);
    channel.send({ type: 'broadcast', event: 'e', payload: { c } });
  }

  async function onCipher(c) {
    const e = await decrypt(c);
    if (!e || typeof e.n !== 'string' || typeof e.k !== 'string') return;
    const mine = e.i === myId;
    if (!mine && !armed) arm();
    const name = e.n.slice(0, 20);
    if (e.k === 'glow' && typeof e.w === 'string') {
      if (!mine) glowWord(e.w);
    } else if (e.k === 'qa' && typeof e.q === 'string') {
      if (!mine) partnerAttempt(e.q);
    } else if (e.k === 'react' && rxIds.has(e.r) && document.getElementById(e.ch)) {
      (reactions[e.ch] = reactions[e.ch] || {})[name] = e.r;
      renderReactions(e.ch, mine ? null : name);
    }
  }

  
  function dbg(t) {
    if (location.hash !== '#check') return;
    let el = $('dbg');
    if (!el) { el = document.createElement('div'); el.id = 'dbg'; el.className = 'dbg'; document.body.append(el); }
    el.textContent = t;
  }
    async function connect() {
    const phrase = CONFIG.GROUP_CODE;
    nick = 'Guest';
    if (!phrase || phrase.length < 8 || phrase === 'change-this-secret-phrase') { dbg('GROUP_CODE not set (min 8 characters)'); return; }
    if (!window.supabase) { dbg('Supabase library did not load'); return; }
    if (/YOUR-/.test(CONFIG.SUPABASE_URL) || /YOUR-/.test(CONFIG.SUPABASE_ANON_KEY)) { dbg('SUPABASE_URL / SUPABASE_ANON_KEY not set'); return; }

    cryptoKey = await deriveKey(phrase);
    const room = await roomIdFrom(phrase);

    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storage: memoryStorage },
      realtime: { params: { eventsPerSecond: 10 } },
    });
    channel = sb.channel('sd-' + room, { config: { broadcast: { self: true } } })
      .on('broadcast', { event: 'e' }, (p) => onCipher(p.payload.c))
      .subscribe((st) => dbg('Connection: ' + st));
  }

  
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') panic();
  });

  if (!CONFIG.UNDERLINE_TERMS) document.body.classList.add('nohint');
  buildReactions();
  wrapTerms();
  updateBankInfo();
  updateCountdown();
  setView('home');
  connect();
})();
