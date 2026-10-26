# AI Studio — multi-provider AI chat & coding workspace (Stage 1: Core, website)

A free-to-host, mobile-friendly website that talks to several AI providers through **your own secure proxy**.
Provider keys stay on the server (Supabase Edge Function), never in the app.

**Providers (all verified OpenAI-compatible, Oct 2026):** Google Gemini, Groq, Cerebras, OpenRouter, Hugging Face, Mistral (6th provider: Mistral "Experiment" free tier).

## What works in Stage 1

| Area | Status |
|---|---|
| Multi-chat: new / rename / delete (with confirm) / search / reopen after restart | ✅ tested in a real browser |
| Separate memory per chat; same chat remembers; new chat sends nothing from other chats | ✅ tested |
| Long chats: older messages are condensed into a summary (extractive excerpt, no extra API calls) and recent messages are kept | ✅ (summary is an excerpt, not an AI summary) |
| Pinned "Project notes" per chat (requirements reused in every message of that chat) | ✅ |
| Provider manager: Auto / Manual, model lists fetched from each provider, per-provider enable + preferred model | ✅ |
| Fallback: on rate limit / quota / bad key / model unavailable / network / server error → next provider; each attempt once, short `Retry-After` honored, no loops. In Manual mode it only switches if you allow it, or via the explicit "Retry with other provider" button | ✅ tested |
| Errors are classified (rate limit, quota, invalid key, model unavailable, network, server) and shown | ✅ |
| Token usage per provider: **provider-reported** vs **≈ estimated** counted separately | ✅ |
| Coding workspace: Generate / Explain / Debug / Refactor / Review, code blocks with filename, language, line numbers, Copy, Download, Save | ✅ |
| Multi-file answers → file list → real **ZIP download** (valid archive, paths preserved, duplicate-safe, traversal-safe) | ✅ tested |
| Saved Files (device storage), view / download / share / ZIP all | ✅ |
| Text-file attachments (≤200 KB, treated as untrusted data) | ✅ |
| Export all data (JSON), delete chat, delete all data & keys | ✅ |
| Dark (default) / light theme, mobile-first | ✅ |
| Streaming + Stop | ✅ |
| Demo mode (clearly labeled mock replies) | ✅ |

## Not built yet (honestly)

- **ZIP Project Analyzer** (upload ZIP, index, modify, re-export) → Stage 2.
- **Photo Studio** (AI image editing) → Stage 3. Text-only models cannot edit images; it will only be enabled for a provider/model that really supports it.
- Installable app / offline mode (PWA) and native APK: intentionally left for later. For now it is a normal website; open it in Chrome (⋮ → Add to Home screen gives a plain shortcut).
- Syntax highlighting loads highlight.js from cdnjs; offline or if blocked, code is shown without colors (everything else works).
- Code is never executed or tested by the app; the AI is told it cannot run code.

## Architecture

```
Browser (website)  ──HTTPS + user JWT──▶  Supabase Edge Function `ai-proxy`  ──▶  provider API
 chats/files in IndexedDB                      keys in Supabase secrets                (Gemini, Groq, …)
                                               rate limit + email allowlist
```
- `pwa/` — the app (`lib.js` = tested core logic, `app.js` = UI/storage, ).
- `supabase/functions/ai-proxy/index.ts` — the proxy. Validates input, caps tokens/size, rate-limits per user, never returns or logs keys/prompts.
- `supabase/schema.sql` — one table + function used only for rate limiting.
- `tests/` — `lib.test.js` (14 unit tests) and `e2e.js` (17 real-browser checks against a mock backend).

## Setup (about 20 minutes, all free tiers)

### 1. Supabase project
1. Create a project at supabase.com. Note **Project URL** and **anon public key** (Settings → API).
2. SQL Editor → paste `supabase/schema.sql` → Run.
3. Authentication → Providers → Email: enabled. For quick testing you may turn off "Confirm email".

### 2. Provider keys (get only the ones you want)
| Provider | Where | Notes (check current limits yourself; they change) |
|---|---|---|
| Gemini | aistudio.google.com → Get API key | Free tier per model/project; Pro models mostly paid now. Free-tier data may be used by Google to improve models — don't send confidential code. |
| Groq | console.groq.com | Free tier, limits per organization/model. |
| Cerebras | cloud.cerebras.ai | One-time trial credits; a payment method is required to activate. |
| OpenRouter | openrouter.ai/keys | Models ending `:free` ≈ 20 req/min; daily cap 50 (1000 after ≥$10 lifetime credits). |
| Hugging Face | hf.co/settings/tokens | Fine-grained token with **Make calls to Inference Providers**; small monthly free credits. |
| Mistral | console.mistral.ai | Free "Experiment" tier with conservative limits (shown in the admin Limits page). |

One provider's key never works for another; each is used only for its own provider.

### 3. Deploy the proxy
```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>
cp supabase/.env.example supabase/.env      # edit: add your keys, ALLOWED_EMAILS, ALLOWED_ORIGIN
supabase secrets set --env-file supabase/.env
supabase functions deploy ai-proxy          # keep JWT verification ON (default)
```
Environment variables (all in `supabase/.env.example`): `GEMINI_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `HF_TOKEN`, `MISTRAL_API_KEY`, `ALLOWED_EMAILS`, `ALLOWED_ORIGIN`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_SECONDS`, `MAX_OUTPUT_TOKENS`.
`ALLOWED_EMAILS` restricts who can spend **your** server keys (others must add their own key). Set `ALLOWED_ORIGIN` to your site URL once deployed.

### 4. Configure and host the app
1. Edit `pwa/config.js`: set `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the anon key is public by design; never put provider keys here).
2. Host the `pwa/` folder on any static host (GitHub Pages, Netlify, Cloudflare Pages) — HTTPS is required for clipboard.
3. Open the site on your phone → Settings → create account / sign in → "Refresh status & models" → chat.

Local test: `cd pwa && python3 -m http.server 8000` → open `http://localhost:8000`, enable **Demo mode** to try the UI without a backend.

## Security notes
- No provider key is in the app. The proxy needs a valid Supabase user token, validates every field, caps output tokens, limits request size and rate per user, and only talks to the six allow-listed provider hosts.
- Optional "bring your own key": stored in this browser only after you tick consent, sent per request over HTTPS in a header to the proxy, used for that single call, never stored/logged server-side. Browser storage is not encrypted; use only on a device you trust. Remove keys any time in Settings.
- Attached/uploaded text is wrapped as untrusted data and the system prompt says so; this reduces but cannot fully eliminate prompt-injection risk.
- Chats and files stay on your device (IndexedDB). Prompts are sent to the provider you choose; read that provider's data terms.

## Testing
```bash
node tests/lib.test.js     # 14 unit tests (routing, errors, ZIP validity, context isolation, SSE…)
node tests/e2e.js          # 17 browser checks with a MOCK backend (needs playwright + chromium)
```
The e2e tests use a mock proxy, so they prove the app logic, **not** that your real keys/providers work — do a real chat after setup. The Edge Function itself was not executed here (no Supabase project available); deploy it and test with "Refresh status & models".

## Next stages
2. ZIP Project Analyzer (safe unzip with size/depth/ratio limits, file tree, search index, change proposals, revised ZIP).
3. Photo Studio with a verified image-editing provider.
