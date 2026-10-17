/* Тайный алфавит: шифр замены выдуманными знаками. Ничего из Foundry.
   Знаки рисуются процедурно от зерна (SVG-пути, без шрифтов): руны — ствол и ветви на решётке точек 3×4,
   знаки культа — дуги, круги и точки. Ключ (какой знак — какая буква) режется на обрывки. */

import { normalize } from "./alphabet.mjs";
import { mulberry32, randInt, shuffle } from "./rng.mjs";

export const STYLES = ["runes", "sigils"];
export const FRAGMENTS = { min: 1, max: 6, def: 3 };
/** Больше букв на лист не помещается так, чтобы знаки оставались крупными. */
export const MAX_LETTERS = 180;

/** Знак живёт в рамке 2 × 3 единицы: x от 0 до 2, y от 0 до 3. */
export const GLYPH_W = 2;
export const GLYPH_H = 3;

/** Буквы алфавита для знаков по порядку: «Ё» пишется как «Е», своего знака у неё нет. */
const ORDER = { ru: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ", en: "ABCDEFGHIJKLMNOPQRSTUVWXYZ" };
export const lettersOf = (alphabet) => ORDER[alphabet] ?? ORDER.ru;

const r2 = (v) => Math.round(v * 1000) / 1000;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

/** Случайный выбор по весам: items — [[значение, вес], …]. */
function weighted(rng, items) {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [v, w] of items) if ((x -= w) < 0) return v;
  return items.at(-1)[0];
}

/* ---------- руны ---------- */

/** Кусочки отрезка между соседними точками решётки на его линии — по ним видно, совпадают ли черты. dx — сдвиг по x. */
function pieces([x1, y1, x2, y2], dx = 0) {
  const g = gcd(x2 - x1, y2 - y1) || 1;
  const sx = (x2 - x1) / g;
  const sy = (y2 - y1) / g;
  const out = [];
  for (let i = 0; i < g; i++) {
    const a = [r2(x1 + sx * i + dx), y1 + sy * i];
    const b = [r2(x1 + sx * (i + 1) + dx), y1 + sy * (i + 1)];
    out.push(a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? `${a}/${b}` : `${b}/${a}`);
  }
  return out;
}

/** Точки решётки, через которые проходит отрезок (вместе с концами). */
function latticePoints([x1, y1, x2, y2]) {
  const g = gcd(x2 - x1, y2 - y1) || 1;
  return Array.from({ length: g + 1 }, (_, i) => `${x1 + ((x2 - x1) / g) * i},${y1 + ((y2 - y1) / g) * i}`);
}

/** Все возможные ветви на решётке 3×4 с весами: косые — чаще, плоские и ровные — реже. */
const BRANCHES = (() => {
  const out = [];
  for (let x1 = 0; x1 <= 2; x1++)
    for (let y1 = 0; y1 <= 3; y1++)
      for (let x2 = 0; x2 <= 2; x2++)
        for (let y2 = 0; y2 <= 3; y2++) {
          if (x1 > x2 || (x1 === x2 && y1 >= y2)) continue;
          const dx = Math.abs(x2 - x1);
          const dy = Math.abs(y2 - y1);
          if (dy > 2) continue;
          let w;
          if (dx === 1 && dy === 1) w = 3;
          else if (dx === 2 && dy === 2) w = 2;
          else if (dx === 1 && dy === 2) w = 1.4;
          else if (dx === 2 && dy === 1) w = 0.6;
          else if (dy === 0) w = 0.5;
          else if (dx === 0) w = 0.7;
          else continue;
          out.push({ seg: [x1, y1, x2, y2], w });
        }
  return out;
})();

