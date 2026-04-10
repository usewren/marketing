/**
 * gen-screenshots.mjs
 * Generates tutorial screenshots for wren/marketing/img/.
 *
 * Usage:
 *   node gen-screenshots.mjs
 *   # or with bun:
 *   bun gen-screenshots.mjs
 *
 * Requires: puppeteer-core + Google Chrome installed.
 *   npm install puppeteer-core   (in this directory or /tmp)
 *
 * The script seeds fresh golf-magazine demo data, then walks through
 * the admin UI capturing each tutorial screenshot.
 */

import puppeteer from "puppeteer-core";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT   = join(__dirname, "img");
const BASE  = process.env.WREN_URL  ?? "http://localhost:4000";
const EMAIL = process.env.WREN_EMAIL ?? "screenshots@golf-magazine.com";
const PASS  = process.env.WREN_PASS  ?? "golf1234!";
const CHROME = process.env.CHROME_BIN ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

await mkdir(OUT, { recursive: true });

// ── Seed demo data ─────────────────────────────────────────────────────────

async function apiPost(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Origin": BASE,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return res;
}

async function apiPut(path, body, cookie) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Origin": BASE,
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
  return res;
}

// Sign up (ignore failure if user already exists) then sign in
await apiPost("/api/auth/sign-up/email", { email: EMAIL, password: PASS, name: "Golf Magazine" });
const signInRes = await apiPost("/api/auth/sign-in/email", { email: EMAIL, password: PASS });
if (!signInRes.ok) {
  console.error("Sign-in failed:", signInRes.status, await signInRes.text());
  process.exit(1);
}
const cookie = decodeURIComponent(signInRes.headers.get("set-cookie")?.split(";")[0] ?? "");
console.log("✓ signed in as", EMAIL);

// Create articles collection with 3 docs
const a1 = await (await apiPost("/api/v1/articles", {
  title: "Masters 2026 Preview",
  author: "James Spence",
  published: false,
  body: "Augusta National is set to host another thrilling Masters tournament.",
  tags: ["masters", "major", "augusta"],
}, cookie)).json();

const a2 = await (await apiPost("/api/v1/articles", {
  title: "Rory McIlroy's Quest for the Grand Slam",
  author: "Sarah Kent",
  published: true,
  body: "After decades of near misses, Rory McIlroy is closer than ever to completing golf's Grand Slam.",
  tags: ["rory", "grand-slam", "major"],
}, cookie)).json();

const a3 = await (await apiPost("/api/v1/articles", {
  title: "Best Golf Courses in Scotland",
  author: "James Spence",
  published: true,
  body: "From St Andrews to Royal Dornoch, Scotland offers the finest links golf in the world.",
  tags: ["courses", "scotland", "links"],
}, cookie)).json();

console.log("✓ seeded 3 articles");

// Update article 1 twice → 3 versions
await apiPut(`/api/v1/articles/${a1.id}`, {
  title: "Masters 2026 Preview",
  author: "James Spence",
  published: false,
  body: "Augusta National is set to host another thrilling Masters tournament. Tiger Woods has confirmed his participation.",
  tags: ["masters", "major", "augusta"],
}, cookie);

await apiPut(`/api/v1/articles/${a1.id}`, {
  title: "Masters 2026 Preview",
  author: "James Spence",
  published: true,
  body: "Augusta National is set to host another thrilling Masters tournament. Tiger Woods confirmed his participation after months of speculation.",
  tags: ["masters", "major", "augusta", "tiger"],
}, cookie);

await apiPost(`/api/v1/articles/${a1.id}/labels`, { label: "published" }, cookie);
console.log("✓ article 1 has 3 versions + published label");

