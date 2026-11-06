// Charge l'extension dans Chromium et la vérifie sur le vrai youtube.com.
// Usage : npm install && npx playwright install chromium && node test.mjs [--headed]
// (CHROME_PATH=... pour utiliser un autre Chromium)
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const ext = path.resolve(here, "../extension");
const shots = path.join(here, "screenshots");
const profile = path.join(here, ".profile");
mkdirSync(shots, { recursive: true });
rmSync(profile, { recursive: true, force: true });

// les extensions demandent le vrai Chromium (pas la version « headless shell »)
const exe = process.env.CHROME_PATH;

const ctx = await chromium.launchPersistentContext(profile, {
  ...(exe ? { executablePath: exe } : { channel: "chromium" }),
  headless: !process.argv.includes("--headed"),
  locale: "fr-FR",
  viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});
const page = ctx.pages()[0] || (await ctx.newPage());
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "OK " : "ÉCHEC"} ${name} ${detail}`); };
const wait = (ms) => page.waitForTimeout(ms);

// fenêtre des cookies : choix le plus respectueux de la vie privée, une seule fois par profil
let consented = false;
async function consent() {
  if (consented) return;
  const btn = page.locator('button:has-text("Tout refuser"), button:has-text("Reject all")').first();
  if (await btn.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false)) {
    await btn.click();
    consented = true;
    await wait(2000);
  }
}

// 1. accueil
await page.goto("https://www.youtube.com/", { waitUntil: "domcontentloaded" });
await consent();
await page.waitForSelector("#ht-home .ht-card", { timeout: 30000 }).catch(() => {});
await wait(2500);
const home = await page.evaluate(() => ({
  cards: document.querySelectorAll("#ht-home .ht-card").length,
  middle: [...document.querySelectorAll("#ht-home .ht-card img")].filter((i) => i.src.endsWith("/hq2.jpg")).length,
  gridHidden: getComputedStyle(document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer') || document.body).display,
  loaded: [...document.querySelectorAll("#ht-home .ht-card img")].slice(0, 8).filter((i) => i.complete && i.naturalWidth > 0).length,
}));
check("accueil remplacé", home.cards === 24 && home.gridHidden === "none", JSON.stringify(home));
await page.screenshot({ path: path.join(shots, "1-accueil.png") });

// 1 bis. vidéos supprimées retirées (image grise de 120 px)
await page.click(".ht-more");
for (let y = 0; y < 12; y++) { await page.mouse.wheel(0, 900); await wait(400); }
await wait(2000);
const grey = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("#ht-home .ht-card img")];
  return { cards: imgs.length, grey: imgs.filter((i) => i.complete && i.naturalWidth > 0 && i.naturalWidth <= 120).length };
});
check("vidéos supprimées retirées", grey.grey === 0, JSON.stringify(grey));
await page.evaluate(() => window.scrollTo(0, 0));

// 2. filtre
await page.click('.ht-chip:has-text("Documentaires")');
await wait(1500);
const docs = await page.evaluate(() => [...document.querySelectorAll("#ht-home .ht-title")].slice(0, 4).map((e) => e.textContent));
check("filtre Documentaires", docs.length === 4, JSON.stringify(docs));
await page.screenshot({ path: path.join(shots, "2-documentaires.png") });

// 3. recherche : toutes les miniatures passent à l'image du milieu
await page.goto("https://www.youtube.com/results?search_query=comment+fonctionne+un+processeur", { waitUntil: "domcontentloaded" });
await consent();
await page.waitForSelector("ytd-video-renderer img[src*='ytimg']", { timeout: 30000 }).catch(() => {});
await wait(3000);
const search = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("ytd-video-renderer img")].filter((i) => /\/vi(_webp)?\//.test(i.src));
  return { total: imgs.length, middle: imgs.filter((i) => i.src.endsWith("/hq2.jpg")).length };
});
check("miniatures de recherche", search.total > 0 && search.middle === search.total, JSON.stringify(search));
await page.screenshot({ path: path.join(shots, "3-recherche-milieu.png") });

// 4. bascule vers les miniatures originales
await page.click('#ht-toggle [data-k="thumbs"]');
await wait(2000);
const orig = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll("ytd-video-renderer img")].filter((i) => /\/vi(_webp)?\//.test(i.src));
  return { total: imgs.length, middle: imgs.filter((i) => i.src.endsWith("/hq2.jpg")).length };
});
check("bascule miniatures originales", orig.total > 0 && orig.middle === 0, JSON.stringify(orig));
await page.screenshot({ path: path.join(shots, "4-recherche-originales.png") });
await page.click('#ht-toggle [data-k="thumbs"]');
await wait(1000);

// 5. vidéo de la liste : badge + « à suivre »
await page.goto("https://www.youtube.com/watch?v=fNk_zzaMoSs", { waitUntil: "domcontentloaded" });
await consent();
await page.waitForSelector("#ht-badge", { timeout: 30000 }).catch(() => {});
await page.waitForSelector("#ht-side .ht-row", { timeout: 30000 }).catch(() => {});
await wait(2500);
const watch = await page.evaluate(() => ({
  badge: document.querySelector("#ht-badge")?.innerText,
  side: document.querySelector("#ht-side .ht-side-h")?.textContent,
  rows: document.querySelectorAll("#ht-side .ht-row").length,
  ytHidden: [...document.querySelectorAll("#related > :not(#ht-side)")].every((e) => getComputedStyle(e).display === "none"),
}));
check("badge et à suivre", !!watch.badge && watch.rows === 12 && watch.ytHidden, JSON.stringify(watch));
await page.screenshot({ path: path.join(shots, "5-video-hn.png") });

// 6. navigation interne de YouTube (sans recharger) vers une vidéo hors liste
await page.evaluate(() => {
  const a = document.createElement("a");
  a.href = "/watch?v=jNQXAC9IVRw";
  document.querySelector("ytd-app").appendChild(a);
});
await page.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.querySelector("#ht-side")?.dataset.vid === "jNQXAC9IVRw", null, { timeout: 30000 }).catch(() => {});
await wait(1500);
const other = await page.evaluate(() => ({
  badge: !!document.querySelector("#ht-badge"),
  side: document.querySelector("#ht-side .ht-side-h")?.textContent,
  rows: document.querySelectorAll("#ht-side .ht-row").length,
}));
check("vidéo hors liste", !other.badge && other.rows === 12, JSON.stringify(other));
await page.screenshot({ path: path.join(shots, "6-video-hors-liste.png") });

// 7. clic dans « à suivre » : la vidéo suivante a bien son badge
await page.goto("https://www.youtube.com/watch?v=fNk_zzaMoSs", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#ht-side .ht-row", { timeout: 30000 });
const next = await page.$eval("#ht-side .ht-row", (a) => a.getAttribute("href"));
await page.click("#ht-side .ht-row");
await page.waitForURL((u) => u.href.includes(next.split("=")[1]), { timeout: 30000 });
await page.waitForSelector("#ht-badge", { timeout: 30000 }).catch(() => {});
check("clic sur une reco", await page.$("#ht-badge").then(Boolean), next);

await ctx.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} vérifications passées`);
process.exit(failed ? 1 : 0);
