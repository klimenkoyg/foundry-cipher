import assert from "node:assert/strict";
import { test } from "node:test";
import { inlineHtml, isNewer, parseReleaseNotes, repoOf, versionOf } from "../scripts/core/release.mjs";

test("версии: тег с v, числа по частям", () => {
  assert.equal(versionOf("v0.2.5"), "0.2.5");
  assert.equal(versionOf(" 1.0 "), "1.0");
  assert.equal(isNewer("0.2.5", "0.2.4"), true);
  assert.equal(isNewer("v0.10.0", "0.9.9"), true);
  assert.equal(isNewer("0.2.4", "0.2.4"), false);
  assert.equal(isNewer("0.2.3", "0.2.4"), false);
  assert.equal(isNewer("1.0", "0.9.9"), true);
  assert.equal(isNewer("0.3", "0.3.0"), false);
});

test("репозиторий из адреса модуля", () => {
  assert.equal(repoOf("https://github.com/klimenkoyg/foundry-cipher"), "klimenkoyg/foundry-cipher");
  assert.equal(repoOf("https://github.com/klimenkoyg/foundry-cipher.git"), "klimenkoyg/foundry-cipher");
  assert.equal(repoOf("https://github.com/a/b/releases/latest"), "a/b");
  assert.equal(repoOf("https://example.com/x"), null);
  assert.equal(repoOf(undefined), null);
});

const BODY = `## Что нового

- Шифровальный диск: галочка «Игроки собирают кольцо сами» — кольцо по слову
  игроки собирают сами.
- Ведущему — окошко, когда вышла новая версия.

## Обновление

В Foundry: **Add-on Modules** → «Тайнопись» → обновить.

\`\`\`
https://github.com/klimenkoyg/foundry-cipher/releases/latest/download/module.json
\`\`\`

---

**English.** Cipher disk: players can build the ring from the keyword themselves. The GM is told when a new version is out.`;

test("что нового: русский список и английский абзац из описания релиза", () => {
  const notes = parseReleaseNotes(BODY);
  assert.deepEqual(notes.ru, [
    "Шифровальный диск: галочка «Игроки собирают кольцо сами» — кольцо по слову игроки собирают сами.",
    "Ведущему — окошко, когда вышла новая версия.",
  ]);
  assert.equal(notes.en, "Cipher disk: players can build the ring from the keyword themselves. The GM is told when a new version is out.");
  // Описание в другом виде — пусто, без ошибок.
  assert.deepEqual(parseReleaseNotes("просто текст"), { ru: [], en: "" });
  assert.deepEqual(parseReleaseNotes(null), { ru: [], en: "" });
  assert.deepEqual(parseReleaseNotes("## Что нового\r\n\r\n- Один\r\n- Два\r\n"), { ru: ["Один", "Два"], en: "" });
});

test("описание в HTML — только жирный и код, разметка из релиза не проходит", () => {
  assert.equal(inlineHtml("**Сразу** и `module.json`"), "<b>Сразу</b> и <code>module.json</code>");
  assert.equal(inlineHtml('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
});

test("описание релиза из CHANGELOG читается окошком «вышла новая версия»", async () => {
  const { changelogSection, releaseBody } = await import("../scripts-dev/release-notes.mjs");
  const CHANGELOG = `# Что нового

## Готовится

- Будущее.

## 0.2.1

- Первый пункт,
  перенесённый на вторую строку.
- Второй пункт.

**English.** First item,
second line.

## 0.2.0

- Старое.
`;
  const section = changelogSection(CHANGELOG, "v0.2.1");
  assert.deepEqual(section.items, ["- Первый пункт,\n  перенесённый на вторую строку.", "- Второй пункт."]);
  assert.equal(section.en, "**English.** First item, second line.");
  // нет раздела версии — берём «Готовится»
  assert.deepEqual(changelogSection(CHANGELOG, "0.3.0").items, ["- Будущее."]);
  assert.equal(changelogSection("# пусто", "0.3.0"), null);

  const url = "https://github.com/klimenkoyg/foundry-cipher/releases/latest/download/module.json";
  const body = releaseBody({ section, manifestUrl: url, names: { ru: "Тайнопись", en: "Ciphers & Puzzles" } });
  assert.match(body, /Add-on Modules\*\* → «Тайнопись» → обновить/);
  assert.ok(body.includes(url));
  assert.deepEqual(parseReleaseNotes(body), {
    ru: ["Первый пункт, перенесённый на вторую строку.", "Второй пункт."],
    en: "First item, second line.",
  });
  // без раздела — только «Обновление», окошко покажет версию без списка
  assert.deepEqual(parseReleaseNotes(releaseBody({ section: null, manifestUrl: url, names: { ru: "Тайнопись" } })), { ru: [], en: "" });
});
