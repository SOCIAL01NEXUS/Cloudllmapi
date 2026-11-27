/* ==========================================================================
   Study Buddy — quiz engine
   • 4-option MCQs, one correct answer + explanation
   • optional per-question timer, optional NEET-style negative marking (+4 / −1)
   • result page: score, accuracy, time taken, weak topics, revision suggestions
   • the attempt is saved through the submit_quiz_attempt() database function,
     which re-marks the answers on the server and stores them for this user only.
   ========================================================================== */

import { supabase, unwrap, isUuid } from './supabase.js';
import { initShell, $, $$, esc, icon, emptyState, skeletonLines, toast, friendlyError, notice, formatDuration, progressBar } from './ui.js';

const KEYS = ['A', 'B', 'C', 'D'];
const MARKS_CORRECT = 4;
const MARKS_WRONG = -1;

const S = {
  quiz: null,
  questions: [],
  opts: { perQ: 0, negative: false, instant: false, totalSec: 0 },
  totalId: null,
  totalDeadline: 0,
  idx: 0,
  answers: [], // selected index or null
  spent: [], // seconds per question
  startedAt: 0,
  qStart: 0,
  timerId: null,
  deadline: 0,
  locked: false,
};

const root = () => $('#quiz-root');
const KIND_LABEL = { chapter: 'Chapter quiz', dpp: 'DPP', weekly_test: 'Weekly test' };
const isTest = () => S.quiz && S.quiz.kind !== 'chapter';
const backHref = () => (S.quiz.chapter_id ? `chapter.html?id=${S.quiz.chapter_id}#practice` : 'tests.html');

