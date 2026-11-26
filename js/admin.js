/* ==========================================================================
   Study Buddy — Admin panel
   • content management: subjects, units, chapters, YouTube lessons, quizzes, questions
   • analytics: AGGREGATE ONLY (totals, popular chapters, average score, weak topics)
   The page check in ui.js is only for friendly UX. The real protection is in the
   database: only profiles.role = 'admin' passes the RLS policies and the
   admin_* functions in sql/schema.sql. Admins have NO policy that lets them read
   notes, AI chats, answers or individual progress.
   ========================================================================== */

import { supabase, unwrap } from './supabase.js';
import { initShell, $, $$, esc, icon, toast, friendlyError, emptyState, skeletonLines, confirmBox, notice, clampNum } from './ui.js';
import { extractYouTubeId } from './youtube.js';

const TABS = [
  { id: 'analytics', label: 'Analytics' },
  { id: 'content', label: 'Syllabus & lessons' },
  { id: 'quizzes', label: 'Quizzes & questions' },
];
const CATEGORIES = ['Physics', 'Chemistry', 'Biology'];
const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const lines = (v) => String(v || '').split('\n').map((s) => s.trim()).filter(Boolean);
const pairs = (v, a, b) => lines(v).map((l) => { const [x, ...rest] = l.split('|'); return { [a]: x.trim(), [b]: rest.join('|').trim() }; }).filter((o) => o[a]);
const unpairs = (arr, a, b) => (Array.isArray(arr) ? arr : []).map((o) => `${o[a] || ''} | ${o[b] || ''}`).join('\n');

let tree = []; // subjects → units → chapters
let activeTab = 'analytics';

/* ---------- generic validated form dialog ---------- */
function openForm({ title, fields, submitText = 'Save', onSubmit }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-labelledby', 'form-title');
    d.innerHTML = `<form class="modal-body" novalidate>
      <h2 class="modal-title" id="form-title">${esc(title)}</h2>
      ${fields.map((f) => {
        const id = `f-${f.name}`;
        let input;
        if (f.type === 'textarea') input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 4}" maxlength="${f.max || 4000}"></textarea>`;
        else if (f.type === 'select') input = `<select id="${id}" name="${f.name}">${f.options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select>`;
        else if (f.type === 'checkbox') input = `<label class="check"><input type="checkbox" id="${id}" name="${f.name}"><span>${esc(f.label)}</span></label>`;
        else input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" maxlength="${f.max || 300}" ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.maxNum !== undefined ? `max="${f.maxNum}"` : ''}>`;
        return `<div class="field">${f.type === 'checkbox' ? '' : `<label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>`}${input}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}<span class="error-text" id="${id}-error" role="alert"></span></div>`;
      }).join('')}
      <div class="modal-actions"><button type="button" class="btn btn-secondary" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">${esc(submitText)}</button></div>
    </form>`;
    document.body.append(d);
    fields.forEach((f) => {
      const el = $(`#f-${f.name}`, d);
      if (f.type === 'checkbox') el.checked = !!f.value;
      else el.value = f.value ?? '';
    });
    const close = (v) => { d.close(); d.remove(); resolve(v); };
    $('[data-cancel]', d).addEventListener('click', () => close(null));
    d.addEventListener('cancel', () => { d.remove(); resolve(null); });
    $('form', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {};
      let ok = true;
      fields.forEach((f) => {
        const el = $(`#f-${f.name}`, d);
        let v = f.type === 'checkbox' ? el.checked : el.value.trim();
        if (f.type === 'number') v = v === '' ? null : Number(v);
        let msg = '';
        if (f.required && (v === '' || v === null)) msg = 'This field is required.';
        else if (f.type === 'number' && v !== null && (!Number.isFinite(v) || v < (f.min ?? -Infinity) || v > (f.maxNum ?? Infinity))) msg = 'Enter a valid number.';
        else if (f.validate && v !== '' && v !== null) msg = f.validate(v) || '';
        $(`#f-${f.name}-error`, d).textContent = msg;
        el.setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (msg) ok = false;
        values[f.name] = v;
      });
      if (!ok) return;
      const btn = $('[type="submit"]', d);
      btn.disabled = true;
      try {
        await onSubmit(values);
        close(true);
      } catch (err) {
        btn.disabled = false;
        toast(friendlyError(err), 'error', 6000);
      }
    });
    d.showModal();
    $('input, textarea, select', d)?.focus();
  });
}

