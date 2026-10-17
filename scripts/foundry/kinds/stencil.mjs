/* Письмо с секретом (трафарет Кардано): обычное письмо и латунная пластина с окошками.
   Положишь пластину ровно — в окошках проступит тайная фраза. Пластина не вращается.
   Ядро — scripts/core/stencil.mjs; здесь поля мастерской, рисунки, окно игрока и картинки. */

import { cellsOfSlots, generate, readCells, slotsOf, WIDTH } from "../../core/stencil.mjs";
import { hasCyrillic } from "../../core/alphabet.mjs";
import { esc, plural, t } from "../i18n.mjs";
import { INK, LIT, num, paper, scriptAttrs, svgOpen, uid, xml } from "../paper.mjs";
import { bindPlate, plateStyle, plateSvg } from "../plate.mjs";

/** Клетка знака: ширина и высота строки (в единицах рисунка). */
const CW = 5.8;
const LH = 12.5;
/** Кегль и где базовая линия внутри строки. */
const FONT = 9;
const BASE = 9;
/** Поля письма и кромка пластины вокруг текста. */
const MX = 18;
const MY = 20;
const RIM = 10;
/** Широкие знаки Alegreya (ширина в кеглях): шире клетки — поджимаются по горизонтали,
    как на пишущей машинке, чтобы не наезжать на соседей. */
const WIDE = { Ш: 1.07, Щ: 1.05, Ю: 1, W: 0.95, Ж: 0.94, "—": 0.9, Ы: 0.87, М: 0.84, M: 0.84, щ: 0.83, m: 0.83, ш: 0.82, ж: 0.76, И: 0.75, Й: 0.75, Н: 0.75, H: 0.75, ю: 0.74, П: 0.72, Ф: 0.72, Ц: 0.72, N: 0.72, w: 0.72 };
const ROOM = 0.7;
const squeeze = (ch) => (WIDE[ch] > ROOM ? num(ROOM / WIDE[ch]) : 1);
/** Сдвиг пластины на один шаг (мышь и стрелки) — одна строка. */
const STEP = LH;
/** Где лежит пластина, пока её не положили ровно: чуть ниже и правее места, в шагах.
    Кромка пластины шире этого сдвига — край текста из-под неё не выглядывает. */
const ASKEW = { dx: 0.5, dy: 0.6 };

const sheetBox = (v) => [-MX, -MY, v.width * CW + 2 * MX, v.rows * LH + 2 * MY];
const plateBox = (v) => [-RIM, -RIM, v.width * CW + 2 * RIM, v.rows * LH + 2 * RIM];
const ratio = (v) => {
  const [, , w, h] = sheetBox(v);
  return `${num(w)}/${num(h)}`;
};

/** Прорези пластины: окошко чуть шире клетки, чтобы широкая буква (Ж, Ш) не обрезалась. */
// Прорези с небольшим запасом: рукописные буквы шире машинописной клетки.
const holeRects = (slots) => slots.map(([r, c, len]) => [c * CW - 0.8, r * LH + 0.9, len * CW + 1.6, LH - 1.5]);

/** Клетки под окошками пластины. */
const openCells = (v) => new Set(cellsOfSlots(v.slots ?? [], v.width));

/**
 * Письмо: пергамент, строки текста — каждый знак в своей клетке, сгибы листа.
 * view: { width, rows, lines }.
 * o.hot — клетки, которые могут загореться (под окошками): рисуются отдельно, с подложкой-огоньком;
 * o.lit — сразу зажечь их; o.answer — клетки фразы для ведущего: подсветка и красные буквы.
 */
