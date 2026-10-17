/* Перестук: из соседней камеры стучат в стену — квадрат Полибия звуком.
   Ядро — scripts/core/knock.mjs; здесь поля мастерской, стена со звуком, таблица, запись точками и картинки.
   Звук синтезируется WebAudio (без файлов) и создаётся только по нажатию кнопки. */

import { duration, encode, formatDots, letterCount, MAX_LETTERS, schedule, tableOf } from "../../core/knock.mjs";
import { mulberry32 } from "../../core/rng.mjs";
import { esc, plural, t } from "../i18n.mjs";
import { fit, INK, INK_SOFT, LIT, num, paper, SERIF, SERIF_SC, svgOpen, uid, xml } from "../paper.mjs";

/* ---------- мелочи ---------- */

const calm = () => Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** Сколько длится стук — по-человечески: «40 с», «1 мин 5 с». */
function timeText(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return t("Kind.knock.time.sec", { s });
  if (s % 60 === 0) return t("Kind.knock.time.minEven", { m: s / 60 });
  return t("Kind.knock.time.min", { m: Math.floor(s / 60), s: s % 60 });
}

function speedText(speed) {
  if (speed === "slow") return t("Kind.knock.field.speed_slow");
  if (speed === "fast") return t("Kind.knock.field.speed_fast");
  return t("Kind.knock.field.speed_normal");
}

/** Многоугольник со скруглёнными углами — камень кладки. */
function roundedPoly(pts, r) {
  const n = pts.length;
  const at = (i) => pts[(i + n) % n];
  const toward = (a, b, d) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const k = Math.min(d, len / 2.2) / len;
    return [num(a[0] + (b[0] - a[0]) * k), num(a[1] + (b[1] - a[1]) * k)];
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const p = at(i);
    const a = toward(p, at(i - 1), r);
    const b = toward(p, at(i + 1), r);
    d += `${i ? "L" : "M"}${a[0]},${a[1]}Q${num(p[0])},${num(p[1])} ${b[0]},${b[1]}`;
  }
  return `${d}Z`;
}

/** Рваный край клочка: сверху и справа рвано, снизу и слева — почти ровно. */
function tornPath(w, h, rng) {
  const pts = [];
  const step = 2.6;
  for (let x = 0; x < w; x += step) pts.push([x, 0.2 + rng() * 1.8]);
  for (let y = 0; y < h; y += step) pts.push([w - 0.2 - rng() * 1.7, y]);
  for (let x = w; x > 0; x -= step) pts.push([x, h - rng() * 0.6]);
  for (let y = h; y > 0; y -= step) pts.push([rng() * 0.6, y]);
  return `M${pts.map(([x, y]) => `${num(x)},${num(y)}`).join("L")}Z`;
}

/* ---------- таблица ---------- */

const TB = { cell: 12, head: 9, pad: 8, title: 12, foot: 14 };

function tableGeom(alphabet) {
  const rows = tableOf(alphabet).rows;
  const R = rows.length;
  const C = [...rows[0]].length;
  const gx = TB.pad + TB.head;
  const gy = TB.pad + TB.title + TB.head;
  return { rows, R, C, gx, gy, w: gx + C * TB.cell + TB.pad, h: gy + R * TB.cell + TB.foot + TB.pad - 2 };
}

/** Линия «от руки»: чуть дрожит посередине. */
const handLine = (x1, y1, x2, y2, rng) => {
  const mx = (x1 + x2) / 2 + (rng() - 0.5) * 0.35;
  const my = (y1 + y2) / 2 + (rng() - 0.5) * 0.35;
  return `M${num(x1)},${num(y1)}Q${num(mx)},${num(my)} ${num(x2)},${num(y2)}`;
};

/**
 * Таблица перестука на пергаменте: номера рядов слева, номера мест сверху, внизу — замены и как читать.
 * o.used — Set «ряд-место» букв фразы (подложка для ведущего); o.cells — клетки для подсветки при прослушивании.
 */
