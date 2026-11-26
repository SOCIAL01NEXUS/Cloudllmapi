/* ==========================================================================
   Study Buddy — Study Partner
   • request by email or username, the other student must accept
   • each student chooses exactly which of 4 fields they share
   • either student can stop sharing at any time
   • all rules live in database functions (see sql/schema.sql); this file
     only calls them. Nothing is shared automatically.
   ========================================================================== */

import { supabase, unwrap, localDateStr } from './supabase.js';
import { $, $$, esc, icon, toast, friendlyError, validators, setBusy, progressBar, confirmBox, notice } from './ui.js';

const SHARE_FIELDS = [
  { key: 'completion', label: "Today's target completion %" },
  { key: 'quiz_count', label: 'Number of quizzes taken' },
  { key: 'subject_progress', label: 'Chapters completed per subject' },
  { key: 'streak', label: 'Study streak' },
];

const PRIVACY_NOTE = `<p class="hint mb-0">${'Never shared: your private notes, quiz answers, AI chats, messages, location, device or screen activity.'}</p>`;

export async function renderPartner(root) {
  root.innerHTML = '<div class="card"><div class="skeleton-line"></div><div class="skeleton-line w60"></div></div>';
  let pair = null;
  try {
    const rows = unwrap(await supabase.rpc('my_partnership'));
    pair = rows && rows[0] ? rows[0] : null;
  } catch (err) {
    root.innerHTML = `<div class="card">${notice('danger', esc(friendlyError(err)))}</div>`;
    return;
  }
  if (!pair) return renderInvite(root);
  if (pair.status === 'pending') return renderPending(root, pair);
  return renderAccepted(root, pair);
}

function header(sub) {
  return `<div class="card-title">${icon('users', 22)}<h2>Study partner</h2></div>${sub ? `<p class="muted">${sub}</p>` : ''}`;
}

/* ---- no partner yet ---- */
function renderInvite(root) {
  root.innerHTML = `<div class="card">
    ${header('Study with one friend. You both stay in control: nothing is shared until you tick a box, and either of you can stop at any time.')}
    <form id="invite-form" novalidate>
      <div class="field">
        <label for="partner-id">Their email or username</label>
        <input id="partner-id" type="text" autocomplete="off" maxlength="254" placeholder="friend@example.com or @username">
        <span class="error-text" id="partner-id-error" role="alert"></span>
      </div>
      <button class="btn btn-primary" id="invite-btn" type="submit">${icon('send', 18)} Send request</button>
    </form>
    <hr class="divider">${PRIVACY_NOTE}</div>`;
  $('#invite-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = $('#partner-id').value.trim().toLowerCase().replace(/^@/, '');
    const ok = validators.email(v) || validators.username(v);
    $('#partner-id-error').textContent = ok ? '' : 'Enter a valid email address or username.';
    if (!ok) return;
    const btn = $('#invite-btn');
    setBusy(btn, true, 'Sending…');
    try {
      const msg = unwrap(await supabase.rpc('send_partner_request', { p_identifier: v }));
      toast(msg, 'success', 6000);
      await renderPartner(root);
    } catch (err) {
      toast(friendlyError(err), 'error', 6000);
      setBusy(btn, false);
    }
  });
}

