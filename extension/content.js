// YouTube sans clickbait : miniatures prises au milieu de la vidéo, et accueil + « à suivre »
// remplacés par les vidéos que Hacker News se recommande depuis 20 ans (données HackerTube).

const settings = { thumbs: true, feed: true };
let db = null;      // { list, byId, related }
let seen = [];      // vidéos de la liste déjà ouvertes, gardées dans ce navigateur

const AREAS = {
  "software": "Programmation",
  "ai-data": "IA et données",
  "math-theory": "Maths",
  "physics-space": "Physique et espace",
  "computing-history-culture": "Histoire de l'informatique",
  "hardware": "Électronique",
  "systems-security": "Systèmes et sécurité",
  "engineering-making": "Ingénierie",
  "life-sciences-health": "Biologie et santé",
  "earth-energy-environment": "Énergie et climat",
  "politics-history-society": "Histoire et société",
  "business-economics": "Business",
  "design-graphics-media": "Design",
  "games": "Jeux vidéo",
  "ideas-education": "Apprendre",
  "arts-entertainment": "Culture et humour",
};
const TYPES = {
  "Conférences": ["talk", "lecture"],
  "Documentaires": ["documentary"],
  "Explications": ["explainer"],
  "Cours": ["course", "tutorial"],
  "Interviews": ["interview", "podcast"],
};
const CHIPS = [
  { label: "Pour toi", pick: () => mix(db.list) },
  { label: "Les classiques", pick: () => db.list.filter((v) => !seen.includes(v.v)) },
  ...Object.entries(TYPES).map(([label, kinds]) => ({
    label, pick: () => mix(db.list.filter((v) => kinds.includes(v.k))),
  })),
  ...Object.entries(AREAS).map(([id, label]) => ({
    label, pick: () => mix(db.list.filter((v) => v.a === id)),
  })),
];

// ---------- miniatures ----------

const THUMB = /\/(vi|vi_webp)\/([\w-]{11})\/([\w]+)\.(jpg|webp)/;
const MIDDLE = (vid) => `https://i.ytimg.com/vi/${vid}/hq2.jpg`;

function fixImg(img) {
  const src = img.getAttribute("src") || "";
  const m = src.match(THUMB);
  if (settings.thumbs) {
    if (!m || m[3] === "hq2") return;
    // les images d'aperçu animé et les avatars ne passent pas par /vi/
    img.dataset.htOrig = src;
    img.setAttribute("src", MIDDLE(m[2]));
  } else if (img.dataset.htOrig) {
    img.setAttribute("src", img.dataset.htOrig);
    delete img.dataset.htOrig;
  }
}

const fixAll = (root = document) => root.querySelectorAll?.("img").forEach(fixImg);

// ---------- données ----------

async function loadDb() {
  if (db) return db;
  const get = (f) => fetch(chrome.runtime.getURL(`data/${f}`)).then((r) => r.json());
  const [list, related] = await Promise.all([get("videos.json"), get("related.json")]);
  db = { list, related, byId: Object.fromEntries(list.map((v) => [v.v, v])) };
  return db;
}

// tirage pondéré par le score : les classiques sortent plus souvent, l'ordre change à chaque visite
function mix(list) {
  return list
    .filter((v) => !seen.includes(v.v))
    .map((v) => ({ v, k: Math.random() ** (1 / v.s) }))
    .sort((a, b) => b.k - a.k)
    .map((x) => x.v);
}

// ---------- rendu ----------

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const thumbSrc = (vid) => (settings.thumbs ? MIDDLE(vid) : `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`);
const since = (v) => (v.y[0] === v.y[1] ? `en ${v.y[0]}` : `depuis ${v.y[0]}`);
const people = (n) => `${n} ${n > 1 ? "personnes" : "personne"}`;

function card(v) {
  return `<a class="ht-card" href="/watch?v=${v.v}" title="${esc(v.w)}">
    <div class="ht-thumb"><img src="${thumbSrc(v.v)}" alt="" loading="lazy"></div>
    <div class="ht-title">${esc(v.t)}</div>
    <div class="ht-meta">${esc(v.c)}</div>
    <div class="ht-meta">Recommandée par ${people(v.r)} ${since(v)}</div>
    ${v.q ? `<div class="ht-quote">« ${esc(v.q)} »</div>` : ""}
  </a>`;
}

// YouTube renvoie une image grise de 120 px quand la vidéo a été supprimée ou rendue privée
function dropDeleted(box) {
  box.querySelectorAll(".ht-thumb img").forEach((img) => {
    const drop = () => img.closest(".ht-card, .ht-row")?.remove();
    img.addEventListener("load", () => { if (img.naturalWidth <= 120) drop(); });
    img.addEventListener("error", drop);
  });
}

function renderHome(box, chipIndex = 0, count = 24) {
  const chip = CHIPS[chipIndex];
  const list = chip.pick();
  box.innerHTML = `
    <div class="ht-head">
      <div class="ht-h1">Ce que des ingénieurs se recommandent depuis 20 ans</div>
      <div class="ht-sub">${db.list.length.toLocaleString("fr-FR")} vidéos retenues dans 43 millions de commentaires Hacker News · données HackerTube</div>
    </div>
    <div class="ht-chips">${CHIPS.map((c, i) =>
      `<button class="ht-chip${i === chipIndex ? " on" : ""}" data-i="${i}">${esc(c.label)}</button>`).join("")}</div>
    <div class="ht-grid">${list.slice(0, count).map(card).join("")}</div>
    ${list.length > count ? `<button class="ht-more">Plus de vidéos</button>` : ""}`;
  box.querySelectorAll(".ht-chip").forEach((b) => (b.onclick = () => renderHome(box, +b.dataset.i)));
  const more = box.querySelector(".ht-more");
  if (more) more.onclick = () => renderHome(box, chipIndex, count + 24);
  box.dataset.chip = chipIndex;
  dropDeleted(box);
}

