/* ==========================================================================
   Study Buddy — chapter page: NCERT points, formulas, YouTube lessons,
   practice quizzes, previous-year practice, revision flashcards,
   and the "Mark as completed" button.
   ========================================================================== */

import { supabase, unwrap, isUuid } from './supabase.js';
import { initShell, $, $$, esc, icon, emptyState, skeletonLines, toast, friendlyError, notice, subjectIconName } from './ui.js';
import { createPlayer } from './youtube.js';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'formulas', label: 'Formulas & diagrams' },
  { id: 'videos', label: 'Video lessons' },
  { id: 'practice', label: 'Practice & PYQ' },
  { id: 'flashcards', label: 'Flashcards' },
];

const arr = (v) => (Array.isArray(v) ? v : []);

let ctx;
let chapter;
let lessons = [];
let quizzes = [];
let progress = null; // lesson_progress row or null
let player = null;
let playerLessonId = null;

function renderHeader() {
  const unit = chapter.units;
  const subject = unit?.subjects;
  $('#chapter-head').innerHTML = `
    <p class="small"><a href="subjects.html#${esc(subject?.slug || '')}">${icon('back', 16)} ${esc(subject?.name || 'Subjects')}</a>
      <span class="muted"> · ${esc(unit?.title || '')}</span></p>
    <div class="row-between">
      <div class="row" style="flex-wrap:nowrap">
        <div class="subject-icon ${esc(subject?.slug || '')}">${icon(subjectIconName(subject?.slug), 28)}</div>
        <div><h1 class="mb-0">${esc(chapter.title)}</h1></div>
      </div>
      <button id="complete-btn" class="btn" type="button" aria-pressed="false"></button>
    </div>
    <p class="muted mt-sm mb-0">${esc(chapter.description || '')}</p>`;
  paintCompleteButton();
  $('#complete-btn').addEventListener('click', toggleComplete);
}

function paintCompleteButton() {
  const btn = $('#complete-btn');
  const done = !!progress?.completed;
  btn.className = `btn ${done ? 'btn-success' : 'btn-primary'}`;
  btn.setAttribute('aria-pressed', String(done));
  btn.innerHTML = done ? `${icon('check', 18)} Completed` : `${icon('check', 18)} Mark as completed`;
}

async function toggleComplete() {
  const btn = $('#complete-btn');
  const next = !progress?.completed;
  btn.disabled = true;
  try {
    const row = unwrap(await supabase.from('lesson_progress').upsert({
      user_id: ctx.user.id,
      chapter_id: chapter.id,
      completed: next,
      completed_at: next ? new Date().toISOString() : null,
    }, { onConflict: 'user_id,chapter_id' }).select().single());
    progress = row;
    paintCompleteButton();
    toast(next ? 'Chapter marked as completed. Nice work!' : 'Marked as not completed.', 'success');
  } catch (err) {
    toast(friendlyError(err), 'error');
  } finally {
    btn.disabled = false;
  }
}

