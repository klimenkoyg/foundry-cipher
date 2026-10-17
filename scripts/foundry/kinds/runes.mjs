/* Тайный алфавит: послание выдуманными знаками и ключ, разорванный на обрывки.
   Ядро — scripts/core/runes.mjs; здесь поля мастерской, рисунки, окно игрока и картинки. */

import { FRAGMENTS, frequency, generate, GLYPH_H, GLYPH_W, lettersOf, MAX_LETTERS, STYLES } from "../../core/runes.mjs";
import { mulberry32 } from "../../core/rng.mjs";
import { esc, plural, t } from "../i18n.mjs";
import { INK, INK_SOFT, LIT, num, paper, SERIF, svgOpen, uid, xml } from "../paper.mjs";

/* Послание: знак — S единиц на единицу рамки, шаг знаков, промежуток между словами, поля, высота строки. */
const S = 5;
const GW = GLYPH_W * S;
const GH = GLYPH_H * S;
const GAP = 4;
const SEP = 11;
const M = 14;
const ROW = GH + 8;
const ROW_SLOTS = GH + 17;
const TARGET = 1.6;

/** Буква с обрывка у игрока — «золотом»; спорная (одна буква у двух знаков) — красным. */
const PINNED = "#8a5a0c";
/** Цвета обрывков у ведущего: подписи на пергаменте. */
const FRAG_INK = ["#8a5a0c", "#1f6b63", "#8f2f45", "#4b3d8f", "#3f6b1f", "#2f5590"];

const strokeWidth = (style) => (style === "sigils" ? 0.15 : 0.21);

