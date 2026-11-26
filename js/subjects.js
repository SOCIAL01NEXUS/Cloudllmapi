/* ==========================================================================
   Study Buddy — subjects page: Physics / Chemistry / Botany / Zoology
   → units → chapters, with the student's own completion progress.
   ========================================================================== */

import { supabase, unwrap } from './supabase.js';
import { initShell, $, $$, esc, icon, subjectIconName, skeletonCards, emptyState, progressBar, friendlyError, notice } from './ui.js';

const FILTERS = [
  { id: 'all', label: 'All subjects' },
  { id: 'physics', label: 'Physics' },
  { id: 'chemistry', label: 'Chemistry' },
  { id: 'botany', label: 'Botany' },
  { id: 'zoology', label: 'Zoology' },
];

const bySort = (a, b) => (a.sort_order - b.sort_order) || String(a.title || a.name).localeCompare(String(b.title || b.name));

let subjects = [];
let progressBySlug = {};
let doneSet = new Set();
let filter = 'all';
let query = '';

function readHash() {
  const h = location.hash.replace('#', '');
  if (FILTERS.some((f) => f.id === h)) filter = h;
}

function render() {
  const root = $('#subjects-root');
  const q = query.trim().toLowerCase();
  const visible = subjects.filter((s) => filter === 'all' || s.slug === filter);

  if (!visible.length) {
    root.innerHTML = emptyState({ icon: 'book', title: 'No subjects yet', text: 'Run sql/seed.sql in Supabase, or add subjects from the Admin panel.' });
    return;
  }

  root.innerHTML = visible.map((s) => {
    const p = progressBySlug[s.slug] || { total_chapters: 0, done_chapters: 0 };
    const pct = p.total_chapters ? (p.done_chapters / p.total_chapters) * 100 : 0;
    const units = [...(s.units || [])].sort(bySort).map((u) => {
      const chapters = [...(u.chapters || [])].sort(bySort).filter((c) => !q || c.title.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));
      if (!chapters.length) return '';
      const done = chapters.filter((c) => doneSet.has(c.id)).length;
      return `<details class="unit" ${(filter !== 'all' || q) ? 'open' : ''}>
        <summary><span>${esc(u.title)}</span><span class="badge ${done === chapters.length ? 'badge-success' : ''}">${done}/${chapters.length} done</span></summary>
        <div class="unit-body">${chapters.map((c) => `
          <a class="chapter-row ${doneSet.has(c.id) ? 'done' : ''}" href="chapter.html?id=${encodeURIComponent(c.id)}">
            <span class="check-dot">${icon('check', 14)}</span>
            <span><span class="ch-title">${esc(c.title)}</span><br><span class="ch-desc">${esc(c.description || '')}</span></span>
          </a>`).join('')}</div></details>`;
    }).join('');

    return `<section class="stack anim-fade-up" aria-labelledby="sub-${esc(s.slug)}" style="margin-bottom:32px">
      <div class="card">
        <div class="row" style="flex-wrap:nowrap">
          <div class="subject-icon ${esc(s.slug)}">${icon(subjectIconName(s.slug), 28)}</div>
          <div style="flex:1;min-width:0">
            <h2 id="sub-${esc(s.slug)}" class="mb-0">${esc(s.name)} <span class="badge badge-primary">${esc(s.category)}</span></h2>
            <p class="muted small mb-0">${esc(s.description || '')}</p>
          </div>
        </div>
        <div class="progress-meta mt-sm"><span>${p.done_chapters} of ${p.total_chapters} chapters completed</span><span>${Math.round(pct)}%</span></div>
        ${progressBar(pct, `${s.name} progress`)}
      </div>
      <div>${units || (q ? '<p class="muted">No chapters match your search in this subject.</p>' : emptyState({ icon: 'book', title: 'No chapters yet', text: 'Chapters will appear here once they are published.' }))}</div>
    </section>`;
  }).join('');
}

function renderFilters() {
  $('#subject-filters').innerHTML = FILTERS.map((f) =>
    `<button type="button" class="chip" data-filter="${f.id}" aria-pressed="${f.id === filter}">${esc(f.label)}</button>`).join('');
  $$('#subject-filters .chip').forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    history.replaceState(null, '', filter === 'all' ? location.pathname + location.search : `#${filter}`);
    renderFilters();
    render();
  }));
}

async function main() {
  const ctx = await initShell();
  if (!ctx) return;

  readHash();
  const initialQ = new URLSearchParams(location.search).get('q');
  if (initialQ) { query = initialQ.slice(0, 80); $('#chapter-search').value = query; }

  const root = $('#subjects-root');
  root.innerHTML = skeletonCards(3);
  renderFilters();

  try {
    const [subjRes, progRes, doneRes] = await Promise.all([
      supabase.from('subjects')
        .select('id, slug, name, category, description, sort_order, units(id, title, sort_order, chapters(id, title, description, sort_order))')
        .order('sort_order'),
      supabase.rpc('my_subject_progress'),
      supabase.from('lesson_progress').select('chapter_id').eq('completed', true),
    ]);
    subjects = unwrap(subjRes) || [];
    progressBySlug = Object.fromEntries((unwrap(progRes) || []).map((p) => [p.slug, p]));
    doneSet = new Set((unwrap(doneRes) || []).map((r) => r.chapter_id));
    render();
  } catch (err) {
    root.innerHTML = notice('danger', `<strong>Could not load subjects.</strong><p>${esc(friendlyError(err))}</p>`);
    return;
  }

  $('#chapter-search').addEventListener('input', (e) => { query = e.target.value.slice(0, 80); render(); });
  window.addEventListener('hashchange', () => { readHash(); renderFilters(); render(); });
}

main();
