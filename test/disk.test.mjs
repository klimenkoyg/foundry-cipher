import assert from "node:assert/strict";
import { test } from "node:test";

import { decrypt, encrypt, generate, groups, innerRing, parseKey, plainText, RINGS, underOf } from "../scripts/core/disk.mjs";

const RU = RINGS.ru;
const EN = RINGS.en;

test("кольца: 32 русские буквы без Ё и 26 латинских, без повторов", () => {
  assert.equal(RU.length, 32);
  assert.equal(EN.length, 26);
  assert.ok(!RU.includes("Ё"));
  assert.equal(new Set(RU).size, 32);
  assert.equal(new Set(EN).size, 26);
});

test("Цезарь: «А над Г» — сдвиг на три", () => {
  const disk = { outer: RU, inner: RU, offset: 3 };
  assert.equal(encrypt("АБВ ЭЮЯ", disk), "ГДЕ АБВ");
  assert.equal(decrypt("ГДЕ АБВ", disk), "АБВ ЭЮЯ");
  assert.equal(underOf(disk, 0), "Г");
  const en = { outer: EN, inner: EN, offset: 3 };
  assert.equal(encrypt("Veni, vidi, vici.", en), "Yhql, ylgl, ylfl.");
});

test("расшифровка обращает шифровку при любом ключе и любом кольце", () => {
  const texts = {
    ru: "Встречаемся у старой мельницы в полночь. Приходи один! 12 шагов — «на север».",
    en: "Meet me by the old mill at midnight. Come alone — 3 bells.",
  };
  for (const [alphabet, text] of Object.entries(texts)) {
    for (const keyword of ["", alphabet === "ru" ? "Мельница" : "Wheel"]) {
      const { ring } = innerRing(alphabet, keyword);
      for (let offset = 0; offset < RINGS[alphabet].length; offset++) {
        const disk = { outer: RINGS[alphabet], inner: ring, offset };
        const secret = encrypt(text, disk);
        assert.equal(secret.length, text.length);
        assert.equal(decrypt(secret, disk), text);
      }
    }
  }
});

test("ключевое слово: буквы без повторов, потом остальные по порядку", () => {
  const { ring, word, bad } = innerRing("ru", "Мельница");
  assert.equal(word, "МЕЛЬНИЦА");
  assert.equal(ring, "МЕЛЬНИЦАБВГДЖЗЙКОПРСТУФХЧШЩЪЫЭЮЯ");
  assert.equal(new Set(ring).size, 32);
  assert.deepEqual(bad, []);
  assert.equal(innerRing("ru", "папа ёлка").word, "ПАЕЛК");
  assert.equal(innerRing("en", "Hello world").ring.slice(0, 7), "HELOWRD");
  assert.equal(innerRing("ru", "").ring, RU);
  assert.deepEqual(innerRing("ru", "мельница7 mill").bad, ["M", "I", "L"]);
});

test("ключ: одна буква, пара букв, «над» и «под»", () => {
  const k = (s, inner = RU) => parseKey(s, RU, inner);
  assert.deepEqual(k(""), { ok: true, offset: null });
  assert.deepEqual(k("  "), { ok: true, offset: null });
  assert.equal(k("Г").offset, 3);
  assert.equal(k("г").offset, 3);
  assert.equal(k("А над Г").offset, 3);
  assert.equal(k("Б над Д").offset, 3);
  assert.equal(k("Б-Д").offset, 3);
  assert.equal(k("БД").offset, 3);
  assert.equal(k("Д под Б").offset, 3);
  assert.equal(k("Ё").offset, 5);
  assert.equal(k("А").offset, 0);
  assert.equal(k("Я над А").offset, 1);
  const mill = innerRing("ru", "Мельница").ring;
  assert.equal(k("М", mill).offset, 0);
  assert.equal(k("Б над Е", mill).offset, 0);
  assert.equal(k("Ц", mill).offset, 6);
  assert.deepEqual(k("Q"), { ok: false, error: "keyAlphabet", bad: ["Q"] });
  assert.equal(k("три").error, "key");
  assert.equal(k("А Б В").error, "key");
});

