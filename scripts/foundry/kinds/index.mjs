/* Реестр видов шифров. Каждый вид — модуль kinds/<id>.mjs с объектом:

   id, icon                       — имя и значок (Font Awesome)
   defaults()                     — поля нового шифра этого вида
   fields                         — поля мастерской: { name, type: text|textarea|number|select|checkbox, wide, rows,
                                    min, max, auto, options, style: prose|italic|title, when(puzzle) } или { group: [поля] }.
                                    when — показывать поле, только если для шифра это правда (проверяется и при наборе).
                                    Подписи: Kind.<id>.field.<name>, подсказка в поле — …<name>Hint,
                                    всплывающая — …<name>Tip, варианты выбора — …<name>_<значение>.
   rebuildOn                      — какие поля пересобирают шифр (остальные меняют только рисунок)
   shuffle                        — есть ли смысл в «Перемешать» (новое зерно): true/false или функция от шифра
   build(puzzle)                  — { cipher } или { problem }; зерно — puzzle.seed
   problemText(problem), status(puzzle), meta(puzzle) — строки для мастерской
   parts(puzzle)                  — [{ id, icon }] — что можно выдать игроку; подпись — Kind.<id>.part.<partId>
   view(puzzle, parts)            — что уходит игроку (без ответа и только для его частей)
   code(puzzle)                   — { line, notes: [], reads } — ключ для ведущего
   preview: { render(puzzle, ui), action?(op, ui, puzzle), after?(root, ui, puzzle) } — предпросмотр с ответом
   player: { size, render(view, has, state, ctx), bind(root, view, has, state, save, ctx) → { action(op, target), apply(state) } }
   images(puzzle)                 — [{ id, svg(px) }] — картинки для PNG и журнала; подпись — Kind.<id>.part.<id>
   demo()                         — пример для стенда и снимков

   ctx: { shared } — общий стол: состояние одно на всех, save уходит ведущему, apply приносит чужие изменения. */

import book from "./book.mjs";
import disk from "./disk.mjs";
import grille from "./grille.mjs";
import ink from "./ink.mjs";
import knock from "./knock.mjs";
import runes from "./runes.mjs";
import scytale from "./scytale.mjs";
import stencil from "./stencil.mjs";

const KINDS = new Map();
for (const kind of [grille, stencil, disk, runes, book, scytale, knock, ink]) KINDS.set(kind.id, kind);

export const getKind = (id) => KINDS.get(id) ?? KINDS.get("grille");

export const listKinds = () => [...KINDS.values()];

/** Все части вида — у ведущего и на общем столе. */
export const allParts = (kind, puzzle) => Object.fromEntries(kind.parts(puzzle).map((p) => [p.id, true]));
