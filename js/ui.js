/* ==========================================================================
   Study Buddy — shared UI helpers: icons, shell (header / tab bar), toasts,
   dialogs, skeletons, empty states, validators.
   Rule used everywhere: any text that comes from the database or the user
   is passed through esc() (or set with textContent) before it reaches the DOM.
   ========================================================================== */

import { supabase, isConfigured, getSession, getProfile } from './supabase.js';

/* ---------- tiny DOM helpers ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function clampNum(v, min, max, fallback = 0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export const validators = {
  email: (v) => v.length <= 254 && /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v),
  username: (v) => /^[a-z0-9_]{3,20}$/.test(v),
  password: (v) => v.length >= 8 && v.length <= 72 && /[A-Za-z]/.test(v) && /\d/.test(v),
  fullName: (v) => v.length >= 2 && v.length <= 80,
};

export function friendlyError(err) {
  const msg = (err && (err.message || err.error_description)) || 'Something went wrong. Please try again.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Network problem. Check your internet connection and try again.';
  if (/JWT expired|not authenticated/i.test(msg)) return 'Your session expired. Please log in again.';
  if (/row-level security|permission denied/i.test(msg)) return 'You do not have permission to do that.';
  return msg;
}

/* ---------- icons ---------- */
/* Navigation icons follow the Lucide style (24px grid, 1.8 stroke, round caps).
   Subject / feature icons are custom duotone SVGs drawn for Study Buddy. */
const ICONS = {
  // navigation (Lucide-style)
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="m9 16 2 2 4-4"/>',
  chart: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-9"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20a7 7 0 0 1 14 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 5 3.5-5 3.5z" fill="currentColor"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  // custom duotone icons
  physics: '<ellipse cx="12" cy="12" rx="9.5" ry="3.8" fill="currentColor" fill-opacity=".1"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9.5" ry="3.8" transform="rotate(120 12 12)"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>',
  chemistry: '<path d="M9 3h6M10 3v6.2L4.6 18.4A2 2 0 0 0 6.3 21.5h11.4a2 2 0 0 0 1.7-3.1L14 9.2V3" fill="currentColor" fill-opacity=".12"/><path d="M7.5 15h9"/><circle cx="10.5" cy="18" r=".6" fill="currentColor"/><circle cx="14" cy="17.5" r=".6" fill="currentColor"/>',
  biology: '<path d="M20 4C10 4 4.5 8.5 4.5 14.5c0 2.3 1.2 4.3 3.2 5C14.500 19.700 20 15 20 4z" fill="currentColor" fill-opacity=".12"/><path d="M4 21c2-5 5.5-8.5 10-11"/>',
  botany: '<path d="M12 21v-9"/><path d="M12 12c0-4 2.500-6.500 7-7 0 4.500-2.500 7-7 7z" fill="currentColor" fill-opacity=".12"/><path d="M12 15c0-3-2-5-6-5.500 0 3.500 2 5.500 6 5.500z" fill="currentColor" fill-opacity=".12"/>',
  zoology: '<circle cx="6.500" cy="9.500" r="1.800"/><circle cx="11" cy="6" r="1.800"/><circle cx="16" cy="7" r="1.800"/><circle cx="19" cy="11" r="1.600"/><path d="M12.500 11.500c-3.200 0-6 3-6 5.300 0 1.900 1.700 2.600 3.200 2.300 1-.2 1.700-.6 2.800-.6s1.800.4 2.800.6c1.500.3 3.200-.4 3.200-2.300 0-2.300-2.800-5.300-6-5.300z" fill="currentColor" fill-opacity=".12"/>',
  quiz: '<rect x="4" y="3" width="16" height="18" rx="3" fill="currentColor" fill-opacity=".1"/><path d="M8 8h8M8 12h4"/><path d="m9 17 1.700 1.700L14.500 15"/>',
  progress: '<circle cx="12" cy="12" r="8.500" opacity=".25"/><path d="M12 3.500a8.500 8.500 0 0 1 8.500 8.500" stroke-width="2.400"/><path d="M12 12V8"/><path d="m12 12 3 2"/>',
  streak: '<path d="M12 3c1 3.500 5 5.500 5 10a5 5 0 0 1-10 0c0-2 1-3.200 2-4.200.3 1.200 1 2 1.800 2.400C10.500 8.500 11 5.500 12 3z" fill="currentColor" fill-opacity=".14"/><path d="M12 17.500a2 2 0 0 1-2-2c0-1 .8-1.800 2-3 1.200 1.200 2 2 2 3a2 2 0 0 1-2 2z"/>',
  revision: '<rect x="3" y="7" width="14" height="14" rx="2.500" fill="currentColor" fill-opacity=".1"/><path d="M7 3.500h11.500A2.500 2.500 0 0 1 21 6v11.500"/><path d="M7 14h6M7 17.500h3.500"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  sparkle: '<path d="M12 3l1.900 5.100L19 10l-5.100 1.900L12 17l-1.900-5.100L5 10l5.100-1.900z" fill="currentColor" fill-opacity=".14"/><path d="M19 16v4M17 18h4"/>',
};

