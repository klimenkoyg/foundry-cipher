import assert from "node:assert/strict";
import { test } from "node:test";

import { normalize } from "../scripts/core/alphabet.mjs";
import {
  autoSize,
  capacity,
  cellCount,
  decode,
  formatSteps,
  generate,
  holeCount,
  holesAt,
  maxLetters,
  orbits,
  orientations,
  parseSteps,
  stepCells,
} from "../scripts/core/grille.mjs";

/* Письмо Лариэля из первого макета: сетка, пластина и код ведущего. */
const ARCHMAGE = {
  n: 12,
  grid: ["БТВМУИОНЖИСС", "ЛЛЙОООЕДОТВВ", "УЕОЦППУСНПРР", "ТОИСАИВВВТДЧ", "ИАОЕМАЙНРНМЕ", "ЫКЕХНЯВИЗМПИ", "ИААНЙООВДЯГА", "ДРПАИВТОТПОО", "ОНКММЕПОЕРЛО", "УЛИРИПЕЧОАВА", "ПЛОЕРЬПЛЕРЛО", "СМКАГНРОЕННО"],
  holes: [[0, 8], [0, 9], [0, 11], [1, 0], [1, 5], [1, 10], [2, 1], [2, 3], [2, 8], [3, 4], [3, 7], [3, 10], [4, 2], [4, 6], [4, 7], [5, 2], [5, 6], [5, 11], [6, 2], [6, 4], [6, 8], [7, 0], [7, 1], [7, 11], [8, 0], [8, 3], [8, 6], [9, 1], [9, 7], [9, 9], [10, 3], [10, 4], [10, 5], [11, 5], [11, 9], [11, 10]],
};
const ARCHMAGE_CODE = "1 →2 · 2 ←1 · 3 →3 · 4 ←2 · 5 →1 · 6 →1 · 7 ←3 · 8 →2 · 9 ←1 · 10 →2 · 11 ←2 · 12 →1";

/** Каждая клетка открывается ровно в одном положении пластины. */
function assertCoversOnce({ n, holes }) {
  const seen = new Map();
  for (let k = 0; k < 4; k++) for (const [r, c] of holesAt(holes, n, k)) seen.set(r * n + c, (seen.get(r * n + c) ?? 0) + 1);
  const expected = n % 2 ? n * n - 1 : n * n;
  assert.equal(seen.size, expected);
  for (const v of seen.values()) assert.equal(v, 1);
}

test("письмо Архимага читается по коду из макета", () => {
  const steps = parseSteps(ARCHMAGE_CODE);
  assert.equal(steps.length, 12);
  assert.equal(formatSteps(steps), ARCHMAGE_CODE);
  assert.equal(decode(ARCHMAGE, steps), "ТВОЙОТЕЦНИВЧЕМНЕВИНОВАТОНМОЛЧАЛПОМОЕ");
  assertCoversOnce(ARCHMAGE);
});

test("письмо Архимага целиком: код идёт по кругу четыре раза", () => {
  const steps = parseSteps(ARCHMAGE_CODE);
  assert.equal(
    decode(ARCHMAGE, steps, 4),
    "ТВОЙОТЕЦНИВЧЕМНЕВИНОВАТОНМОЛЧАЛПОМОЕ" +
      "МУСЛОВУПРОСТИМЕНЯЗАЙДИВПЕРОИПЕПЕЛСКА" +
      "ЖИСЛОВОПРАВДААРХИМАГАПОТОМПРОВЕРЬГРО" +
      "БИНЕДОПУСТИВОЙНЫ" +
      "КПИОЯДРОКЕЛУИАОЛРННН",
  );
});

test("четвёрки клеток покрывают квадрат, центр нечётного — без окошка", () => {
  for (let n = 4; n <= 16; n++) {
    const orbs = orbits(n);
    assert.equal(orbs.length, holeCount(n));
    assert.equal(new Set(orbs.flat().map(([r, c]) => r * n + c)).size, orbs.length * 4);
  }
});

test("фраза приводится к буквам одного алфавита", () => {
  assert.deepEqual(normalize("Твой отец — ни в чём не виноват!"), { text: "ТВОЙОТЕЦНИВЧЕМНЕВИНОВАТ", alphabet: "ru", dropped: [] });
  assert.equal(normalize("Ёж", { yo: false }).text, "ЁЖ");
  assert.equal(normalize("Meet me at 9").alphabet, "en");
  assert.deepEqual(normalize("Meet me at 9").dropped, ["9"]);
});

const PHRASES = [
  ["Твой отец ни в чём не виноват. Он молчал по моей", 12],
  ["Ключ под третьим камнем от колодца", 10],
  ["Пустая чаша вмещает всё", 10],
  ["The key lies beneath the old well", 9],
  ["Сокровище спрятано в склепе за алтарём, ищи знак змеи на третьей плите слева от входа", 16],
  ["Беги", 6],
  ["Не верь стражу", 6],
];

test("собранный шифр читается обратно по своему коду", () => {
  for (const [phrase, rows] of PHRASES) {
    for (let seed = 1; seed <= 12; seed++) {
      for (const dirs of ["mixed", "cw"]) {
        const res = generate({ phrase, rows, seed, dirs });
        assert.ok(res.ok, `${phrase} / ${rows} / ${seed}: ${res.error}`);
        assert.equal(res.grid.length, res.n);
        for (const row of res.grid) assert.equal([...row].length, res.n);
        assert.equal(res.holes.length, holeCount(res.n));
        assertCoversOnce(res);
        assert.equal(decode(res, res.steps), normalize(phrase).text);
        // соседние строки — всегда другой поворот; первый шаг — не «на месте»
        for (const s of res.steps) assert.ok(s.turns >= 1 && s.turns <= 3);
        if (dirs === "cw") assert.ok(res.steps.every((s) => s.dir === 1));
      }
    }
  }
});

