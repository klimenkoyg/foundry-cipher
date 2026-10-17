import assert from "node:assert/strict";
import { test } from "node:test";

import { normalize } from "../scripts/core/alphabet.mjs";
import { mulberry32 } from "../scripts/core/rng.mjs";
import { autoWidth, cellsOfSlots, generate, layout, letterCells, readCells, slotsOf, spread, WIDTH } from "../scripts/core/stencil.mjs";
import stencil from "../scripts/foundry/kinds/stencil.mjs";

/* Письмо подлиннее: фраза короткая, есть где разбросать буквы. */
const LONG = [
  "Дорогая тётушка Марфа!",
  "Пишу вам с ярмарки в Заречье. Урожай нынче славный: яблоки крупные, капуста тугая, а тыквы такие, что вдвоём не поднять. Мёд продали до последней кадушки, на выручку купили новый котёл и красную шаль для сестрицы.",
  "Погода стоит тёплая, по утрам туман над рекой, к обеду солнце. Дядюшка кланяется и обещает приехать к зиме, если дороги не развезёт.",
  "Ваш любящий племянник Тим",
].join("\n");

/** Буквы, видные в клетках, — как фраза (заглавные, Ё как Е). */
const readAs = (res) => normalize(readCells(res.lines, res.width, res.cells), { yo: true }).text;

test("фраза читается из выбранных клеток по порядку", () => {
  for (const phrase of ["Замок падёт на рассвете", "Жди у реки", "Беги", "Тайник в саду"]) {
    for (const seed of [1, 7, 42, 20261017]) {
      const res = generate({ cover: LONG, phrase, seed });
      assert.ok(res.ok, `${phrase}: ${JSON.stringify(res)}`);
      assert.equal(res.cells.length, res.text.length);
      assert.equal(readAs(res), res.text);
    }
  }
});

test("клетки возрастают и стоят на буквах письма", () => {
  const res = generate({ cover: LONG, phrase: "Замок падёт на рассвете", seed: 3 });
  for (let k = 1; k < res.cells.length; k++) assert.ok(res.cells[k] > res.cells[k - 1]);
  for (const i of res.cells) assert.match(readCells(res.lines, res.width, [i]), /\p{L}/u);
});

test("буквы разбросаны по всему письму, первая — не всегда в начале", () => {
  const width = autoWidth(LONG);
  const firstA = letterCells(layout(LONG, width), width).find((x) => x.key === "А").i;
  const firsts = new Set();
  for (let seed = 1; seed <= 20; seed++) {
    const res = generate({ cover: LONG, phrase: "Ау", seed });
    firsts.add(res.cells[0]);
    // Первая буква — в первой половине письма, последняя — во второй.
    const total = res.rows * res.width;
    assert.ok(res.cells[0] < total / 2, `seed ${seed}: первая буква слишком далеко`);
    assert.ok(res.cells.at(-1) > total / 2, `seed ${seed}: последняя буква слишком близко`);
  }
  assert.ok(!firsts.has(firstA) || firsts.size > 1, "первая буква всегда на первом же вхождении");
  assert.ok(firsts.size > 1, "сдвиг от seed не меняет выбор");
  // Длинная фраза тоже растягивается на всё письмо, а не жмётся к началу.
  for (let seed = 1; seed <= 5; seed++) {
    const res = generate({ cover: LONG, phrase: "Замок падёт на рассвете", seed });
    assert.ok(Math.floor(res.cells.at(-1) / res.width) >= res.rows - 2);
    const gaps = res.cells.slice(1).map((c, k) => c - res.cells[k]);
    assert.ok(gaps.filter((g) => g === 1).length <= 3, `seed ${seed}: слишком много букв подряд`);
  }
});

test("равномерность: окно поиска не даёт потерять остаток фразы", () => {
  // Буквы фразы есть только в самом конце — выбор обязан туда дотянуться.
  const letters = [..."ААААААААААББББВ"].map((key) => ({ key }));
  for (let seed = 1; seed <= 10; seed++) {
    const { picks } = spread(letters, "АБВ", mulberry32(seed));
    assert.equal(picks.length, 3);
    assert.equal(letters[picks[2]].key, "В");
    assert.ok(picks[0] < picks[1] && picks[1] < picks[2]);
  }
});

test("не хватает буквы — сказано какой и после чего", () => {
  const res = generate({ cover: "Дорогой мой, у нас всё хорошо.", phrase: "Дом у реки", seed: 1 });
  assert.equal(res.ok, false);
  assert.equal(res.error, "missing");
  assert.equal(res.letter, "Е");
  assert.equal(res.after, "Дом у р");
  assert.equal(res.found, 5);
  const first = generate({ cover: "Привет", phrase: "Замок", seed: 1 });
  assert.deepEqual([first.error, first.letter, first.after, first.found], ["missing", "З", "", 0]);
});

test("пустое письмо и пустая фраза", () => {
  assert.equal(generate({ cover: "  \n ", phrase: "Замок" }).error, "noCover");
  assert.equal(generate({ cover: LONG, phrase: " 123 " }).error, "noPhrase");
});

test("один seed — тот же шифр; другой seed — бывает другой", () => {
  const a = generate({ cover: LONG, phrase: "Замок падёт на рассвете", seed: 11 });
  const b = generate({ cover: LONG, phrase: "Замок падёт на рассвете", seed: 11 });
  assert.deepEqual(a, b);
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) seen.add(generate({ cover: LONG, phrase: "Замок падёт на рассвете", seed }).cells.join(","));
  assert.ok(seen.size > 1);
});

test("раскладка: перенос по словам, абзацы, длинное слово рубится", () => {
  const lines = layout("Раз два три четыре пять\n\n\nшесть", 10);
  assert.deepEqual(lines, ["Раз два", "три четыре", "пять", "", "шесть"]);
  assert.deepEqual(layout("Превысокомногорассмотрительствующий", 20), ["Превысокомногорассмо", "трительствующий"]);
  for (const line of layout(LONG, 34)) assert.ok([...line].length <= 34);
  assert.equal(autoWidth("коротко"), WIDTH.default);
  assert.ok(autoWidth("слово ".repeat(800)) <= WIDTH.max);
  const res = generate({ cover: LONG, phrase: "Беги", width: 5 });
  assert.equal(res.width, WIDTH.min);
});

test("Ё как Е: по желанию", () => {
  assert.ok(generate({ cover: "Ёлка", phrase: "Ел", yo: true }).ok);
  assert.equal(generate({ cover: "Ёлка", phrase: "Ел", yo: false }).error, "missing");
  assert.ok(generate({ cover: "Ёлка", phrase: "Ёл", yo: false }).ok);
});

test("окошки: соседние клетки строки сливаются в прорезь", () => {
  assert.deepEqual(slotsOf([3, 4, 5, 9, 10, 11, 12], 10), [[0, 3, 3], [0, 9, 1], [1, 0, 3]]);
  assert.deepEqual(cellsOfSlots([[0, 3, 3], [0, 9, 1], [1, 0, 3]], 10), [3, 4, 5, 9, 10, 11, 12]);
});

test("пример из мастерской собирается и читается", () => {
  const demo = { ...stencil.defaults(), ...stencil.demo() };
  const res = generate({ cover: demo.cover, phrase: demo.phrase, width: demo.width, seed: demo.seed, yo: demo.yo });
  assert.ok(res.ok, JSON.stringify(res));
  assert.equal(readAs(res), normalize(demo.phrase).text);
  assert.ok(res.rows >= 6 && res.rows <= 9, `строк: ${res.rows}`);
});