export function tableSvg(alphabet, o = {}) {
  const g = tableGeom(alphabet);
  const box = [0, 0, g.w, g.h];
  const rng = mulberry32(alphabet === "en" ? 41 : 17);
  const out = [svgOpen(box, { ...o, cls: "cp-knock-table-svg" }), paper(box)];
  const title = alphabet === "en" ? t("Kind.knock.table.titleEn") : t("Kind.knock.table.titleRu");
  out.push(`<text x="${num(g.w / 2)}" y="${TB.pad + TB.title / 2 - 0.5}" dy=".34em" text-anchor="middle" font-family="${SERIF_SC}" font-weight="700" font-size="${fit(title, 6.4, g.w - 2 * TB.pad, 0.56)}" fill="${INK}" letter-spacing=".25">${xml(title)}</text>`);

  const cellAt = (r, c) => [g.gx + (c - 1) * TB.cell, g.gy + (r - 1) * TB.cell];
  if (o.used) {
    out.push(`<g fill="${LIT}" fill-opacity=".13">`);
    for (const key of o.used) {
      const [r, c] = key.split("-").map(Number);
      const [x, y] = cellAt(r, c);
      out.push(`<rect x="${x + 0.7}" y="${y + 0.7}" width="${TB.cell - 1.4}" height="${TB.cell - 1.4}" rx="1"/>`);
    }
    out.push("</g>");
  }
  if (o.cells) {
    out.push('<g fill="#e0b24f">');
    for (let r = 1; r <= g.R; r++) {
      for (let c = 1; c <= g.C; c++) {
        const [x, y] = cellAt(r, c);
        out.push(`<rect class="cp-knock-cell" data-rc="${r}-${c}" x="${x + 0.5}" y="${y + 0.5}" width="${TB.cell - 1}" height="${TB.cell - 1}" rx="1.2" opacity="0"/>`);
      }
    }
    out.push("</g>");
  }

  // Сетка от руки: внешняя рамка гуще, внутренние линии тоньше; шапки отделены.
  const right = g.gx + g.C * TB.cell;
  const bottom = g.gy + g.R * TB.cell;
  const lines = [];
  for (let r = 0; r <= g.R; r++) lines.push([r === 0 || r === g.R ? 0.5 : 0.3, handLine(g.gx - (r === 0 ? TB.head : 0), g.gy + r * TB.cell, right, g.gy + r * TB.cell, rng)]);
  for (let c = 0; c <= g.C; c++) lines.push([c === 0 || c === g.C ? 0.5 : 0.3, handLine(g.gx + c * TB.cell, g.gy - (c === 0 ? TB.head : 0), g.gx + c * TB.cell, bottom, rng)]);
  lines.push([0.3, handLine(g.gx - TB.head, g.gy - TB.head, g.gx, g.gy, rng)]);
  out.push(`<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-opacity=".75">`);
  for (const [sw, d] of lines) out.push(`<path d="${d}" stroke-width="${sw}"/>`);
  out.push("</g>");

  out.push(`<g font-family="${SERIF}" font-weight="700" font-size="4.6" fill="${INK_SOFT}" text-anchor="middle" style="font-variant-numeric:lining-nums">`);
  for (let c = 1; c <= g.C; c++) out.push(`<text x="${g.gx + (c - 0.5) * TB.cell}" y="${g.gy - TB.head / 2}" dy=".34em">${c}</text>`);
  for (let r = 1; r <= g.R; r++) out.push(`<text x="${g.gx - TB.head / 2}" y="${g.gy + (r - 0.5) * TB.cell}" dy=".34em">${r}</text>`);
  out.push("</g>");

  out.push(`<g font-family="${SERIF}" font-weight="700" font-size="6.8" fill="${INK}" text-anchor="middle">`);
  g.rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const [x, y] = cellAt(r + 1, c + 1);
      out.push(`<text x="${num(x + TB.cell / 2)}" y="${num(y + TB.cell / 2)}" dy=".35em">${xml(ch)}</text>`);
    }),
  );
  out.push("</g>");

  const swaps = Object.entries(tableOf(alphabet).swaps).map(([a, b]) => `${a} = ${b}`).join("  ·  ");
  const how = t("Kind.knock.table.how");
  const wide = g.w - 2 * TB.pad;
  out.push(`<text x="${num(g.w / 2)}" y="${bottom + 5}" dy=".34em" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${fit(swaps, 4.4, wide)}" fill="${INK}">${xml(swaps)}</text>`);
  out.push(`<text x="${num(g.w / 2)}" y="${bottom + 10.6}" dy=".34em" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${fit(how, 4, wide, 0.46)}" fill="${INK_SOFT}">${xml(how)}</text>`);
  out.push("</svg>");
  return out.join("");
}

/* ---------- запись точками ---------- */

const REC = { w: 150, pad: 10, top: 8, line: 11, ans: 5.5, bottom: 7, step: 2.75, gap: 3.6, sep: 6.6, word: 12, dot: 0.95 };

/**
 * Где на клочке встанет каждая точка. Раскладка считается сразу для всей вести, поэтому
 * при живой записи точки не прыгают: слово, которое не влезает, сразу начинается с новой строки.
 */
function recordLayout(words, answer) {
  const inner = REC.w - 2 * REC.pad;
  const width = ([r, c]) => (r + c - 1) * REC.step + REC.gap + 2 * REC.dot;
  const letters = [];
  const seps = [];
  let x = 0;
  let line = 0;
  let i = 0;
  let l = 0;
  for (const word of words) {
    const ww = word.reduce((a, p) => a + width(p), 0) + (word.length - 1) * REC.sep;
    if (x > 0) {
      if (x + REC.word + ww > inner) {
        // слово кончилось в конце строки — черта всё равно ставится, иначе не понять, где граница
        seps.push({ kind: "word", x: x + REC.word * 0.4, line, at: i });
        line++;
        x = 0;
      } else {
        seps.push({ kind: "word", x: x + REC.word / 2, line, at: i });
        x += REC.word;
      }
    }
    word.forEach((pair, k) => {
      const lw = width(pair);
      if (k > 0) {
        if (x + REC.sep + lw > inner) {
          line++;
          x = 0;
        } else {
          seps.push({ kind: "letter", x: x + REC.sep / 2, line, at: i });
          x += REC.sep;
        }
      }
      const dots = [];
      const [r, c] = pair;
      for (let n = 0; n < r; n++) dots.push({ x: x + REC.dot + n * REC.step, i: i++ });
      const x2 = x + REC.dot + r * REC.step + REC.gap;
      for (let n = 0; n < c; n++) dots.push({ x: x2 + n * REC.step, i: i++ });
      letters.push({ l: l++, x, w: lw, line, dots });
      x += lw;
    });
  }
  const lineH = REC.line + (answer ? REC.ans : 0);
  return { letters, seps, lineH, h: REC.top + (line + 1) * lineH + REC.bottom };
}

/**
 * Клочок бумаги с записью стука точками: серия ряда, пробел, серия места; «/» между буквами, «|» между словами.
 * o.answer — буквы ответа под каждой группой (у ведущего); o.live — точки скрыты и проявляются по ударам.
 */
