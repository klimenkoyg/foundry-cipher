/* Что у игрока на руках: выданные ему шифры и общие столы, за которыми он сидит. */

import { tpl } from "../constants.mjs";
import { t } from "../i18n.mjs";
import { getKind } from "../kinds/index.mjs";
import { Inbox, Tables } from "../store.mjs";
import { ViewerApp } from "./viewer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const APP_ID = "ssl-ciphers-inbox";

/** Всё, что можно открыть: [{ id, shared, title, kind, parts, at }]. */
export function holdings() {
  const own = Object.values(Inbox.of(game.user)).map((e) => ({ ...e, shared: false }));
  const tables = Tables.list()
    .filter((tb) => Tables.seats(tb))
    .map((tb) => ({ ...tb, shared: true, at: tb.ping }));
  return [...tables, ...own].sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
}

export class InboxApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["ssl-ciphers", "cp-inbox-app"],
    window: { icon: "fa-solid fa-key" },
    position: { width: 380, height: "auto" },
    actions: { open: InboxApp.#onOpen },
  };

  static PARTS = { body: { template: tpl("inbox.hbs") } };

  static get() {
    return foundry.applications.instances.get(APP_ID) ?? null;
  }

  /** Одна вещь — сразу её окно, несколько — список. */
  static open() {
    const items = holdings();
    if (items.length === 1) return ViewerApp.open(items[0].id, { shared: items[0].shared });
    const open = InboxApp.get();
    if (open) {
      open.render();
      open.bringToFront();
      return open;
    }
    const app = new InboxApp();
    app.render({ force: true });
    return app;
  }

  get title() {
    return t("Inbox.title");
  }

  async _prepareContext() {
    return {
      items: holdings().map((e) => {
        const kind = getKind(e.kind);
        const parts = Object.keys(e.parts ?? {}).map((p) => t(`Kind.${kind.id}.part.${p}`));
        return {
          id: e.id,
          shared: e.shared,
          title: e.title || t("Puzzle.untitled"),
          sub: e.shared ? t("Inbox.table") : parts.join(", "),
          icon: e.shared ? "fa-solid fa-people-group" : kind.icon,
        };
      }),
    };
  }

  static #onOpen(event, target) {
    ViewerApp.open(target.dataset.id, { shared: target.dataset.shared === "true" });
  }
}
