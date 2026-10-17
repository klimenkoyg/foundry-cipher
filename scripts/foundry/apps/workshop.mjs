/* Мастерская ведущего: список шифров, поля выбранного шифра, предпросмотр с ответом, ключ,
   выдача частей игрокам, общий стол и картинки. Что именно в полях и предпросмотре — решает вид
   шифра (kinds/<id>.mjs). Части окна: список, поля, «живая» часть (всё, что пересчитывается от полей).
   Поля при вводе не перерисовываются — фокус и курсор остаются. */

import { newSeed } from "../../core/rng.mjs";
import { FLAGS, MODULE_ID, SETTINGS, tpl } from "../constants.mjs";
import { downloadImage, imagesOf, saveToJournal } from "../export.mjs";
import { esc, has, t } from "../i18n.mjs";
import { allParts, getKind, listKinds } from "../kinds/index.mjs";
import { SCRIPT_IDS } from "../paper.mjs";
import { setSetting, setting } from "../settings.mjs";
import { blankPuzzle, Inbox, players, Puzzles, rebuild, Tables } from "../store.mjs";
import { ViewerApp } from "./viewer.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const APP_ID = "ssl-ciphers-workshop";
const clone = (v) => foundry.utils.deepClone(v);

/** Кнопка занята, пока идёт долгое дело (картинки рисуются секунду-другую). */
async function busy(button, work) {
  if (!button || button.disabled) return;
  const icon = button.querySelector("i");
  const was = icon?.className;
  button.disabled = true;
  if (icon) icon.className = "fa-solid fa-spinner fa-spin";
  try {
    return await work();
  } finally {
    button.disabled = false;
    if (icon) icon.className = was;
  }
}

/** Общее поле «Почерк» — у видов, где есть текст на реквизите (kind.script — почерк по умолчанию). */
const SCRIPT_FIELD = { name: "script", type: "select", common: true, options: SCRIPT_IDS };

/** Поля вида и общие поля мастерской: «Почерк» встаёт в последний ряд мелких полей, если он есть. */
export function fieldsOf(kind) {
  if (!kind.script) return kind.fields;
  const last = kind.fields.at(-1);
  if (last?.group) return [...kind.fields.slice(0, -1), { group: [...last.group, SCRIPT_FIELD] }];
  return [...kind.fields, { group: [SCRIPT_FIELD] }];
}

/** Поле мастерской для шаблона: подписи из Kind.<id>.field.<name>…, текущее значение, флаги типа. */
function fieldContext(kind, draft, f) {
  const key = f.common ? `Field.${f.name}` : `Kind.${kind.id}.field.${f.name}`;
  const value = f.name === "script" ? (draft.script ?? kind.script) : draft[f.name];
  return {
    ...f,
    id: `cp-${kind.id}-${f.name}`,
    label: t(key),
    placeholder: has(`${key}Hint`) ? t(`${key}Hint`) : f.auto ? t("Field.auto") : "",
    tip: has(`${key}Tip`) ? t(`${key}Tip`) : "",
    value: value ?? "",
    checked: Boolean(value),
    isText: f.type === "text",
    isTextarea: f.type === "textarea",
    isNumber: f.type === "number",
    isSelect: f.type === "select",
    isCheckbox: f.type === "checkbox",
    options: (f.options ?? []).map((v) => ({ value: v, label: f.name === "script" ? t(`Script.${v}`) : t(`${key}_${v}`), selected: value === v })),
  };
}