test("один и тот же seed — тот же шифр", () => {
  const a = generate({ phrase: "Ключ под камнем", rows: 8, seed: 42 });
  const b = generate({ phrase: "Ключ под камнем", rows: 8, seed: 42 });
  const c = generate({ phrase: "Ключ под камнем", rows: 8, seed: 43 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.grid, c.grid);
});

test("36 букв на 12 строк — как в макете: по 3 окошка в строке в каждом положении", () => {
  const phrase = "ТВОЙОТЕЦНИВЧЕМНЕВИНОВАТОНМОЛЧАЛПОМОЕ";
  let even = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const res = generate({ phrase, rows: 12, seed });
    assert.ok(res.ok);
    assert.deepEqual(res.perRow, new Array(12).fill(3));
    const balanced = [0, 1, 2, 3].every((k) => {
      const per = new Array(12).fill(0);
      for (const [r] of holesAt(res.holes, 12, k)) per[r]++;
      return per.every((x) => x === 3);
    });
    if (balanced) even++;
  }
  // по числу огоньков в строке нельзя угадать нужный поворот
  assert.equal(even, 30);
});

test("шаги кода ведут к открытым клеткам своей строки", () => {
  const res = generate({ phrase: "Ключ под третьим камнем от колодца", rows: 10, seed: 7 });
  const ks = orientations(res.steps);
  res.steps.forEach((s, i) => assert.equal(stepCells(res, s, ks[i]).length, res.perRow[s.row]));
});

test("короткая фраза: пустые строки в код не попадают", () => {
  const res = generate({ phrase: "Беги", rows: 8, seed: 3 });
  assert.ok(res.ok);
  assert.equal(res.steps.length, 4);
  assert.equal(decode(res, res.steps), "БЕГИ");
});

const LETTER = "ТВОЙОТЕЦНИВЧЕМНЕВИНОВАТОНМОЛЧАЛПОМОЕМУСЛОВУПРОСТИМЕНЯЗАЙДИВПЕРОИПЕПЕЛСКАЖИСЛОВОПРАВДААРХИМАГАПОТОМПРОВЕРЬГРОБИНЕДОПУСТИВОЙНЫ";

test("длинная фраза — в несколько проходов, код по кругу", () => {
  for (const [phrase, rows] of [[LETTER, 12], [LETTER, 14], [LETTER.slice(0, 70), 9], ["Беги к старой мельнице до рассвета", 6], [LETTER.slice(0, 110), 11]]) {
    for (let seed = 1; seed <= 12; seed++) {
      const res = generate({ phrase, rows, seed });
      assert.ok(res.ok, `${rows} / ${seed}: ${res.error}`);
      const text = normalize(phrase).text;
      assert.ok(res.passes > 1 && res.passes <= 4);
      assert.ok(decode(res, res.steps).startsWith(text));
      assertCoversOnce(res);
      // весь код поворачивает пластину на нечётное число четвертей — четыре прохода читают все клетки по разу
      const read = decode(res, res.steps, 4);
      assert.equal(read.length, cellCount(res.n));
      assert.ok(read.startsWith(text));
    }
  }
});

test("124 буквы на 12 строк — четыре прохода по 36, как в письме Архимага", () => {
  const res = generate({ phrase: LETTER, rows: 12, seed: 5 });
  assert.equal(res.passes, 4);
  assert.deepEqual(res.perRow, new Array(12).fill(3));
  assert.equal(res.steps.length, 12);
});

test("ошибки: пустая и слишком длинная фраза", () => {
  assert.equal(generate({ phrase: "  — 123 —", rows: 8 }).error, "empty");
  const long = generate({ phrase: "А".repeat(maxLetters(6) + 1), rows: 6 });
  assert.equal(long.error, "tooLong");
  assert.equal(long.max, maxLetters(6));
  assert.ok(generate({ phrase: "А".repeat(capacity(6) + 1), rows: 6 }).ok);
});

test("размер по длине фразы: наименьший квадрат, куда она влезает за четыре прохода", () => {
  assert.equal(autoSize(124), 12);
  assert.equal(autoSize(121), 12); // у 11×11 центр без окошка: 120 клеток
  assert.equal(autoSize(120), 11);
  assert.equal(autoSize(36), 6);
  assert.equal(autoSize(5), 4);
  assert.equal(autoSize(900), 30);
  const res = generate({ phrase: LETTER, seed: 3 });
  assert.ok(res.ok && res.auto);
  assert.equal(res.n, 12);
  assert.equal(res.passes, 4);
  assert.ok(decode(res, res.steps).startsWith(LETTER));
});

test("большие квадраты: длинное письмо на 20–30 строк", () => {
  const long = LETTER.repeat(6); // 744 буквы
  for (const [phrase, rows] of [[long, null], [long.slice(0, 400), 20], [long.slice(0, 150), 24], [long.slice(0, 60), 30]]) {
    const res = generate({ phrase, rows, seed: 2 });
    assert.ok(res.ok, `${rows}: ${res.error}`);
    assertCoversOnce(res);
    assert.ok(decode(res, res.steps).startsWith(normalize(phrase).text));
  }
});