test("записка: пробелы и знаки остаются, чужие буквы выпадают", () => {
  assert.deepEqual(plainText("  Ёж   и  ёлка,\n\n\n\nв 12 часов!  Ok ", "ru"), { plain: "Еж и елка,\n\nв 12 часов!", dropped: ["O", "K"] });
  assert.deepEqual(plainText("Ёж, в 12!", "ru", false), { plain: "ЕЖВ", dropped: ["1", "2"] });
  assert.equal(groups("ВСТРЕЧАЕМСЯУ"), "ВСТРЕ ЧАЕМС ЯУ");
});

test("сборка: записка расшифровывается в открытый текст, ключ — из поля", () => {
  const res = generate({ phrase: "Встречаемся у старой мельницы в полночь. Приходи один.", key: "К", seed: 7 });
  assert.equal(res.ok, true);
  assert.equal(res.alphabet, "ru");
  assert.equal(res.offset, 10);
  assert.equal(res.keyGiven, true);
  assert.equal(underOf(res, 0), "К");
  assert.equal(res.plain, "Встречаемся у старой мельницы в полночь. Приходи один.");
  assert.equal(res.note.length, res.plain.length);
  assert.notEqual(res.note, res.plain);
  assert.equal(res.note.slice(-6, -5), " ");
  assert.equal(decrypt(res.note, res), res.plain);
  assert.equal(res.text, "ВСТРЕЧАЕМСЯУСТАРОЙМЕЛЬНИЦЫВПОЛНОЧЬПРИХОДИОДИН");
});

test("сборка без пробелов: одни буквы группами по пять", () => {
  const res = generate({ phrase: "Meet me at the mill!", key: "D", spaces: false });
  assert.equal(res.alphabet, "en");
  assert.equal(res.plain, "MEETMEATTHEMILL");
  assert.equal(res.note, "PHHWP HDWWK HPLOO");
  assert.equal(decrypt(res.note, res), "MEETM EATTH EMILL");
});

test("сборка: ключевое слово перемешивает внутреннее кольцо", () => {
  const res = generate({ phrase: "Приходи один", key: "А", keyword: "мельница" });
  assert.equal(res.inner, "МЕЛЬНИЦАБВГДЖЗЙКОПРСТУФХЧШЩЪЫЭЮЯ");
  assert.equal(res.word, "МЕЛЬНИЦА");
  assert.equal(underOf(res, 0), "А");
  assert.equal(decrypt(res.note, res), "Приходи один");
});

test("пустой ключ — случайный, но от зерна; кольцо по порядку никогда не стоит на месте", () => {
  const a = generate({ phrase: "Тише едешь — дальше будешь", seed: 42 });
  const b = generate({ phrase: "Тише едешь — дальше будешь", seed: 42 });
  assert.equal(a.offset, b.offset);
  assert.equal(a.keyGiven, false);
  const seen = new Set();
  for (let seed = 1; seed <= 400; seed++) {
    const r = generate({ phrase: "Тише едешь", seed });
    assert.ok(r.offset >= 1 && r.offset < 32);
    seen.add(r.offset);
  }
  assert.ok(seen.size > 20);
});

test("ошибки: пустая фраза, ключ не из алфавита, чужие буквы в слове", () => {
  assert.equal(generate({ phrase: "" }).error, "empty");
  assert.equal(generate({ phrase: "  12 — 34 " }).error, "empty");
  assert.deepEqual(generate({ phrase: "Привет", key: "D" }).bad, ["D"]);
  assert.equal(generate({ phrase: "Привет", key: "D" }).error, "keyAlphabet");
  assert.equal(generate({ phrase: "Hello", key: "Г" }).error, "keyAlphabet");
  assert.equal(generate({ phrase: "Привет", key: "один два" }).error, "key");
  assert.deepEqual(generate({ phrase: "Привет", keyword: "mill" }).bad, ["M", "I", "L"]);
  assert.equal(generate({ phrase: "Привет", keyword: "mill" }).error, "keyword");
});
