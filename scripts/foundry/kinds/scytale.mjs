/* Скитала: длинная лента пергамента с буквами вперемешку и деревянный жезл с гранями.
   Ленту наматывают на жезл: при верной толщине вдоль граней читается фраза.
   Ядро — scripts/core/scytale.mjs; здесь поля мастерской, рисунки, окно игрока и картинки. */

import { FACES, generate, isTail, MAX_LETTERS, WIND } from "../../core/scytale.mjs";
import { esc, plural, t } from "../i18n.mjs";
import { brass, INK, INK_SOFT, LIT, num, paper, scriptAttrs, SERIF, SERIF_SC, svgOpen, uid, xml } from "../paper.mjs";

const clampN = (n, lo = WIND.min, hi = WIND.max) => Math.min(hi, Math.max(lo, Math.round(Number(n)) || lo));

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Смешать два цвета #rrggbb: k = 0 — первый, 1 — второй. */
function mix(a, b, k) {
  const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const [A, B] = [p(a), p(b)];
  return `#${A.map((v, i) => Math.round(v + (B[i] - v) * Math.min(1, Math.max(0, k))).toString(16).padStart(2, "0")).join("")}`;
}

/** Дерево: продольные волокна вдоль жезла. Возвращает { defs, fill, grain }. */
function wood() {
  const id = uid();
  return {
    defs:
      `<linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a06a3a"/><stop offset=".5" stop-color="#7d4c25"/><stop offset="1" stop-color="#5c3517"/></linearGradient>` +
      `<filter id="${id}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".006 .42" numOctaves="3" seed="11" result="n"/><feColorMatrix in="n" values="0 0 0 0 .16  0 0 0 0 .08  0 0 0 0 .02  0 0 0 .9 -.28" result="c"/><feComposite in="c" in2="SourceGraphic" operator="in"/></filter>`,
    fill: `url(#${id}w)`,
    grain: `url(#${id}g)`,
  };
}

