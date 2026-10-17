/* Скитала: длинная лента с буквами вперемешку и жезл с гранями.
   Фразу пишут по строкам в сетку «граней × столбцов» (хвост последней строки — пустышки),
   а на ленту буквы переносят по столбцам. Намотанная на жезл в n граней, лента ложится витками:
   на грань i попадают буквы ленты с номерами i, i+n, i+2n… При n, равном числу граней жезла,
   грани читаются строками сетки — то есть фразой. Любая другая толщина даёт бессмыслицу.
   Ничего из Foundry — работает и в Node. */

import { fillerPicker, normalize } from "./alphabet.mjs";
import { clamp, mulberry32 } from "./rng.mjs";

/** Сколько граней может быть у жезла шифра. */
export const FACES = { min: 3, max: 12 };

/** Какую толщину можно пробовать вручную: от плоской планки в две грани. */
export const WIND = { min: 2, max: 12 };

/** Самая длинная фраза: дальше лента не помещается ни в окно, ни на картинку. */
export const MAX_LETTERS = 180;

/** Граней по длине фразы: сетка близка к квадрату — округлённый корень, в границах. */
export const autoFaces = (length) => clamp(Math.round(Math.sqrt(length)), FACES.min, FACES.max);

/** Столбцов в сетке: фраза помещается целиком, и столбцов не меньше двух — иначе лента не перемешана. */
export const columnsFor = (length, faces) => Math.max(2, Math.ceil(length / faces));

/** Намотать ленту на жезл в n граней: грань i — буквы ленты i, i+n, i+2n… */
export function wind(ribbon, n) {
  const rows = Array.from({ length: n }, () => "");
  [...ribbon].forEach((ch, k) => (rows[k % n] += ch));
  return rows;
}

/** Что читается вдоль граней подряд: грань за гранью. */
export const read = (ribbon, n) => wind(ribbon, n).join("");

/** Где на намотке буква ленты k: грань (строка) и виток (столбец). */
export const placeOf = (k, n) => ({ row: k % n, turn: Math.floor(k / n) });

/** Буква ленты k — пустышка? Хвост — клетки сетки после последней буквы фразы. */
export const isTail = (k, { faces, cols, text }) => (k % faces) * cols + Math.floor(k / faces) >= text.length;

/**
 * Собрать шифр.
 * input: { phrase, faces, seed, yo } — faces не задан: autoFaces по длине фразы.
 * Успех: { ok: true, faces, auto, cols, text, alphabet, dropped, grid: string[], ribbon, tail }
 * Ошибка: { ok: false, error: "empty" | "tooLong", faces, auto, length?, max? }
 */
export function generate({ phrase, faces = null, seed = 1, yo = true } = {}) {
  const norm = normalize(phrase, { yo });
  const length = norm.text.length;
  const auto = !Number(faces);
  const n = auto ? autoFaces(length) : clamp(Math.round(Number(faces)), FACES.min, FACES.max);
  if (!length) return { ok: false, error: "empty", faces: n, auto };
  if (length > MAX_LETTERS) return { ok: false, error: "tooLong", faces: n, auto, length, max: MAX_LETTERS };

  const cols = columnsFor(length, n);
  const filler = fillerPicker(norm.alphabet, norm.text, mulberry32(seed), { yo });
  let cells = norm.text;
  while (cells.length < n * cols) cells += filler();
  const grid = Array.from({ length: n }, (_, r) => cells.slice(r * cols, (r + 1) * cols));

  let ribbon = "";
  for (let c = 0; c < cols; c++) for (let r = 0; r < n; r++) ribbon += grid[r][c];
  return { ok: true, faces: n, auto, cols, text: norm.text, alphabet: norm.alphabet, dropped: norm.dropped, grid, ribbon, tail: n * cols - length };
}
