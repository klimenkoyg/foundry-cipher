/* Шифровальный диск (Цезарь, диск Альберти): записка, написанная буквами внутреннего кольца,
   и латунный диск из двух колец. Игрок крутит внутреннее кольцо, пока абракадабра не станет словами.
   Ядро — scripts/core/disk.mjs; здесь поля мастерской, рисунки, окно игрока и картинки. */

import { decrypt, generate, mod, underOf } from "../../core/disk.mjs";
import { clamp } from "../../core/rng.mjs";
import { esc, plural, t } from "../i18n.mjs";
import { brass, INK, INK_SOFT, LIT, num, paper, scriptAttrs, SERIF, svgOpen, uid, xml } from "../paper.mjs";

/* ---------- записка ---------- */

/** Ширина знаков Alegreya курсивом, сотые доли кегля (замерено в браузере): по ним строки
    переносятся, а расшифровка встаёт точно под своей буквой. */
const GLYPHS = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?-–—«»„“”\"'()…/№*";
const ADVANCE = [
  56, 60, 57, 48, 60, 57, 57, 89, 51, 73, 73, 62, 66, 81, 72, 67, 70, 53, 60, 52, 56, 69, 63, 69, 58, 103, 100, 62, 83, 55, 60, 97, 58,
  47, 43, 39, 34, 40, 36, 36, 72, 36, 50, 50, 45, 39, 61, 51, 41, 50, 47, 35, 73, 41, 62, 51, 51, 46, 74, 75, 43, 61, 42, 37, 63, 45,
  56, 57, 60, 68, 57, 49, 64, 72, 35, 31, 60, 49, 81, 69, 67, 53, 67, 59, 51, 52, 66, 58, 89, 63, 51, 54,
  46, 45, 34, 46, 36, 26, 44, 49, 26, 25, 45, 25, 74, 50, 41, 47, 44, 35, 34, 29, 49, 42, 64, 46, 44, 40,
  51, 34, 46, 40, 43, 41, 44, 40, 47, 44, 17, 30, 23, 23, 23, 27, 35, 31, 44, 88, 41, 41, 38, 34, 34, 30, 18, 30, 30, 63, 32, 89, 44,
];
const WIDTH = new Map([...GLYPHS].map((ch, i) => [ch, ADVANCE[i] / 100]));
const TRACK = 0.025;
const SPACE = 0.32;
const adv = (ch) => (WIDTH.get(ch) ?? (/\p{Lu}/u.test(ch) ? 0.62 : 0.48)) + TRACK;

/** Кегль записки и поля листа (в единицах рисунка — тех же, что у диска). */
const F = 11;
const NOTE = { mx: 1.7 * F, top: 2.3 * F, bottom: 1.5 * F, pitch: 1.75 * F, pitchGloss: 2.4 * F };

/**
 * Строки записки: перенос по словам по ширине знаков; ширина строки — по длине текста, чтобы лист
 * был не слишком узким и не слишком длинным. Каждый знак — { i, ch, x }: i — номер в тексте записки
 * (по нему под буквой встаёт расшифровка), x — середина знака в кеглях от начала строки.
 */
function noteLines(note) {
  const text = String(note ?? "");
  const words = (s) => [...s].reduce((sum, ch) => sum + adv(ch), 0);
  const gaps = text.match(/\s+/g)?.length ?? 0;
  const total = words(text.replace(/\s+/g, "")) + gaps * SPACE;
  const max = clamp(Math.sqrt(total * 3.6), 12, 30);
  const lines = [];
  const place = (list) => {
    const glyphs = [];
    let x = 0;
    list.forEach((w, k) => {
      if (k) x += SPACE;
      for (let j = 0; j < w.text.length; j++) {
        const a = adv(w.text[j]);
        glyphs.push({ i: w.at + j, ch: w.text[j], x: x + a / 2 });
        x += a;
      }
    });
    return { glyphs, width: x };
  };
  let base = 0;
  for (const para of text.split("\n")) {
    const list = [];
    for (const m of para.matchAll(/\S+/gu)) {
      // Слово длиннее строки (фраза без пробелов) режется по буквам.
      let at = base + m.index;
      let chunk = "";
      for (const ch of m[0]) {
        if (chunk && words(chunk + ch) > max) {
          list.push({ at, text: chunk, w: words(chunk) });
          at += chunk.length;
          chunk = "";
        }
        chunk += ch;
      }
      if (chunk) list.push({ at, text: chunk, w: words(chunk) });
    }
    let cur = [];
    let width = 0;
    for (const w of list) {
      if (cur.length && width + SPACE + w.w > max) {
        lines.push(place(cur));
        cur = [];
        width = 0;
      }
      width += (cur.length ? SPACE : 0) + w.w;
      cur.push(w);
    }
    lines.push(place(cur));
    base += para.length + 1;
  }
  return lines;
}

