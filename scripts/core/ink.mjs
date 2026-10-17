/* Невидимые чернила: обычное письмо, а между строк — лимонный сок. Над свечой бумага прогревается,
   и скрытые строки проступают бурыми буквами там, где лист прогрет.
   Раскладка: письмо пишется через строку — видимые строки в чётных рядах, в нечётных (просветах)
   под ними — скрытые. Какие просветы заняты — решает зерно; скрытых строк больше, чем просветов, —
   остаток дописывается в конце письма, после последней строки.
   Карта прогрева — сетка клеток по листу (COLS по ширине, клетка квадратная), в клетке уровень 0…3;
   хранится строкой «24x32:base64» — по два бита на клетку.
   Ничего из Foundry — работает и в Node. */

import { mulberry32, shuffle } from "./rng.mjs";

/** Лист в единицах рисунка: ширина, поля слева и справа, ширина строки. */
export const SHEET_W = 120;
export const MARGIN_X = 13;
export const TEXT_W = SHEET_W - 2 * MARGIN_X;

/** Сетка прогрева: клеток по ширине и сторона клетки. */
export const COLS = 24;
export const CELL = SHEET_W / COLS;

/** Уровни прогрева и сколько тепла нужно, чтобы дойти до каждого (1, 2, 3). */
export const LEVELS = 3;
export const THRESH = [0.15, 0.9, 1.8];

export const LIMITS = { visible: 1200, hidden: 400 };

/** Сколько знаков в строке можно выбрать: меньше — крупнее буквы. */
export const PER = { min: 30, max: 64 };

/** Ширина знака на глаз (в кеглях); скрытые строки — того же кегля, но курсивом. */
export const EM = 0.5;
export const HIDDEN_SCALE = 1;

/** Шаг рядов в кеглях: видимые строки — через ряд, так что между ними просвет в одну строку. */
export const STEP = 1.24;

/** Скрытая строка чуть выше середины просвета: на глаз она тогда посередине между видимыми. */
const LIFT = 0.16;

/** Где лежат надписи: строка обращения сверху и отступ снизу; лист — не ниже MIN и по возможности не выше TARGET (в ширинах). */
const HEAD_Y = 15;
const BOTTOM = 12;
const MIN_RATIO = 1.3;
const TARGET_RATIO = 1.38;

const r2 = (v) => Math.round(v * 100) / 100;
const len = (s) => [...s].length;

