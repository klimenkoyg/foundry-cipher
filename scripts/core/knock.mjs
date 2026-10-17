/* Перестук: квадрат Полибия звуком. Из соседней камеры стучат в стену: серия ударов — номер ряда,
   пауза, вторая серия — место в ряду; пауза длиннее — следующая буква, ещё длиннее — следующее слово.
   Русская таблица — «азбука декабристов», 5 рядов по 6 (Ё → Е, Й → И, Ъ → Ь);
   английская — tap code 5×5 (K → C). Алфавит — по фразе. Ничего из Foundry — работает и в Node. */

import { ALPHABETS, normalize } from "./alphabet.mjs";
import { mulberry32 } from "./rng.mjs";

/** Таблицы: ряды букв и буквы, которых в таблице нет (их стучат как соседку). */
export const TABLES = {
  ru: { rows: ["АБВГДЕ", "ЖЗИКЛМ", "НОПРСТ", "УФХЦЧШ", "ЩЫЬЭЮЯ"], swaps: { Ё: "Е", Й: "И", Ъ: "Ь" } },
  en: { rows: ["ABCDE", "FGHIJ", "LMNOP", "QRSTU", "VWXYZ"], swaps: { K: "C" } },
};

/** Длиннее стучать никто не выдержит: сотня с лишним букв — это минуты стука. */
export const MAX_LETTERS = 160;

/** Темп, мс: удар от удара в серии, между сериями, между буквами, между словами. */
export const SPEEDS = {
  slow: { beat: 520, group: 1300, letter: 2300, word: 4600 },
  normal: { beat: 370, group: 950, letter: 1700, word: 3400 },
  fast: { beat: 250, group: 650, letter: 1150, word: 2300 },
};

/** Рука не метроном: каждый промежуток чуть дрожит (доля от длины). */
export const JITTER = 0.06;

/** Тишина после последнего удара, мс. */
const TAIL = 700;

/** Знаки, которыми можно записать удар. */
const DOT_CHARS = "·.•*∙●";

export const tableOf = (alphabet) => TABLES[alphabet] ?? TABLES.ru;

/** Буква по ряду и месту (с единицы). */
export const letterAt = (alphabet, row, place) => tableOf(alphabet).rows[row - 1]?.[place - 1] ?? "?";

/** Ряд и место буквы (с единицы) или null; буквы-замены — как их соседки. */
export function placeOf(alphabet, ch) {
  const tab = tableOf(alphabet);
  const c = tab.swaps[ch] ?? ch;
  for (let r = 0; r < tab.rows.length; r++) {
    const i = tab.rows[r].indexOf(c);
    if (i >= 0) return [r + 1, i + 1];
  }
  return null;
}

/**
 * Фраза → слова из пар [ряд, место].
 * Возвращает { alphabet, words, text, swaps, dropped }: text — что прочтут (слова через пробел, уже с заменами),
 * swaps — [[буква, чем стучат]] для букв, которых нет в таблице, dropped — выброшенные знаки.
 */
export function encode(phrase, { fallback = "ru" } = {}) {
  const { alphabet, dropped } = normalize(phrase, { yo: false, fallback });
  const tab = tableOf(alphabet);
  const letters = ALPHABETS[alphabet];
  const words = [];
  const texts = [];
  const seen = new Set();
  for (const raw of String(phrase ?? "").toUpperCase().split(/[^\p{L}\p{N}]+/u)) {
    const word = [];
    let text = "";
    for (const ch of raw) {
      if (!letters.includes(ch)) continue;
      if (tab.swaps[ch]) seen.add(ch);
      word.push(placeOf(alphabet, ch));
      text += tab.swaps[ch] ?? ch;
    }
    if (word.length) {
      words.push(word);
      texts.push(text);
    }
  }
  const swaps = Object.entries(tab.swaps).filter(([ch]) => seen.has(ch));
  return { alphabet, words, text: texts.join(" "), swaps, dropped };
}

export const letterCount = (words) => words.reduce((n, w) => n + w.length, 0);

/** Пары → текст: слова через пробел. */
export const decode = (words, alphabet) => words.map((w) => w.map(([r, c]) => letterAt(alphabet, r, c)).join("")).join(" ");

/** Запись точками: «··· ·· / ·· ····» — буквы через « / », слова через « | ». */
export const formatDots = (words, dot = "·") =>
  words.map((w) => w.map(([r, c]) => `${dot.repeat(r)} ${dot.repeat(c)}`).join(" / ")).join(" | ");

/** Запись точками → пары. Точкой считаются · . • * и похожие; пустые буквы и слова пропускаются. */
export function parseDots(line) {
  const count = (s) => [...s].filter((ch) => DOT_CHARS.includes(ch)).length;
  return String(line ?? "")
    .split("|")
    .map((w) =>
      w
        .split("/")
        .map((l) => {
          const groups = l.trim().split(/\s+/).map(count).filter(Boolean);
          return [groups[0] ?? 0, groups[1] ?? 0];
        })
        .filter(([r, c]) => r > 0 && c > 0),
    )
    .filter((w) => w.length);
}

/**
 * Расписание ударов. Возвращает { hits, starts, total }:
 * hits — [{ t, w, l, g, n }] по порядку: время удара (мс от первого), номер слова, номер буквы (сквозной),
 * серия (0 — ряд, 1 — место), номер удара в серии (с единицы); starts — индекс первого удара каждой буквы;
 * total — длина всего стука с тишиной в конце. seed — дрожь руки (null — ровно по темпу).
 */
export function schedule(words, { speed = "normal", seed = null, jitter = JITTER } = {}) {
  const sp = SPEEDS[speed] ?? SPEEDS.normal;
  const rng = seed === null || seed === undefined ? null : mulberry32(seed);
  const vary = (ms) => (rng && jitter ? ms * (1 + (rng() * 2 - 1) * jitter) : ms);
  const hits = [];
  const starts = [];
  let t = 0;
  let l = 0;
  words.forEach((word, w) => {
    word.forEach((pair, i) => {
      if (hits.length) t += vary(i === 0 ? sp.word : sp.letter);
      starts.push(hits.length);
      pair.forEach((count, g) => {
        if (g === 1) t += vary(sp.group);
        for (let n = 1; n <= count; n++) {
          if (n > 1) t += vary(sp.beat);
          hits.push({ t: Math.round(t), w, l, g, n });
        }
      });
      l++;
    });
  });
  return { hits, starts, total: hits.length ? Math.round(t) + TAIL : 0 };
}

/** Сколько длится стук, мс (по темпу, без дрожи). */
export const duration = (words, speed) => schedule(words, { speed }).total;
