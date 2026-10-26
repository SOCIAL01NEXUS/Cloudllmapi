// End-to-end test in a real headless browser against a MOCK backend (no real AI providers are called).
// Run: node tests/e2e.js     (needs playwright + a chromium build)
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const assert = require("assert");
let chromium;
try { ({ chromium } = require("playwright")); } catch (e) { ({ chromium } = require("/opt/npm-tools/node_modules/playwright")); }

const ROOT = path.join(__dirname, "..", "pwa");
const requests = []; // chat requests received by the mock proxy
let groqCalls = 0;

const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*", "Access-Control-Expose-Headers": "retry-after" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  if (url === "/config.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); return res.end('window.APP_CONFIG={SUPABASE_URL:"http://localhost:' + server.address().port + '",SUPABASE_ANON_KEY:"anon"};'); }
  if (url.startsWith("/auth/v1/token")) {
    res.writeHead(200, { ...cors, "Content-Type": "application/json" });
    return res.end(JSON.stringify({ access_token: "t", refresh_token: "r", expires_in: 3600, user: { email: "me@example.com" } }));
  }
  if (url === "/functions/v1/ai-proxy") {
    let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
      const j = JSON.parse(b); const h = { ...cors, "Content-Type": "application/json" };
      if (j.action === "status") { res.writeHead(200, h); return res.end(JSON.stringify({ configured: ["groq", "gemini"].includes(j.provider), keySource: "server" })); }
      if (j.action === "models") {
        res.writeHead(200, h);
        return res.end(JSON.stringify({ data: j.provider === "groq" ? [{ id: "llama-3.3-70b-versatile" }, { id: "whisper-large-v3" }] : [{ id: "models/gemini-2.5-flash" }] }));
      }
      if (j.action === "chat") {
        requests.push({ provider: j.provider, model: j.payload.model, messages: j.payload.messages });
        if (j.provider === "groq") { groqCalls++; res.writeHead(429, { ...h, "Retry-After": "60" }); return res.end(JSON.stringify({ error: { message: "Rate limit reached for model" } })); }
        res.writeHead(200, { ...cors, "Content-Type": "text/event-stream" });
        const text = "Here you go:\n\n```js src/app.js\nconsole.log('hi');\n```\n\nAnd:\n\n```css styles/main.css\nbody{margin:0}\n```\n";
        let i = 0; const t = setInterval(() => {
          if (i >= text.length) { res.write("data: [DONE]\n\n"); res.end(); clearInterval(t); return; }
          res.write("data: " + JSON.stringify({ choices: [{ delta: { content: text.slice(i, i + 9) } }] }) + "\n\n"); i += 9;
        }, 5);
        return;
      }
      res.writeHead(400, h); res.end("{}");
    });
    return;
  }
  const f = path.join(ROOT, url === "/" ? "index.html" : url);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const ext = path.extname(f); const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" }); res.end(fs.readFileSync(f));
});

