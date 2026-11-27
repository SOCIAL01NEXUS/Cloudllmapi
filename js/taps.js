/* ==========================================================================
   Study Buddy — Home-page note with "word taps"
   A short note is shown on the Home page. If you have an ACCEPTED study partner
   and you both keep "word taps" on, the words underlined with dots can be tapped:
   tap a word → it glows on your partner's screen (and theirs glows on yours).
   • Only your one accepted partner receives it (database rule, not this file).
   • Nothing is stored except the word, for 2 hours, then it is deleted.
   • Without a partner, or when either of you switches it off, the words are just plain text.
   ========================================================================== */

import { supabase, unwrap } from './supabase.js';
import { $, $$, esc, toast, friendlyError } from './ui.js';

// [[word]] marks a tappable word inside an ordinary sentence.
// The lower-case word is what is sent to the partner (it must match on both screens).
export const NOTE_PARAGRAPHS = [
  'Whatever the day brings, we are [[always]] [[together]] in this. Good health wants a good [[heart]], good [[food]] and a good purpose.',
  '[[I am]] here, and [[you are]] doing better than you think. Your [[study time]] today is a gift to your future self, so give it your [[focus]].',
  'Some days feel [[low]], some days feel [[high]], and most days are simply [[ok]]. If you feel [[tired]], take a [[break]] and drink some [[water]]. If something starts to [[hurt]], breathe and stay [[calm]].',
  'Get your [[sleep]], [[smile]] a little, and be [[proud]] of what you finished. Keep [[hope]] close, [[love]] what you are becoming, and remember that being [[safe]] and [[happy]] is part of the plan.',
  '[[Good morning]] to the start of the day, [[good night]] to the end of it. [[Thank you]] for the quiet days, [[sorry]] for the grumpy ones, and [[miss you]] on the busy ones.',
];

const GLOW_MS = 9000;
const RECENT_MS = 10 * 60 * 1000;

/** Which words are tappable? Returns { active, shareId } (never throws). */
export async function getTapState() {
  try {
    const rows = unwrap(await supabase.rpc('my_word_taps'));
    const r = rows && rows[0];
    return { active: !!(r && r.mine && r.theirs), shareId: r?.share_id || null };
  } catch (err) { console.warn('my_word_taps failed (did you run SQL parts 9 and 10?)', err); return { active: false, shareId: null }; }
}

function paragraphHtml(text, active) {
  return esc(text).replace(/\[\[([^\]]+)\]\]/g, (_, w) => {
    const word = w.trim();
    const key = word.toLowerCase();
    return active
      ? `<button type="button" class="tw" data-w="${esc(key)}">${esc(word)}</button>`
      : esc(word);
  });
}

/** The card for the Home page. */
export function noteCardHtml(active) {
  return `<section class="card note-card" id="note-card" aria-label="A note for today">
    <div class="note-text">${NOTE_PARAGRAPHS.map((p) => `<p>${paragraphHtml(p, active)}</p>`).join('')}</div>
  </section>`;
}