/** Мягкая тень под предметом (для картинок и окна одинаково). */
const blur = (id, sd) => `<filter id="${id}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;

/* ---------- лента ---------- */

const RC = 8; // клетка ленты
const RB = 12; // высота ленты
const RG = 8; // зазор между кусками
const PER_ROW = 30;

/** Лента в окне и на картинке переносится кусками поровну, не длиннее PER_ROW букв. */
function ribbonRows(length) {
  const rows = Math.max(1, Math.ceil(length / PER_ROW));
  return { rows, per: Math.ceil(length / rows) };
}

const ribbonBox = (length) => {
  const { rows, per } = ribbonRows(length);
  return [-7, -3, per * RC + 14, rows * (RB + RG) - RG + 8];
};

/** Неровный край пергамента: детерминированная волна. */
const wob = (k, r, s) => num(0.32 * Math.sin(k * 1.73 + r * 3.1 + s) + 0.18 * Math.sin(k * 4.37 + s * 2));

/**
 * Лента: куски одной полосы пергамента, буквы по одной в клетке. Кусок кончается загибом — лента уходит под себя
 * и продолжается следующим куском. o.dim(k) — буква-пустышка (для ведущего); o.px, o.label — для картинки.
 */
export function ribbonSvg(ribbon, o = {}) {
  const L = ribbon.length;
  const { rows, per } = ribbonRows(L);
  const box = ribbonBox(L);
  const id = uid();
  const bands = [];
  const flaps = [];
  for (let r = 0; r < rows; r++) {
    const start = r * per;
    const count = Math.min(per, L - start);
    const y = r * (RB + RG);
    const w = count * RC;
    const top = [];
    const bottom = [];
    for (let k = 0; k <= count * 2; k++) {
      top.push(`${num((k * RC) / 2)},${num(y + wob(k, r, 0))}`);
      bottom.push(`${num((k * RC) / 2)},${num(y + RB + wob(k, r, 1.4))}`);
    }
    const lead = r === 0 ? [`-1.2,${num(y + RB)}`, `-.4,${y}`] : [`-1.6,${num(y + RB)}`, `-1.6,${y}`];
    const end = r === rows - 1 ? [`${num(w + 0.6)},${y}`, `${num(w + 1.4)},${num(y + RB)}`] : [`${num(w + 1.6)},${y}`, `${num(w + 1.6)},${num(y + RB)}`];
    bands.push(`M${lead[1]}L${top.join("L")}L${end[0]}L${end[1]}L${bottom.reverse().join("L")}L${lead[0]}Z`);
    // загиб: обратная сторона ленты косым треугольником на конце куска и в начале следующего
    if (r < rows - 1) flaps.push(`M${num(w + 1.6)},${y}L${num(w + 5.2)},${num(y + RB)}L${num(w + 1.6)},${num(y + RB)}Z`);
    if (r > 0) flaps.push(`M-1.6,${y}L-5.2,${y}L-1.6,${num(y + RB)}Z`);
  }
  const out = [svgOpen(box, { ...o, cls: "cp-scytale-ribbon-svg" })];
  out.push(`<defs><pattern id="${id}p" patternUnits="userSpaceOnUse" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}">${paper([0, 0, box[2], box[3]], { tone: "old" })}</pattern>${blur(`${id}s`, 1.1)}</defs>`);
  out.push(`<g fill="#000" opacity=".5" filter="url(#${id}s)" transform="translate(.5 1.3)"><path d="${bands.join("")}${flaps.join("")}"/></g>`);
  out.push(`<path d="${flaps.join("")}" fill="#b49563" stroke="#8a6c40" stroke-width=".3" stroke-linejoin="round"/>`);
  out.push(`<path d="${bands.join("")}" fill="url(#${id}p)" stroke="#a3845a" stroke-width=".35" stroke-linejoin="round"/>`);
  out.push(`<g ${scriptAttrs(o.script, 6.8, { bold: true, fallback: "print" })} fill="${INK}" text-anchor="middle">`);
  [...ribbon].forEach((ch, k) => {
    const r = Math.floor(k / per);
    const x = (k - r * per) * RC + RC / 2;
    const y = r * (RB + RG) + RB / 2;
    const dim = o.dim?.(k) ? ` fill="${INK_SOFT}" fill-opacity=".55"` : "";
    out.push(`<text class="cp-scytale-l" data-i="${k}" x="${num(x)}" y="${num(y)}" dy=".35em"${dim}>${xml(ch)}</text>`);
  });
  out.push("</g></svg>");
  return out.join("");
}

/* ---------- намотка ---------- */

const WC = 9; // ширина витка
const WR = 10; // высота грани
const HANDLE = 20; // жезл выступает из-под ленты с каждой стороны

/** Рамка рисунка намотки: n граней, витков сколько нужно на всю ленту. */
function windBox(length, n) {
  const turns = Math.ceil(length / n);
  return [-HANDLE - 2, -3, (turns + 1) * WC + 2 * HANDLE + 4, n * WR + 6];
}

/** Где буква ленты k на намотке: виток идёт по кругу, после полного оборота лента сдвигается на свою ширину. */
const windAt = (k, n) => {
  const row = k % n;
  const turn = Math.floor(k / n);
  return { row, turn, x: turn * WC + WC / 2 + ((row + 0.5) * WC) / n, y: row * WR + WR / 2 };
};

/**
 * Лента на жезле в n граней: грани — ряды вдоль жезла, витки — косые полосы ленты.
 * o.lit(k) — буква фразы (подсветка у ведущего), o.dim(k) — пустышка; o.label — для чтеца экрана.
 */