/* ---------- analytics (aggregate only) ---------- */
async function renderAnalytics() {
  const root = $('#panel-analytics');
  root.innerHTML = skeletonLines(5);
  try {
    const [ov, pop, weak] = await Promise.all([
      supabase.rpc('admin_overview'), supabase.rpc('admin_popular_chapters'), supabase.rpc('admin_weak_topics'),
    ]);
    const o = unwrap(ov) || {};
    const popular = unwrap(pop) || [];
    const wk = unwrap(weak) || [];
    root.innerHTML = `
      ${notice('info', '<strong>Privacy by design.</strong><p>This page shows totals and averages only. Private notes, AI chats, quiz answers and individual progress are not readable by admins.</p>')}
      <div class="grid grid-4 mt stagger">
        <div class="card stat indigo" style="--i:0"><span class="stat-label">${icon('users', 18)} Total users</span><span class="stat-value">${esc(o.total_users ?? 0)}</span></div>
        <div class="card stat teal" style="--i:1"><span class="stat-label">${icon('streak', 18)} Active (7 days)</span><span class="stat-value">${esc(o.active_users_7d ?? 0)}</span></div>
        <div class="card stat amber" style="--i:2"><span class="stat-label">${icon('quiz', 18)} Avg. quiz score</span><span class="stat-value">${esc(o.avg_score_pct ?? 0)}%</span></div>
        <div class="card stat" style="--i:3"><span class="stat-label">${icon('chart', 18)} Quiz attempts</span><span class="stat-value">${esc(o.total_attempts ?? 0)}</span></div>
      </div>
      <div class="grid grid-2 mt">
        <div class="card"><div class="card-title">${icon('book', 22)}<h2>Popular chapters</h2></div>
          ${popular.length ? `<ol class="point-list">${popular.map((p) => `<li><strong>${esc(p.title)}</strong> <span class="muted">· ${esc(p.subject)} — ${esc(p.students)} students</span></li>`).join('')}</ol>`
            : emptyState({ icon: 'book', title: 'No data yet', text: 'Popular chapters appear after students start learning. Small groups are hidden to protect privacy.' })}</div>
        <div class="card"><div class="card-title">${icon('alert', 22)}<h2>Commonly incorrect topics</h2></div>
          ${wk.length ? `<ol class="point-list">${wk.map((w) => `<li><strong>${esc(w.topic)}</strong> <span class="muted">· ${esc(w.chapter_title)} — ${esc(w.wrong_rate)}% wrong</span></li>`).join('')}</ol>`
            : emptyState({ icon: 'alert', title: 'No data yet', text: 'Topics appear once enough answers are collected.' })}</div>
      </div>`;
  } catch (err) { root.innerHTML = notice('danger', esc(friendlyError(err))); }
}

/* ---------- content tree ---------- */
async function loadTree() {
  tree = unwrap(await supabase.from('subjects')
    .select('id, slug, name, category, description, sort_order, units(id, subject_id, title, sort_order, chapters(*, lessons(id, title, youtube_id, sort_order)))')
    .order('sort_order')) || [];
}
const bySort = (a, b) => (a.sort_order - b.sort_order);
const nextOrder = (list) => (list.length ? Math.max(...list.map((x) => x.sort_order)) + 1 : 1);