/** Лист записки: размеры и строки. gloss — с местом под расшифровку. */
function noteLayout(note, gloss = false) {
  const lines = noteLines(note);
  const pitch = gloss ? NOTE.pitchGloss : NOTE.pitch;
  const width = Math.max(8, ...lines.map((l) => l.width)) * F;
  const box = [0, 0, width + 2 * NOTE.mx, NOTE.top + (lines.length - 1) * pitch + NOTE.bottom + (gloss ? 0.75 * F : 0)];
  return { lines, pitch, box };
}

/**
 * Записка: пергамент, сгиб посередине, строки шифровки курсивом.
 * view: { note }. o.gloss — открытый текст той же длины: подписывается под каждой буквой (у ведущего).
 */
export function noteSvg(view, o = {}) {
  const lay = o.layout ?? noteLayout(view.note, Boolean(o.gloss));
  const [, , W, H] = lay.box;
  const out = [svgOpen(lay.box, { ...o, cls: "cp-disk-note-svg" }), paper(lay.box, { tone: "old", rx: 1.2 })];
  // сгиб: записку складывали вчетверо
  out.push(`<g fill="none" stroke-width=".5"><path d="M0,${num(H / 2)}H${num(W)}" stroke="#7a5a3a" opacity=".22"/><path d="M0,${num(H / 2 + 0.55)}H${num(W)}" stroke="#fff6dc" opacity=".35"/>`);
  out.push(`<path d="M${num(W / 2)},0V${num(H)}" stroke="#7a5a3a" opacity=".12"/><path d="M${num(W / 2 + 0.55)},0V${num(H)}" stroke="#fff6dc" opacity=".22"/></g>`);
  const row = (glyphs, y, pick) => {
    const list = glyphs.filter((g) => pick(g).trim());
    if (!list.length) return "";
    return `<text x="${list.map((g) => num(NOTE.mx + g.x * F)).join(" ")}" y="${num(y)}">${xml(list.map(pick).join(""))}</text>`;
  };
  // Места букв замерены по курсиву Alegreya; рукописный почерк чуть шире — кегль на 7% меньше.
  const hand = view.script && view.script !== "book";
  out.push(`<g ${hand ? scriptAttrs(view.script, F * 0.93) : `font-family="${SERIF}" font-style="italic" font-size="${F}"`} fill="${INK}" text-anchor="middle">`);
  lay.lines.forEach((l, k) => out.push(row(l.glyphs, NOTE.top + k * lay.pitch, (g) => g.ch)));
  out.push("</g>");
  if (o.gloss) {
    const gloss = String(o.gloss);
    out.push(`<g class="cp-answer" font-family="${SERIF}" font-weight="500" font-size="${num(F * 0.66)}" fill="${LIT}" text-anchor="middle">`);
    lay.lines.forEach((l, k) => out.push(row(l.glyphs, NOTE.top + k * lay.pitch + 0.95 * F, (g) => gloss[g.i] ?? "")));
    out.push("</g>");
  }
  out.push("</svg>");
  return out.join("");
}

/* ---------- диск ---------- */

/** Радиусы: латунное кольцо, гнездо внутреннего, само внутреннее кольцо, пояс его букв, ось. */
const R = { rim: 99, outerText: 85.5, seat: 74.6, edge: 96.6, inner: 71, innerText: 62.6, band: 54.6, rose: 47, hub: 7.2 };
const DISK_BOX = [-108, -118, 216, 228];

/** Поворот внутреннего кольца в буквах по часовой: под «А» встаёт буква offset. Ближайший путь — не больше полкруга. */
export function turnOf(offset, n) {
  const k = -mod(Number(offset) || 0, n);
  return k < -n / 2 ? k + n : k;
}

const polar = (r, deg) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [num(r * Math.cos(a)), num(r * Math.sin(a))];
};

