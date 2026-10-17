import assert from "node:assert/strict";
import { test } from "node:test";

import {
  blankHeat,
  CELL,
  clean,
  COLS,
  decodeHeat,
  encodeHeat,
  hiddenCells,
  layout,
  LEVELS,
  levelOf,
  LIMITS,
  mergeHeat,
  PER,
  perLine,
  revealedHeat,
  share,
  SHEET_W,
  THRESH,
  warm,
  warmPath,
  wrapText,
} from "../scripts/core/ink.mjs";

const LETTER = [
  "Пишу тебе с оказией, пока обоз не ушёл. Будь добра, пришли к празднику серой шерсти потолще и горшочек липового мёда — здешний горчит.",
  "У нас всё по-старому: мельник опять бранится с кузнецом из-за межи, а вдова Агна выдаёт дочку за сына пекаря.",
  "Кланяйся дяде и не хворай.",
].join("\n");
const SECRET = "Казначей продал нас. Встреча в часовне в полночь.";

test("пробелы и пустые строки чистятся, абзацы остаются", () => {
  assert.equal(clean("  Привет,\r\n\r\n\r\n\r\n  как   ты?  "), "Привет,\n\nкак ты?");
  assert.equal(clean(null), "");
});

test("строки по словам не длиннее заданного, слова не теряются", () => {
  const lines = wrapText(LETTER, 30);
  for (const line of lines) assert.ok([...line].length <= 30, line);
  assert.equal(lines.join(" ").replace(/\s+/g, " "), clean(LETTER).replace(/\n/g, " "));
  // абзац — с новой строки
  assert.ok(lines.includes("Кланяйся дяде и не хворай."));
  // слово длиннее строки режется
  assert.deepEqual(wrapText("ааааааааааа бб", 4), ["аааа", "аааа", "ааа", "бб"]);
  assert.deepEqual(wrapText("раз\n\nдва", 10), ["раз", "", "два"]);
});

test("знаков в строке — по длине письма: лист по возможности не выше заданного", () => {
  assert.equal(perLine("Беги."), PER.min);
  assert.equal(perLine("слово ".repeat(300)), PER.max);
  assert.ok(perLine(LETTER + LETTER, SECRET) > perLine(LETTER, SECRET));
  const L = layout({ visible: LETTER, hidden: SECRET, seed: 1 });
  assert.ok(L.h <= L.w * 1.4, `${L.w}×${L.h}`);
  // лист той же высоты при любом зерне
  for (let seed = 2; seed < 10; seed++) assert.equal(layout({ visible: LETTER, hidden: SECRET, seed }).h, L.h);
});

test("скрытые строки — в просветах под видимыми, по порядку", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const L = layout({ visible: LETTER, hidden: SECRET, seed });
    assert.ok(L.ok);
    assert.equal(L.w, SHEET_W);
    assert.equal(L.cols, COLS);
    assert.equal(L.h, L.rows * CELL);
    assert.ok(L.h >= L.w, "лист не ниже, чем шире");
    assert.equal(L.text, SECRET);
    assert.equal(L.hidden.length, L.gaps.length);
    // просветы разные и по порядку; каждая скрытая строка — между своей видимой и следующей
    for (let i = 1; i < L.gaps.length; i++) assert.ok(L.gaps[i] > L.gaps[i - 1]);
    L.hidden.forEach((h, i) => {
      assert.equal(h.gap, L.gaps[i]);
      assert.ok(h.y > L.lines[h.gap].y);
      if (L.lines[h.gap + 1]) assert.ok(h.y < L.lines[h.gap + 1].y);
      assert.ok(Math.abs(h.rot) <= 0.7);
    });
    // всё помещается на листе, подпись — ниже текста
    assert.ok(L.footY > L.lines.at(-1).y);
    assert.ok(L.footY < L.h);
  }
});

test("скрытого больше, чем просветов, — остаток в конце письма", () => {
  const hidden = "Сожги это письмо сразу. ".repeat(10);
  const L = layout({ visible: "Привет. Всё хорошо, урожай собрали.", hidden, seed: 3 });
  assert.ok(L.ok);
  assert.equal(L.lines.length, 2);
  assert.deepEqual(L.gaps, [0, 1]);
  const tail = L.hidden.filter((h) => h.gap === -1);
  assert.equal(tail.length, L.hidden.length - 2);
  for (const h of tail) assert.ok(h.y > L.lines.at(-1).y);
  // в конце — подряд, сверху вниз
  for (let i = 1; i < L.hidden.length; i++) assert.ok(L.hidden[i].y > L.hidden[i - 1].y);
  assert.ok(L.footY > L.hidden.at(-1).y);
  assert.ok(L.footY < L.h);
  assert.equal(L.text.split(" ").length, clean(hidden).split(" ").length);
});

test("один и тот же seed — та же раскладка, другой — другие просветы", () => {
  const a = layout({ visible: LETTER, hidden: SECRET, seed: 42 });
  const b = layout({ visible: LETTER, hidden: SECRET, seed: 42 });
  assert.deepEqual(a, b);
  const seen = new Set();
  for (let seed = 1; seed <= 20; seed++) seen.add(layout({ visible: LETTER, hidden: SECRET, seed }).gaps.join(","));
  assert.ok(seen.size > 3);
});