async function renderContent() {
  const root = $('#panel-content');
  try { await loadTree(); } catch (err) { root.innerHTML = notice('danger', esc(friendlyError(err))); return; }
  root.innerHTML = `
    <div class="row-between"><h2 class="mb-0">Subjects</h2><button class="btn btn-primary btn-sm" id="add-subject" type="button">${icon('plus', 16)} Add subject</button></div>
    <div class="mt">${tree.length ? tree.map((s) => `
      <section class="card mb-0" style="margin-bottom:16px">
        <div class="row-between">
          <div class="row"><div class="subject-icon ${esc(s.slug)}">${icon(s.slug === 'physics' || s.slug === 'chemistry' || s.slug === 'botany' || s.slug === 'zoology' ? s.slug : 'book', 24)}</div>
            <div><h3 class="mb-0">${esc(s.name)} <span class="badge badge-primary">${esc(s.category)}</span></h3><span class="muted small">${esc(s.slug)}</span></div></div>
          <div class="row"><button class="btn btn-secondary btn-sm" data-act="edit-subject" data-id="${esc(s.id)}" type="button">Edit</button>
            <button class="btn btn-secondary btn-sm" data-act="add-unit" data-id="${esc(s.id)}" type="button">${icon('plus', 14)} Unit</button>
            <button class="btn btn-danger btn-sm" data-act="del-subject" data-id="${esc(s.id)}" type="button" aria-label="Delete ${esc(s.name)}">${icon('trash', 14)}</button></div>
        </div>
        ${[...(s.units || [])].sort(bySort).map((u) => `
          <details class="unit mt-sm"><summary>${esc(u.title)} <span class="badge">${(u.chapters || []).length} chapters</span></summary>
            <div class="unit-body">
              <div class="row" style="padding:8px"><button class="btn btn-secondary btn-sm" data-act="edit-unit" data-id="${esc(u.id)}" type="button">Edit unit</button>
                <button class="btn btn-secondary btn-sm" data-act="add-chapter" data-id="${esc(u.id)}" type="button">${icon('plus', 14)} Chapter</button>
                <button class="btn btn-danger btn-sm" data-act="del-unit" data-id="${esc(u.id)}" type="button">Delete unit</button></div>
              ${[...(u.chapters || [])].sort(bySort).map((c) => `
                <div class="chapter-row"><div style="flex:1"><div class="ch-title">${esc(c.title)}</div>
                  <div class="ch-desc">${(c.lessons || []).length} video lesson${(c.lessons || []).length === 1 ? '' : 's'}</div></div>
                  <button class="btn btn-secondary btn-sm" data-act="lessons" data-id="${esc(c.id)}" type="button">${icon('play', 14)} Lessons</button>
                  <button class="btn btn-secondary btn-sm" data-act="edit-chapter" data-id="${esc(c.id)}" type="button">Edit</button>
                  <button class="btn btn-danger btn-sm" data-act="del-chapter" data-id="${esc(c.id)}" type="button" aria-label="Delete ${esc(c.title)}">${icon('trash', 14)}</button></div>`).join('') || '<p class="muted small" style="padding:8px">No chapters yet.</p>'}
            </div></details>`).join('')}
      </section>`).join('') : emptyState({ icon: 'book', title: 'No subjects yet', text: 'Add Physics, Chemistry, Botany and Zoology, or run sql/seed.sql.' })}</div>`;

  $('#add-subject').addEventListener('click', () => subjectForm());
  $$('#panel-content [data-act]').forEach((b) => b.addEventListener('click', () => handleAct(b.dataset.act, b.dataset.id)));
}

const findSubject = (id) => tree.find((s) => s.id === id);
const findUnit = (id) => tree.flatMap((s) => s.units || []).find((u) => u.id === id);
const findChapter = (id) => tree.flatMap((s) => s.units || []).flatMap((u) => u.chapters || []).find((c) => c.id === id);