/** Буквы по кругу: верх буквы — наружу. */
const ringText = (letters, r, step) => letters.map((l, i) => `<text transform="rotate(${num(i * step)})" x="0" y="${-r}" dy=".34em">${xml(l)}</text>`).join("");

/** Деления между буквами — радиальные черты от r1 до r2. */
const dividers = (n, step, r1, r2) => {
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polar(r1, (i + 0.5) * step);
    const [x2, y2] = polar(r2, (i + 0.5) * step);
    d += `M${x1},${y1}L${x2},${y2}`;
  }
  return d;
};

/** Роза ветров в середине внутреннего кольца: северный луч смотрит на первую букву кольца. */
function rose(r) {
  const out = [];
  for (let k = 0; k < 8; k++) {
    const len = k % 2 ? r * 0.56 : r * 0.86;
    const tip = polar(len, k * 45);
    const left = polar(r * 0.16, k * 45 - 22.5);
    const right = polar(r * 0.16, k * 45 + 22.5);
    out.push(`<path d="M0,0L${left}L${tip}z" fill="${INK_SOFT}" opacity="${k % 2 ? 0.28 : 0.42}"/>`);
    out.push(`<path d="M0,0L${tip}L${right}z" fill="${INK_SOFT}" opacity="${k % 2 ? 0.1 : 0.16}"/>`);
  }
  out.push(`<path d="M0,0L${polar(r * 0.16, -22.5)}L${polar(r * 0.86, 0)}L${polar(r * 0.16, 22.5)}z" fill="none" stroke="${INK_SOFT}" stroke-width=".3" opacity=".6"/>`);
  return out.join("");
}

/**
 * Диск: неподвижное латунное кольцо с открытым алфавитом и внутреннее пергаментное — с шифр-алфавитом.
 * view: { outer, inner }. o.offset — какая буква внутреннего кольца стоит под «А» (для картинки и предпросмотра);
 * o.live — для окна игрока: поворот задаёт стиль, его меняет bind.
 */
