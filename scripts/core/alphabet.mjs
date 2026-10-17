/* Алфавиты шифров: какие буквы остаются от фразы и какими буквами забивать пустые клетки. */

import { randInt } from "./rng.mjs";

/** Частоты букв (на тысячу) — по ним выбираются буквы-пустышки, чтобы письмо выглядело как текст. */
const FREQ = {
  ru: {
    О: 109.7, Е: 84.5, А: 80.1, И: 73.5, Н: 67, Т: 62.6, С: 54.7, Р: 47.3, В: 45.4, Л: 44, К: 34.9,
    М: 32.1, Д: 29.8, П: 28.1, У: 26.2, Я: 20.1, Ы: 19, Ь: 17.4, Г: 17, З: 16.5, Б: 15.9, Ч: 14.4,
    Й: 12.1, Х: 9.7, Ж: 9.4, Ш: 7.3, Ю: 6.4, Ц: 4.8, Щ: 3.6, Э: 3.2, Ф: 2.6, Ъ: 0.4, Ё: 0.4,
  },
  en: {
    E: 127, T: 91, A: 82, O: 75, I: 70, N: 67, S: 63, H: 61, R: 60, D: 43, L: 40, C: 28, U: 28,
    M: 24, W: 24, F: 22, G: 20, Y: 20, P: 19, B: 15, V: 10, K: 8, J: 1.5, X: 1.5, Q: 1, Z: 0.7,
  },
};

export const ALPHABETS = Object.fromEntries(Object.entries(FREQ).map(([id, f]) => [id, Object.keys(f).join("")]));

/**
 * Фраза → только буквы одного алфавита, заглавные.
 * Алфавит — тот, чьих букв во фразе больше. yo: «Ё» пишется как «Е».
 * Возвращает { text, alphabet, dropped } — dropped: буквы и цифры, которые пришлось выбросить.
 */
export function normalize(phrase, { yo = true, fallback = "ru" } = {}) {
  const up = String(phrase ?? "").toUpperCase();
  let ru = 0;
  let en = 0;
  for (const ch of up) {
    if (ALPHABETS.ru.includes(ch)) ru++;
    else if (ALPHABETS.en.includes(ch)) en++;
  }
  const alphabet = ru || en ? (ru >= en ? "ru" : "en") : fallback;
  const letters = ALPHABETS[alphabet];
  let text = "";
  const dropped = new Set();
  for (let ch of up) {
    if (yo && ch === "Ё") ch = "Е";
    if (letters.includes(ch)) text += ch;
    else if (/[\p{L}\p{N}]/u.test(ch)) dropped.add(ch);
  }
  return { text, alphabet, dropped: [...dropped] };
}

/**
 * Генератор букв-пустышек: частоты языка вперемешку с буквами самой фразы —
 * так по частотам не отличить, какие клетки настоящие.
 */
export function fillerPicker(alphabet, text, rng, { yo = true } = {}) {
  const weights = new Map();
  const freq = FREQ[alphabet] ?? FREQ.ru;
  const total = Object.values(freq).reduce((a, b) => a + b, 0);
  for (const [ch, w] of Object.entries(freq)) {
    if (yo && ch === "Ё") continue;
    weights.set(ch, (0.6 * w) / total);
  }
  for (const ch of text) weights.set(ch, (weights.get(ch) ?? 0) + 0.4 / text.length);
  const letters = [...weights.keys()];
  const cumulative = [];
  let acc = 0;
  for (const ch of letters) cumulative.push((acc += weights.get(ch)));
  return () => {
    const x = rng() * acc;
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulative[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return letters[lo] ?? letters[randInt(rng, letters.length)];
  };
}
