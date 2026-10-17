/* Поворотная решётка: квадрат n×n с буквами и пластина с окошками поверх.
   Пластину кладут на письмо меткой «I» вверх. Перед каждой строкой её поворачивают по коду
   (→ — по часовой, ← — против, цифра — сколько четвертей), и в окошках этой строки слева
   направо читаются буквы фразы. Каждая клетка письма открывается ровно в одном из четырёх
   положений пластины; буквы строки, которые открываются в других положениях, — пустышки.
   Длинная фраза читается в несколько проходов: дойдя до последней строки, код начинают
   сначала, не возвращая пластину, — и раз весь код поворачивает её на нечётное число
   четвертей, каждый проход открывает новые клетки. Четыре прохода читают всё письмо.
   Размер квадрата по умолчанию — наименьший, в который фраза помещается за четыре прохода.
   Ничего из Foundry — работает и в Node. */

import { fillerPicker, normalize } from "./alphabet.mjs";
import { clamp, mulberry32, pick, randInt } from "./rng.mjs";

export const SIZE = { min: 4, max: 30, default: 12 };

/** Направления поворотов в коде: в обе стороны или только по часовой. */
export const DIRS = ["mixed", "cw"];

const mod4 = (k) => ((k % 4) + 4) % 4;

/** Поворот на четверть по часовой: клетка (r, c) уходит в (c, n-1-r). */
export const turn = ([r, c], n) => [c, n - 1 - r];

export function turnBy(cell, n, k) {
  let p = cell;
  for (let i = 0; i < mod4(k); i++) p = turn(p, n);
  return p;
}

/** Где окошки пластины в положении k (k четвертей по часовой от «I вверху»). */
export const holesAt = (holes, n, k) => holes.map((h) => turnBy(h, n, k));

/** Четвёрки клеток, которые переходят друг в друга при повороте: [c, turn(c), …]. Центр нечётного квадрата — без окошка. */
export function orbits(n) {
  const seen = new Set();
  const out = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (seen.has(r * n + c)) continue;
      const orb = [[r, c]];
      seen.add(r * n + c);
      for (let p = turn([r, c], n); p[0] !== r || p[1] !== c; p = turn(p, n)) {
        orb.push(p);
        seen.add(p[0] * n + p[1]);
      }
      if (orb.length === 4) out.push(orb);
    }
  }
  return out;
}

/** Окошек в пластине: по одному на каждую четвёрку клеток. */
export const holeCount = (n) => Math.floor((n * n) / 4);

/** Сколько клеток письма открывается за четыре прохода — все, кроме центра нечётного квадрата. */
export const cellCount = (n) => holeCount(n) * 4;

/** Сколько букв вообще помещается в письмо из n строк (в несколько проходов). */
export const maxLetters = (n) => cellCount(n);

/** Сколько букв фразы можно положить в одну строку за один проход. Подобрано прогоном генератора:
    гуще пластина почти без перемычек и подбирается долго или не подбирается вовсе. */
const MAX_PER_ROW = { 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 4, 10: 4, 11: 4, 12: 5, 13: 5, 14: 6, 15: 6, 16: 6 };

export const maxPerRow = (n) => MAX_PER_ROW[n] ?? Math.floor(n * 0.375);

/** Сколько букв фразы помещается в письмо за один проход. */
export const capacity = (n) => n * maxPerRow(n);

/** Размер письма по длине фразы: наименьший квадрат, в который она помещается (в несколько проходов). */
export function autoSize(length) {
  for (let n = SIZE.min; n <= SIZE.max; n++) if (maxLetters(n) >= length) return n;
  return SIZE.max;
}

/** Сколько букв фразы ляжет в каждую строку: поровну, лишние — в случайные строки. */
export function planRows(length, n, rng) {
  const counts = new Array(n).fill(Math.floor(length / n));
  const rows = [...Array(n).keys()];
  for (let i = 0; i < length % n; i++) {
    const j = i + randInt(rng, n - i);
    [rows[i], rows[j]] = [rows[j], rows[i]];
    counts[rows[i]]++;
  }
  return counts;
}

/**
 * Положение пластины для каждой строки с буквами: всегда не то, что было перед ней (иначе шагу нечего сказать). Пустая строка — null.
 * loop — код пойдёт по кругу: последнее положение нечётное, тогда каждый новый проход сдвинут на четверть.
 */
function pickTurns(counts, n, rng, { loop = false } = {}) {
  const ks = [];
  const load = [0, 0, 0, 0];
  let prev = 0;
  counts.forEach((m, r) => {
    if (!m) {
      ks.push(null);
      return;
    }
    const last = loop && r === counts.length - 1;
    const k = pick(rng, [0, 1, 2, 3].filter((x) => x !== prev && (!last || x % 2 === 1)));
    ks.push(k);
    load[k] += m;
    prev = k;
  });
  return loop || load.every((x) => x <= holeCount(n)) ? ks : null;
}