/** Wires taps + live glow. Safe to call when inactive (does nothing). */
export function startTaps(ctx, state) {
  const card = $('#note-card');
  if (!card || !state?.active) return () => {};

  const seen = new Set();
  const timers = new Map();

  const glow = (word, ms = GLOW_MS) => {
    const key = String(word || '').toLowerCase();
    $$('.tw', card).filter((b) => b.dataset.w === key).forEach((b) => {
      b.classList.add('glow');
      clearTimeout(timers.get(b));
      timers.set(b, setTimeout(() => b.classList.remove('glow'), ms));
    });
  };

  // catchUp = first look after opening the page: only glow pings from the last few minutes.
  // Later pings (live or polled) always glow, even if the phone's clock is wrong.
  const onPing = (row, catchUp = false) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    const age = Date.now() - new Date(row.created_at || Date.now()).getTime();
    if (!catchUp) glow(row.word);
    else if (age < RECENT_MS) glow(row.word, Math.max(3000, GLOW_MS - Math.max(age, 0)));
  };

  // 1) tapping a word sends it to my partner; tapping a glowing word just calms it down
  card.addEventListener('click', async (e) => {
    const b = e.target.closest('.tw');
    if (!b) return;
    b.classList.remove('glow');
    b.classList.remove('sent');
    void b.offsetWidth; // restart the little animation
    b.classList.add('sent');
    setTimeout(() => b.classList.remove('sent'), 1400);
    try {
      const sent = unwrap(await supabase.rpc('send_word_tap', { p_word: b.dataset.w }));
      if (sent === false) toast('Word taps are switched off by one of you.', 'info');
    } catch (err) {
      console.warn('send_word_tap failed', err);
      toast(friendlyError(err), 'error', 6000);
    }
  });

  // 2) live delivery (Supabase Realtime), only rows addressed to me
  let channel = null;
  try {
    channel = supabase.channel(`pings-${ctx.user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'partner_pings', filter: `receiver_id=eq.${ctx.user.id}` },
        (payload) => onPing(payload.new))
      .subscribe();
  } catch { /* the poll below still works */ }

  // 3) catch-up + gentle poll (works even if Realtime is not switched on)
  let first = true;
  const poll = async () => {
    if (document.hidden) return;
    try {
      // no phone-clock filter here: the database deletes old pings after 2 hours anyway
      const rows = unwrap(await supabase.from('partner_pings').select('id, word, created_at').order('created_at', { ascending: false }).limit(15));
      (rows || []).reverse().forEach((r) => onPing(r, first));
      first = false;
    } catch (err) { console.warn('partner_pings poll failed', err); }
  };
  poll();
  const pollId = setInterval(poll, 12000);
  document.addEventListener('visibilitychange', poll);

  const stop = () => {
    clearInterval(pollId);
    document.removeEventListener('visibilitychange', poll);
    timers.forEach((t) => clearTimeout(t));
    try { if (channel) supabase.removeChannel(channel); } catch { /* ignore */ }
  };
  window.addEventListener('pagehide', stop, { once: true });
  return stop;
}

/* ---------- "Connection check" (tells you exactly why taps may not work) ---------- */
export const checkButtonHtml = () => '<p class="small mt-sm" style="text-align:right"><button type="button" class="btn btn-ghost btn-sm" id="tap-check">Connection check</button></p>';

const errText = (e) => (e && (e.message || e.details || e.hint)) || String(e);

export function wireCheck(ctx) {
  const btn = $('#tap-check');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-labelledby', 'tc-title');
    d.innerHTML = `<div class="modal-body">
      <h2 class="modal-title" id="tc-title">Connection check</h2>
      <p class="hint">Do this on both phones, then screenshot the result.</p>
      <div class="row"><button class="btn btn-primary btn-sm" id="tc-run" type="button">Run check</button>
      <button class="btn btn-secondary btn-sm" id="tc-send" type="button">Send test tap</button></div>
      <pre id="tc-out" style="white-space:pre-wrap;word-break:break-word;background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:12px;min-height:100px;font-size:.85rem">Press "Run check"…</pre>
      <div class="modal-actions"><button class="btn btn-secondary" id="tc-close" type="button">Close</button></div></div>`;
    document.body.append(d);
    const out = $('#tc-out', d);
    const log = (m) => { out.textContent += `\n${m}`; };
    let ch = null; let pollId = null;
    const close = () => { clearInterval(pollId); try { if (ch) supabase.removeChannel(ch); } catch { /* ignore */ } d.close(); d.remove(); };
    $('#tc-close', d).addEventListener('click', close);
    d.addEventListener('cancel', () => { clearInterval(pollId); d.remove(); });

    $('#tc-run', d).addEventListener('click', async () => {
      out.textContent = 'Check v1';
      const me = ctx.user?.id;
      if (!me) { log('✗ Not logged in.'); return; }
      log(`✓ Logged in as ${ctx.user.email || me}`);
      const t = await supabase.rpc('my_word_taps');
      if (t.error) log(`✗ my_word_taps failed: ${errText(t.error)}\n   → run SQL schema_09_word_taps.sql, then schema_10_privileges.sql`);
      else if (!t.data?.length) log('✗ No ACCEPTED study partner on this account (request not accepted, or a different account).');
      else {
        const r = t.data[0];
        log(`✓ Partner found. My switch: ${r.mine} | Partner switch: ${r.theirs}${r.mine && r.theirs ? '' : '\n   → both must be true (Study Partner → Allow word taps)'}`);
      }
      const p = await supabase.from('partner_pings').select('id, word').order('created_at', { ascending: false }).limit(5);
      if (p.error) log(`✗ Cannot read partner_pings: ${errText(p.error)}\n   → run schema_10_privileges.sql`);
      else log(`✓ Can read pings. Received so far: ${p.data.length ? p.data.map((x) => x.word).join(', ') : 'none'}`);
      const seen = new Set((p.data || []).map((x) => x.id));
      if (ch) supabase.removeChannel(ch);
      ch = supabase.channel(`check-${me}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'partner_pings', filter: `receiver_id=eq.${me}` }, (pl) => log(`★ LIVE ping received: "${pl.new.word}"`))
        .subscribe((st, err) => log(`Realtime: ${st}${err ? ` ${errText(err)}` : ''}`));
      log('Listening… the other phone should press "Send test tap".');
      clearInterval(pollId);
      pollId = setInterval(async () => {
        const q = await supabase.from('partner_pings').select('id, word').order('created_at', { ascending: false }).limit(5);
        (q.data || []).forEach((x) => { if (!seen.has(x.id)) { seen.add(x.id); log(`★ POLL ping received: "${x.word}"`); } });
      }, 5000);
    });
    $('#tc-send', d).addEventListener('click', async () => {
      const r = await supabase.rpc('send_word_tap', { p_word: 'ok' });
      log(r.error ? `✗ Send failed: ${errText(r.error)}` : (r.data === false ? '✗ Not sent: word taps are switched off by one of you.' : '✓ Sent "ok" to your partner.'));
    });
    d.showModal();
  });
}
