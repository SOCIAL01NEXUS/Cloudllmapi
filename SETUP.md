# StudyDesk v4.1 (NEET) – Setup Guide

## What changed in v4.1 (build part 1 of 10)
- Mock tests now draw from question banks: `bank-physics.js`, `bank-chemistry.js`, `bank-biology.js` (75 questions each, 225 in total, every one different). Upload ALL files in this ZIP; the quiz needs the three bank files next to `index.html`.
- On the Mock quiz page choose subject (or all) and the number of questions. Every test is a fresh random set, scored with NEET marking, with an explanation for each answer.
- More questions are added part by part by dropping in bigger `bank-*.js` files. The page code does not need to change.

## What is the Group code? (Doubts page)
- It is NOT a Supabase value and you do not create it anywhere. It is a secret phrase that you and your partner agree on yourselves, at least 8 characters. Example style: three or four unrelated words and a number.
- Both of you open the site, go to **Doubts**, type your name and the SAME Group code, and press **Join group**. Same code = same private room. A different code = a different room, so nobody else can see your messages, glows or reactions.
- Before it works you must paste your Supabase URL and anon key at the top of `script.js`, otherwise Join cannot connect.
- Tell the code to your partner in person or on a call, not on a public page. Change it from time to time.

## Earlier: v4 (NEET edition)
- Subjects are now Physics (4 chapters), Chemistry (3) and Biology (3), with a NEET-style home page and a mock quiz that uses real NEET marking (+4 / -1 / 0).
- Countdown on the home page: change `TARGET_DATE` at the top of `script.js` to your exam date (check the official NTA notice for the actual NEET UG date).
- Ads are real links. Tapping one opens a site in a new tab. To change where an ad goes, edit the `href` of the `<a class="ad">` tags in `index.html`. Defaults: NCERT textbooks, NTA NEET UG, MCC counselling.
- IMPORTANT: opening a new tab hides this tab. After you have joined the Doubts group, that triggers the panic redirect (as designed), so the chat is wiped. Before joining, ads open normally and nothing happens to this tab.
- More private words: `GLOW_WORDS` now also has biology terms (mitochondria, ribosomes, chlorophyll, enzyme, genotype, chromosomes).

## Earlier: v3
- 7 pages in one file: Home, Physics, Chemistry, Biology, Mock quiz, Doubts, About.
- Pages switch inside the same document, so the chat connection stays alive and the URL/history never changes. Do NOT split these into separate .html files, or the RAM-only chat would disconnect on every page change.
- Decorative "Ad" banners with made-up brand names. They are not links and track nothing.
- No `.nojekyll` file is needed for this project.

## Earlier changes (v2)
- It is now a plain study portal. No hidden panel anymore.
- **Glow terms**: tap a dotted-underline term in the notes and it glows on the other person's screen (the page jumps to that term so they see it).
- **Reactions**: each chapter has ✓ Got it / ? Doubt / ★ Important / ↻ Revise. The other person sees your reaction as a chip (it glows briefly).
- **Doubts & Discussion**: a normal chat at the bottom of the page.
- Same safety as before, plus: privacy blur, auto-vanish after 10 min, Clear button, and auto-panic after 3 minutes idle.

## 1. Supabase (very simple now)
1. Create a project at https://supabase.com.
2. **Project Settings → API**: copy *Project URL* and *anon public* key into `CONFIG` at the top of `script.js`.
3. That's all. It uses Realtime **Broadcast**, so there are **no tables or policies to create** and nothing is stored on the server. (`schema.sql` from v1 is no longer needed; ignore or delete it.) Never use the `service_role` key here.

## 2. How you two use it
- Both open the site, enter a name and the **same Group code** (long and random, min 8 chars) under *Doubts & Discussion*, then press Join.
- Until you join, tapping terms or reactions does nothing.
- Your private signals:
  - Tap a term → it glows for the other person.
  - Choose a reaction on a chapter → shows as a chip for them.
  - Decide privately what each word/reaction means. Nothing about the meaning is stored anywhere in the code.

## 3. Choosing your own secret words
1. In `script.js`, edit `CONFIG.GLOW_WORDS` (lowercase).
2. Make sure each word appears in the notes text in `index.html`. Words found there are automatically turned into tappable terms. Words not in the text are simply ignored.
3. Tip: use ordinary study words so nothing looks odd, and write a sentence around each so the notes read naturally.
4. Reactions can be renamed in `CONFIG.REACTIONS`.

## 4. Safety features and settings (top of `script.js`)
| Setting | Meaning |
|---|---|
| `PANIC_ON_BLUR` / `PANIC_ON_HIDDEN` | Wipe + redirect to pw.live when focus is lost / tab hidden / minimised |
| `IDLE_MS` | No activity this long → panic (default 3 min) |
| `VANISH_MS` | Doubts vanish after this time (default 10 min) |
| Privacy blur (checkbox) | Messages are blurred until you tap or hover them |
| Ctrl+Shift+X | Manual panic |

Panic only arms after you join the group, so just reading notes never redirects you.

## 5. Push to GitHub and deploy
```bash
cd studydesk
git init
git add .
git commit -m "StudyDesk v2"
git branch -M main
git remote add origin https://github.com/<your-username>/studydesk.git
git push -u origin main
```
Then repo **Settings → Pages → Deploy from a branch → main → / (root)**. Live at `https://<your-username>.github.io/studydesk/`.

## 6. Honest limitations
- Glow and reaction signals are encrypted too, but anyone who knows the Group code can send and see them. Keep the code private and change it from time to time.
- `location.replace` overwrites only the current history entry. The site's address may remain in older history, autocomplete and network logs. A private window helps.
- Blur also fires when you click the address bar or open DevTools. Set `PANIC_ON_BLUR: false` if it is too sensitive.
- If the other person is offline or the tab is closed, they miss the signal (nothing is stored).
- Supabase library loads from jsDelivr. For tighter security, host `supabase.js` in your repo and change the script tag and CSP to `'self'`.
