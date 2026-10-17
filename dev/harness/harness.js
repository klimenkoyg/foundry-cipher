/* Стенд: запускает настоящий модуль поверх имитации Foundry.
   Сценарии для снимков: ?scene=workshop|player|table|export&kind=<вид>[&step=N][&ops=a,b][&parts=a,b][&state={…}][&image=<id>][&as=<userId>]. */

const $ = (s) => document.querySelector(s);
const { users, reset } = window.__mock;
const params = new URLSearchParams(location.search);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function toast(level, message) {
  const el = document.createElement("div");
  el.className = `toast ${level}`;
  el.textContent = message;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 3500);
}

function chat(data) {
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `<header>${data.speaker?.alias ?? ""}${data.whisper ? " (шёпотом)" : ""}</header>${data.content ?? ""}`;
  $("#chat-log").prepend(el);
}

function journal(entry) {
  const el = document.createElement("div");
  el.className = "jr";
  const imgs = entry.pages.filter((p) => p.type === "image").map((p) => `<img src="${p.src}" alt="${p.name}">`).join(" ");
  el.innerHTML = `<b>${entry.name}</b><div>${imgs}</div>`;
  $("#journal-log").prepend(el);
}

window.__harness = { toast, chat, journal };

/* Стили и переводы — как их подключает Foundry по module.json. */
const manifest = await (await fetch("/module.json", { cache: "no-store" })).json();
for (const href of manifest.styles) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `/${href}`;
  document.head.insertBefore(link, document.head.querySelector('link[href="harness.css"]'));
}
// ?hostile=1 — «враждебные» стили, как у Foundry: проверка, что окна модуля их перекрывают.
if (params.has("hostile")) document.head.append(Object.assign(document.createElement("link"), { rel: "stylesheet", href: "hostile.css" }));
const merge = (a, b) => {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a[k] ?? {}, v) : v;
  return a;
};
for (const l of manifest.languages.filter((x) => x.lang === game.i18n.lang)) {
  merge(game.i18n.translations, await (await fetch(`/${l.path}`, { cache: "no-store" })).json());
}

await import("/scripts/main.mjs");
Hooks.callAll("init");
await foundry.applications.handlebars._pending;
Hooks.callAll("ready");

const { Puzzles, Tables, Inbox, blankPuzzle } = await import("/scripts/foundry/store.mjs");
const { listKinds, getKind, allParts } = await import("/scripts/foundry/kinds/index.mjs");

/* ---------- кто смотрит: «перезайти» другим пользователем ---------- */
function setUser(user) {
  for (const app of [...foundry.applications.instances.values()]) app.close();
  game.user = user;
  for (const b of document.querySelectorAll("[data-user]")) b.setAttribute("aria-pressed", String(b.dataset.user === user.id));
  // как вход в мир: модуль сверяет, что лежит у пользователя
  Hooks.callAll("updateUser", user, { flags: { ssl_ciphers: { inbox: {} } } });
  Hooks.callAll("ssl_ciphers.tables");
}
for (const user of users) {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.user = user.id;
  b.textContent = user.character ? `${user.name} (${user.character.name})` : user.name;
  b.addEventListener("click", () => setUser(user));
  $("#users").append(b);
}

$("#open-panel").addEventListener("click", () => {
  const controls = { tokens: { tools: {} } };
  Hooks.callAll("getSceneControlButtons", controls);
  controls.tokens.tools.sslCiphers.onChange();
});

/* Пример для каждого вида — чтобы было с чем играть. */
for (const kind of listKinds().filter((k) => k.ready !== false)) $("#demo-kind").add(new Option(game.i18n.localize(`CIPHERS.Kind.${kind.id}.name`), kind.id));
async function demoPuzzle(kindId) {
  const kind = getKind(kindId);
  const p = blankPuzzle(kind.id, kind.demo());
  await Puzzles.save(p);
  return p;
}
$("#demo").addEventListener("click", async () => {
  const p = await demoPuzzle($("#demo-kind").value);
  toast("info", `«${p.title}» добавлен в мастерскую`);
});
$("#reset").addEventListener("click", reset);

