/* AI Studio — app logic (UI + storage + provider calls). Core logic lives in lib.js. */
(function () {
  "use strict";
  const L = window.Lib;
  const CFG = window.APP_CONFIG || {};
  const BACKEND = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICONS = {
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    clip: '<path d="m21 11-8.6 8.6a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.6 8.6a2 2 0 0 1-2.8-2.8L15 7.3"/>',
    pin: '<path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z"/>',
    edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9m0-5v5h5M4 13a8 8 0 0 0 14 4l2-2m0 5v-5h-5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/>',
    archive: '<rect x="3" y="4" width="18" height="5" rx="1.5"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.3-1.8-.4-1 .3-2.2 1.5-2.2H17a4 4 0 0 0 4-4c0-5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
    shield: '<path d="M12 3 4 6v6c0 5 3.4 8.2 8 9 4.6-.8 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'
  };
  const ic = (n, s) => '<svg class="ic" width="' + (s || 20) + '" height="' + (s || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[n] + "</svg>";
  document.querySelectorAll("[data-ic]").forEach((el) => { el.innerHTML = ic(el.dataset.ic, Number(el.dataset.s) || 22); });
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const now = () => Date.now();
  const PIDS = Object.keys(L.PROVIDERS);
  const MAX_ATTACH = 200 * 1024;

  /* ---------------- storage ---------------- */
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast("Browser storage is full or blocked", true); } };

  const DB = (function () {
    let db;
    const open = () => new Promise((res, rej) => {
      if (db) return res(db);
      const r = indexedDB.open("aistudio", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("chats", { keyPath: "id" });
        const m = d.createObjectStore("messages", { keyPath: "id" }); m.createIndex("chatId", "chatId");
        d.createObjectStore("files", { keyPath: "id" });
      };
      r.onsuccess = () => { db = r.result; res(db); };
      r.onerror = () => rej(r.error);
    });
    const tx = async (store, mode, fn) => {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction(store, mode); const s = t.objectStore(store);
        let out; const req = fn(s); if (req) req.onsuccess = () => { out = req.result; };
        t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    };
    return {
      put: (s, v) => tx(s, "readwrite", (o) => o.put(v)),
      del: (s, k) => tx(s, "readwrite", (o) => o.delete(k)),
      get: (s, k) => tx(s, "readonly", (o) => o.get(k)),
      all: (s) => tx(s, "readonly", (o) => o.getAll()),
      byChat: async (id) => { const d = await open(); return new Promise((res, rej) => { const r = d.transaction("messages").objectStore("messages").index("chatId").getAll(id); r.onsuccess = () => res(r.result.sort((a, b) => a.t - b.t || a.seq - b.seq)); r.onerror = () => rej(r.error); }); },
      clear: async () => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction(["chats", "messages", "files"], "readwrite"); ["chats", "messages", "files"].forEach((s) => t.objectStore(s).clear()); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
    };
  })();

  /* ---------------- state ---------------- */
  const S = {
    view: "chat",
    chats: [],
    cur: null,            // current chat object or null (unsaved draft)
    msgs: [],             // messages of current chat
    draftMode: "chat",
    task: "generate",
    session: lsGet("sb_session", null),
    settings: Object.assign({ theme: "dark", routing: "auto", selected: { provider: "", model: "" }, allowFallback: false, demo: false, consent: false, enabled: {}, preferred: {} }, lsGet("settings", {})),
    byok: {},             // provider -> key (only if consent was given)
    prov: {},             // provider -> {configured, keySource, models:[], loadedAt, error}
    usage: lsGet("usage", {}),
    busy: false, abort: null,
    drafts: { chat: "", code: "" },
    pendingAtt: [],
    showFiles: false,
    sp: null,             // settings sub-page
    pp: null,             // open provider inside Providers page
    lastUsed: null,
  };
  if (S.settings.consent) S.byok = lsGet("byok", {});
  PIDS.forEach((p) => { S.prov[p] = { configured: false, keySource: "none", models: (lsGet("models_" + p, { list: [] }).list) || [], loadedAt: lsGet("models_" + p, { t: 0 }).t || 0, error: null }; });
  const saveSettings = () => lsSet("settings", S.settings);

  /* ---------------- ui helpers ---------------- */
  let toastT;
  function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "toast" + (bad ? " bad" : ""); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }
  function sheet(html) { $("#sheetBody").innerHTML = html; $("#sheet").hidden = false; }
  function closeSheet() { $("#sheet").hidden = true; $("#sheetBody").innerHTML = ""; }
  function applyTheme() { document.documentElement.dataset.theme = S.settings.theme; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = S.settings.theme === "dark" ? "#0b0f1a" : "#f5f7fc"; }

  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`\n]+)`/g, '<code class="inl">$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s;
  }
  function mdText(t) {
    const lines = t.split("\n"); let out = ""; let list = null; let para = [];
    const flushP = () => { if (para.length) { out += "<p>" + inline(para.join(" ")) + "</p>"; para = []; } };
    const closeL = () => { if (list) { out += "</" + list + ">"; list = null; } };
    for (const ln of lines) {
      let m;
      if (!ln.trim()) { flushP(); closeL(); continue; }
      if ((m = ln.match(/^(#{1,3})\s+(.*)$/))) { flushP(); closeL(); out += "<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"; continue; }
      if ((m = ln.match(/^\s*[-*]\s+(.*)$/))) { flushP(); if (list !== "ul") { closeL(); out += "<ul>"; list = "ul"; } out += "<li>" + inline(m[1]) + "</li>"; continue; }
      if ((m = ln.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (list !== "ol") { closeL(); out += "<ol>"; list = "ol"; } out += "<li>" + inline(m[1]) + "</li>"; continue; }
      if ((m = ln.match(/^>\s?(.*)$/))) { flushP(); closeL(); out += "<blockquote>" + inline(m[1]) + "</blockquote>"; continue; }
      closeL(); para.push(ln.trim());
    }
    flushP(); closeL(); return out;
  }
  function highlight(code, lang) {
    try { if (window.hljs) { if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value; return hljs.highlightAuto(code).value; } } catch (e) { /* fall through */ }
    return esc(code);
  }
  function codeBlock(tk, key) {
    const lines = tk.code.split("\n").length;
    const gut = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
    const name = tk.filename || "snippet." + L.extFor(tk.lang);
    const size = L.fmtSize(new Blob([tk.code]).size);
    const body = tk.closed ? highlight(tk.code, tk.lang) : esc(tk.code);
    return '<div class="cb" data-key="' + esc(key) + '"><div class="cb-h"><span class="fn" title="' + esc(name) + '">' + esc(name) + '</span><span class="lang">' + esc(tk.lang || "text") + " · " + size + "</span>" +
      '<button class="btn small" data-act="copycode" data-key="' + esc(key) + '">Copy</button><button class="btn small" data-act="dlcode" data-key="' + esc(key) + '">Download</button><button class="btn small" data-act="savecode" data-key="' + esc(key) + '">Save</button></div>' +
      '<div class="cb-b"><div class="cb-g">' + gut + '</div><pre><code class="hljs">' + body + (tk.closed ? "" : '<span class="gen"><i></i><i></i><i></i></span>') + "</code></pre></div></div>";
  }
  const CODE_CACHE = {}; // key -> {code, name, lang}
  function renderContent(m) {
    const toks = L.tokenize(m.content || ""); let html = ""; let n = 0;
    for (const tk of toks) {
      if (tk.type === "text") html += mdText(tk.text);
      else { const key = m.id + ":" + n++; const name = tk.filename || "snippet-" + n + "." + L.extFor(tk.lang); CODE_CACHE[key] = { code: tk.code, name, lang: tk.lang }; html += codeBlock(tk, key); }
    }
    return html;
  }

  /* ---------------- file output ---------------- */
  async function saveBlob(name, data, type) {
    const blob = new Blob([data], { type: type || "application/octet-stream" });
    try {
      if (window.showSaveFilePicker && S.settings.askLocation) {
        const h = await showSaveFilePicker({ suggestedName: name.split("/").pop() });
        const w = await h.createWritable(); await w.write(blob); await w.close();
        toast("Saved: " + name.split("/").pop() + " (" + L.fmtSize(blob.size) + ")"); return true;
      }
    } catch (e) { if (e && e.name === "AbortError") return false; /* else fall back */ }
    try {
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = name.split("/").pop(); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast("Download started: " + a.download + " (" + L.fmtSize(blob.size) + ")"); return true;
    } catch (e) { toast("Download failed: " + e.message, true); return false; }
  }
  async function shareFile(name, data, type) {
    try {
      const f = new File([data], name.split("/").pop(), { type: type || "text/plain" });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: f.name }); return; }
      toast("Sharing files is not supported on this browser. Use Download.", true);
    } catch (e) { if (e && e.name !== "AbortError") toast("Share failed: " + e.message, true); }
  }
  const zipBlobFor = (files) => L.makeZip(files.map((f) => ({ path: f.path, content: f.content })));

  /* ---------------- auth (Supabase REST, no SDK) ---------------- */
  const authHdr = () => ({ apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" });
  async function authCall(path, body) {
    const r = await fetch(CFG.SUPABASE_URL + "/auth/v1/" + path, { method: "POST", headers: authHdr(), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || "Auth error " + r.status);
    return j;
  }
  function setSession(j) {
    if (!j || !j.access_token) { S.session = null; localStorage.removeItem("sb_session"); return; }
    S.session = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(now() / 1000) + (j.expires_in || 3600), email: (j.user && j.user.email) || (S.session && S.session.email) || "" };
    lsSet("sb_session", S.session);
  }
  async function token() {
    if (!S.session) throw { type: "unauthorized", message: "Please sign in (Settings)" };
    if (S.session.expires_at - 60 < now() / 1000) {
      try { setSession(await authCall("token?grant_type=refresh_token", { refresh_token: S.session.refresh_token })); }
      catch (e) { setSession(null); throw { type: "unauthorized", message: "Session expired. Please sign in again." }; }
    }
    return S.session.access_token;
  }
  async function proxy(provider, action, payload, signal, userKey) {
    const tk = await token();
    const h = { Authorization: "Bearer " + tk, apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (userKey) h["x-user-api-key"] = userKey;
    let r;
    try { r = await fetch(CFG.SUPABASE_URL + "/functions/v1/ai-proxy", { method: "POST", headers: h, body: JSON.stringify({ provider, action, payload }), signal }); }
    catch (e) { if (e && e.name === "AbortError") throw { type: "aborted", message: "Stopped" }; throw { type: "network", message: "No connection to the server" }; }
    return r;
  }

  /* ---------------- providers ---------------- */
  async function refreshStatus() {
    if (!BACKEND || !S.session) return;
    await Promise.all(PIDS.map(async (p) => {
      try {
        const r = await proxy(p, "status", {}, null, S.byok[p]);
        const j = await r.json();
        S.prov[p].configured = !!j.configured; S.prov[p].keySource = j.keySource || "none"; S.prov[p].error = null;
      } catch (e) { S.prov[p].error = e.message || "unreachable"; }
    }));
    render(); updateChip();
  }
  async function loadModels(p, force) {
    const st = S.prov[p];
    if (!BACKEND || !st.configured) return;
    if (!force && st.models.length && now() - st.loadedAt < 6 * 3600e3) return;
    try {
      const r = await proxy(p, "models", {}, null, S.byok[p]);
      const txt = await r.text();
      if (!r.ok) { const e = L.classifyError(r.status, txt, r.headers.get("retry-after")); st.error = L.ERROR_LABEL[e.type] + ": " + e.message; return; }
      st.models = L.normalizeModels(p, JSON.parse(txt)); st.loadedAt = now(); st.error = null;
      lsSet("models_" + p, { t: st.loadedAt, list: st.models });
    } catch (e) { st.error = e.message || "Could not load models"; }
  }
  async function loadAllModels(force) { await Promise.all(PIDS.map((p) => loadModels(p, force))); render(); }
  const provState = () => { const o = {}; PIDS.forEach((p) => { const s = S.prov[p]; o[p] = { configured: s.configured && S.settings.enabled[p] !== false, models: s.models, enabled: S.settings.enabled[p] !== false, preferred: S.settings.preferred[p] || null }; }); return o; };

  function updateChip() {
    const c = $("#modelChip"); if (!c) return;
    if (S.settings.demo) c.textContent = "DEMO";
    else if (S.lastUsed) c.textContent = (S.settings.routing === "auto" ? "Auto · " : "") + S.lastUsed.provider + "/" + S.lastUsed.model.split("/").pop();
    else if (S.settings.routing === "manual" && S.settings.selected.model) c.textContent = S.settings.selected.provider + "/" + S.settings.selected.model.split("/").pop();
    else c.textContent = "Auto";
  }

  /* One provider call; streams if possible. Throws {type,message,retryAfter}. */
  async function callOnce(attempt, messages, { signal, onDelta }) {
    if (S.settings.demo) return demoCall(messages, onDelta, signal);
    const payload = { model: attempt.model, messages, stream: true, temperature: 0.3, max_tokens: 4096 };
    const r = await proxy(attempt.provider, "chat", payload, signal, S.byok[attempt.provider]);
    if (!r.ok) { const txt = await r.text(); throw L.classifyError(r.status, txt, r.headers.get("retry-after")); }
    const ct = r.headers.get("content-type") || "";
    if (!r.body || ct.includes("application/json")) {
      const j = await r.json(); const t = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
      if (onDelta) onDelta(t); return { text: t, usage: j.usage || null };
    }
    const reader = r.body.getReader(); const dec = new TextDecoder(); const feed = L.createSSEParser(); let text = ""; let usage = null;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        const res = feed(dec.decode(value, { stream: true }));
        for (const d of res.deltas) { text += d; if (onDelta) onDelta(d); }
        if (res.usage) usage = res.usage;
      }
    } catch (e) { if (e && e.name === "AbortError") throw { type: "aborted", message: "Stopped" }; throw { type: "network", message: "Connection lost while streaming" }; }
    if (!text) throw { type: "server", message: "Provider returned an empty response" };
    return { text, usage };
  }
  async function demoCall(messages, onDelta, signal) {
    const last = messages[messages.length - 1].content;
    const txt = "**DEMO MODE — this is a canned mock reply, not from a real AI.**\n\nYou wrote: " + last.slice(0, 120).replace(/\n/g, " ") + "\n\n```js demo/hello.js\nconsole.log('hello from demo mode');\n```\n";
    for (let i = 0; i < txt.length; i += 12) {
      if (signal && signal.aborted) throw { type: "aborted", message: "Stopped" };
      await new Promise((r) => setTimeout(r, 25)); if (onDelta) onDelta(txt.slice(i, i + 12));
    }
    return { text: txt, usage: null };
  }

  function addUsage(p, usage, promptText, outText) {
    const u = S.usage[p] || (S.usage[p] = { reported: 0, estimated: 0, requests: 0 });
    u.requests++;
    if (usage && usage.total_tokens) u.reported += usage.total_tokens; else u.estimated += L.estimateTokens(promptText) + L.estimateTokens(outText);
    lsSet("usage", S.usage);
  }

  /* ---------------- chats ---------------- */
  async function loadChats() { S.chats = (await DB.all("chats")).sort((a, b) => b.updated - a.updated); }
  async function openChat(id) {
    const c = S.chats.find((x) => x.id === id); if (!c) return;
    S.cur = c; S.msgs = await DB.byChat(id); S.view = c.mode === "code" ? "code" : "chat"; if (c.task) S.task = c.task;
    closeDrawer(); render(); scrollEnd(true);
  }
  function newChat(mode) { S.cur = null; S.msgs = []; S.draftMode = mode || (S.view === "code" ? "code" : "chat"); S.pendingAtt = []; closeDrawer(); if (S.view !== "chat" && S.view !== "code") S.view = S.draftMode; render(); }
  async function ensureChat(firstText) {
    if (S.cur) return S.cur;
    const c = { id: uid(), title: L.titleFrom(firstText), mode: S.view === "code" ? "code" : S.draftMode, created: now(), updated: now(), notes: "", summary: "", summarizedCount: 0, task: S.task };
    await DB.put("chats", c); S.chats.unshift(c); S.cur = c; return c;
  }
  async function saveMsg(m) { await DB.put("messages", m); }
  let seq = 0;
  const mkMsg = (chatId, role, content, extra) => Object.assign({ id: uid(), chatId, role, content, t: now(), seq: seq++ }, extra || {});

  async function send(text, retryOf) {
    if (S.busy) return;
    text = (text || "").trim();
    if (!text && !S.pendingAtt.length && !retryOf) return;
    if (!S.settings.demo && (!BACKEND || !S.session)) { toast(BACKEND ? "Sign in first (Settings)" : "Backend not configured. See README or enable Demo mode.", true); return; }
    S.busy = true; render();
    const mode = (S.cur ? S.cur.mode : S.view === "code" ? "code" : S.draftMode);
    let chat;
    try {
      chat = await ensureChat(text || (S.pendingAtt[0] && S.pendingAtt[0].name) || "New chat");
      if (!retryOf) {
        const um = mkMsg(chat.id, "user", text, { attachments: S.pendingAtt.slice(), task: mode === "code" ? S.task : undefined });
        S.msgs.push(um); await saveMsg(um); S.pendingAtt = [];
        S.drafts[S.view === "code" ? "code" : "chat"] = "";
      }
      chat.task = S.task;
      // build context (own chat only), summarize what no longer fits
      let ctx = L.buildContext(chat, S.msgs.filter((m) => !m.error), { mode, task: S.task, budgetTokens: 6000 });
      if (ctx.dropped.length > (chat.summarizedCount || 0)) {
        chat.summary = L.extractiveSummary(chat.summary || "", ctx.dropped.slice(chat.summarizedCount || 0));
        chat.summarizedCount = ctx.dropped.length;
        ctx = L.buildContext(chat, S.msgs.filter((m) => !m.error), { mode, task: S.task, budgetTokens: 6000 });
      }
      chat.updated = now(); await DB.put("chats", chat);
      const am = mkMsg(chat.id, "assistant", "", { streaming: true }); S.msgs.push(am);
      S.abort = new AbortController(); render(); scrollEnd(true);
      await runAssistant(am, ctx.messages, mode, false);
    } catch (e) { toast(e.message || "Something went wrong", true); }
    finally { S.busy = false; S.abort = null; render(); }
  }

  async function runAssistant(am, ctxMessages, mode, forceFallback) {
    const attempts = L.planAttempts({ mode: S.settings.demo ? "auto" : S.settings.routing, selected: S.settings.selected, providersState: S.settings.demo ? { demo: { configured: true, models: [{ id: "mock", provider: "demo" }] } } : provState(), task: mode === "code" ? S.task : "chat", allowFallback: S.settings.allowFallback || forceFallback });
    if (!attempts.length) { am.content = ""; am.error = { type: "invalid_key", message: "No provider is configured. Add an API key in Settings (or use the server keys)." }; am.streaming = false; await saveMsg(am); return; }
    const promptText = ctxMessages.map((m) => m.content).join("\n");
    let raf = 0; const paint = () => { raf = 0; if (!am.streaming) return; const el = document.querySelector('[data-mid="' + am.id + '"] .bubble'); if (el) { el.innerHTML = renderContent(am) + '<span class="gen"><i></i><i></i><i></i></span>'; } scrollEnd(false); };
    try {
      const { result, attempt, failures } = await L.runWithFallback(attempts, async (a) => {
        am.content = ""; am.error = null; am.provider = a.provider; am.model = a.model; S.lastUsed = a; updateChip();
        return callOnce(a, ctxMessages, { signal: S.abort.signal, onDelta: (d) => { am.content += d; if (!raf) raf = requestAnimationFrame(paint); } });
      }, { onAttempt: (a, i) => { if (i > 0) toast("Trying " + a.provider + " …"); } });
      am.content = result.text; am.provider = attempt.provider; am.model = attempt.model; am.usage = result.usage || null; am.estTokens = L.estimateTokens(result.text);
      am.fellBack = failures.length ? failures.map((f) => f.attempt.provider + ": " + L.ERROR_LABEL[f.error.type]).join("; ") : "";
      addUsage(attempt.provider, result.usage, promptText, result.text);
    } catch (e) {
      if (e.type === "aborted") { am.stopped = true; if (!am.content) am.error = { type: "aborted", message: "Stopped" }; }
      else am.error = { type: e.type || "server", message: e.message || "Failed", retryAfter: e.retryAfter, tried: (e.failures || []).map((f) => f.attempt.provider).join(", ") };
    }
    // The user's message stays saved in the chat, so a failed request never loses it; Retry re-sends it.
    am.streaming = false; await saveMsg(am);
  }

  async function regenerate(forceFallback) {
    if (S.busy || !S.cur) return;
    const lastIdx = S.msgs.length - 1; if (lastIdx < 0) return;
    if (S.msgs[lastIdx].role === "assistant") { await DB.del("messages", S.msgs[lastIdx].id); S.msgs.pop(); }
    if (!S.msgs.length || S.msgs[S.msgs.length - 1].role !== "user") return;
    S.busy = true; render();
    try {
      const chat = S.cur; const mode = chat.mode;
      const ctx = L.buildContext(chat, S.msgs.filter((m) => !m.error), { mode, task: S.task, budgetTokens: 6000 });
      const am = mkMsg(chat.id, "assistant", "", { streaming: true }); S.msgs.push(am); S.abort = new AbortController(); render(); scrollEnd(true);
      await runAssistant(am, ctx.messages, mode, !!forceFallback);
    } catch (e) { toast(e.message || "Failed", true); }
    finally { S.busy = false; S.abort = null; render(); }
  }

  /* ---------------- files from chat ---------------- */
  function chatFiles() {
    const map = new Map();
    for (const m of S.msgs) if (m.role === "assistant" && !m.error) for (const f of L.extractFiles(m.content || "")) map.set(f.path, f);
    return Array.from(map.values());
  }
  async function saveToFiles(list) {
    const existing = new Set((await DB.all("files")).map((f) => f.path));
    let n = 0;
    for (const f of list) {
      const path = L.dedupeName(L.sanitizePath(f.path) || "file.txt", existing); existing.add(path);
      await DB.put("files", { id: uid(), path, lang: f.lang || "", content: f.content, size: new Blob([f.content]).size, chatId: S.cur ? S.cur.id : null, created: now() }); n++;
    }
    toast(n + " file(s) saved to Saved Files");
  }

  /* ---------------- rendering ---------------- */
  function scrollEnd(force) { const m = $("#main"); if (!m) return; if (force || m.scrollHeight - m.scrollTop - m.clientHeight < 160) m.scrollTop = m.scrollHeight; }
  function closeDrawer() { $("#drawer").hidden = true; }
  function setNav() { document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === S.view)); }

  function msgHtml(m) {
    const who = m.role === "user" ? "You" : (m.provider ? m.provider + " · " + m.model : "Assistant");
    let body = "";
    if (m.role === "user") { body = "<p>" + esc(m.content).replace(/\n/g, "<br>") + "</p>"; (m.attachments || []).forEach((a) => (body += '<span class="att">' + ic("clip", 13) + " " + esc(a.name) + " (" + L.fmtSize(a.size) + ")</span>")); }
    else body = renderContent(m);
    if (m.streaming) body += '<span class="gen"><i></i><i></i><i></i></span>';
    let err = "";
    if (m.error && m.error.type !== "aborted") {
      err = '<div class="errtxt"><b>' + esc(L.ERROR_LABEL[m.error.type] || "Error") + "</b> — " + esc(m.error.message) + (m.error.retryAfter ? " (retry after " + esc(m.error.retryAfter) + "s)" : "") + (m.error.tried ? " · tried: " + esc(m.error.tried) : "") + "</div>";
    }
    const tok = m.role === "assistant" && !m.streaming && m.content ? (m.usage && m.usage.total_tokens ? "tokens (provider-reported): " + m.usage.total_tokens : "≈ " + (m.estTokens || L.estimateTokens(m.content)) + " tokens (estimated)") : "";
    const acts = m.role === "assistant" && !m.streaming ? '<div class="acts">' + (m.content ? '<button class="btn small" data-act="copymsg" data-id="' + m.id + '">' + ic("copy", 14) + ' Copy</button>' : "") + (m.error || m.stopped || m.content ? '<button class="btn small" data-act="regen">' + ic("refresh", 14) + ' Regenerate</button>' : "") + (m.error && m.error.type !== "aborted" ? '<button class="btn small" data-act="regenfb">Retry with other provider</button>' : "") + "</div>" : "";
    return '<div class="msg ' + m.role + '" data-mid="' + m.id + '"><div class="meta">' + esc(who) + "<span>" + new Date(m.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + "</span>" + (tok ? "<span>" + esc(tok) + "</span>" : "") + (m.stopped ? "<span>stopped</span>" : "") + (m.fellBack ? '<span class="warnt">fallback used (' + esc(m.fellBack) + ")</span>" : "") + '</div><div class="bubble' + (m.error && m.error.type !== "aborted" ? " err" : "") + '">' + body + err + "</div>" + acts + "</div>";
  }

  function chatView(mode) {
    const files = mode === "code" ? chatFiles() : [];
    let h = "";
    if (S.cur && S.cur.mode !== mode) { /* shouldn't happen: openChat switches view */ }
    if (mode === "code") {
      h += '<div class="row toolbar">' + ["generate", "explain", "debug", "refactor", "review"].map((t) => '<button class="pill' + (S.task === t ? " on" : "") + '" data-act="task" data-t="' + t + '">' + { generate: "Generate", explain: "Explain", debug: "Debug", refactor: "Refactor", review: "Review" }[t] + "</button>").join("") +
        '<button class="pill" data-act="togglefiles">Files (' + files.length + ")</button></div>";
      if (S.showFiles) {
        h += '<div class="card"><h3>Files in this chat</h3>' + (files.length ? files.map((f, i) => '<div class="filerow"><span class="nm">' + esc(f.path) + '</span><span class="muted">' + L.fmtSize(new Blob([f.content]).size) + '</span><button class="btn small" data-act="dlchatfile" data-i="' + i + '">' + ic("download", 16) + '</button></div>').join("") + '<div class="row" style="margin-top:8px"><button class="btn primary small" data-act="zipchat">Download ZIP</button><button class="btn small" data-act="savechat">Save all</button></div><p class="muted">Latest version of each file named in the AI answers. Files are only listed if the AI gave them a file name.</p>' : '<p class="muted">No named files yet. Ask for code; each file the AI names appears here and can be downloaded as a ZIP.</p>') + "</div>";
      }
    }
    const notesOn = S.cur && S.cur.notes && S.cur.notes.trim();
    h += '<div class="row" style="margin-bottom:4px"><button class="pill' + (notesOn ? " on" : "") + '" data-act="notes">' + ic("pin", 15) + ' Project notes' + (notesOn ? " ✓" : "") + "</button>" + (S.cur ? '<button class="pill" data-act="rename">' + ic("edit", 15) + ' Rename</button>' : "") + "</div>";
    if (!S.msgs.length) h += '<div class="hero"><div class="orb">' + ic("spark", 30) + "</div><h2>" + (mode === "code" ? "What are we building?" : "How can I help today?") + "</h2><p>" + (mode === "code" ? "Describe what to build, or paste code to explain, debug, refactor or review." : "Ask anything. Each chat keeps its own separate memory.") + "</p></div>";
    h += S.msgs.map(msgHtml).join("");
    const key = mode === "code" ? "code" : "chat";
    h += '<div class="composer">' + (S.pendingAtt.length ? '<div style="margin-bottom:6px">' + S.pendingAtt.map((a, i) => '<span class="att">' + ic("clip", 13) + " " + esc(a.name) + ' <a href="#" data-act="rmatt" data-i="' + i + '" aria-label="Remove">' + ic("x", 12) + "</a></span>").join("") + "</div>" : "") +
      '<div class="row"><button class="icon-btn" data-act="attach" aria-label="Attach text file">' + ic("clip", 20) + '</button><div class="grow"><textarea id="input" rows="1" placeholder="' + (mode === "code" ? "Describe the code or paste it here…" : "Message…") + '">' + esc(S.drafts[key]) + "</textarea></div>" +
      (S.busy ? '<button class="send stop" data-act="stop" aria-label="Stop">' + ic("stop", 18) + "</button>" : '<button class="send" data-act="send" aria-label="Send">' + ic("send", 20) + "</button>") + '</div><input type="file" id="fileIn" hidden></div>';
    return h;
  }

  function filesView() {
    return '<div class="card"><h3>Saved Files</h3><p class="muted">Files you saved from AI answers. Stored on this device only.</p><div id="filesList" class="muted">Loading…</div></div>';
  }
  async function fillFiles() {
    const list = (await DB.all("files")).sort((a, b) => b.created - a.created); const el = $("#filesList"); if (!el) return;
    if (!list.length) { el.innerHTML = '<div class="empty">No saved files yet.<br>Use “Save” on a code block.</div>'; return; }
    el.innerHTML = list.map((f) => '<div class="filerow"><span class="nm" title="' + esc(f.path) + '">' + esc(f.path) + '</span><span class="muted">' + L.fmtSize(f.size) + '</span><button class="btn small" data-act="viewfile" data-id="' + f.id + '">View</button><button class="btn small" data-act="dlfile" data-id="' + f.id + '" aria-label="Download">' + ic("download", 16) + '</button><button class="btn small" data-act="sharefile" data-id="' + f.id + '">Share</button><button class="btn small danger" data-act="delfile" data-id="' + f.id + '" aria-label="Delete">' + ic("x", 16) + '</button></div>').join("") +
      '<div class="row" style="margin-top:10px"><button class="btn primary" data-act="zipall">Download all as ZIP (' + list.length + ")</button></div>";
  }

  function historyView() {
    return '<div class="card"><input type="search" id="hq" placeholder="Search chats and messages…"><div id="hlist" class="chatlist" style="margin-top:8px"></div></div>' +
      '<div class="card"><h3>Your data</h3><p class="muted">Everything is stored on this device. Export or delete it any time.</p><div class="row"><button class="btn" data-act="exportall">Export all (JSON)</button><button class="btn danger" data-act="wipe">Delete all data</button></div></div>';
  }
  let hqT;
  async function fillHistory(q) {
    const el = $("#hlist"); if (!el) return; q = (q || "").trim().toLowerCase();
    let list = S.chats.slice();
    if (q) {
      const msgs = await DB.all("messages"); const hit = new Set(msgs.filter((m) => (m.content || "").toLowerCase().includes(q)).map((m) => m.chatId));
      list = list.filter((c) => c.title.toLowerCase().includes(q) || hit.has(c.id));
    }
    el.innerHTML = list.length ? list.map((c) => '<div class="row" style="margin:4px 0"><button class="ci grow' + (S.cur && S.cur.id === c.id ? " on" : "") + '" data-act="open" data-id="' + c.id + '">' + '<span class="ci-i">' + ic(c.mode === "code" ? "code" : "chat", 16) + "</span>" + esc(c.title) + "<small>" + new Date(c.updated).toLocaleString() + "</small></button><button class=\"btn small\" data-act=\"exportchat\" data-id=\"" + c.id + '" aria-label="Export">' + ic("download", 16) + '</button><button class="btn small danger" data-act="delchat" data-id="' + c.id + '" aria-label="Delete">' + ic("x", 16) + '</button></div>').join("") : '<div class="empty">' + (q ? "No matches." : "No chats yet.") + "</div>";
  }

  /* ---- Settings: home list + sub-pages ---- */
  const row = (page, icon, title, sub, extra) => '<button class="set-row" data-act="spage" data-p="' + page + '"><span class="set-ic">' + ic(icon, 20) + '</span><span class="set-tx"><b>' + title + '</b><small>' + sub + '</small></span>' + (extra || "") + '<span class="set-ch">' + ic("chevron", 18) + '</span></button>';
  const sw = (id, label, on, extra) => '<label class="switch"><span class="sw-l">' + label + '</span><input type="checkbox" id="' + id + '"' + (on ? " checked" : "") + (extra || "") + '></label>';
  function pageHead(title, backAct, backP, sub) {
    return '<div class="page-head"><button class="icon-btn" data-act="' + backAct + '"' + (backP ? ' data-p="' + backP + '"' : "") + ' aria-label="Back">' + ic("back", 20) + '</button><div><h2>' + title + '</h2>' + (sub ? '<p class="muted">' + sub + '</p>' : "") + '</div></div>';
  }
  function settingsView() {
    const sp = S.sp;
    const man = S.settings.routing === "manual";
    const readyN = PIDS.filter((p) => S.prov[p].configured).length;
    const sOk = !!(BACKEND && S.session);
    if (!sp) {
      const who = !BACKEND ? "Backend not configured" : S.session ? esc(S.session.email || "Signed in") : "Not signed in";
      let h = '<div class="set-hero"><span class="logo big">' + ic("spark", 24) + '</span><div><h2>AI Studio</h2><p class="muted">' + who + '</p></div></div>';
      h += '<div class="set-group"><div class="set-gt">General</div>' +
        row("account", "user", "Account", sOk ? "Signed in" : "Sign in or create account", '<span class="dot ' + (sOk ? "ok" : "off") + '"></span>') +
        row("appearance", "palette", "Appearance &amp; mode", (S.settings.theme === "light" ? "Light" : "Dark") + " theme" + (S.settings.demo ? " · Demo on" : "")) + "</div>";
      h += '<div class="set-group"><div class="set-gt">AI</div>' +
        row("models", "cpu", "Model &amp; routing", man ? "Manual" + (S.settings.selected.model ? " · " + esc(S.settings.selected.model) : "") : "Auto with fallback") +
        row("providers", "plug", "Providers &amp; API keys", readyN + " of " + PIDS.length + " ready") + "</div>";
      h += '<div class="set-group"><div class="set-gt">Data</div>' +
        row("data", "shield", "Privacy &amp; data", "Keys, export, delete") +
        row("about", "info", "About", "Version and limits") + "</div>";
      return h;
    }
    if (sp === "account") {
      let h = pageHead("Account", "spage", "", "Needed to use the server keys through your proxy");
      h += '<div class="card">' + (!BACKEND ? '<p class="warnt">Backend not configured. Fill <code>config.js</code> (see README). Until then only Demo mode works.</p>' :
        S.session ? '<p class="ok">Signed in as ' + esc(S.session.email || "user") + '</p><button class="btn" data-act="signout">Sign out</button>' :
          '<input type="email" id="em" placeholder="Email" autocomplete="email"><div style="height:8px"></div><input type="password" id="pw" placeholder="Password (min 6)" autocomplete="current-password"><div class="row" style="margin-top:10px"><button class="btn primary" data-act="signin">Sign in</button><button class="btn" data-act="signup">Create account</button></div>') + "</div>";
      return h;
    }
    if (sp === "appearance") {
      let h = pageHead("Appearance &amp; mode", "spage");
      h += '<div class="card"><h3>Theme</h3><div class="seg"><button class="' + (S.settings.theme !== "light" ? "on" : "") + '" data-act="theme" data-v="dark">Dark</button><button class="' + (S.settings.theme === "light" ? "on" : "") + '" data-act="theme" data-v="light">Light</button></div></div>';
      h += '<div class="card">' + sw("demo", "Demo mode <small>Mock replies, no AI is called</small>", S.settings.demo) +
        (window.showSaveFilePicker ? sw("askloc", "Ask where to save files <small>Desktop browsers</small>", S.settings.askLocation) : '<p class="muted">Downloads go to your browser\'s download folder. On Android, Chrome → Settings → Downloads → “Ask where to save files” lets you pick the location.</p>') + "</div>";
      return h;
    }
    if (sp === "models") {
      const opts = PIDS.filter((p) => S.prov[p].models.length);
      let h = pageHead("Model &amp; routing", "spage", "", "Choose how a model is picked for each message");
      h += '<div class="card"><div class="seg"><button class="' + (!man ? "on" : "") + '" data-act="routing" data-v="auto">Auto</button><button class="' + (man ? "on" : "") + '" data-act="routing" data-v="manual">Manual</button></div>' +
        '<p class="muted" style="margin-top:10px">' + (man ? "Your chosen model is used." : "Auto picks a suitable model from your configured providers and falls back to another provider on temporary errors.") + "</p></div>";
      if (man) {
        const sel = S.settings.selected.provider;
        h += '<div class="card"><h3>Your model</h3><select id="selp"><option value="">Provider…</option>' + opts.map((p) => '<option value="' + p + '"' + (sel === p ? " selected" : "") + ">" + esc(L.PROVIDERS[p].name) + "</option>").join("") + "</select><div style='height:8px'></div>" +
          '<select id="selm"><option value="">Model…</option>' + (sel && S.prov[sel] ? S.prov[sel].models.map((m) => '<option value="' + esc(m.id) + '"' + (S.settings.selected.model === m.id ? " selected" : "") + ">" + esc(m.id) + (m.free ? " (free)" : "") + "</option>").join("") : "") + "</select>" +
          sw("fb", "Auto fallback <small>If it fails, try another provider</small>", S.settings.allowFallback) + "</div>";
      }
      return h;
    }
    if (sp === "providers") {
      if (S.pp && L.PROVIDERS[S.pp]) {
        const p = S.pp, st = S.prov[p], u = S.usage[p] || { reported: 0, estimated: 0, requests: 0 };
        let h = pageHead(esc(L.PROVIDERS[p].name), "ppage", "", '<span class="' + (st.configured ? "ok" : "muted") + '">' + (st.configured ? "● available (" + (st.keySource === "user" ? "your key" : "server key") + ")" : "○ no key") + "</span>");
        h += '<div class="card"><p class="muted">' + esc(L.PROVIDERS[p].note) + "</p>" + (st.error ? '<p class="errtxt">' + esc(st.error) + "</p>" : "") +
          '<div class="stats"><div><b>' + st.models.length + '</b><small>Models</small></div><div><b>' + u.requests + '</b><small>Requests</small></div><div><b>' + u.reported + '</b><small>Tokens reported</small></div><div><b>≈' + u.estimated + '</b><small>Tokens est.</small></div></div></div>';
        h += '<div class="card">' + sw("", "Use in Auto mode", S.settings.enabled[p] !== false, ' data-act="penable" data-p="' + p + '"') +
          (st.models.length ? '<select data-act="ppref" data-p="' + p + '"><option value="">Preferred model (optional)</option>' + st.models.map((m) => '<option value="' + esc(m.id) + '"' + (S.settings.preferred[p] === m.id ? " selected" : "") + ">" + esc(m.id) + "</option>").join("") + "</select>" : "") + "</div>";
        h += '<div class="card"><h3>Your own API key</h3><input type="password" data-key="' + p + '" placeholder="' + (S.byok[p] ? "Key saved on this device" : "Paste key (optional)") + '" autocomplete="off"><div class="row" style="margin-top:10px"><button class="btn small primary" data-act="savekey" data-p="' + p + '">Save key</button>' + (S.byok[p] ? '<button class="btn small danger" data-act="rmkey" data-p="' + p + '">Remove key</button>' : "") + '</div><p class="muted" style="margin-top:8px">Tick the consent box in Privacy &amp; data before saving a key.</p></div>';
        return h;
      }
      let h = pageHead("Providers &amp; API keys", "spage", "", "Limits are set by each provider and change often");
      h += '<div class="row" style="margin:0 0 6px"><button class="btn small" data-act="refresh">' + ic("refresh", 14) + " Refresh status &amp; models</button></div>";
      h += '<div class="set-group">' + PIDS.map((p) => { const st = S.prov[p]; return '<button class="set-row" data-act="popen" data-p="' + p + '"><span class="set-ic av">' + esc(L.PROVIDERS[p].name.charAt(0)) + '</span><span class="set-tx"><b>' + esc(L.PROVIDERS[p].name) + "</b><small>" + (st.configured ? (st.keySource === "user" ? "Your key" : "Server key") + " · " + st.models.length + " models" : "No key") + '</small></span><span class="dot ' + (st.configured ? "ok" : "off") + '"></span><span class="set-ch">' + ic("chevron", 18) + "</span></button>"; }).join("") + "</div>";
      return h;
    }
    if (sp === "data") {
      let h = pageHead("Privacy &amp; data", "spage");
      h += '<div class="card"><p class="muted">If you add your own key it is stored only in this browser (not encrypted by the app) and is sent to the proxy with each request, which forwards it to that provider without storing or logging it. Use it only on a device you trust. Server keys never reach this app.</p>' + sw("consent", "I agree to store my own API keys on this device", S.settings.consent) + "</div>";
      h += '<div class="card"><h3>Your data</h3><p class="muted">Chats and files stay on this device.</p><div class="row"><button class="btn" data-act="exportall">Export all data</button><button class="btn danger" data-act="wipe">Delete all data &amp; keys</button></div></div>';
      return h;
    }
    return pageHead("About", "spage") + '<div class="card"><p class="muted">AI Studio core stage: chat, coding workspace, saved files, history, provider routing. Photo Studio and ZIP project analyzer are planned next stages and not available yet. Generated code has not been run or tested by this app.</p></div>';
  }

  function placeholderView(kind) {
    const t = kind === "photo" ? [ic("image", 34), "Photo Studio", "Planned for stage 3. It needs an image-editing API (for example an image model through your provider); text-only models cannot edit images, so this will only be enabled for providers that really support it."] :
      [ic("archive", 34), "Projects & ZIP Analyzer", "Planned for stage 2: safe ZIP upload (path-traversal and zip-bomb limits), file tree, project index, change proposals and a revised ZIP download. For now you can attach single text files in Chat/Code and download multi-file answers as a ZIP."];
    return '<div class="empty"><div class="orb">' + t[0] + "</div><h3>" + t[1] + '</h3><p>' + t[2] + '</p><span class="tag">not available yet</span></div>';
  }

  function render() {
    applyTheme(); setNav(); updateChip();
    const main = $("#main"); if (!main) return;
    const keep = document.activeElement && document.activeElement.id === "input";
    const prevScroll = S._lastView === S.view ? main.scrollTop : 0;
    S._lastView = S.view;
    $("#banner").hidden = !(S.settings.demo || !BACKEND);
    $("#banner").textContent = S.settings.demo ? "DEMO MODE: replies are mock text, no AI provider is called." : "Backend not configured yet — open Settings, or turn on Demo mode to try the interface.";
    const titles = { chat: "AI Chat", code: "Coding Workspace", files: "Saved Files", history: "Chat History", settings: "Settings", photo: "Photo Studio", projects: "Projects & ZIP" };
    $("#topTitle").textContent = (S.view === "chat" || S.view === "code") && S.cur ? S.cur.title : titles[S.view];
    if (S.view === "chat" || S.view === "code") main.innerHTML = chatView(S.view);
    else if (S.view === "files") { main.innerHTML = filesView(); fillFiles(); }
    else if (S.view === "history") { main.innerHTML = historyView(); fillHistory(""); }
    else if (S.view === "settings") main.innerHTML = settingsView();
    else main.innerHTML = placeholderView(S.view);
    if (S.view !== "chat" && S.view !== "code") main.scrollTop = prevScroll;
    drawerList();
    if (S.view === "chat" || S.view === "code") { const ta = $("#input"); if (ta) { autosize(ta); if (keep) ta.focus(); } main.scrollTop = prevScroll; }
  }
  function drawerList() {
    const mode = S.view === "code" ? "code" : "chat";
    const l = S.chats.filter((c) => c.mode === mode);
    $("#drawerList").innerHTML = l.length ? l.slice(0, 60).map((c) => '<button class="ci' + (S.cur && S.cur.id === c.id ? " on" : "") + '" data-act="open" data-id="' + c.id + '">' + esc(c.title) + "<small>" + new Date(c.updated).toLocaleDateString() + "</small></button>").join("") : '<div class="muted" style="padding:8px">No ' + mode + " chats yet.</div>";
  }
  function autosize(ta) { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, window.innerHeight * 0.4) + "px"; }

  /* ---------------- events ---------------- */
  async function exportAll() {
    const chats = await DB.all("chats"), messages = await DB.all("messages"), files = await DB.all("files");
    const data = JSON.stringify({ exportedAt: new Date().toISOString(), app: "ai-studio", chats, messages, files, usage: S.usage }, null, 2);
    saveBlob("ai-studio-export-" + new Date().toISOString().slice(0, 10) + ".json", data, "application/json");
  }
  const fileById = async (id) => DB.get("files", id);

  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el) return;
    const a = el.dataset.act;
    if (el.tagName === "A") ev.preventDefault();
    try {
      switch (a) {
        case "drawer": $("#drawer").hidden = !$("#drawer").hidden; break;
        case "goto": { closeDrawer(); const v = el.dataset.view; if ((v === "chat" || v === "code") && S.view !== v) { S.view = v; if (!S.cur || S.cur.mode !== v) { S.cur = null; S.msgs = []; S.draftMode = v; } } else { S.view = v; if (v === "settings") { S.sp = el.id === "modelChip" ? "models" : null; S.pp = null; S._lastView = null; } } render(); break; }
        case "spage": S.sp = el.dataset.p || null; S.pp = null; S._lastView = null; render(); break;
        case "popen": S.pp = el.dataset.p; S._lastView = null; render(); break;
        case "ppage": S.pp = null; S._lastView = null; render(); break;
        case "theme": S.settings.theme = el.dataset.v; saveSettings(); render(); break;
        case "newchat": newChat(); break;
        case "open": await openChat(el.dataset.id); break;
        case "task": S.task = el.dataset.t; if (S.cur) { S.cur.task = S.task; DB.put("chats", S.cur); } render(); break;
        case "togglefiles": S.showFiles = !S.showFiles; render(); break;
        case "send": { const ta = $("#input"); await send(ta ? ta.value : ""); break; }
        case "stop": if (S.abort) S.abort.abort(); break;
        case "regen": await regenerate(false); break;
        case "regenfb": await regenerate(true); break;
        case "copymsg": { const m = S.msgs.find((x) => x.id === el.dataset.id); if (m) { await navigator.clipboard.writeText(m.content); toast("Copied"); } break; }
        case "copycode": { const c = CODE_CACHE[el.dataset.key]; if (c) { try { await navigator.clipboard.writeText(c.code); toast("Code copied"); } catch (e) { toast("Copy blocked by browser. Long-press the code to select it.", true); } } break; }
        case "dlcode": { const c = CODE_CACHE[el.dataset.key]; if (c) saveBlob(c.name, c.code, "text/plain"); break; }
        case "savecode": { const c = CODE_CACHE[el.dataset.key]; if (c) await saveToFiles([{ path: c.name, lang: c.lang, content: c.code }]); break; }
        case "dlchatfile": { const f = chatFiles()[Number(el.dataset.i)]; if (f) saveBlob(f.path, f.content, "text/plain"); break; }
        case "zipchat": { const f = chatFiles(); if (f.length) saveBlob(((S.cur && S.cur.title) || "project").replace(/[^\w\-]+/g, "_").slice(0, 40) + ".zip", zipBlobFor(f), "application/zip"); break; }
        case "savechat": await saveToFiles(chatFiles()); break;
        case "attach": $("#fileIn").click(); break;
        case "rmatt": S.pendingAtt.splice(Number(el.dataset.i), 1); render(); break;
        case "notes": openNotes(); break;
        case "savenotes": { const v = $("#notesTa").value; if (!S.cur) await ensureChat("Project"); S.cur.notes = v; await DB.put("chats", S.cur); closeSheet(); toast("Notes pinned to this chat"); render(); break; }
        case "rename": { const t = prompt("Rename chat", S.cur.title); if (t && t.trim()) { S.cur.title = t.trim().slice(0, 80); await DB.put("chats", S.cur); render(); } break; }
        case "closesheet": closeSheet(); break;
        case "open-history": break;
        case "delchat": { const c = S.chats.find((x) => x.id === el.dataset.id); if (c && confirm('Delete "' + c.title + '" and its messages? This cannot be undone.')) { const ms = await DB.byChat(c.id); for (const m of ms) await DB.del("messages", m.id); await DB.del("chats", c.id); S.chats = S.chats.filter((x) => x.id !== c.id); if (S.cur && S.cur.id === c.id) { S.cur = null; S.msgs = []; } render(); toast("Chat deleted"); } break; }
        case "exportchat": { const c = S.chats.find((x) => x.id === el.dataset.id); const ms = await DB.byChat(c.id); saveBlob((c.title.replace(/[^\w\-]+/g, "_") || "chat") + ".json", JSON.stringify({ chat: c, messages: ms }, null, 2), "application/json"); break; }
        case "exportall": await exportAll(); break;
        case "wipe": if (confirm("Delete ALL chats, files, usage counts and saved keys on this device?")) { await DB.clear(); ["usage", "byok"].forEach((k) => localStorage.removeItem(k)); PIDS.forEach((p) => localStorage.removeItem("models_" + p)); S.byok = {}; S.usage = {}; S.chats = []; S.cur = null; S.msgs = []; PIDS.forEach((p) => (S.prov[p].models = [])); render(); toast("All local data deleted"); } break;
        case "viewfile": { const f = await fileById(el.dataset.id); if (f) sheet('<h3>' + esc(f.path) + '</h3><div class="cb"><div class="cb-b"><pre><code>' + esc(f.content) + '</code></pre></div></div><button class="btn block" data-act="closesheet">Close</button>'); break; }
        case "dlfile": { const f = await fileById(el.dataset.id); if (f) saveBlob(f.path, f.content, "text/plain"); break; }
        case "sharefile": { const f = await fileById(el.dataset.id); if (f) shareFile(f.path, f.content, "text/plain"); break; }
        case "delfile": if (confirm("Delete this saved file?")) { await DB.del("files", el.dataset.id); fillFiles(); } break;
        case "zipall": { const all = await DB.all("files"); if (all.length) saveBlob("saved-files.zip", zipBlobFor(all), "application/zip"); break; }
        case "routing": S.settings.routing = el.dataset.v; saveSettings(); render(); break;
        case "refresh": toast("Refreshing…"); await refreshStatus(); await loadAllModels(true); break;
        case "savekey": {
          const inp = document.querySelector('input[data-key="' + el.dataset.p + '"]'); const v = inp && inp.value.trim(); if (!v) { toast("Enter a key first", true); break; }
          if (!S.settings.consent) { toast("Tick the consent box below first", true); break; }
          S.byok[el.dataset.p] = v; lsSet("byok", S.byok); toast("Key saved on this device. Checking…"); await refreshStatus(); await loadModels(el.dataset.p, true); render(); break; }
        case "rmkey": delete S.byok[el.dataset.p]; lsSet("byok", S.byok); await refreshStatus(); render(); toast("Key removed"); break;
        case "signin": case "signup": {
          const em = $("#em").value.trim(), pw = $("#pw").value; if (!em || pw.length < 6) { toast("Enter email and a password of 6+ characters", true); break; }
          try {
            const j = a === "signin" ? await authCall("token?grant_type=password", { email: em, password: pw }) : await authCall("signup", { email: em, password: pw });
            if (j.access_token) { setSession(j); toast("Signed in"); await refreshStatus(); await loadAllModels(); render(); } else toast("Account created. Check your email to confirm, then sign in.");
          } catch (e) { toast(e.message, true); } break; }
        case "signout": setSession(null); PIDS.forEach((p) => { S.prov[p].configured = false; }); render(); break;
      }
    } catch (e) { toast((e && e.message) || "Action failed", true); }
  });

  document.addEventListener("change", async (ev) => {
    const t = ev.target;
    if (t.id === "thm") { S.settings.theme = t.checked ? "light" : "dark"; saveSettings(); applyTheme(); }
    else if (t.id === "demo") { S.settings.demo = t.checked; saveSettings(); render(); }
    else if (t.id === "askloc") { S.settings.askLocation = t.checked; saveSettings(); }
    else if (t.id === "fb") { S.settings.allowFallback = t.checked; saveSettings(); }
    else if (t.id === "consent") { S.settings.consent = t.checked; if (!t.checked) { S.byok = {}; localStorage.removeItem("byok"); toast("Stored keys removed"); } saveSettings(); render(); }
    else if (t.id === "selp") { S.settings.selected = { provider: t.value, model: "" }; saveSettings(); render(); }
    else if (t.id === "selm") { S.settings.selected.model = t.value; saveSettings(); updateChip(); }
    else if (t.dataset && t.dataset.act === "penable") { S.settings.enabled[t.dataset.p] = t.checked; saveSettings(); }
    else if (t.dataset && t.dataset.act === "ppref") { S.settings.preferred[t.dataset.p] = t.value || null; saveSettings(); }
    else if (t.id === "fileIn" && t.files && t.files[0]) {
      const f = t.files[0]; t.value = "";
      if (f.size > MAX_ATTACH) { toast("File too large (max " + L.fmtSize(MAX_ATTACH) + ")", true); return; }
      try {
        const text = await f.text();
        if (text.includes("\u0000")) { toast("Binary files are not supported as text attachments", true); return; }
        S.pendingAtt.push({ name: f.name, size: f.size, text }); render();
      } catch (e) { toast("Could not read file", true); }
    }
  });
  document.addEventListener("input", (ev) => {
    const t = ev.target;
    if (t.id === "input") { S.drafts[S.view === "code" ? "code" : "chat"] = t.value; autosize(t); }
    else if (t.id === "hq") { clearTimeout(hqT); hqT = setTimeout(() => fillHistory(t.value), 200); }
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.target.id === "input" && ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send(ev.target.value); }
    if (ev.key === "Escape") { closeSheet(); closeDrawer(); }
  });

  function openNotes() {
    sheet('<h3>Project notes</h3><p class="muted">Requirements, stack and decisions pinned to <b>this chat only</b>. They are sent with every message in this chat.</p><textarea id="notesTa" rows="8" placeholder="e.g. Android app, Kotlin, no external libraries…">' + esc(S.cur ? S.cur.notes || "" : "") + '</textarea><div class="row" style="margin-top:8px"><button class="btn primary" data-act="savenotes">Pin to chat</button><button class="btn" data-act="closesheet">Cancel</button></div>');
  }

  /* ---------------- init ---------------- */
  async function init() {
    applyTheme();
    try { await loadChats(); } catch (e) { toast("Local storage unavailable: " + e.message, true); }
    render();
    if (BACKEND && S.session) { await refreshStatus(); await loadAllModels(); }
  }
  init();
  window.__app = { S, L }; // for debugging/tests
})();