/** Текст без лишних пробелов; переводы строк — абзацы, пустые строки подряд — одна. */
export function clean(text) {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Строки по словам, не длиннее per знаков; слово длиннее строки режется. Абзац — с новой строки. */
export function wrapText(text, per) {
  const out = [];
  for (const para of clean(text).split("\n")) {
    const words = para.split(" ").filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      let w = word;
      while (len(w) > per) {
        if (line) out.push(line);
        const chars = [...w];
        out.push(chars.slice(0, per).join(""));
        w = chars.slice(per).join("");
        line = "";
      }
      if (!w) continue;
      if (!line) line = w;
      else if (len(line) + 1 + len(w) <= per) line += ` ${w}`;
      else {
        out.push(line);
        line = w;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * Строки письма при per знаках в строке: видимые, скрытые, кегль, шаг и высота листа.
 * Последний ряд — просвет под последней строкой (или хвост скрытых): лист одной высоты при любом зерне.
 */
export function measure(vis, hid, per) {
  const lines = wrapText(vis, per);
  const secret = wrapText(hid, per - 2).filter(Boolean);
  const size = TEXT_W / (per * EM);
  const step = size * STEP;
  const n = lines.length;
  const lastRow = Math.max(2 * n - 1, 2 * n + secret.length - n - 1);
  const top = HEAD_Y + size * 1.9;
  const footY = top + lastRow * step + step * 1.5;
  return { lines, secret, size, step, top, footY, natural: footY + BOTTOM };
}

/** Знаков в строке: самые крупные буквы, при которых лист не выше TARGET_RATIO; не выходит — самые мелкие. */
export function perLine(vis, hid = "") {
  for (let per = PER.min; per <= PER.max; per++) if (measure(vis, hid, per).natural <= SHEET_W * TARGET_RATIO) return per;
  return PER.max;
}

/**
 * Раскладка письма. Возвращает { ok, error } или:
 * { ok, w, h, cols, rows, per, size, step, headY, footY,
 *   lines: [{ text, y }] — видимые, hidden: [{ text, x, y, rot, gap }] — скрытые (gap: под какой строкой, -1 — в конце),
 *   text — скрытое целиком, gaps — занятые просветы }.
 * Всё в единицах листа; ширина листа — SHEET_W, высота — кратна клетке.
 */
export function layout({ visible, hidden, seed = 1 } = {}) {
  const vis = clean(visible);
  const hid = clean(hidden);
  if (!vis) return { ok: false, error: "empty" };
  if (!hid) return { ok: false, error: "noHidden" };
  if (len(vis) > LIMITS.visible) return { ok: false, error: "tooLong", length: len(vis), max: LIMITS.visible };
  if (len(hid) > LIMITS.hidden) return { ok: false, error: "hiddenTooLong", length: len(hid), max: LIMITS.hidden };

  const rng = mulberry32(seed);
  const per = perLine(vis, hid);
  const { lines, secret, size, step, top, footY, natural } = measure(vis, hid, per);
  const n = lines.length;

  // Просветы под строками: сколько хватает — в случайные, по порядку сверху вниз; остальное — в конец.
  const all = [...Array(n).keys()];
  const gaps = secret.length >= n ? all : shuffle(rng, all).slice(0, secret.length).sort((a, b) => a - b);
  const rowY = (row) => top + row * step;
  const hiddenSize = size * HIDDEN_SCALE;
  const out = secret.map((text, i) => {
    const gap = i < gaps.length ? gaps[i] : -1;
    const row = gap >= 0 ? 2 * gap + 1 : 2 * n + (i - gaps.length);
    const slack = Math.max(0, TEXT_W - len(text) * hiddenSize * EM);
    return {
      text,
      x: r2(MARGIN_X + rng() * Math.min(6, slack)),
      y: r2(rowY(row) - size * LIFT + (rng() - 0.5) * 0.6),
      rot: r2((rng() - 0.5) * 1.4),
      gap,
    };
  });
  const h = Math.ceil(Math.max(SHEET_W * MIN_RATIO, natural) / CELL) * CELL;
  return {
    ok: true,
    w: SHEET_W,
    h,
    cols: COLS,
    rows: Math.round(h / CELL),
    per,
    size: r2(size),
    step: r2(step),
    headY: HEAD_Y,
    footY: r2(footY),
    lines: lines.map((text, i) => ({ text, y: r2(rowY(2 * i)) })),
    hidden: out,
    text: secret.join(" "),
    gaps,
  };
}

/* ---------- карта прогрева ---------- */

/** Пустая карта: lv — уровни клеток, acc — накопленное тепло (живёт только в окне, не сохраняется). */
export function blankHeat(cols, rows) {
  return { cols, rows, lv: new Uint8Array(cols * rows), acc: new Float64Array(cols * rows) };
}

/** Уровень по накопленному теплу. */
export function levelOf(heat) {
  let lv = 0;
  while (lv < LEVELS && heat >= THRESH[lv]) lv++;
  return lv;
}

function raise(map, i, heat, changed) {
  map.acc[i] = Math.max(map.acc[i], heat);
  const lv = levelOf(map.acc[i]);
  if (lv > map.lv[i]) {
    changed.push([i, map.lv[i], lv]);
    map.lv[i] = lv;
  }
}

/**
 * Прогреть кружок: центр (cx, cy) и радиус r — в клетках, dose — тепло в центре (к краю — меньше).
 * Возвращает изменившиеся клетки: [[индекс, был уровень, стал]].
 */
export function warm(map, cx, cy, r, dose) {
  const changed = [];
  const c0 = Math.max(0, Math.floor(cx - r));
  const c1 = Math.min(map.cols - 1, Math.floor(cx + r));
  const r0 = Math.max(0, Math.floor(cy - r));
  const r1 = Math.min(map.rows - 1, Math.floor(cy + r));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const d = Math.hypot(col + 0.5 - cx, row + 0.5 - cy);
      if (d >= r) continue;
      const i = row * map.cols + col;
      raise(map, i, map.acc[i] + dose * (1 - d / r), changed);
    }
  }
  return changed;
}

/** Провести свечой от (x0, y0) к (x1, y1): тепло делится по пути — чем быстрее ведёшь, тем слабее греет. */
export function warmPath(map, x0, y0, x1, y1, r, dose) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(dist / (r / 3)));
  const first = new Map();
  for (let k = 1; k <= n; k++) {
    const f = k / n;
    for (const [i, from, to] of warm(map, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, r, dose / n)) {
      first.set(i, [i, first.get(i)?.[1] ?? from, to]);
    }
  }
  return [...first.values()];
}