export class WorkshopApp extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.draft = null;
    this.ui = {};
    this.picking = false;
    this.saveTimer = null;
    this.liveTimer = null;
    this.hooks = [];
  }

  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["ssl-ciphers", "cp-workshop-app"],
    window: { icon: "fa-solid fa-key", resizable: true },
    position: { width: 1140, height: 840 },
    actions: {
      select: WorkshopApp.#onSelect,
      pick: WorkshopApp.#onPick,
      create: WorkshopApp.#onCreate,
      shuffle: WorkshopApp.#onShuffle,
      kind: WorkshopApp.#onKind,
      copyCode: WorkshopApp.#onCopyCode,
      whisperCode: WorkshopApp.#onWhisperCode,
      toggle: WorkshopApp.#onToggle,
      giveAll: WorkshopApp.#onGiveAll,
      ping: WorkshopApp.#onPing,
      refresh: WorkshopApp.#onRefresh,
      tryIt: WorkshopApp.#onTryIt,
      tableOpen: WorkshopApp.#onTableOpen,
      tableClose: WorkshopApp.#onTableClose,
      tableRefresh: WorkshopApp.#onTableRefresh,
      tableShow: WorkshopApp.#onTableShow,
      tablePart: WorkshopApp.#onTablePart,
      exportImage: WorkshopApp.#onExportImage,
      toJournal: WorkshopApp.#onToJournal,
      remove: WorkshopApp.#onRemove,
    },
  };

  static PARTS = {
    list: { template: tpl("workshop/list.hbs"), scrollable: [".cp-shelf__list"] },
    form: { template: tpl("workshop/form.hbs") },
    live: { template: tpl("workshop/live.hbs"), scrollable: [".cp-side"] },
  };

  static open() {
    const open = foundry.applications.instances.get(APP_ID);
    if (open) {
      open.bringToFront();
      return open;
    }
    const app = new WorkshopApp();
    app.render({ force: true });
    return app;
  }

  get title() {
    return t("Workshop.title");
  }

  get kind() {
    return getKind(this.draft?.kind);
  }

  /** Выбранный шифр: черновик, если он есть, иначе последний открытый или первый. */
  ensureDraft() {
    if (this.draft && Puzzles.get(this.draft.id)) return this.draft;
    const list = Puzzles.list();
    const last = setting(SETTINGS.lastPuzzle);
    const pick = list.find((p) => p.id === last) ?? list[0] ?? null;
    this.draft = pick ? clone(pick) : null;
    this.ui = {};
    return this.draft;
  }

  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    const refresh = () => this.render({ parts: ["list", "live"] });
    const inboxChanged = (user, changes) => {
      if (foundry.utils.hasProperty(changes ?? {}, `flags.${MODULE_ID}.${FLAGS.inbox}`)) refresh();
    };
    this.hooks.push(["updateUser", Hooks.on("updateUser", inboxChanged)]);
    this.hooks.push(["userConnected", Hooks.on("userConnected", refresh)]);
    this.hooks.push([`${MODULE_ID}.puzzles`, Hooks.on(`${MODULE_ID}.puzzles`, refresh)]);
    this.hooks.push([`${MODULE_ID}.tables`, Hooks.on(`${MODULE_ID}.tables`, refresh)]);
  }

  _onClose(options) {
    super._onClose(options);
    for (const [name, id] of this.hooks) Hooks.off(name, id);
    this.hooks = [];
    this.flushSave();
  }

  async _prepareContext() {
    return { puzzle: this.ensureDraft() };
  }

  async _preparePartContext(partId, context) {
    const draft = context.puzzle;
    if (partId === "list") return { ...context, ...this.listContext(draft) };
    if (partId === "form") return { ...context, ...this.formContext(draft) };
    if (partId === "live") return { ...context, ...this.liveContext(draft) };
    return context;
  }

  listContext(draft) {
    const people = players();
    return {
      picking: this.picking,
      kinds: listKinds()
        .filter((k) => k.ready !== false)
        .map((k) => ({ id: k.id, icon: k.icon, name: t(`Kind.${k.id}.name`), desc: t(`Kind.${k.id}.desc`) })),
      puzzles: Puzzles.list().map((stored) => {
        const p = draft?.id === stored.id ? draft : stored;
        const kind = getKind(p.kind);
        return {
          id: p.id,
          icon: kind.icon,
          title: p.title || t("Puzzle.untitled"),
          meta: p.cipher ? kind.meta(p) : t("Shelf.unfinished"),
          holders: people.filter((u) => Inbox.entry(u, p.id)).length,
          onTable: Boolean(Tables.get(p.id)),
          selected: p.id === draft?.id,
        };
      }),
    };
  }

  formContext(draft) {
    if (!draft) return {};
    // Вид — того же черновика, что пришёл в отрисовку: пока она шла, могли выбрать другой шифр.
    const kind = getKind(draft.kind);
    return {
      kindName: t(`Kind.${kind.id}.name`),
      kindIcon: kind.icon,
      fields: fieldsOf(kind).map((f) => (f.group ? { group: f.group.map((g) => fieldContext(kind, draft, g)) } : fieldContext(kind, draft, f))),
    };
  }

  liveContext(draft) {
    if (!draft) return {};
    const kind = getKind(draft.kind);
    const ctx = {
      status: draft.problem ? kind.problemText(draft.problem) : kind.status(draft),
      problem: Boolean(draft.problem),
      cipher: draft.cipher,
    };
    if (!draft.cipher) return ctx;

    ctx.preview = kind.preview.render(draft, this.ui);
    const code = kind.code(draft);
    ctx.code = code.line ?? "";
    ctx.notes = code.notes ?? [];
    ctx.reads = code.reads ?? "";
    // «Перемешать» имеет смысл, только если в шифре есть случайность: вид может решить это по самому шифру.
    ctx.shuffle = typeof kind.shuffle === "function" ? kind.shuffle(draft) : kind.shuffle !== false;

    const parts = kind.parts(draft).map((p) => ({ ...p, label: t(`Kind.${kind.id}.part.${p.id}`) }));
    ctx.people = players().map((u) => {
      const entry = Inbox.entry(u, draft.id);
      return {
        id: u.id,
        name: u.character ? `${u.name} · ${u.character.name}` : u.name,
        color: u.color?.css ?? String(u.color ?? "#999"),
        active: u.active,
        parts: parts.map((p) => ({ ...p, held: Boolean(entry?.parts?.[p.id]) })),
        has: Boolean(entry),
        stale: Inbox.isStale(entry, draft),
      };
    });
    ctx.noPlayers = ctx.people.length === 0;

    const table = Tables.get(draft.id);
    if (table) {
      const names = table.users === null ? t("Table.everyone") : table.users.map((id) => game.users.get(id)?.name).filter(Boolean).join(", ");
      ctx.table = { who: names, stale: Tables.isStale(table, draft), parts: parts.map((p) => ({ ...p, held: Boolean(table.parts?.[p.id]) })) };
    }
    ctx.images = imagesOf(draft).map(({ id, label }) => ({ id, label }));
    return ctx;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const parts = options.parts ?? Object.keys(this.constructor.PARTS);
    const root = this.element;
    if (parts.includes("form")) {
      const form = root.querySelector(".cp-form");
      form?.addEventListener("input", (event) => this.onField(event));
      form?.addEventListener("change", (event) => this.onField(event, true));
      form?.addEventListener("submit", (event) => event.preventDefault());
    }
    if (parts.includes("live") && this.draft?.cipher) {
      const live = root.querySelector(".cp-live");
      if (live) this.kind.preview.after?.(live, this.ui, this.draft);
    }
  }

  /** Ввод в поле: черновик меняется сразу, шифр пересобирается, сохранение — чуть позже. */
  onField(event, committed = false) {
    const el = event.target;
    if (!this.draft || !el?.name) return;
    const kind = this.kind;
    const spec = fieldsOf(kind).flatMap((f) => f.group ?? [f]).find((f) => f.name === el.name);
    let value = el.type === "checkbox" ? el.checked : el.value;
    if (spec?.type === "number") {
      // Пусто — «авто», если поле это умеет; число — в границах.
      if (String(value).trim() === "") value = spec.auto ? null : (spec.min ?? 0);
      else {
        value = Math.round(Number(value));
        const lo = spec.min ?? -Infinity;
        const hi = spec.max ?? Infinity;
        if (!Number.isFinite(value) || value < lo || value > hi) {
          if (!committed) return;
          value = Number.isFinite(value) ? Math.min(hi, Math.max(lo, value)) : spec.auto ? null : lo;
          el.value = value ?? "";
        }
      }
    }
    if (this.draft[el.name] === value) return;
    this.draft[el.name] = value;
    if (el.name !== "title") this.draft = rebuild(this.draft);
    this.queueSave();
    clearTimeout(this.liveTimer);
    const typing = el.tagName === "TEXTAREA" || el.type === "text";
    this.liveTimer = setTimeout(() => this.render({ parts: el.name === "title" ? ["list", "live"] : ["live"] }), typing ? 140 : 0);
  }

  queueSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 500);
  }

  async flushSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.draft && Puzzles.get(this.draft.id)) await Puzzles.save(this.draft);
  }

  async select(id) {
    await this.flushSave();
    const p = Puzzles.get(id);
    if (!p) return;
    this.draft = clone(p);
    this.ui = {};
    this.picking = false;
    setSetting(SETTINGS.lastPuzzle, id);
    await this.render();
  }

  userFrom(target) {
    return game.users.get(target.closest("[data-user]")?.dataset.user) ?? null;
  }

  static async #onSelect(event, target) {
    await this.select(target.dataset.id);
  }

  static #onPick() {
    this.picking = !this.picking;
    this.render({ parts: ["list"] });
  }

  static async #onCreate(event, target) {
    await this.flushSave();
    const p = blankPuzzle(target.dataset.kind ?? "grille");
    await Puzzles.save(p);
    await this.select(p.id);
    this.element.querySelector(".cp-form textarea, .cp-form input:not([name='title'])")?.focus();
  }

  static #onShuffle() {
    if (!this.draft) return;
    this.draft = rebuild({ ...this.draft, seed: newSeed() });
    this.queueSave();
    this.render({ parts: ["live"] });
  }

  static #onKind(event, target) {
    if (!this.draft?.cipher) return;
    this.kind.preview.action?.(target.dataset.op, this.ui, this.draft, target);
    this.render({ parts: ["live"] });
  }

  /** Ключ для ведущего — одинаковый для «Копировать» и «Себе в чат»: название, код, пояснения, что читается. */
  keyOf() {
    const code = this.kind.code(this.draft);
    return {
      title: this.draft.title || t("Puzzle.untitled"),
      lines: [code.line, ...(code.notes ?? [])].filter(Boolean),
      reads: code.reads ?? "",
    };
  }

  static async #onCopyCode() {
    if (!this.draft?.cipher) return;
    const key = this.keyOf();
    const text = [key.title, ...key.lines, key.reads && `${t("Code.reads")} ${key.reads}`].filter(Boolean).join("\n");
    try {
      if (game.clipboard?.copyPlainText) await game.clipboard.copyPlainText(text);
      else await navigator.clipboard.writeText(text);
      ui.notifications.info(t("Notify.copied"));
    } catch {
      ui.notifications.warn(t("Notify.copyFailed"));
    }
  }

  static async #onWhisperCode() {
    if (!this.draft?.cipher) return;
    const key = this.keyOf();
    const lines = key.lines.map((l) => `<p>${esc(l)}</p>`).join("");
    const reads = key.reads ? `<p>${esc(t("Code.reads"))} <strong>${esc(key.reads)}</strong></p>` : "";
    const Message = (foundry.documents?.ChatMessage ?? globalThis.ChatMessage).implementation;
    await Message.create({
      speaker: { alias: t("Title") },
      whisper: [game.user.id],
      content: `<p><strong>${esc(key.title)}</strong></p>${lines}${reads}`,
    });
  }

  static async #onToggle(event, target) {
    const user = this.userFrom(target);
    const part = target.dataset.part;
    if (!user || !this.draft?.cipher || !part) return;
    await this.flushSave();
    const had = Boolean(Inbox.entry(user, this.draft.id)?.parts?.[part]);
    await Inbox.give(user, this.draft, { [part]: !had }, { show: !had });
  }

  static async #onGiveAll() {
    if (!this.draft?.cipher) return;
    await this.flushSave();
    const parts = Object.fromEntries(this.kind.parts(this.draft).map((p) => [p.id, true]));
    for (const user of players()) await Inbox.give(user, this.draft, parts);
    ui.notifications.info(t("Notify.givenAll", { title: this.draft.title }));
  }

  static async #onPing(event, target) {
    const user = this.userFrom(target);
    if (user && this.draft) await Inbox.give(user, this.draft, {}, { show: true });
  }

  static async #onRefresh(event, target) {
    const user = this.userFrom(target);
    if (user && this.draft) await Inbox.refresh(user, this.draft);
  }

  static async #onTryIt() {
    if (!this.draft?.cipher) return;
    await this.flushSave();
    ViewerApp.open(this.draft.id, { asGM: true });
  }

  /** Выложить на общий стол: что положить (все части или некоторые) и кого посадить. */
  static async #onTableOpen() {
    if (!this.draft?.cipher) return;
    await this.flushSave();
    const kind = getKind(this.draft.kind);
    const parts = kind.parts(this.draft);
    // Сразу отмечено то, что вид кладёт на стол сам (у тайного алфавита — только послание).
    const preset = kind.tableParts?.(this.draft) ?? allParts(kind, this.draft);
    const people = players();
    let picked = { parts: Object.keys(preset), users: null };

    if (parts.length > 1 || people.length > 1) {
      const row = (name, value, label, icon, on) =>
        `<label class="cp-pick__row"><input type="checkbox" name="${name}" value="${esc(value)}"${on ? " checked" : ""}>` +
        `${icon ? `<i class="${icon}" inert></i>` : ""}<span>${esc(label)}</span></label>`;
      const sections = [];
      if (parts.length > 1) {
        const rows = parts.map((p) => row("part", p.id, t(`Kind.${kind.id}.part.${p.id}`), p.icon, preset[p.id])).join("");
        sections.push(`<p class="cp-pick__cap">${esc(t("Table.pickParts"))}</p><div class="cp-pick">${rows}</div><p class="cp-pick__hint">${esc(t("Table.pickPartsHint"))}</p>`);
      }
      if (people.length > 1) {
        const rows = people.map((u) => row("u", u.id, u.character ? `${u.name} · ${u.character.name}` : u.name, null, true)).join("");
        sections.push(`<p class="cp-pick__cap">${esc(t("Table.pickUsers"))}</p><div class="cp-pick">${rows}</div>`);
      }
      const checked = (form, name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
      const answer = await DialogV2.wait({
        window: { title: t("Table.pickTitle") },
        content: sections.join(""),
        buttons: [
          {
            action: "ok",
            label: t("Table.open"),
            default: true,
            callback: (ev, button) => ({ parts: checked(button.form, "part"), users: checked(button.form, "u") }),
          },
          { action: "cancel", label: t("Common.cancel") },
        ],
        rejectClose: false,
      });
      if (!answer || typeof answer !== "object") return;
      if (parts.length > 1) picked.parts = answer.parts;
      if (people.length > 1) picked.users = answer.users.length === people.length ? null : answer.users;
      if (!picked.parts.length) return ui.notifications.warn(t("Table.noParts"));
      if (picked.users?.length === 0) return ui.notifications.warn(t("Table.noUsers"));
    }

    await Tables.open(this.draft, { users: picked.users, parts: Object.fromEntries(picked.parts.map((id) => [id, true])) });
    ViewerApp.open(this.draft.id, { shared: true });
  }

  static async #onTableClose() {
    if (!this.draft) return;
    ViewerApp.get(this.draft.id, { shared: true })?.close();
    await Tables.close(this.draft.id);
  }

  static async #onTableRefresh() {
    if (!this.draft?.cipher) return;
    await this.flushSave();
    await Tables.refresh(this.draft);
  }

  static async #onTablePart(event, target) {
    if (!this.draft?.cipher || !target.dataset.part) return;
    await this.flushSave();
    await Tables.togglePart(this.draft, target.dataset.part);
  }

  static #onTableShow() {
    if (this.draft && Tables.get(this.draft.id)) ViewerApp.open(this.draft.id, { shared: true });
  }

  static async #onExportImage(event, target) {
    if (this.draft?.cipher) await busy(target, () => downloadImage(this.draft, target.dataset.image));
  }

  static async #onToJournal(event, target) {
    if (!this.draft?.cipher) return;
    await this.flushSave();
    const draft = clone(this.draft);
    await busy(target, async () => {
      try {
        await saveToJournal(draft);
        ui.notifications.info(t("Notify.journal", { title: draft.title }));
      } catch (err) {
        console.error(err);
        ui.notifications.error(t("Notify.journalFailed"));
      }
    });
  }

  static async #onRemove() {
    const draft = this.draft;
    if (!draft) return;
    const ok = await DialogV2.confirm({
      window: { title: t("Remove.title") },
      content: `<p>${esc(t("Remove.text", { title: draft.title }))}</p>`,
    });
    if (!ok) return;
    clearTimeout(this.saveTimer);
    for (const user of players()) await Inbox.take(user, draft.id);
    ViewerApp.get(draft.id)?.close();
    ViewerApp.get(draft.id, { shared: true })?.close();
    await Tables.close(draft.id);
    this.draft = null;
    await Puzzles.remove(draft.id);
    this.render();
  }
}
