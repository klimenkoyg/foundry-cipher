import assert from "node:assert/strict";
import { test } from "node:test";

import { autoFaces, columnsFor, FACES, generate, isTail, MAX_LETTERS, placeOf, read, wind, WIND } from "../scripts/core/scytale.mjs";

const ORDER = "Гарнизон уходит к перевалу на рассвете. Ворота открыть";
const ORDER_TEXT = "ГАРНИЗОНУХОДИТКПЕРЕВАЛУНАРАССВЕТЕВОРОТАОТКРЫТЬ";

test("намотка на жезл нужной толщины даёт фразу, в конце — пустышки", () => {
  for (const faces of [3, 5, 6, 7, 12]) {
    const c = generate({ phrase: ORDER, faces, seed: 7 });
    assert.equal(c.ok, true);
    assert.equal(c.text, ORDER_TEXT);
    const got = read(c.ribbon, faces);
    assert.equal(got.length, c.ribbon.length);
    assert.ok(got.startsWith(ORDER_TEXT), `${faces}: ${got}`);
    assert.equal(got.length - ORDER_TEXT.length, c.tail);
    assert.deepEqual(wind(c.ribbon, faces), c.grid);
  }
});

test("любая другая толщина фразы не даёт", () => {
  const c = generate({ phrase: ORDER, seed: 3 });
  for (let n = WIND.min; n <= WIND.max; n++) {
    if (n === c.faces) continue;
    assert.ok(!read(c.ribbon, n).startsWith(ORDER_TEXT.slice(0, 8)), `толщина ${n}`);
  }
});

test("лента — те же буквы, что в сетке, только по столбцам", () => {
  const c = generate({ phrase: ORDER, faces: 6, seed: 11 });
  assert.equal(c.cols, 8);
  assert.equal(c.ribbon.length, 6 * 8);
  assert.equal(c.tail, 48 - ORDER_TEXT.length);
  for (let k = 0; k < c.ribbon.length; k++) {
    const { row, turn } = placeOf(k, 6);
    assert.equal(c.ribbon[k], c.grid[row][turn]);
  }
  assert.equal(c.grid.join("").slice(0, ORDER_TEXT.length), ORDER_TEXT);
  assert.notEqual(c.ribbon.slice(0, ORDER_TEXT.length), ORDER_TEXT);
});

test("пустышки на ленте отмечены верно", () => {
  const c = generate({ phrase: ORDER, faces: 5, seed: 2 });
  const tail = [...c.ribbon].map((ch, k) => isTail(k, c));
  assert.equal(tail.filter(Boolean).length, c.tail);
  // в намотке пустышки — последние буквы последней грани
  const marks = wind(tail.map((x) => (x ? "1" : "0")).join(""), c.faces).join("");
  assert.equal(marks, "0".repeat(ORDER_TEXT.length) + "1".repeat(c.tail));
});

test("одно зерно — один шифр, другое зерно меняет пустышки", () => {
  const a = generate({ phrase: ORDER, faces: 7, seed: 42 });
  const b = generate({ phrase: ORDER, faces: 7, seed: 42 });
  assert.deepEqual(a, b);
  const others = new Set();
  for (let seed = 1; seed <= 20; seed++) others.add(generate({ phrase: ORDER, faces: 7, seed }).ribbon);
  assert.ok(others.size > 1);
  for (const r of others) assert.ok(read(r, 7).startsWith(ORDER_TEXT));
});

test("толщина по длине фразы — корень, в границах", () => {
  assert.equal(autoFaces(ORDER_TEXT.length), 7);
  assert.equal(autoFaces(4), FACES.min);
  assert.equal(autoFaces(170), FACES.max);
  const c = generate({ phrase: ORDER });
  assert.equal(c.auto, true);
  assert.equal(c.faces, 7);
  assert.equal(generate({ phrase: ORDER, faces: 40 }).faces, FACES.max);
  assert.equal(generate({ phrase: ORDER, faces: 1 }).faces, FACES.min);
});

test("короткая фраза: столбцов не меньше двух", () => {
  assert.equal(columnsFor(3, 3), 2);
  const c = generate({ phrase: "Да", faces: 4, seed: 5 });
  assert.equal(c.ok, true);
  assert.equal(c.cols, 2);
  assert.equal(c.ribbon.length, 8);
  assert.ok(read(c.ribbon, 4).startsWith("ДА"));
});

test("неровная намотка: грани отличаются не больше чем на букву", () => {
  const c = generate({ phrase: ORDER, faces: 7, seed: 1 });
  for (let n = WIND.min; n <= WIND.max; n++) {
    const lens = wind(c.ribbon, n).map((r) => r.length);
    assert.ok(Math.max(...lens) - Math.min(...lens) <= 1, `толщина ${n}`);
  }
});

test("пустая и слишком длинная фраза — ошибки", () => {
  assert.equal(generate({ phrase: " ,.!" }).error, "empty");
  const long = generate({ phrase: "А".repeat(MAX_LETTERS + 1) });
  assert.equal(long.error, "tooLong");
  assert.equal(long.max, MAX_LETTERS);
  assert.equal(generate({ phrase: "А".repeat(MAX_LETTERS) }).ok, true);
});

test("английская фраза и Ё", () => {
  const en = generate({ phrase: "Open the gate at dawn", seed: 9 });
  assert.equal(en.alphabet, "en");
  assert.ok(read(en.ribbon, en.faces).startsWith("OPENTHEGATEATDAWN"));
  assert.equal(generate({ phrase: "Ёж", yo: true }).text, "ЕЖ");
  assert.equal(generate({ phrase: "Ёж", yo: false }).text, "ЁЖ");
});