const bar = $(".hbar");
new ResizeObserver(() => document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`)).observe(bar);

/* ---------- для проверок из консоли ---------- */
const errors = [];
const originalError = console.error;
console.error = (...args) => {
  errors.push(args.map((x) => x?.stack ?? String(x)).join(" ").slice(0, 600));
  originalError(...args);
};
window.addEventListener("unhandledrejection", (e) => errors.push(`unhandled: ${e.reason?.stack ?? e.reason}`));
window.addEventListener("error", (e) => errors.push(`error: ${e.message}`));
/** Проверка вёрстки окон модуля: кнопки с обрезанным текстом и налезающие друг на друга строки.
    Видимое считается с учётом прокрутки: то, что спрятано за краем списка, не в счёт. Удобно с ?hostile=1. */
function audit() {
  const issues = [];
  const name = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} «${(el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28)}»`;
  const clip = (el) => {
    let r = { left: -1e9, top: -1e9, right: 1e9, bottom: 1e9 };
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (!/(auto|scroll|hidden|clip)/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
      const pr = p.getBoundingClientRect();
      r = { left: Math.max(r.left, pr.left), top: Math.max(r.top, pr.top), right: Math.min(r.right, pr.right), bottom: Math.min(r.bottom, pr.bottom) };
    }
    return r;
  };
  const shown = (el) => {
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return null;
    const r = el.getBoundingClientRect();
    const c = clip(el);
    const box = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) };
    return box.right - box.left > 1 && box.bottom - box.top > 1 ? box : null;
  };
  for (const win of document.querySelectorAll(".ssl-ciphers")) {
    for (const b of win.querySelectorAll("button")) {
      if (!shown(b)) continue;
      if (b.scrollHeight > b.clientHeight + 2) issues.push(`обрезан по высоте: ${name(b)}`);
      if (b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).textOverflow !== "ellipsis") issues.push(`обрезан по ширине: ${name(b)}`);
    }
    const texts = [...win.querySelectorAll("*")]
      .filter((el) => !el.closest("svg") && getComputedStyle(el).position !== "absolute")
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((el) => [el, shown(el)])
      .filter(([, r]) => r);
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const [a, ra] = texts[i];
        const [b, rb] = texts[j];
        if (a.contains(b) || b.contains(a)) continue;
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > 3 && h > 3) issues.push(`налезают: ${name(a)} ↔ ${name(b)}`);
      }
    }
  }
  return [...new Set(issues)];
}

window.__ciphers = { errors, Puzzles, Tables, Inbox, setUser: (id) => setUser(users.find((u) => u.id === id)), demoPuzzle, audit };

/* ---------- сценарии для снимков ---------- */
const scene = params.get("scene");
const gm = users.find((u) => u.isGM);
const yura = users.find((u) => u.id === "u-yura");
if (scene) {
  window.__mock.wipe();
  const kindId = params.get("kind") ?? "grille";
  const p = await demoPuzzle(kindId);
  const kind = getKind(kindId);
  if (scene === "workshop") {
    setUser(gm);
    const { WorkshopApp } = await import("/scripts/foundry/apps/workshop.mjs");
    const app = WorkshopApp.open();
    await wait(300);
    for (const op of (params.get("ops") ?? "").split(",").filter(Boolean)) kind.preview.action?.(op, app.ui, app.draft);
    if (params.get("step")) app.ui.step = Number(params.get("step"));
    await app.render({ parts: ["live"] });
  } else if (scene === "player") {
    const only = params.get("parts");
    const parts = only ? Object.fromEntries(only.split(",").map((x) => [x, true])) : allParts(kind, p);
    await Inbox.give(yura, p, parts);
    // &state={…} — как игрок разложил вещи (например, пластина ровно на месте).
    if (params.get("state")) await yura.setFlag("ssl_ciphers", `state.${p.id}`, JSON.parse(params.get("state")));
    await wait(80);
    setUser(yura);
  } else if (scene === "table") {
    setUser(gm);
    await Tables.open(p, { users: null });
    await wait(80);
    setUser(users.find((u) => u.id === (params.get("as") ?? "u-yura")));
  } else if (scene === "export") {
    const { imagesOf, svgToImage } = await import("/scripts/foundry/export.mjs");
    const img = imagesOf(p).find((i) => i.id === params.get("image")) ?? imagesOf(p)[0];
    // &type=image/webp — как картинка ляжет в журнал.
    const blob = await svgToImage(img.svg(Number(params.get("px") ?? 900)), { type: params.get("type") ?? "image/png" });
    const el = document.createElement("img");
    el.src = URL.createObjectURL(blob);
    el.style.cssText = "position:fixed;left:0;top:0;z-index:5000;max-width:100vw;max-height:100vh;background:#555";
    document.body.append(el);
  }
  document.body.dataset.ready = "1";
} else {
  setUser(gm);
}
