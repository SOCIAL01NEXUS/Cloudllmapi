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
import { $, $$, esc } from './ui.js';

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
  } catch { return { active: false, shareId: null }; }
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

  const onPing = (row) => {
    if (!row || seen.has(row.id)) return;
    seen.add(row.id);
    const age = Date.now() - new Date(row.created_at || Date.now()).getTime();
    if (age < RECENT_MS) glow(row.word, Math.max(3000, GLOW_MS - Math.max(age, 0)));
  };

  // 1) tapping a word sends it to my partner; tapping a glowing word just calms it down
  card.addEventListener('click', async (e) => {
    const b = e.target.closest('.tw');
    if (!b) return;
    b.classList.remove('glow');
    b.classList.remove('sent');
    void b.offsetWidth; // restart the little animation
    b.classList.add('sent');
    try { unwrap(await supabase.rpc('send_word_tap', { p_word: b.dataset.w })); } catch { /* stay quiet: it is only a word */ }
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
  const poll = async () => {
    if (document.hidden) return;
    try {
      const since = new Date(Date.now() - RECENT_MS).toISOString();
      const rows = unwrap(await supabase.from('partner_pings').select('id, word, created_at').gte('created_at', since).order('created_at', { ascending: true }).limit(30));
      (rows || []).forEach(onPing);
    } catch { /* ignore */ }
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
