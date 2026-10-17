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
window.__ciphers = { errors, Puzzles, Tables, Inbox, setUser: (id) => setUser(users.find((u) => u.id === id)), demoPuzzle };

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
