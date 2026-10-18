/* Окно шифра. Три случая:
   - у игрока — то, что выдал ему ведущий; вещи лежат так, как он их оставил (флаги игрока);
   - общий стол — один шифр на всех, состояние общее (настройка мира, меняется через ведущего);
   - у ведущего — «Проверить как игрок»: всё сразу, как свои вещи.
   Само содержимое рисует вид шифра (kinds/<id>.mjs), окно даёт рамку, заметки и сохранение. */

import { tpl } from "../constants.mjs";
import { t } from "../i18n.mjs";
import { allParts, getKind } from "../kinds/index.mjs";
import { Desk, Inbox, publicView, Puzzles, Tables } from "../store.mjs";
import { flushTable, updateTable } from "../transport.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const appId = (puzzleId, shared) => `ssl-ciphers-${shared ? "table" : "view"}-${puzzleId}`;

export class ViewerApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super({ id: appId(options.puzzleId, options.shared), ...options });
    this.puzzleId = options.puzzleId;
    this.asGM = Boolean(options.asGM);
    this.shared = Boolean(options.shared);
    this.api = null;
    this.rev = null;
  }

  static DEFAULT_OPTIONS = {
    classes: ["ssl-ciphers", "cp-viewer-app"],
    window: { icon: "fa-solid fa-key", resizable: true },
    position: { width: 900, height: 720 },
    actions: {
      kind: ViewerApp.#onKind,
    },
  };

  static PARTS = { body: { template: tpl("viewer.hbs") } };

  static get(puzzleId, { shared = false } = {}) {
    return foundry.applications.instances.get(appId(puzzleId, shared)) ?? null;
  }

  static open(puzzleId, { asGM = false, shared = false } = {}) {
    const open = ViewerApp.get(puzzleId, { shared });
    if (open) {
      open.render({ force: true });
      open.bringToFront();
      return open;
    }
    const kind = getKind(ViewerApp.entryFor(puzzleId, { asGM, shared })?.kind);
    const app = new ViewerApp({ puzzleId, asGM, shared, position: { ...kind.player.size } });
    app.render({ force: true });
    return app;
  }

  /** Что лежит перед пользователем: { kind, title, view, parts } или null. */
  static entryFor(puzzleId, { asGM, shared }) {
    if (shared) {
      const table = Tables.get(puzzleId);
      return table && Tables.seats(table) ? table : null;
    }
    if (asGM) {
      const puzzle = Puzzles.get(puzzleId);
      if (!puzzle?.cipher) return null;
      const parts = allParts(getKind(puzzle.kind), puzzle);
      return { id: puzzle.id, kind: puzzle.kind, title: puzzle.title, view: publicView(puzzle, parts), parts };
    }
    return Inbox.entry(game.user, puzzleId);
  }

  get entry() {
    return ViewerApp.entryFor(this.puzzleId, this);
  }

  get title() {
    const title = this.entry?.title || t("Puzzle.untitled");
    return this.shared ? t("View.tableTitle", { title }) : title;
  }

  /** Состояние вещей: общий стол — из настройки мира, иначе — флаги этого пользователя. */
  get state() {
    if (this.shared) return { ...(Tables.get(this.puzzleId)?.state ?? {}) };
    return Desk.get(this.puzzleId);
  }

  save(patch) {
    if (this.shared) updateTable(this.puzzleId, patch);
    else Desk.set(this.puzzleId, patch);
  }

  async _prepareContext() {
    const e = this.entry;
    if (!e) return { missing: true };
    const kind = getKind(e.kind);
    const state = this.state;
    this.rev = Tables.get(this.puzzleId)?.rev ?? null;
    return {
      kindId: kind.id,
      body: kind.player.render(e.view, e.parts, state, { shared: this.shared }),
      notes: state.notes ?? "",
      shared: this.shared,
      notesLabel: t(this.shared ? "View.notesShared" : "View.notes"),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const e = this.entry;
    if (!e) return;
    const kind = getKind(e.kind);
    const body = this.element.querySelector(".cp-view__body");
    this.api = kind.player.bind?.(body, e.view, e.parts, this.state, (patch) => this.save(patch), { shared: this.shared }) ?? null;
    this.element.querySelector('textarea[name="notes"]')?.addEventListener("input", (event) => this.save({ notes: event.target.value }));
  }

  /** Общий стол изменился. Своё же изменение не трогаем; чужое — принимаем без перерисовки, если вид шифра умеет. */
  syncTable() {
    const table = Tables.get(this.puzzleId);
    if (!table || !Tables.seats(table)) return this.close();
    if (table.rev === this.rev) return;
    const replaced = this.sig !== undefined && this.sig !== table.sig;
    this.rev = table.rev;
    this.sig = table.sig;
    if (table.by === game.user.id && !replaced) return;
    if (this.api?.apply && !replaced) {
      this.api.apply(table.state ?? {});
      const notes = this.element?.querySelector('textarea[name="notes"]');
      if (notes && document.activeElement !== notes) notes.value = table.state?.notes ?? "";
    } else this.render();
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.sig = Tables.get(this.puzzleId)?.sig;
  }

  _onClose(options) {
    super._onClose(options);
    if (this.shared) flushTable(this.puzzleId);
    else Desk.flush(this.puzzleId);
  }

  static #onKind(event, target) {
    this.api?.action?.(target.dataset.op, target);
  }
}

/** Общие столы изменились — открытые окна столов принимают новое состояние. */
export function refreshTables() {
  for (const app of foundry.applications.instances.values()) if (app instanceof ViewerApp && app.shared) app.syncTable();
}
