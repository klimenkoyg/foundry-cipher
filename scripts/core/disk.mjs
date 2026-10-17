/* Шифровальный диск (Цезарь, диск Альберти): два кольца с алфавитами.
   Внешнее кольцо неподвижно — открытый алфавит по порядку, «А» наверху, под меткой.
   Внутреннее крутится — шифр-алфавит: тот же по порядку или перемешанный ключевым словом
   (буквы слова без повторов, потом остальные по порядку). Ключ — какая буква внутреннего
   кольца стоит под «А»: тогда под каждой буквой внешнего кольца стоит её шифр.
   Смещение (offset) — номер буквы внутреннего кольца под «А».
   Алфавит — русский без Ё (Ё пишется как Е) или латиница, по фразе.
   Ничего из Foundry — работает и в Node. */

import { normalize } from "./alphabet.mjs";
import { mulberry32, randInt } from "./rng.mjs";

/** Кольца по порядку: русский без Ё — 32 буквы, латиница — 26. */
export const RINGS = {
  ru: "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ",
  en: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
};

export const mod = (a, n) => ((a % n) + n) % n;

/** Буква так, как она стоит на кольце: заглавная, Ё — как Е. */
export const ringLetter = (ch) => {
  const up = String(ch).toUpperCase();
  return up === "Ё" ? "Е" : up;
};

const isLetter = (ch) => /\p{L}/u.test(ch);
const isLower = (ch) => ch !== ch.toUpperCase();

/** Номер буквы на кольце или -1 (не буква кольца). */
const indexOn = (ring, ch) => {
  const l = ringLetter(ch);
  return l.length === 1 ? ring.indexOf(l) : -1;
};

/**
 * Внутреннее кольцо: буквы ключевого слова без повторов, потом остальные по порядку.
 * Возвращает { ring, word, bad } — word: буквы слова без повторов, bad: буквы слова не из алфавита.
 */
export function innerRing(alphabet, keyword = "") {
  const plain = RINGS[alphabet] ?? RINGS.ru;
  const bad = new Set();
  let word = "";
  for (const ch of String(keyword ?? "").normalize("NFC")) {
    const i = indexOn(plain, ch);
    if (i >= 0) {
      if (!word.includes(plain[i])) word += plain[i];
    } else if (isLetter(ch)) bad.add(ch.toUpperCase());
  }
  const rest = [...plain].filter((l) => !word.includes(l)).join("");
  return { ring: word + rest, word, bad: [...bad] };
}

/**
 * Ключ ведущего. «Г» — буква внутреннего кольца под «А»; «Б над Д», «Б Д», «БД» — под «Б» стоит «Д»;
 * «Д под Б» — то же. Пусто — { ok: true, offset: null }.
 * Возвращает { ok, offset } или { ok: false, error: "key" | "keyAlphabet", bad }.
 */
export function parseKey(text, outer, inner) {
  const words = String(text ?? "").normalize("NFC").split(/[^\p{L}]+/u).filter(Boolean);
  if (!words.length) return { ok: true, offset: null };
  const singles = words.filter((w) => [...w].length === 1);
  let pair;
  if (words.length === 1 && [...words[0]].length <= 2) pair = [...words[0]];
  else if (singles.length === 2 && words.length <= 3) {
    const under = words.some((w) => /^(под|under|below)$/iu.test(w));
    pair = under ? [singles[1], singles[0]] : singles;
  } else return { ok: false, error: "key" };
  const letters = pair.map(ringLetter);
  const bad = letters.filter((l) => l.length !== 1 || !outer.includes(l));
  if (bad.length) return { ok: false, error: "keyAlphabet", bad };
  const [top, under] = letters.length === 2 ? letters : [outer[0], letters[0]];
  return { ok: true, offset: mod(inner.indexOf(under) - outer.indexOf(top), outer.length) };
}