export function windSvg(ribbon, n, o = {}) {
  const L = ribbon.length;
  const turns = Math.ceil(L / n);
  const H = n * WR;
  const span = (turns + 1) * WC;
  const x0 = -HANDLE;
  const x1 = span + HANDLE;
  const box = windBox(L, n);
  const id = uid();
  const w = wood();
  const b = brass();
  const slant = (y) => (WC * y) / H;
  const out = [svgOpen(box, { ...o, cls: "cp-scytale-wind-svg" })];
  out.push(`<defs>${w.defs}${b.defs}${blur(`${id}s`, 0.7)}<pattern id="${id}p" patternUnits="userSpaceOnUse" x="0" y="0" width="${span}" height="${H}">${paper([0, 0, span, H], { tone: "old", rx: 0 })}</pattern></defs>`);

  // жезл: грани — ряды вдоль, светлее и темнее через одну, на концах латунь
  out.push(`<rect x="${x0}" y="0" width="${x1 - x0}" height="${H}" rx="1.2" fill="${w.fill}"/>`);
  out.push(`<rect x="${x0}" y="0" width="${x1 - x0}" height="${H}" rx="1.2" fill="#000" filter="${w.grain}"/>`);
  out.push("<g>");
  for (let i = 0; i < n; i++) out.push(`<rect x="${x0}" y="${i * WR}" width="${x1 - x0}" height="${WR}" fill="${i % 2 ? "#000" : "#ffe7c0"}" opacity="${i % 2 ? 0.1 : 0.05}"/>`);
  out.push("</g>");
  out.push(`<g stroke-width=".4">`);
  for (let i = 1; i < n; i++) out.push(`<path d="M${x0},${i * WR}H${x1}" stroke="#2a160a" opacity=".55"/><path d="M${x0},${num(i * WR + 0.45)}H${x1}" stroke="#e6b57a" opacity=".22"/>`);
  out.push("</g>");
  for (const [cx, cw] of [[x0, 5], [x1 - 5, 5]]) {
    out.push(`<rect x="${cx}" y="-.6" width="${cw}" height="${H + 1.2}" rx="1.4" fill="${b.fill}" stroke="#3b2a12" stroke-width=".4"/>`);
    out.push(`<rect x="${cx}" y="-.6" width="${cw}" height="${H + 1.2}" rx="1.4" fill="${b.shine}"/>`);
  }
  out.push(`<rect x="${x0}" y="0" width="${x1 - x0}" height="${H}" rx="1.2" fill="none" stroke="#24130a" stroke-width=".5"/>`);
  // номера граней — выжжены на рукояти
  out.push(`<g font-family="${SERIF}" font-weight="700" font-size="${num(Math.min(4.6, WR * 0.46))}" fill="#f1dcb2" fill-opacity=".72" text-anchor="middle" style="font-variant-numeric:lining-nums">`);
  for (let i = 0; i < n; i++) out.push(`<text x="${num(x0 + 5 + (HANDLE - 5) / 2 - 1)}" y="${i * WR + WR / 2}" dy=".35em">${i + 1}</text>`);
  out.push("</g>");

  // витки ленты: косые полосы, последний обрезан там, где кончилась лента
  const turnPath = (j) => {
    const h = Math.min(n, L - j * n) * WR;
    const l = j * WC;
    return `M${l},0H${l + WC}L${num(l + WC + slant(h))},${h}H${num(l + slant(h))}Z`;
  };
  const all = Array.from({ length: turns }, (_, j) => turnPath(j)).join("");
  out.push(`<path d="${all}" fill="#000" opacity=".55" filter="url(#${id}s)" transform="translate(.4 .5)"/>`);
  out.push('<g class="cp-scytale-turns">');
  for (let j = 0; j < turns; j++) {
    const d = turnPath(j);
    const h = Math.min(n, L - j * n) * WR;
    const l = j * WC;
    out.push(`<g class="cp-scytale-turn" style="--j:${j}">`);
    out.push(`<path d="${d}" fill="url(#${id}p)"/>`);
    if (j % 2) out.push(`<path d="${d}" fill="#5a3510" opacity=".07"/>`);
    // складки на рёбрах жезла
    for (let i = 1; i < n && i * WR < h; i++) {
      const y = i * WR;
      out.push(`<path d="M${num(l + slant(y))},${y}h${WC}" stroke="#6b4a26" stroke-width=".35" opacity=".35"/>`);
    }
    out.push(`<path d="M${l},0L${num(l + slant(h))},${h}" stroke="#5a3d1c" stroke-width=".45" opacity=".75"/>`);
    out.push(`<path d="M${l + 0.45},0L${num(l + 0.45 + slant(h))},${h}" stroke="#fff6de" stroke-width=".3" opacity=".45"/>`);
    out.push("</g>");
  }
  out.push(`<path d="${all}" fill="none" stroke="#7a5a32" stroke-width=".3" opacity=".7"/>`);
  out.push("</g>");

  // буквы: ряд — грань, читается слева направо
  out.push(`<g ${scriptAttrs(o.script, 6.6, { bold: true, fallback: "print" })} fill="${INK}" text-anchor="middle">`);
  [...ribbon].forEach((ch, k) => {
    const p = windAt(k, n);
    const fill = o.lit?.(k) ? ` fill="${LIT}"` : o.dim?.(k) ? ` fill="${INK_SOFT}" fill-opacity=".5"` : "";
    out.push(`<text class="cp-scytale-l" data-i="${k}" x="${num(p.x)}" y="${p.y}" dy=".35em"${fill}>${xml(ch)}</text>`);
  });
  out.push("</g>");
  out.push(`<rect class="cp-scytale-sheen" x="0" y="0" width="${num(span / 3)}" height="${H}" fill="url(#${id}h)" opacity="0"/>`);
  out.push(`<defs><linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff2c8" stop-opacity="0"/><stop offset=".5" stop-color="#fff2c8" stop-opacity=".55"/><stop offset="1" stop-color="#fff2c8" stop-opacity="0"/></linearGradient></defs>`);
  out.push("</svg>");
  return out.join("");
}

