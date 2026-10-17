/* Невидимые чернила: обычное письмо на пергаменте, а между строк — лимонный сок.
   Игрок водит свечой над листом: где бумага прогрелась, скрытые строки проступают бурыми буквами.
   Ядро — scripts/core/ink.mjs (раскладка и карта прогрева); здесь поля мастерской, рисунки,
   окно игрока со свечой и картинки. Прогрев хранится в состоянии ({ heat }), на общем столе — общий. */

import { CELL, decodeHeat, encodeHeat, HIDDEN_SCALE, layout, LEVELS, MARGIN_X, mergeHeat, revealedHeat, share, TEXT_W, warmPath } from "../../core/ink.mjs";
import { esc, plural, t } from "../i18n.mjs";
import { fit, INK, num, paper, scriptAttrs, svgOpen, uid, xml } from "../paper.mjs";

const NS = "http://www.w3.org/2000/svg";

/** Проступившие буквы и прогретая бумага. */
const SEPIA = "#6e3510";
const TOAST = "#a9632a";

/** Прозрачность уровней прогрева в маске: слои ложатся друг на друга — 0.4, потом ≈0.73, потом 1. */
const MASK_ALPHA = [0.4, 0.55, 1];

/** Свеча: радиус в клетках, тепло в секунду в центре, как часто сохранять прогрев (мс). */
const RADIUS = 1.8;
const RATE = 6;
const SAVE_EVERY = 900;

/* ---------- рисунок письма ---------- */

/** Кружок прогрева над клеткой i — с мягким краем (градиент dot). */
const dotSvg = (L, i, dot) => `<circle cx="${num(((i % L.cols) + 0.5) * CELL)}" cy="${num((Math.floor(i / L.cols) + 0.5) * CELL)}" r="${num(CELL * 0.95)}" fill="url(#${dot})"/>`;

function dots(L, heat, lv, dot) {
  if (!heat) return "";
  const out = [];
  heat.lv.forEach((v, i) => {
    if (v >= lv) out.push(dotSvg(L, i, dot));
  });
  return out.join("");
}

/** Сгибы: письмо складывали втрое. */
function creases(L, id) {
  const band = 3.2;
  const out = [`<defs><linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4a26" stop-opacity="0"/><stop offset=".46" stop-color="#6b4a26" stop-opacity=".16"/><stop offset=".52" stop-color="#fff6dc" stop-opacity=".38"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></linearGradient></defs>`];
  for (const y of [L.h / 3, (2 * L.h) / 3]) out.push(`<rect x="0" y="${num(y - band / 2)}" width="${L.w}" height="${band}" fill="url(#${id}c)"/>`);
  return out.join("");
}

/**
 * Письмо. L — раскладка с надписями: { w, h, cols, rows, size, headY, footY, lines, hidden, head, foot }.
 * o.mode: "none" — как нашли (без скрытого), "masked" — скрытое проступает по карте o.heat (окно игрока),
 * "all" — скрытое видно целиком, бумага прогрета вдоль строк (для ведущего). o.px, o.label — для картинки.
 */
