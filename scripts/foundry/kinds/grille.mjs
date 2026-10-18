/* Поворотная решётка: квадратное письмо с буквами и латунная пластина с окошками.
   Ядро — scripts/core/grille.mjs; здесь поля мастерской, рисунки, окно игрока и картинки. */

import { autoSize, formatSteps, generate, holesAt, maxLetters, orientations, SIZE, stepCells, stepText } from "../../core/grille.mjs";
import { hasCyrillic } from "../../core/alphabet.mjs";
import { esc, plural, t } from "../i18n.mjs";
import { fit, INK, INK_SOFT, LIT, paper, scriptAttrs, SERIF, svgOpen, uid, xml } from "../paper.mjs";
import { bindPlate, plateStyle, plateSvg, ROMAN } from "../plate.mjs";

const CELL = 10;
const MARGIN = 18;
const RIM = 7;
const mod4 = (k) => ((k % 4) + 4) % 4;

/** Подложка букв ответа: свой цвет для каждого прохода кода. */
export const PASS_TINT = ["#b8862b", "#3f8f86", "#a8505f", "#6d5aa8"];

const sheetBox = (n) => [-MARGIN, -MARGIN, n * CELL + 2 * MARGIN, n * CELL + 2 * MARGIN];
const plateBox = (n) => [-RIM, -RIM, n * CELL + 2 * RIM, n * CELL + 2 * RIM];
const holeRects = (holes) => holes.map(([r, c]) => [c * CELL + 1.6, r * CELL + 1.6, 6.8, 6.8]);
const openCells = (view, k) => new Set(holesAt(view.holes, view.n, k).map(([r, c]) => r * view.n + c));

/**
 * Письмо: пергамент, сетка букв, номера строк, надписи сверху и снизу.
 * view: { n, grid, head, foot }
 * o.glow — подложки для огоньков в окошках; o.answer — { cells: Map<индекс, проход>, steps } — ответ для ведущего.
 */
export function sheetSvg(view, o = {}) {
  const { n, grid } = view;
  const box = sheetBox(n);
  const W = box[2];
  const G = n * CELL;
  const band = (MARGIN - RIM) / 2 + RIM;
  const id = uid();
  const out = [svgOpen(box, { ...o, cls: "cp-sheet-svg" }), paper(box)];
  if (o.glow) {
    out.push(`<defs><radialGradient id="${id}l"><stop offset="0" stop-color="#ffefc2" stop-opacity=".95"/><stop offset=".55" stop-color="#ffd47e" stop-opacity=".5"/><stop offset="1" stop-color="#ffd47e" stop-opacity="0"/></radialGradient></defs>`);
  }
  if (o.answer) {
    out.push('<g class="cp-answer" fill-opacity=".26">');
    for (const [i, pass] of o.answer.cells) {
      out.push(`<rect x="${(i % n) * CELL + 0.8}" y="${Math.floor(i / n) * CELL + 0.8}" width="8.4" height="8.4" rx="1" fill="${PASS_TINT[pass] ?? PASS_TINT[0]}"/>`);
    }
    out.push("</g>");
  }
  if (o.glow) {
    out.push(`<g class="cp-glows" fill="url(#${id}l)">`);
    for (let i = 0; i < n * n; i++) out.push(`<rect class="cp-glow" data-i="${i}" x="${(i % n) * CELL - 1}" y="${Math.floor(i / n) * CELL - 1}" width="12" height="12"/>`);
    out.push("</g>");
  }
  out.push(`<g font-family="${SERIF}" font-weight="500" font-size="4.2" fill="${INK_SOFT}" text-anchor="middle" style="font-variant-numeric:lining-nums">`);
  for (let r = 0; r < n; r++) out.push(`<text x="${-band}" y="${r * CELL + 5}" dy=".34em">${r + 1}</text>`);
  out.push("</g>");
  out.push(`<g ${scriptAttrs(view.script, 6.6, { bold: true })} fill="${INK}" text-anchor="middle">`);
  const lit = o.answer?.cells;
  grid.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const i = r * n + c;
      const fill = lit?.has(i) ? ` fill="${LIT}"` : "";
      out.push(`<text class="cp-l" data-i="${i}" x="${c * CELL + 5}" y="${r * CELL + 5}" dy=".34em"${fill}>${xml(ch)}</text>`);
    }),
  );
  out.push("</g>");
  if (o.answer?.steps?.length) {
    out.push(`<g font-family="${SERIF}" font-weight="700" font-size="4.2" fill="${LIT}" text-anchor="middle" style="font-variant-numeric:lining-nums">`);
    for (const st of o.answer.steps) out.push(`<text x="${G + band}" y="${st.row * CELL + 5}" dy=".34em">${xml(stepText(st))}</text>`);
    out.push("</g>");
  }
  const wide = W - 10;
  const book = !view.script || view.script === "book";
  if (view.head) out.push(`<text x="${G / 2}" y="${-band}" dy=".3em" ${scriptAttrs(view.script, fit(view.head, 6.4, wide))}${book ? ' font-style="italic"' : ""} fill="${INK}" text-anchor="middle">${xml(view.head)}</text>`);
  if (view.foot) out.push(`<text x="${G / 2}" y="${G + band}" dy=".3em" ${scriptAttrs(view.script, fit(view.foot, 5, wide))} fill="${INK}" text-anchor="middle">${xml(view.foot)}</text>`);
  out.push("</svg>");
  return out.join("");
}