/** Одна руна: ствол во всю высоту и 1–3 ветви, каждая касается уже нарисованного. */
function runeGlyph(rng) {
  const sx = weighted(rng, [[1, 0.5], [0, 0.35], [2, 0.15]]);
  const stem = [sx, 0, sx, 3];
  const segs = [stem];
  const used = new Set(pieces(stem));
  const points = new Set(latticePoints(stem));
  const want = weighted(rng, [[1, 0.28], [2, 0.47], [3, 0.25]]);
  for (let tries = 0; segs.length < want + 1 && tries < 60; tries++) {
    const cands = BRANCHES.filter(({ seg }) => {
      const [x1, y1, x2, y2] = seg;
      if (x1 === sx && x2 === sx) return false;
      if (pieces(seg).some((p) => used.has(p))) return false;
      const touches = points.has(`${x1},${y1}`) || points.has(`${x2},${y2}`) || (Math.min(x1, x2) < sx && sx < Math.max(x1, x2));
      return touches;
    });
    if (!cands.length) break;
    const seg = weighted(rng, cands.map((c) => [c.seg, c.w]));
    segs.push(seg);
    for (const p of pieces(seg)) used.add(p);
    for (const p of latticePoints(seg)) points.add(p);
  }
  // По ширине — посередине рамки: руны бывают узкие и широкие. Отпечаток — уже после сдвига:
  // руна у левого края и такая же у правого после сдвига совпадают.
  const xs = segs.flatMap(([x1, , x2]) => [x1, x2]);
  const shift = 1 - (Math.min(...xs) + Math.max(...xs)) / 2;
  const moved = segs.map(([x1, y1, x2, y2]) => [r2(x1 + shift), y1, r2(x2 + shift), y2]);
  const d = moved.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join("");
  const marks = new Set(segs.flatMap((seg) => pieces(seg, shift)));
  return { d, dots: [], marks: [...marks].sort(), stroke: "line" };
}

/** Насколько руны различаются: сколько кусочков черт есть у одной и нет у другой. */
const runeDistance = (a, b) => {
  const sa = new Set(a.marks);
  const sb = new Set(b.marks);
  let n = 0;
  for (const m of sa) if (!sb.has(m)) n++;
  for (const m of sb) if (!sa.has(m)) n++;
  return n;
};

/* ---------- знаки культа ---------- */

const CX = 1;
const CY = 1.55;
const R = 0.78;
const TOP_Y = r2(CY - R);
const LOW_Y = r2(CY + R);
const LEFT_X = r2(CX - R);
const RIGHT_X = r2(CX + R);

/** Основа знака: круг, полукруги, полумесяцы, «глаз», спираль. h — полувысота (для черты насквозь). */
const BODIES = {
  ring: { d: `M${RIGHT_X} ${CY}A${R} ${R} 0 1 1 ${LEFT_X} ${CY}A${R} ${R} 0 1 1 ${RIGHT_X} ${CY}`, h: R, w: 3 },
  cup: { d: `M${LEFT_X} ${CY}A${R} ${R} 0 0 0 ${RIGHT_X} ${CY}`, h: R, w: 2 },
  arch: { d: `M${LEFT_X} ${CY}A${R} ${R} 0 0 1 ${RIGHT_X} ${CY}`, h: R, w: 2 },
  openL: { d: `M${CX} ${TOP_Y}A${R} ${R} 0 0 1 ${CX} ${LOW_Y}`, h: R, w: 2, kin: "moonL" },
  openR: { d: `M${CX} ${TOP_Y}A${R} ${R} 0 0 0 ${CX} ${LOW_Y}`, h: R, w: 2, kin: "moonR" },
  moonL: { d: `M${CX} ${TOP_Y}A${R} ${R} 0 0 1 ${CX} ${LOW_Y}A1.05 1.05 0 0 0 ${CX} ${TOP_Y}`, h: R, w: 1.5, kin: "openL" },
  moonR: { d: `M${CX} ${TOP_Y}A${R} ${R} 0 0 0 ${CX} ${LOW_Y}A1.05 1.05 0 0 1 ${CX} ${TOP_Y}`, h: R, w: 1.5, kin: "openR" },
  eye: { d: `M0.12 ${CY}A1 1 0 0 1 1.88 ${CY}A1 1 0 0 1 0.12 ${CY}`, h: 0.45, w: 2 },
  spiral: { d: `M1 ${CY}A0.15 0.15 0 0 1 1.3 ${CY}A0.3 0.3 0 0 1 0.7 ${CY}A0.45 0.45 0 0 1 1.6 ${CY}A0.6 0.6 0 0 1 0.4 ${CY}`, h: 0.6, w: 1.2, noInside: true },
};

const dot = (x, y, r = 0.13) => ({ d: "", dots: [[x, y, r]] });
const circ = (x, y, r) => `M${r2(x + r)} ${y}A${r} ${r} 0 1 1 ${r2(x - r)} ${y}A${r} ${r} 0 1 1 ${r2(x + r)} ${y}`;

