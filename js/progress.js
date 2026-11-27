/* ==========================================================================
   Study Buddy — dashboard + progress page (+ study-partner panel)
   Everything shown here belongs to the logged-in student only.
   ========================================================================== */

import { supabase, unwrap, localDateStr } from './supabase.js';
import { initShell, $, esc, icon, subjectIconName, progressBar, emptyState, skeletonCards, friendlyError, notice, formatDate, formatDuration } from './ui.js';
import { renderPartner } from './partner.js';
import { getTapState, noteCardHtml, startTaps } from './taps.js';

const page = document.body.dataset.page;

async function loadCore() {
  const [subj, streak, today, attempts, recent] = await Promise.all([
    supabase.rpc('my_subject_progress'),
    supabase.rpc('my_streak', { p_today: localDateStr() }),
    supabase.from('daily_goals').select('completion_pct').eq('goal_date', localDateStr()).maybeSingle(),
    supabase.from('quiz_attempts').select('id, quiz_id, score, max_score, accuracy, time_taken_sec, created_at, quizzes(title, chapter_id)').order('created_at', { ascending: false }).limit(30),
    supabase.from('lesson_progress').select('chapter_id, last_opened_at, completed, chapters(title)').not('last_opened_at', 'is', null).order('last_opened_at', { ascending: false }).limit(3),
  ]);
  return {
    subjects: unwrap(subj) || [],
    streak: unwrap(streak) || 0,
    todayPct: unwrap(today)?.completion_pct ?? 0,
    attempts: unwrap(attempts) || [],
    recent: unwrap(recent) || [],
  };
}

/* ---------- dashboard ---------- */
async function initDashboard(ctx) {
  const name = (ctx.profile?.full_name || '').split(' ')[0] || 'there';
  $('#hello').textContent = `Hello, ${name} 👋`;
  const root = $('#dash-root');
  root.innerHTML = skeletonCards(3);
  try {
    const [d, tapState] = await Promise.all([loadCore(), getTapState()]);
    const totalCh = d.subjects.reduce((a, s) => a + s.total_chapters, 0);
    const doneCh = d.subjects.reduce((a, s) => a + s.done_chapters, 0);
    const avg = d.attempts.length ? Math.round(d.attempts.reduce((a, r) => a + Number(r.accuracy), 0) / d.attempts.length) : 0;
    const resume = d.recent.find((r) => !r.completed) || d.recent[0];

    root.innerHTML = `
      ${noteCardHtml(tapState.active)}
      <div class="grid grid-4 stagger mt">
        <div class="card stat amber" style="--i:0"><span class="stat-label">${icon('streak', 18)} Streak</span><span class="stat-value">${d.streak}<span class="muted" style="font-size:1rem"> days</span></span></div>
        <div class="card stat teal" style="--i:1"><span class="stat-label">${icon('calendar', 18)} Today's target</span><span class="stat-value">${d.todayPct}%</span></div>
        <div class="card stat indigo" style="--i:2"><span class="stat-label">${icon('book', 18)} Chapters done</span><span class="stat-value">${doneCh}<span class="muted" style="font-size:1rem"> / ${totalCh}</span></span></div>
        <div class="card stat" style="--i:3"><span class="stat-label">${icon('quiz', 18)} Avg. accuracy</span><span class="stat-value">${avg}%</span></div>
      </div>

      <div class="grid grid-2 mt">
        <div class="card">
          <div class="card-title">${icon('play', 22)}<h2>Continue learning</h2></div>
          ${resume ? `<p class="mb-0 mt-sm"><a class="btn btn-primary" href="chapter.html?id=${encodeURIComponent(resume.chapter_id)}">${esc(resume.chapters?.title || 'Open chapter')} ${icon('arrow', 18)}</a></p>`
            : emptyState({ icon: 'book', title: 'Start your first chapter', text: 'Pick a subject and open any chapter. It will show up here next time.', actionHtml: '<a class="btn btn-primary" href="subjects.html">Browse subjects</a>' })}
        </div>
        <div class="card">
          <div class="card-title">${icon('calendar', 22)}<h2>Daily check-in</h2></div>
          ${progressBar(d.todayPct, "Today's target completion", 'lg')}
          <p class="muted small mt-sm">Set a small target, tick it off, keep the streak going.</p>
          <a class="btn btn-secondary" href="daily-checkin.html">Open today's check-in</a>
        </div>
      </div>

      <h2 class="mt">Your subjects</h2>
      <div class="grid grid-2 stagger">${d.subjects.map((s, i) => `
        <a class="card" style="--i:${i}" href="subjects.html#${esc(s.slug)}">
          <div class="row" style="flex-wrap:nowrap"><div class="subject-icon ${esc(s.slug)}">${icon(subjectIconName(s.slug), 26)}</div>
            <div style="flex:1"><h3 class="mb-0">${esc(s.name)}</h3><span class="muted small">${s.done_chapters} of ${s.total_chapters} chapters</span></div></div>
          <div class="mt-sm">${progressBar(s.total_chapters ? (s.done_chapters / s.total_chapters) * 100 : 0, `${s.name} progress`)}</div>
        </a>`).join('') || emptyState({ icon: 'book', title: 'No subjects yet', text: 'Run sql/seed.sql in Supabase to load the sample syllabus.' })}</div>`;
    startTaps(ctx, tapState);
  } catch (err) {
    root.innerHTML = notice('danger', `<strong>Could not load your dashboard.</strong><p>${esc(friendlyError(err))}</p>`);
  }
}

