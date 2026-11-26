# Study Buddy

A calm, private NEET UG preparation website. Pure **HTML + CSS + vanilla JavaScript (ES modules)** with **Supabase** for login and database. No build step, no Node server, no framework. Upload the files to GitHub and turn on GitHub Pages.

**Features:** NCERT-focused chapters (important points, formulas, diagrams) · YouTube class embeds (official IFrame player) · chapter quizzes and previous-year practice (timer, NEET negative marking, weak-topic report) · revision flashcards · daily check-in with streak and weekly summary · opt-in study partner · AI Study Assistant · admin panel with aggregate analytics only · dark mode.

---

## 1. Folder structure

```
study-buddy/
├── index.html            landing page
├── login.html  signup.html
├── dashboard.html  subjects.html  chapter.html  quiz.html
├── daily-checkin.html  progress.html  doubts.html
├── admin.html
├── css/   style.css  components.css  animations.css
├── js/
│   ├── supabase.js       ← put your Supabase URL + anon key here
│   ├── ui.js             shared header, icons, toasts, validators
│   ├── theme.js          applies dark/light before first paint
│   ├── auth.js  subjects.js  chapter.js  quiz.js  checkin.js
│   ├── progress.js  partner.js  doubts.js  admin.js  youtube.js
├── sql/
│   ├── schema.sql        tables + Row Level Security + functions
│   └── seed.sql          sample Physics / Chemistry / Botany / Zoology data
├── supabase/functions/ai-assistant/index.ts    secure AI backend
├── assets/icons/  assets/images/
└── README.md
```

---

## 2. Set up Supabase (about 10 minutes)

1. Create a free project at <https://supabase.com>.
2. **SQL Editor → New query**, paste all of `sql/schema.sql`, click **Run**.
3. New query again, paste all of `sql/seed.sql`, click **Run**. (Run the seed only once.)
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
5. Open `js/supabase.js` and replace:
   ```js
   export const SUPABASE_URL = 'https://YOUR-PROJECT-REF.supabase.co';
   export const SUPABASE_ANON_KEY = 'YOUR-ANON-PUBLIC-KEY';
   ```
   The anon key is **meant to be public**. Your data is protected by Row Level Security, not by hiding this key.
   **Never** paste the `service_role` key anywhere in this website.
6. **Authentication → Providers → Email**: keep it enabled. Leave "Confirm email" on for real use (turn it off only while testing).
7. **Authentication → URL Configuration**:
   * **Site URL**: `https://YOUR-USERNAME.github.io/YOUR-REPO/`
   * **Redirect URLs**: add the same URL with `**` at the end, for example `https://YOUR-USERNAME.github.io/YOUR-REPO/**`
   (Needed so confirmation and password-reset links return to your site.)

### Make yourself an admin
Sign up on the website first, then run this once in the SQL Editor (use your e-mail):
```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```
Admin rights can only be granted this way, never from the browser.

### Turn on the AI Study Assistant
The AI key must stay on the server, so the assistant runs as a Supabase Edge Function.

```bash
npm i -g supabase                       # or see Supabase CLI docs
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...        # your key, stored only in Supabase
supabase secrets set ALLOWED_ORIGIN=https://YOUR-USERNAME.github.io
# optional: supabase secrets set AI_MODEL=claude-haiku-5-5
supabase functions deploy ai-assistant
```
No CLI? In the dashboard open **Edge Functions → Deploy a new function**, name it `ai-assistant`, paste `index.ts`, and add the secrets under **Edge Functions → Secrets**.

Without this step everything else works; the Doubts page will show a friendly "not set up yet" message.

---

## 3. Deploy on GitHub Pages

1. Create a new GitHub repository (public, or private on a plan that allows Pages).
2. Upload the **contents** of the `study-buddy` folder so that `index.html` is at the top level of the repo (drag and drop in the GitHub web UI works).
3. **Settings → Pages → Build and deployment → Source: Deploy from a branch**, Branch: `main`, folder: `/ (root)`. Save.
4. After about a minute your site is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

