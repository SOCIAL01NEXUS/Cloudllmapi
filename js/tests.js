/* ==========================================================================
   Study Buddy — Tests & DPP list for students (published ones only)
   ========================================================================== */

import { supabase, unwrap } from './supabase.js';
import { initShell, $, $$, esc, icon, emptyState, skeletonCards, notice, friendlyError } from './ui.js';

const KINDS = { weekly_test: 'Weekly test', dpp: 'DPP' };
let all = [];
let best = new Map(); // quiz_id -> best attempt
let filter = 'all';

const root = () => $('#tests-root');

function card(q) {
  const n = q.questions?.[0]?.count ?? 0;
  const b = best.get(q.id);
  return `<a class="card" href="quiz.html?quiz=${encodeURIComponent(q.id)}">
    <div class="row-between">
      <h3 class="mb-0">${esc(q.title)}</h3>
      <span class="badge ${q.kind === 'weekly_test' ? 'badge-amber' : 'badge-primary'}">${esc(KINDS[q.kind] || 'Test')}</span>
    </div>
    <p class="muted small mb-0 mt-sm">${n} question${n === 1 ? '' : 's'}${q.total_time_min ? ` · ${q.total_time_min} min` : ''}${q.test_date ? ` · ${esc(q.test_date)}` : ''}</p>
    <p class="small mb-0 mt-sm">${b ? `<span class="badge badge-success">${icon('check', 14)} Best: ${esc(b.score)} / ${esc(b.max_score)}</span>` : '<span class="muted">Not attempted yet</span>'}</p>
  </a>`;
}

function paint() {
  const list = all.filter((q) => filter === 'all' || q.kind === filter);
  const weekly = list.filter((q) => q.kind === 'weekly_test');
  const dpp = list.filter((q) => q.kind === 'dpp');
  const section = (title, ic, items) => (items.length ? `<section class="mb"><div class="card-title">${icon(ic, 22)}<h2>${title}</h2></div><div class="grid grid-3">${items.map(card).join('')}</div></section>` : '');
  $('#tests-list').innerHTML = list.length
    ? section('Weekly tests', 'calendar', weekly) + section('Daily Practice Problems', 'quiz', dpp)
    : emptyState({ icon: 'quiz', title: 'Nothing here yet', text: 'When your teacher publishes a weekly test or DPP, it will show up here.' });
}

async function main() {
  const ctx = await initShell();
  if (!ctx) return;
  root().innerHTML = skeletonCards(3);
  try {
    const [qz, at] = await Promise.all([
      supabase.from('quizzes').select('id, title, kind, test_date, total_time_min, created_at, questions(count)')
        .neq('kind', 'chapter').eq('is_published', true).order('test_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(100),
      supabase.from('quiz_attempts').select('quiz_id, score, max_score').order('score', { ascending: false }).limit(300),
    ]);
    all = (unwrap(qz) || []).filter((q) => (q.questions?.[0]?.count ?? 0) > 0);
    for (const a of unwrap(at) || []) if (!best.has(a.quiz_id)) best.set(a.quiz_id, a);
  } catch (err) {
    root().innerHTML = notice('danger', `<strong>Could not load tests.</strong><p>${esc(friendlyError(err))}</p>`);
    return;
  }
  root().innerHTML = `<div class="tabs mb" role="tablist" aria-label="Filter" id="t-filter">
      ${[['all', 'All'], ['weekly_test', 'Weekly tests'], ['dpp', 'DPP']].map(([v, l]) => `<button class="tab" role="tab" type="button" data-f="${v}" aria-selected="${v === filter}">${l}</button>`).join('')}
    </div><div id="tests-list"></div>`;
  $$('#t-filter .tab').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.f;
    $$('#t-filter .tab').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    paint();
  }));
  paint();
}
main();
