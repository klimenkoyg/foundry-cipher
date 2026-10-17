/* Картинки шифров: PNG для скачивания и печати, лёгкий WebP для журнала.
   SVG рисуется в картинку вместе со шрифтами модуля — иначе вместо Alegreya был бы системный шрифт. */

import { MODULE_ID, imageDir } from "./constants.mjs";
import { esc, t } from "./i18n.mjs";
import { getKind } from "./kinds/index.mjs";

/** Скачивание — для печати: PNG без потерь, 2000 px хватает на лист A5. */
const PRINT = { px: 2000, type: "image/png" };
/** Журнал — картинки уходят на сервер и каждому игроку: WebP легче PNG в 30–50 раз, на глаз не хуже. */
const JOURNAL = { px: 1600, type: "image/webp", quality: 0.86 };
const EXT = { "image/png": "png", "image/webp": "webp" };

const route = (path) => foundry.utils.getRoute?.(path) ?? `/${path}`;

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

let fontBlocks = null;
const fontFiles = new Map();

/** Блоки @font-face модуля (кириллица и латиница): [{ family, file, css }]. */
async function fontFaces() {
  if (fontBlocks) return fontBlocks;
  try {
    const css = await (await fetch(route(`modules/${MODULE_ID}/styles/fonts.css`))).text();
    fontBlocks = (css.match(/@font-face\s*{[^}]*}/g) ?? [])
      .filter((b) => !/-ext\.woff2/.test(b))
      .map((b) => ({ family: b.match(/font-family:\s*"([^"]+)"/)?.[1], file: b.match(/url\("\.\.\/fonts\/([^"]+)"\)/)?.[1], css: b }))
      .filter((b) => b.family && b.file);
  } catch (err) {
    console.warn(`${MODULE_ID} | шрифты для картинки не загрузились`, err);
    fontBlocks = [];
  }
  return fontBlocks;
}

/** @font-face с файлами внутри — только для семейств, что встречаются в рисунке. */
async function embeddedFonts(svg) {
  const used = (await fontFaces()).filter((b) => svg.includes(b.family));
  const out = [];
  for (const b of used) {
    if (!fontFiles.has(b.file)) {
      const res = await fetch(route(`modules/${MODULE_ID}/fonts/${b.file}`));
      fontFiles.set(b.file, `data:font/woff2;base64,${base64(await res.arrayBuffer())}`);
    }
    out.push(b.css.replace(/url\("\.\.\/fonts\/([^"]+)"\)/, `url("${fontFiles.get(b.file)}")`));
  }
  return out.join("\n");
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/** Холст → файл. WebP, что не готов за 10 с (бывает в безголовом Chrome), заменяется на PNG. */
async function encode(canvas, type, quality) {
  const blob = type === "image/png" ? null : await Promise.race([toBlob(canvas, type, quality), wait(10000).then(() => null)]);
  return blob ?? (await toBlob(canvas, "image/png"));
}

/** SVG → картинка (PNG по умолчанию). Размер — из атрибутов width/height рисунка.
    Браузер, что не умеет WebP (Safari), отдаёт PNG — смотрите blob.type. */
export async function svgToImage(svg, { type = "image/png", quality = 0.86 } = {}) {
  const css = await embeddedFonts(svg);
  const doc = svg.replace(/^<svg([^>]*)>/, `<svg$1><style>${css}</style>`);
  const url = URL.createObjectURL(new Blob([doc], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = Number(svg.match(/\swidth="(\d+)"/)?.[1]) || img.naturalWidth;
    const h = Number(svg.match(/\sheight="(\d+)"/)?.[1]) || img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    // Первый проход прогревает шрифты внутри картинки, второй — начисто.
    ctx.drawImage(img, 0, 0, w, h);
    await wait(120);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await encode(canvas, type, quality);
    if (!blob) throw new Error("toBlob");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const slug = (s) =>
  String(s || "cipher")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60) || "cipher";

/** Картинки шифра: [{ id, label, svg(px) }]. */
export function imagesOf(puzzle) {
  if (!puzzle?.cipher) return [];
  const kind = getKind(puzzle.kind);
  return kind.images(puzzle).map((img) => ({ ...img, label: t(`Kind.${kind.id}.part.${img.id}`) }));
}

/** Скачать одну картинку шифра. */
export async function downloadImage(puzzle, imageId) {
  const img = imagesOf(puzzle).find((i) => i.id === imageId);
  if (!img) return;
  const blob = await svgToImage(img.svg(PRINT.px), PRINT);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(puzzle.title)}-${slug(img.label).toLowerCase()}.${EXT[blob.type] ?? "png"}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const filePicker = () => foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;

/** Запись в журнал: все картинки шифра и страница с ключом, которую видит только ведущий. */
export async function saveToJournal(puzzle) {
  const FP = filePicker();
  const dir = imageDir();
  try {
    await FP.createDirectory("data", dir, {});
  } catch {
    // уже есть
  }
  const stamp = Date.now().toString(36);
  const pages = [];
  for (const img of imagesOf(puzzle)) {
    const blob = await svgToImage(img.svg(JOURNAL.px), JOURNAL);
    const type = EXT[blob.type] ? blob.type : "image/png";
    const file = new File([blob], `${puzzle.id}-${img.id}-${stamp}.${EXT[type]}`, { type });
    const res = await FP.upload("data", dir, file, {}, { notify: false });
    pages.push({ name: img.label, type: "image", src: res?.path ?? `${dir}/${file.name}` });
  }
  const none = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
  const code = getKind(puzzle.kind).code(puzzle);
  const lines = [code.line, ...(code.notes ?? [])].filter(Boolean).map((l) => `<p><strong>${esc(l)}</strong></p>`);
  if (code.reads) lines.push(`<p>${esc(t("Code.reads"))} ${esc(code.reads)}</p>`);
  pages.push({ name: t("Journal.codePage"), type: "text", ownership: { default: none }, text: { content: lines.join("") } });
  const Journal = (foundry.documents?.JournalEntry ?? globalThis.JournalEntry).implementation;
  const entry = await Journal.create({ name: puzzle.title || t("Puzzle.untitled"), ownership: { default: none }, pages });
  entry?.sheet?.render(true);
  return entry;
}