// Set JSON Schema on articles
await apiPut("/api/v1/articles/_schema", {
  schema: {
    type: "object",
    required: ["title", "author"],
    properties: {
      title:     { type: "string" },
      author:    { type: "string" },
      published: { type: "boolean" },
      body:      { type: "string" },
      tags:      { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  },
  displayName: "Articles",
  collectionType: "article",
}, cookie);
console.log("✓ schema set on articles");

// Assign tree paths
await apiPut("/api/v1/tree/site/tournaments/masters-2026", { documentId: a1.id }, cookie);
await apiPut("/api/v1/tree/site/players/rory-mcilroy",    { documentId: a2.id }, cookie);
await apiPut("/api/v1/tree/site/guides/scotland-courses",  { documentId: a3.id }, cookie);
console.log("✓ tree paths assigned");

const AUGUSTA_ID = a1.id;
console.log("Augusta article ID:", AUGUSTA_ID);

// ── Browser screenshots ────────────────────────────────────────────────────

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const shot = async (name) => {
  await new Promise(r => setTimeout(r, 700));
  await page.screenshot({ path: join(OUT, name) });
  console.log("📸", name);
};

const goto = async (hash) => {
  await page.evaluate(h => { location.hash = h; }, hash);
  await new Promise(r => setTimeout(r, 1400));
};

const clickTab = async (label) => {
  await page.evaluate((lbl) => {
    const tabs = [...document.querySelectorAll("button.tab, .tab, [role=tab], nav button, .tabs button")];
    const t = tabs.find(el => el.textContent.trim().toLowerCase().startsWith(lbl.toLowerCase()));
    if (t) t.click();
  }, label);
  await new Promise(r => setTimeout(r, 900));
};

// ── 01. Login page ────────────────────────────────────────────────────────
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await shot("01-login.png");

// ── Log in ────────────────────────────────────────────────────────────────
await page.type('input[type="email"], input[name="email"]', EMAIL);
await page.type('input[type="password"], input[name="password"]', PASS);
await page.click('button[type="submit"]');
await new Promise(r => setTimeout(r, 2500));

// Navigate to admin
await page.goto(`${BASE}/admin`, { waitUntil: "networkidle2" });
await new Promise(r => setTimeout(r, 1500));

// ── 02. Collections list ──────────────────────────────────────────────────
await goto("#/");
await shot("02-collections.png");

// ── 03. Articles document list ────────────────────────────────────────────
await goto("#/collections/articles");
await shot("03-document-list.png");

// ── 04. Document editor ───────────────────────────────────────────────────
await goto(`#/collections/articles/${AUGUSTA_ID}`);
await shot("04-document-editor.png");

// ── 05. Version history ───────────────────────────────────────────────────
await clickTab("History");
await shot("05-version-history.png");

// ── 06. Diff — click diff button on a version row ─────────────────────────
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button, a")];
  const diff = btns.find(el => /diff/i.test(el.textContent));
  if (diff) diff.click();
});
await new Promise(r => setTimeout(r, 900));
await shot("06-diff.png");

// ── 07. Labels ────────────────────────────────────────────────────────────
await goto(`#/collections/articles/${AUGUSTA_ID}`);
await clickTab("Labels");
await shot("07-labels.png");

// ── 07b. Paths (tree assignment) ──────────────────────────────────────────
await goto(`#/collections/articles/${AUGUSTA_ID}`);
await clickTab("Paths");
await shot("07b-paths.png");

// ── 08. Schema ────────────────────────────────────────────────────────────
await goto("#/collections/articles");
await clickTab("Schema");
await shot("08-schema.png");

// ── 09. Tree browser — file-browser view at root ─────────────────────────
await goto("#/trees/site");
await new Promise(r => setTimeout(r, 1200));
await shot("09-tree.png");

// ── 09b. Tree browser — drilled into a path with a document ──────────────
await goto("#/trees/site?path=%2Ftournaments%2Fmasters-2026");
await new Promise(r => setTimeout(r, 1200));
await shot("09b-tree-path.png");

// ── 10. API Keys ──────────────────────────────────────────────────────────
await goto("#/settings/apikeys");
await shot("10-apikeys.png");

// ── 11. Collaborators ─────────────────────────────────────────────────────
await goto("#/settings/collaborators");
await shot("11-collaborators.png");

// ── 12. Permissions ───────────────────────────────────────────────────────
await goto("#/settings/permissions");
await shot("12-permissions.png");

await browser.close();
console.log("\n✅ All screenshots saved to", OUT);
