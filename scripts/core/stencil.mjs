/* Письмо с секретом (трафарет Кардано): ведущий пишет безобидное письмо и тайную фразу.
   Письмо раскладывается по строкам в ровную сетку знаков — каждый знак, и пробел тоже, в своей клетке.
   Буквы фразы ищутся в письме по порядку (как подпоследовательность) и разбрасываются по всему
   тексту равномерно; над ними в латунной пластине вырезаются окошки. Соседние окошки в строке
   сливаются в одну прорезь. Без пластины — обычное письмо, с пластиной — проступает фраза.
   Ничего из Foundry — работает и в Node. */

import { ALPHABETS, normalize } from "./alphabet.mjs";
import { clamp, mulberry32 } from "./rng.mjs";

/** Знаков в строке: границы и «на глаз» для короткого письма. */
export const WIDTH = { min: 20, max: 60, default: 34 };

/** Сколько знаков в строке, если ведущий не указал: короткому письму — 34, длинному — шире. */
export function autoWidth(cover) {
  const len = [...String(cover ?? "").replace(/\s+/g, " ").trim()].length;
  return clamp(Math.round(Math.sqrt(len / 0.68)), WIDTH.default, WIDTH.max);
}

/**
 * Письмо → строки не длиннее width знаков. Перенос по словам, абзацы сохраняются; подряд идущие
 * пустые строки сливаются в одну, по краям — убираются; слово длиннее строки рубится на куски.
 */
export function layout(cover, width) {
  const out = [];
  for (const para of String(cover ?? "").normalize("NFC").split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (out.length && out.at(-1) !== "") out.push("");
      continue;
    }
    let line = [];
    for (const word of words) {
      let w = [...word];
      if (line.length && line.length + 1 + w.length <= width) {
        line.push(" ", ...w);
        continue;
      }
      if (line.length) out.push(line.join(""));
      while (w.length > width) {
        out.push(w.slice(0, width).join(""));
        w = w.slice(width);
      }
      line = w;
    }
    out.push(line.join(""));
  }
  while (out.at(-1) === "") out.pop();
  return out;
}

/** Знак письма → буква для сравнения с фразой (заглавная, Ё как Е по желанию). */
const keyOf = (ch, yo) => {
  const up = ch.toUpperCase();
  return yo && up === "Ё" ? "Е" : up;
};

/** Буквы письма по порядку: [{ i — клетка, key }]. Пробелы и знаки препинания пропускаются. */
export function letterCells(lines, width, { yo = true } = {}) {
  const out = [];
  lines.forEach((line, r) =>
    [...line].forEach((ch, c) => {
      if (/\p{L}/u.test(ch)) out.push({ i: r * width + c, key: keyOf(ch, yo) });
    }),
  );
  return out;
}

/** Знак в клетке i (пробел, если строка короче). */
export function charAt(lines, width, i) {
  return [...(lines[Math.floor(i / width)] ?? "")][i % width] ?? " ";
}

/** Что читается в клетках по порядку. */
export const readCells = (lines, width, cells) => cells.map((i) => charAt(lines, width, i)).join("");

/** Окошки: соседние клетки одной строки сливаются в прорезь [строка, столбец, длина]. */
export function slotsOf(cells, width) {
  const out = [];
  for (const i of [...cells].sort((a, b) => a - b)) {
    const r = Math.floor(i / width);
    const c = i % width;
    const last = out.at(-1);
    if (last && last[0] === r && last[1] + last[2] === c) last[2]++;
    else out.push([r, c, 1]);
  }
  return out;
}

/** Клетки под прорезями. */
export const cellsOfSlots = (slots, width) => slots.flatMap(([r, c, len]) => Array.from({ length: len }, (_, k) => r * width + c + k));

