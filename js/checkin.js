/* ==========================================================================
   Study Buddy — daily study check-in
   Private by default. One row per student per day in daily_goals.
   The private note is never shared (partner sharing exposes only the four
   fields listed in the README).
   ========================================================================== */

import { supabase, unwrap, localDateStr, addDays } from './supabase.js';
import { initShell, $, $$, esc, icon, clampNum, progressBar, toast, friendlyError, notice } from './ui.js';

const FIELDS = [
  { key: 'hours', label: 'Study hours', unit: 'h', max: 24, step: 0.5, icon: 'clock' },
  { key: 'lectures', label: 'Lectures', unit: '', max: 20, step: 1, icon: 'play' },
  { key: 'questions', label: 'Questions practised', unit: '', max: 1000, step: 5, icon: 'quiz' },
  { key: 'quizzes', label: 'Quizzes', unit: '', max: 20, step: 1, icon: 'revision' },
];
const NOTE_MAX = 500;
const STREAK_THRESHOLD = 50; // a day counts toward the streak at ≥ 50% (kept in sync with sql/schema.sql)

let ctx;
let today;
let state; // { target_*, done_*, note }
let saveTimer = null;

const blank = () => ({
  target_hours: 0, target_lectures: 0, target_questions: 0, target_quizzes: 0,
  done_hours: 0, done_lectures: 0, done_questions: 0, done_quizzes: 0,
  note: '',
});

export function completionPct(s) {
  let n = 0; let sum = 0;
  FIELDS.forEach((f) => {
    const t = Number(s[`target_${f.key}`]) || 0;
    if (t > 0) { n += 1; sum += Math.min((Number(s[`done_${f.key}`]) || 0) / t, 1); }
  });
  return n ? Math.round((sum / n) * 100) : 0;
}

const fmt = (key, v) => (key === 'hours' ? (Math.round(v * 10) / 10).toString() : String(Math.round(v)));

function renderForm() {
  const root = $('#checkin-form');
  root.innerHTML = FIELDS.map((f) => `
    <div class="target-row">
      <div class="field mb-0">
        <label for="target-${f.key}">${icon(f.icon, 16)} ${esc(f.label)} — target</label>
        <input id="target-${f.key}" type="number" inputmode="decimal" min="0" max="${f.max}" step="${f.step}" value="${esc(state[`target_${f.key}`])}">
      </div>
      <div>
        <span class="label" id="done-label-${f.key}">Done today</span><br>
        <div class="stepper" role="group" aria-labelledby="done-label-${f.key}">
          <button type="button" data-dec="${f.key}" aria-label="Decrease ${esc(f.label)}">−</button>
          <output id="done-${f.key}" aria-live="polite">${fmt(f.key, state[`done_${f.key}`])}</output>
          <button type="button" data-inc="${f.key}" aria-label="Increase ${esc(f.label)}">+</button>
        </div>
      </div>
      <div><button type="button" class="btn btn-secondary btn-sm" data-complete="${f.key}">Mark target done</button></div>
    </div>`).join('');

  FIELDS.forEach((f) => {
    $(`#target-${f.key}`).addEventListener('input', (e) => {
      state[`target_${f.key}`] = clampNum(e.target.value, 0, f.max, 0);
      changed();
    });
  });
  $$('[data-inc]').forEach((b) => b.addEventListener('click', () => bump(b.dataset.inc, +1)));
  $$('[data-dec]').forEach((b) => b.addEventListener('click', () => bump(b.dataset.dec, -1)));
  $$('[data-complete]').forEach((b) => b.addEventListener('click', () => {
    const f = FIELDS.find((x) => x.key === b.dataset.complete);
    const t = state[`target_${f.key}`];
    if (!t) { toast('Set a target first.', 'info'); return; }
    state[`done_${f.key}`] = Math.max(state[`done_${f.key}`], t);
    $(`#done-${f.key}`).textContent = fmt(f.key, state[`done_${f.key}`]);
    changed();
  }));

  const note = $('#note');
  note.value = state.note;
  note.maxLength = NOTE_MAX;
  $('#note-count').textContent = `${state.note.length}/${NOTE_MAX}`;
  note.addEventListener('input', () => {
    state.note = note.value.slice(0, NOTE_MAX);
    $('#note-count').textContent = `${state.note.length}/${NOTE_MAX}`;
    changed();
  });
}

function bump(key, dir) {
  const f = FIELDS.find((x) => x.key === key);
  state[`done_${key}`] = clampNum(state[`done_${key}`] + dir * f.step, 0, f.max, 0);
  $(`#done-${key}`).textContent = fmt(key, state[`done_${key}`]);
  changed();
}