export function diskSvg(view, o = {}) {
  const { outer, inner } = view;
  const n = outer.length;
  const step = 360 / n;
  const id = uid();
  const b = brass();
  const angle = num(turnOf(o.offset, n) * step);
  const outerSize = n > 28 ? 11.2 : 12.8;
  const innerSize = n > 28 ? 9.6 : 11;
  const out = [svgOpen(DISK_BOX, { ...o, cls: "cp-disk-svg" })];
  out.push(
    "<defs>",
    b.defs,
    `<radialGradient id="${id}p" cx="50%" cy="46%" r="60%"><stop offset="0" stop-color="#f6eed8"/><stop offset=".6" stop-color="#ead9b4"/><stop offset="1" stop-color="#cdb184"/></radialGradient>`,
    `<filter id="${id}f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".03" numOctaves="4" seed="11"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .29  0 0 0 0 .11  0 0 0 .55 -.14"/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
    `<filter id="${id}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .32  0 0 0 0 .21  0 0 0 0 .09  0 0 0 .3 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>`,
    `<filter id="${id}s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.8"/></filter>`,
    `<radialGradient id="${id}r" cx="38%" cy="34%" r="70%"><stop offset="0" stop-color="#f6dea4"/><stop offset=".55" stop-color="#a27838"/><stop offset="1" stop-color="#4f3815"/></radialGradient>`,
    `<radialGradient id="${id}e" cx="50%" cy="50%" r="50%"><stop offset=".8" stop-color="#3a2410" stop-opacity="0"/><stop offset="1" stop-color="#3a2410" stop-opacity=".28"/></radialGradient>`,
    "</defs>",
  );

  // Латунное кольцо: основа, шлифовка, блик, гравированные круги и деления.
  out.push(`<circle r="${R.rim}" fill="${b.fill}" stroke="#3b2a12" stroke-width=".8"/>`);
  out.push(`<circle r="${R.rim}" fill="#000" filter="${b.grain}"/>`);
  out.push(`<circle r="${R.rim}" fill="${b.shine}"/>`);
  out.push(`<circle r="${R.rim - 0.9}" fill="none" stroke="#efcd8a" stroke-width=".35" opacity=".55"/>`);
  out.push('<g fill="none">');
  for (const r of [R.edge, R.seat]) out.push(`<circle r="${r}" stroke="#2e200c" stroke-width=".5" opacity=".7"/><circle r="${r + 0.5}" stroke="#f1d394" stroke-width=".3" opacity=".6"/>`);
  out.push(`<path d="${dividers(n, step, R.seat, R.edge)}" stroke="#2e200c" stroke-width=".45" opacity=".6"/>`);
  out.push(`<path d="${dividers(n * 4, step / 4, R.edge, R.edge + 1.6)}" stroke="#2e200c" stroke-width=".3" opacity=".55"/>`);
  out.push("</g>");
  const outerLetters = ringText([...outer], R.outerText, step);
  out.push(`<g font-family="${SERIF}" font-weight="700" font-size="${outerSize}" text-anchor="middle">`);
  out.push(`<g transform="translate(.28 .34)" fill="#f3d79c" opacity=".45">${outerLetters}</g>`);
  out.push(`<g fill="#2b1d0b">${outerLetters}</g>`);
  out.push("</g>");

  // Тень внутреннего кольца на латуни — неподвижная, кольцо круглое.
  out.push(`<circle r="${R.inner + 0.4}" cy="1.8" fill="#000" opacity=".55" filter="url(#${id}s)"/>`);

  // Внутреннее кольцо — крутится вокруг оси.
  const turn = o.live ? ` style="transform:rotate(${angle}deg)"` : ` transform="rotate(${angle})"`;
  out.push(`<g class="cp-disk-inner"${turn}>`);
  out.push(`<circle r="${R.inner}" fill="url(#${id}p)"/>`);
  out.push(`<circle r="${R.inner}" fill="#000" filter="url(#${id}f)" opacity=".5"/>`);
  out.push(`<circle r="${R.inner}" fill="#000" filter="url(#${id}g)" opacity=".55"/>`);
  out.push(`<circle r="${R.inner}" fill="url(#${id}e)" stroke="#4a3018" stroke-width=".9"/>`);
  out.push(`<g fill="none" stroke="${INK_SOFT}"><circle r="${R.inner - 1.6}" stroke-width=".35" opacity=".8"/><circle r="${R.band}" stroke-width=".5" opacity=".8"/><circle r="${R.band - 1.4}" stroke-width=".25" opacity=".6"/>`);
  out.push(`<path d="${dividers(n, step, R.band, R.inner - 1.6)}" stroke-width=".35" opacity=".75"/>`);
  out.push(`<circle r="${R.rose}" stroke-width=".3" stroke-dasharray=".6 1.6" opacity=".7"/></g>`);
  out.push(rose(R.rose - 2));
  out.push(`<g font-family="${SERIF}" font-weight="700" font-size="${innerSize}" fill="${INK}" text-anchor="middle">${ringText([...inner], R.innerText, step)}</g>`);
  out.push("</g>");

  // Ось, окошко чтения и метка сверху — поверх, неподвижные, мышь пропускают.
  out.push('<g pointer-events="none">');
  const [ax, ay] = polar(R.edge + 0.2, -step / 2);
  const [bx, by] = polar(R.edge + 0.2, step / 2);
  const [cx, cy] = polar(R.band - 1.4, step / 2);
  const [dx, dy] = polar(R.band - 1.4, -step / 2);
  out.push(`<path d="M${ax},${ay}A${R.edge + 0.2},${R.edge + 0.2} 0 0 1 ${bx},${by}L${cx},${cy}A${R.band - 1.4},${R.band - 1.4} 0 0 0 ${dx},${dy}z" fill="#fff3cf" fill-opacity=".1" stroke="${LIT}" stroke-width=".7" stroke-opacity=".75" stroke-linejoin="round"/>`);
  out.push(`<circle r="${R.hub + 1.4}" fill="#000" opacity=".3" cy=".6" filter="url(#${id}s)"/>`);
  out.push(`<circle r="${R.hub}" fill="url(#${id}r)" stroke="#3b2a12" stroke-width=".45"/>`);
  out.push(`<circle r="${R.hub * 0.55}" fill="none" stroke="#3b2a12" stroke-width=".35" opacity=".55"/>`);
  out.push(`<path d="M-5.6,-${R.rim + 12}H5.6L0,-${R.rim + 0.6}z" fill="#8c2a17" stroke="#3b1a0c" stroke-width=".6" stroke-linejoin="round"/>`);
  out.push(`<path d="M-3.4,-${R.rim + 10.6}H3.4" stroke="#e8a184" stroke-width=".5" opacity=".6"/>`);
  out.push("</g>");
  out.push("</svg>");
  return out.join("");
}

