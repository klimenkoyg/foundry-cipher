/* Связь игрок → ведущий: изменения общего стола. Пишет стол только ведущий, игрок просит его запросом
   User#query; сервер Foundry доставляет запрос адресату. Изменения копятся и уходят пачкой. */

import { MODULE_ID, QUERY } from "./constants.mjs";
import { t } from "./i18n.mjs";
import { Tables } from "./store.mjs";

const TIMEOUT = 20000;

export function registerQueries() {
  CONFIG.queries[QUERY.table] = (data) => (game.user.isGM ? Tables.apply(data?.id, data?.patch ?? {}, data?.userId) : { ok: false });
}

const pending = new Map();
const timers = new Map();
let warned = false;

/** Изменить общий стол: у ведущего — сразу, у игрока — через активного ведущего, с задержкой и слиянием. */
export function updateTable(id, patch) {
  pending.set(id, { ...(pending.get(id) ?? {}), ...patch });
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => flushTable(id), 250));
}

export async function flushTable(id) {
  const patch = pending.get(id);
  if (!patch) return;
  pending.delete(id);
  clearTimeout(timers.get(id));
  const gm = game.users.activeGM;
  if (!gm) {
    if (!warned) ui.notifications.warn(t("Notify.noGM"));
    warned = true;
    return;
  }
  warned = false;
  try {
    const res = gm.isSelf ? await Tables.apply(id, patch, game.user.id) : await gm.query(QUERY.table, { id, patch, userId: game.user.id }, { timeout: TIMEOUT });
    if (!res?.ok) console.warn(`${MODULE_ID} | стол не принял изменение`, res);
  } catch (err) {
    console.warn(`${MODULE_ID} | ведущий не ответил`, err);
  }
}