const gridPlate = (view, o = {}) => plateSvg(plateBox(view.n), holeRects(view.holes), { ...o, marks: true });

/** Стол: письмо и/или пластина. Если есть только пластина — она лежит одна посередине. */
function stage(view, has, { fixed = false, k = 0, glow = true, sheet } = {}) {
  const n = view.n;
  const plate = has.plate
    ? `<div class="cp-plate${fixed ? " is-fixed" : ""}" ${fixed ? "" : `tabindex="0" role="button" aria-label="${esc(t("Kind.grille.view.plateAria"))}"`} style="${has.letter ? plateStyle(sheetBox(n), plateBox(n)) : ""}${fixed ? `;transform:rotate(${k * 90}deg)` : ""}"><div class="cp-plate__face">${gridPlate(view, { label: t("Kind.grille.part.plate") })}</div></div>`
    : "";
  const letter = has.letter ? `<div class="cp-sheet">${sheet ?? sheetSvg(view, { glow: glow && has.plate, label: t("Kind.grille.part.letter") })}</div>` : "";
  return `<div class="cp-fit"><div class="cp-stage${has.letter ? "" : " cp-stage--plate"}" style="--cp-ratio:1">${letter}${plate}</div></div>`;
}

function statusOf(p) {
  const c = p.cipher;
  const counts = c.perRow.filter((m) => m > 0);
  const lo = Math.min(...counts);
  const hi = Math.max(...counts);
  const per = lo === hi ? String(lo) : `${lo}–${hi}`;
  const empty = c.perRow.length - counts.length;
  const size = t(c.auto ? "Kind.grille.status.sizeAuto" : "Kind.grille.status.size", { size: `${c.n}×${c.n}` });
  const parts = [plural(c.text.length, "Count.letters"), size, t("Kind.grille.status.perRow", { per })];
  if ((c.passes ?? 1) > 1) parts.push(plural(c.passes, "Kind.grille.passes"));
  if (empty) parts.push(plural(empty, "Kind.grille.status.emptyRows"));
  if (c.dropped?.length) parts.push(t("Status.dropped", { chars: c.dropped.join(" ") }));
  return parts.join(" · ");
}