All links are relative, so it works under a repository sub-path. To test locally you need any static server (ES modules do not load from `file://`), for example `python3 -m http.server 8000`.

---

## 4. Adding content (Admin → Syllabus & lessons)

* **Subjects / units / chapters:** add, edit and reorder. Chapter fields use simple line formats:
  * Formulas: `label | formula`
  * Diagrams: `title | note`
  * Flashcards: `question | answer`
* **YouTube lessons:** open a chapter's **Lessons**, paste any YouTube link (watch, youtu.be or embed). Only your own or properly licensed videos should be added. No video links are pre-loaded.
* **Quizzes and questions:** **Quizzes & questions** tab. A quiz can be marked as a previous-year set with its exam year. Each question has 4 options, one correct answer, a topic (drives the weak-topic report) and an explanation.

The seed includes the chapter list for the whole syllabus, plus full sample content for 8 chapters. The seed questions are original practice questions, **not** real past-paper questions. Please check facts against your current NCERT edition and the latest NTA syllabus.

---

## 5. Privacy and security model

| Data | Who can read it |
|---|---|
| Daily check-in, **private note**, lesson progress, quiz attempts and **answers**, AI chats | Only the student who owns them (Row Level Security: `user_id = auth.uid()`) |
| Syllabus content | Any logged-in user read; **only admins write** |
| Admin analytics | Totals and averages only, via `admin_*` functions. Groups smaller than 3 students are hidden |
| Study-partner data | Only the 4 fields the other student ticked: today's completion %, quiz count, subject progress, streak |

**How it is enforced (in the database, not in hidden front-end code):**

* RLS is enabled on all 12 tables; `anon` (not logged in) has no table access.
* Admins have **no policy** on `profiles` (others), `lesson_progress`, `daily_goals`, `quiz_attempts`, `doubts` or `study_partner_shares`. Even a modified front end cannot read them.
* The `role` column cannot be changed from the browser (column-level grants), and the sign-up trigger always creates `student`.
* Quiz scores are re-marked on the server by `submit_quiz_attempt()`; students cannot insert fake attempts.
* Study partner: request → other student must **accept** → each side ticks what to share → either side can **stop**, which deletes the link. Nothing is shared automatically. There is no messaging, location, device or screen tracking anywhere.
* The Edge Function uses the **student's own token**, so AI chat rows are protected by RLS too. It is rate-limited and has no service-role key.
* The front end validates inputs and escapes all database/AI text before showing it (no `innerHTML` of raw user data).

**Known limits (please read):**

* Students can technically read the correct answers of questions in the database (needed for instant feedback in practice mode). This is a practice tool, not a proctored exam.
* `username_available()` lets sign-up check whether a username is taken, so usernames can be probed. E-mails cannot (partner requests give the same reply whether or not the account exists).
* Admins can see the aggregate "commonly incorrect topics" only when at least 3 students (and 10 answers) back a number. On a tiny test site, the admin charts stay empty on purpose. To change the threshold, edit `privacy_min_group()` in `schema.sql`.
* The AI can be wrong. The page says so and tells students to verify with NCERT or a teacher.

### Quick RLS check after setup
Run in the SQL editor; it should return **no rows**:
```sql
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;
```
Then sign up two test students and confirm that neither can see the other's quizzes, notes or chats from the pages, and that an admin account sees only counts on the Analytics tab.

---

## 6. Customising

* Colours and spacing: CSS variables at the top of `css/style.css` (light and dark).
* Streak threshold: 50% daily completion (`STREAK_THRESHOLD` in `js/checkin.js` and `_streak_for` in `schema.sql`; change both).
* Marking scheme: +4 / −1 (`MARKS_*` in `js/quiz.js` and `submit_quiz_attempt` in `schema.sql`).
* Tables you asked for: `profiles, subjects, units, chapters, lessons, lesson_progress, quizzes, questions, quiz_attempts, daily_goals, study_partner_shares, doubts`.

Study Buddy is an independent study tool and is not affiliated with the NTA.