/** Карта → строка «24x32:base64» (по два бита на клетку). Холодный лист — пустая строка. */
export function encodeHeat(map) {
  if (!map.lv.some(Boolean)) return "";
  const bytes = new Uint8Array(Math.ceil(map.lv.length / 4));
  map.lv.forEach((lv, i) => {
    bytes[i >> 2] |= Math.min(lv, LEVELS) << ((i & 3) * 2);
  });
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `${map.cols}x${map.rows}:${btoa(bin)}`;
}

/** Строка → карта. Чужая сетка (письмо пересобрали) или порча — холодный лист. */
export function decodeHeat(str, cols, rows) {
  const map = blankHeat(cols, rows);
  const m = /^(\d+)x(\d+):([A-Za-z0-9+/=]*)$/.exec(String(str ?? ""));
  if (!m || Number(m[1]) !== cols || Number(m[2]) !== rows) return map;
  let bin;
  try {
    bin = atob(m[3]);
  } catch {
    return map;
  }
  for (let i = 0; i < map.lv.length; i++) {
    const lv = ((bin.charCodeAt(i >> 2) || 0) >> ((i & 3) * 2)) & 3;
    map.lv[i] = lv;
    map.acc[i] = lv ? THRESH[lv - 1] : 0;
  }
  return map;
}

/**
 * Слить чужую карту в свою: в каждой клетке — больший уровень (лист только греется).
 * Возвращает { changed — что прибавилось у себя, ahead — в скольких клетках своя карта горячее чужой }.
 */
export function mergeHeat(map, other) {
  const changed = [];
  let ahead = 0;
  for (let i = 0; i < map.lv.length; i++) {
    const theirs = other.lv[i] ?? 0;
    if (theirs > map.lv[i]) raise(map, i, THRESH[theirs - 1], changed);
    else if (map.lv[i] > theirs) ahead++;
  }
  return { changed, ahead };
}

/** Доля проявленного: сколько клеток (из cells или всего листа) прогрето хотя бы до уровня min. */
export function share(map, cells = null, min = 1) {
  const list = cells ?? map.lv.keys();
  let total = 0;
  let warmCount = 0;
  for (const i of list) {
    total++;
    if (map.lv[i] >= min) warmCount++;
  }
  return total ? warmCount / total : 0;
}

/** Клетки под скрытыми строками (по прикидке ширины букв). */
export function hiddenCells(L) {
  const cells = new Set();
  const size = L.size * HIDDEN_SCALE;
  for (const h of L.hidden) {
    const x0 = h.x;
    const x1 = h.x + len(h.text) * size * EM;
    const y0 = h.y - size * 0.75;
    const y1 = h.y + size * 0.25;
    for (let row = Math.max(0, Math.floor(y0 / CELL)); row <= Math.min(L.rows - 1, Math.floor(y1 / CELL)); row++) {
      for (let col = Math.max(0, Math.floor(x0 / CELL)); col <= Math.min(L.cols - 1, Math.floor(x1 / CELL)); col++) cells.add(row * L.cols + col);
    }
  }
  return [...cells].sort((a, b) => a - b);
}

/** Лист, прогретый вдоль скрытых строк, — как его оставил тот, кто всё проявил. */
export function revealedHeat(L) {
  const map = blankHeat(L.cols, L.rows);
  for (const i of hiddenCells(L)) {
    const row = Math.floor(i / L.cols);
    const col = i % L.cols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const rr = row + dr;
        const cc = col + dc;
        if (rr < 0 || cc < 0 || rr >= L.rows || cc >= L.cols) continue;
        const j = rr * L.cols + cc;
        map.lv[j] = Math.max(map.lv[j], dr || dc ? 1 : LEVELS);
      }
    }
  }
  map.lv.forEach((lv, i) => {
    map.acc[i] = lv ? THRESH[lv - 1] : 0;
  });
  return map;
}