test("ошибки: пусто, без тайнописи, слишком длинно", () => {
  assert.equal(layout({ visible: "  ", hidden: "x" }).error, "empty");
  assert.equal(layout({ visible: "Привет", hidden: " \n " }).error, "noHidden");
  assert.equal(layout({ visible: "а".repeat(LIMITS.visible + 1), hidden: "x" }).error, "tooLong");
  const long = layout({ visible: "Привет", hidden: "б".repeat(LIMITS.hidden + 5) });
  assert.equal(long.error, "hiddenTooLong");
  assert.equal(long.length, LIMITS.hidden + 5);
});

test("прогрев: в центре сильнее, чем с краю, уровень не выше трёх", () => {
  const map = blankHeat(24, 32);
  const changed = warm(map, 12, 12, 2, 1);
  assert.ok(changed.length > 0);
  const center = 11 * 24 + 11;
  const edge = 11 * 24 + 13;
  assert.ok(map.acc[center] > map.acc[edge]);
  assert.equal(map.lv[0], 0);
  for (let k = 0; k < 50; k++) warm(map, 12, 12, 2, 1);
  assert.equal(map.lv[center], LEVELS);
  assert.equal(Math.max(...map.lv), LEVELS);
  assert.equal(levelOf(0), 0);
  assert.equal(levelOf(THRESH[0]), 1);
  assert.equal(levelOf(99), LEVELS);
});

test("прогрев по пути: быстрый взмах греет слабее, чем задержка на месте", () => {
  const still = blankHeat(24, 32);
  warmPath(still, 5, 10, 5, 10, 1.7, 1);
  const sweep = blankHeat(24, 32);
  const changed = warmPath(sweep, 1, 10, 22, 10, 1.7, 1);
  const total = (m) => m.acc.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total(still) - total(sweep)) / total(still) < 0.2, "тепло то же");
  assert.ok(Math.max(...sweep.acc) < Math.max(...still.acc));
  // клетки по всему пути задеты, каждая — один раз
  assert.equal(new Set(changed.map(([i]) => i)).size, changed.length);
  assert.ok(sweep.acc[9 * 24 + 2] > 0 && sweep.acc[9 * 24 + 20] > 0);
});

test("карта прогрева: строка туда и обратно, чужая сетка — холодный лист", () => {
  const map = blankHeat(24, 32);
  assert.equal(encodeHeat(map), "");
  warm(map, 3, 4, 2.5, 3);
  warm(map, 20, 30, 1.5, 0.5);
  const str = encodeHeat(map);
  assert.match(str, /^24x32:[A-Za-z0-9+/=]+$/);
  assert.ok(str.length < 280, "компактно");
  const back = decodeHeat(str, 24, 32);
  assert.deepEqual([...back.lv], [...map.lv]);
  // после загрузки тепло продолжает копиться с порога своего уровня
  back.lv.forEach((lv, i) => assert.equal(levelOf(back.acc[i]), lv));
  assert.ok(!decodeHeat(str, 24, 30).lv.some(Boolean));
  assert.ok(!decodeHeat("мусор", 24, 32).lv.some(Boolean));
  assert.ok(!decodeHeat(undefined, 24, 32).lv.some(Boolean));
});

test("слияние карт: в клетке — больший уровень, видно, у кого горячее", () => {
  const a = blankHeat(24, 32);
  const b = blankHeat(24, 32);
  warm(a, 4, 4, 2, 5);
  warm(b, 18, 20, 2, 5);
  const { changed, ahead } = mergeHeat(a, b);
  assert.ok(changed.length > 0);
  assert.ok(ahead > 0);
  for (let i = 0; i < a.lv.length; i++) assert.ok(a.lv[i] >= b.lv[i]);
  // теперь b — отстаёт, a — ровно столько же, сколько сумма
  const again = mergeHeat(b, a);
  assert.equal(again.ahead, 0);
  assert.deepEqual([...b.lv], [...a.lv]);
  assert.deepEqual(mergeHeat(a, b), { changed: [], ahead: 0 });
});

test("доля проявленного: по всему листу и по клеткам скрытых строк", () => {
  const L = layout({ visible: LETTER, hidden: SECRET, seed: 5 });
  const cells = hiddenCells(L);
  assert.ok(cells.length > 0);
  const map = blankHeat(L.cols, L.rows);
  assert.equal(share(map), 0);
  assert.equal(share(map, cells), 0);
  for (const i of cells) map.lv[i] = 2;
  assert.equal(share(map, cells), 1);
  assert.equal(share(map, cells, 3), 0);
  assert.ok(share(map) > 0 && share(map) < 0.5);
  // «всё проявлено» — прогреты все клетки под скрытыми строками и немного вокруг
  const full = revealedHeat(L);
  assert.equal(share(full, cells, LEVELS), 1);
  assert.ok(share(full) > share(full, null, LEVELS));
});