const HARD = 1000;

/**
 * Подбор пластины: для каждой четвёрки клеток — какая из них окошко в положении «I».
 * Жёстко: в строке r в положении ks[r] открыто ровно counts[r] клеток.
 * Мягко: в чужих положениях строка открыта примерно поровну — по числу огоньков не угадать нужный поворот.
 * Локальный поиск с шумом; возвращает выбор по четвёркам или null.
 */
function solve(n, ks, counts, rng) {
  const orbs = orbits(n);
  const rowsOf = orbs.map((orb) => orb.map(([r]) => r));
  const touched = rowsOf.map((rs) => [...new Set(rs)]);
  const cells = (r) => (n % 2 && r === (n - 1) / 2 ? n - 1 : n);
  const target = counts.map((m, r) => (ks[r] === null ? cells(r) / 4 : (cells(r) - m) / 3));

  const a = orbs.map(() => randInt(rng, 4));
  const cnt = Array.from({ length: n }, () => [0, 0, 0, 0]);
  const add = (o, sign) => {
    const rs = rowsOf[o];
    for (let j = 0; j < 4; j++) cnt[rs[j]][mod4(j - a[o])] += sign;
  };
  for (let o = 0; o < orbs.length; o++) add(o, 1);

  const rowCost = (r) => {
    const row = cnt[r];
    let cost = 0;
    for (let x = 0; x < 4; x++) cost += x === ks[r] ? HARD * Math.abs(row[x] - counts[r]) : (row[x] - target[r]) ** 2;
    return cost;
  };
  // Наименьшая мягкая цена, которую вообще можно получить, — до неё и ищем.
  const floor = counts.reduce((sum, m, r) => {
    const free = ks[r] === null ? cells(r) : cells(r) - m;
    const parts = ks[r] === null ? 4 : 3;
    const lo = Math.floor(free / parts);
    const hi = free - lo * parts;
    return sum + hi * (lo + 1 - target[r]) ** 2 + (parts - hi) * (lo - target[r]) ** 2;
  }, 0);

  // Сколько строк ещё не держат свои буквы — жёсткую часть считаем отдельно от мягкой.
  const misses = () => ks.reduce((sum, k, r) => sum + (k === null ? 0 : Math.abs(cnt[r][k] - counts[r])), 0);

  let cost = 0;
  for (let r = 0; r < n; r++) cost += rowCost(r);
  let best = { cost, a: [...a], misses: misses() };
  let improved = 0;
  const iterations = 600 * orbs.length;
  // Жёсткое выполнено, а ровнее давно не становится — дальше искать незачем.
  const patience = 200 * orbs.length;

  for (let it = 0; it < iterations && best.cost > floor + 1e-9 && !(best.misses === 0 && it - improved > patience); it++) {
    const o = randInt(rng, orbs.length);
    const rows = touched[o];
    const before = rows.reduce((s, r) => s + rowCost(r), 0);
    const old = a[o];
    let choice = old;
    let delta = 0;
    if (rng() < 0.08) {
      choice = randInt(rng, 4);
      add(o, -1);
      a[o] = choice;
      add(o, 1);
      delta = rows.reduce((s, r) => s + rowCost(r), 0) - before;
    } else {
      let ties = 0;
      add(o, -1);
      for (let b = 0; b < 4; b++) {
        a[o] = b;
        add(o, 1);
        const d = rows.reduce((s, r) => s + rowCost(r), 0) - before;
        add(o, -1);
        if (b === 0 || d < delta - 1e-9) {
          choice = b;
          delta = d;
          ties = 1;
        } else if (Math.abs(d - delta) <= 1e-9 && randInt(rng, ++ties) === 0) choice = b;
      }
      a[o] = choice;
      add(o, 1);
    }
    cost += delta;
    if (cost < best.cost - 1e-9) {
      best = { cost, a: [...a], misses: misses() };
      improved = it;
    }
  }
  return best.misses === 0 ? { orbs, a: best.a } : null;
}

/** Шаг кода между двумя положениями: d четвертей по часовой — это и «→d», и «←(4-d)». */
function stepFor(d, dirs, rng) {
  if (dirs === "cw") return { dir: 1, turns: d };
  if (d === 2) return { dir: rng() < 0.5 ? 1 : -1, turns: 2 };
  return rng() < 0.5 ? { dir: 1, turns: d } : { dir: -1, turns: 4 - d };
}

/**
 * Собрать шифр.
 * input: { phrase, rows, seed, dirs: "mixed" | "cw", yo } — rows не задан: autoSize по длине фразы.
 * Фраза не длиннее capacity(n) читается за один проход: окошки подобраны так, что в строке
 * открыто ровно столько клеток, сколько в неё легло букв. Длиннее — в несколько проходов по кругу.
 * Успех: { ok: true, n, auto, text, alphabet, dropped, grid: string[], holes: [r, c][], steps: { row, dir, turns }[], passes, perRow }
 * Ошибка: { ok: false, error: "empty" | "tooLong" | "unsolved", n, max?, length? }
 */