/** Начало фразы до буквы номер count (как её написал ведущий) — для сообщения об ошибке. */
function prefixOf(phrase, count, { yo, alphabet }) {
  const letters = ALPHABETS[alphabet] ?? "";
  let seen = 0;
  let out = "";
  for (const ch of String(phrase ?? "")) {
    let n = 0;
    for (let up of ch.toUpperCase()) {
      if (yo && up === "Ё") up = "Е";
      if (letters.includes(up)) n++;
    }
    if (n && seen + n > count) break;
    seen += n;
    out += ch;
  }
  return out.replace(/\s+/g, " ").replace(/[^\p{L}\p{N}]+$/u, "").trim();
}

/**
 * Найти буквы фразы в письме по порядку, разбросав их по всему тексту.
 * letters — буквы письма ([{ key }]), text — буквы фразы. Цель для j-й буквы — равный шаг по ещё
 * не занятой части письма (первая — на полшага от начала, последняя — на полшага от конца),
 * со случайным сдвигом до трети шага; берётся ближайшее подходящее вхождение в окне
 * [после предыдущей; не позже последнего места, откуда ещё находится остаток фразы].
 * Если редкая буква утащила выбор вперёд, остаток фразы снова растягивается на оставшийся текст.
 * Возвращает { picks } — номера букв письма, или { missing: j } — j-я буква фразы не нашлась.
 */
export function spread(letters, text, rng = Math.random) {
  const m = letters.length;
  const n = text.length;
  // Жадно вперёд: самое раннее место для каждой буквы (и проверка, что фраза вообще есть).
  const early = new Array(n);
  for (let j = 0, k = 0; j < n; j++, k++) {
    while (k < m && letters[k].key !== text[j]) k++;
    if (k >= m) return { missing: j };
    early[j] = k;
  }
  // Жадно назад: самое позднее место, с которого остаток фразы ещё находится.
  const late = new Array(n);
  for (let j = n - 1, k = m - 1; j >= 0; j--, k--) {
    while (letters[k].key !== text[j]) k--;
    late[j] = k;
  }
  const picks = [];
  let prev = -1;
  for (let j = 0; j < n; j++) {
    const lo = Math.max(early[j], prev + 1);
    const hi = late[j];
    const step = j === 0 ? m / n : (m - prev) / (n - j + 0.5);
    const target = (j === 0 ? step / 2 : prev + step) + (rng() - 0.5) * 0.6 * step;
    let best = -1;
    for (let k = lo; k <= hi; k++) {
      if (letters[k].key !== text[j]) continue;
      if (best < 0 || Math.abs(k - target) < Math.abs(best - target)) best = k;
      else if (k > target) break;
    }
    picks.push(best);
    prev = best;
  }
  return { picks };
}

/**
 * Собрать шифр. Возвращает { ok: true, width, auto, lines, rows, text, alphabet, dropped, cells, slots }
 * или { ok: false, error: "noCover" | "noPhrase" | "missing", … } — для "missing": letter — какой буквы
 * не хватает, after — начало фразы, которое уже нашлось, found — сколько букв нашлось.
 */
export function generate({ cover, phrase, width = null, seed = 1, yo = true } = {}) {
  const auto = !Number.isFinite(width);
  const w = auto ? autoWidth(cover) : clamp(Math.round(width), WIDTH.min, WIDTH.max);
  const lines = layout(cover, w);
  if (!lines.length) return { ok: false, error: "noCover" };
  const { text, alphabet, dropped } = normalize(phrase, { yo });
  if (!text) return { ok: false, error: "noPhrase", dropped };
  const letters = letterCells(lines, w, { yo });
  const res = spread(letters, text, mulberry32(seed));
  if (res.missing !== undefined) {
    const j = res.missing;
    return { ok: false, error: "missing", letter: text[j], after: prefixOf(phrase, j, { yo, alphabet }), found: j, length: text.length };
  }
  const cells = res.picks.map((k) => letters[k].i);
  return { ok: true, width: w, auto, lines, rows: lines.length, text, alphabet, dropped, cells, slots: slotsOf(cells, w) };
}
