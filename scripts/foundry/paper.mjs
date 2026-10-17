/* Общие кирпичики рисунков: пергамент, шрифты, экранирование. Всё — SVG-строки,
   одинаковые для окон и для картинок (картинку рисует export.mjs вместе со шрифтами). */

export const INK = "#3a2214";
export const INK_SOFT = "#7a5a3a";
export const LIT = "#7a1f12";
export const SERIF = "Alegreya, Georgia, serif";
export const SERIF_SC = "'Alegreya SC', Alegreya, Georgia, serif";
export const SANS = "'Alegreya Sans', system-ui, sans-serif";

/**
 * Почерки реквизита: каким шрифтом написан текст на письмах, записках, лентах.
 * scale — поправка кегля, чтобы строка любым почерком занимала ту же ширину, что Alegreya
 * (замерено в Chrome: средняя ширина знака Alegreya .461 em, Marck Script .486, Caveat .368,
 * Neucha .413, Kurale .504) — раскладка строк не зависит от почерка.
 * bold — насыщенность для крупных букв в клетках.
 */
export const SCRIPTS = {
  book: { family: "Alegreya, Georgia, serif", weight: 400, bold: 700, scale: 1 },
  scribe: { family: "'Marck Script', Alegreya, cursive", weight: 400, bold: 400, scale: 0.95 },
  note: { family: "Caveat, 'Marck Script', cursive", weight: 400, bold: 700, scale: 1.25 },
  print: { family: "Neucha, Caveat, cursive", weight: 400, bold: 400, scale: 1.12 },
  charter: { family: "Kurale, Alegreya, serif", weight: 400, bold: 400, scale: 0.92 },
};

export const SCRIPT_IDS = Object.keys(SCRIPTS);

/** Почерк по имени (неизвестный — запасной). */
export const script = (id, fallback = "book") => SCRIPTS[id] ?? SCRIPTS[fallback] ?? SCRIPTS.book;

/** Атрибуты SVG-текста для почерка: семейство, насыщенность и кегль с поправкой. */
export function scriptAttrs(id, size, { bold = false, fallback } = {}) {
  const s = script(id, fallback);
  return `font-family="${s.family}" font-weight="${bold ? s.bold : s.weight}" font-size="${num(size * s.scale)}"`;
}

let counter = 0;
/** Уникальный префикс id внутри SVG: на странице бывает много рисунков сразу. */
export const uid = () => `cp${(++counter).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const xml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const num = (v) => Number(Number(v).toFixed(2));

/** Скруглённый прямоугольник как путь. */
export function roundRect(x, y, w, h, r) {
  return `M${x + r},${y}h${w - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${w - 2 * r}a${r},${r} 0 0 1 -${r},-${r}v-${h - 2 * r}a${r},${r} 0 0 1 ${r},-${r}z`;
}

/** Кегль строки, чтобы она уместилась в ширину: на глаз — полэма на знак. */
export function fit(text, max, width, em = 0.5) {
  const len = [...String(text)].length || 1;
  return num(Math.min(max, width / (len * em)));
}

/**
 * Открывающий тег SVG. box — [x, y, w, h] в единицах рисунка.
 * o.px — ширина картинки в пикселях (высота по пропорции); o.cls — класс; o.label — подпись для чтеца экрана.
 */
export function svgOpen([x, y, w, h], o = {}) {
  const size = o.px ? ` width="${Math.round(o.px)}" height="${Math.round((o.px * h) / w)}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}"${size} class="${o.cls ?? ""}" role="img" aria-label="${xml(o.label ?? "")}">`;
}

/**
 * Лист пергамента: заливка, волокна, зерно и потемневшие края. Возвращает defs и слои фона.
 * tone: "paper" — светлый лист, "old" — темнее и желтее (обрывки, записки).
 */
export function paper([x, y, w, h], { tone = "paper", rx = 1.6 } = {}) {
  const id = uid();
  const [c0, c1, c2] = tone === "old" ? ["#efe0bd", "#dcc69a", "#b89a63"] : ["#f5ecd5", "#e8dabb", "#c8b085"];
  const rect = (extra) => `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${rx}" ${extra}/>`;
  return [
    "<defs>",
    `<radialGradient id="${id}p" cx="50%" cy="44%" r="72%"><stop offset="0" stop-color="${c0}"/><stop offset=".55" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient>`,
    `<radialGradient id="${id}v" cx="50%" cy="50%" r="71%"><stop offset=".62" stop-color="#5a3510" stop-opacity="0"/><stop offset="1" stop-color="#5a3510" stop-opacity=".34"/></radialGradient>`,
    `<filter id="${id}f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".028" numOctaves="4" seed="7"/><feColorMatrix values="0 0 0 0 .45  0 0 0 0 .29  0 0 0 0 .11  0 0 0 .5 -.12"/></filter>`,
    `<filter id="${id}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 .32  0 0 0 0 .21  0 0 0 0 .09  0 0 0 .32 0"/></filter>`,
    "</defs>",
    rect(`fill="url(#${id}p)"`),
    rect(`filter="url(#${id}f)" opacity=".55"`),
    rect(`filter="url(#${id}g)" opacity=".5"`),
    rect(`fill="url(#${id}v)"`),
  ].join("");
}

/** Латунь: градиент, шлифовка и блик — для пластин, колец и жезлов. Возвращает { defs, fill, grain, shine }. */
export function brass({ dark = false } = {}) {
  const id = uid();
  const stops = dark
    ? ["#9c7a44", "#7d5f2e", "#634a22", "#45321a"]
    : ["#c49a56", "#a47a3c", "#86622d", "#5e4320"];
  return {
    defs:
      `<linearGradient id="${id}b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset=".35" stop-color="${stops[1]}"/><stop offset=".7" stop-color="${stops[2]}"/><stop offset="1" stop-color="${stops[3]}"/></linearGradient>` +
      `<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3cf" stop-opacity=".28"/><stop offset=".4" stop-color="#fff3cf" stop-opacity="0"/></linearGradient>` +
      `<filter id="${id}t" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .7" numOctaves="2" seed="5" result="n"/><feColorMatrix in="n" values="0 0 0 0 .2  0 0 0 0 .13  0 0 0 0 .04  0 0 0 .4 -.14" result="c"/><feComposite in="c" in2="SourceGraphic" operator="in"/></filter>`,
    fill: `url(#${id}b)`,
    grain: `url(#${id}t)`,
    shine: `url(#${id}s)`,
  };
}

/** Строки текста, разбитые по ширине: на глаз — сколько знаков влезает в строку. */
export function wrap(text, perLine) {
  const out = [];
  for (const para of String(text ?? "").split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      if (!line) line = w;
      else if (line.length + 1 + w.length <= perLine) line += ` ${w}`;
      else {
        out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}