export function icon(name, size = 20, cls = '') {
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

export function subjectIconName(slug) {
  return ({ physics: 'physics', chemistry: 'chemistry', botany: 'botany', zoology: 'zoology', biology: 'biology' })[slug] || 'book';
}

export const LOGO = `<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--primary)"/><path d="M7 10c3-1.500 6-1.500 9 1v11c-3-2.500-6-2.500-9-1zM25 10c-3-1.500-6-1.500-9 1v11c3-2.500 6-2.500 9-1z" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="23" cy="8" r="2.200" fill="#f59e0b"/></svg>`;

/* ---------- reusable fragments ---------- */
export function skeletonCards(n = 3) {
  return `<div class="grid grid-3" aria-busy="true" aria-label="Loading">${'<div class="skeleton-card"></div>'.repeat(n)}</div>`;
}
export function skeletonLines(n = 4) {
  const w = ['', 'w80', 'w60'];
  return `<div aria-busy="true" aria-label="Loading">${Array.from({ length: n }, (_, i) => `<div class="skeleton-line ${w[i % 3]}"></div>`).join('')}</div>`;
}

export function emptyState({ icon: ic = 'book', title, text = '', actionHtml = '' }) {
  return `<div class="empty-state"><div class="empty-icon">${icon(ic, 30)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${actionHtml}</div>`;
}

export function progressBar(pct, label = 'Progress', cls = '') {
  const v = Math.round(clampNum(pct, 0, 100));
  return `<div class="progress ${cls}" role="progressbar" aria-label="${esc(label)}" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><span class="progress-fill" style="width:${v}%"></span></div>`;
}

export function notice(type, html) {
  const ic = type === 'danger' ? 'alert' : type === 'success' ? 'check' : 'info';
  return `<div class="notice ${type}" role="${type === 'danger' ? 'alert' : 'status'}">${icon(ic, 20)}<div>${html}</div></div>`;
}

export function setBusy(btn, busy, busyText = 'Please wait…') {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = busyText;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}

/* ---------- toasts & dialogs ---------- */
export function toast(message, type = 'info', ms = 4200) {
  let region = $('#toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.setAttribute('aria-live', 'polite');
    document.body.append(region);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = message;
  region.append(t);
  setTimeout(() => {
    t.classList.add('toast-out');
    setTimeout(() => t.remove(), 320);
  }, ms);
}

export function confirmBox(message, { confirmText = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-label', 'Confirm');
    d.innerHTML = `<form method="dialog" class="modal-body">
      <h2 class="modal-title">Please confirm</h2><p class="confirm-msg"></p>
      <div class="modal-actions">
        <button value="cancel" class="btn btn-secondary">Cancel</button>
        <button value="ok" class="btn ${danger ? 'btn-danger' : 'btn-primary'}">${esc(confirmText)}</button>
      </div></form>`;
    $('.confirm-msg', d).textContent = message;
    d.addEventListener('close', () => { resolve(d.returnValue === 'ok'); d.remove(); });
    document.body.append(d);
    d.showModal();
  });
}

/* ---------- theme ---------- */
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('nb-theme', theme); } catch { /* private mode */ }
  const btn = $('#theme-toggle');
  if (btn) {
    btn.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon', 22);
    btn.setAttribute('aria-pressed', String(theme === 'dark'));
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

/* ---------- app shell ---------- */
const NAV = [
  { page: 'dashboard', href: 'dashboard.html', label: 'Home', icon: 'home' },
  { page: 'subjects', href: 'subjects.html', label: 'Study', icon: 'book' },
  { page: 'checkin', href: 'daily-checkin.html', label: 'Check-in', icon: 'calendar' },
  { page: 'progress', href: 'progress.html', label: 'Progress', icon: 'chart' },
  { page: 'doubts', href: 'doubts.html', label: 'Doubts', icon: 'chat' },
];

function renderHeader({ session, profile, page }) {
  const links = session
    ? NAV.concat(profile?.role === 'admin' ? [{ page: 'admin', href: 'admin.html', label: 'Admin', icon: 'shield' }] : [])
      .map((n) => `<a href="${n.href}" ${n.page === page ? 'aria-current="page"' : ''}>${icon(n.icon, 18)}${esc(n.label)}</a>`).join('')
    : '';
  const actions = session
    ? `<button id="logout-btn" class="btn btn-ghost btn-sm" type="button">${icon('logout', 18)}<span class="logout-label">Log out</span></button>`
    : `<a class="btn btn-ghost btn-sm" href="login.html">Log in</a><a class="btn btn-primary btn-sm" href="signup.html">Sign up</a>`;
  const host = $('#shell-header');
  if (!host) return;
  host.outerHTML = `<header class="site-header"><div class="container header-inner">
      <a class="brand" href="${session ? 'dashboard.html' : 'index.html'}" aria-label="Study Buddy home">${LOGO}<span>Study Buddy</span></a>
      <nav class="main-nav" aria-label="Primary">${links}</nav>
      <div class="header-actions">
        <button id="theme-toggle" class="icon-btn" type="button"></button>${actions}
      </div></div></header>`;
}

function renderTabbar({ session, page }) {
  const host = $('#shell-tabbar');
  if (!host) return;
  if (!session) { host.remove(); return; }
  document.body.classList.add('has-tabbar');
  host.outerHTML = `<nav class="tabbar" aria-label="Primary mobile">${NAV.map((n) =>
    `<a href="${n.href}" ${n.page === page ? 'aria-current="page"' : ''}>${icon(n.icon, 22)}<span>${esc(n.label)}</span></a>`).join('')}</nav>`;
}

function renderFooter() {
  if ($('.site-footer')) return;
  const f = document.createElement('footer');
  f.className = 'site-footer';
  f.innerHTML = `<div class="container"><p>Study Buddy is an independent study tool and is not affiliated with the NTA. Your notes, quiz answers and AI chats are visible only to you.</p></div>`;
  document.body.append(f);
}

function setupNeeded(main) {
  main.innerHTML = `<div class="auth-wrap">${notice('warn',
    `<strong>Supabase is not connected yet.</strong><p>Open <code>js/supabase.js</code>, paste your Project URL and anon key, then reload. The README explains where to find them.</p>`)}</div>`;
}

/**
 * Builds header / tab bar and enforces the page's access mode.
 * data-auth on <body>: "required" | "admin" | "optional" | "guest"
 * Returns { session, user, profile } or null when the page should stop.
 * NOTE: the 'admin' check here is only for friendly UX. Real admin
 * permissions are enforced by Row Level Security in the database.
 */
export async function initShell() {
  const page = document.body.dataset.page || '';
  const mode = document.body.dataset.auth || 'optional';
  const main = $('#main');

  if (!isConfigured) {
    renderHeader({ session: null, profile: null, page });
    renderTabbar({ session: null, page });
    setTheme(document.documentElement.getAttribute('data-theme') || 'light');
    $('#theme-toggle')?.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
    renderFooter();
    if (mode !== 'optional' && main) { setupNeeded(main); return null; }
    return { session: null, user: null, profile: null };
  }

  const session = await getSession();
  if (!session && (mode === 'required' || mode === 'admin')) {
    const here = location.pathname.split('/').pop() + location.search;
    location.replace(`login.html?next=${encodeURIComponent(here)}`);
    return null;
  }
  if (session && mode === 'guest' && !new URLSearchParams(location.search).has('recovery') && !location.hash.includes('type=recovery')) {
    location.replace('dashboard.html');
    return null;
  }

  let profile = null;
  if (session) {
    try { profile = await getProfile(); } catch { /* shown by page if needed */ }
  }

  renderHeader({ session, profile, page });
  renderTabbar({ session, page });
  setTheme(document.documentElement.getAttribute('data-theme') || 'light');
  $('#theme-toggle')?.addEventListener('click', () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'));
  $('#logout-btn')?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.replace('index.html');
  });
  renderFooter();

  if (mode === 'admin' && profile?.role !== 'admin') {
    main.innerHTML = `<div class="auth-wrap">${notice('danger', '<strong>Admins only.</strong><p>This area needs an admin account. Admin rights are granted in the database, not in the browser.</p>')}<p class="mt"><a class="btn btn-secondary" href="dashboard.html">Back to dashboard</a></p></div>`;
    return null;
  }

  return { session, user: session?.user || null, profile };
}