/* ---- pending ---- */
function renderPending(root, pair) {
  const incoming = !pair.i_am_requester;
  root.innerHTML = `<div class="card">
    ${header('')}
    ${incoming
      ? `<p><strong>@${esc(pair.other_username)}</strong> wants to be your study partner. If you accept, you each choose what to share. Nothing is shared until you tick a box.</p>
         <div class="row"><button class="btn btn-primary" id="accept-btn" type="button">Accept</button><button class="btn btn-secondary" id="decline-btn" type="button">Decline</button></div>`
      : `<p>Request sent to <strong>@${esc(pair.other_username)}</strong>. Waiting for them to accept.</p>
         <button class="btn btn-secondary" id="cancel-btn" type="button">Cancel request</button>`}
  </div>`;
  const reload = () => renderPartner(root);
  const respond = (accept) => async () => {
    try { unwrap(await supabase.rpc('respond_partner_request', { p_id: pair.id, p_accept: accept })); toast(accept ? 'You are now study partners.' : 'Request declined.', 'success'); reload(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  };
  $('#accept-btn')?.addEventListener('click', respond(true));
  $('#decline-btn')?.addEventListener('click', respond(false));
  $('#cancel-btn')?.addEventListener('click', async () => {
    try { unwrap(await supabase.rpc('stop_partner_sharing', { p_id: pair.id })); toast('Request cancelled.', 'success'); reload(); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
}

/* ---- accepted ---- */
async function renderAccepted(root, pair) {
  const mine = pair.my_shares || {};
  root.innerHTML = `<div class="card">
    ${header(`You are partnered with <strong>@${esc(pair.other_username)}</strong>${pair.other_name ? ` (${esc(pair.other_name)})` : ''}.`)}
    <h3>What I share with them</h3>
    <form id="share-form" class="stack-sm">
      ${SHARE_FIELDS.map((f) => `<label class="check"><input type="checkbox" name="${f.key}" ${mine[f.key] ? 'checked' : ''}><span>${esc(f.label)}</span></label>`).join('')}
      <div class="row mt-sm">
        <button class="btn btn-primary btn-sm" type="submit">Save sharing choices</button>
        <button class="btn btn-danger btn-sm" id="stop-btn" type="button">Stop sharing &amp; end partnership</button>
      </div>
    </form>
    <hr class="divider">${PRIVACY_NOTE}
  </div>
  <div class="card mt-sm" id="partner-view"><div class="skeleton-line"></div></div>`;

  $('#share-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const shares = Object.fromEntries(SHARE_FIELDS.map((f) => [f.key, $(`input[name="${f.key}"]`).checked]));
    try { unwrap(await supabase.rpc('set_my_partner_shares', { p_id: pair.id, p_shares: shares })); toast('Sharing choices saved.', 'success'); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });
  $('#stop-btn').addEventListener('click', async () => {
    if (!(await confirmBox('Stop sharing and end this partnership? You can both start fresh later.', { confirmText: 'Stop sharing', danger: true }))) return;
    try { unwrap(await supabase.rpc('stop_partner_sharing', { p_id: pair.id })); toast('Sharing stopped.', 'success'); renderPartner(root); }
    catch (err) { toast(friendlyError(err), 'error'); }
  });

  // What the partner has chosen to share with me
  const view = $('#partner-view');
  try {
    const data = unwrap(await supabase.rpc('get_partner_progress', { p_today: localDateStr() }));
    const keys = data ? SHARE_FIELDS.filter((f) => f.key in data) : [];
    if (!keys.length) {
      view.innerHTML = `<h3>@${esc(pair.other_username)}'s progress</h3><p class="muted mb-0">They have not chosen to share anything with you yet. That is their choice.</p>`;
      return;
    }
    view.innerHTML = `<h3>@${esc(pair.other_username)}'s shared progress</h3><div class="stack-sm">
      ${'completion' in data ? `<div><div class="progress-meta"><span>Today's target</span><span>${data.completion ?? '—'}${data.completion == null ? '' : '%'}</span></div>${progressBar(data.completion || 0, 'Partner completion')}</div>` : ''}
      ${'streak' in data ? `<p class="mb-0">${icon('streak', 18)} Streak: <strong>${esc(data.streak)} day${data.streak === 1 ? '' : 's'}</strong></p>` : ''}
      ${'quiz_count' in data ? `<p class="mb-0">${icon('quiz', 18)} Quizzes taken: <strong>${esc(data.quiz_count)}</strong></p>` : ''}
      ${'subject_progress' in data ? `<div>${(data.subject_progress || []).map((s) => `
        <div class="progress-meta mt-sm"><span>${esc(s.name)}</span><span>${esc(s.done)}/${esc(s.total)} chapters</span></div>${progressBar(s.total ? (s.done / s.total) * 100 : 0, `${s.name} progress`, 'indigo')}`).join('')}</div>` : ''}
    </div>`;
  } catch (err) {
    view.innerHTML = notice('danger', esc(friendlyError(err)));
  }
}