/* ---------- panels ---------- */
function renderOverview() {
  const points = arr(chapter.important_points);
  $('#panel-overview').innerHTML = `
    <div class="card">
      <div class="card-title">${icon('book', 22)}<h2>NCERT-focused important points</h2></div>
      ${points.length ? `<ul class="point-list">${points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`
        : emptyState({ icon: 'book', title: 'Notes coming soon', text: 'Important points for this chapter have not been added yet.' })}
    </div>`;
}

function renderFormulas() {
  const formulas = arr(chapter.formulas);
  const diagrams = arr(chapter.diagrams);
  $('#panel-formulas').innerHTML = `
    <div class="stack">
      <div class="card">
        <div class="card-title">${icon('sparkle', 22)}<h2>Formulas, reactions & key facts</h2></div>
        ${formulas.length ? `<div class="stack-sm">${formulas.map((f) => `
          <div class="formula"><div class="f-label">${esc(f.label)}</div><div class="f-text">${esc(f.text)}</div></div>`).join('')}</div>`
          : emptyState({ icon: 'sparkle', title: 'Nothing here yet', text: 'Formulas and reactions for this chapter have not been added yet.' })}
      </div>
      <div class="card">
        <div class="card-title">${icon('eye', 22)}<h2>Diagrams to practise</h2></div>
        ${diagrams.length ? `<ul class="point-list">${diagrams.map((d) => `<li><strong>${esc(d.title)}</strong>${d.note ? ` — ${esc(d.note)}` : ''}</li>`).join('')}</ul>`
          : '<p class="muted mb-0">No diagram checklist for this chapter yet.</p>'}
        <p class="hint mt-sm mb-0">Tip: close the book and redraw each one from memory, then compare with your NCERT.</p>
      </div>
    </div>`;
}

function renderVideos() {
  const root = $('#panel-videos');
  if (!lessons.length) {
    root.innerHTML = emptyState({ icon: 'play', title: 'No video lessons yet', text: 'Your admin can add YouTube class links to this chapter from the Admin panel.' });
    return;
  }
  const watched = new Set(arr(progress?.watched_lessons));
  root.innerHTML = `
    <div class="grid grid-2" style="grid-template-columns:minmax(0,1fr)">
      <div class="video-frame"><div id="yt-player"></div></div>
      <div class="stack-sm" id="lesson-list">${lessons.map((l, i) => `
        <button class="lesson-btn" type="button" data-id="${esc(l.id)}" aria-current="${i === 0}">
          ${icon('play', 22)}<span style="flex:1">${esc(l.title)}</span>
          <span class="badge badge-success" data-watched="${esc(l.id)}" ${watched.has(l.id) ? '' : 'hidden'}>Watched</span>
        </button>`).join('')}</div>
    </div>
    <p class="hint mt-sm">Videos play through the official YouTube player (privacy-enhanced mode).</p>`;
  $$('#lesson-list .lesson-btn').forEach((b) => b.addEventListener('click', () => playLesson(b.dataset.id)));
  playLesson(lessons[0].id, false);
}

async function playLesson(id, autoplay = true) {
  const lesson = lessons.find((l) => l.id === id);
  if (!lesson) return;
  $$('#lesson-list .lesson-btn').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === id)));
  try {
    if (!player) {
      // First load: create the player. Replace the host element each time to avoid stale iframes.
      player = await createPlayer('yt-player', lesson.youtube_id, { onEnded: () => markWatched(playerLessonId) });
      playerLessonId = id;
      return;
    }
    playerLessonId = id;
    if (autoplay) player.loadVideoById(lesson.youtube_id);
    else player.cueVideoById(lesson.youtube_id);
  } catch (err) {
    $('#panel-videos').insertAdjacentHTML('afterbegin', notice('danger', esc(friendlyError(err))));
  }
}

async function markWatched(lessonId) {
  if (!lessonId) return;
  const watched = new Set(arr(progress?.watched_lessons));
  if (watched.has(lessonId)) return;
  watched.add(lessonId);
  try {
    progress = unwrap(await supabase.from('lesson_progress').upsert({
      user_id: ctx.user.id,
      chapter_id: chapter.id,
      watched_lessons: [...watched].slice(0, 200),
    }, { onConflict: 'user_id,chapter_id' }).select().single());
    const badge = $(`[data-watched="${CSS.escape(lessonId)}"]`);
    if (badge) badge.hidden = false;
  } catch { /* non-critical */ }
}

function quizCard(q) {
  const count = q.questions?.[0]?.count ?? 0;
  return `<a class="card" href="quiz.html?quiz=${encodeURIComponent(q.id)}">
    <div class="row-between"><h3 class="mb-0">${esc(q.title)}</h3>${q.is_pyq && q.pyq_year ? `<span class="badge badge-amber">${esc(q.pyq_year)}</span>` : ''}</div>
    <p class="muted small mb-0 mt-sm">${count} question${count === 1 ? '' : 's'}${q.time_per_question_sec ? ` · ${q.time_per_question_sec}s per question` : ''}</p>
  </a>`;
}

function renderPractice() {
  const regular = quizzes.filter((q) => !q.is_pyq);
  const pyq = quizzes.filter((q) => q.is_pyq);
  $('#panel-practice').innerHTML = `
    <div class="stack">
      <div>
        <div class="card-title">${icon('quiz', 22)}<h2>Chapter-wise MCQ quiz</h2></div>
        ${regular.length ? `<div class="grid grid-2">${regular.map(quizCard).join('')}</div>`
          : emptyState({ icon: 'quiz', title: 'No quiz yet', text: 'A chapter quiz has not been added yet.' })}
      </div>
      <div>
        <div class="card-title">${icon('clock', 22)}<h2>Previous-year question practice</h2></div>
        ${pyq.length ? `<div class="grid grid-2">${pyq.map(quizCard).join('')}</div>`
          : emptyState({ icon: 'clock', title: 'No PYQ set yet', text: 'Your admin can add previous-year questions (with the exam year) from the Admin panel.' })}
      </div>
    </div>`;
}

/* ---------- flashcards ---------- */
let deck = [];
let cardIdx = 0;

