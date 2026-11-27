/* ==========================================================================
   Study Buddy — admin: Weekly tests & DPP
   • "Make from PDF": upload a PDF → AI makes MCQs → admin reviews/edits → saves as draft or publishes
   • "Write by hand": same editor, empty
   • list with Publish / Unpublish / Edit / Delete
   Students only ever see PUBLISHED tests (enforced by the database, not just this page).
   ========================================================================== */

import { supabase, unwrap, localDateStr } from './supabase.js';
import { $, $$, esc, icon, toast, friendlyError, emptyState, skeletonLines, confirmBox, notice, setBusy, clampNum } from './ui.js';
import { pdfToQuestions, checkFile, MAX_FILE_MB } from './pdfquiz.js';

const KINDS = { dpp: 'DPP', weekly_test: 'Weekly test' };
const KEYS = ['A', 'B', 'C', 'D'];
let subjects = [];
let root = null;

/* ---------- list ---------- */
export async function renderTestsAdmin(host) {
  root = host;
  root.innerHTML = skeletonLines(4);
  let rows = [];
  try {
    if (!subjects.length) subjects = unwrap(await supabase.from('subjects').select('id, name').order('sort_order')) || [];
    rows = unwrap(await supabase.from('quizzes')
      .select('id, title, kind, subject_id, test_date, total_time_min, is_published, source, created_at, questions(count)')
      .neq('kind', 'chapter').order('created_at', { ascending: false }).limit(100)) || [];
  } catch (err) {
    root.innerHTML = notice('danger', `<strong>Could not load tests.</strong><p>${esc(friendlyError(err))}</p><p class="hint">Did you run SQL part 8 (tests_dpp) and part 10 (privileges)?</p>`);
    return;
  }
  const subjName = (id) => subjects.find((s) => s.id === id)?.name || 'All subjects';
  root.innerHTML = `
    <div class="row-between mb">
      <div><h2 class="mb-0">Weekly tests & DPP</h2><p class="muted small mb-0">Upload a PDF and the AI turns it into a test. You review it before students see it.</p></div>
      <div class="row"><button class="btn btn-primary" id="t-pdf" type="button">${icon('plus', 18)} Make from PDF</button>
      <button class="btn btn-secondary" id="t-new" type="button">Write by hand</button></div>
    </div>
    ${rows.length ? `<div class="stack-sm">${rows.map((r) => `
      <div class="card">
        <div class="row-between">
          <div>
            <h3 class="mb-0">${esc(r.title)}</h3>
            <p class="muted small mb-0 mt-sm">
              <span class="badge badge-primary">${esc(KINDS[r.kind] || r.kind)}</span>
              <span class="badge ${r.is_published ? 'badge-success' : 'badge-amber'}">${r.is_published ? 'Published' : 'Draft'}</span>
              ${esc(subjName(r.subject_id))} · ${r.questions?.[0]?.count ?? 0} questions${r.total_time_min ? ` · ${r.total_time_min} min` : ''}${r.test_date ? ` · ${esc(r.test_date)}` : ''}${r.source === 'pdf' ? ' · from PDF' : ''}
            </p>
          </div>
          <div class="row">
            <button class="btn btn-secondary btn-sm" data-act="edit" data-id="${esc(r.id)}" type="button">${icon('edit', 16)} Review / edit</button>
            <button class="btn btn-secondary btn-sm" data-act="toggle" data-id="${esc(r.id)}" data-pub="${r.is_published}" type="button">${r.is_published ? 'Unpublish' : 'Publish'}</button>
            <a class="btn btn-ghost btn-sm" href="quiz.html?quiz=${encodeURIComponent(r.id)}">Preview</a>
            <button class="btn btn-ghost btn-sm" data-act="del" data-id="${esc(r.id)}" type="button" aria-label="Delete ${esc(r.title)}">${icon('trash', 16)}</button>
          </div>
        </div>
      </div>`).join('')}</div>`
    : emptyState({ icon: 'quiz', title: 'No tests yet', text: 'Click "Make from PDF" to create your first weekly test or DPP.' })}`;
  $('#t-pdf').addEventListener('click', pdfDialog);
  $('#t-new').addEventListener('click', () => openEditor(null, []));
  $$('[data-act]', root).forEach((b) => b.addEventListener('click', () => act(b.dataset.act, b.dataset.id, b.dataset.pub === 'true')));
}