export default {
  id: "grille",
  icon: "fa-solid fa-border-all",
  script: "book",

  defaults: () => ({ phrase: "", head: "", foot: "", rows: null, dirs: "mixed", yo: true }),

  fields: [
    { name: "phrase", type: "textarea", wide: true, rows: 2, style: "prose" },
    { name: "head", type: "text", style: "italic" },
    { name: "foot", type: "text", style: "prose" },
    {
      group: [
        { name: "rows", type: "number", min: SIZE.min, max: SIZE.max, auto: true },
        { name: "dirs", type: "select", options: ["mixed", "cw"] },
        // «Ё как Е» нужна только русской фразе.
        { name: "yo", type: "checkbox", when: (p) => hasCyrillic(p.phrase) },
      ],
    },
  ],

  rebuildOn: ["phrase", "rows", "dirs", "yo"],
  shuffle: true,

  build(p) {
    const res = generate({ phrase: p.phrase, rows: p.rows, seed: p.seed, dirs: p.dirs, yo: p.yo });
    if (!res.ok) return { problem: { error: res.error, n: res.n, length: res.length ?? 0, max: res.max ?? 0 } };
    const { n, auto, text, alphabet, dropped, grid, holes, steps, passes, perRow } = res;
    return { cipher: { n, auto, text, alphabet, dropped, grid, holes, steps, passes, perRow } };
  },

  problemText(pr) {
    if (pr.error === "empty") return t("Kind.grille.problem.empty");
    if (pr.error === "tooLong") {
      const letters = plural(pr.length, "Count.letters");
      return pr.length > maxLetters(SIZE.max)
        ? t("Kind.grille.problem.tooLongMax", { letters, max: maxLetters(SIZE.max) })
        : t("Kind.grille.problem.tooLong", { letters, size: `${pr.n}×${pr.n}`, max: pr.max, need: autoSize(pr.length) });
    }
    return t("Kind.grille.problem.unsolved");
  },

  status: statusOf,

  meta: (p) => `${p.cipher.n}×${p.cipher.n} · ${plural(p.cipher.text.length, "Count.letters")}`,

  parts: () => [
    { id: "letter", icon: "fa-solid fa-scroll" },
    { id: "plate", icon: "fa-solid fa-border-all" },
  ],

  /** Игроку — только то, что у него в руках: письмо без окошек, пластина без букв. */
  view(p, parts) {
    const c = p.cipher;
    const v = { n: c.n };
    if (parts.letter) Object.assign(v, { grid: c.grid, head: p.head, foot: p.foot, script: p.script ?? "book" });
    if (parts.plate) v.holes = c.holes;
    return v;
  },

  code(p) {
    const c = p.cipher;
    const line = t("Kind.grille.code", { steps: formatSteps(c.steps), first: stepText(c.steps[0]) });
    const notes = [];
    if ((c.passes ?? 1) > 1) {
      notes.push(t("Kind.grille.loop", { last: c.steps.at(-1).row + 1, first: `${c.steps[0].row + 1} ${stepText(c.steps[0])}`, passes: plural(c.passes, "Kind.grille.passes") }));
    }
    return { line, notes, reads: c.text };
  },

  preview: {
    render(p, ui) {
      const c = p.cipher;
      const len = c.steps.length;
      const passes = c.passes ?? 1;
      const total = len * passes;
      ui.step = Math.min(Math.max(0, ui.step ?? 0), total);
      const ks = orientations(c.steps, passes);
      const view = { ...c, head: p.head, foot: p.foot, script: p.script ?? "book" };
      let body;
      let label;
      let keys = "";
      if (ui.step === 0) {
        const cells = new Map();
        ks.forEach((k, i) => {
          for (const [r, col] of stepCells(c, c.steps[i % len], k)) if (cells.size < c.text.length) cells.set(r * c.n + col, Math.floor(i / len));
        });
        body = stage(view, { letter: true }, { sheet: sheetSvg(view, { answer: { cells, steps: c.steps }, label: t("Preview.answer") }) });
        label = passes > 1 ? t("Kind.grille.preview.allPasses", { passes: plural(passes, "Kind.grille.passes") }) : t("Kind.grille.preview.all");
        if (passes > 1) keys = `<span class="cp-passes">${PASS_TINT.slice(0, passes).map((color, i) => `<span class="cp-passes__key" style="--cp-pass:${color}">${i + 1}</span>`).join("")}</span>`;
        ui.lit = null;
      } else {
        const i = ui.step - 1;
        const s = c.steps[i % len];
        const k = ks[i];
        ui.lit = stepCells(c, s, k).map(([r, col]) => r * c.n + col);
        const read = ui.lit.map((idx) => c.grid[Math.floor(idx / c.n)][idx % c.n]).join("");
        const data = { i: (i % len) + 1, n: len, row: s.row + 1, turn: stepText(s), top: ROMAN[k], pass: Math.floor(i / len) + 1 };
        body = stage(view, { letter: true, plate: true }, { fixed: true, k });
        label = `${passes > 1 ? t("Kind.grille.preview.stepPass", data) : t("Kind.grille.preview.step", data)} — <b>${esc(read)}</b>`;
      }
      const btn = (op, icon, aria, disabled) => `<button type="button" class="cp-btn cp-btn--icon" data-action="kind" data-op="${op}" aria-label="${esc(aria)}"${disabled ? " disabled" : ""}><i class="fa-solid ${icon}" inert></i></button>`;
      const controls =
        `<div class="cp-stepper" role="group" aria-label="${esc(t("Kind.grille.preview.stepper"))}">` +
        btn("stepPrev", "fa-chevron-left", t("Kind.grille.preview.prev"), ui.step === 0) +
        `<button type="button" class="cp-btn" data-action="kind" data-op="stepAll" aria-pressed="${ui.step === 0}">${esc(t("Preview.answer"))}</button>` +
        `<span class="cp-stepper__label">${ui.step === 0 ? esc(label) : label}</span>${keys}` +
        btn("stepNext", "fa-chevron-right", t("Kind.grille.preview.next"), ui.step === total) +
        "</div>";
      return body + controls;
    },
    action(op, ui) {
      if (op === "stepPrev") ui.step = (ui.step ?? 0) - 1;
      else if (op === "stepNext") ui.step = (ui.step ?? 0) + 1;
      else if (op === "stepAll") ui.step = 0;
    },
    after(root, ui) {
      if (!ui.lit) return;
      const lit = new Set(ui.lit);
      for (const el of root.querySelectorAll(".cp-glow, .cp-l")) el.classList.toggle("is-lit", lit.has(Number(el.dataset.i)));
    },
  },

  player: {
    size: { width: 900, height: 720 },
    render(view, has, state) {
      let bar = "";
      if (has.plate) {
        bar =
          `<div class="cp-toolbar" role="toolbar">` +
          `<button type="button" class="cp-btn cp-btn--icon" data-action="kind" data-op="turnLeft" data-tooltip="${esc(t("Kind.grille.view.turnLeft"))}" aria-label="${esc(t("Kind.grille.view.turnLeft"))}"><i class="fa-solid fa-rotate-left" inert></i></button>` +
          `<button type="button" class="cp-btn cp-btn--icon" data-action="kind" data-op="turnRight" data-tooltip="${esc(t("Kind.grille.view.turnRight"))}" aria-label="${esc(t("Kind.grille.view.turnRight"))}"><i class="fa-solid fa-rotate-right" inert></i></button>` +
          (has.letter
            ? `<button type="button" class="cp-btn" data-action="kind" data-op="align"><i class="fa-solid fa-crosshairs" inert></i> ${esc(t("Kind.grille.view.align"))}</button>` +
              `<button type="button" class="cp-btn" data-action="kind" data-op="lift" aria-pressed="${Boolean(state.lifted)}"><i class="fa-solid fa-hand" inert></i> ${esc(t("Kind.grille.view.lift"))}</button>`
            : "") +
          `<span class="cp-toolbar__top">${esc(t("Kind.grille.view.top"))} <b data-top>${ROMAN[mod4(state.k ?? 0)]}</b></span>` +
          `</div>`;
      }
      return bar + stage(view, has);
    },
    bind(root, view, has, state, save) {
      if (!has.plate) return {};
      const top = root.querySelector("[data-top]");
      const liftBtn = root.querySelector('[data-op="lift"]');
      const show = (st) => {
        if (top) top.textContent = ROMAN[mod4(st.k)];
        liftBtn?.setAttribute("aria-pressed", String(st.lifted));
      };
      const n = view.n;
      const plate = bindPlate(root.querySelector(".cp-stage"), {
        sheet: has.letter ? sheetBox(n) : plateBox(n),
        plate: plateBox(n),
        state,
        glow: has.letter,
        cellsAt: (k) => openCells(view, k),
        onChange: (st) => {
          show(st);
          save({ k: st.k, dx: st.dx, dy: st.dy, lifted: st.lifted });
        },
      });
      return {
        action(op) {
          if (op === "turnLeft") plate.rotate(-1);
          else if (op === "turnRight") plate.rotate(1);
          else if (op === "align") plate.align();
          else if (op === "lift") plate.lift();
        },
        apply(next) {
          plate.apply(next);
          show(plate.state);
        },
      };
    },
  },

  images(p) {
    const view = { ...p.cipher, head: p.head, foot: p.foot, script: p.script ?? "book" };
    return [
      { id: "letter", svg: (px) => sheetSvg(view, { px, label: t("Kind.grille.part.letter") }) },
      { id: "plate", svg: (px) => gridPlate(view, { px, label: t("Kind.grille.part.plate") }) },
    ];
  },

  // Пример для стенда и снимков README — на языке интерфейса.
  demo: () =>
    globalThis.game?.i18n?.lang === "en"
      ? {
          title: "The Archmage's Cipher",
          phrase: "Your father is innocent. He kept silent at my word. Forgive me. Go to the Quill and Ash and say the word: the Archmage's truth. Then check the tomb and stop the war.",
          head: "To Elecia. In person.",
          foot: "An empty cup holds everything. — L.",
          seed: 20261017,
        }
      : {
          title: "Шифр Архимага",
          phrase: [
            "ТВОЙОТЕЦНИВЧЕМНЕВИНОВАТОНМОЛЧАЛПОМОЕ",
            "МУСЛОВУПРОСТИМЕНЯЗАЙДИВПЕРОИПЕПЕЛСКА",
            "ЖИСЛОВОПРАВДААРХИМАГАПОТОМПРОВЕРЬГРО",
            "БИНЕДОПУСТИВОЙНЫ",
          ].join("\n"),
          head: "Элеции. Лично.",
          foot: "Пустая чаша вмещает всё. — Л.",
          seed: 20261017,
        },
};