/** Знак в своей рамке 2 × 3: путь и точки. */
function glyphInner(glyph, style, color) {
  const dots = (glyph.dots ?? []).map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`).join("");
  const path = glyph.d ? `<path d="${glyph.d}" fill="none" stroke="${color}" stroke-width="${strokeWidth(style)}" stroke-linecap="round" stroke-linejoin="round"/>` : "";
  return path + dots;
}

/** Определения знаков для <use>: каждый знак — один раз, дальше ссылки. */
function glyphDefs(id, ids, glyphs, style, scale, color = INK) {
  return `<defs>${ids.map((g) => `<g id="${id}${g}" transform="scale(${scale})">${glyphInner(glyphs[g], style, color)}</g>`).join("")}</defs>`;
}

/** Маленький знак для таблицы игрока: цвет — от CSS. */
const glyphIcon = (glyph, style) =>
  `<svg class="cp-runes-ico" viewBox="-0.35 -0.25 2.7 3.5" aria-hidden="true">${glyphInner(glyph, style, "currentColor")}</svg>`;

/** Ширина картинки в пикселях, чтобы длинная сторона была px (обрывки бывают высокие). */
const pxFor = (box, px) => (px && box[3] > box[2] ? (px * box[2]) / box[3] : px);

/* ---------- послание ---------- */

/** Слова → строки не длиннее cap знаков. Слишком длинное слово режется. */
function wrapLines(words, cap) {
  const lines = [];
  let line = [];
  let count = 0;
  let splits = 0;
  const flush = () => {
    if (line.length) lines.push(line);
    line = [];
    count = 0;
  };
  for (const word of words) {
    if (word.length > cap) {
      flush();
      for (let i = 0; i < word.length; i += cap) {
        line = [word.slice(i, i + cap)];
        count = line[0].length;
        if (i + cap < word.length) flush();
      }
      splits++;
      continue;
    }
    if (count && count + word.length > cap) flush();
    line.push(word);
    count += word.length;
  }
  flush();
  return { lines, splits };
}

const lineWidth = (line) => line.reduce((s, w) => s + w.length * GW + (w.length - 1) * GAP, 0) + (line.length - 1) * SEP;

/** Раскладка послания: строки подбираются так, чтобы лист был приятной ширины. */
function arrange(message, spaces, slots) {
  const words = spaces ? message : [message.flat()];
  const total = message.flat().length;
  const rowH = slots ? ROW_SLOTS : ROW;
  let best = null;
  for (let cap = Math.min(4, total); cap <= Math.max(4, Math.min(total, 28)); cap++) {
    const { lines, splits } = wrapLines(words, cap);
    const W = 2 * M + Math.max(...lines.map(lineWidth));
    const H = 2 * M + (lines.length - 1) * rowH + GH + (slots ? 12 : 0);
    const score = Math.abs(Math.log(W / H / TARGET)) + (spaces ? splits * 0.4 : 0);
    if (!best || score < best.score - 1e-9) best = { score, lines, W, H };
  }
  const { lines, W, H } = best;
  const items = [];
  const seps = [];
  lines.forEach((line, r) => {
    let x = (W - lineWidth(line)) / 2;
    const y = M + r * rowH;
    line.forEach((word, wi) => {
      if (wi) {
        seps.push([x + SEP / 2, y]);
        x += SEP;
      }
      word.forEach((g, k) => {
        items.push({ g, x, y });
        x += GW + (k < word.length - 1 ? GAP : 0);
      });
    });
  });
  return { box: [0, 0, num(W), num(H)], items, seps };
}

/** Знак между словами: у рун — две точки, у знаков культа — ромбик. */
function sepMark([x, y], style) {
  if (style === "sigils") {
    const cy = y + GH * 0.52;
    return `<path d="M${num(x)} ${num(cy - 1.4)}l1.1 1.4l-1.1 1.4l-1.1 -1.4z" fill="${INK_SOFT}"/>`;
  }
  return `<circle cx="${num(x)}" cy="${num(y + GH * 0.36)}" r=".85" fill="${INK_SOFT}"/><circle cx="${num(x)}" cy="${num(y + GH * 0.64)}" r=".85" fill="${INK_SOFT}"/>`;
}

/**
 * Послание на пергаменте. view: { message, spaces, glyphs, style }.
 * o.slots — места для букв под знаками; o.letters — gid → { ch, color, cls } (что подписать);
 * o.live — знаки можно трогать (окно игрока); o.px, o.label — для картинки.
 */
export function messageSvg(view, o = {}) {
  const { items, seps, box } = arrange(view.message, view.spaces, o.slots);
  const id = uid();
  const ids = [...new Set(view.message.flat())];
  const out = [svgOpen(box, { ...o, cls: "cp-runes-msg-svg" }), paper(box), glyphDefs(id, ids, view.glyphs, view.style, S)];
  for (const s of seps) out.push(sepMark(s, view.style));
  for (const { g, x, y } of items) {
    const use = `<use href="#${id}${g}" x="${num(x)}" y="${num(y)}"/>`;
    out.push(o.live ? `<g class="cp-runes-g" data-g="${g}"><rect class="cp-runes-hit" x="${num(x - 2)}" y="${num(y - 2)}" width="${GW + 4}" height="${GH + 4}" rx="2" fill="transparent"/>${use}</g>` : use);
  }
  if (o.slots) {
    out.push(`<g stroke="${INK_SOFT}" stroke-width=".45" stroke-opacity=".55">`);
    for (const { x, y } of items) out.push(`<path d="M${num(x + 1.2)} ${num(y + GH + 11.6)}h${GW - 2.4}"/>`);
    out.push("</g>");
    out.push(`<g font-family="${SERIF}" font-weight="700" font-size="8.6" text-anchor="middle">`);
    for (const { g, x, y } of items) {
      const l = o.letters?.[g];
      const cls = `cp-runes-slot${l?.cls ? ` ${l.cls}` : ""}`;
      out.push(`<text class="${cls}" data-g="${g}" x="${num(x + GW / 2)}" y="${num(y + GH + 10.4)}" fill="${l?.color ?? INK}">${xml(l?.ch ?? "")}</text>`);
    }
    out.push("</g>");
  }
  out.push("</svg>");
  return { svg: out.join(""), box };
}

/* ---------- обрывок ключа ---------- */

/** Рваный край: точки вдоль стороны, сдвинутые внутрь листа. */
function tornEdge(rng, [x1, y1], [x2, y2], torn) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const pts = [];
  for (let d = 0; d < len; ) {
    const k = d / len;
    const depth = torn ? 0.4 + rng() * 2.6 + (rng() < 0.12 ? 1.6 : 0) : rng() * 0.5;
    pts.push([x1 + (x2 - x1) * k + nx * depth, y1 + (y2 - y1) * k + ny * depth]);
    d += torn ? 1.2 + rng() * 2.2 : 4 + rng() * 5;
  }
  return pts;
}

/** Зерно рваных краёв — от содержимого обрывка: зерно шифра игроку не отдаём, по нему восстановился бы весь ключ. */
function tearSeed(frag) {
  let h = 2166136261;
  for (const ch of `${frag.n}:${frag.pairs.flat().join("")}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const SS = 4;
const CW = 31;
const RH = 17;

/** Как лягут пары на обрывке: до пяти в столбике, дальше — ещё столбик. */
function scrapLayout(count) {
  const cols = Math.max(1, Math.ceil(count / 5));
  const perCol = Math.ceil(count / cols);
  const W = 2 * 9 + cols * CW - 6;
  const H = 13 + perCol * RH - 5 + 15;
  return { cols, perCol, box: [0, 0, W, H] };
}

/**
 * Обрывок пергамента со столбиком «знак = буква». frag: { n, pairs: [[gid, буква]] }.
 */
export function scrapSvg(frag, glyphs, style, o = {}) {
  const { perCol, box } = scrapLayout(frag.pairs.length);
  const [, , W, H] = box;
  const rng = mulberry32(tearSeed(frag));
  const id = uid();
  const tornTop = rng() < 0.8;
  const tornBottom = !tornTop || rng() < 0.7;
  const tornSide = rng() < 0.35;
  const c = [[0.6, 0.6], [W - 0.6, 0.6], [W - 0.6, H - 0.6], [0.6, H - 0.6]];
  const pts = [...tornEdge(rng, c[0], c[1], tornTop), ...tornEdge(rng, c[1], c[2], tornSide), ...tornEdge(rng, c[2], c[3], tornBottom), ...tornEdge(rng, c[3], c[0], false)];
  const outline = `M${pts.map(([x, y]) => `${num(x)} ${num(y)}`).join("L")}Z`;
  const ids = frag.pairs.map(([g]) => g);
  const out = [
    svgOpen(box, { ...o, px: pxFor(box, o.px), cls: "cp-runes-scrap-svg" }),
    `<defs><clipPath id="${id}c"><path d="${outline}"/></clipPath></defs>`,
    `<g clip-path="url(#${id}c)">${paper(box, { tone: "old", rx: 0 })}</g>`,
    `<path d="${outline}" fill="none" stroke="#7d5c30" stroke-opacity=".55" stroke-width=".55"/>`,
    glyphDefs(id, ids, glyphs, style, SS),
  ];
  out.push(`<g font-family="${SERIF}" text-anchor="middle">`);
  frag.pairs.forEach(([g, ch], i) => {
    const x = 9 + Math.floor(i / perCol) * CW;
    const y = 13 + (i % perCol) * RH;
    out.push(`<use href="#${id}${g}" x="${x}" y="${y}"/>`);
    out.push(`<text x="${x + 14}" y="${y + 8.2}" font-size="7" fill="${INK_SOFT}">=</text>`);
    out.push(`<text x="${x + 22}" y="${y + 9}" font-size="9.5" font-weight="700" fill="${INK}">${xml(ch)}</text>`);
  });
  out.push(`<text x="${num(W - 6)}" y="${num(H - 5.5)}" font-size="5.5" font-style="italic" fill="${INK_SOFT}">${frag.n}</text>`);
  out.push("</g></svg>");
  return { svg: out.join(""), box };
}

/* ---------- полный ключ (ведущему) ---------- */

const KP = 24;
const KROW = 18;
const KMAX = 10;

/** Все обрывки строками: номер обрывка и пары «знак буква»; обманки — бледнее и с крестиком. o.focus — номер обрывка, остальные бледнеют. */
export function keySvg(c, o = {}) {
  const rows = [];
  c.fragments.forEach((letters, i) => {
    for (let j = 0; j < letters.length; j += KMAX) rows.push({ i, letters: letters.slice(j, j + KMAX), first: j === 0 });
  });
  const cells = Math.max(...rows.map((r) => r.letters.length));
  const top = 21;
  const legend = c.decoys.length ? 10 : 0;
  const W = 2 * 12 + 16 + cells * KP - 5;
  const H = top + rows.length * KROW + legend + 5;
  const box = [0, 0, W, H];
  const id = uid();
  const ids = c.fragments.flat().map((ch) => c.letters[ch]);
  const decoy = new Set(c.decoys);
  const out = [svgOpen(box, { ...o, px: pxFor(box, o.px), cls: "cp-runes-key-svg" }), paper(box), glyphDefs(id, ids, c.glyphs, c.style, SS)];
  out.push(`<text x="${num(W / 2)}" y="13" font-family="${SERIF}" font-style="italic" font-size="7" fill="${INK}" text-anchor="middle">${xml(t("Kind.runes.part.fullkey"))}</text>`);
  rows.forEach((row, r) => {
    const y = top + r * KROW;
    const ink = FRAG_INK[row.i % FRAG_INK.length];
    const dim = o.focus && o.focus !== row.i + 1 ? ` opacity=".28"` : "";
    out.push(`<g${dim}>`);
    if (row.first) {
      out.push(`<circle cx="17" cy="${y + 6}" r="4.6" fill="${ink}"/>`);
      out.push(`<text x="17" y="${y + 8.1}" font-family="${SERIF}" font-weight="700" font-size="6" fill="#f5ecd5" text-anchor="middle">${row.i + 1}</text>`);
    }
    out.push(`<g font-family="${SERIF}" font-weight="700" font-size="9" text-anchor="middle">`);
    row.letters.forEach((ch, j) => {
      const x = 12 + 16 + j * KP;
      const fake = decoy.has(ch);
      out.push(`<use href="#${id}${c.letters[ch]}" x="${x}" y="${y}"${fake ? ` opacity=".5"` : ""}/>`);
      out.push(`<text x="${x + 14}" y="${y + 9.2}" fill="${fake ? INK_SOFT : ink}"${fake ? ` font-style="italic" font-weight="500"` : ""}>${xml(ch)}</text>`);
      if (fake) out.push(`<text x="${x + 19.2}" y="${y + 4.6}" font-size="4.6" fill="${INK_SOFT}">†</text>`);
    });
    out.push("</g></g>");
  });
  if (legend) out.push(`<text x="${num(W / 2)}" y="${H - 6}" font-family="${SERIF}" font-style="italic" font-size="4.8" fill="${INK_SOFT}" text-anchor="middle">${xml(t("Kind.runes.view.decoyLegend"))}</text>`);
  out.push("</svg>");
  return { svg: out.join(""), box };
}

/* ---------- что у игрока ---------- */

/** Буквы с обрывков игрока: gid → { ch, n }. */
function pinnedOf(view) {
  const out = new Map();
  for (const f of view.frags ?? []) for (const [g, ch] of f.pairs) out.set(g, { ch, n: f.n });
  return out;
}

/** Догадки игрока по всем знакам послания: пустые — "" (объект сохраняется целиком, ключи не пропадают). */
function fullGuesses(view, raw) {
  const out = {};
  for (const g of new Set(view.message.flat())) out[g] = typeof raw?.[g] === "string" ? raw[g] : "";
  return out;
}

/** Что подписать под знаками у игрока: закреплённые — золотом, свои догадки — чернилами, спорные — красным. */
function playerLetters(view, guesses) {
  const pinned = pinnedOf(view);
  const value = (g) => pinned.get(g)?.ch ?? guesses[g] ?? "";
  const owners = new Map();
  for (const g of new Set(view.message.flat())) {
    const v = value(g);
    if (v) owners.set(v, [...(owners.get(v) ?? []), g]);
  }
  const clash = new Set([...owners.values()].filter((l) => l.length > 1).flat());
  const out = {};
  for (const g of new Set(view.message.flat())) {
    const pin = pinned.has(g);
    out[g] = { ch: value(g), color: clash.has(g) ? LIT : pin ? PINNED : INK, cls: [pin ? "is-pinned" : "", clash.has(g) ? "is-clash" : ""].filter(Boolean).join(" ") };
  }
  return { letters: out, clash, value };
}

const stage = (inner, box, cls = "") => `<div class="cp-fit${cls}"><div class="cp-stage" style="--cp-ratio:${box[2]}/${box[3]}"><div class="cp-sheet cp-runes-sheet">${inner}</div></div></div>`;

const scrapTag = (frag, view, i) => {
  const { svg, box } = scrapSvg(frag, view.glyphs, view.style, { label: t("Kind.runes.view.fragment", { n: frag.n }) });
  const tilt = [-2.2, 1.6, -1.1, 2.4, -1.8, 1][i % 6];
  return `<div class="cp-runes-scrap" style="--w:${box[2]};--tilt:${tilt}deg">${svg}</div>`;
};

/** Таблица знаков послания: частые — первыми. */
function tableHtml(view, guesses) {
  const pinned = pinnedOf(view);
  const cells = frequency(view.message).map(([g, count], i) => {
    const ico = glyphIcon(view.glyphs[g], view.style);
    const cnt = `<span class="cp-runes-cell__count">×${count}</span>`;
    const pin = pinned.get(g);
    if (pin) {
      return `<div class="cp-runes-cell is-pinned" data-g="${g}" data-tooltip="${esc(t("Kind.runes.view.pinned", { n: pin.n }))}">${ico}<span class="cp-runes-cell__fixed">${esc(pin.ch)}</span>${cnt}</div>`;
    }
    return `<label class="cp-runes-cell" data-g="${g}">${ico}<input type="text" class="cp-runes-cell__in" data-g="${g}" value="${esc(guesses[g] ?? "")}" autocomplete="off" spellcheck="false" aria-label="${esc(t("Kind.runes.view.cellAria", { n: i + 1, count }))}">${cnt}</label>`;
  });
  return `<div class="cp-runes-table" role="group" aria-label="${esc(t("Kind.runes.view.table"))}">${cells.join("")}</div>`;
}

/* ---------- окно игрока ---------- */

function playerHtml(view, state, ctx) {
  if (!view.message) return `<div class="cp-runes-scraps">${(view.frags ?? []).map((f, i) => scrapTag(f, view, i)).join("")}</div>`;
  // На общем столе в view — только обрывки, которые ведущий выложил (части стола выбирает он).
  const shown = view;
  const frags = shown.frags ?? [];
  const pinned = pinnedOf(shown);
  const guesses = fullGuesses(view, state.guesses);
  const { letters, value } = playerLetters(shown, guesses);
  const ids = [...new Set(view.message.flat())];
  const done = ids.filter((g) => value(g)).length;
  const bar =
    `<div class="cp-toolbar" role="toolbar">` +
    (ids.some((g) => !pinned.has(g)) ? `<button type="button" class="cp-btn" data-action="kind" data-op="clear"><i class="fa-solid fa-eraser" inert></i> <span data-clear>${esc(t("Kind.runes.view.clear"))}</span></button>` : "") +
    `<span class="cp-toolbar__top">${esc(t("Kind.runes.view.done"))} <b data-done>${done}</b> ${esc(t("Kind.runes.view.of", { total: ids.length }))}</span>` +
    `</div>`;
  const msg = messageSvg(view, { slots: true, letters, live: true, label: t("Kind.runes.part.message") });
  const side = frags.length ? `<div class="cp-runes-side">${frags.map((f, i) => scrapTag(f, view, i)).join("")}</div>` : "";
  return bar + `<div class="cp-runes-desk${side ? " has-side" : ""}">${stage(msg.svg, msg.box, " cp-runes-msgfit")}${side}</div>` + tableHtml(shown, guesses);
}

/** Оживить послание и таблицу: ввод букв, подсветка знаков, «Стереть». view — то, что лежит перед игроком. */
function attach(root, view, state, save) {
  const pinned = pinnedOf(view);
  const abc = lettersOf(view.alphabet);
  let guesses = fullGuesses(view, state.guesses);
  const inputs = [...root.querySelectorAll("input.cp-runes-cell__in")];
  const byG = new Map(inputs.map((i) => [i.dataset.g, i]));
  const done = root.querySelector("[data-done]");
  let hover = null;
  let focus = null;

  const show = () => {
    const { letters, value } = playerLetters(view, guesses);
    for (const el of root.querySelectorAll(".cp-runes-slot[data-g]")) {
      const l = letters[el.dataset.g];
      if (el.textContent !== l.ch) el.textContent = l.ch;
      el.setAttribute("fill", l.color);
      el.classList.toggle("is-clash", l.cls.includes("is-clash"));
    }
    for (const cell of root.querySelectorAll(".cp-runes-cell[data-g]")) cell.classList.toggle("is-clash", Boolean(letters[cell.dataset.g]?.cls.includes("is-clash")));
    if (done) done.textContent = String(Object.keys(letters).filter((g) => value(g)).length);
  };
  const hot = () => {
    for (const el of root.querySelectorAll(".cp-runes-g[data-g], .cp-runes-cell[data-g]")) el.classList.toggle("is-hot", el.dataset.g === hover || el.dataset.g === focus);
  };
  const clean = (raw) => [...String(raw ?? "").toUpperCase().replace(/Ё/g, "Е")].filter((ch) => abc.includes(ch)).at(-1) ?? "";
  const commit = () => save({ guesses: { ...guesses } });

  inputs.forEach((input, i) => {
    const g = input.dataset.g;
    input.addEventListener("focus", () => {
      focus = g;
      hot();
      input.select();
    });
    input.addEventListener("blur", () => {
      if (focus === g) focus = null;
      hot();
    });
    input.addEventListener("input", () => {
      const ch = clean(input.value);
      const bad = Boolean(input.value) && !ch;
      input.value = ch;
      input.classList.toggle("is-bad", bad);
      if (bad) setTimeout(() => input.classList.remove("is-bad"), 600);
      if (guesses[g] === ch) return;
      guesses = { ...guesses, [g]: ch };
      commit();
      show();
      if (ch) inputs[i + 1]?.focus();
    });
    input.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" || (event.key === "Enter" && !event.shiftKey) ? 1 : event.key === "ArrowLeft" || (event.key === "Enter" && event.shiftKey) || (event.key === "Backspace" && !input.value) ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      inputs[i + step]?.focus();
    });
  });

  for (const el of root.querySelectorAll(".cp-runes-g[data-g], .cp-runes-cell.is-pinned[data-g]")) {
    const g = el.dataset.g;
    el.addEventListener("pointerenter", () => {
      hover = g;
      hot();
    });
    el.addEventListener("pointerleave", () => {
      if (hover === g) hover = null;
      hot();
    });
    if (!el.classList.contains("cp-runes-g")) continue;
    // Щелчок по знаку послания — к его клетке; закреплённая клетка просто мигнёт.
    el.addEventListener("click", () => {
      const input = byG.get(g);
      if (input) return input.focus();
      const cell = root.querySelector(`.cp-runes-cell[data-g="${g}"]`);
      cell?.classList.remove("is-flash");
      void cell?.getBoundingClientRect();
      cell?.classList.add("is-flash");
    });
  }

  // «Стереть догадки» — со второго нажатия: первое только спрашивает.
  const clearBtn = root.querySelector('[data-op="clear"]');
  let armed = null;
  const disarm = () => {
    clearTimeout(armed);
    armed = null;
    if (!clearBtn) return;
    clearBtn.setAttribute("aria-pressed", "false");
    clearBtn.querySelector("[data-clear]").textContent = t("Kind.runes.view.clear");
  };

  return {
    guesses: () => ({ ...guesses }),
    stop: () => clearTimeout(armed),
    action(op) {
      if (op !== "clear" || !clearBtn) return;
      if (!armed) {
        clearBtn.setAttribute("aria-pressed", "true");
        clearBtn.querySelector("[data-clear]").textContent = t("Kind.runes.view.clearSure");
        armed = setTimeout(disarm, 3000);
        return;
      }
      disarm();
      guesses = Object.fromEntries(Object.keys(guesses).map((g) => [g, ""]));
      for (const input of inputs) input.value = "";
      commit();
      show();
    },
    apply(next) {
      guesses = fullGuesses(view, next?.guesses);
      for (const [g, input] of byG) if (input.value !== guesses[g] && !pinned.has(g)) input.value = guesses[g];
      show();
    },
  };
}

