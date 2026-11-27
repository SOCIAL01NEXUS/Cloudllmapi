/* ==========================================================================
   Study Buddy — Home-page note with "word taps"
   Tap a dotted word → it glows on the other user's screen (live, no study
   partner needed). Uses Supabase Realtime *Broadcast*: nothing is stored in
   the database and no SQL is required.
   Everyone who has the Home page open at that moment receives the glow.
   ========================================================================== */

import { supabase } from './supabase.js';
import { $, $$, esc } from './ui.js';

// [[word]] marks a tappable word inside an ordinary sentence.
export const NOTE_PARAGRAPHS = [
  'Whatever the day brings, we are [[always]] [[together]] in this. Good health wants a good [[heart]], good [[food]] and a good purpose.',
  '[[I am]] here, and [[you are]] doing better than you think. Your [[study time]] today is a gift to your future self, so give it your [[focus]].',
  'Some days feel [[low]], some days feel [[high]], and most days are simply [[ok]]. If you feel [[tired]], take a [[break]] and drink some [[water]]. If something starts to [[hurt]], breathe and stay [[calm]].',
  'Get your [[sleep]], [[smile]] a little, and be [[proud]] of what you finished. Keep [[hope]] close, [[love]] what you are becoming, and remember that being [[safe]] and [[happy]] is part of the plan.',
  '[[Good morning]] to the start of the day, [[good night]] to the end of it. [[Thank you]] for the quiet days, [[sorry]] for the grumpy ones, and [[miss you]] on the busy ones.',
];

const GLOW_MS = 9000;

/** Words are always tappable now (no partner needed). */
export async function getTapState() { return { active: true }; }

let wordIndex = 0; // unique number per word, same on every screen (the text is identical)

function paragraphHtml(text, active) {
  const plain = text.replace(/\[\[|\]\]/g, ''); // every word is tappable, not just the [[marked]] ones
  if (!active) return esc(plain);
  return plain.replace(/[A-Za-z0-9']+|[^A-Za-z0-9']+/g, (tok) => {
    if (!/[A-Za-z0-9]/.test(tok)) return esc(tok); // spaces and punctuation stay plain
    return `<button type="button" class="tw" data-i="${wordIndex++}">${esc(tok)}</button>`;
  });
}

export function noteCardHtml(active) {
  wordIndex = 0;
  return `<section class="card note-card" id="note-card" aria-label="A note for today">
    <div class="note-text">${NOTE_PARAGRAPHS.map((p) => `<p>${paragraphHtml(p, active)}</p>`).join('')}</div>
  </section>`;
}

export function startTaps(ctx, state) {
  const card = $('#note-card');
  if (!card || !state?.active) return () => {};

  const timers = new Map();
  const glow = (idx, ms = GLOW_MS) => {
    $$('.tw', card).filter((b) => b.dataset.i === String(idx)).forEach((b) => {
      b.classList.add('glow');
      clearTimeout(timers.get(b));
      timers.set(b, setTimeout(() => b.classList.remove('glow'), ms));
    });
  };

  // One shared live channel. self:false = my own taps do not glow on my own screen.
  const me = ctx?.user?.id || Math.random().toString(36).slice(2);
  const channel = supabase.channel('study-buddy-word-taps', { config: { broadcast: { self: false } } });
  channel.on('broadcast', { event: 'tap' }, ({ payload }) => {
    if (!payload || payload.from === me) return;
    glow(payload.i);
  }).subscribe();

  // ONE tap on a word = glow on the other screen
  card.addEventListener('click', (e) => {
    const b = e.target.closest('.tw');
    if (!b) return;
    b.classList.remove('glow', 'sent');
    void b.offsetWidth;
    b.classList.add('sent');
    setTimeout(() => b.classList.remove('sent'), 1400);
    channel.send({ type: 'broadcast', event: 'tap', payload: { i: b.dataset.i, word: b.textContent, from: me } })
      .catch((err) => console.warn('word tap send failed', err));
  });

  const stop = () => {
    timers.forEach((t) => clearTimeout(t));
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
  };
  window.addEventListener('pagehide', stop, { once: true });
  return stop;
}

/* Kept only so older imports do not break; the Connection check is gone. */
export const checkButtonHtml = () => '';
export function wireCheck() {}
