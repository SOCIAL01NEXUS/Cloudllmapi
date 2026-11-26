/* ==========================================================================
   Study Buddy — authentication pages (home, login, signup, password reset)
   Supabase email/password auth. No passwords or tokens are stored by this
   code; the SDK keeps the session in the browser's localStorage.
   ========================================================================== */

import { supabase } from './supabase.js';
import { initShell, $, validators, setBusy, toast, friendlyError, esc } from './ui.js';

const page = document.body.dataset.page;

/** Only allow redirects to our own pages (prevents open-redirect). */
function safeNext() {
  const next = new URLSearchParams(location.search).get('next') || '';
  return /^[a-z0-9-]+\.html(\?[\w=&%.-]*)?$/i.test(next) ? next : 'dashboard.html';
}

function setFieldError(id, message) {
  const input = $(`#${id}`);
  const err = $(`#${id}-error`);
  if (err) err.textContent = message || '';
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  return !message;
}

function formMessage(type, html) {
  const box = $('#form-message');
  if (!box) return;
  box.innerHTML = html ? `<div class="notice ${type}" role="${type === 'danger' ? 'alert' : 'status'}"><div>${html}</div></div>` : '';
}

/* ---------- login ---------- */
function initLogin() {
  const form = $('#login-form');
  const recoveryForm = $('#recovery-form');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formMessage('', '');
    const email = $('#email').value.trim().toLowerCase();
    const password = $('#password').value;
    const ok = setFieldError('email', validators.email(email) ? '' : 'Enter a valid email address.')
      & setFieldError('password', password ? '' : 'Enter your password.');
    if (!ok) return;

    const btn = $('#login-btn');
    setBusy(btn, true, 'Logging in…');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(btn, false);
    if (error) {
      // One generic message: do not reveal whether the email exists.
      formMessage('danger', /confirm/i.test(error.message)
        ? 'Please confirm your email first — check your inbox for the link.'
        : 'Email or password is incorrect.');
      return;
    }
    location.replace(safeNext());
  });

  $('#forgot-btn').addEventListener('click', async () => {
    const email = $('#email').value.trim().toLowerCase();
    if (!setFieldError('email', validators.email(email) ? '' : 'Type your email above first.')) return;
    const redirectTo = `${location.origin}${location.pathname}?recovery=1`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) formMessage('danger', esc(friendlyError(error)));
    else formMessage('success', 'If that email has an account, a reset link is on its way.');
  });

  // Arriving from the reset-password email
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      form.hidden = true;
      recoveryForm.hidden = false;
      $('#new-password').focus();
    }
  });

  recoveryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#new-password').value;
    if (!setFieldError('new-password', validators.password(pw) ? '' : 'Use 8+ characters with at least one letter and one number.')) return;
    const btn = $('#recovery-btn');
    setBusy(btn, true, 'Saving…');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(btn, false);
    if (error) { formMessage('danger', esc(friendlyError(error))); return; }
    toast('Password updated.', 'success');
    location.replace('dashboard.html');
  });
}

/* ---------- signup ---------- */
function initSignup() {
  const form = $('#signup-form');
  let usernameTimer;

  $('#username').addEventListener('input', () => {
    clearTimeout(usernameTimer);
    const v = $('#username').value.trim().toLowerCase();
    if (!v) { setFieldError('username', ''); return; }
    if (!validators.username(v)) { setFieldError('username', '3–20 characters: lowercase letters, numbers, underscore.'); return; }
    usernameTimer = setTimeout(async () => {
      const { data, error } = await supabase.rpc('username_available', { p_username: v });
      if (!error) setFieldError('username', data ? '' : 'That username is taken.');
    }, 400);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formMessage('', '');
    const fullName = $('#full-name').value.trim();
    const username = $('#username').value.trim().toLowerCase();
    const email = $('#email').value.trim().toLowerCase();
    const password = $('#password').value;
    const confirm = $('#confirm').value;
    const agreed = $('#agree').checked;

    const checks = [
      setFieldError('full-name', validators.fullName(fullName) ? '' : 'Enter your name (2–80 characters).'),
      setFieldError('username', validators.username(username) ? '' : '3–20 characters: lowercase letters, numbers, underscore.'),
      setFieldError('email', validators.email(email) ? '' : 'Enter a valid email address.'),
      setFieldError('password', validators.password(password) ? '' : 'Use 8+ characters with at least one letter and one number.'),
      setFieldError('confirm', password === confirm ? '' : 'Passwords do not match.'),
      setFieldError('agree', agreed ? '' : 'Please tick this box to continue.'),
    ];
    if (checks.includes(false)) return;

    const { data: free } = await supabase.rpc('username_available', { p_username: username });
    if (free === false) { setFieldError('username', 'That username is taken.'); return; }

    const btn = $('#signup-btn');
    setBusy(btn, true, 'Creating account…');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, username },
        emailRedirectTo: `${location.origin}${location.pathname.replace(/[^/]*$/, '')}login.html`,
      },
    });
    setBusy(btn, false);
    if (error) { formMessage('danger', esc(friendlyError(error))); return; }
    if (data.session) { location.replace('dashboard.html'); return; }
    form.hidden = true;
    formMessage('success', '<strong>Almost done!</strong> We sent a confirmation link to your email. Open it, then log in.');
  });
}

async function main() {
  const ctx = await initShell();
  if (!ctx) return;
  if (page === 'login') initLogin();
  if (page === 'signup') initSignup();
}

main();