async function act(what, id, published) {
  try {
    if (what === 'edit') {
      const [quiz, qs] = await Promise.all([
        supabase.from('quizzes').select('*').eq('id', id).single(),
        supabase.from('questions').select('*').eq('quiz_id', id).order('sort_order').order('id'),
      ]);
      openEditor(unwrap(quiz), unwrap(qs) || []);
    } else if (what === 'toggle') {
      unwrap(await supabase.from('quizzes').update({ is_published: !published }).eq('id', id));
      toast(published ? 'Unpublished — students cannot see it now.' : 'Published — students can see it.', 'success');
      renderTestsAdmin(root);
    } else if (what === 'del') {
      if (!(await confirmBox('Delete this test and all its questions? Student attempts of it will be deleted too.'))) return;
      unwrap(await supabase.from('quizzes').delete().eq('id', id));
      toast('Deleted.', 'success');
      renderTestsAdmin(root);
    }
  } catch (err) { toast(friendlyError(err), 'error', 6000); }
}

/* ---------- PDF dialog ---------- */
function pdfDialog() {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.setAttribute('aria-labelledby', 'pdf-title');
  d.innerHTML = `<form class="modal-body" novalidate>
    <h2 class="modal-title" id="pdf-title">Make a test from a PDF</h2>
    <div class="field"><label for="p-file">PDF file *</label>
      <input id="p-file" type="file" accept="application/pdf,.pdf">
      <span class="hint">Question paper, DPP sheet or notes — up to ${MAX_FILE_MB} MB. If it already has MCQs they are copied; if it is notes, new questions are written.</span>
      <span class="error-text" id="p-file-error" role="alert"></span></div>
    <div class="field"><label for="p-title">Title *</label><input id="p-title" maxlength="140" placeholder="e.g. Weekly Test 12 — Mechanics"></div>
    <div class="grid grid-2">
      <div class="field"><label for="p-kind">Type</label><select id="p-kind"><option value="weekly_test">Weekly test</option><option value="dpp">DPP</option></select></div>
      <div class="field"><label for="p-subject">Subject</label><select id="p-subject"><option value="">All / mixed</option>${subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="p-count">How many questions</label><input id="p-count" type="number" min="3" max="45" value="20"></div>
      <div class="field"><label for="p-time">Total time (minutes, 0 = none)</label><input id="p-time" type="number" min="0" max="600" value="45"></div>
    </div>
    <p class="hint" id="p-status" role="status" aria-live="polite"></p>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">Make questions</button></div>
  </form>`;
  document.body.append(d);
  const close = () => { d.close(); d.remove(); };
  $('[data-cancel]', d).addEventListener('click', close);
  d.addEventListener('cancel', () => d.remove());
  $('#p-file', d).addEventListener('change', (e) => {
    const f = e.target.files[0];
    $('#p-file-error', d).textContent = f ? checkFile(f) : '';
    if (f && !$('#p-title', d).value) $('#p-title', d).value = f.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').slice(0, 140);
  });
  $('form', d).addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = $('#p-file', d).files[0];
    const err = checkFile(file);
    $('#p-file-error', d).textContent = err;
    const title = $('#p-title', d).value.trim();
    if (err) return;
    if (!title) { toast('Please add a title.', 'error'); return; }
    const btn = $('[type="submit"]', d);
    setBusy(btn, true, 'Working…');
    try {
      const kind = $('#p-kind', d).value;
      const subjectId = $('#p-subject', d).value || null;
      const questions = await pdfToQuestions({
        file, kind, count: clampNum($('#p-count', d).value, 3, 45),
        subject: subjects.find((s) => s.id === subjectId)?.name || '',
      }, (m) => { $('#p-status', d).textContent = m; });
      const meta = {
        title, kind, subject_id: subjectId, source: 'pdf', is_published: false,
        total_time_min: clampNum($('#p-time', d).value, 0, 600), test_date: localDateStr(), chapter_id: null,
      };
      close();
      toast(`${questions.length} questions made. Please check them before publishing.`, 'success', 6000);
      openEditor(meta, questions, true);
    } catch (ex) {
      setBusy(btn, false);
      $('#p-status', d).textContent = '';
      toast(friendlyError(ex), 'error', 8000);
    }
  });
  d.showModal();
}