function renderSide(box, vid) {
  const here = db.byId[vid];
  const ids = here ? db.related[vid] || [] : mix(db.list).slice(0, 12).map((v) => v.v);
  box.innerHTML = `
    <div class="ht-side-h">${here ? "À voir ensuite, selon Hacker News" : "Ce que des ingénieurs recommandent"}</div>
    ${ids.map((id) => db.byId[id]).filter(Boolean).map((v) => `
      <a class="ht-row" href="/watch?v=${v.v}" title="${esc(v.w)}">
        <div class="ht-thumb"><img src="${thumbSrc(v.v)}" alt="" loading="lazy"></div>
        <div>
          <div class="ht-title">${esc(v.t)}</div>
          <div class="ht-meta">${esc(v.c)}</div>
          <div class="ht-meta">Recommandée par ${people(v.r)}</div>
        </div>
      </a>`).join("")}`;
  dropDeleted(box);
}

function renderBadge(box, v) {
  box.innerHTML = `
    <div class="ht-badge-top"><b>H</b> Recommandée par ${people(v.r)} sur Hacker News ${since(v)}</div>
    ${v.q ? `<div class="ht-badge-quote">« ${esc(v.q)} »${v.qy ? ` <span>(${esc(v.qy)})</span>` : ""}</div>` : ""}`;
}

// ---------- synchronisation avec la page (YouTube est une appli d'une seule page) ----------

function ensure(id, parent, before = null) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
  }
  if (el.parentElement !== parent) parent.insertBefore(el, before);
  return el;
}

async function sync() {
  document.documentElement.classList.toggle("ht-feed-on", settings.feed);
  ensureToggle();
  if (!settings.feed) {
    document.querySelectorAll("#ht-home, #ht-side, #ht-badge").forEach((el) => el.remove());
    return;
  }
  await loadDb();

  if (location.pathname === "/") {
    const grid = document.querySelector('ytd-browse[page-subtype="home"] ytd-rich-grid-renderer');
    if (grid) {
      const box = ensure("ht-home", grid.parentElement, grid);
      if (!box.firstChild) renderHome(box);
    }
  }

  const vid = location.pathname === "/watch" ? new URLSearchParams(location.search).get("v") : null;
  if (vid) {
    const related = document.querySelector("#related");
    if (related) {
      const box = ensure("ht-side", related, related.firstChild);
      if (box.dataset.vid !== vid) { renderSide(box, vid); box.dataset.vid = vid; }
    }
    const v = db.byId[vid];
    const title = document.querySelector("ytd-watch-metadata #title");
    const badge = document.getElementById("ht-badge");
    if (v && title) {
      const box = ensure("ht-badge", title.parentElement, title.nextSibling);
      if (box.dataset.vid !== vid) { renderBadge(box, v); box.dataset.vid = vid; }
      if (!seen.includes(vid)) { seen.push(vid); chrome.storage.local.set({ seen }); }
    } else if (badge && !v) badge.remove();
  }
}

// ---------- bouton de bascule ----------

function ensureToggle() {
  if (!document.body) return;
  let t = document.getElementById("ht-toggle");
  if (!t) {
    t = document.createElement("div");
    t.id = "ht-toggle";
    t.innerHTML = `<button data-k="thumbs"></button><button data-k="feed"></button>`;
    t.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      settings[b.dataset.k] = !settings[b.dataset.k];
      chrome.storage.local.set({ [b.dataset.k]: settings[b.dataset.k] });
      fixAll();
      document.querySelectorAll("#ht-home, #ht-side").forEach((el) => el.remove());
      sync();
    }));
    document.body.appendChild(t);
  }
  const labels = {
    thumbs: settings.thumbs ? "Miniatures : image de la vidéo" : "Miniatures : originales",
    feed: settings.feed ? "Recos : Hacker News" : "Recos : YouTube",
  };
  // ne toucher au DOM que si ça change, sinon l'observateur relance sync en boucle
  t.querySelectorAll("button").forEach((b) => {
    if (b.textContent !== labels[b.dataset.k]) b.textContent = labels[b.dataset.k];
    if (b.classList.contains("on") !== settings[b.dataset.k]) b.classList.toggle("on", settings[b.dataset.k]);
  });
}

// ---------- démarrage ----------

let timer = 0;
const later = () => { clearTimeout(timer); timer = setTimeout(sync, 150); };

chrome.storage.local.get({ thumbs: true, feed: true, seen: [] }, (s) => {
  settings.thumbs = s.thumbs;
  settings.feed = s.feed;
  seen = s.seen;
  new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "attributes") fixImg(m.target);
      else m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.tagName === "IMG") fixImg(n); else fixAll(n); } });
    }
    later();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
  fixAll();
  window.addEventListener("yt-navigate-finish", later);
  later();
});
