/* Шифры мира, выдача игрокам и общие столы.
   Шифры вместе с ответами лежат в настройке мира — её пишет ведущий.
   Выданное игроку — копия без ответа во флагах его пользователя: пишет ведущий, читает игрок.
   Как игрок разложил свои вещи и что записал в заметках — флаги самого игрока.
   Общий стол — настройка мира: шифр без ответа, кто за столом и одно на всех состояние.
   Игроки меняют его через ведущего (transport.mjs), ведущий пишет. */

import { newSeed } from "../core/rng.mjs";
import { FLAGS, MODULE_ID, SETTINGS } from "./constants.mjs";
import { t } from "./i18n.mjs";
import { allParts, getKind } from "./kinds/index.mjs";

const clone = (v) => foundry.utils.deepClone(v);

export const Puzzles = {
  all() {
    return game.settings.get(MODULE_ID, SETTINGS.puzzles) ?? {};
  },

  get(id) {
    return this.all()[id] ?? null;
  },

  list() {
    return Object.values(this.all()).sort((a, b) => a.createdAt - b.createdAt);
  },

  async save(puzzle) {
    const all = clone(this.all());
    all[puzzle.id] = { ...clone(puzzle), updatedAt: Date.now() };
    await game.settings.set(MODULE_ID, SETTINGS.puzzles, all);
    return all[puzzle.id];
  },

  async remove(id) {
    const all = clone(this.all());
    delete all[id];
    await game.settings.set(MODULE_ID, SETTINGS.puzzles, all);
  },
};

/** Новый шифр вида kind с полями по умолчанию. */
export function blankPuzzle(kindId, data = {}) {
  const kind = getKind(kindId);
  const now = Date.now();
  return rebuild({
    id: foundry.utils.randomID(),
    kind: kind.id,
    title: t(`Kind.${kind.id}.untitled`),
    seed: newSeed(),
    createdAt: now,
    updatedAt: now,
    ...(kind.script ? { script: kind.script } : {}),
    ...kind.defaults(),
    ...data,
  });
}

/** Пересобрать шифр из полей и зерна. Не собралось — cipher: null и problem с причиной. */
export function rebuild(puzzle) {
  const res = getKind(puzzle.kind).build(puzzle);
  return { ...puzzle, cipher: res.cipher ?? null, problem: res.cipher ? null : (res.problem ?? { error: "unknown" }) };
}

/** То, что уходит игроку: без ответа и только по тем частям, что у него в руках. */
export function publicView(puzzle, parts) {
  if (!puzzle?.cipher) return null;
  return getKind(puzzle.kind).view(puzzle, parts);
}

/** Короткая подпись версии: изменилось то, что видит игрок, — изменилась и подпись. */
export function signature(view) {
  const s = JSON.stringify(view);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export const players = () => game.users.filter((u) => !u.isGM);

/**
 * Что у игроков на руках: inbox — puzzleId → { id, kind, title, view, sig, parts: { partId: true }, at, ping }.
 * Каждая запись лежит во флаге строкой JSON: так она заменяется целиком, и забранная часть не остаётся
 * в данных игрока (объекты флагов Foundry сливает, а не заменяет).
 */
export const Inbox = {
  of(user) {
    const raw = user?.getFlag(MODULE_ID, FLAGS.inbox) ?? {};
    const out = {};
    for (const [id, value] of Object.entries(raw)) {
      try {
        const entry = typeof value === "string" ? JSON.parse(value) : value;
        if (entry?.id) out[id] = entry;
      } catch {
        // испорченная запись — пропускаем
      }
    }
    return out;
  },

  entry(user, id) {
    return this.of(user)[id] ?? null;
  },

  /** Выдать или забрать части (parts: { partId: true | false } — что не названо, остаётся как было). show — открыть окно у игрока. */
  async give(user, puzzle, parts = {}, { show = true } = {}) {
    if (!puzzle?.cipher) return;
    const prev = this.entry(user, puzzle.id);
    const held = { ...(prev?.parts ?? {}) };
    for (const [part, on] of Object.entries(parts)) {
      if (on) held[part] = true;
      else delete held[part];
    }
    if (!Object.keys(held).length) return this.take(user, puzzle.id);
    const view = publicView(puzzle, held);
    const now = Date.now();
    const entry = { id: puzzle.id, kind: puzzle.kind, title: puzzle.title, view, sig: signature(view), parts: held, at: prev?.at ?? now, ping: show ? now : (prev?.ping ?? 0) };
    await user.setFlag(MODULE_ID, `${FLAGS.inbox}.${puzzle.id}`, JSON.stringify(entry));
  },

  async take(user, id) {
    if (this.entry(user, id)) await user.unsetFlag(MODULE_ID, `${FLAGS.inbox}.${id}`);
  },

  /** Обновить у игрока выданное до текущей версии, не открывая окна. */
  async refresh(user, puzzle) {
    const prev = this.entry(user, puzzle.id);
    if (prev) await this.give(user, puzzle, prev.parts, { show: false });
  },

  isStale(entry, puzzle) {
    const view = entry && publicView(puzzle, entry.parts);
    return Boolean(view && entry.sig !== signature(view));
  },
};

/** Как игрок разложил свои вещи: puzzleId → объект вида шифра (и notes). Пишется с задержкой. */
export const Desk = {
  timers: new Map(),
  pending: new Map(),

  get(id) {
    return { ...(game.user.getFlag(MODULE_ID, FLAGS.state)?.[id] ?? {}), ...(this.pending.get(id) ?? {}) };
  },

  set(id, patch) {
    this.pending.set(id, { ...(this.pending.get(id) ?? {}), ...patch });
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => this.flush(id), 600));
  },

  async flush(id) {
    const patch = this.pending.get(id);
    if (!patch) return;
    clearTimeout(this.timers.get(id));
    const next = { ...this.get(id), ...patch };
    this.pending.delete(id);
    await game.user.setFlag(MODULE_ID, `${FLAGS.state}.${id}`, next);
  },
};