export function recordSvg(words, o = {}) {
  const answer = o.answer ? [...o.answer] : null;
  const lay = recordLayout(words, Boolean(answer));
  const box = [0, 0, REC.w, num(lay.h)];
  const rng = mulberry32(((o.seed ?? 1) ^ 0x51ed27) >>> 0);
  const id = uid();
  const out = [svgOpen(box, { ...o, cls: `cp-knock-rec-svg${o.live ? " is-live" : ""}` })];
  out.push(`<defs><clipPath id="${id}t"><path d="${tornPath(REC.w, lay.h, rng)}"/></clipPath></defs>`);
  out.push(`<g clip-path="url(#${id}t)">${paper(box, { tone: "old", rx: 0 })}`);
  // сгиб: клочок носили сложенным
  const fx = REC.w * (0.58 + rng() * 0.12);
  out.push(`<path d="M${num(fx)},0L${num(fx - 6)},${num(lay.h)}" stroke="#fff6dc" stroke-opacity=".35" stroke-width=".9" fill="none"/><path d="M${num(fx + 0.7)},0L${num(fx - 5.3)},${num(lay.h)}" stroke="#6b4a22" stroke-opacity=".16" stroke-width=".5" fill="none"/>`);
  out.push("</g>");

  // строка — чуть вкось и с неровным отступом, как пишут на коленке
  const lines = new Map();
  const lineOf = (n) => {
    if (!lines.has(n)) lines.set(n, { tilt: (rng() - 0.5) * 0.024, dx: rng() * 1.6, y: REC.top + n * lay.lineH + REC.line / 2 });
    return lines.get(n);
  };
  const yAt = (ln, x) => num(ln.y + ln.tilt * x);

  out.push(`<g fill="none" stroke="${INK}" stroke-linecap="round" stroke-opacity=".55">`);
  for (const s of lay.seps) {
    const ln = lineOf(s.line);
    const x = REC.pad + ln.dx + s.x;
    const y = ln.y + ln.tilt * s.x;
    const d = s.kind === "word" ? `M${num(x)},${num(y - 3.4)}L${num(x + 0.2)},${num(y + 3.4)}` : `M${num(x + 1)},${num(y - 2.4)}L${num(x - 1)},${num(y + 2.4)}`;
    out.push(`<path class="cp-knock-sep" data-i="${s.at}" d="${d}" stroke-width="${s.kind === "word" ? 0.5 : 0.36}"/>`);
  }
  out.push("</g>");

  out.push(`<g fill="${INK}">`);
  for (const L of lay.letters) {
    const ln = lineOf(L.line);
    const x0 = REC.pad + ln.dx + L.x;
    const cy = yAt(ln, L.x + L.w / 2);
    out.push(`<g class="cp-knock-rl" data-l="${L.l}">`);
    if (answer) out.push(`<rect class="cp-knock-rl__hl" x="${num(x0 - 1.4)}" y="${num(cy - 3.6)}" width="${num(L.w + 2.8)}" height="${num(lay.lineH - 2.2)}" rx="1.6" fill="#e0b24f" opacity="0"/>`);
    for (const d of L.dots) {
      const x = x0 + d.x - L.x + (rng() - 0.5) * 0.4;
      const y = ln.y + ln.tilt * d.x + (rng() - 0.5) * 0.5;
      out.push(`<circle class="cp-knock-d" data-i="${d.i}" cx="${num(x)}" cy="${num(y)}" r="${num(REC.dot * (0.86 + rng() * 0.26))}"/>`);
    }
    if (answer) out.push(`<text x="${num(x0 + L.w / 2)}" y="${num(cy + 6.4)}" dy=".3em" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="4.6" fill="${LIT}">${xml(answer[L.l] ?? "")}</text>`);
    out.push("</g>");
  }
  out.push("</g></svg>");
  return out.join("");
}

/* ---------- стена ---------- */

const WALL = { w: 160, h: 100, at: [104, 47] };
const STONE = ["#5b534b", "#4c4640", "#655b51", "#423d38", "#575049", "#61554a", "#3d3934", "#4f4a45", "#5d564f", "#6a6055", "#534a41"];

/** Камень: неровный многоугольник со скруглёнными углами внутри своей клетки кладки. */
function stonePath(x, y, w, h, rng) {
  const m = 0.75;
  const j = (a = 1.5) => (rng() - 0.5) * a;
  const pts = [
    [x + m + j(), y + m + j()],
    [x + w * (0.35 + rng() * 0.3) + j(2), y + m + j(1.3)],
    [x + w - m + j(), y + m + j()],
    [x + w - m + j(1.3), y + h / 2 + j(2)],
    [x + w - m + j(), y + h - m + j()],
    [x + w * (0.35 + rng() * 0.3) + j(2), y + h - m + j(1.3)],
    [x + m + j(), y + h - m + j()],
    [x + m + j(1.3), y + h / 2 + j(2)],
  ];
  return roundedPoly(pts, 1.2 + rng() * 2.6);
}

/** Кладка: ряды разной высоты, камни разной длины, иногда два плоских камня друг на друге. */
function masonry(rng, w, h) {
  const stones = [];
  for (let y = -5; y < h; ) {
    const sh = 9 + rng() * 9;
    let x = -rng() * 26;
    while (x < w) {
      const sw = 12 + rng() * 24 + sh * 0.4;
      if (sw < 26 && sh > 13 && rng() < 0.3) {
        const cut = sh * (0.4 + rng() * 0.2);
        stones.push([x, y, sw, cut], [x, y + cut, sw, sh - cut]);
      } else stones.push([x, y, sw, sh]);
      x += sw;
    }
    y += sh;
  }
  return stones;
}

/**
 * Каменная кладка камеры: свет факела слева, кольцо для цепи, зарубки-дни и истёртое место, куда стучат.
 * Слой .cp-knock-fx — вспышка, круг и пыль от удара (их оживляет окно игрока).
 * o.slice — рисунок заполняет рамку любой формы (лишнее обрезается).
 */
