/* Книжный шифр: записка из чисел по тексту книги. Каждое слово фразы — либо «абзац.слово»
   (такое же слово есть в книге), либо по буквам: «абзац.слово.буква» на каждую букву.
   Числа одного слова фразы — через пробел, слова фразы — через « · ».
   Абзац — строка текста, в которой есть хоть одно слово (пустые строки не считаются).
   Слово — подряд идущие буквы, через дефис или апостроф — одно слово; числа и знаки — не слова.
   Буква в слове считается только по буквам (дефис не в счёт). Сравнение — без регистра, Ё = Е.
   Ничего из Foundry — работает и в Node. */

import { mulberry32 } from "./rng.mjs";

/** Как шифровать: слова целиком, а чего в книге нет — по буквам; или всё по буквам. */
export const MODES = ["words", "letters"];

/** Разделитель слов фразы в записке. */
export const SEP = " · ";

const WORD_RE = /\p{L}[\p{L}\p{M}]*(?:[-'’ʼ][\p{L}\p{M}]+)*/gu;
const LETTER_RE = /\p{L}/u;

export const isLetter = (ch) => LETTER_RE.test(ch);

/** Буква для сравнения: заглавная, Ё = Е. */
export function letterKey(ch) {
  const up = ch.toUpperCase();
  const one = [...up].length === 1 ? up : ch;
  return one === "Ё" ? "Е" : one;
}

/** Слова строки: { raw — как написано, letters — буквы для сравнения, key — слово для сравнения, start, end }. */
export function splitWords(text) {
  const out = [];
  for (const m of String(text ?? "").normalize("NFC").matchAll(WORD_RE)) {
    const letters = [...m[0]].filter(isLetter).map(letterKey);
    out.push({ raw: m[0], letters, key: letters.join(""), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Книга → абзацы: [{ text, words }]. Строки без слов — не абзацы. */
export function parseBook(source) {
  const paragraphs = [];
  for (const text of String(source ?? "").normalize("NFC").split(/\r\n?|\n/)) {
    const words = splitWords(text);
    if (words.length) paragraphs.push({ text, words });
  }
  return paragraphs;
}

/** Метка слова книги «абзац.слово» (с единицы) — ей же помечаются отметки игроков. */
export const wordRef = (p, w) => `${p + 1}.${w + 1}`;

/** Число записки: «абзац.слово» или «абзац.слово.буква». */
export const formatRef = ({ p, w, l }) => (l == null ? wordRef(p, w) : `${wordRef(p, w)}.${l + 1}`);

export const formatNote = (groups) => groups.map((g) => g.refs.map(formatRef).join(" ")).join(SEP);

/** Записка → [[{ p, w, l? }]] — по слову фразы. Непонятное число — { bad: "…" }. */
export function parseNote(note) {
  return String(note ?? "")
    .split(/[·•|/]/)
    .map((group) =>
      group
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => {
          const m = s.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
          if (!m) return { bad: s };
          const ref = { p: Number(m[1]) - 1, w: Number(m[2]) - 1 };
          if (m[3] !== undefined) ref.l = Number(m[3]) - 1;
          return ref;
        }),
    )
    .filter((g) => g.length);
}

/** Прочесть записку по книге: слова фразы через пробел; чего нет в книге — «?». */
export function decode(source, note) {
  const book = parseBook(source);
  return parseNote(note)
    .map((group) =>
      group
        .map((ref) => {
          const word = ref.bad ? null : book[ref.p]?.words[ref.w];
          if (!word) return "?";
          return ref.l == null ? word.key : (word.letters[ref.l] ?? "?");
        })
        .join(""),
    )
    .join(" ");
}

const push = (map, key, value) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

/**
 * Зашифровать фразу по книге. Места выбираются случайно от seed: сначала — слова, которых ещё
 * не брали, потом — любое, кроме только что взятого, и лишь в крайнем случае — то же самое.
 * Возвращает { ok: true, groups: [{ key, whole, refs: [{ p, w, l? }] }], note, text, dropped, paragraphs, words }
 * или { ok: false, error: "noBook" | "noPhrase" | "noLetter", letter, letters, word }.
 */
export function encode({ source, phrase, mode = "words", seed = 1 } = {}) {
  const book = parseBook(source);
  if (!book.length) return { ok: false, error: "noBook" };
  const dropped = [...new Set(String(phrase ?? "").match(/\p{N}/gu) ?? [])];
  const words = splitWords(phrase);
  if (!words.length) return { ok: false, error: "noPhrase", dropped };

  const byKey = new Map();
  const byLetter = new Map();
  let total = 0;
  book.forEach((para, p) =>
    para.words.forEach((word, w) => {
      total++;
      push(byKey, word.key, { p, w });
      word.letters.forEach((ch, l) => push(byLetter, ch, { p, w, l }));
    }),
  );

  const wholeOk = mode !== "letters";
  const missing = [];
  for (const word of words) {
    if (wholeOk && byKey.has(word.key)) continue;
    for (const ch of word.letters) if (!byLetter.has(ch) && !missing.some((m) => m.letter === ch)) missing.push({ letter: ch, word: word.key });
  }
  if (missing.length) return { ok: false, error: "noLetter", letter: missing[0].letter, word: missing[0].word, letters: missing.map((m) => m.letter) };

  const rng = mulberry32(seed);
  const used = new Set();
  let last = null;
  const take = (cands) => {
    const id = (c) => wordRef(c.p, c.w);
    let pool = cands.filter((c) => !used.has(id(c)));
    if (!pool.length) pool = cands.filter((c) => id(c) !== last);
    if (!pool.length) pool = cands;
    const c = pool[Math.floor(rng() * pool.length)];
    last = id(c);
    used.add(last);
    return { ...c };
  };

  const groups = words.map((word) => {
    const same = wholeOk ? byKey.get(word.key) : null;
    if (same) return { key: word.key, whole: true, refs: [take(same)] };
    return { key: word.key, whole: false, refs: word.letters.map((ch) => take(byLetter.get(ch))) };
  });

  return {
    ok: true,
    groups,
    note: formatNote(groups),
    text: words.map((w) => w.key).join(" "),
    dropped,
    paragraphs: book.length,
    words: total,
  };
}
