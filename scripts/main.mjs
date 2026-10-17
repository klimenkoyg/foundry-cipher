/* Тайнопись · Ciphers & Puzzles — шифры и головоломки для Foundry VTT. */

import { InboxApp, holdings } from "./foundry/apps/inbox.mjs";
import { refreshTables, ViewerApp } from "./foundry/apps/viewer.mjs";
import { WorkshopApp } from "./foundry/apps/workshop.mjs";
import { FLAGS, MODULE_ID, tpl } from "./foundry/constants.mjs";
import { t } from "./foundry/i18n.mjs";
import { getKind, listKinds } from "./foundry/kinds/index.mjs";
import { registerSettings } from "./foundry/settings.mjs";
import { Inbox, Puzzles, Tables } from "./foundry/store.mjs";
import { registerQueries } from "./foundry/transport.mjs";

/** Что этот клиент уже открывал: «v:id» — выданное, «t:id» — общий стол; значение — ping. Хранится в браузере. */
const SEEN_KEY = `${MODULE_ID}.seen`;
function seen() {
  try {
    return JSON.parse(localStorage.getItem(`${SEEN_KEY}.${game.user.id}`) ?? "{}");
  } catch {
    return {};
  }
}
function markSeen(map) {
  try {
    localStorage.setItem(`${SEEN_KEY}.${game.user.id}`, JSON.stringify(map));
  } catch {
    // приватный режим — окна просто откроются ещё раз
  }
}

/**
 * Ведущий что-то выдал, выложил на стол, показал заново или забрал — открыть, обновить или закрыть окна.
 * maxAge — после входа в мир открываем только недавнее: старое лежит в списке.
 */
function sync({ announce = true, maxAge = 0, inbox: own = true, tables = true } = {}) {
  if (game.user.isGM) return;
  const was = seen();
  const next = { ...was };
  const fresh = (ping) => !maxAge || Date.now() - (ping ?? 0) < maxAge;
  const inbox = Inbox.of(game.user);
  for (const entry of own ? Object.values(inbox) : []) {
    const key = `v:${entry.id}`;
    next[key] = Math.max(entry.ping ?? 0, was[key] ?? 0);
    if ((entry.ping ?? 0) > (was[key] ?? 0) && fresh(entry.ping)) {
      if (announce) ui.notifications.info(t("Notify.received", { title: entry.title || t("Puzzle.untitled") }));
      ViewerApp.open(entry.id);
    } else ViewerApp.get(entry.id)?.render();
  }
  for (const table of tables ? Tables.list() : []) {
    if (!Tables.seats(table)) continue;
    const key = `t:${table.id}`;
    next[key] = Math.max(table.ping ?? 0, was[key] ?? 0);
    if ((table.ping ?? 0) > (was[key] ?? 0) && fresh(table.ping)) {
      if (announce) ui.notifications.info(t("Notify.table", { title: table.title || t("Puzzle.untitled") }));
      ViewerApp.open(table.id, { shared: true });
    }
  }
  for (const app of own ? foundry.applications.instances.values() : []) {
    if (app instanceof ViewerApp && !app.asGM && !app.shared && !inbox[app.puzzleId]) {
      ui.notifications.info(t("Notify.taken", { title: app.title }));
      app.close();
    }
  }
  markSeen(next);
  InboxApp.get()?.render();
}

function openPanel() {
  if (game.user.isGM) return WorkshopApp.open();
  if (!holdings().length) return ui.notifications.info(t("Notify.nothing"));
  return InboxApp.open();
}

Hooks.once("init", () => {
  registerSettings({
    onPuzzles: () => Hooks.callAll(`${MODULE_ID}.puzzles`),
    onTables: () => Hooks.callAll(`${MODULE_ID}.tables`),
  });
  registerQueries();
  Handlebars.registerHelper("cpT", (key, options) => t(key, options.hash));
  foundry.applications.handlebars.loadTemplates({ "ssl-ciphers.field": tpl("workshop/field.hbs") });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    /** Мастерская ведущего. */
    openWorkshop: () => (game.user.isGM ? WorkshopApp.open() : ui.notifications.warn(t("Notify.gmOnly"))),
    /** Окно шифра: у игрока — выданное ему, у ведущего — как его увидят игроки. */
    open: (puzzleId) => ViewerApp.open(puzzleId, { asGM: game.user.isGM }),
    /** Окно общего стола. */
    openTable: (puzzleId) => ViewerApp.open(puzzleId, { shared: true }),
    /** Виды шифров. */
    kinds: () => listKinds().filter((k) => k.ready !== false).map((k) => k.id),
    /** Шифры мира (только у ведущего — с ответами). */
    puzzles: () => (game.user.isGM ? Puzzles.list() : []),
    /** Ключ шифра для ведущего: { line, notes, reads }. */
    code: (puzzleId) => {
      const p = game.user.isGM ? Puzzles.get(puzzleId) : null;
      return p?.cipher ? getKind(p.kind).code(p) : null;
    },
  };
  sync({ announce: true, maxAge: 12 * 3600 * 1000 });
});

Hooks.on("updateUser", (user, changes) => {
  if (!user.isSelf) return;
  if (foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}.${FLAGS.inbox}`)) sync({ tables: false });
});

Hooks.on(`${MODULE_ID}.tables`, () => {
  refreshTables();
  sync({ inbox: false });
});

Hooks.on("getSceneControlButtons", (controls) => {
  const tool = {
    name: "sslCiphers",
    title: "CIPHERS.Controls.title",
    icon: "fa-solid fa-key",
    button: true,
    visible: true,
  };
  if (Array.isArray(controls)) {
    controls.find((c) => c.name === "token")?.tools.push({ ...tool, onClick: openPanel });
    return;
  }
  const tokens = controls.tokens;
  if (!tokens?.tools) return;
  tokens.tools.sslCiphers = { ...tool, order: Object.keys(tokens.tools).length, onChange: openPanel };
});