export function wallSvg(seed = 1, o = {}) {
  const rng = mulberry32(((seed ?? 1) ^ 0x2545f491) >>> 0);
  const id = uid();
  const { w, h } = WALL;
  const [ax, ay] = WALL.at;
  let open = svgOpen([0, 0, w, h], { ...o, cls: "cp-knock-wall-svg" });
  if (o.slice) open = open.replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" ');
  const out = [open];
  out.push(
    "<defs>",
    `<linearGradient id="${id}b" x1="0" y1="0" x2=".55" y2="1"><stop offset="0" stop-color="#fff2dc" stop-opacity=".26"/><stop offset=".3" stop-color="#fff2dc" stop-opacity=".04"/><stop offset=".7" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>`,
    `<filter id="${id}n" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 .08  0 0 0 0 .06  0 0 0 0 .05  0 0 0 .75 -.2"/></filter>`,
    `<filter id="${id}m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="3" seed="${(seed ?? 1) % 89}"/><feColorMatrix values="0 0 0 0 .04  0 0 0 0 .06  0 0 0 0 .035  0 0 0 1.3 -.55"/></filter>`,
    `<radialGradient id="${id}l" cx=".16" cy=".3" r=".9"><stop offset="0" stop-color="#ffb35a" stop-opacity=".34"/><stop offset=".38" stop-color="#e08a3a" stop-opacity=".13"/><stop offset="1" stop-color="#e08a3a" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="${id}v" cx=".5" cy=".5" r=".75"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".72"/></radialGradient>`,
    `<radialGradient id="${id}s"><stop offset="0" stop-color="#f8e6bf" stop-opacity=".95"/><stop offset=".3" stop-color="#e6c48c" stop-opacity=".5"/><stop offset="1" stop-color="#e6c48c" stop-opacity="0"/></radialGradient>`,
    `<filter id="${id}w" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>`,
    "</defs>",
    `<rect width="${w}" height="${h}" fill="#15110e"/>`,
  );

  const stones = masonry(rng, w, h);
  out.push("<g>");
  const cracks = [];
  for (const [x, y, sw, sh] of stones) {
    const d = stonePath(x, y, sw, sh, rng);
    const tone = rng();
    const shade = tone < 0.25 ? `<path d="${d}" fill="#000" fill-opacity="${num(0.06 + rng() * 0.14)}"/>` : tone > 0.8 ? `<path d="${d}" fill="#fff4e0" fill-opacity="${num(0.03 + rng() * 0.05)}"/>` : "";
    out.push(`<path d="${d}" fill="#000" fill-opacity=".5" transform="translate(.45 .65)"/><path d="${d}" fill="${STONE[Math.floor(rng() * STONE.length)]}"/>${shade}<path d="${d}" fill="url(#${id}b)"/>`);
    if (sw > 22 && rng() < 0.22) {
      const cx = x + sw * (0.3 + rng() * 0.4);
      cracks.push(`M${num(cx)},${num(y + 1.2)}l${num((rng() - 0.5) * 2)},${num(sh * 0.3)}l${num((rng() - 0.5) * 2.4)},${num(sh * 0.25)}`);
    }
  }
  out.push("</g>");
  if (cracks.length) out.push(`<path d="${cracks.join("")}" fill="none" stroke="#120e0b" stroke-opacity=".7" stroke-width=".35" stroke-linecap="round" stroke-linejoin="round"/>`);
  out.push(`<rect width="${w}" height="${h}" filter="url(#${id}n)"/>`);
  out.push(`<rect width="${w}" height="${h}" filter="url(#${id}m)" opacity=".7"/>`);

  // Зарубки на камне слева: кто-то считал дни.
  const tally = stones.find(([x, y, sw, sh]) => x < 34 && x + sw > 50 && y < 68 && y + sh > 72) ?? [30, 62, 24, 13];
  const tx = Math.max(tally[0] + 4, 32);
  const ty = tally[1] + tally[3] / 2;
  const marks = [];
  for (let k = 0; k < 4; k++) marks.push(`M${num(tx + k * 1.7)},${num(ty - 3)}L${num(tx + k * 1.7 + 0.3)},${num(ty + 3)}`);
  marks.push(`M${num(tx - 1)},${num(ty + 1.8)}L${num(tx + 6.2)},${num(ty - 1.6)}`);
  for (let k = 0; k < 3; k++) marks.push(`M${num(tx + 9.5 + k * 1.7)},${num(ty - 3)}L${num(tx + 9.8 + k * 1.7)},${num(ty + 3)}`);
  out.push(`<path d="${marks.join("")}" fill="none" stroke="#c9bba3" stroke-opacity=".38" stroke-width=".42" stroke-linecap="round"/>`);
  out.push(`<path d="${marks.join("")}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".3" stroke-linecap="round" transform="translate(.3 .35)"/>`);

  // Кольцо для цепи.
  const [rx, ry] = [52, 24];
  out.push(
    `<rect x="${rx - 3.2}" y="${ry - 3.2}" width="6.4" height="6.4" rx="1.2" fill="#24201d" stroke="#5e544b" stroke-width=".35"/>`,
    `<circle cx="${rx}" cy="${ry}" r="1" fill="#6e6257"/>`,
    `<ellipse cx="${rx}" cy="${ry + 6.2}" rx="4.4" ry="5.6" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="2.2" transform="translate(.6 .9)"/>`,
    `<ellipse cx="${rx}" cy="${ry + 6.2}" rx="4.4" ry="5.6" fill="none" stroke="#2c2622" stroke-width="1.7"/>`,
    `<ellipse cx="${rx}" cy="${ry + 6.2}" rx="4.4" ry="5.6" fill="none" stroke="#8a7b6b" stroke-opacity=".55" stroke-width=".4" stroke-dasharray="7 30"/>`,
  );

  // Место, куда стучат: камень истёрт, мелкие сколы.
  out.push(`<ellipse cx="${ax}" cy="${ay}" rx="8" ry="5.6" fill="#a89a84" opacity=".3" filter="url(#${id}w)"/>`);
  out.push('<g fill="#1d1916" opacity=".55">');
  for (let k = 0; k < 7; k++) {
    const a = rng() * Math.PI * 2;
    const d = 1.2 + rng() * 3.6;
    out.push(`<circle cx="${num(ax + Math.cos(a) * d * 1.3)}" cy="${num(ay + Math.sin(a) * d)}" r="${num(0.18 + rng() * 0.28)}"/>`);
  }
  out.push("</g>");

  out.push(`<rect width="${w}" height="${h}" fill="url(#${id}l)"/>`, `<rect width="${w}" height="${h}" fill="url(#${id}v)"/>`);

  out.push('<g class="cp-knock-fx" pointer-events="none">');
  out.push(`<circle class="cp-knock-glow" cx="${ax}" cy="${ay}" r="15" fill="url(#${id}s)" opacity="0"/>`);
  out.push(`<circle class="cp-knock-ring" cx="${ax}" cy="${ay}" r="8" fill="none" stroke="#f3dcae" stroke-width=".3" opacity="0"/>`);
  for (let k = 0; k < 6; k++) {
    out.push(`<circle class="cp-knock-dust" cx="${num(ax - 4 + rng() * 8)}" cy="${num(ay + 1 + rng() * 2.5)}" r="${num(0.28 + rng() * 0.32)}" fill="#d9c7a6" opacity="0"/>`);
  }
  out.push("</g></svg>");
  return out.join("");
}