let passed = 0; const ok = (n) => { passed++; console.log("ok   -", n); };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://localhost:" + server.address().port;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.route(/cdnjs\.cloudflare\.com/, (r) => r.abort()); // prove the app works without the highlighter CDN

  await page.goto(base + "/");
  // sign in through the UI
  await page.click('#nav [data-act=goto][data-view=settings]');
  await page.click('[data-act=spage][data-p=account]');
  await page.fill("#em", "me@example.com"); await page.fill("#pw", "secret12");
  await page.click('[data-act=signin]');
  await page.waitForFunction(() => document.body.innerText.includes("Signed in as"));
  await page.click('#nav [data-act=goto][data-view=settings]');
  await page.click('[data-act=spage][data-p=providers]');
  await page.waitForFunction(() => document.body.innerText.includes("Server key"));
  ok("sign-in + provider status (groq & gemini configured, others not)");
  assert.strictEqual(await page.locator(".set-row .dot.off").count(), 4);

  // code mode, auto routing: groq is rate-limited (retry-after 60) -> falls back to gemini
  await page.click('[data-act=goto][data-view=code]');
  await page.fill("#input", "make a tiny site");
  await page.click("[data-act=send]");
  await page.waitForSelector(".msg.assistant .cb", { timeout: 15000 });
  await page.waitForFunction(() => !document.querySelector(".msg.assistant .gen") && document.querySelectorAll(".msg.assistant .cb").length === 2, null, { timeout: 15000 });
  assert.strictEqual(groqCalls, 1, "groq tried exactly once");
  assert.ok(requests.some((r) => r.provider === "gemini"));
  assert.ok((await page.textContent(".msg.assistant .meta")).includes("fallback used"));
  ok("rate-limit on groq -> fallback to gemini, shown in UI, no retry loop");

  assert.strictEqual(await page.locator(".cb .fn").first().textContent(), "src/app.js");
  assert.ok((await page.locator(".cb-g").first().textContent()).includes("1"));
  await page.click('.cb [data-act=copycode]');
  assert.strictEqual(await page.evaluate(() => navigator.clipboard.readText()), "console.log('hi');");
  ok("code block: filename, line numbers, working Copy (no highlighter CDN needed)");

  let [dl] = await Promise.all([page.waitForEvent("download"), page.click('.cb [data-act=dlcode]')]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-"));
  const p1 = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(p1);
  assert.strictEqual(dl.suggestedFilename(), "app.js"); assert.strictEqual(fs.readFileSync(p1, "utf8"), "console.log('hi');");
  ok("Download Code produces the real file content");

  await page.click('[data-act=togglefiles]');
  [dl] = await Promise.all([page.waitForEvent("download"), page.click('[data-act=zipchat]')]);
  const zp = path.join(tmp, "p.zip"); await dl.saveAs(zp);
  const names = execFileSync("python3", ["-I", "-c", "import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print('|'.join(sorted(z.namelist())))", zp]).toString().trim();
  assert.strictEqual(names, "src/app.js|styles/main.css");
  ok("Download ZIP of multi-file answer is a valid archive with preserved paths");

  // token usage labeling
  assert.ok((await page.textContent(".msg.assistant .meta")).includes("(estimated)"));
  ok("token count labeled as estimated (stream gave no provider usage)");

  // save file + persistence after reload
  await page.click('.cb [data-act=savecode]');
  await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("saved to Saved Files"));
  await page.reload();
  await page.click('[data-act=goto][data-view=history]');
  await page.waitForSelector("#hlist .ci");
  assert.ok((await page.textContent("#hlist")).includes("make a tiny site"));
  await page.click("#hlist .ci"); await page.waitForSelector(".msg.assistant .cb");
  ok("chat persists after reload (IndexedDB) and reopens from History");
  await page.click('[data-act=goto][data-view=files]'); await page.waitForSelector(".filerow");
  assert.ok((await page.textContent("#filesList")).includes("app.js"));
  ok("Saved Files persists");

  // isolation: new chat must not include the earlier chat's content
  requests.length = 0; groqCalls = 0;
  await page.click('[data-act=drawer]'); await page.click('[data-act=newchat]');
  await page.click('[data-act=goto][data-view=chat]');
  await page.fill("#input", "second chat question");
  await page.click("[data-act=send]");
  await page.waitForSelector(".msg.assistant .cb", { timeout: 15000 });
  const sent = requests.find((r) => r.provider === "gemini");
  const joined = JSON.stringify(sent.messages);
  assert.ok(joined.includes("second chat question")); assert.ok(!joined.includes("make a tiny site") && !joined.includes("console.log"));
  ok("new chat sends none of the other chat's messages");

  // same chat remembers
  await page.waitForFunction(() => !document.querySelector(".msg.assistant .gen"));
  requests.length = 0;
  await page.fill("#input", "follow up");
  await page.click("[data-act=send]");
  await page.waitForFunction(() => document.querySelectorAll(".msg.assistant").length === 2 && !document.querySelector(".gen"), null, { timeout: 15000 });
  const j2 = JSON.stringify(requests.find((r) => r.provider === "gemini").messages);
  assert.ok(j2.includes("second chat question") && j2.includes("follow up"));
  ok("same chat includes earlier messages in context");

  // manual mode + no fallback: error shown, one provider only, retry-with-other works
  await page.click('#nav [data-act=goto][data-view=settings]');
  await page.click('[data-act=spage][data-p=models]');
  await page.click('[data-act=routing][data-v=manual]');
  await page.selectOption("#selp", "groq"); await page.selectOption("#selm", "llama-3.3-70b-versatile");
  await page.click('[data-act=goto][data-view=chat]');
  requests.length = 0; groqCalls = 0;
  await page.fill("#input", "manual test"); await page.click("[data-act=send]");
  await page.waitForSelector(".errtxt", { timeout: 10000 });
  assert.ok((await page.textContent(".errtxt")).includes("Rate limit reached"));
  assert.strictEqual(requests.filter((r) => r.provider === "gemini").length, 0, "no silent provider switch");
  ok("manual mode never silently switches provider; rate-limit error is labeled");
  await page.click('[data-act=regenfb]');
  await page.waitForFunction(() => !document.querySelector(".errtxt") && !document.querySelector(".gen"), null, { timeout: 15000 });
  ok("explicit 'Retry with other provider' works");

  // delete chat needs confirmation
  await page.click('[data-act=goto][data-view=history]'); await page.waitForSelector("#hlist .ci");
  const before = await page.locator("#hlist .ci").count();
  page.once("dialog", (d) => d.dismiss()); await page.click('[data-act=delchat]');
  assert.strictEqual(await page.locator("#hlist .ci").count(), before);
  page.once("dialog", (d) => d.accept()); await page.click('[data-act=delchat]');
  await page.waitForFunction((n) => document.querySelectorAll("#hlist .ci").length === n - 1, before);
  ok("delete chat requires confirmation");

  // layout: no horizontal scroll on phone width
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.strictEqual(overflow, false); ok("no horizontal page scroll at 390px width");

  // wipe
  await page.click('[data-act=goto][data-view=history]');
  page.once("dialog", (d) => d.accept()); await page.click('[data-act=wipe]');
  await page.waitForFunction(() => document.querySelectorAll("#hlist .ci").length === 0);
  ok("Delete all data works");

  assert.deepStrictEqual(errors, [], "page errors: " + errors.join("; "));
  ok("no JavaScript errors in the page");

  // Demo mode without any backend (fresh context, default empty config)
  const page2 = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
  await page2.route(base + "/config.js", (r) => r.fulfill({ contentType: "text/javascript", body: "window.APP_CONFIG={};" }));
  await page2.goto(base + "/");
  assert.ok((await page2.textContent("#banner")).includes("Backend not configured"));
  await page2.click('#nav [data-act=goto][data-view=settings]'); await page2.click('[data-act=spage][data-p=appearance]'); await page2.check("#demo");
  await page2.click('[data-act=goto][data-view=chat]'); await page2.fill("#input", "hello"); await page2.click("[data-act=send]");
  await page2.waitForSelector(".msg.assistant .cb", { timeout: 10000 });
  assert.ok((await page2.textContent(".msg.assistant")).includes("DEMO MODE"));
  ok("demo mode is clearly labeled and works without a backend");

  await browser.close(); server.close();
  console.log("\n" + passed + " e2e checks passed");
})().catch((e) => { console.error("E2E FAILED:", e); process.exit(1); });