/* ---------- setup screen ---------- */
function renderSetup() {
  finishing = false;
  const q = S.quiz;
  const n = S.questions.length;
  const defaultTimer = q.time_per_question_sec || 0;
  const weekly = q.kind === 'weekly_test';
  const tst = isTest();
  root().innerHTML = `
    <div class="card anim-fade-up" style="max-width:640px;margin-inline:auto">
      <p class="small mb-0"><a href="${esc(backHref())}">${icon('back', 16)} ${esc(q.chapter_id ? (q.chapters?.title || 'Chapter') : 'Tests & DPP')}</a></p>
      <h1 class="mt-sm">${esc(q.title)}</h1>
      <p class="muted"><span class="badge">${esc(KIND_LABEL[q.kind] || 'Quiz')}</span> ${n} question${n === 1 ? '' : 's'}${q.is_pyq && q.pyq_year ? ` · Previous-year set (${esc(q.pyq_year)})` : ''}${q.test_date ? ` · ${esc(q.test_date)}` : ''}${!q.is_published ? ' · <strong>Draft (only admins can see this)</strong>' : ''}</p>
      <form id="setup-form" class="stack-sm" novalidate>
        ${weekly ? `<div class="notice info"><strong>Weekly test — exam rules</strong><p class="mb-0">${q.total_time_min ? `You have ${q.total_time_min} minutes in total; the test submits itself when time ends. ` : ''}Answers and explanations are shown after you finish. Negative marking (+4 / −1) is on.</p></div>` : ''}
        ${!weekly && !tst ? `<div class="field">
          <label for="opt-timer">Timer per question</label>
          <select id="opt-timer">
            <option value="0" ${defaultTimer === 0 ? 'selected' : ''}>Off — take your time</option>
            ${[30, 45, 60, 90, 120].map((s) => `<option value="${s}" ${defaultTimer === s ? 'selected' : ''}>${s} seconds</option>`).join('')}
          </select>
          <span class="hint">With a timer on, you move forward only (like the real exam hall rhythm).</span>
        </div>` : ''}
        ${tst && !weekly ? `<div class="field">
          <label for="opt-total">Total time</label>
          <select id="opt-total">
            <option value="0">Off — take your time</option>
            ${[10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${q.total_time_min === m ? 'selected' : ''}>${m} minutes</option>`).join('')}
          </select>
          <span class="hint">The set submits itself when time ends.</span>
        </div>` : ''}
        ${weekly ? '' : `<label class="check"><input type="checkbox" id="opt-neg" ${q.is_pyq || tst ? 'checked' : ''}><span><strong>NEET-style negative marking</strong><br><span class="hint">+4 for a correct answer, −1 for a wrong one, 0 if skipped.</span></span></label>
        <label class="check"><input type="checkbox" id="opt-instant"><span><strong>Instant feedback (practice mode)</strong><br><span class="hint">See the answer and explanation right after each question.</span></span></label>`}
        <button class="btn btn-primary btn-block mt-sm" type="submit" ${n ? '' : 'disabled'}>Start quiz</button>
      </form>
    </div>`;
  $('#setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    S.opts = {
      perQ: $('#opt-timer') ? Number($('#opt-timer').value) || 0 : 0,
      negative: weekly ? true : $('#opt-neg').checked,
      instant: weekly ? false : $('#opt-instant').checked,
      totalSec: weekly ? (q.total_time_min || 0) * 60 : ($('#opt-total') ? (Number($('#opt-total').value) || 0) * 60 : 0),
    };
    startQuiz();
  });
}

/* ---------- running ---------- */
function startQuiz() {
  S.idx = 0;
  S.answers = Array(S.questions.length).fill(null);
  S.spent = Array(S.questions.length).fill(0);
  S.startedAt = Date.now();
  clearInterval(S.totalId);
  if (S.opts.totalSec > 0) {
    S.totalDeadline = Date.now() + S.opts.totalSec * 1000;
    S.totalId = setInterval(totalTick, 500);
  }
  renderQuestion();
}

function stopTimer() { clearInterval(S.timerId); S.timerId = null; }

function totalTick() {
  const left = Math.max(0, Math.ceil((S.totalDeadline - Date.now()) / 1000));
  const t = $('#ttimer-text');
  if (t) t.textContent = formatDuration(left);
  $('#ttimer')?.classList.toggle('low', left <= 60);
  if (left <= 0) { clearInterval(S.totalId); bankTime(); toast('Time is up — your test was submitted.', 'info', 5000); finish(); }
}

function bankTime() {
  S.spent[S.idx] = (S.spent[S.idx] || 0) + (Date.now() - S.qStart) / 1000;
  S.qStart = Date.now();
}

function renderQuestion() {
  stopTimer();
  S.locked = false;
  S.qStart = Date.now();
  const q = S.questions[S.idx];
  const total = S.questions.length;
  const sel = S.answers[S.idx];
  const timed = S.opts.perQ > 0;
  const options = q.options;

  root().innerHTML = `
    <div class="card" style="max-width:760px;margin-inline:auto">
      <div class="quiz-top">
        <span>Question ${S.idx + 1} / ${total}</span>
        ${S.opts.totalSec > 0 ? `<span class="timer" id="ttimer" role="timer" aria-live="off" title="Time left in the test">${icon('clock', 16)}<span id="ttimer-text">${formatDuration(S.opts.totalSec)}</span></span>` : ''}
        ${timed ? `<span class="timer" id="timer" role="timer" aria-live="off">${icon('clock', 16)}<span id="timer-text">${S.opts.perQ}s</span></span>` : ''}
      </div>
      ${progressBar(((S.idx) / total) * 100, 'Quiz progress', 'indigo')}
      <p class="small muted mt-sm"><span class="badge">${esc(q.topic)}</span></p>
      <div class="q-text" id="q-text">${esc(q.question_text)}</div>
      <div class="options" role="radiogroup" aria-labelledby="q-text">
        ${options.map((o, i) => `
          <button type="button" class="option" role="radio" aria-checked="${sel === i}" data-i="${i}">
            <span class="opt-key">${KEYS[i]}</span><span>${esc(o)}</span>
          </button>`).join('')}
      </div>
      <div id="feedback" aria-live="polite"></div>
      <div class="row-between mt">
        <div class="row">
          ${!timed && S.idx > 0 ? `<button class="btn btn-secondary" id="prev-btn" type="button">${icon('back', 18)} Previous</button>` : ''}
          <button class="btn btn-ghost" id="clear-btn" type="button">Clear</button>
        </div>
        <button class="btn btn-primary" id="next-btn" type="button">${S.idx === total - 1 ? 'Finish quiz' : 'Next'} ${icon('arrow', 18)}</button>
      </div>
      ${!timed ? `<hr class="divider"><p class="label">Question palette</p><div class="palette" id="palette">
        ${S.questions.map((_, i) => `<button type="button" data-go="${i}" class="${S.answers[i] !== null ? 'answered' : ''} ${i === S.idx ? 'current' : ''}" aria-label="Go to question ${i + 1}${S.answers[i] !== null ? ', answered' : ''}">${i + 1}</button>`).join('')}
      </div>` : ''}
    </div>`;

  $$('.option').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.i))));
  $('#clear-btn').addEventListener('click', () => { if (!S.locked) { S.answers[S.idx] = null; renderQuestionKeepTimer(); } });
  $('#next-btn').addEventListener('click', () => advance());
  $('#prev-btn')?.addEventListener('click', () => go(S.idx - 1));
  $$('#palette button').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));

  if (sel !== null && S.opts.instant) showFeedback();
  if (S.opts.totalSec > 0) totalTick();

  if (timed) {
    S.deadline = Date.now() + S.opts.perQ * 1000;
    S.timerId = setInterval(tick, 250);
    tick();
  }
}

function renderQuestionKeepTimer() {
  // Re-render options only (used by "Clear") without resetting the countdown.
  $$('.option').forEach((b) => b.setAttribute('aria-checked', 'false'));
  $$('#palette button').forEach((b, i) => b.classList.toggle('answered', S.answers[i] !== null));
}

function tick() {
  const remaining = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
  const t = $('#timer-text');
  if (t) t.textContent = `${remaining}s`;
  $('#timer')?.classList.toggle('low', remaining <= 10);
  if (remaining <= 0) advance(true);
}

function choose(i) {
  if (S.locked) return;
  S.answers[S.idx] = i;
  $$('.option').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.i) === i)));
  $$('#palette button').forEach((b, k) => b.classList.toggle('answered', S.answers[k] !== null));
  if (S.opts.instant) showFeedback();
}

function showFeedback() {
  const q = S.questions[S.idx];
  const sel = S.answers[S.idx];
  S.locked = true;
  if (S.opts.perQ > 0) stopTimer();
  $$('.option').forEach((b) => {
    const i = Number(b.dataset.i);
    b.disabled = true;
    if (i === q.correct_index) b.classList.add('correct');
    else if (i === sel) b.classList.add('wrong');
  });
  $('#feedback').innerHTML = `<div class="explain"><strong>${sel === q.correct_index ? 'Correct!' : `Correct answer: ${KEYS[q.correct_index]}`}</strong><p class="mb-0">${esc(q.explanation || 'No explanation added yet.')}</p></div>`;
}

function go(i) {
  if (i < 0 || i >= S.questions.length) return;
  bankTime();
  S.idx = i;
  renderQuestion();
}

function advance(fromTimer = false) {
  bankTime();
  if (S.idx >= S.questions.length - 1) { finish(); return; }
  S.idx += 1;
  renderQuestion();
}

/* ---------- scoring ---------- */
function scoreLocal() {
  let correct = 0; let incorrect = 0; let unanswered = 0;
  S.questions.forEach((q, i) => {
    const a = S.answers[i];
    if (a === null) unanswered += 1;
    else if (a === q.correct_index) correct += 1;
    else incorrect += 1;
  });
  const score = correct * MARKS_CORRECT + (S.opts.negative ? incorrect * MARKS_WRONG : 0);
  const attempted = correct + incorrect;
  return {
    correct_count: correct, incorrect_count: incorrect, unanswered_count: unanswered,
    score, max_score: S.questions.length * MARKS_CORRECT,
    accuracy: attempted ? Math.round((correct / attempted) * 1000) / 10 : 0,
  };
}

let finishing = false;
async function finish() {
  if (finishing) return;
  finishing = true;
  stopTimer();
  clearInterval(S.totalId);
  const totalSeconds = Math.round((Date.now() - S.startedAt) / 1000);
  root().innerHTML = `<div class="card" style="max-width:640px;margin-inline:auto">${skeletonLines(5)}<p class="muted center">Marking your answers…</p></div>`;

  let result = { ...scoreLocal(), time_taken_sec: totalSeconds };
  let saved = false;
  try {
    const payload = S.questions.map((q, i) => ({ q: q.id, sel: S.answers[i], t: Math.round(S.spent[i] || 0) }));
    const row = unwrap(await supabase.rpc('submit_quiz_attempt', {
      p_quiz_id: S.quiz.id,
      p_answers: payload,
      p_negative: S.opts.negative,
      p_time_seconds: totalSeconds,
    }));
    result = { ...result, ...row };
    saved = true;
  } catch (err) {
    toast(`Your result is shown below, but it could not be saved: ${friendlyError(err)}`, 'error', 7000);
  }
  renderResult(result, saved);
}

function weakTopics() {
  const map = new Map();
  S.questions.forEach((q, i) => {
    const a = S.answers[i];
    if (a !== null && a !== q.correct_index) map.set(q.topic, (map.get(q.topic) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function renderResult(r, saved) {
  const weak = weakTopics();
  const pct = r.max_score ? Math.max(0, (r.score / r.max_score) * 100) : 0;
  const chapterId = S.quiz.chapter_id;

  root().innerHTML = `
    <div class="stack anim-fade-up" style="max-width:760px;margin-inline:auto">
      <div class="card">
        <div class="score-ring">
          <div class="score-big">${esc(r.score)}<span class="muted" style="font-size:1.2rem"> / ${esc(r.max_score)}</span></div>
          <p class="muted mb-0">${pct >= 75 ? 'Excellent work!' : pct >= 50 ? 'Good effort — keep refining.' : 'Every attempt teaches you something. Review below.'}</p>
        </div>
        ${progressBar(pct, 'Score')}
        <div class="grid grid-4 mt">
          <div class="stat teal"><span class="stat-value">${esc(r.correct_count)}</span><span class="stat-label">Correct</span></div>
          <div class="stat"><span class="stat-value" style="color:var(--danger)">${esc(r.incorrect_count)}</span><span class="stat-label">Incorrect</span></div>
          <div class="stat amber"><span class="stat-value">${esc(r.accuracy)}%</span><span class="stat-label">Accuracy</span></div>
          <div class="stat indigo"><span class="stat-value">${esc(formatDuration(r.time_taken_sec))}</span><span class="stat-label">Time taken</span></div>
        </div>
        <p class="hint mt-sm mb-0">Accuracy = correct ÷ attempted. ${r.unanswered_count} skipped. ${S.opts.negative ? 'Negative marking was on (+4 / −1).' : 'Negative marking was off.'} ${saved ? 'Attempt saved to your private history.' : 'Not saved.'}</p>
      </div>

      <div class="card">
        <div class="card-title">${icon('revision', 22)}<h2>Weak topics & revision plan</h2></div>
        ${weak.length ? `
          <ul class="point-list">${weak.map(([t, n]) => `<li><strong>${esc(t)}</strong> — ${n} mistake${n === 1 ? '' : 's'}</li>`).join('')}</ul>
          ${chapterId ? `<p class="mt-sm">Suggested next steps:</p>
          <div class="row">
            <a class="btn btn-primary btn-sm" href="chapter.html?id=${esc(chapterId)}#overview">Re-read important points</a>
            <a class="btn btn-secondary btn-sm" href="chapter.html?id=${esc(chapterId)}#flashcards">Revise flashcards</a>
            <a class="btn btn-secondary btn-sm" href="chapter.html?id=${esc(chapterId)}#videos">Rewatch the lesson</a>
          </div>` : '<p class="mt-sm hint">Revise these topics from the matching chapters in Study.</p>'}`
          : notice('success', '<strong>No incorrect answers.</strong><p>Nothing to revise from this attempt. Try a harder or timed set next.</p>')}
      </div>

      <div class="card">
        <div class="row-between"><div class="card-title mb-0">${icon('eye', 22)}<h2>Review answers</h2></div>
          <label class="check"><input type="checkbox" id="only-wrong"><span>Only mistakes & skipped</span></label></div>
        <div id="review-list" class="mt-sm"></div>
      </div>

      <div class="row">
        <button class="btn btn-primary" id="retry-btn" type="button">Try again</button>
        <a class="btn btn-secondary" href="${esc(backHref())}">${chapterId ? 'Back to chapter' : 'Back to Tests'}</a>
        <a class="btn btn-ghost" href="progress.html">My progress</a>
      </div>
    </div>`;

  const paintReview = () => {
    const only = $('#only-wrong').checked;
    const items = S.questions.map((q, i) => ({ q, i, a: S.answers[i] })).filter(({ q, a }) => !only || a !== q.correct_index);
    $('#review-list').innerHTML = items.length ? items.map(({ q, i, a }) => `
      <div class="review-item">
        <p><strong>Q${i + 1}.</strong> ${esc(q.question_text)} <span class="badge">${esc(q.topic)}</span></p>
        <div class="options">${q.options.map((o, k) => `
          <div class="option ${k === q.correct_index ? 'correct' : (k === a ? 'wrong' : '')}" aria-disabled="true" style="cursor:default">
            <span class="opt-key">${KEYS[k]}</span><span>${esc(o)}${k === q.correct_index ? ' ✓' : ''}${k === a && k !== q.correct_index ? ' (your answer)' : ''}</span>
          </div>`).join('')}</div>
        ${a === null ? '<p class="small muted mt-sm mb-0">You skipped this question.</p>' : ''}
        <div class="explain"><strong>Explanation</strong><p class="mb-0">${esc(q.explanation || 'No explanation added yet.')}</p></div>
      </div>`).join('') : '<p class="muted">Nothing to show here — great job!</p>';
  };
  $('#only-wrong').addEventListener('change', paintReview);
  paintReview();
  $('#retry-btn').addEventListener('click', () => renderSetup());
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- boot ---------- */
async function main() {
  const ctx = await initShell();
  if (!ctx) return;

  const id = new URLSearchParams(location.search).get('quiz');
  if (!isUuid(id)) {
    root().innerHTML = emptyState({ icon: 'quiz', title: 'Quiz not found', text: 'Open a quiz from a chapter page.', actionHtml: '<a class="btn btn-primary" href="subjects.html">Browse subjects</a>' });
    return;
  }
  root().innerHTML = `<div class="card" style="max-width:640px;margin-inline:auto">${skeletonLines(5)}</div>`;

  try {
    const [qz, qs] = await Promise.all([
      supabase.from('quizzes').select('id, title, chapter_id, kind, test_date, total_time_min, is_published, is_pyq, pyq_year, time_per_question_sec, chapters(title)').eq('id', id).maybeSingle(),
      supabase.from('questions').select('id, topic, question_text, options, correct_index, explanation, sort_order').eq('quiz_id', id).order('sort_order').order('id'),
    ]);
    S.quiz = unwrap(qz);
    if (!S.quiz) throw new Error('This quiz does not exist or is not published.');
    S.questions = (unwrap(qs) || []).filter((q) => Array.isArray(q.options) && q.options.length === 4);
  } catch (err) {
    root().innerHTML = notice('danger', `<strong>Could not load this quiz.</strong><p>${esc(friendlyError(err))}</p>`);
    return;
  }
  document.title = `${S.quiz.title} · Study Buddy`;
  renderSetup();
}

main();