/* ---------- звук ---------- */

let audio = null;

/** Звуковая цепочка на любом контексте WebAudio: шум для ударов, гулкая камера (свёртка с синтетическим откликом), компрессор. */
export function makeAudio(ctx) {
  const rng = mulberry32(0x6b6e6f63);
  const rate = ctx.sampleRate;
  const noise = ctx.createBuffer(1, Math.floor(rate * 0.5), rate);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = rng() * 2 - 1;
  const ir = ctx.createBuffer(2, Math.floor(rate * 1.2), rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < d.length; i++) {
      lp += (rng() * 2 - 1 - lp) * 0.16;
      d[i] = lp * Math.exp(-i / (rate * 0.2));
    }
  }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const room = ctx.createConvolver();
  room.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  master.connect(comp);
  master.connect(room);
  room.connect(wet);
  wet.connect(comp);
  return { ctx, noise, master };
}

/** Общий звук на всё окно: создаётся при первом нажатии «Слушать» (браузер требует жеста). */
function getAudio() {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!AC) return null;
  audio ??= makeAudio(new AC());
  if (audio.ctx.state === "suspended") audio.ctx.resume().catch(() => {});
  return audio;
}

function envelope(param, when, peak, attack, decay) {
  param.setValueAtTime(0.0001, when);
  param.exponentialRampToValueAtTime(peak, when + attack);
  param.exponentialRampToValueAtTime(0.0001, when + attack + decay);
}

/** Глухой удар костяшками в камень: низкий тон с падением, тон повыше для ясности и шум по камню. */
export function thud(a, out, when, v, tone) {
  const { ctx, noise } = a;
  const body = ctx.createOscillator();
  body.type = "sine";
  body.frequency.setValueAtTime(118 * tone, when);
  body.frequency.exponentialRampToValueAtTime(50 * tone, when + 0.11);
  const bg = ctx.createGain();
  envelope(bg.gain, when, 0.95 * v, 0.004, 0.24);
  body.connect(bg).connect(out);
  body.start(when);
  body.stop(when + 0.32);

  const knuckle = ctx.createOscillator();
  knuckle.type = "triangle";
  knuckle.frequency.setValueAtTime(260 * tone, when);
  knuckle.frequency.exponentialRampToValueAtTime(150 * tone, when + 0.05);
  const kg = ctx.createGain();
  envelope(kg.gain, when, 0.62 * v, 0.002, 0.09);
  knuckle.connect(kg).connect(out);
  knuckle.start(when);
  knuckle.stop(when + 0.12);

  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 520 * tone;
  bp.Q.value = 0.9;
  const ng = ctx.createGain();
  envelope(ng.gain, when, 1.5 * v, 0.0015, 0.065);
  src.connect(bp).connect(ng).connect(out);
  src.start(when, (v * 7919) % 0.35, 0.12);
}

/**
 * Проигрыватель стука. Картинка идёт по часам страницы, звук заказывается WebAudio чуть вперёд
 * и привязан к тем же часам. Без WebAudio — только картинка. alive() — окно ещё на месте (иначе стук сам замолкает).
 */
class Knocker {
  constructor(sched, { seed = 1, onHit, onSeek, onState, alive } = {}) {
    this.s = sched;
    this.rng = mulberry32(((seed ?? 1) ^ 0x7f4a7c15) >>> 0);
    this.pos = 0;
    this.state = "idle";
    Object.assign(this, { onHit, onSeek, onState, alive });
  }

  now() {
    return performance.now() / 1000;
  }