export function sheetSvg(view, o = {}) {
  const { width, lines } = view;
  const box = sheetBox(view);
  const [bx, by, bw, bh] = box;
  const hot = o.hot ?? new Set();
  const answer = o.answer ?? new Set();
  const id = uid();
  const out = [svgOpen(box, { ...o, cls: "cp-sheet-svg cp-stencil-sheet" }), paper(box)];
  // Сгибы: письмо складывали втрое.
  out.push('<g fill="none" stroke-width=".45">');
  for (const f of [1 / 3, 2 / 3]) {
    const y = num(by + bh * f);
    out.push(`<path d="M${num(bx)},${y}H${num(bx + bw)}" stroke="#6b4518" stroke-opacity=".16"/><path d="M${num(bx)},${num(y + 0.5)}H${num(bx + bw)}" stroke="#fff6dc" stroke-opacity=".38"/>`);
  }
  out.push("</g>");
  if (answer.size) {
    out.push('<g fill="#b8862b" fill-opacity=".28">');
    for (const [r, c, len] of slotsOf(answer, width)) out.push(`<rect x="${num(c * CW + 0.3)}" y="${num(r * LH + 1.4)}" width="${num(len * CW - 0.6)}" height="${num(LH - 2.6)}" rx="1.2"/>`);
    out.push("</g>");
  }
  if (hot.size) {
    out.push(`<defs><radialGradient id="${id}l"><stop offset="0" stop-color="#ffefc2" stop-opacity=".95"/><stop offset=".55" stop-color="#ffd47e" stop-opacity=".5"/><stop offset="1" stop-color="#ffd47e" stop-opacity="0"/></radialGradient></defs>`);
    out.push(`<g fill="url(#${id}l)">`);
    for (const i of hot) {
      const r = Math.floor(i / width);
      const c = i % width;
      out.push(`<rect class="cp-glow${o.lit ? " is-lit" : ""}" data-i="${i}" x="${num(c * CW - 1.6)}" y="${num(r * LH)}" width="${num(CW + 3.2)}" height="${LH}"/>`);
    }
    out.push("</g>");
  }
  // Обычные знаки строки — одним <text> с x для каждого знака; горячие (зажигаются) и широкие — по одному.
  // Почерк письма; книжный — средней насыщенности, как машинописный лист.
  const book = !view.script || view.script === "book";
  // Рукописные буквы в клетках кажутся редкими — чуть крупнее.
  const attrs = scriptAttrs(view.script, book ? FONT : FONT * 1.06, { fallback: "note" });
  out.push(`<g ${book ? attrs.replace(/font-weight="\d+"/, 'font-weight="500"') : attrs} fill="${INK}" text-anchor="middle">`);
  lines.forEach((line, r) => {
    const xs = [];
    let chars = "";
    const y = num(r * LH + BASE);
    [...line].forEach((ch, c) => {
      if (/\s/.test(ch)) return;
      const i = r * width + c;
      const x = num(c * CW + CW / 2);
      const sx = squeeze(ch);
      if (hot.has(i) || answer.has(i) || sx < 1) {
        const cls = hot.has(i) ? ` class="cp-l${o.lit ? " is-lit" : ""}" data-i="${i}"` : "";
        const fill = answer.has(i) || (o.lit && hot.has(i)) ? ` fill="${LIT}"` : "";
        const at = sx < 1 ? `x="0" y="0" transform="translate(${x} ${y}) scale(${sx} 1)"` : `x="${x}" y="${y}"`;
        out.push(`<text${cls} ${at}${fill}>${xml(ch)}</text>`);
        return;
      }
      xs.push(x);
      chars += xml(ch);
    });
    if (xs.length) out.push(`<text x="${xs.join(" ")}" y="${y}">${chars}</text>`);
  });
  out.push("</g></svg>");
  return out.join("");
}

const stencilPlate = (view, o = {}) => plateSvg(plateBox(view), holeRects(view.slots), o);

/**
 * Стол: письмо и/или пластина. Только пластина — лежит одна посередине (в рамке размером с письмо).
 * o.fixed — пластина лежит ровно и не двигается (предпросмотр); o.sheet — готовый рисунок письма.
 */
function stage(view, has, { fixed = false, sheet } = {}) {
  const sb = sheetBox(view);
  const plate = has.plate
    ? `<div class="cp-plate cp-stencil-plate${fixed ? " is-fixed" : ""}" ${fixed ? "" : `tabindex="0" role="button" aria-label="${esc(t("Kind.stencil.view.plateAria"))}"`} style="${plateStyle(sb, plateBox(view))}"><div class="cp-plate__face">${stencilPlate(view, { label: t("Kind.stencil.part.plate") })}</div></div>`
    : "";
  const letter = has.letter ? `<div class="cp-sheet">${sheet ?? sheetSvg(view, { hot: has.plate ? openCells(view) : null, label: t("Kind.stencil.part.letter") })}</div>` : "";
  return `<div class="cp-fit"><div class="cp-stage cp-stencil-stage${has.letter ? "" : " cp-stencil-stage--plate"}" style="--cp-ratio:${ratio(view)}">${letter}${plate}</div></div>`;
}