/* ---------- стол ---------- */

const PAD = 8;
const GAP = 20;

/** «А над Г»: буква внешнего кольца и буква внутреннего под ней. */
const overText = (outer, letter) => t("Kind.disk.view.over", { top: outer[0], under: letter });

/** Стол: записка слева, диск справа; если вещь одна — она посередине. */
function stage(view, has, o = {}) {
  const note = has.message && view.note !== undefined ? noteLayout(view.note, Boolean(o.gloss)) : null;
  const disk = has.disk && view.outer ? DISK_BOX : null;
  const nw = note ? note.box[2] : 0;
  const nh = note ? note.box[3] : 0;
  const dw = disk ? disk[2] : 0;
  const dh = disk ? disk[3] : 0;
  // Одна записка не раздувается на весь стол: стол не меньше, чем под диск.
  const W = Math.max(nw + dw + (note && disk ? GAP : 0), note && !disk ? DISK_BOX[2] * 1.5 : 0) + 2 * PAD;
  const H = Math.max(nh, dh, note && !disk ? DISK_BOX[3] : 0) + 2 * PAD;
  const nx = disk ? PAD : (W - nw) / 2;
  const pct = (v, of) => `${num((v / of) * 100)}%`;
  const at = (x, y, w, h) => `left:${pct(x, W)};top:${pct(y, H)};width:${pct(w, W)};height:${pct(h, H)}`;
  const parts = [];
  if (note) {
    const svg = noteSvg(view, { layout: note, gloss: o.gloss, label: t("Kind.disk.part.message") });
    parts.push(`<div class="cp-disk-note" style="${at(nx, (H - nh) / 2, nw, nh)}">${svg}</div>`);
  }
  if (disk) {
    const n = view.outer.length;
    const off = mod(o.offset ?? 0, n);
    const style = at(W - PAD - dw, (H - dh) / 2, dw, dh);
    const svg = diskSvg(view, { offset: off, live: !o.fixed, label: t("Kind.disk.part.disk") });
    parts.push(
      o.fixed
        ? `<div class="cp-disk-wheel is-fixed" style="${style}">${svg}</div>`
        : `<div class="cp-disk-wheel" style="${style}" tabindex="0" role="slider" aria-label="${esc(t("Kind.disk.view.diskAria"))}" aria-valuemin="0" aria-valuemax="${n - 1}" aria-valuenow="${off}" aria-valuetext="${esc(overText(view.outer, view.inner[off]))}">${svg}</div>`,
    );
  }
  return `<div class="cp-fit"><div class="cp-stage cp-disk-stage" style="--cp-ratio:${num(W)}/${num(H)}">${parts.join("")}</div></div>`;
}

/** «А над Г» для панели: буквы выделены, буква под «А» меняется на лету (data-under). */
function overHtml(outer, letter) {
  return esc(t("Kind.disk.view.over", { top: "\u0001", under: "\u0002" }))
    .replace("\u0001", `<b>${esc(outer[0])}</b>`)
    .replace("\u0002", `<b data-under>${esc(letter)}</b>`);
}

/** Подпись ключа: «А над Г». */
const keyOf = (c) => ({ top: c.outer[0], under: underOf(c, 0) });

function statusOf(p) {
  const c = p.cipher;
  const parts = [plural(c.text.length, "Count.letters"), c.alphabet === "en" ? t("Kind.disk.status.en") : t("Kind.disk.status.ru")];
  if (!c.keyGiven) parts.push(t("Kind.disk.status.random", keyOf(c)));
  if (c.word) parts.push(t("Kind.disk.status.word", { word: c.word }));
  if (c.dropped?.length) parts.push(t("Status.dropped", { chars: c.dropped.join(" ") }));
  return parts.join(" · ");
}

