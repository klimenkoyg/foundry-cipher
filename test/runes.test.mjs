import assert from "node:assert/strict";
import { test } from "node:test";

import { mulberry32 } from "../scripts/core/rng.mjs";
import { decode, FRAGMENTS, frequency, generate, glyphSig, invert, lettersOf, makeGlyphs, MAX_LETTERS, parseWords, splitKey, STYLES } from "../scripts/core/runes.mjs";
import runes from "../scripts/foundry/kinds/runes.mjs";

const CULT = "Седьмая жертва откроет врата бездны";
const shape = (g) => `${g.d}|${JSON.stringify(g.dots)}`;

test("замена однозначна: у каждой буквы свой знак, знаки не повторяются", () => {
  for (const style of STYLES) {
    for (let seed = 1; seed <= 40; seed++) {
      const c = generate({ phrase: CULT, style, seed });
      assert.ok(c.ok);
      const abc = [...lettersOf(c.alphabet)];
      assert.deepEqual(Object.keys(c.letters).sort(), [...abc].sort());
      const ids = Object.values(c.letters);
      assert.equal(new Set(ids).size, abc.length, "имена знаков не повторяются");
      assert.deepEqual(new Set(Object.keys(c.glyphs)), new Set(ids));
      const shapes = ids.map((g) => shape(c.glyphs[g]));
      assert.equal(new Set(shapes).size, shapes.length, `${style}, seed ${seed}: два одинаковых знака`);
    }
  }
});

test("подписи-отпечатки знаков не повторяются, знаки различаются хотя бы на две черты", () => {
  for (const style of STYLES) {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed);
      const glyphs = makeGlyphs(32, style, rng);
      assert.equal(glyphs.length, 32);
      const sigs = glyphs.map((g) => g.sig);
      assert.equal(new Set(sigs).size, 32, `${style}, seed ${seed}`);
      for (const g of glyphs) {
        assert.ok(g.d.length > 0, "у знака есть черты");
        assert.doesNotMatch(g.d, /\d\.\d{4,}/, "координаты округлены");
      }
    }
  }
  // руны: любые две различаются хотя бы двумя кусочками черт — и после выравнивания по середине
  for (let seed = 1; seed <= 10; seed++) {
    const glyphs = makeGlyphs(32, "runes", mulberry32(seed));
    for (let i = 0; i < glyphs.length; i++) {
      for (let j = i + 1; j < glyphs.length; j++) {
        const a = new Set(glyphs[i].sig.split("|"));
        const b = new Set(glyphs[j].sig.split("|"));
        const diff = [...a].filter((m) => !b.has(m)).length + [...b].filter((m) => !a.has(m)).length;
        assert.ok(diff >= 2, `seed ${seed}: знаки ${i} и ${j} почти одинаковые`);
      }
    }
  }
  // руна: ствол и от одной до трёх ветвей
  for (const g of makeGlyphs(32, "runes", mulberry32(5))) {
    const strokes = g.d.match(/M/g).length;
    assert.ok(strokes >= 2 && strokes <= 4, `ветвей: ${strokes - 1}`);
  }
  assert.equal(glyphSig({ marks: ["a", "b"] }), "a|b");
});

test("послание читается по ключу", () => {
  const c = generate({ phrase: CULT, style: "sigils", seed: 7 });
  assert.deepEqual(c.words, ["СЕДЬМАЯ", "ЖЕРТВА", "ОТКРОЕТ", "ВРАТА", "БЕЗДНЫ"]);
  assert.deepEqual(decode(c.message, invert(c.letters)), c.words);
  assert.equal(c.text, c.words.join(""));
});

test("обрывки покрывают все буквы фразы без пересечений, обманки — чужие буквы", () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (const fragments of [1, 2, 3, 4, 5, 6]) {
      const c = generate({ phrase: CULT, style: seed % 2 ? "runes" : "sigils", fragments, seed });
      const all = c.fragments.flat();
      assert.equal(new Set(all).size, all.length, "буква попала в два обрывка");
      const real = new Set(c.text);
      for (const ch of real) assert.ok(all.includes(ch), `буквы ${ch} нет ни на одном обрывке`);
      assert.ok(c.decoys.length >= 2 && c.decoys.length <= 4, "обманок 2–4");
      for (const ch of c.decoys) assert.ok(!real.has(ch) && all.includes(ch), `обманка ${ch}`);
      assert.equal(all.length, real.size + c.decoys.length);
      assert.equal(c.fragments.length, fragments);
      const sizes = c.fragments.map((f) => f.length);
      assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, "обрывки примерно поровну");
      for (const f of c.fragments) assert.ok(f.some((ch) => real.has(ch)), "на каждом обрывке есть настоящая буква");
    }
  }
});

test("буквы на обрывке — по алфавиту", () => {
  const c = generate({ phrase: CULT, seed: 3 });
  const abc = lettersOf("ru");
  for (const f of c.fragments) assert.deepEqual(f, [...f].sort((a, b) => abc.indexOf(a) - abc.indexOf(b)));
});

