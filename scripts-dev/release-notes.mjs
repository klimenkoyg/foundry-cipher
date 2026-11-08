/* Описание релиза на GitHub из CHANGELOG.md — в том виде, который читает окошко «вышла новая версия»
   (scripts/foundry/update-check.mjs → parseReleaseNotes):

     ## Что нового          ← пункты раздела «## <версия>» (нет его — «## Готовится»)
     ## Обновление          ← как обновить и ссылка на манифест
     ---
     **English.** …         ← если в разделе CHANGELOG есть такой абзац

   node scripts-dev/release-notes.mjs v0.2.1 > dist/notes.md */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Раздел CHANGELOG для версии → { items: ["- пункт\n  продолжение", …], en: "…" } или null. */
export function changelogSection(text, version) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const v = String(version ?? "").replace(/^v/i, "");
  const find = (title) => lines.findIndex((l) => l.trim().toLowerCase() === `## ${title}`.toLowerCase());
  let start = find(v);
  if (start < 0) start = find("Готовится");
  if (start < 0) return null;

  const items = [];
  const en = [];
  let inEnglish = false;
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const s = line.trim();
    if (/^\*\*English\.\*\*/.test(s)) {
      inEnglish = true;
      en.push(s);
    } else if (inEnglish) {
      if (!s) inEnglish = false;
      else en.push(s);
    } else if (/^[-*]\s+/.test(s)) items.push(`- ${s.replace(/^[-*]\s+/, "")}`);
    else if (s && items.length) items[items.length - 1] += `\n  ${s}`;
  }
  return { items, en: en.join(" ") };
}

/** Текст описания релиза. names: { ru, en } — как модуль называется в списке Foundry. */
export function releaseBody({ section, manifestUrl, names }) {
  const parts = [];
  if (section?.items.length) parts.push("## Что нового", "", ...section.items, "");
  parts.push(
    "## Обновление",
    "",
    `В Foundry: **Add-on Modules** → «${names.ru}» → обновить. Или поставить заново по ссылке на манифест:`,
    "",
    "```",
    manifestUrl,
    "```",
  );
  if (section?.en) parts.push("", "---", "", section.en);
  return `${parts.join("\n")}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = new URL("..", import.meta.url).pathname.replace(/%20/g, " ");
  const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
  const version = process.argv[2] ?? manifest.version;
  const section = changelogSection(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
  if (!section?.items.length) console.error(`⚠ в CHANGELOG.md нет раздела «## ${version.replace(/^v/i, "")}» — «Что нового» в релизе будет пусто`);
  const [ru, en = ru] = manifest.title.split(" · ");
  process.stdout.write(releaseBody({ section, manifestUrl: manifest.manifest, names: { ru, en } }));
}