/**
 * Общие столы: puzzleId → { id, kind, title, view, sig, parts, users: [userId] | null (все игроки), state, rev, by, ping }.
 * Пишет только ведущий; игрок просит его через transport.mjs.
 */
export const Tables = {
  all() {
    return game.settings.get(MODULE_ID, SETTINGS.tables) ?? {};
  },

  get(id) {
    return this.all()[id] ?? null;
  },

  list() {
    return Object.values(this.all());
  },

  /** Сидит ли пользователь за этим столом. Ведущий — всегда. */
  seats(table, user = game.user) {
    if (!table) return false;
    return user.isGM || table.users === null || table.users?.includes(user.id);
  },

  async write(mutate) {
    const all = clone(this.all());
    mutate(all);
    await game.settings.set(MODULE_ID, SETTINGS.tables, all);
  },

  /**
   * Ведущий: выложить шифр на стол (users — кто сидит, null — все игроки; parts — какие части лежат,
   * по умолчанию — как решит вид шифра или все). Положение вещей на столе сохраняется.
   */
  async open(puzzle, { users = null, parts = null } = {}) {
    if (!puzzle?.cipher) return;
    const kind = getKind(puzzle.kind);
    parts ??= kind.tableParts?.(puzzle) ?? allParts(kind, puzzle);
    const view = publicView(puzzle, parts);
    await this.write((all) => {
      const prev = all[puzzle.id];
      all[puzzle.id] = {
        id: puzzle.id,
        kind: puzzle.kind,
        title: puzzle.title,
        view,
        sig: signature(view),
        parts,
        users,
        state: prev?.state ?? {},
        rev: (prev?.rev ?? 0) + 1,
        by: game.user.id,
        ping: Date.now(),
      };
    });
  },

  /** Ведущий: обновить на столе вид шифра (после правок), не трогая положение вещей. */
  async refresh(puzzle) {
    const table = this.get(puzzle.id);
    if (table) await this.open(puzzle, { users: table.users, parts: table.parts });
  },

  /** Ведущий: положить на стол или убрать с него одну часть (обрывок ключа, пластину…). */
  async togglePart(puzzle, part) {
    const table = this.get(puzzle.id);
    if (!table || !puzzle?.cipher) return;
    const parts = { ...table.parts };
    if (parts[part]) delete parts[part];
    else parts[part] = true;
    const view = publicView(puzzle, parts);
    await this.write((all) => {
      Object.assign(all[puzzle.id], { parts, view, sig: signature(view), rev: (all[puzzle.id].rev ?? 0) + 1, by: game.user.id });
    });
  },

  async close(id) {
    if (this.get(id)) await this.write((all) => delete all[id]);
  },

  isStale(table, puzzle) {
    const view = table && publicView(puzzle, table.parts);
    return Boolean(view && table.sig !== signature(view));
  },

  /** Ведущий: принять изменение состояния от userId (поля сливаются: заметки, положение пластины, догадки…). */
  async apply(id, patch, userId) {
    const table = this.get(id);
    const user = game.users.get(userId);
    if (!table || !user || !this.seats(table, user)) return { ok: false, error: "notSeated" };
    await this.write((all) => {
      const t = all[id];
      t.state = { ...(t.state ?? {}), ...patch };
      t.rev = (t.rev ?? 0) + 1;
      t.by = userId;
    });
    return { ok: true };
  },
};