export function generate({ phrase, rows = null, seed = 1, dirs = "mixed", yo = true } = {}) {
  const norm = normalize(phrase, { yo });
  const length = norm.text.length;
  const auto = !Number(rows);
  const n = auto ? autoSize(length) : clamp(Math.round(Number(rows)), SIZE.min, SIZE.max);
  if (!length) return { ok: false, error: "empty", n, auto };
  if (length > maxLetters(n)) return { ok: false, error: "tooLong", n, auto, length, max: maxLetters(n) };
  const loop = length > capacity(n);

  const rng = mulberry32(seed);
  let found = null;
  for (let attempt = 0; attempt < 40 && !found; attempt++) {
    // По кругу строки ничем не ограничены: нужна только ровная пластина.
    const counts = loop ? new Array(n).fill(0) : planRows(length, n, rng);
    const ks = pickTurns(loop ? new Array(n).fill(1) : counts, n, rng, { loop });
    if (!ks) continue;
    const sol = solve(n, loop ? new Array(n).fill(null) : ks, counts, rng);
    if (sol) found = { ks, ...sol };
  }
  if (!found) return { ok: false, error: "unsolved", n, auto, length };

  const { ks, orbs, a } = found;
  const label = Array.from({ length: n }, () => new Array(n).fill(-1));
  orbs.forEach((orb, o) => orb.forEach(([r, c], j) => (label[r][c] = mod4(j - a[o]))));

  // Клетки в том порядке, в каком их прочтут: проход за проходом, строка за строкой, слева направо.
  const net = loop ? ks[n - 1] : 0;
  const order = [];
  for (let p = 0; p < (loop ? 4 : 1); p++) {
    ks.forEach((k, r) => {
      if (k === null) return;
      const at = mod4(k + p * net);
      label[r].forEach((lab, c) => lab === at && order.push([r, c, p]));
    });
  }
  const grid = Array.from({ length: n }, () => new Array(n).fill(null));
  order.slice(0, length).forEach(([r, c], i) => (grid[r][c] = norm.text[i]));
  const filler = fillerPicker(norm.alphabet, norm.text, rng, { yo });
  const lines = grid.map((row) => row.map((ch) => ch ?? filler()).join(""));

  const steps = [];
  let prev = 0;
  ks.forEach((k, row) => {
    if (k === null) return;
    steps.push({ row, ...stepFor(mod4(k - prev), dirs, rng) });
    prev = k;
  });

  const perRow = ks.map((k, r) => (k === null ? 0 : label[r].filter((lab) => lab === k).length));
  const passes = order[length - 1][2] + 1;
  const holes = orbs.map((orb, o) => orb[a[o]]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  return { ok: true, n, auto, text: norm.text, alphabet: norm.alphabet, dropped: norm.dropped, grid: lines, holes, steps, passes, perRow };
}

/** Положение пластины после каждого шага кода (от «I вверху»); passes — сколько раз код идёт по кругу. */
export function orientations(steps, passes = 1) {
  let k = 0;
  const out = [];
  for (let p = 0; p < passes; p++) for (const s of steps) out.push((k = mod4(k + s.dir * s.turns)));
  return out;
}

/** Клетки, которые открывает шаг: строка шага, положение после поворота, слева направо. */
export function stepCells({ n, holes }, step, k) {
  return holesAt(holes, n, k)
    .filter(([r]) => r === step.row)
    .sort((p, q) => p[1] - q[1]);
}

/** Прочитать письмо по коду — так же, как это сделают игроки. passes — сколько раз пройти код по кругу. */
export function decode(cipher, steps, passes = cipher.passes ?? 1) {
  const ks = orientations(steps, passes);
  return ks
    .map((k, i) => stepCells(cipher, steps[i % steps.length], k).map(([r, c]) => cipher.grid[r][c]).join(""))
    .join("");
}

export const stepText = (s) => `${s.dir > 0 ? "→" : "←"}${s.turns}`;

/** «1 →2 · 2 ←1 · …» — строки считаются с единицы. */
export const formatSteps = (steps) => steps.map((s) => `${s.row + 1} ${stepText(s)}`).join(" · ");

/** Обратно из записи «1 →2 · 2 ←1»: стрелки → ← (или > <), разделители любые. */
export function parseSteps(text) {
  const out = [];
  for (const m of String(text).matchAll(/(\d+)\s*([→←><])\s*(\d)/g)) {
    out.push({ row: Number(m[1]) - 1, dir: m[2] === "→" || m[2] === ">" ? 1 : -1, turns: Number(m[3]) });
  }
  return out;
}