function renderFlashcards() {
  const root = $('#panel-flashcards');
  deck = arr(chapter.flashcards).filter((c) => c && c.q && c.a);
  if (!deck.length) {
    root.innerHTML = emptyState({ icon: 'revision', title: 'No flashcards yet', text: 'Revision flashcards for this chapter have not been added yet.' });
    return;
  }
  cardIdx = 0;
  root.innerHTML = `
    <div class="card-title">${icon('revision', 22)}<h2>Revision flashcards</h2></div>
    <p class="muted small" id="card-counter" aria-live="polite"></p>
    <div class="flash-wrap"><button type="button" class="flashcard" id="flashcard" aria-label="Flashcard. Press to flip."></button></div>
    <div class="row mt" style="justify-content:center">
      <button class="btn btn-secondary" id="card-prev" type="button">${icon('back', 18)} Previous</button>
      <button class="btn btn-primary" id="card-flip" type="button">Flip card</button>
      <button class="btn btn-secondary" id="card-next" type="button">Next ${icon('arrow', 18)}</button>
    </div>
    <div class="row mt-sm" style="justify-content:center"><button class="btn btn-ghost btn-sm" id="card-shuffle" type="button">Shuffle</button></div>`;
  paintCard();
  const flip = () => $('#flashcard').classList.toggle('flipped');
  $('#flashcard').addEventListener('click', flip);
  $('#card-flip').addEventListener('click', flip);
  $('#card-prev').addEventListener('click', () => { cardIdx = (cardIdx - 1 + deck.length) % deck.length; paintCard(); });
  $('#card-next').addEventListener('click', () => { cardIdx = (cardIdx + 1) % deck.length; paintCard(); });
  $('#card-shuffle').addEventListener('click', () => {
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    cardIdx = 0; paintCard();
  });
}

function paintCard() {
  const c = deck[cardIdx];
  const el = $('#flashcard');
  el.classList.remove('flipped');
  el.innerHTML = `<div class="flash-face front"><small>Question</small><span>${esc(c.q)}</span></div><div class="flash-face back"><small>Answer</small><span>${esc(c.a)}</span></div>`;
  $('#card-counter').textContent = `Card ${cardIdx + 1} of ${deck.length}`;
}

/* ---------- tabs ---------- */
function activateTab(id) {
  if (!TABS.some((t) => t.id === id)) id = 'overview';
  $$('#chapter-tabs .tab').forEach((t) => {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $$('.tab-panel').forEach((p) => { p.hidden = p.id !== `panel-${id}`; });
  if (history.replaceState) history.replaceState(null, '', `${location.search}#${id}`);
}

async function main() {
  ctx = await initShell();
  if (!ctx) return;

  const root = $('#chapter-root');
  const id = new URLSearchParams(location.search).get('id');
  if (!isUuid(id)) {
    root.innerHTML = emptyState({ icon: 'book', title: 'Chapter not found', text: 'That link looks incorrect.', actionHtml: '<a class="btn btn-primary" href="subjects.html">Browse subjects</a>' });
    return;
  }
  $('#chapter-head').innerHTML = skeletonLines(3);

  try {
    const [chRes, lessonRes, quizRes, progRes] = await Promise.all([
      supabase.from('chapters').select('*, units(id, title, subjects(id, name, slug, category))').eq('id', id).maybeSingle(),
      supabase.from('lessons').select('id, title, youtube_id, sort_order').eq('chapter_id', id).order('sort_order'),
      supabase.from('quizzes').select('id, title, is_pyq, pyq_year, time_per_question_sec, sort_order, questions(count)').eq('chapter_id', id).order('sort_order'),
      supabase.from('lesson_progress').select('*').eq('chapter_id', id).maybeSingle(),
    ]);
    chapter = unwrap(chRes);
    if (!chapter) throw new Error('This chapter does not exist or is not published yet.');
    lessons = unwrap(lessonRes) || [];
    quizzes = unwrap(quizRes) || [];
    progress = unwrap(progRes);
  } catch (err) {
    $('#chapter-head').innerHTML = '';
    root.innerHTML = notice('danger', `<strong>Could not open this chapter.</strong><p>${esc(friendlyError(err))}</p>`);
    return;
  }

  document.title = `${chapter.title} · Study Buddy`;
  renderHeader();

  $('#chapter-tabs').innerHTML = TABS.map((t) => `<button class="tab" role="tab" type="button" data-tab="${t.id}" aria-selected="false" aria-controls="panel-${t.id}">${esc(t.label)}</button>`).join('');
  $$('#chapter-tabs .tab').forEach((t) => t.addEventListener('click', () => activateTab(t.dataset.tab)));

  renderOverview(); renderFormulas(); renderVideos(); renderPractice(); renderFlashcards();
  activateTab(location.hash.replace('#', '') || 'overview');

  // Remember that the student opened this chapter (used only for their own "continue learning" shortcut).
  supabase.from('lesson_progress').upsert(
    { user_id: ctx.user.id, chapter_id: chapter.id, last_opened_at: new Date().toISOString() },
    { onConflict: 'user_id,chapter_id' },
  ).then(({ data }) => data); // fire and forget
}

main();