/* ---------- состояние шифра в мастерской ---------- */

function statusOf(p) {
  const c = p.cipher;
  const n = c.fragments.length;
  const sizes = c.fragments.map((f) => f.length);
  const lo = Math.min(...sizes);
  const hi = Math.max(...sizes);
  const parts = [
    plural(c.text.length, "Count.letters"),
    plural(new Set(c.text).size, "Kind.runes.status.glyphs"),
    `${plural(n, "Kind.runes.fragments")} ${t("Kind.runes.status.per", { per: lo === hi ? lo : `${lo}–${hi}` })}`,
  ];
  if (c.decoys.length) parts.push(t("Kind.runes.status.decoys", { letters: c.decoys.join(" ") }));
  if (n < c.wanted) parts.push(t("Kind.runes.status.fewer", { n }));
  if (c.dropped?.length) parts.push(t("Status.dropped", { chars: c.dropped.join(" ") }));
  return parts.join(" · ");
}

export default {
  id: "runes",
  icon: "fa-solid fa-language",
  /** На общий стол сначала ложится только послание — обрывки ключа ведущий выкладывает по одному. */
  tableParts: () => ({ message: true }),

  defaults: () => ({ phrase: "", style: "runes", fragments: FRAGMENTS.def, spaces: true }),

  fields: [
    { name: "phrase", type: "textarea", wide: true, rows: 3, style: "prose" },
    {
      group: [
        { name: "style", type: "select", options: STYLES },
        { name: "fragments", type: "number", min: FRAGMENTS.min, max: FRAGMENTS.max },
        { name: "spaces", type: "checkbox" },
      ],
    },
  ],

  rebuildOn: ["phrase", "style", "fragments", "spaces"],
  shuffle: true,

  build(p) {
    const res = generate({ phrase: p.phrase, style: p.style, fragments: p.fragments, spaces: p.spaces !== false, seed: p.seed });
    if (!res.ok) return { problem: { error: res.error, length: res.length ?? 0, max: res.max ?? MAX_LETTERS } };
    const { ok, ...cipher } = res;
    return { cipher };
  },

  problemText(pr) {
    if (pr.error === "tooLong") return t("Kind.runes.problem.tooLong", { letters: plural(pr.length, "Count.letters"), max: pr.max });
    return t("Kind.runes.problem.empty");
  },

  status: statusOf,

  meta: (p) => `${t(p.cipher.style === "sigils" ? "Kind.runes.meta.sigils" : "Kind.runes.meta.runes")} · ${plural(p.cipher.fragments.length, "Kind.runes.fragments")}`,

  parts: (p) => {
    const n = p.cipher?.fragments.length ?? Math.min(FRAGMENTS.max, Math.max(FRAGMENTS.min, Number(p.fragments) || FRAGMENTS.def));
    return [{ id: "message", icon: "fa-solid fa-scroll" }, ...Array.from({ length: n }, (_, i) => ({ id: `key${i + 1}`, icon: "fa-solid fa-puzzle-piece" }))];
  },

  /** Игроку — послание знаками без букв и только те пары ключа, что на его обрывках. */
  view(p, parts) {
    const c = p.cipher;
    const v = { style: c.style, alphabet: c.alphabet, glyphs: {}, frags: [] };
    const need = new Set();
    if (parts.message) {
      Object.assign(v, { message: c.message, spaces: c.spaces });
      for (const g of c.message.flat()) need.add(g);
    }
    c.fragments.forEach((letters, i) => {
      if (!parts[`key${i + 1}`]) return;
      v.frags.push({ n: i + 1, pairs: letters.map((ch) => [c.letters[ch], ch]) });
      for (const ch of letters) need.add(c.letters[ch]);
    });
    for (const g of need) v.glyphs[g] = c.glyphs[g];
    return v;
  },

  code(p) {
    const c = p.cipher;
    const line = c.fragments.map((f, i) => t("Kind.runes.code", { n: i + 1, letters: f.join(" ") })).join(" · ");
    const notes = c.decoys.length ? [t("Kind.runes.decoys", { letters: c.decoys.join(" ") })] : [];
    return { line, notes, reads: c.words.join(" ") };
  },

  preview: {
    render(p, ui) {
      const c = p.cipher;
      const n = c.fragments.length;
      ui.frag = Math.min(Math.max(0, ui.frag ?? 0), n);
      const fragOf = new Map();
      c.fragments.forEach((letters, i) => letters.forEach((ch) => fragOf.set(c.letters[ch], { ch, i })));
      const letters = {};
      for (const [g, { ch, i }] of fragOf) if (!ui.frag || ui.frag === i + 1) letters[g] = { ch, color: FRAG_INK[i % FRAG_INK.length] };
      const msg = messageSvg(c, { slots: true, letters, label: t("Preview.answer") });
      const key = keySvg(c, { focus: ui.frag, label: t("Kind.runes.part.fullkey") });
      let label;
      if (ui.frag) {
        const own = c.fragments[ui.frag - 1];
        const shown = new Set(c.message.flat().filter((g) => fragOf.get(g)?.i === ui.frag - 1));
        const fake = own.filter((ch) => c.decoys.includes(ch));
        label = t("Kind.runes.preview.frag", { n: ui.frag, shown: shown.size, total: new Set(c.text).size });
        if (fake.length) label += ` · ${t("Kind.runes.preview.fragDecoys", { letters: fake.join(" ") })}`;
      } else label = t("Kind.runes.preview.all");
      const btn = (op, text, pressed, aria) => `<button type="button" class="cp-btn${text.length < 3 ? " cp-btn--icon" : ""}" data-action="kind" data-op="${op}" aria-pressed="${pressed}"${aria ? ` aria-label="${esc(aria)}"` : ""}>${esc(text)}</button>`;
      const controls =
        `<div class="cp-stepper cp-runes-frag-pick" role="group" aria-label="${esc(t("Kind.runes.preview.pick"))}">` +
        btn("frag0", t("Preview.answer"), ui.frag === 0) +
        c.fragments.map((_, i) => btn(`frag${i + 1}`, String(i + 1), ui.frag === i + 1, t("Kind.runes.view.fragment", { n: i + 1 }))).join("") +
        `<span class="cp-stepper__label">${esc(label)}</span></div>`;
      return stage(msg.svg, msg.box) + `<div class="cp-runes-keyfit" style="--cp-ratio:${key.box[2]}/${key.box[3]}">${key.svg}</div>` + controls;
    },
    action(op, ui) {
      const m = /^frag(\d)$/.exec(op ?? "");
      if (m) ui.frag = Number(m[1]);
    },
  },

  player: {
    size: { width: 1080, height: 800 },
    hint(has) {
      const keys = Object.keys(has).some((k) => /^key\d$/.test(k));
      if (!has.message) return t("Kind.runes.view.hintKey");
      return t(keys ? "Kind.runes.view.hintFull" : "Kind.runes.view.hintMessage");
    },
    render: (view, has, state, ctx) => playerHtml(view, state, ctx),
    bind(root, view, has, state, save) {
      if (!view.message) return {};
      const cur = attach(root, view, state, save);
      return {
        action: (op) => cur.action(op),
        apply: (next) => cur.apply(next),
      };
    },
  },

  images(p) {
    const c = p.cipher;
    return [
      { id: "message", svg: (px) => messageSvg(c, { px, label: t("Kind.runes.part.message") }).svg },
      ...c.fragments.map((letters, i) => ({
        id: `key${i + 1}`,
        svg: (px) => scrapSvg({ n: i + 1, pairs: letters.map((ch) => [c.letters[ch], ch]) }, c.glyphs, c.style, { px, label: t("Kind.runes.view.fragment", { n: i + 1 }) }).svg,
      })),
      { id: "fullkey", svg: (px) => keySvg(c, { px, label: t("Kind.runes.part.fullkey") }).svg },
    ];
  },

  // Пример для стенда и снимков README — на языке интерфейса.
  demo: () =>
    globalThis.game?.i18n?.lang === "en"
      ? {
          title: "Signs on the altar",
          phrase: "The seventh sacrifice opens the gates of the abyss",
          style: "sigils",
          fragments: 3,
          spaces: true,
          seed: 6660613,
        }
      : {
          title: "Знаки на алтаре",
          phrase: "Седьмая жертва откроет врата бездны",
          style: "sigils",
          fragments: 3,
          spaces: true,
          seed: 6660613,
        },
};
