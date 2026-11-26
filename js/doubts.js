/* ==========================================================================
   Study Buddy — AI Study Assistant (doubts)
   • clearly labelled as an AI, never as a human teacher
   • calls a secure Supabase Edge Function ("ai-assistant"); the AI provider
     key lives only in Supabase secrets, never in this website
   • chat history is stored in the `doubts` table; RLS makes it visible only
     to its owner, and the student can delete one message or everything
   ========================================================================== */

import { supabase, unwrap, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';
import { initShell, $, $$, esc, icon, toast, friendlyError, emptyState, confirmBox, setBusy, notice } from './ui.js';

const MAX_Q = 800;
const SUBJECTS = ['Physics', 'Chemistry', 'Biology'];
const COOLDOWN_MS = 3000;

let ctx;
let history = []; // [{id, subject, question, answer, created_at}]
let subject = 'Physics';
let lastSent = 0;

/* Very small, safe formatter: escapes everything first, then supports
   **bold**, `code`, and line breaks. No raw HTML from the AI ever reaches the DOM. */
function formatAnswer(text) {
  return esc(text)
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function bubble(role, html, meta = '') {
  return `<div class="bubble ${role}">${html}${meta}</div>`;
}

function renderChat() {
  const box = $('#chat');
  if (!history.length) {
    box.innerHTML = emptyState({
      icon: 'chat', title: 'Ask your first doubt',
      text: 'Choose a subject, type your question, and the AI Study Assistant will explain it with formulas and an example.',
    });
    $('#clear-chat').hidden = true;
    return;
  }
  $('#clear-chat').hidden = false;
  box.innerHTML = history.map((h) => `
    ${bubble('user', `<span class="badge badge-amber" style="margin-bottom:6px">${esc(h.subject)}</span><br>${esc(h.question)}`)}
    ${bubble('assistant',
      `<span class="badge badge-primary" style="margin-bottom:6px">${icon('sparkle', 14)} AI Study Assistant</span><br>${formatAnswer(h.answer || '')}`,
      `<div class="b-meta"><button class="b-del" type="button" data-del="${esc(h.id)}">Delete this message</button></div>`)}
  `).join('');
  box.scrollTop = box.scrollHeight;
  $$('[data-del]').forEach((b) => b.addEventListener('click', () => deleteOne(b.dataset.del)));
}

async function deleteOne(id) {
  if (!(await confirmBox('Delete this question and answer?', { confirmText: 'Delete' }))) return;
  try {
    unwrap(await supabase.from('doubts').delete().eq('id', id));
    history = history.filter((h) => h.id !== id);
    renderChat();
    toast('Deleted.', 'success');
  } catch (err) { toast(friendlyError(err), 'error'); }
}

async function clearAll() {
  if (!(await confirmBox('Delete your entire AI chat history? This cannot be undone.', { confirmText: 'Delete all' }))) return;
  try {
    unwrap(await supabase.rpc('delete_my_doubts'));
    history = [];
    renderChat();
    toast('Chat history deleted.', 'success');
  } catch (err) { toast(friendlyError(err), 'error'); }
}

async function ask(e) {
  e.preventDefault();
  const input = $('#question');
  const q = input.value.trim();
  const err = $('#question-error');
  if (q.length < 5) { err.textContent = 'Please write at least a short sentence.'; input.setAttribute('aria-invalid', 'true'); return; }
  if (q.length > MAX_Q) { err.textContent = `Keep it under ${MAX_Q} characters.`; input.setAttribute('aria-invalid', 'true'); return; }
  if (Date.now() - lastSent < COOLDOWN_MS) { err.textContent = 'One moment — please wait a few seconds between questions.'; return; }
  err.textContent = ''; input.setAttribute('aria-invalid', 'false');
  lastSent = Date.now();

  const btn = $('#ask-btn');
  setBusy(btn, true, 'Thinking…');
  const box = $('#chat');
  if (!history.length) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', bubble('user', `<span class="badge badge-amber" style="margin-bottom:6px">${esc(subject)}</span><br>${esc(q)}`));
  box.insertAdjacentHTML('beforeend', `<div class="bubble assistant" id="typing"><span class="typing" aria-label="AI Study Assistant is typing"><i></i><i></i><i></i></span></div>`);
  box.scrollTop = box.scrollHeight;
  input.value = '';
  $('#q-count').textContent = `0/${MAX_Q}`;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-assistant`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ subject, question: q }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `The assistant is unavailable right now (code ${res.status}).`);
    history.push(body.doubt);
    renderChat();
  } catch (e2) {
    $('#typing')?.remove();
    input.value = q;
    box.insertAdjacentHTML('beforeend', `<div class="bubble assistant">${notice('danger', esc(friendlyError(e2)))}</div>`);
    box.scrollTop = box.scrollHeight;
  } finally {
    setBusy(btn, false);
  }
}

async function main() {
  ctx = await initShell();
  if (!ctx) return;

  $('#subject-chips').innerHTML = SUBJECTS.map((s) => `<button type="button" class="chip" data-s="${s}" aria-pressed="${s === subject}">${s}</button>`).join('');
  $$('#subject-chips .chip').forEach((b) => b.addEventListener('click', () => {
    subject = b.dataset.s;
    $$('#subject-chips .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.s === subject)));
  }));

  $('#question').addEventListener('input', (e) => {
    $('#q-count').textContent = `${e.target.value.length}/${MAX_Q}`;
  });
  $('#question').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#ask-form').requestSubmit();
  });
  $('#ask-form').addEventListener('submit', ask);
  $('#clear-chat').addEventListener('click', clearAll);

  try {
    history = unwrap(await supabase.from('doubts').select('id, subject, question, answer, created_at').order('created_at', { ascending: true }).limit(100)) || [];
  } catch (err) {
    $('#chat').innerHTML = notice('danger', esc(friendlyError(err)));
    return;
  }
  renderChat();
}

main();