async function handleAct(act, id) {
  if (act === 'edit-subject') return subjectForm(findSubject(id));
  if (act === 'add-unit') return unitForm({ subject_id: id });
  if (act === 'edit-unit') return unitForm(findUnit(id));
  if (act === 'add-chapter') return chapterForm({ unit_id: id });
  if (act === 'edit-chapter') return chapterForm(findChapter(id));
  if (act === 'lessons') return lessonsDialog(id);
  const map = { 'del-subject': ['subjects', 'this subject and ALL its units, chapters and quizzes'], 'del-unit': ['units', 'this unit and all its chapters'], 'del-chapter': ['chapters', 'this chapter with its lessons and quizzes'] };
  if (map[act]) {
    if (!(await confirmBox(`Delete ${map[act][1]}? Students’ progress on it will also be removed.`))) return;
    try { unwrap(await supabase.from(map[act][0]).delete().eq('id', id)); toast('Deleted.', 'success'); renderContent(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  }
}

function subjectForm(s) {
  return openForm({
    title: s ? 'Edit subject' : 'Add subject',
    fields: [
      { name: 'name', label: 'Name', required: true, value: s?.name, max: 60 },
      { name: 'slug', label: 'Slug (used in links)', required: true, value: s?.slug, hint: 'Lowercase letters, numbers, dashes. Use physics / chemistry / botany / zoology to get the custom icons.', validate: (v) => (/^[a-z0-9-]{2,40}$/.test(v) ? '' : 'Use 2–40 lowercase letters, numbers or dashes.') },
      { name: 'category', label: 'Category', type: 'select', value: s?.category || 'Physics', options: CATEGORIES.map((c) => ({ value: c, label: c })) },
      { name: 'description', label: 'Description', type: 'textarea', rows: 2, value: s?.description, max: 300 },
      { name: 'sort_order', label: 'Order', type: 'number', min: 0, maxNum: 999, value: s?.sort_order ?? nextOrder(tree), required: true },
    ],
    onSubmit: async (v) => {
      const row = { ...v, slug: v.slug || slugify(v.name) };
      unwrap(s ? await supabase.from('subjects').update(row).eq('id', s.id) : await supabase.from('subjects').insert(row));
      toast('Saved.', 'success'); renderContent();
    },
  });
}

function unitForm(u) {
  const siblings = u?.subject_id ? (findSubject(u.subject_id)?.units || []) : [];
  return openForm({
    title: u?.id ? 'Edit unit' : 'Add unit',
    fields: [
      { name: 'title', label: 'Unit title', required: true, value: u?.title, max: 120 },
      { name: 'sort_order', label: 'Order', type: 'number', min: 0, maxNum: 999, value: u?.sort_order ?? nextOrder(siblings), required: true },
    ],
    onSubmit: async (v) => {
      unwrap(u?.id ? await supabase.from('units').update(v).eq('id', u.id) : await supabase.from('units').insert({ ...v, subject_id: u.subject_id }));
      toast('Saved.', 'success'); renderContent();
    },
  });
}

function chapterForm(c) {
  const siblings = c?.unit_id ? (findUnit(c.unit_id)?.chapters || []) : [];
  return openForm({
    title: c?.id ? 'Edit chapter' : 'Add chapter',
    fields: [
      { name: 'title', label: 'Chapter title', required: true, value: c?.title, max: 140 },
      { name: 'description', label: 'Short description', type: 'textarea', rows: 2, value: c?.description, max: 300 },
      { name: 'important_points', label: 'NCERT-focused important points (one per line)', type: 'textarea', rows: 6, value: (c?.important_points || []).join('\n'), max: 6000 },
      { name: 'formulas', label: 'Formulas / reactions (one per line: label | formula)', type: 'textarea', rows: 5, value: unpairs(c?.formulas, 'label', 'text'), max: 6000 },
      { name: 'diagrams', label: 'Diagrams (one per line: title | note)', type: 'textarea', rows: 3, value: unpairs(c?.diagrams, 'title', 'note'), max: 3000 },
      { name: 'flashcards', label: 'Flashcards (one per line: question | answer)', type: 'textarea', rows: 5, value: unpairs(c?.flashcards, 'q', 'a'), max: 8000 },
      { name: 'sort_order', label: 'Order', type: 'number', min: 0, maxNum: 999, value: c?.sort_order ?? nextOrder(siblings), required: true },
    ],
    onSubmit: async (v) => {
      const row = {
        title: v.title, description: v.description, sort_order: v.sort_order,
        important_points: lines(v.important_points).slice(0, 60),
        formulas: pairs(v.formulas, 'label', 'text').slice(0, 60),
        diagrams: pairs(v.diagrams, 'title', 'note').slice(0, 30),
        flashcards: pairs(v.flashcards, 'q', 'a').slice(0, 100),
      };
      unwrap(c?.id ? await supabase.from('chapters').update(row).eq('id', c.id) : await supabase.from('chapters').insert({ ...row, unit_id: c.unit_id }));
      toast('Saved.', 'success'); renderContent();
    },
  });
}

/* ---------- YouTube lessons ---------- */
async function lessonsDialog(chapterId) {
  const chapter = findChapter(chapterId);
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.setAttribute('aria-label', 'Video lessons');
  document.body.append(d);
  const paint = () => {
    const ls = [...(findChapter(chapterId)?.lessons || [])].sort(bySort);
    d.innerHTML = `<div class="modal-body"><h2 class="modal-title">Lessons — ${esc(chapter.title)}</h2>
      ${ls.length ? `<ul class="list-plain stack-sm">${ls.map((l) => `<li class="row-between card flat" style="padding:10px 14px"><span>${esc(l.title)} <span class="muted small">(${esc(l.youtube_id)})</span></span>
        <button class="btn btn-danger btn-sm" data-del="${esc(l.id)}" type="button">${icon('trash', 14)} Remove</button></li>`).join('')}</ul>` : '<p class="muted">No lessons yet.</p>'}
      <hr class="divider">
      <form id="lesson-form" novalidate>
        <div class="field"><label for="l-title">Lesson title *</label><input id="l-title" maxlength="140"><span class="error-text" id="l-title-error" role="alert"></span></div>
        <div class="field"><label for="l-url">YouTube link *</label><input id="l-url" type="url" maxlength="300" placeholder="https://www.youtube.com/watch?v=…"><span class="hint">Paste a watch, youtu.be or embed link. It plays through the official YouTube player.</span><span class="error-text" id="l-url-error" role="alert"></span></div>
        <div class="modal-actions"><button type="button" class="btn btn-secondary" id="l-close">Close</button><button class="btn btn-primary" type="submit">Add lesson</button></div>
      </form></div>`;
    $('#l-close', d).addEventListener('click', () => { d.close(); d.remove(); renderContent(); });
    $$('[data-del]', d).forEach((b) => b.addEventListener('click', async () => {
      try { unwrap(await supabase.from('lessons').delete().eq('id', b.dataset.del)); await loadTree(); paint(); }
      catch (err) { toast(friendlyError(err), 'error'); }
    }));
    $('#lesson-form', d).addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = $('#l-title', d).value.trim();
      const id = extractYouTubeId($('#l-url', d).value);
      $('#l-title-error', d).textContent = title ? '' : 'Enter a title.';
      $('#l-url-error', d).textContent = id ? '' : 'That does not look like a YouTube link.';
      if (!title || !id) return;
      try {
        unwrap(await supabase.from('lessons').insert({ chapter_id: chapterId, title, youtube_id: id, sort_order: nextOrder(findChapter(chapterId).lessons || []) }));
        await loadTree(); paint(); toast('Lesson added.', 'success');
      } catch (err) { toast(friendlyError(err), 'error'); }
    });
  };
  d.addEventListener('cancel', () => { d.remove(); renderContent(); });
  paint();
  d.showModal();
}