/** Метки сверху, снизу и внутри основы. */
const TOP = {
  dot: () => dot(1, 0.32),
  dots: () => ({ d: "", dots: [[0.62, 0.34, 0.11], [1.38, 0.34, 0.11]] }),
  ring: () => ({ d: circ(1, 0.38, 0.23), dots: [] }),
  horns: () => ({ d: "M0.55 0.1A0.45 0.45 0 0 0 1.45 0.1", dots: [] }),
  chevron: () => ({ d: "M0.58 0.58L1 0.14L1.42 0.58", dots: [] }),
  bar: () => ({ d: "M0.5 0.36H1.5", dots: [] }),
};
const BOTTOM = {
  dot: () => dot(1, 2.74),
  dots: () => ({ d: "", dots: [[0.62, 2.74, 0.11], [1.38, 2.74, 0.11]] }),
  ring: () => ({ d: circ(1, 2.7, 0.22), dots: [] }),
  tail: () => ({ d: `M1 ${LOW_Y}V2.98`, dots: [] }),
  cross: () => ({ d: `M1 ${LOW_Y}V2.98M0.66 2.68H1.34`, dots: [] }),
  hook: () => ({ d: "M0.6 2.52A0.4 0.4 0 0 0 1.4 2.52", dots: [] }),
};
const INSIDE = {
  dot: () => dot(CX, CY, 0.15),
  barH: () => ({ d: `M0 ${CY}H2`, dots: [] }),
  barV: (b) => ({ d: `M${CX} ${r2(CY - b.h)}V${r2(CY + b.h)}`, dots: [] }),
  slash: () => ({ d: `M0.42 2.13L1.58 0.97`, dots: [] }),
  ring: () => ({ d: circ(CX, CY, 0.32), dots: [] }),
};

/** Один знак культа: основа и одна-три метки. */
function sigilGlyph(rng) {
  const body = weighted(rng, Object.entries(BODIES).map(([k, b]) => [k, b.w]));
  const b = BODIES[body];
  const slots = { body, top: null, bottom: null, inside: null };
  const want = weighted(rng, [[1, 0.42], [2, 0.46], [3, 0.12]]);
  const free = shuffle(rng, b.noInside ? ["top", "bottom"] : ["top", "bottom", "inside"]);
  for (const slot of free.slice(0, want)) {
    const table = slot === "top" ? TOP : slot === "bottom" ? BOTTOM : INSIDE;
    const keys = Object.keys(table);
    slots[slot] = keys[randInt(rng, keys.length)];
  }
  let d = b.d;
  const dots = [];
  for (const [slot, table] of [["top", TOP], ["bottom", BOTTOM], ["inside", INSIDE]]) {
    if (!slots[slot]) continue;
    const m = table[slots[slot]](b);
    d += m.d;
    dots.push(...m.dots);
  }
  const marks = [`body:${body}`, `top:${slots.top}`, `bottom:${slots.bottom}`, `inside:${slots.inside}`];
  return { d, dots, marks, stroke: "curve", slots };
}

/** Насколько знаки различаются: другая основа — 2 (похожая — 1), каждая другая метка — 1. */
function sigilDistance(a, b) {
  let n = 0;
  if (a.slots.body !== b.slots.body) n += BODIES[a.slots.body].kin === b.slots.body ? 1 : 2;
  for (const s of ["top", "bottom", "inside"]) if (a.slots[s] !== b.slots[s]) n++;
  return n;
}

/* ---------- набор знаков ---------- */

/** Подпись-отпечаток знака: одинаковые подписи — одинаковые на вид знаки. */
export const glyphSig = (g) => g.marks.join("|");

/**
 * count разных знаков стиля style. Каждый новый знак отличается от прежних хотя бы на две черты
 * (если так не выходит — хотя бы на одну); подписи не повторяются никогда.
 */
export function makeGlyphs(count, style, rng) {
  const make = style === "sigils" ? sigilGlyph : runeGlyph;
  const dist = style === "sigils" ? sigilDistance : runeDistance;
  const out = [];
  const sigs = new Set();
  let tries = 0;
  while (out.length < count) {
    const g = make(rng);
    const sig = glyphSig(g);
    tries++;
    if (sigs.has(sig)) continue;
    const need = tries < 4000 ? 2 : 1;
    if (out.some((o) => dist(o, g) < need)) continue;
    sigs.add(sig);
    out.push(g);
  }
  return out.map(({ d, dots, marks, stroke }) => ({ d, dots, sig: marks.join("|"), stroke }));
}

/* ---------- фраза и ключ ---------- */

/**
 * Фраза → слова из букв одного алфавита. Алфавит — как в normalize (чьих букв больше), «Ё» — как «Е».
 * Апострофы слово не рвут; пробелы, дефисы и знаки препинания — рвут.
 */