export default {
  id: "disk",
  icon: "fa-solid fa-compact-disc",
  script: "note",

  defaults: () => ({ phrase: "", key: "", keyword: "", spaces: true }),

  fields: [
    { name: "phrase", type: "textarea", wide: true, rows: 3, style: "prose" },
    {
      group: [
        { name: "key", type: "text" },
        { name: "keyword", type: "text" },
        { name: "spaces", type: "checkbox" },
      ],
    },
  ],

  rebuildOn: ["phrase", "key", "keyword", "spaces"],
  // Случайность только в ключе: задан вручную — перемешивать нечего.
  shuffle: (p) => !p.cipher?.keyGiven,

  build(p) {
    const res = generate({ phrase: p.phrase, key: p.key, keyword: p.keyword, spaces: p.spaces !== false, seed: p.seed });
    if (!res.ok) return { problem: { error: res.error, bad: res.bad ?? [] } };
    const { alphabet, outer, inner, word, offset, keyGiven, plain, note, text, dropped } = res;
    return { cipher: { alphabet, outer, inner, word, offset, keyGiven, plain, note, text, dropped } };
  },

  problemText(pr) {
    const chars = (pr.bad ?? []).join(" ");
    if (pr.error === "empty") return t("Kind.disk.problem.empty");
    if (pr.error === "keyword") return t("Kind.disk.problem.keyword", { chars });
    if (pr.error === "keyAlphabet") return t("Kind.disk.problem.keyAlphabet", { chars });
    return t("Kind.disk.problem.key");
  },

  status: statusOf,

  meta: (p) => `${t("Kind.disk.view.over", keyOf(p.cipher))} · ${plural(p.cipher.text.length, "Count.letters")}`,

  parts: () => [
    { id: "message", icon: "fa-solid fa-scroll" },
    { id: "disk", icon: "fa-solid fa-compact-disc" },
  ],

  /** Игроку — только то, что у него в руках: записка без ключа, диск без положения. */
  view(p, parts) {
    const c = p.cipher;
    const v = {};
    if (parts.message) Object.assign(v, { note: c.note, script: p.script ?? "note" });
    if (parts.disk) Object.assign(v, { outer: c.outer, inner: c.inner });
    return v;
  },

  code(p) {
    const c = p.cipher;
    const notes = c.word ? [t("Kind.disk.codeWord", { word: c.word })] : [];
    return { line: t("Kind.disk.code", keyOf(c)), notes, reads: c.plain };
  },

  preview: {
    render(p) {
      const c = p.cipher;
      const view = { note: c.note, outer: c.outer, inner: c.inner, script: p.script ?? "note" };
      const body = stage(view, { message: true, disk: true }, { fixed: true, offset: c.offset, gloss: decrypt(c.note, c) });
      const label = esc(t("Kind.disk.preview.label", { key: "\u0002" })).replace("\u0002", `<b>${esc(t("Kind.disk.view.over", keyOf(c)))}</b>`);
      return `${body}<div class="cp-stepper"><span class="cp-stepper__label">${label}</span></div>`;
    },
  },

  player: {
    size: { width: 1120, height: 720 },
    hint: (has) => t(has.message && has.disk ? "Kind.disk.view.hintFull" : has.disk ? "Kind.disk.view.hintDisk" : "Kind.disk.view.hintMessage"),
    render(view, has, state) {
      let bar = "";
      if (has.disk && view.outer) {
        const n = view.outer.length;
        const off = mod(Number(state.offset) || 0, n);
        const btn = (op, icon, label) => `<button type="button" class="cp-btn cp-btn--icon" data-action="kind" data-op="${op}" data-tooltip="${esc(label)}" aria-label="${esc(label)}"><i class="fa-solid ${icon}" inert></i></button>`;
        bar =
          `<div class="cp-toolbar" role="toolbar">` +
          btn("ccw", "fa-caret-left", t("Kind.disk.view.ccw")) +
          btn("cw", "fa-caret-right", t("Kind.disk.view.cw")) +
          `<span class="cp-disk-read">${overHtml(view.outer, view.inner[off])}</span>` +
          `</div>`;
      }
      return bar + stage(view, has, { offset: state.offset });
    },
    bind(root, view, has, state, save) {
      const wheel = has.disk ? root.querySelector(".cp-disk-wheel:not(.is-fixed)") : null;
      if (!wheel) return {};
      const svg = wheel.querySelector("svg");
      const ring = wheel.querySelector(".cp-disk-inner");
      const under = root.querySelector("[data-under]");
      const n = view.outer.length;
      const step = 360 / n;
      // turn — поворот кольца в буквах по часовой; обороты копятся, чтобы кольцо не прокручивалось назад через круг
      let turn = turnOf(state.offset, n);
      let angle = turn * step;
      let drag = null;
      let dragging = false;

      const offsetAt = (k) => mod(-k, n);
      const place = () => {
        ring.style.transform = `rotate(${num(angle)}deg)`;
      };
      const show = (off) => {
        const letter = view.inner[off];
        if (under) under.textContent = letter;
        wheel.setAttribute("aria-valuenow", String(off));
        wheel.setAttribute("aria-valuetext", overText(view.outer, letter));
      };
      const commit = () => {
        angle = turn * step;
        place();
        show(offsetAt(turn));
        save({ offset: offsetAt(turn) });
      };
      const rotate = (dir) => {
        turn = Math.round(angle / step) + dir;
        commit();
      };
      place();

      // Тянуть: угол от середины диска; отпустили — кольцо защёлкивается на ближайшую букву.
      const center = () => {
        const r = svg.getBoundingClientRect();
        const s = r.width / DISK_BOX[2] || 1;
        return { x: r.left - DISK_BOX[0] * s, y: r.top - DISK_BOX[1] * s, s };
      };
      const angleAt = (event, c) => (Math.atan2(event.clientY - c.y, event.clientX - c.x) * 180) / Math.PI;
      wheel.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const c = center();
        const r = Math.hypot(event.clientX - c.x, event.clientY - c.y) / c.s;
        if (r > R.inner + 2 || r < R.hub) return;
        event.preventDefault();
        wheel.focus({ preventScroll: true, focusVisible: false });
        drag = { c, last: angleAt(event, c), path: 0 };
        wheel.setPointerCapture?.(event.pointerId);
      });
      wheel.addEventListener("pointermove", (event) => {
        if (!drag) return;
        const a = angleAt(event, drag.c);
        let d = a - drag.last;
        if (d > 180) d -= 360;
        else if (d < -180) d += 360;
        drag.last = a;
        drag.path += Math.abs(d);
        if (!dragging && drag.path < 1.5) return;
        if (!dragging) {
          dragging = true;
          wheel.classList.add("is-dragging");
        }
        angle += d;
        place();
        show(offsetAt(Math.round(angle / step)));
      });
      const end = () => {
        if (!drag) return;
        drag = null;
        if (!dragging) return;
        dragging = false;
        wheel.classList.remove("is-dragging");
        turn = Math.round(angle / step);
        commit();
      };
      wheel.addEventListener("pointerup", end);
      wheel.addEventListener("pointercancel", end);

      // Колесо мыши — по букве за щелчок; тачпад копит прокрутку.
      let acc = 0;
      let idle = null;
      wheel.addEventListener(
        "wheel",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (dragging) return;
          const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 400 : 1;
          acc += (Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX) * unit;
          clearTimeout(idle);
          idle = setTimeout(() => (acc = 0), 250);
          if (Math.abs(acc) >= 40) {
            rotate(Math.sign(acc));
            acc = 0;
          }
        },
        { passive: false },
      );

      // С клавиатуры: ← ↑ — против часовой, → ↓ — по часовой.
      wheel.addEventListener("keydown", (event) => {
        const dir = { arrowleft: -1, arrowup: -1, arrowright: 1, arrowdown: 1, q: -1, й: -1, e: 1, у: 1 }[event.key.toLowerCase()];
        if (!dir) return;
        rotate(dir);
        // Иначе Foundry сдвинет карту или повернёт токен.
        event.preventDefault();
        event.stopPropagation();
      });

      return {
        action(op) {
          if (op === "ccw") rotate(-1);
          else if (op === "cw") rotate(1);
        },
        /** Чужой поворот на общем столе: ближайшим путём, если сами сейчас не тянем. */
        apply(next) {
          if (dragging) return;
          const off = mod(Number(next?.offset) || 0, n);
          const now = Math.round(angle / step);
          let d = mod(-off - now, n);
          if (d > n / 2) d -= n;
          turn = now + d;
          angle = turn * step;
          place();
          show(off);
        },
      };
    },
  },

  images(p) {
    const c = p.cipher;
    return [
      { id: "message", svg: (px) => noteSvg({ note: c.note, script: p.script ?? "note" }, { px, label: t("Kind.disk.part.message") }) },
      { id: "disk", svg: (px) => diskSvg(c, { px, offset: 0, label: t("Kind.disk.part.disk") }) },
    ];
  },

  demo: () => ({
    title: "Записка у мельницы",
    phrase: "Встречаемся у старой мельницы в полночь. Приходи один.",
    key: "К",
    keyword: "",
    spaces: true,
    seed: 20261017,
  }),
};