/** Рисунок намотки в окне: вписан в место, но не мельче 2,5 пикселя на единицу — дальше прокрутка. */
const windHtml = (ribbon, n, o = {}) => windSvg(ribbon, n, o).replace(/^<svg/, `<svg style="min-width:${Math.round(windBox(ribbon.length, n)[2] * 2.5)}px"`);

/* ---------- жезл ---------- */

const ROD_BOX = [0, 0, 250, 86];

/**
 * Жезл: многогранный посох сбоку, торец с кольцами — видно, сколько граней; латунные кольца на концах,
 * на шнурке — бирка с числом граней.
 */
export function rodSvg(faces, o = {}) {
  const n = faces;
  const id = uid();
  const w = wood();
  const R = 12.5;
  const rx = R * 0.42;
  const cx = 20;
  const cy = 22;
  const len = 204;
  const half = Math.PI / n;
  // жезл чуть повёрнут: к нам смотрят две-три грани, а не одна плоская
  const turn = 0.35 * 2 * half;
  const v = (phi, dx = 0, s = 1) => `${num(cx + dx + s * rx * Math.cos(phi))},${num(cy + s * R * Math.sin(phi))}`;
  const lightV = [-0.35, -0.75, 0.55];
  const ll = Math.hypot(...lightV);
  const sides = [];
  for (let k = 0; k < n; k++) {
    const th = Math.atan2(Math.sin(2 * half * k + turn), Math.cos(2 * half * k + turn));
    if (Math.cos(th) <= 1e-6) continue;
    const dot = (lightV[1] * Math.sin(th) + lightV[2] * Math.cos(th)) / ll;
    sides.push({ a: th - half, b: th + half, lum: 0.22 + 0.85 * Math.max(0, dot) });
  }
  sides.sort((p, q) => p.a - q.a);
  const quad = (s, d0, d1) => `M${v(s.a, d0)}L${v(s.b, d0)}L${v(s.b, d1)}L${v(s.a, d1)}Z`;
  const body = sides.map((s) => quad(s, 0, len)).join("");
  const corner = (i, s = 1) => v(2 * half * i + half + turn, 0, s);
  const cap = Array.from({ length: n }, (_, i) => corner(i)).join("L");
  const ring = (s) => Array.from({ length: n }, (_, i) => corner(i, s)).join("L");
  const top = cy + R * Math.sin(sides[0].a);
  const bottom = cy + R * Math.sin(sides.at(-1).b);

  const out = [svgOpen(ROD_BOX, { ...o, cls: "cp-scytale-rod-svg" })];
  out.push(`<defs>${w.defs}${blur(`${id}s`, 2.2)}</defs>`);
  out.push(`<ellipse cx="${cx + len / 2}" cy="${num(bottom + 5)}" rx="${len / 2 + 6}" ry="3.4" fill="#000" opacity=".42" filter="url(#${id}s)"/>`);
  // грани дерева: светлее та, что к свету
  for (const s of sides) out.push(`<path d="${quad(s, 0, len)}" fill="${mix("#3a1f0e", "#cf975e", s.lum)}"/>`);
  out.push(`<path d="${body}" fill="#000" filter="${w.grain}"/>`);
  // латунь: кольцо у торца и наконечник
  for (const [d0, d1] of [[6, 14], [len - 12, len]]) {
    for (const s of sides) out.push(`<path d="${quad(s, d0, d1)}" fill="${mix("#4a3312", "#f3d590", s.lum)}" stroke="#3b2a12" stroke-width=".3"/>`);
  }
  // рёбра граней блестят
  out.push('<g stroke="#ffe2b0" stroke-width=".35" opacity=".45">');
  for (let i = 0; i < sides.length - 1; i++) out.push(`<path d="M${v(sides[i].b)}L${v(sides[i].b, len)}"/>`);
  out.push("</g>");
  out.push(`<path d="${body}" fill="none" stroke="#24130a" stroke-width=".45" stroke-linejoin="round"/>`);
  // торец: срез дерева с годовыми кольцами
  out.push(`<path d="M${cap}Z" fill="#c08a55" stroke="#2c180a" stroke-width=".5" stroke-linejoin="round"/>`);
  out.push(`<g fill="none" stroke="#6e4320" stroke-width=".35" opacity=".55">${[0.72, 0.48, 0.24].map((s) => `<path d="M${ring(s)}Z"/>`).join("")}</g>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r=".6" fill="#6e4320" opacity=".7"/>`);

  // бирка на шнурке
  const tx = 116;
  const ty = 46;
  const tw = 70;
  const th = 30;
  const hole = [tx + 8, ty + th / 2];
  const kx = tx + 14;
  out.push('<g fill="none" stroke-linecap="round">');
  for (const dx of [-1, 0.9]) {
    out.push(`<path d="M${num(kx + dx - 0.9)},${num(top - 0.3)}L${num(kx + dx + 0.9)},${num(bottom + 0.3)}" stroke="#3e2410" stroke-width="1.1"/>`);
    out.push(`<path d="M${num(kx + dx - 1.1)},${num(top + 0.4)}L${num(kx + dx + 0.5)},${num(bottom - 1)}" stroke="#c9a06a" stroke-width=".3" opacity=".7"/>`);
  }
  out.push(`<path d="M${kx + 1.6},${num(bottom)}C${kx + 1},${num(bottom + 5)} ${hole[0] - 2},${ty - 5} ${hole[0] - 1},${ty + 0.4}" stroke="#4a2e14" stroke-width=".8"/>`);
  out.push("</g>");
  out.push(`<g transform="rotate(-4 ${hole[0]} ${hole[1]})">`);
  out.push(`<rect x="${tx + 0.8}" y="${ty + 1.4}" width="${tw}" height="${th}" rx="2" fill="#000" opacity=".4" filter="url(#${id}s)"/>`);
  out.push(paper([tx, ty, tw, th], { tone: "old", rx: 2 }));
  out.push(`<rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="2" fill="none" stroke="#9c7d50" stroke-width=".4"/>`);
  out.push(`<circle cx="${hole[0]}" cy="${hole[1]}" r="1.6" fill="#5a3d1e" stroke="#3a2412" stroke-width=".3"/>`);
  out.push(`<path d="M${hole[0]},${hole[1] - 1}C${hole[0] + 0.6},${hole[1] - 6} ${hole[0] - 0.4},${ty + 3} ${hole[0]},${ty}" fill="none" stroke="#4a2e14" stroke-width=".8" stroke-linecap="round"/>`);
  const mid = tx + 8 + (tw - 8) / 2;
  out.push(`<text x="${mid}" y="${ty + 12.5}" font-family="${SERIF_SC}" font-weight="700" font-size="12" fill="${INK}" text-anchor="middle">${ROMAN[n] ?? n}</text>`);
  out.push(`<text x="${mid}" y="${ty + 23.5}" font-family="${SERIF}" font-style="italic" font-size="6.4" fill="${INK}" text-anchor="middle">${xml(plural(n, "Kind.scytale.faces"))}</text>`);
  out.push("</g></svg>");
  return out.join("");
}

