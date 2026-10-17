import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, encode, formatNote, parseBook, parseNote, splitWords } from "../scripts/core/book.mjs";
import book from "../scripts/foundry/kinds/book.mjs";

const CHRONICLE = [
  "В год Пепельной луны колокол Белого Шпиля трижды прозвонил в полночь.",
  "",
  "Наутро у ворот появился странник в сером плаще; он знал старое слово привратников.",
  "Кое-где на полях хроник — пометки чужой рукой, 1347 год.",
  "Говорят, под северной лестницей есть дверь, а замок отзывается только на живой голос, когда поют.",
];

const SOURCE = CHRONICLE.join("\n");
const REF = /^\d+\.\d+(\.\d+)?$/;

test("книга: абзацы по строкам, пустые не в счёт, слова — только буквы", () => {
  const paras = parseBook(SOURCE);
  assert.equal(paras.length, 4);
  assert.deepEqual(
    paras[2].words.map((w) => w.raw),
    ["Кое-где", "на", "полях", "хроник", "пометки", "чужой", "рукой", "год"],
  );
  assert.equal(paras[2].words[0].key, "КОЕГДЕ");
  assert.equal(paras[1].words[0].key, "НАУТРО");
  assert.deepEqual(splitWords("ещё Ёлка").map((w) => w.key), ["ЕЩЕ", "ЕЛКА"]);
  assert.equal(parseBook("  \n— 1347 —\n").length, 0);
});

test("записка читается по книге: слова целиком и по буквам", () => {
  const res = encode({ source: SOURCE, phrase: "Голос откроет северную дверь!", mode: "words", seed: 7 });
  assert.ok(res.ok);
  assert.equal(res.text, "ГОЛОС ОТКРОЕТ СЕВЕРНУЮ ДВЕРЬ");
  assert.equal(decode(SOURCE, res.note), res.text);
  assert.deepEqual(res.groups.map((g) => g.whole), [true, false, false, true]);
  assert.equal(res.paragraphs, 4);
});

test("только по буквам: каждое число — абзац.слово.буква", () => {
  const res = encode({ source: SOURCE, phrase: "Голос и дверь", mode: "letters", seed: 3 });
  assert.ok(res.ok);
  assert.equal(decode(SOURCE, res.note), "ГОЛОС И ДВЕРЬ");
  for (const g of res.groups) {
    assert.equal(g.whole, false);
    assert.equal(g.refs.length, g.key.length);
    for (const r of g.refs) assert.ok(r.l != null);
  }
});

test("формат: числа слова через пробел, слова фразы через « · »", () => {
  const res = encode({ source: SOURCE, phrase: "голос откроет дверь", seed: 11 });
  const groups = res.note.split(" · ");
  assert.equal(groups.length, 3);
  assert.match(groups[0], /^\d+\.\d+$/);
  assert.equal(groups[1].split(" ").length, 7);
  for (const g of groups) for (const r of g.split(" ")) assert.match(r, REF);
  assert.equal(formatNote(res.groups), res.note);
  assert.deepEqual(parseNote("4.20 · 1.2.3 3.1.4"), [[{ p: 3, w: 19 }], [{ p: 0, w: 1, l: 2 }, { p: 2, w: 0, l: 3 }]]);
});

test("Ё = Е, буква считается без дефиса", () => {
  const res = encode({ source: "Ёж и кое-где ещё", phrase: "еж где", mode: "letters", seed: 5 });
  assert.equal(decode("Ёж и кое-где ещё", res.note), "ЕЖ ГДЕ");
  assert.equal(decode("Ёж и кое-где ещё", "1.3.4 1.3.5 1.3.6"), "ГДЕ");
  assert.equal(decode("Ёж и кое-где ещё", "1.1"), "ЕЖ");
});

test("ошибки: нет книги, нет фразы, в книге нет нужной буквы", () => {
  assert.equal(encode({ source: "", phrase: "дверь" }).error, "noBook");
  assert.equal(encode({ source: SOURCE, phrase: " 12 — " }).error, "noPhrase");
  const res = encode({ source: SOURCE, phrase: "фея и эхо", seed: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.error, "noLetter");
  assert.equal(res.letter, "Ф");
  assert.equal(res.word, "ФЕЯ");
  assert.deepEqual(res.letters, ["Ф", "Э"]);
  // целиком нашлось — буквы не нужны
  assert.ok(encode({ source: "Щит у ворот", phrase: "щит", seed: 1 }).ok);
});

test("детерминизм: одно зерно — одна записка, другое — другая", () => {
  const a = encode({ source: SOURCE, phrase: "откроет северную дверь", seed: 42 });
  const b = encode({ source: SOURCE, phrase: "откроет северную дверь", seed: 42 });
  assert.equal(a.note, b.note);
  const notes = new Set();
  for (let seed = 1; seed <= 8; seed++) notes.add(encode({ source: SOURCE, phrase: "откроет северную дверь", seed }).note);
  assert.ok(notes.size > 1);
});

test("одно и то же место подряд не повторяется, пока есть другие", () => {
  for (let seed = 1; seed <= 30; seed++) {
    const res = encode({ source: SOURCE, phrase: "ооо оооо", mode: "letters", seed });
    const refs = res.groups.flatMap((g) => g.refs).map((r) => `${r.p}.${r.w}`);
    for (let i = 1; i < refs.length; i++) assert.notEqual(refs[i], refs[i - 1]);
  }
});

test("пример вида собирается: часть слов целиком, часть по буквам", () => {
  const demo = { ...book.defaults(), ...book.demo() };
  const built = book.build(demo);
  assert.ok(built.cipher, JSON.stringify(built.problem));
  const words = splitWords(demo.source).length;
  assert.ok(words >= 150 && words <= 250, `слов в книге: ${words}`);
  const kinds = new Set(built.cipher.groups.map((g) => g.whole));
  assert.equal(kinds.size, 2);
  assert.equal(decode(demo.source, built.cipher.note), built.cipher.text);
});