/** Положение пластины: сохранённое или «ещё не положена ровно» (если есть письмо). */
function placed(state, has) {
  const fresh = state?.dx === undefined && state?.dy === undefined;
  if (fresh && has.letter) return { ...ASKEW, lifted: Boolean(state?.lifted) };
  return { dx: Number(state?.dx) || 0, dy: Number(state?.dy) || 0, lifted: Boolean(state?.lifted) };
}

function statusOf(p) {
  const c = p.cipher;
  const sheet = t("Kind.stencil.status.sheet", { rows: plural(c.rows, "Kind.stencil.rows"), chars: plural(c.width, "Kind.stencil.chars") });
  const parts = [plural(c.text.length, "Count.letters"), c.auto ? `${sheet} ${t("Kind.stencil.status.auto")}` : sheet, plural(c.slots.length, "Kind.stencil.slots")];
  if (c.dropped?.length) parts.push(t("Status.dropped", { chars: c.dropped.join(" ") }));
  return parts.join(" · ");
}

export default {
  id: "stencil",
  icon: "fa-solid fa-file-lines",
  script: "note",

  defaults: () => ({ cover: "", phrase: "", width: null, yo: true }),

  fields: [
    { name: "cover", type: "textarea", wide: true, rows: 7, style: "prose" },
    { name: "phrase", type: "text", wide: true },
    {
      group: [
        { name: "width", type: "number", min: WIDTH.min, max: WIDTH.max, auto: true },
        // «Ё как Е» нужна только русской фразе.
        { name: "yo", type: "checkbox", when: (p) => hasCyrillic(p.phrase) || hasCyrillic(p.cover) },
      ],
    },
  ],

  rebuildOn: ["cover", "phrase", "width", "yo"],
  shuffle: true,

  build(p) {
    const res = generate({ cover: p.cover, phrase: p.phrase, width: p.width, seed: p.seed, yo: p.yo });
    if (!res.ok) return { problem: res };
    const { width, auto, lines, rows, text, alphabet, dropped, cells, slots } = res;
    return { cipher: { width, auto, lines, rows, text, alphabet, dropped, cells, slots } };
  },

  problemText(pr) {
    if (pr.error === "noCover") return t("Kind.stencil.problem.noCover");
    if (pr.error === "noPhrase") return t("Kind.stencil.problem.noPhrase");
    if (pr.error === "missing") {
      return pr.found ? t("Kind.stencil.problem.missing", { letter: pr.letter, after: pr.after }) : t("Kind.stencil.problem.missingFirst", { letter: pr.letter });
    }
    return t("Kind.stencil.problem.unknown");
  },

  status: statusOf,

  meta: (p) => `${plural(p.cipher.rows, "Kind.stencil.rows")} · ${plural(p.cipher.text.length, "Count.letters")}`,

  parts: () => [
    { id: "letter", icon: "fa-solid fa-envelope-open-text" },
    { id: "plate", icon: "fa-solid fa-table-cells-large" },
  ],

  /** Игроку — только то, что у него в руках: письмо без окошек, пластина без букв. */
  view(p, parts) {
    const c = p.cipher;
    const v = { width: c.width, rows: c.rows };
    if (parts.letter) Object.assign(v, { lines: c.lines, script: p.script ?? "note" });
    if (parts.plate) v.slots = c.slots;
    return v;
  },

  code(p) {
    const c = p.cipher;
    return { line: t("Kind.stencil.code", { n: c.slots.length }), notes: [], reads: String(p.phrase ?? "").replace(/\s+/g, " ").trim() };
  },

  preview: {
    render(p, ui) {
      const c = p.cipher;
      const view = { width: c.width, rows: c.rows, lines: c.lines, slots: c.slots, script: p.script ?? "note" };
      const cells = new Set(c.cells);
      const on = Boolean(ui.plate);
      const body = on
        ? stage(view, { letter: true, plate: true }, { fixed: true, sheet: sheetSvg(view, { hot: openCells(view), lit: true, label: t("Preview.answer") }) })
        : stage(view, { letter: true }, { sheet: sheetSvg(view, { answer: cells, label: t("Preview.answer") }) });
      const read = readCells(c.lines, c.width, c.cells).toUpperCase();
      const label = on ? t("Kind.stencil.preview.plate") : t("Kind.stencil.preview.letter");
      const controls =
        `<div class="cp-stepper cp-stencil-bar">` +
        `<button type="button" class="cp-btn" data-action="kind" data-op="plate" aria-pressed="${on}"><i class="fa-solid fa-table-cells-large" inert></i> ${esc(t("Kind.stencil.preview.toggle"))}</button>` +
        `<span class="cp-stepper__label">${esc(label)} — <b>${esc(read)}</b></span>` +
        `</div>`;
      return body + controls;
    },
    action(op, ui) {
      if (op === "plate") ui.plate = !ui.plate;
    },
  },

  player: {
    size: { width: 980, height: 640 },
    hint: (has) => t(has.letter && has.plate ? "Kind.stencil.view.hintFull" : has.letter ? "Kind.stencil.view.hintLetter" : "Kind.stencil.view.hintPlate"),
    render(view, has, state) {
      let bar = "";
      if (has.plate && has.letter) {
        const st = placed(state, has);
        bar =
          `<div class="cp-toolbar" role="toolbar">` +
          `<button type="button" class="cp-btn" data-action="kind" data-op="align"><i class="fa-solid fa-crosshairs" inert></i> ${esc(t("Kind.stencil.view.align"))}</button>` +
          `<button type="button" class="cp-btn" data-action="kind" data-op="lift" aria-pressed="${st.lifted}"><i class="fa-solid fa-hand" inert></i> ${esc(t("Kind.stencil.view.lift"))}</button>` +
          `</div>`;
      }
      return bar + stage(view, has);
    },
    bind(root, view, has, state, save) {
      if (!has.plate) return {};
      const liftBtn = root.querySelector('[data-op="lift"]');
      const open = openCells(view);
      const plate = bindPlate(root.querySelector(".cp-stage"), {
        sheet: sheetBox(view),
        plate: plateBox(view),
        step: STEP,
        rotatable: false,
        state: placed(state, has),
        glow: has.letter,
        cellsAt: () => open,
        onChange: (st) => {
          liftBtn?.setAttribute("aria-pressed", String(st.lifted));
          save({ dx: st.dx, dy: st.dy, lifted: st.lifted });
        },
      });
      if (!plate) return {};
      return {
        action(op) {
          if (op === "align") plate.align();
          else if (op === "lift") plate.lift();
        },
        apply(next) {
          plate.apply(placed(next, has));
          liftBtn?.setAttribute("aria-pressed", String(plate.state.lifted));
        },
      };
    },
  },

  images(p) {
    const c = p.cipher;
    const view = { width: c.width, rows: c.rows, lines: c.lines, slots: c.slots, script: p.script ?? "note" };
    return [
      { id: "letter", svg: (px) => sheetSvg(view, { px, label: t("Kind.stencil.part.letter") }) },
      { id: "plate", svg: (px) => stencilPlate(view, { px, label: t("Kind.stencil.part.plate") }) },
    ];
  },

  // Пример для стенда и снимков README — на языке интерфейса.
  demo: () =>
    globalThis.game?.i18n?.lang === "en"
      ? {
          title: "A letter to aunt Agatha",
          cover: "Dear aunt Agatha, greetings!\nAll is quiet here and the harvest is a good one: the apples are large and the cabbages firm. On Saturday we took our honey to the fair and sold every last drop. The days are warm, and in the mornings a mist lies over the river. Father sends his love and asks after all of you. Give my regards to uncle, and tell my sister Veta that I miss her dearly. Write soon with all the news from town; we wait for the dawn post.\nYour loving nephew Tim",
          phrase: "The castle falls at dawn",
          seed: 28,
        }
      : {
          title: "Письмо тётушке Агате",
          cover: [
            "Милая тётушка Агата, здравствуйте!",
            "У нас всё мирно, урожай славный: яблоки крупные, капуста тугая. В субботу возили мёд на ярмарку, продали всё до капли. Днём тепло, по утрам туман над рекой. Кланяйтесь дядюшке, а сестрице Вете передайте, что я скучаю.",
            "Ваш любящий племянник Тим",
          ].join("\n"),
          phrase: "Замок падёт на рассвете",
          seed: 28,
        },
};