  /** Слушать (звук создаётся здесь — по нажатию). С конца — заново. */
  play() {
    if (this.state === "playing" || !this.s.hits.length) return;
    if (this.pos >= this.s.hits.length) this.seek(0);
    this.audio = getAudio();
    if (this.audio) {
      this.bus = this.audio.ctx.createGain();
      this.bus.connect(this.audio.master);
    }
    this.t0 = this.now() + 0.45 - this.s.hits[this.pos].t / 1000;
    this.next = this.pos;
    this.offset = null;
    this.set("playing");
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  tick() {
    if (this.alive && !this.alive()) return this.stop();
    const hits = this.s.hits;
    const now = this.now();
    const ctx = this.audio?.ctx;
    if (ctx?.state === "running") {
      // часы звука и часы картинки сводятся один раз за прослушивание
      if (this.offset === null) this.offset = ctx.currentTime - now;
      while (this.next < hits.length && this.t0 + hits[this.next].t / 1000 < now + 0.2) {
        const when = Math.max(ctx.currentTime + 0.005, this.t0 + hits[this.next].t / 1000 + this.offset);
        thud(this.audio, this.bus, when, 0.8 + this.rng() * 0.2, 0.94 + this.rng() * 0.12);
        this.next++;
      }
    } else {
      // звук ещё не включился (или его нет) — опоздавшие удары не копим
      while (this.next < hits.length && this.t0 + hits[this.next].t / 1000 < now) this.next++;
    }
    while (this.pos < hits.length && this.t0 + hits[this.pos].t / 1000 <= now) {
      this.onHit?.(hits[this.pos], this.pos);
      this.pos++;
    }
    if (this.pos >= hits.length) {
      this.halt(false);
      this.set("done");
    }
  }

  /** Остановить таймер; mute — заглушить уже заказанные удары. */
  halt(mute = true) {
    clearInterval(this.timer);
    this.timer = null;
    const bus = this.bus;
    this.bus = null;
    if (!bus) return;
    if (mute) bus.gain.setTargetAtTime(0, this.audio.ctx.currentTime, 0.012);
    // последний удар с эхом камеры успевает отзвучать
    setTimeout(() => bus.disconnect(), mute ? 300 : 2000);
  }

  /** Пауза. На середине буквы — назад к её началу: так проще не сбиться со счёта. */
  pause() {
    if (this.state !== "playing") return;
    this.halt();
    const hit = this.s.hits[this.pos];
    if (hit && this.s.starts[hit.l] < this.pos) this.seek(this.s.starts[hit.l]);
    this.set("paused");
  }

  restart() {
    this.halt();
    this.seek(0);
    this.state = "idle";
    this.play();
  }

  stop() {
    this.halt();
    this.set("idle");
  }

  seek(pos) {
    this.pos = pos;
    this.onSeek?.(pos);
  }

  set(state) {
    this.state = state;
    this.onState?.(state);
  }
}

/** Удар по стене: вспышка в истёртом месте, круг, пыль и короткая дрожь кладки. Без движения — только вспышка. */
function flash(wall) {
  if (!wall?.animate) return;
  const q = (s) => wall.querySelector(s);
  const still = calm();
  q(".cp-knock-glow")?.animate([{ opacity: 0 }, { opacity: still ? 0.7 : 1, offset: 0.12 }, { opacity: 0 }], { duration: still ? 360 : 460, easing: "ease-out" });
  if (still) return;
  wall.animate([{ transform: "translate(0,0)" }, { transform: "translate(-1.6px,.6px)", offset: 0.25 }, { transform: "translate(1.1px,-.4px)", offset: 0.6 }, { transform: "translate(0,0)" }], { duration: 120, easing: "linear" });
  q(".cp-knock-ring")?.animate([{ opacity: 0.4, transform: "scale(.35)" }, { opacity: 0, transform: "scale(1.35)" }], { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)" });
  for (const d of wall.querySelectorAll(".cp-knock-dust")) {
    const drift = (Math.random() - 0.5) * 3;
    d.animate([{ opacity: 0, transform: "translate(0,0)" }, { opacity: 0.85, offset: 0.15 }, { opacity: 0, transform: `translate(${drift}px, ${6 + Math.random() * 5}px)` }], { duration: 700 + Math.random() * 400, easing: "ease-in" });
  }
}

/* ---------- предпросмотр: один проигрыватель на мастерскую ---------- */

const pv = { knocker: null, key: null, root: null, ui: null, seen: 0 };

const keyOf = (p) => JSON.stringify([p.cipher?.words, p.speed, p.seed]);

function pvButton() {
  const btn = pv.root?.querySelector('[data-op="listen"]');
  if (!btn) return;
  const on = pv.knocker?.state === "playing";
  btn.innerHTML = `<i class="fa-solid ${on ? "fa-stop" : "fa-ear-listen"}" inert></i> ${esc(on ? t("Kind.knock.preview.stop") : t("Kind.knock.preview.listen"))}`;
}

function pvClear() {
  for (const el of pv.root?.querySelectorAll(".cp-knock-rl.is-on") ?? []) el.classList.remove("is-on");
}

function pvHit(hit) {
  const root = pv.root;
  if (!root) return;
  if (hit.n === 1 && hit.g === 0) {
    pvClear();
    root.querySelector(`.cp-knock-rl[data-l="${hit.l}"]`)?.classList.add("is-on");
  }
  if (hit.g === 1) {
    const pair = pv.knocker.s.pairs[hit.l];
    if (pair && hit.n === pair[1]) {
      root.querySelector(`.cp-knock-cell[data-rc="${pair[0]}-${pair[1]}"]`)?.animate?.([{ opacity: 0 }, { opacity: 0.55, offset: 0.15 }, { opacity: 0 }], { duration: 900, easing: "ease-out" });
    }
  }
}

/* ---------- окно игрока ---------- */

function toolbar(record) {
  return (
    '<div class="cp-toolbar cp-knock-bar" role="toolbar">' +
    `<button type="button" class="cp-btn cp-btn--primary" data-action="kind" data-op="play"><i class="fa-solid fa-play" inert></i> <span>${esc(t("Kind.knock.view.listen"))}</span></button>` +
    `<button type="button" class="cp-btn" data-action="kind" data-op="restart" data-tooltip="${esc(t("Kind.knock.view.againTip"))}"><i class="fa-solid fa-backward-step" inert></i> ${esc(t("Kind.knock.view.again"))}</button>` +
    `<button type="button" class="cp-btn" data-action="kind" data-op="record" aria-pressed="${record}" data-tooltip="${esc(t("Kind.knock.view.recordTip"))}"><i class="fa-solid fa-pen-nib" inert></i> ${esc(t("Kind.knock.view.record"))}</button>` +
    `<span class="cp-knock-state" data-knock-state aria-live="polite">${esc(t("Kind.knock.view.idle"))}</span>` +
    "</div>"
  );
}

function tableStage(alphabet, o = {}) {
  const g = tableGeom(alphabet);
  return `<div class="cp-fit"><div class="cp-stage" style="--cp-ratio:${num(g.w)}/${num(g.h)}"><div class="cp-sheet">${tableSvg(alphabet, { label: t("Kind.knock.part.table"), ...o })}</div></div></div>`;
}

function statusOf(p) {
  const c = p.cipher;
  const parts = [
    plural(c.letters, "Count.letters"),
    plural(c.words.length, "Kind.knock.words"),
    t("Kind.knock.status.time", { time: timeText(c.ms) }),
    c.alphabet === "en" ? t("Kind.knock.status.tableEn") : t("Kind.knock.status.tableRu"),
  ];
  if (c.swaps.length) parts.push(t("Kind.knock.status.swaps", { list: c.swaps.map(([a, b]) => `${a} → ${b}`).join(", ") }));
  if (c.dropped?.length) parts.push(t("Status.dropped", { chars: c.dropped.join(" ") }));
  return parts.join(" · ");
}

export default {
  id: "knock",
  icon: "fa-solid fa-hand-back-fist",

  defaults: () => ({ phrase: "", speed: "normal" }),

  fields: [
    { name: "phrase", type: "textarea", wide: true, rows: 2, style: "prose" },
    { group: [{ name: "speed", type: "select", options: ["slow", "normal", "fast"] }] },
  ],

  rebuildOn: ["phrase", "speed"],
  shuffle: false,

  build(p) {
    const res = encode(p.phrase);
    const letters = letterCount(res.words);
    if (!letters) return { problem: { error: "empty" } };
    if (letters > MAX_LETTERS) return { problem: { error: "tooLong", length: letters, max: MAX_LETTERS } };
    const { alphabet, words, text, swaps, dropped } = res;
    return { cipher: { alphabet, words, text, swaps, dropped, letters, ms: duration(words, p.speed) } };
  },

  problemText(pr) {
    if (pr.error === "tooLong") return t("Kind.knock.problem.tooLong", { letters: plural(pr.length, "Count.letters"), max: pr.max });
    return t("Kind.knock.problem.empty");
  },

  status: statusOf,

  meta: (p) => `${plural(p.cipher.letters, "Count.letters")} · ${timeText(p.cipher.ms)}`,

  parts: () => [
    { id: "knocks", icon: "fa-solid fa-hand-back-fist" },
    { id: "table", icon: "fa-solid fa-table-cells" },
  ],

  /** Стук — пары ударов (без букв); таблица — только какой алфавит. */
  view(p, parts) {
    const c = p.cipher;
    const v = {};
    if (parts.knocks) Object.assign(v, { words: c.words, speed: p.speed, seed: p.seed });
    if (parts.table) v.alphabet = c.alphabet;
    return v;
  },

  code(p) {
    const c = p.cipher;
    const notes = c.swaps.length ? [t("Kind.knock.swaps", { list: c.swaps.map(([a, b]) => `${a} → ${b}`).join(", ") })] : [];
    // в ключе точки крупнее (•), а серии одной буквы не разрываются переносом
    return { line: formatDots(c.words, "•").replace(/(•) (?=•)/g, "$1\u00a0"), notes, reads: c.text };
  },

  preview: {
    render(p, ui) {
      const c = p.cipher;
      const used = new Set(c.words.flat().map(([r, col]) => `${r}-${col}`));
      const on = Boolean(ui.listening && pv.knocker?.state === "playing");
      const record = recordSvg(c.words, { answer: c.text.replace(/ /g, ""), seed: p.seed, label: t("Kind.knock.part.record") });
      return (
        '<div class="cp-knock-pv">' +
        `<div class="cp-knock-pv__record">${record}</div>` +
        tableStage(c.alphabet, { used, cells: true }) +
        "</div>" +
        '<div class="cp-stepper">' +
        `<button type="button" class="cp-btn cp-btn--primary" data-action="kind" data-op="listen"><i class="fa-solid ${on ? "fa-stop" : "fa-ear-listen"}" inert></i> ${esc(on ? t("Kind.knock.preview.stop") : t("Kind.knock.preview.listen"))}</button>` +
        `<span class="cp-stepper__label">${esc(t("Kind.knock.preview.label", { speed: speedText(p.speed), time: timeText(c.ms) }))}</span>` +
        "</div>"
      );
    },
    action(op, ui, p) {
      if (op !== "listen" || !p?.cipher) return;
      if (pv.knocker?.state === "playing") {
        pv.knocker.stop();
        ui.listening = false;
        return;
      }
      pv.knocker?.stop();
      const sched = schedule(p.cipher.words, { speed: p.speed, seed: p.seed });
      sched.pairs = p.cipher.words.flat();
      pv.key = keyOf(p);
      pv.seen = performance.now();
      pv.knocker = new Knocker(sched, {
        seed: p.seed,
        onHit: pvHit,
        onState: (state) => {
          if (state !== "playing") {
            pvClear();
            if (pv.ui) pv.ui.listening = false;
          }
          pvButton();
        },
        // мастерская перерисовывает предпросмотр после каждой кнопки — даём ей миг вставить новый
        alive: () => {
          if (pv.root?.isConnected) pv.seen = performance.now();
          return performance.now() - pv.seen < 700;
        },
      });
      ui.listening = true;
      pv.ui = ui;
      pv.knocker.play();
    },
    after(root, ui, p) {
      const wrap = root.querySelector(".cp-knock-pv")?.parentElement ?? null;
      if (pv.knocker && (pv.key !== keyOf(p) || pv.ui !== ui)) {
        pv.knocker.stop();
        pv.knocker = null;
      }
      pv.root = wrap;
      pv.ui = ui;
      ui.listening = pv.knocker?.state === "playing";
      pvButton();
    },
  },

  player: {
    size: { width: 1060, height: 720 },
    hint(has) {
      if (has.knocks && has.table) return t("Kind.knock.view.hintFull");
      if (has.knocks) return t("Kind.knock.view.hintKnocks");
      return t("Kind.knock.view.hintTable");
    },
    render(view, has, state) {
      const record = state.record ?? true;
      const mode = has.knocks && has.table ? "both" : has.knocks ? "knocks" : "table";
      let main = "";
      if (has.knocks) {
        main =
          '<div class="cp-knock__main">' +
          `<div class="cp-knock-wall">${wallSvg(view.seed, { slice: true, label: t("Kind.knock.view.wall") })}</div>` +
          '<div class="cp-knock-progress" aria-hidden="true"><i></i></div>' +
          `<div class="cp-knock-scrap${record ? "" : " is-off"}">${recordSvg(view.words, { live: true, seed: view.seed, label: t("Kind.knock.part.record") })}<p class="cp-knock-scrap__empty">${esc(t("Kind.knock.view.scrapEmpty"))}</p></div>` +
          "</div>";
      }
      const side = has.table ? `<div class="cp-knock__side">${tableStage(view.alphabet)}</div>` : "";
      return (has.knocks ? toolbar(record) : "") + `<div class="cp-knock cp-knock--${mode}">${main}${side}</div>`;
    },
    bind(root, view, has, state, save) {
      if (!has.knocks) return {};
      const sched = schedule(view.words, { speed: view.speed, seed: view.seed });
      const wall = root.querySelector(".cp-knock-wall");
      const scrap = root.querySelector(".cp-knock-scrap");
      const empty = scrap?.querySelector(".cp-knock-scrap__empty");
      const dots = [...(scrap?.querySelectorAll(".cp-knock-d") ?? [])];
      const seps = new Map([...(scrap?.querySelectorAll(".cp-knock-sep") ?? [])].map((el) => [Number(el.dataset.i), el]));
      const bar = root.querySelector(".cp-knock-progress i");
      const playBtn = root.querySelector('[data-op="play"]');
      const recBtn = root.querySelector('[data-op="record"]');
      const stateEl = root.querySelector("[data-knock-state]");
      let record = state.record ?? true;

      const progress = (pos) => {
        const hit = sched.hits[Math.min(pos, sched.hits.length) - 1];
        if (bar) bar.style.transform = `scaleX(${hit ? num(hit.t / (sched.total || 1)) : 0})`;
      };
      const follow = (el) => {
        if (!scrap || !el?.getBoundingClientRect) return;
        const a = scrap.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        if (b.bottom > a.bottom - 6) scrap.scrollTop += b.bottom - a.bottom + 14;
        else if (b.top < a.top + 4) scrap.scrollTop -= a.top - b.top + 14;
      };
      const showUpTo = (pos) => {
        dots.forEach((d, i) => d.classList.toggle("is-on", i < pos));
        for (const [i, el] of seps) el.classList.toggle("is-on", i < pos);
        if (empty) empty.hidden = pos > 0;
        progress(pos);
        if (pos === 0 && scrap) scrap.scrollTop = 0;
        else follow(dots[pos - 1]);
      };
      const showRecord = () => {
        scrap?.classList.toggle("is-off", !record);
        recBtn?.setAttribute("aria-pressed", String(record));
      };
      const labels = {
        idle: t("Kind.knock.view.idle"),
        playing: t("Kind.knock.view.playing"),
        paused: t("Kind.knock.view.paused"),
        done: t("Kind.knock.view.done"),
      };
      const showState = (s) => {
        const on = s === "playing";
        if (stateEl) {
          stateEl.textContent = labels[s] ?? "";
          stateEl.classList.toggle("is-on", on);
        }
        if (s === "done" && bar) bar.style.transform = "scaleX(1)";
        if (playBtn) {
          playBtn.innerHTML = `<i class="fa-solid ${on ? "fa-pause" : "fa-play"}" inert></i> <span>${esc(on ? t("Kind.knock.view.pause") : t("Kind.knock.view.listen"))}</span>`;
        }
      };

      const knocker = new Knocker(sched, {
        seed: view.seed,
        alive: () => root.isConnected,
        onHit: (hit, i) => {
          dots[i]?.classList.add("is-on");
          seps.get(i)?.classList.add("is-on");
          if (empty) empty.hidden = true;
          progress(i + 1);
          if (record) follow(dots[i]);
          flash(wall);
        },
        onSeek: showUpTo,
        onState: showState,
      });
      showUpTo(0);

      return {
        action(op) {
          if (op === "play") {
            if (knocker.state === "playing") knocker.pause();
            else knocker.play();
          } else if (op === "restart") knocker.restart();
          else if (op === "record") {
            record = !record;
            showRecord();
            save({ record });
            if (record) follow(dots[knocker.pos - 1]);
          }
        },
        apply(next) {
          record = next.record ?? true;
          showRecord();
        },
      };
    },
  },

  images(p) {
    const c = p.cipher;
    return [
      { id: "table", svg: (px) => tableSvg(c.alphabet, { px, label: t("Kind.knock.part.table") }) },
      { id: "record", svg: (px) => recordSvg(c.words, { px, seed: p.seed, label: t("Kind.knock.part.record") }) },
    ];
  },

  // Пример для стенда и снимков README — на языке интерфейса.
  demo: () =>
    globalThis.game?.i18n?.lang === "en"
      ? {
          title: "Knocks through the wall",
          phrase: "Escape tomorrow. Wait!",
          speed: "normal",
          seed: 1825,
        }
      : {
          title: "Стук из-за стены",
          phrase: "Завтра побег. Жди!",
          speed: "normal",
          seed: 1825,
        },
};