/* ---------- окно ---------- */

const windLabel = () => t("Kind.scytale.view.windAria");

/** Лента и под ней намотка. */
function desk(ribbon, n, o = {}) {
  const box = ribbonBox(ribbon.length);
  return (
    `<div class="cp-scytale-desk">` +
    `<div class="cp-scytale-ribbon" style="--cp-scytale-max:${Math.round(box[2] * 2.9)}px">${ribbonSvg(ribbon, { dim: o.dim, script: o.script, label: t("Kind.scytale.part.ribbon") })}</div>` +
    `<div class="cp-scytale-wind" data-wind>${windHtml(ribbon, n, { ...o, label: windLabel() })}</div>` +
    `</div>`
  );
}

const rodStage = (faces) =>
  `<div class="cp-fit"><div class="cp-stage cp-scytale-rodstage" style="--cp-ratio:${ROD_BOX[2]}/${ROD_BOX[3]}">${rodSvg(faces, { label: t("Kind.scytale.part.rod") })}</div></div>`;

const iconBtn = (op, icon, label, disabled) =>
  `<button type="button" class="cp-btn cp-btn--icon" data-action="kind" data-op="${op}" data-tooltip="${esc(label)}" aria-label="${esc(label)}"${disabled ? " disabled" : ""}><i class="fa-solid ${icon}" inert></i></button>`;