/* ---------- editor (review & edit) ---------- */
function blankQ() { return { topic: '', question_text: '', options: ['', '', '', ''], correct_index: 0, explanation: '' }; }

function openEditor(quiz, questions, isNew = !quiz?.id) {
  const q0 = quiz || { title: '', kind: 'weekly_test', subject_id: null, source: 'manual', is_published: false, total_time_min: 45, test_date: localDateStr(), chapter_id: null };
  let qs = (questions.length ? questions : [blankQ()]).map((q) => ({ ...q, options: [...q.options] }));
  const originalIds = new Set(questions.map((q) => q.id).filter(Boolean));

  const d = document.createElement('dialog');
  d.className = 'modal';
  d.style.width = 'min(96vw, 860px)';
  d.setAttribute('aria-labelledby', 'ed-title');
  const paint = () => {
    $('#ed-list', d).innerHTML = qs.map((q, i) => `
      <fieldset class="card" style="margin-bottom:12px" data-i="${i}">
        <legend class="label">Question ${i + 1}</legend>
        <div class="field"><label for="q-t-${i}">Question</label><textarea id="q-t-${i}" data-f="question_text" rows="2" maxlength="1200">${esc(q.question_text)}</textarea></div>
        ${q.options.map((o, k) => `
          <div class="row" style="margin-bottom:6px;flex-wrap:nowrap">
            <label class="check" style="flex:none"><input type="radio" name="c-${i}" data-f="correct" value="${k}" ${q.correct_index === k ? 'checked' : ''} aria-label="Option ${KEYS[k]} is correct"><span>${KEYS[k]}</span></label>
            <input data-f="opt" data-k="${k}" value="${esc(o)}" maxlength="300" aria-label="Option ${KEYS[k]}" style="flex:1">
          </div>`).join('')}
        <p class="hint">Tick the circle next to the correct option.</p>
        <div class="grid grid-2">
          <div class="field"><label for="q-p-${i}">Topic</label><input id="q-p-${i}" data-f="topic" maxlength="100" value="${esc(q.topic)}"></div>
          <div class="field"><label for="q-e-${i}">Explanation</label><input id="q-e-${i}" data-f="explanation" maxlength="1500" value="${esc(q.explanation || '')}"></div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-del="${i}">${icon('trash', 16)} Remove question</button>
      </fieldset>`).join('');
    $$('[data-del]', d).forEach((b) => b.addEventListener('click', () => { collect(); qs.splice(Number(b.dataset.del), 1); if (!qs.length) qs.push(blankQ()); paint(); }));
  };
  const collect = () => {
    $$('#ed-list fieldset', d).forEach((fs) => {
      const q = qs[Number(fs.dataset.i)];
      if (!q) return;
      q.question_text = $('[data-f="question_text"]', fs).value;
      q.topic = $('[data-f="topic"]', fs).value;
      q.explanation = $('[data-f="explanation"]', fs).value;
      $$('[data-f="opt"]', fs).forEach((inp) => { q.options[Number(inp.dataset.k)] = inp.value; });
      const c = $('[data-f="correct"]:checked', fs);
      if (c) q.correct_index = Number(c.value);
    });
  };

  d.innerHTML = `<form class="modal-body" novalidate>
    <h2 class="modal-title" id="ed-title">${isNew ? 'Review the new test' : 'Edit test'}</h2>
    ${isNew && q0.source === 'pdf' ? notice('warn', '<strong>AI-made questions can contain mistakes.</strong><p class="mb-0">Check every question and the correct option before you publish.</p>') : ''}
    <div class="grid grid-2 mt-sm">
      <div class="field"><label for="e-title">Title *</label><input id="e-title" maxlength="140" value="${esc(q0.title)}"></div>
      <div class="field"><label for="e-kind">Type</label><select id="e-kind"><option value="weekly_test" ${q0.kind === 'weekly_test' ? 'selected' : ''}>Weekly test</option><option value="dpp" ${q0.kind === 'dpp' ? 'selected' : ''}>DPP</option></select></div>
      <div class="field"><label for="e-subject">Subject</label><select id="e-subject"><option value="">All / mixed</option>${subjects.map((s) => `<option value="${esc(s.id)}" ${q0.subject_id === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="e-date">Date</label><input id="e-date" type="date" value="${esc(q0.test_date || '')}"></div>
      <div class="field"><label for="e-time">Total time (minutes, 0 = none)</label><input id="e-time" type="number" min="0" max="600" value="${esc(q0.total_time_min ?? 0)}"></div>
    </div>
    <label class="check"><input type="checkbox" id="e-pub" ${q0.is_published ? 'checked' : ''}><span><strong>Published</strong> — students can see and attempt it</span></label>
    <hr class="divider">
    <div id="ed-list"></div>
    <button type="button" class="btn btn-secondary btn-sm" id="ed-add">${icon('plus', 16)} Add question</button>
    <p class="error-text" id="ed-error" role="alert"></p>
    <div class="modal-actions"><button type="button" class="btn btn-secondary" data-cancel>Cancel</button><button type="submit" class="btn btn-primary">Save</button></div>
  </form>`;
  document.body.append(d);
  paint();
  $('#ed-add', d).addEventListener('click', () => { collect(); qs.push(blankQ()); paint(); $$('#ed-list fieldset', d).at(-1)?.scrollIntoView({ block: 'center' }); });
  $('[data-cancel]', d).addEventListener('click', () => { d.close(); d.remove(); });
  d.addEventListener('cancel', () => d.remove());

  $('form', d).addEventListener('submit', async (e) => {
    e.preventDefault();
    collect();
    const err = $('#ed-error', d);
    const title = $('#e-title', d).value.trim();
    const clean = qs.map((q) => ({
      topic: q.topic.trim() || 'General', question_text: q.question_text.trim(),
      options: q.options.map((o) => o.trim()), correct_index: q.correct_index,
      explanation: (q.explanation || '').trim() || null, id: q.id,
    }));
    const badAt = clean.findIndex((q) => !q.question_text || q.options.some((o) => !o) || new Set(q.options.map((o) => o.toLowerCase())).size !== 4);
    if (!title) { err.textContent = 'Please add a title.'; return; }
    if (badAt >= 0) { err.textContent = `Question ${badAt + 1} needs a question and four different options.`; return; }
    err.textContent = '';
    const btn = $('[type="submit"]', d);
    setBusy(btn, true, 'Saving…');
    try {
      const row = {
        title, kind: $('#e-kind', d).value, subject_id: $('#e-subject', d).value || null,
        test_date: $('#e-date', d).value || null, total_time_min: clampNum($('#e-time', d).value, 0, 600),
        is_published: $('#e-pub', d).checked, source: q0.source || 'manual', chapter_id: null,
      };
      let id = q0.id;
      if (id) unwrap(await supabase.from('quizzes').update(row).eq('id', id));
      else id = unwrap(await supabase.from('quizzes').insert(row).select('id').single()).id;

      const keep = new Set(clean.map((q) => q.id).filter(Boolean));
      const removed = [...originalIds].filter((x) => !keep.has(x));
      if (removed.length) unwrap(await supabase.from('questions').delete().in('id', removed));
      for (let i = 0; i < clean.length; i += 1) {
        const { id: qid, ...fields } = clean[i];
        const payload = { ...fields, sort_order: i + 1 };
        if (qid) unwrap(await supabase.from('questions').update(payload).eq('id', qid));
      }
      const fresh = clean.map((q, i) => ({ q, i })).filter(({ q }) => !q.id).map(({ q, i }) => {
        const { id: _drop, ...fields } = q;
        return { ...fields, quiz_id: id, sort_order: i + 1 };
      });
      if (fresh.length) unwrap(await supabase.from('questions').insert(fresh));
      d.close(); d.remove();
      toast(row.is_published ? 'Saved and published.' : 'Saved as draft.', 'success');
      renderTestsAdmin(root);
    } catch (ex) {
      setBusy(btn, false);
      err.textContent = friendlyError(ex);
    }
  });
  d.showModal();
}
