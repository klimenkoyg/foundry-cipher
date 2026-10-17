/* Проверки без Foundry: синтаксис модулей, ключи перевода, шаблоны и файлы манифеста. */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/%20/g, " ");
const walk = (dir, ext) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) return walk(rel, ext);
    return ext.some((e) => name.endsWith(e)) ? [rel] : [];
  });

let problems = 0;
const fail = (msg) => {
  problems++;
  console.error("✗", msg);
};

// 1. Синтаксис
const scripts = walk("scripts", [".mjs"]);
for (const file of scripts) {
  try {
    execFileSync(process.execPath, ["--check", join(root, file)], { stdio: "pipe" });
  } catch (err) {
    fail(`${file}: ${err.stderr?.toString().split("\n").slice(0, 4).join(" ")}`);
  }
}

// 2. Ключи перевода: файлы языка из module.json сливаются, как это делает Foundry.
const manifest = JSON.parse(readFileSync(join(root, "module.json"), "utf8"));
const flat = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) => (typeof v === "object" ? flat(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
const deepMerge = (a, b) => {
  for (const [k, v] of Object.entries(b)) a[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(a[k] ?? {}, v) : v;
  return a;
};
const langs = {};
for (const code of ["ru", "en"]) {
  const merged = {};
  for (const l of manifest.languages.filter((x) => x.lang === code)) deepMerge(merged, JSON.parse(readFileSync(join(root, l.path), "utf8")));
  langs[code] = new Set(flat(merged.CIPHERS ?? {}));
}
const hasKey = (set, key) => set.has(key) || set.has(`${key}.other`);
const stem = (key) => key.replace(/\.(one|few|many|other)$/, "");
for (const [a, b] of [["ru", "en"], ["en", "ru"]]) {
  for (const key of langs[a]) if (!hasKey(langs[b], stem(key))) fail(`ключ ${key} есть в ${a}, но нет в ${b}`);
}

const used = new Map();
const note = (key, file) => {
  if (key.includes("${") || key.endsWith(".")) return; // собирается на лету — проверяется семействами ниже
  if (!used.has(key)) used.set(key, file);
};
const templates = walk("templates", [".hbs"]);
for (const file of scripts) {
  const src = readFileSync(join(root, file), "utf8");
  for (const m of src.matchAll(/\b(?:t|has)\(\s*["'`]([A-Za-z0-9_.${}]+)["'`]/g)) note(m[1], file);
  for (const m of src.matchAll(/\bplural\([^,]+,\s*["'`]([A-Za-z0-9_.${}]+)["'`]/g)) note(m[1], file);
  for (const m of src.matchAll(/["'`]CIPHERS\.([A-Za-z0-9_.]+)["'`]/g)) note(m[1], file);
}
for (const file of templates) {
  const src = readFileSync(join(root, file), "utf8");
  for (const m of src.matchAll(/\{\{cpT\s+["']([A-Za-z0-9_.]+)["']/g)) note(m[1], file);
}
for (const [key, file] of used) {
  for (const [lang, set] of Object.entries(langs)) {
    if (!hasKey(set, key)) fail(`нет перевода (${lang}): ${key} — ${file}`);
  }
}

// Ключи, которые собираются на лету из описания видов шифров.
const { listKinds } = await import(join(root, "scripts/foundry/kinds/index.mjs"));
const families = [];
for (const kind of listKinds()) {
  if (kind.ready === false) continue;
  const k = `Kind.${kind.id}`;
  families.push(`${k}.name`, `${k}.desc`, `${k}.untitled`);
  for (const f of kind.fields.flatMap((x) => x.group ?? [x])) {
    families.push(`${k}.field.${f.name}`);
    for (const v of f.options ?? []) families.push(`${k}.field.${f.name}_${v}`);
  }
  if (kind.script) families.push("Field.script", ...["book", "scribe", "note", "print", "charter"].map((x) => `Script.${x}`));
  const demo = { ...kind.defaults(), ...kind.demo(), seed: 1 };
  const built = kind.build(demo);
  if (!built.cipher) fail(`${kind.id}: пример (demo) не собирается — ${JSON.stringify(built.problem)}`);
  for (const part of kind.parts({ ...demo, cipher: built.cipher })) families.push(`${k}.part.${part.id}`);
}
for (const key of families) {
  for (const [lang, set] of Object.entries(langs)) if (!hasKey(set, key)) fail(`нет перевода (${lang}): ${key}`);
}

// 3. Шаблоны, импорты и файлы манифеста
for (const file of scripts) {
  const src = readFileSync(join(root, file), "utf8");
  for (const m of src.matchAll(/tpl\("([^"]+)"\)/g)) {
    if (!existsSync(join(root, "templates", m[1]))) fail(`нет шаблона templates/${m[1]} — ${file}`);
  }
  for (const m of src.matchAll(/from\s+"(\.[^"]+)"/g)) {
    if (!existsSync(join(root, file, "..", m[1]))) fail(`нет файла ${m[1]} — ${file}`);
  }
}
for (const path of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((l) => l.path)]) {
  if (!existsSync(join(root, path))) fail(`module.json ссылается на отсутствующий файл: ${path}`);
}
const css = readFileSync(join(root, "styles/fonts.css"), "utf8");
for (const m of css.matchAll(/url\("\.\.\/fonts\/([^"]+)"\)/g)) {
  if (!existsSync(join(root, "fonts", m[1]))) fail(`fonts.css ссылается на отсутствующий шрифт: ${m[1]}`);
}

console.log(problems ? `\nПроблем: ${problems}` : `✓ ${scripts.length} модулей, ${templates.length} шаблонов, ${used.size} ключей перевода — всё на месте`);
process.exit(problems ? 1 : 0);