export function parseWords(phrase) {
  const { alphabet, dropped } = normalize(phrase);
  const letters = lettersOf(alphabet);
  const words = [];
  let cur = "";
  for (let ch of String(phrase ?? "").toUpperCase()) {
    if (ch === "Ё") ch = "Е";
    if (letters.includes(ch)) cur += ch;
    else if (/[\p{L}\p{N}'’ʼ]/u.test(ch)) continue;
    else if (cur) {
      words.push(cur);
      cur = "";
    }
  }
  if (cur) words.push(cur);
  return { alphabet, words, text: words.join(""), dropped };
}

/** Разрезать ключ на n обрывков: настоящие буквы — по кругу, обманки — в самые короткие. */
export function splitKey(real, decoys, n, rng) {
  const out = Array.from({ length: n }, () => []);
  shuffle(rng, real).forEach((ch, i) => out[i % n].push(ch));
  for (const ch of shuffle(rng, decoys)) {
    const min = Math.min(...out.map((f) => f.length));
    const smallest = out.map((f, i) => (f.length === min ? i : -1)).filter((i) => i >= 0);
    out[smallest[randInt(rng, smallest.length)]].push(ch);
  }
  return shuffle(rng, out);
}

/**
 * Собрать шифр. Возвращает { ok: true, … } или { ok: false, error: "empty" | "tooLong", length, max }.
 * glyphs — gid → { d, dots, stroke }, letters — буква → gid (весь алфавит), message — слова как списки gid
 * (без пробелов — одно сплошное «слово»), fragments — буквы каждого обрывка по алфавиту, decoys — буквы-обманки.
 */
export function generate({ phrase, style = "runes", fragments = FRAGMENTS.def, spaces = true, seed = 1 } = {}) {
  const parsed = parseWords(phrase);
  const { alphabet, words, text, dropped } = parsed;
  if (!text) return { ok: false, error: "empty" };
  if (text.length > MAX_LETTERS) return { ok: false, error: "tooLong", length: text.length, max: MAX_LETTERS };
  const kind = STYLES.includes(style) ? style : "runes";
  const rng = mulberry32((seed >>> 0) ^ (kind === "sigils" ? 0x51617 : 0x2b1e5));
  const abc = [...lettersOf(alphabet)];

  // Знак для каждой буквы алфавита; имена знаков — в случайном порядке, чтобы по ним не угадать букву.
  const shapes = makeGlyphs(abc.length, kind, rng);
  const ids = shuffle(rng, abc.map((_, i) => `g${i + 1}`));
  const glyphs = {};
  const letters = {};
  abc.forEach((ch, i) => {
    glyphs[ids[i]] = { d: shapes[i].d, dots: shapes[i].dots, stroke: shapes[i].stroke };
    letters[ch] = ids[i];
  });

  const real = abc.filter((ch) => text.includes(ch));
  const spare = abc.filter((ch) => !text.includes(ch));
  const decoys = shuffle(rng, spare).slice(0, Math.min(spare.length, 2 + randInt(rng, 3)));
  const asked = fragments === null || fragments === "" ? NaN : Number(fragments);
  const wanted = Math.min(FRAGMENTS.max, Math.max(FRAGMENTS.min, Number.isFinite(asked) ? Math.round(asked) : FRAGMENTS.def));
  const n = Math.min(wanted, real.length);
  const order = (list) => [...list].sort((a, b) => abc.indexOf(a) - abc.indexOf(b));
  const parts = splitKey(real, decoys, n, rng).map(order);

  const encode = (w) => [...w].map((ch) => letters[ch]);
  const message = spaces ? words.map(encode) : [encode(text)];
  return {
    ok: true,
    alphabet,
    style: kind,
    spaces: Boolean(spaces),
    text,
    words,
    dropped,
    glyphs,
    letters,
    message,
    fragments: parts,
    decoys: order(decoys),
    wanted,
  };
}

/** Прочесть послание по ключу: gid → буква. Неизвестные знаки — «?». */
export function decode(message, key) {
  return message.map((w) => w.map((g) => key[g] ?? "?").join(""));
}

/** Обратный ключ: gid → буква. */
export const invert = (letters) => Object.fromEntries(Object.entries(letters).map(([ch, g]) => [g, ch]));

/** Сколько раз встречается каждый знак послания: [[gid, сколько]] — частые первыми, при равенстве — по первому появлению. */
export function frequency(message) {
  const count = new Map();
  for (const g of message.flat()) count.set(g, (count.get(g) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]);
}