test("детерминизм: одно зерно — один шифр", () => {
  for (const style of STYLES) {
    const a = generate({ phrase: CULT, style, seed: 424242 });
    const b = generate({ phrase: CULT, style, seed: 424242 });
    assert.deepEqual(a, b);
    const c = generate({ phrase: CULT, style, seed: 424243 });
    assert.notDeepEqual(a.letters, c.letters);
  }
  // стиль меняет знаки
  const r = generate({ phrase: CULT, style: "runes", seed: 9 });
  const s = generate({ phrase: CULT, style: "sigils", seed: 9 });
  assert.notEqual(r.glyphs.g1.d, s.glyphs.g1.d);
});

test("ошибки: пустая фраза и слишком длинная", () => {
  assert.deepEqual(generate({ phrase: "" }), { ok: false, error: "empty" });
  assert.deepEqual(generate({ phrase: "  — 42, !" }), { ok: false, error: "empty" });
  const long = generate({ phrase: "а".repeat(MAX_LETTERS + 1) });
  assert.equal(long.ok, false);
  assert.equal(long.error, "tooLong");
  assert.ok(generate({ phrase: "а".repeat(MAX_LETTERS) }).ok);
});

test("слова: пробелы, дефисы и знаки рвут слово, апостроф — нет; Ё — как Е", () => {
  assert.deepEqual(parseWords("Ёж, кто-то   здесь!").words, ["ЕЖ", "КТО", "ТО", "ЗДЕСЬ"]);
  const en = parseWords("Don't open the gate");
  assert.equal(en.alphabet, "en");
  assert.deepEqual(en.words, ["DONT", "OPEN", "THE", "GATE"]);
  assert.deepEqual(parseWords("Врата 7 и X").dropped.sort(), ["7", "X"]);
});

test("без пробелов послание — одна сплошная строка", () => {
  const c = generate({ phrase: CULT, spaces: false, seed: 1 });
  assert.equal(c.message.length, 1);
  assert.equal(c.message[0].length, c.text.length);
  assert.equal(c.spaces, false);
});

test("английская фраза — английский алфавит из 26 знаков", () => {
  const c = generate({ phrase: "The seventh offering opens the abyss", seed: 11 });
  assert.equal(c.alphabet, "en");
  assert.equal(Object.keys(c.letters).length, 26);
  assert.deepEqual(decode(c.message, invert(c.letters)), ["THE", "SEVENTH", "OFFERING", "OPENS", "THE", "ABYSS"]);
});

test("обрывков не больше, чем разных букв, и в границах 1–6", () => {
  const one = generate({ phrase: "ааа а", fragments: 6, seed: 2 });
  assert.equal(one.fragments.length, 1);
  assert.equal(one.wanted, 6);
  assert.equal(generate({ phrase: CULT, fragments: 99, seed: 2 }).fragments.length, FRAGMENTS.max);
  assert.equal(generate({ phrase: CULT, fragments: 0, seed: 2 }).fragments.length, FRAGMENTS.min);
  assert.equal(generate({ phrase: CULT, fragments: "x", seed: 2 }).fragments.length, FRAGMENTS.def);
});

test("splitKey режет поровну и ничего не теряет", () => {
  const rng = mulberry32(1);
  const parts = splitKey([..."АБВГДЕЖ"], ["Ш", "Щ"], 4, rng);
  assert.equal(parts.length, 4);
  assert.deepEqual(parts.flat().sort(), [..."АБВГДЕЖШЩ"].sort());
  const sizes = parts.map((p) => p.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
});

test("частоты: частые знаки первыми, при равенстве — по первому появлению", () => {
  assert.deepEqual(frequency([["a", "b"], ["b", "c", "a", "b"]]), [["b", 3], ["a", 2], ["c", 1]]);
});

test("игроку уходят только пары его обрывков, без ответа", () => {
  const p = { ...runes.defaults(), ...runes.demo() };
  const { cipher } = runes.build(p);
  const puzzle = { ...p, cipher };
  const cyr = (v) => new Set(JSON.stringify(v).match(/[А-ЯЁ]/g) ?? []);

  const msg = runes.view(puzzle, { message: true });
  assert.equal(cyr(msg).size, 0, "в послании нет ни одной буквы");
  assert.equal(msg.seed, undefined, "зерно игроку не уходит — по нему восстановился бы ключ");
  assert.deepEqual(new Set(Object.keys(msg.glyphs)), new Set(cipher.message.flat()));

  const two = runes.view(puzzle, { message: true, key2: true });
  assert.deepEqual(cyr(two), new Set(cipher.fragments[1]));
  assert.deepEqual(two.frags.map((f) => f.n), [2]);
  for (const [g, ch] of two.frags[0].pairs) assert.equal(cipher.letters[ch], g);

  const key = runes.view(puzzle, { key3: true });
  assert.equal(key.message, undefined);
  assert.deepEqual(Object.keys(key.glyphs).sort(), cipher.fragments[2].map((ch) => cipher.letters[ch]).sort());

  assert.deepEqual(runes.parts(puzzle).map((x) => x.id), ["message", "key1", "key2", "key3"]);
});