export function sheetSvg(L, o = {}) {
  const mode = o.mode ?? "none";
  const box = [0, 0, L.w, L.h];
  const id = uid();
  const out = [svgOpen(box, { ...o, cls: "cp-sheet-svg cp-ink-svg" }), paper(box), creases(L, id)];
  const heat = mode === "all" ? revealedHeat(L) : o.heat;
  if (mode !== "none") {
    out.push(
      "<defs>",
      `<radialGradient id="${id}d"><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
      `<mask id="${id}m" class="cp-ink-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${L.w}" height="${L.h}" data-dot="${id}d">`,
      ...MASK_ALPHA.map((a, k) => `<g data-lv="${k + 1}" opacity="${a}">${dots(L, heat, k + 1, `${id}d`)}</g>`),
      "</mask>",
      // неровный нажим: сок ложится пятнами, буквы проступают не везде одинаково
      `<filter id="${id}h" x="-2%" y="-20%" width="104%" height="140%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="11" result="n"/><feColorMatrix in="n" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.6 1.75" result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/></filter>`,
      "</defs>",
    );
    out.push(`<rect class="cp-ink-toast" x="0" y="0" width="${L.w}" height="${L.h}" fill="${TOAST}" opacity=".34" mask="url(#${id}m)" style="mix-blend-mode:multiply"/>`);
  }
  const head = L.size * 1.12;
  // Почерк письма (scriptAttrs подгоняет кегль, чтобы строки занимали ту же ширину, что в раскладке).
  const book = !L.script || L.script === "book";
  const italic = book ? ' font-style="italic"' : "";
  if (L.head) out.push(`<text x="${MARGIN_X}" y="${L.headY}" ${scriptAttrs(L.script, fit(L.head, head, TEXT_W))}${italic} fill="${INK}">${xml(L.head)}</text>`);
  out.push(`<g ${scriptAttrs(L.script, L.size)} fill="${INK}">`);
  for (const line of L.lines) if (line.text) out.push(`<text x="${MARGIN_X}" y="${line.y}">${xml(line.text)}</text>`);
  out.push("</g>");
  if (L.foot) out.push(`<text x="${L.w - MARGIN_X}" y="${L.footY}" ${scriptAttrs(L.script, fit(L.foot, head, TEXT_W * 0.8))}${italic} fill="${INK}" text-anchor="end">${xml(L.foot)}</text>`);
  if (mode !== "none") {
    const mask = mode === "masked" ? ` mask="url(#${id}m)"` : "";
    out.push(`<g class="cp-ink-hidden"${mask}><g ${scriptAttrs(L.script, L.size * HIDDEN_SCALE)}${italic} fill="${SEPIA}" filter="url(#${id}h)">`);
    for (const h of L.hidden) out.push(`<text x="${h.x}" y="${h.y}" transform="rotate(${h.rot} ${h.x} ${h.y})">${xml(h.text)}</text>`);
    out.push("</g></g>");
  }
  out.push("</svg>");
  return out.join("");
}

/** Огонёк свечи: ореол на бумаге и пламя с фитилём. Ставится в точку свечи (--x, --y). */
function candleHtml() {
  const id = uid();
  return (
    `<div class="cp-ink-candle" aria-hidden="true">` +
    `<div class="cp-ink-halo"></div>` +
    `<svg class="cp-ink-flame" viewBox="-12 -40 24 48" xmlns="${NS}">` +
    "<defs>" +
    `<radialGradient id="${id}g"><stop offset="0" stop-color="#ffd27a" stop-opacity=".7"/><stop offset="1" stop-color="#ff9b30" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${id}o" cx="50%" cy="78%" r="70%"><stop offset="0" stop-color="#fff4cf"/><stop offset=".3" stop-color="#ffd25e"/><stop offset=".72" stop-color="#f3851f"/><stop offset="1" stop-color="#c2410c" stop-opacity=".2"/></radialGradient>` +
    `<radialGradient id="${id}i" cx="50%" cy="82%" r="62%"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#fff3c0"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></radialGradient>` +
    "</defs>" +
    `<ellipse cx="0" cy="-12" rx="12" ry="22" fill="url(#${id}g)"/>` +
    `<g class="cp-ink-flame__body">` +
    `<path d="M0,-37C3.6,-28 9,-19 9,-8C9,0.5 5,5 0,5C-5,5 -9,0.5 -9,-8C-9,-18 -3,-25 0,-37Z" fill="url(#${id}o)"/>` +
    `<path d="M0,-21C2.2,-14 4.6,-9 4.6,-3.5C4.6,0.6 2.6,2.8 0,2.8C-2.6,2.8 -4.6,0.6 -4.6,-3.5C-4.6,-9 -2,-14 0,-21Z" fill="url(#${id}i)"/>` +
    `<ellipse cx="0" cy="2.4" rx="2.6" ry="2.2" fill="#6f8cff" opacity=".45"/>` +
    "</g>" +
    `<path d="M0,7.5V1.6" stroke="#2b1a0d" stroke-width="1.3" stroke-linecap="round"/>` +
    `<circle cx="0" cy="1.4" r=".75" fill="#ff7a1a"/>` +
    "</svg></div>"
  );
}

/** Стол: письмо (и огонёк свечи у игрока) с сохранением пропорций. */
function stage(L, sheet, { candle = false } = {}) {
  return `<div class="cp-fit"><div class="cp-stage cp-ink-stage${candle ? " is-lit" : ""}" style="--cp-ratio:${L.w}/${L.h}"><div class="cp-sheet">${sheet}</div>${candle ? candleHtml() : ""}</div></div>`;
}

/** Раскладка с надписями — то, что рисуется. */
const sheetOf = (p) => {
  const { text, gaps, per, ...L } = p.cipher;
  return { ...L, head: p.head, foot: p.foot, script: p.script ?? "scribe" };
};

/** Где проступает: «под строками 3 и 6» и сколько — после письма. */
function whereText(c) {
  const under = c.gaps.filter((g) => g >= 0).map((g) => g + 1);
  const tail = c.hidden.filter((h) => h.gap < 0).length;
  const parts = [];
  if (under.length) parts.push(t("Kind.ink.where", { rows: under.join(", ") }));
  if (tail) parts.push(plural(tail, "Kind.ink.whereTail"));
  return parts.join(" ");
}

const pct = (map) => `${Math.round(share(map) * 100)}%`;

export default {
  id: "ink",
  icon: "fa-solid fa-fire-flame-curved",
  script: "scribe",

  defaults: () => ({ visible: "", hidden: "", head: "", foot: "" }),

  fields: [
    { name: "visible", type: "textarea", wide: true, rows: 6, style: "prose" },
    { name: "hidden", type: "textarea", wide: true, rows: 3, style: "prose" },
    { name: "head", type: "text", style: "italic" },
    { name: "foot", type: "text", style: "prose" },
  ],

  rebuildOn: ["visible", "hidden"],
  shuffle: true,

  build(p) {
    const res = layout({ visible: p.visible, hidden: p.hidden, seed: p.seed });
    if (!res.ok) return { problem: { error: res.error, length: res.length ?? 0, max: res.max ?? 0 } };
    const { ok, ...cipher } = res;
    return { cipher };
  },

  problemText(pr) {
    if (pr.error === "empty") return t("Kind.ink.problem.empty");
    if (pr.error === "noHidden") return t("Kind.ink.problem.noHidden");
    if (pr.error === "tooLong") return t("Kind.ink.problem.tooLong", { length: pr.length, max: pr.max });
    if (pr.error === "hiddenTooLong") return t("Kind.ink.problem.hiddenTooLong", { length: pr.length, max: pr.max });
    return t("Kind.ink.problem.unknown");
  },

  status(p) {
    const c = p.cipher;
    return [plural(c.lines.length, "Kind.ink.lines"), plural(c.hidden.length, "Kind.ink.hiddenLines"), whereText(c)].join(" · ");
  },

  meta: (p) => `${plural(p.cipher.lines.length, "Kind.ink.lines")} · ${plural(p.cipher.hidden.length, "Kind.ink.hiddenLines")}`,

  parts: () => [{ id: "letter", icon: "fa-solid fa-envelope-open-text" }],

  /** Игроку — письмо целиком: скрытые строки нужны, чтобы проступать, но рисуются только под маской прогрева. */
  view(p, parts) {
    return parts.letter ? sheetOf(p) : {};
  },

  code(p) {
    return { line: "", notes: [whereText(p.cipher)], reads: p.cipher.text };
  },

  preview: {
    render(p, ui) {
      ui.reveal ??= true;
      const L = sheetOf(p);
      const sheet = sheetSvg(L, { mode: ui.reveal ? "all" : "none", label: t(ui.reveal ? "Kind.ink.part.revealed" : "Kind.ink.part.letter") });
      const controls =
        `<div class="cp-stepper">` +
        `<button type="button" class="cp-btn" data-action="kind" data-op="reveal" aria-pressed="${ui.reveal}"><i class="fa-solid fa-fire-flame-curved" inert></i> ${esc(t("Kind.ink.preview.reveal"))}</button>` +
        `<span class="cp-stepper__label">${esc(t(ui.reveal ? "Kind.ink.preview.shown" : "Kind.ink.preview.found"))}</span>` +
        "</div>";
      return stage(L, sheet) + controls;
    },
    action(op, ui) {
      if (op === "reveal") ui.reveal = !(ui.reveal ?? true);
    },
  },

  player: {
    size: { width: 820, height: 800 },
    hint: () => t("Kind.ink.view.hint"),
    render(view, has, state) {
      if (!has.letter || !view.lines) return "";
      const heat = decodeHeat(state.heat, view.cols, view.rows);
      const bar =
        `<div class="cp-toolbar" role="toolbar">` +
        `<button type="button" class="cp-btn" data-action="kind" data-op="candle" aria-pressed="true" data-tooltip="${esc(t("Kind.ink.view.candleTip"))}"><i class="fa-solid fa-fire-flame-curved" inert></i> ${esc(t("Kind.ink.view.candle"))}</button>` +
        `<span class="cp-toolbar__top">${esc(t("Kind.ink.view.warmed"))} <b data-heat>${pct(heat)}</b></span>` +
        "</div>";
      return bar + stage(view, sheetSvg(view, { mode: "masked", heat, label: t("Kind.ink.part.letter") }), { candle: true });
    },
    bind(root, view, has, state, save) {
      const stageEl = root.querySelector(".cp-ink-stage");
      const svg = stageEl?.querySelector(".cp-ink-svg");
      const mask = svg?.querySelector(".cp-ink-mask");
      if (!mask) return {};
      const groups = [1, 2, 3].map((lv) => mask.querySelector(`[data-lv="${lv}"]`));
      const dot = mask.dataset.dot;
      const candle = stageEl.querySelector(".cp-ink-candle");
      const btn = root.querySelector('[data-op="candle"]');
      const label = root.querySelector("[data-heat]");
      const map = decodeHeat(state.heat, view.cols, view.rows);

      let lit = true;
      let hot = false;
      let pos = null;
      let last = null;
      let raf = 0;
      let prevT = 0;
      let dirty = false;
      let savedAt = 0;
      let later = 0;

      /** Новые уровни клеток — кружки в слои маски, без перерисовки письма. */
      const paint = (changed) => {
        for (const [i, from, to] of changed) {
          for (let lv = from + 1; lv <= Math.min(to, LEVELS); lv++) {
            const c = document.createElementNS(NS, "circle");
            c.setAttribute("cx", num(((i % view.cols) + 0.5) * CELL));
            c.setAttribute("cy", num((Math.floor(i / view.cols) + 0.5) * CELL));
            c.setAttribute("r", num(CELL * 0.95));
            c.setAttribute("fill", `url(#${dot})`);
            groups[lv - 1].append(c);
          }
        }
        if (changed.length && label) label.textContent = pct(map);
      };

      const flush = () => {
        clearTimeout(later);
        if (!dirty) return;
        dirty = false;
        savedAt = performance.now();
        save({ heat: encodeHeat(map) });
      };

      /** Точка листа под указателем — в клетках; и куда поставить огонёк — в процентах. */
      const locate = (event) => {
        const r = svg.getBoundingClientRect();
        const fx = (event.clientX - r.left) / r.width;
        const fy = (event.clientY - r.top) / r.height;
        candle.style.setProperty("--x", `${num(fx * 100)}%`);
        candle.style.setProperty("--y", `${num(fy * 100)}%`);
        return { x: (fx * view.w) / CELL, y: (fy * view.h) / CELL };
      };

      const tick = (now) => {
        if (!stageEl.isConnected) return;
        const dt = Math.min(0.05, prevT ? (now - prevT) / 1000 : 0.016);
        prevT = now;
        if (hot && pos) {
          const from = last ?? pos;
          const changed = warmPath(map, from.x, from.y, pos.x, pos.y, RADIUS, RATE * dt);
          last = pos;
          if (changed.length) {
            paint(changed);
            dirty = true;
          }
          if (dirty && now - savedAt > SAVE_EVERY) flush();
        }
        raf = hot ? requestAnimationFrame(tick) : 0;
      };

      const show = (on) => candle.classList.toggle("is-on", on && lit);

      stageEl.addEventListener("pointerenter", (event) => {
        locate(event);
        show(true);
      });
      stageEl.addEventListener("pointerleave", () => {
        if (!hot) show(false);
      });
      stageEl.addEventListener("pointermove", (event) => {
        if (!lit) return;
        pos = locate(event);
        show(true);
      });
      stageEl.addEventListener("pointerdown", (event) => {
        if (!lit || event.button !== 0) return;
        event.preventDefault();
        stageEl.setPointerCapture?.(event.pointerId);
        hot = true;
        pos = locate(event);
        last = null;
        prevT = 0;
        candle.classList.add("is-hot");
        show(true);
        if (!raf) raf = requestAnimationFrame(tick);
      });
      const release = (event) => {
        if (!hot) return;
        hot = false;
        candle.classList.remove("is-hot");
        if (event.type === "pointercancel" || !stageEl.matches(":hover")) show(false);
        flush();
      };
      stageEl.addEventListener("pointerup", release);
      stageEl.addEventListener("pointercancel", release);

      return {
        action(op) {
          if (op !== "candle") return;
          lit = !lit;
          btn?.setAttribute("aria-pressed", String(lit));
          stageEl.classList.toggle("is-lit", lit);
          if (!lit) show(false);
        },
        /** Чужой прогрев с общего стола: в каждой клетке — больший уровень; свой, если горячее, — отправить. */
        apply(next) {
          const { changed, ahead } = mergeHeat(map, decodeHeat(next?.heat, view.cols, view.rows));
          paint(changed);
          if (ahead) {
            dirty = true;
            clearTimeout(later);
            later = setTimeout(flush, 400);
          }
        },
      };
    },
  },

  images(p) {
    const L = sheetOf(p);
    return [
      { id: "letter", svg: (px) => sheetSvg(L, { px, label: t("Kind.ink.part.letter") }) },
      { id: "revealed", svg: (px) => sheetSvg(L, { px, mode: "all", label: t("Kind.ink.part.revealed") }) },
    ];
  },

  demo: () => ({
    title: "Письмо из Ольховки",
    visible: [
      "Пишу с оказией, пока обоз не ушёл. Будь добра, пришли к Зимнему празднику серой шерсти потолще — на две пары чулок — и горшочек липового мёда: здешний горчит.",
      "У нас всё по-старому. Мельник опять бранится с кузнецом из-за межи, вдова Агна выдаёт дочку за сына пекаря, а у старосты окотилась кошка — котят раздали по дворам.",
      "Кланяйся дяде Тобиасу и не хворай.",
    ].join("\n"),
    hidden: "Казначей продал нас.\nВстреча в часовне в полночь.",
    head: "Любезная тётушка Марта!",
    foot: "Любящая тебя Лисса",
    seed: 20261017,
  }),
};
