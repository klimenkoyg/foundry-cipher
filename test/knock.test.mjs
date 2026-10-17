import assert from "node:assert/strict";
import { test } from "node:test";

import { decode, duration, encode, formatDots, letterAt, MAX_LETTERS, parseDots, placeOf, schedule, SPEEDS, TABLES } from "../scripts/core/knock.mjs";

test("таблицы: русская — 5 рядов по 6, английская — 5×5, буквы не повторяются", () => {
  for (const [id, rows, cols] of [["ru", 5, 6], ["en", 5, 5]]) {
    const tab = TABLES[id];
    assert.equal(tab.rows.length, rows);
    for (const row of tab.rows) assert.equal([...row].length, cols);
    const all = tab.rows.join("");
    assert.equal(new Set(all).size, all.length);
    for (const [from, to] of Object.entries(tab.swaps)) {
      assert.ok(!all.includes(from), `${from} не в таблице`);
      assert.ok(all.includes(to), `${to} в таблице`);
    }
  }
  assert.deepEqual(placeOf("ru", "А"), [1, 1]);
  assert.deepEqual(placeOf("ru", "Я"), [5, 6]);
  assert.deepEqual(placeOf("ru", "О"), [3, 2]);
  assert.deepEqual(placeOf("en", "Z"), [5, 5]);
  assert.equal(letterAt("ru", 2, 3), "И");
  assert.equal(letterAt("en", 3, 1), "L");
});

test("весть туда и обратно: точки → пары → те же слова", () => {
  const res = encode("Завтра побег. Жди!");
  assert.equal(res.alphabet, "ru");
  assert.equal(res.text, "ЗАВТРА ПОБЕГ ЖДИ");
  assert.equal(res.words.length, 3);
  const line = formatDots(res.words);
  assert.equal(line.split(" | ").length, 3);
  assert.deepEqual(parseDots(line), res.words);
  assert.equal(decode(parseDots(line), res.alphabet), res.text);
  // З — 2-й ряд, 2-е место; А — 1, 1
  assert.ok(line.startsWith("·· ·· / · · / "));
});

test("английская весть туда и обратно", () => {
  const res = encode("Meet me at the old well, midnight.");
  assert.equal(res.alphabet, "en");
  assert.equal(res.text, "MEET ME AT THE OLD WELL MIDNIGHT");
  assert.equal(decode(parseDots(formatDots(res.words)), "en"), res.text);
});

test("замены: Ё → Е, Й → И, Ъ → Ь; K → C", () => {
  const ru = encode("Ёжик, подъезд и мой");
  assert.equal(ru.text, "ЕЖИК ПОДЬЕЗД И МОИ");
  assert.deepEqual(ru.swaps, [["Ё", "Е"], ["Й", "И"], ["Ъ", "Ь"]]);
  assert.deepEqual(placeOf("ru", "Й"), placeOf("ru", "И"));
  const en = encode("Kick the lock");
  assert.equal(en.text, "CICC THE LOCC");
  assert.deepEqual(en.swaps, [["K", "C"]]);
  assert.deepEqual(encode("Побег").swaps, []);
});

test("знаки, цифры и чужие буквы выбрасываются, слова не теряются", () => {
  const res = encode("  В 3 часа — у окна (стража спит)!  ");
  assert.equal(res.text, "В ЧАСА У ОКНА СТРАЖА СПИТ");
  assert.deepEqual(res.dropped, ["3"]);
  const mixed = encode("Камера 12B");
  assert.equal(mixed.text, "КАМЕРА");
  assert.deepEqual(mixed.dropped.sort(), ["1", "2", "B"].sort());
  assert.deepEqual(encode("!!! 42").words, []);
});

test("разбор записи терпит разные точки и лишние пробелы", () => {
  assert.deepEqual(parseDots("••• ••  /  · ·|.. ...."), [[[3, 2], [1, 1]], [[2, 4]]]);
  assert.deepEqual(parseDots(""), []);
});

test("расписание монотонно, а паузы различимы на слух", () => {
  const { words } = encode("Завтра побег. Жди!");
  for (const speed of Object.keys(SPEEDS)) {
    for (const seed of [null, 1, 2, 3, 4, 5, 20261017]) {
      const { hits, starts, total } = schedule(words, { speed, seed });
      assert.equal(hits.length, words.flat(2).reduce((a, b) => a + b, 0));
      assert.equal(starts.length, words.flat().length);
      const gaps = { beat: [], group: [], letter: [], word: [] };
      for (let i = 1; i < hits.length; i++) {
        const [a, b] = [hits[i - 1], hits[i]];
        assert.ok(b.t > a.t, `удары по порядку (${speed}, ${seed})`);
        const kind = b.w !== a.w ? "word" : b.l !== a.l ? "letter" : b.g !== a.g ? "group" : "beat";
        gaps[kind].push(b.t - a.t);
      }
      assert.ok(total > hits.at(-1).t);
      // самая длинная пауза одного рода короче самой короткой следующего
      const order = ["beat", "group", "letter", "word"];
      for (let i = 1; i < order.length; i++) {
        assert.ok(Math.max(...gaps[order[i - 1]]) * 1.5 < Math.min(...gaps[order[i]]), `${order[i - 1]} < ${order[i]} (${speed})`);
      }
      // каждая буква — сначала серия ряда, потом серия места
      starts.forEach((s, l) => {
        assert.equal(hits[s].l, l);
        assert.equal(hits[s].g, 0);
        assert.equal(hits[s].n, 1);
      });
    }
  }
});

test("одно зерно — один ритм; быстрее — короче", () => {
  const { words } = encode("Ключ под миской");
  assert.deepEqual(schedule(words, { seed: 7 }), schedule(words, { seed: 7 }));
  assert.notDeepEqual(schedule(words, { seed: 7 }).hits, schedule(words, { seed: 8 }).hits);
  assert.ok(duration(words, "fast") < duration(words, "normal"));
  assert.ok(duration(words, "normal") < duration(words, "slow"));
  assert.equal(schedule([], {}).total, 0);
});

test("граница длины задана", () => {
  assert.ok(MAX_LETTERS >= 100);
});