function paintProgress() {
  const pct = completionPct(state);
  $('#today-progress').innerHTML = `
    <div class="progress-meta"><span>Today's target</span><span>${pct}%</span></div>
    ${progressBar(pct, "Today's target completion", 'lg')}
    <p class="small muted mt-sm mb-0">${pct >= 100 ? 'Target complete — brilliant!' : pct >= STREAK_THRESHOLD ? 'This day counts toward your streak.' : `Reach ${STREAK_THRESHOLD}% to keep your streak alive.`}</p>`;
}

function changed() {
  paintProgress();
  $('#save-state').textContent = 'Saving…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}

async function save() {
  const payload = {
    user_id: ctx.user.id,
    goal_date: today,
    target_hours: state.target_hours, target_lectures: Math.round(state.target_lectures),
    target_questions: Math.round(state.target_questions), target_quizzes: Math.round(state.target_quizzes),
    done_hours: state.done_hours, done_lectures: Math.round(state.done_lectures),
    done_questions: Math.round(state.done_questions), done_quizzes: Math.round(state.done_quizzes),
    note: state.note.trim() || null,
  };
  try {
    unwrap(await supabase.from('daily_goals').upsert(payload, { onConflict: 'user_id,goal_date' }));
    $('#save-state').textContent = 'Saved ✓';
    loadStreakAndWeek();
  } catch (err) {
    $('#save-state').textContent = 'Not saved';
    toast(friendlyError(err), 'error');
  }
}

async function loadStreakAndWeek() {
  try {
    const from = addDays(today, -6);
    const [streakRes, weekRes] = await Promise.all([
      supabase.rpc('my_streak', { p_today: today }),
      supabase.from('daily_goals').select('goal_date, completion_pct, done_hours, done_lectures, done_questions, done_quizzes').gte('goal_date', from).lte('goal_date', today),
    ]);
    const streak = unwrap(streakRes) || 0;
    const rows = unwrap(weekRes) || [];
    const byDate = Object.fromEntries(rows.map((r) => [r.goal_date, r]));

    $('#streak-box').innerHTML = `<div class="stat amber ${streak > 0 ? 'anim-flame' : ''}">
      <span class="stat-label">${icon('streak', 18)} Current streak</span>
      <span class="stat-value">${streak} day${streak === 1 ? '' : 's'}</span></div>`;

    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const dow = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
    $('#week-bars').innerHTML = days.map((d) => {
      const pct = byDate[d]?.completion_pct || 0;
      return `<div class="week-bar ${pct >= STREAK_THRESHOLD ? 'met' : ''} ${d === today ? 'today' : ''}" title="${esc(d)}: ${pct}%">
        <span>${pct}%</span><div class="bar" style="height:${Math.max(3, pct * 0.9)}px"></div><span>${esc(dow(d))}</span></div>`;
    }).join('');

    const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const avg = Math.round(days.reduce((a, d) => a + (byDate[d]?.completion_pct || 0), 0) / 7);
    $('#week-summary').innerHTML = `
      <div class="grid grid-4">
        <div class="stat indigo"><span class="stat-value">${avg}%</span><span class="stat-label">Avg. completion</span></div>
        <div class="stat"><span class="stat-value">${Math.round(sum('done_hours') * 10) / 10}</span><span class="stat-label">Hours studied</span></div>
        <div class="stat"><span class="stat-value">${sum('done_questions')}</span><span class="stat-label">Questions</span></div>
        <div class="stat"><span class="stat-value">${sum('done_lectures')} / ${sum('done_quizzes')}</span><span class="stat-label">Lectures / quizzes</span></div>
      </div>`;
  } catch (err) {
    $('#week-summary').innerHTML = notice('danger', esc(friendlyError(err)));
  }
}

async function main() {
  ctx = await initShell();
  if (!ctx) return;
  today = localDateStr();
  $('#today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  state = blank();

  try {
    const [todayRes, lastRes] = await Promise.all([
      supabase.from('daily_goals').select('*').eq('goal_date', today).maybeSingle(),
      supabase.from('daily_goals').select('target_hours, target_lectures, target_questions, target_quizzes').lt('goal_date', today).order('goal_date', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const row = unwrap(todayRes);
    const last = unwrap(lastRes);
    if (row) {
      state = { ...blank(), ...Object.fromEntries(Object.entries(row).filter(([k]) => /^(target|done)_/.test(k)).map(([k, v]) => [k, Number(v)])), note: row.note || '' };
    } else if (last) {
      // New day: start from yesterday's targets so it takes one tap to begin.
      state = { ...blank(), ...Object.fromEntries(Object.entries(last).map(([k, v]) => [k, Number(v)])) };
    }
  } catch (err) {
    $('#checkin-form').innerHTML = notice('danger', `<strong>Could not load today's check-in.</strong><p>${esc(friendlyError(err))}</p>`);
    return;
  }

  renderForm();
  paintProgress();
  loadStreakAndWeek();
  $('#save-btn').addEventListener('click', () => { clearTimeout(saveTimer); save(); });
}

main();