/* ---------- quizzes & questions ---------- */
let selChapter = null;
let selQuiz = null;

async function renderQuizzes() {
  const root = $('#panel-quizzes');
  try { if (!tree.length) await loadTree(); } catch (err) { root.innerHTML = notice('danger', esc(friendlyError(err))); return; }
  const chapters = tree.flatMap((s) => (s.units || []).flatMap((u) => (u.chapters || []).map((c) => ({ ...c, label: `${s.name} › ${c.title}` }))));
  if (!chapters.length) { root.innerHTML = emptyState({ icon: 'quiz', title: 'Add chapters first', text: 'Quizzes belong to a chapter.' }); return; }
  if (!selChapter || !chapters.some((c) => c.id === selChapter)) selChapter = chapters[0].id;

  root.innerHTML = `<div class="field"><label for="quiz-chapter">Chapter</label>
      <select id="quiz-chapter">${chapters.map((c) => `<option value="${esc(c.id)}" ${c.id === selChapter ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
    <div id="quiz-area">${skeletonLines(3)}</div>`;
  $('#quiz-chapter').addEventListener('change', (e) => { selChapter = e.target.value; selQuiz = null; paintQuizArea(); });
  paintQuizArea();
}

async function paintQuizArea() {
  const area = $('#quiz-area');
  try {
    const quizzes = unwrap(await supabase.from('quizzes').select('id, title, is_pyq, pyq_year, time_per_question_sec, sort_order, questions(count)').eq('chapter_id', selChapter).order('sort_order')) || [];
    area.innerHTML = `<div class="row-between"><h2 class="mb-0">Quizzes</h2><button class="btn btn-primary btn-sm" id="add-quiz" type="button">${icon('plus', 16)} Add quiz</button></div>
      <div class="stack-sm mt">${quizzes.length ? quizzes.map((q) => `
        <div class="card flat"><div class="row-between"><div><strong>${esc(q.title)}</strong> ${q.is_pyq ? `<span class="badge badge-amber">PYQ ${esc(q.pyq_year || '')}</span>` : ''}
          <span class="muted small"> · ${q.questions?.[0]?.count ?? 0} questions</span></div>
          <div class="row"><button class="btn btn-secondary btn-sm" data-q="questions" data-id="${esc(q.id)}" type="button">Questions</button>
            <button class="btn btn-secondary btn-sm" data-q="edit" data-id="${esc(q.id)}" type="button">Edit</button>
            <button class="btn btn-danger btn-sm" data-q="del" data-id="${esc(q.id)}" type="button" aria-label="Delete quiz ${esc(q.title)}">${icon('trash', 14)}</button></div></div></div>`).join('')
        : emptyState({ icon: 'quiz', title: 'No quizzes for this chapter', text: 'Add a chapter quiz or a previous-year set.' })}</div>
      <div id="question-area" class="mt"></div>`;
    $('#add-quiz').addEventListener('click', () => quizForm());
    $$('[data-q]', area).forEach((b) => b.addEventListener('click', async () => {
      const q = quizzes.find((x) => x.id === b.dataset.id);
      if (b.dataset.q === 'edit') quizForm(q);
      if (b.dataset.q === 'questions') { selQuiz = q; paintQuestions(); }
      if (b.dataset.q === 'del' && await confirmBox('Delete this quiz and all its questions? Students’ past attempts on it will also be removed.')) {
        try { unwrap(await supabase.from('quizzes').delete().eq('id', q.id)); toast('Deleted.', 'success'); selQuiz = null; paintQuizArea(); } catch (err) { toast(friendlyError(err), 'error'); }
      }
    }));
    if (selQuiz && quizzes.some((q) => q.id === selQuiz.id)) paintQuestions();
  } catch (err) { area.innerHTML = notice('danger', esc(friendlyError(err))); }
}

function quizForm(q) {
  return openForm({
    title: q ? 'Edit quiz' : 'Add quiz',
    fields: [
      { name: 'title', label: 'Quiz title', required: true, value: q?.title, max: 140 },
      { name: 'is_pyq', label: 'This is a previous-year question set', type: 'checkbox', value: q?.is_pyq },
      { name: 'pyq_year', label: 'Exam year (PYQ only)', type: 'number', min: 1990, maxNum: 2100, value: q?.pyq_year },
      { name: 'time_per_question_sec', label: 'Default timer per question (seconds, 0 = off)', type: 'number', min: 0, maxNum: 600, value: q?.time_per_question_sec ?? 0 },
    ],
    onSubmit: async (v) => {
      const row = { title: v.title, is_pyq: v.is_pyq, pyq_year: v.is_pyq ? v.pyq_year : null, time_per_question_sec: v.time_per_question_sec || 0 };
      unwrap(q ? await supabase.from('quizzes').update(row).eq('id', q.id) : await supabase.from('quizzes').insert({ ...row, chapter_id: selChapter, sort_order: 99 }));
      toast('Saved.', 'success'); paintQuizArea();
    },
  });
}

async function paintQuestions() {
  const area = $('#question-area');
  if (!area || !selQuiz) return;
  area.innerHTML = skeletonLines(3);
  try {
    const qs = unwrap(await supabase.from('questions').select('*').eq('quiz_id', selQuiz.id).order('sort_order').order('id')) || [];
    area.innerHTML = `<div class="card"><div class="row-between"><h3 class="mb-0">Questions — ${esc(selQuiz.title)}</h3>
      <button class="btn btn-primary btn-sm" id="add-q" type="button">${icon('plus', 16)} Add question</button></div>
      <div class="stack-sm mt">${qs.length ? qs.map((q, i) => `<div class="card flat"><p class="mb-0"><strong>${i + 1}.</strong> ${esc(q.question_text)}</p>
        <p class="small muted mb-0">Topic: ${esc(q.topic)} · Correct: ${'ABCD'[q.correct_index]}</p>
        <div class="row mt-sm"><button class="btn btn-secondary btn-sm" data-e="${esc(q.id)}" type="button">Edit</button><button class="btn btn-danger btn-sm" data-d="${esc(q.id)}" type="button">Delete</button></div></div>`).join('')
        : emptyState({ icon: 'quiz', title: 'No questions yet', text: 'Each question needs 4 options, one correct answer and an explanation.' })}</div></div>`;
    $('#add-q').addEventListener('click', () => questionForm(null, qs.length));
    $$('[data-e]', area).forEach((b) => b.addEventListener('click', () => questionForm(qs.find((x) => x.id === b.dataset.e), qs.length)));
    $$('[data-d]', area).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmBox('Delete this question?'))) return;
      try { unwrap(await supabase.from('questions').delete().eq('id', b.dataset.d)); paintQuestions(); } catch (err) { toast(friendlyError(err), 'error'); }
    }));
  } catch (err) { area.innerHTML = notice('danger', esc(friendlyError(err))); }
}

function questionForm(q, count) {
  const o = q?.options || [];
  return openForm({
    title: q ? 'Edit question' : 'Add question',
    fields: [
      { name: 'question_text', label: 'Question', type: 'textarea', rows: 3, required: true, value: q?.question_text, max: 1200 },
      { name: 'o0', label: 'Option A', required: true, value: o[0], max: 300 },
      { name: 'o1', label: 'Option B', required: true, value: o[1], max: 300 },
      { name: 'o2', label: 'Option C', required: true, value: o[2], max: 300 },
      { name: 'o3', label: 'Option D', required: true, value: o[3], max: 300 },
      { name: 'correct_index', label: 'Correct option', type: 'select', value: String(q?.correct_index ?? 0), options: ['A', 'B', 'C', 'D'].map((l, i) => ({ value: String(i), label: l })) },
      { name: 'topic', label: 'Topic (used for weak-topic analysis)', required: true, value: q?.topic, max: 100 },
      { name: 'explanation', label: 'Explanation', type: 'textarea', rows: 3, required: true, value: q?.explanation, max: 1500 },
    ],
    onSubmit: async (v) => {
      const opts = [v.o0, v.o1, v.o2, v.o3];
      if (new Set(opts.map((x) => x.toLowerCase())).size < 4) throw new Error('The four options must be different from each other.');
      const row = { question_text: v.question_text, options: opts, correct_index: clampNum(v.correct_index, 0, 3, 0), topic: v.topic, explanation: v.explanation };
      unwrap(q ? await supabase.from('questions').update(row).eq('id', q.id) : await supabase.from('questions').insert({ ...row, quiz_id: selQuiz.id, sort_order: count + 1 }));
      toast('Saved.', 'success'); paintQuestions();
    },
  });
}

/* ---------- tabs ---------- */
function activate(id) {
  activeTab = id;
  $$('#admin-tabs .tab').forEach((t) => { const on = t.dataset.tab === id; t.setAttribute('aria-selected', String(on)); });
  $$('.tab-panel').forEach((p) => { p.hidden = p.id !== `panel-${id}`; });
  if (id === 'analytics') renderAnalytics();
  if (id === 'content') renderContent();
  if (id === 'quizzes') renderQuizzes();
}

async function main() {
  const ctx = await initShell();
  if (!ctx) return;
  $('#admin-tabs').innerHTML = TABS.map((t) => `<button class="tab" role="tab" type="button" data-tab="${t.id}" aria-selected="false">${esc(t.label)}</button>`).join('');
  $$('#admin-tabs .tab').forEach((t) => t.addEventListener('click', () => activate(t.dataset.tab)));
  activate('analytics');
}
main();