const facesWord = (n) => `<b>${n}</b> ${esc(plural(n, "Kind.scytale.facesWord"))}`;

function statusOf(p) {
  const c = p.cipher;
  const faces = plural(c.faces, "Kind.scytale.faces");
  const parts = [plural(c.text.length, "Count.letters"), t(c.auto ? "Kind.scytale.status.facesAuto" : "Kind.scytale.status.faces", { faces })];
  let ribbon = t("Kind.scytale.status.ribbon", { letters: plural(c.ribbon.length, "Count.letters") });
  if (c.tail) ribbon += `, ${plural(c.tail, "Kind.scytale.status.tail")}`;
  parts.push(ribbon);
  if (c.dropped?.length) parts.push(t("Status.dropped", { chars: c.dropped.join(" ") }));
  return parts.join(" · ");
}

export default {
  id: "scytale",
  icon: "fa-solid fa-scroll",
  script: "print",

  defaults: () => ({ phrase: "", faces: null, yo: true }),

  fields: [
    { name: "phrase", type: "textarea", wide: true, rows: 3, style: "prose" },
    {
      group: [
        { name: "faces", type: "number", min: FACES.min, max: FACES.max, auto: true },
        { name: "yo", type: "checkbox" },
      ],
    },
  ],

  rebuildOn: ["phrase", "faces", "yo"],
  shuffle: true,

  build(p) {
    const res = generate({ phrase: p.phrase, faces: p.faces, seed: p.seed, yo: p.yo });
    if (!res.ok) return { problem: { error: res.error, length: res.length ?? 0, max: res.max ?? MAX_LETTERS } };
    const { faces, auto, cols, text, alphabet, dropped, ribbon, tail } = res;
    return { cipher: { faces, auto, cols, text, alphabet, dropped, ribbon, tail } };
  },

  problemText(pr) {
    if (pr.error === "tooLong") return t("Kind.scytale.problem.tooLong", { letters: plural(pr.length, "Count.letters"), max: pr.max });
    return t("Kind.scytale.problem.empty");
  },

  status: statusOf,

  meta: (p) => `${plural(p.cipher.faces, "Kind.scytale.faces")} · ${plural(p.cipher.text.length, "Count.letters")}`,

  parts: () => [
    { id: "ribbon", icon: "fa-solid fa-scroll" },
    { id: "rod", icon: "fa-solid fa-wand-magic" },
  ],

  /** Игроку — только то, что в руках: лента без толщины, жезл без букв. */
  view(p, parts) {
    const v = {};
    if (parts.ribbon) Object.assign(v, { ribbon: p.cipher.ribbon, script: p.script ?? "print" });
    if (parts.rod) v.faces = p.cipher.faces;
    return v;
  },

  code(p) {
    const c = p.cipher;
    const notes = c.tail ? [plural(c.tail, "Kind.scytale.tailNote")] : [];
    return { line: t("Kind.scytale.code", { faces: plural(c.faces, "Kind.scytale.faces") }), notes, reads: c.text };
  },

  preview: {
    render(p, ui) {
      const c = p.cipher;
      if (ui.faces !== c.faces) {
        ui.faces = c.faces;
        ui.n = c.faces;
      }
      ui.n = clampN(ui.n ?? c.faces);
      const right = ui.n === c.faces;
      const dim = (k) => isTail(k, c);
      const body = desk(c.ribbon, ui.n, { dim, script: p.script ?? "print", lit: right ? (k) => !dim(k) : null });
      const faces = plural(ui.n, "Kind.scytale.faces");
      const label = t(right ? "Kind.scytale.preview.right" : "Kind.scytale.preview.wrong", { faces });
      const controls =
        `<div class="cp-stepper" role="group" aria-label="${esc(t("Kind.scytale.view.thickness"))}">` +
        iconBtn("thinner", "fa-minus", t("Kind.scytale.view.thinner"), ui.n <= WIND.min) +
        `<button type="button" class="cp-btn" data-action="kind" data-op="answer" aria-pressed="${right}">${esc(t("Preview.answer"))}</button>` +
        `<span class="cp-stepper__label">${esc(label)}</span>` +
        iconBtn("thicker", "fa-plus", t("Kind.scytale.view.thicker"), ui.n >= WIND.max) +
        "</div>";
      return body + controls;
    },
    action(op, ui, p) {
      if (op === "thinner") ui.n = clampN((ui.n ?? p.cipher.faces) - 1);
      else if (op === "thicker") ui.n = clampN((ui.n ?? p.cipher.faces) + 1);
      else if (op === "answer") ui.n = p.cipher.faces;
    },
  },

  player: {
    size: { width: 1000, height: 760 },
    hint: (has) => t(has.ribbon && has.rod ? "Kind.scytale.view.hintFull" : has.ribbon ? "Kind.scytale.view.hintRibbon" : "Kind.scytale.view.hintRod"),
    render(view, has, state) {
      if (!view.ribbon) return view.faces ? rodStage(view.faces) : "";
      const n = clampN(state.n ?? WIND.min);
      const windBtn = view.faces
        ? `<button type="button" class="cp-btn cp-btn--primary" data-action="kind" data-op="wind" data-tooltip="${esc(t("Kind.scytale.view.windTip", { faces: plural(view.faces, "Kind.scytale.faces") }))}"><i class="fa-solid fa-scroll" inert></i> ${esc(t("Kind.scytale.view.wind"))}</button>`
        : "";
      const bar =
        `<div class="cp-toolbar cp-scytale-bar" role="toolbar" aria-label="${esc(t("Kind.scytale.view.thickness"))}">` +
        `<span class="cp-scytale-bar__label">${esc(t("Kind.scytale.view.thickness"))}</span>` +
        iconBtn("thinner", "fa-minus", t("Kind.scytale.view.thinner"), n <= WIND.min) +
        `<output class="cp-scytale-n" data-n aria-live="polite">${facesWord(n)}</output>` +
        iconBtn("thicker", "fa-plus", t("Kind.scytale.view.thicker"), n >= WIND.max) +
        windBtn +
        `</div>`;
      return bar + desk(view.ribbon, n, { script: view.script });
    },
    bind(root, view, has, state, save) {
      if (!view.ribbon) return {};
      const out = root.querySelector("[data-n]");
      const wound = root.querySelector("[data-wind]");
      const minus = root.querySelector('[data-op="thinner"]');
      const plus = root.querySelector('[data-op="thicker"]');
      let n = clampN(state.n ?? WIND.min);
      let timer = null;
      let hot = null;

      const draw = (next, { winding = false } = {}) => {
        n = clampN(next);
        out.innerHTML = facesWord(n);
        minus.disabled = n <= WIND.min;
        plus.disabled = n >= WIND.max;
        const scroll = wound.scrollLeft;
        wound.innerHTML = windHtml(view.ribbon, n, { script: view.script, label: windLabel() });
        wound.scrollLeft = scroll;
        wound.classList.toggle("is-winding", winding);
        wound.classList.remove("is-snug");
        hot = null;
      };
      const stop = () => {
        clearInterval(timer);
        timer = null;
      };
      const set = (next) => {
        stop();
        if (clampN(next) === n) return;
        draw(next);
        save({ n });
      };
      // «Намотать на жезл»: толщина бежит к числу граней, и лента ложится виток за витком
      const windOnRod = () => {
        stop();
        const goal = clampN(view.faces);
        const finish = () => {
          draw(goal, { winding: true });
          void wound.offsetWidth;
          wound.classList.add("is-snug");
          save({ n: goal });
        };
        if (n === goal || matchMedia("(prefers-reduced-motion: reduce)").matches) return finish();
        timer = setInterval(() => {
          if (!wound.isConnected) return stop();
          const next = n + Math.sign(goal - n);
          if (next === goal) {
            stop();
            finish();
          } else draw(next);
        }, 110);
      };

      // одна и та же буква на ленте и на жезле подсвечивается вместе
      const light = (k) => {
        if (k === hot) return;
        for (const el of root.querySelectorAll(".cp-scytale-l.is-hot")) el.classList.remove("is-hot");
        hot = k;
        if (k !== null) for (const el of root.querySelectorAll(`.cp-scytale-l[data-i="${k}"]`)) el.classList.add("is-hot");
      };
      root.addEventListener("pointerover", (event) => {
        const el = event.target.closest?.(".cp-scytale-l");
        light(el ? el.dataset.i : null);
      });
      root.addEventListener("pointerleave", () => light(null));

      return {
        action(op) {
          if (op === "thinner") set(n - 1);
          else if (op === "thicker") set(n + 1);
          else if (op === "wind" && view.faces) windOnRod();
        },
        apply(next) {
          const m = clampN(next?.n ?? WIND.min);
          if (m === n && !timer) return;
          stop();
          draw(m);
        },
      };
    },
  },

  images(p) {
    const c = p.cipher;
    return [
      { id: "ribbon", svg: (px) => ribbonSvg(c.ribbon, { px, script: p.script ?? "print", label: t("Kind.scytale.part.ribbon") }) },
      { id: "rod", svg: (px) => rodSvg(c.faces, { px, label: t("Kind.scytale.part.rod") }) },
    ];
  },

  demo: () => ({
    title: "Приказ коменданта",
    phrase: "Гарнизон уходит к перевалу на рассвете. Ворота открыть",
    faces: 6,
    seed: 20261017,
  }),
};