/* ---------- progress ---------- */
async function initProgress() {
  const root = $('#progress-root');
  root.innerHTML = skeletonCards(3);
  try {
    const [d, weakRes] = await Promise.all([loadCore(), supabase.rpc('my_weak_topics')]);
    const weak = unwrap(weakRes) || [];
    const trend = [...d.attempts].reverse().slice(-12);

    root.innerHTML = `
      <div class="card">
        <div class="card-title">${icon('progress', 22)}<h2>Syllabus coverage</h2></div>
        <div class="stack">${d.subjects.map((s) => {
          const pct = s.total_chapters ? (s.done_chapters / s.total_chapters) * 100 : 0;
          return `<div><div class="progress-meta"><span>${esc(s.name)}</span><span>${s.done_chapters}/${s.total_chapters} chapters · ${Math.round(pct)}%</span></div>${progressBar(pct, `${s.name} coverage`)}</div>`;
        }).join('') || '<p class="muted mb-0">No subjects loaded yet.</p>'}</div>
      </div>

      <div class="grid grid-2 mt">
        <div class="card">
          <div class="card-title">${icon('quiz', 22)}<h2>Quiz accuracy trend</h2></div>
          ${trend.length ? `<div class="week-bars" style="grid-template-columns:repeat(${trend.length},1fr)" role="img" aria-label="Accuracy of your last ${trend.length} quizzes">${trend.map((a) => `
            <div class="week-bar ${a.accuracy >= 75 ? 'met' : ''}" title="${esc(a.quizzes?.title || 'Quiz')}: ${a.accuracy}%"><span>${Math.round(a.accuracy)}</span><div class="bar" style="height:${Math.max(3, a.accuracy * 0.9)}px"></div></div>`).join('')}</div>
            <p class="hint mt-sm mb-0">Green bars are 75% accuracy or better.</p>`
            : emptyState({ icon: 'quiz', title: 'No quiz attempts yet', text: 'Take a chapter quiz and your accuracy trend will appear here.', actionHtml: '<a class="btn btn-primary" href="subjects.html">Find a quiz</a>' })}
        </div>
        <div class="card">
          <div class="card-title">${icon('revision', 22)}<h2>Topics to revise</h2></div>
          ${weak.length ? `<ul class="point-list">${weak.map((w) => `<li><strong>${esc(w.topic)}</strong> <span class="muted">· ${esc(w.chapter_title)} — ${w.wrong_count} mistake${w.wrong_count === 1 ? '' : 's'}</span>${w.chapter_id ? `<br><a class="small" href="chapter.html?id=${encodeURIComponent(w.chapter_id)}#flashcards">Revise flashcards</a>` : ''}</li>`).join('')}</ul>`
            : emptyState({ icon: 'revision', title: 'Nothing to revise', text: 'Topics you get wrong in quizzes will be collected here for revision.' })}
        </div>
      </div>

      <div class="card mt">
        <div class="card-title">${icon('clock', 22)}<h2>Recent quiz attempts</h2></div>
        ${d.attempts.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Quiz</th><th>Score</th><th>Accuracy</th><th>Time</th><th>Date</th></tr></thead><tbody>
          ${d.attempts.slice(0, 10).map((a) => `<tr><td>${esc(a.quizzes?.title || 'Quiz')}</td><td>${esc(a.score)} / ${esc(a.max_score)}</td><td>${esc(a.accuracy)}%</td><td>${esc(formatDuration(a.time_taken_sec))}</td><td>${esc(formatDate(a.created_at))}</td></tr>`).join('')}
          </tbody></table></div>` : '<p class="muted mb-0">Your attempts are private and will be listed here.</p>'}
      </div>`;
  } catch (err) {
    root.innerHTML = notice('danger', `<strong>Could not load your progress.</strong><p>${esc(friendlyError(err))}</p>`);
  }
  renderPartner($('#partner-root'));
}

async function main() {
  const ctx = await initShell();
  if (!ctx) return;
  if (page === 'dashboard') initDashboard(ctx);
  if (page === 'progress') initProgress(ctx);
}
main();