/** Какая буква внутреннего кольца стоит под буквой внешнего номер i. */
export const underOf = (disk, i) => disk.inner[mod(i + disk.offset, disk.outer.length)];

/** Шифровка: буква открытого алфавита → буква внутреннего кольца под ней. Регистр сохраняется, не-буквы — как есть. */
export function encrypt(text, disk) {
  let out = "";
  for (const ch of String(text ?? "")) {
    const i = indexOn(disk.outer, ch);
    if (i < 0) out += ch;
    else {
      const c = underOf(disk, i);
      out += isLower(ch) ? c.toLowerCase() : c;
    }
  }
  return out;
}

/** Расшифровка: буква внутреннего кольца → буква внешнего над ней. */
export function decrypt(text, disk) {
  const n = disk.outer.length;
  let out = "";
  for (const ch of String(text ?? "")) {
    const j = indexOn(disk.inner, ch);
    if (j < 0) out += ch;
    else {
      const p = disk.outer[mod(j - disk.offset, n)];
      out += isLower(ch) ? p.toLowerCase() : p;
    }
  }
  return out;
}

/** Буквы группами по пять — как пишут шифровки без пробелов. */
export const groups = (text, size = 5) => (String(text).match(new RegExp(`.{1,${size}}`, "gu")) ?? []).join(" ");

/**
 * Открытый текст записки. spaces: пробелы, знаки и цифры остаются, буквы чужого алфавита выпадают;
 * иначе — одни буквы алфавита, заглавные. Ё — как Е (регистр сохраняется).
 * Возвращает { plain, dropped }.
 */
export function plainText(phrase, alphabet, spaces = true) {
  const ring = RINGS[alphabet] ?? RINGS.ru;
  const dropped = new Set();
  let plain = "";
  for (const ch of String(phrase ?? "").normalize("NFC")) {
    const i = indexOn(ring, ch);
    if (i >= 0) plain += spaces ? (isLower(ch) ? ring[i].toLowerCase() : ring[i]) : ring[i];
    else if (isLetter(ch) || (!spaces && /\p{N}/u.test(ch))) dropped.add(ch.toUpperCase());
    else if (spaces) plain += ch;
  }
  if (spaces) {
    // Лишние пробелы и пустые строки — прочь: на записке они только мешают.
    plain = plain
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/[^\S\n]+/gu, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return { plain, dropped: [...dropped] };
}

/**
 * Собрать шифр. o: { phrase, key, keyword, spaces, seed }.
 * Ключ пуст — смещение случайное от seed (для кольца по порядку — не нулевое, иначе записка не зашифрована).
 * Возвращает { ok: true, alphabet, outer, inner, word, offset, keyGiven, plain, note, text, dropped }
 * или { ok: false, error: "empty" | "keyword" | "key" | "keyAlphabet", bad }.
 */
export function generate({ phrase, key = "", keyword = "", spaces = true, seed = 1 } = {}) {
  const { text, alphabet } = normalize(String(phrase ?? "").normalize("NFC"), { yo: true });
  if (!text) return { ok: false, error: "empty" };
  const outer = RINGS[alphabet];
  const n = outer.length;
  const ring = innerRing(alphabet, keyword);
  if (ring.bad.length) return { ok: false, error: "keyword", bad: ring.bad, alphabet };
  const inner = ring.ring;
  const parsed = parseKey(key, outer, inner);
  if (!parsed.ok) return { ...parsed, alphabet };
  let offset = parsed.offset;
  if (offset === null) {
    const rng = mulberry32(seed);
    offset = inner === outer ? 1 + randInt(rng, n - 1) : randInt(rng, n);
  }
  const disk = { outer, inner, offset };
  const { plain, dropped } = plainText(phrase, alphabet, spaces);
  const note = spaces ? encrypt(plain, disk) : groups(encrypt(plain, disk));
  return { ok: true, alphabet, outer, inner, word: ring.word, offset, keyGiven: parsed.offset !== null, plain, note, text, dropped };
}
