/* Книжный шифр: записка из чисел и книга, по которой их считают («абзац.слово» и «абзац.слово.буква»).
   Ядро — scripts/core/book.mjs; здесь поля мастерской, книга и записка, окно игрока и картинки.
   Книга в окне — HTML на пергаменте: длинный текст переносится сам и прокручивается, слова щёлкаются.
   Для картинки книга вёрстается в SVG-разворот: строки разбиваются по ширине на глаз. Записка — SVG везде. */

import { encode, formatRef, isLetter, MODES, parseBook, SEP, wordRef } from "../../core/book.mjs";
import { esc, plural, t } from "../i18n.mjs";
import { fit, INK, INK_SOFT, num, paper, scriptAttrs, SERIF, SERIF_SC, svgOpen, uid, xml } from "../paper.mjs";

/* ---------- записка ---------- */

const SLIP = { w: 76, pad: 8, fs: 6.6, lh: 9.8, top: 9.5, bottom: 13 };
/** Знаков в строке: цифры и точки узкие — на глаз 0,4 эма на знак. */
const SLIP_PER = Math.floor((SLIP.w - 2 * SLIP.pad) / (SLIP.fs * 0.4));

/** Строки записки: числа не рвутся, «·» остаётся в конце слова фразы. */
function slipLines(note) {
  const groups = String(note ?? "")
    .split(SEP.trim())
    .map((g) => g.trim().split(/\s+/).filter(Boolean))
    .filter((g) => g.length);
  const tokens = groups.flatMap((g, gi) => g.map((r, ri) => (ri === g.length - 1 && gi < groups.length - 1 ? `${r} ·` : r)));
  const lines = [];
  let line = "";
  for (const tok of tokens) {
    if (line && line.length + 1 + tok.length > SLIP_PER) {
      lines.push(line);
      line = tok;
    } else line = line ? `${line} ${tok}` : tok;
  }
  if (line) lines.push(line);
  return lines;
}

const slipBox = (lines) => [0, 0, SLIP.w, num(SLIP.top + lines.length * SLIP.lh + SLIP.bottom)];

/** Записка: обрывок старого пергамента со сгибом, числа курсивом, росчерк внизу. */
function slipSvg(note, o = {}) {
  const lines = slipLines(note);
  const box = slipBox(lines);
  const [, , w, h] = box;
  const fold = num(h * 0.52);
  const out = [svgOpen(box, { ...o, cls: "cp-book-slip-svg" }), paper(box, { tone: "old", rx: 0.8 })];
  out.push(
    `<path d="M0 ${fold}H${w}" stroke="#5a3510" stroke-opacity=".18" stroke-width=".45"/>`,
    `<path d="M0 ${num(fold + 0.5)}H${w}" stroke="#fff4d6" stroke-opacity=".28" stroke-width=".45"/>`,
  );
  // Почерк записки; книжный — курсивом, как раньше.
  const hand = o.script && o.script !== "book";
  const font = hand ? scriptAttrs(o.script, SLIP.fs) : `font-family="${SERIF}" font-style="italic" font-weight="500" font-size="${SLIP.fs}"`;
  out.push(`<g ${font} fill="${INK}" word-spacing="1.1" style="font-variant-numeric:lining-nums">`);
  lines.forEach((line, i) => out.push(`<text x="${SLIP.pad}" y="${num(SLIP.top + i * SLIP.lh + SLIP.fs)}">${xml(line)}</text>`));
  out.push("</g>");
  const y = num(h - 6.5);
  out.push(`<path d="M${w - 34} ${y}c4.5 -2.6 9 2.4 13.5 0s9 -2.4 13.5 0" fill="none" stroke="${INK_SOFT}" stroke-width=".55" stroke-linecap="round" opacity=".75"/>`);
  out.push("</svg>");
  return out.join("");
}

/* ---------- книга в окне (HTML) ---------- */

/** Пергамент под HTML-блоком: растягивается на весь блок. box — пропорции, на которые он рассчитан. */
const parchment = ([w, h], tone = "paper") =>
  `<svg class="cp-book-paper" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${paper([0, 0, w, h], { tone, rx: 0 })}</svg>`;

const ORNAMENT =
  '<svg class="cp-book-orn" viewBox="0 0 120 8" aria-hidden="true">' +
  '<path d="M6 4H51M69 4H114" stroke="currentColor" stroke-width=".6"/>' +
  '<circle cx="53" cy="4" r="1" fill="currentColor"/><circle cx="67" cy="4" r="1" fill="currentColor"/>' +
  '<path d="M60 .6 63.4 4 60 7.4 56.6 4z" fill="currentColor"/></svg>';

/**
 * Слово книги. ref — «абзац.слово»; o.marks — отметки игроков; o.deco — ответ для ведущего
 * (Map ref → { seq: [номера чисел записки], whole, letters: Set<номер буквы>, tips }); o.numbers — номер слова.
 */
function wordHtml(word, ref, w, o) {
  const d = o.deco?.get(ref);
  let inner = esc(word.raw);
  if (d?.letters.size) {
    let l = -1;
    inner = [...word.raw]
      .map((ch) => {
        if (!isLetter(ch)) return esc(ch);
        l++;
        return d.letters.has(l) ? `<b class="cp-book-l">${esc(ch)}</b>` : esc(ch);
      })
      .join("");
  }
  const cls = ["cp-book-w"];
  if (d?.whole) cls.push("is-word");
  if (d?.letters.size) cls.push("is-spell");
  if (o.marks?.has(ref)) cls.push("is-marked");
  const tag = d ? `<span class="cp-book-tag" aria-hidden="true">${d.seq.join(" ")}</span>` : "";
  const tip = d ? ` data-tooltip="${esc(d.tips.join(" · "))}"` : "";
  const n = o.numbers ? `<sub class="cp-book-n" aria-hidden="true">${w + 1}</sub>` : "";
  return `<span class="${cls.join(" ")}" data-k="${ref}"${tip}>${tag}${inner}${n}</span>`;
}

function paragraphHtml(para, p, o) {
  let out = "";
  let pos = 0;
  para.words.forEach((word, w) => {
    out += esc(para.text.slice(pos, word.start));
    out += wordHtml(word, wordRef(p, w), w, o);
    pos = word.end;
  });
  out += esc(para.text.slice(pos));
  return `<p class="cp-book-p" data-p="${p + 1}">${out.trim()}</p>`;
}

/** Страница книги: пергамент, заголовок, абзацы без номеров. Прокручивается внутри. */
function bookHtml(title, paras, o = {}) {
  const name = String(title ?? "").trim();
  const head = `<header class="cp-book-head">${name ? `<span class="cp-book-title">${esc(name)}</span>` : ""}${ORNAMENT}</header>`;
  const text = paras.map((para, p) => paragraphHtml(para, p, o)).join("");
  const cls = ["cp-book-page", o.cls, o.numbers ? "is-numbered" : ""].filter(Boolean).join(" ");
  return (
    `<article class="${cls}">${parchment([100, 130])}` +
    `<div class="cp-book-scroll" tabindex="0" aria-label="${esc(t("Kind.book.part.book"))}">${head}<div class="cp-book-text">${text}</div></div>` +
    `</article>`
  );
}

/** Ответ для страницы ведущего: какие слова и буквы взяты и каким по счёту числом записки. */
function decoOf(cipher) {
  const deco = new Map();
  let seq = 0;
  for (const g of cipher.groups) {
    const letters = [...g.key];
    g.refs.forEach((r, i) => {
      seq++;
      const ref = wordRef(r.p, r.w);
      const d = deco.get(ref) ?? { seq: [], whole: false, letters: new Set(), tips: [] };
      d.seq.push(seq);
      if (r.l == null) d.whole = true;
      else d.letters.add(r.l);
      d.tips.push(`${formatRef(r)} — ${r.l == null ? g.key : letters[i]}`);
      deco.set(ref, d);
    });
  }
  return deco;
}

/** Записка с расшифровкой: под каждым числом — что оно даёт. Щелчок — показать слово в книге. extra — в конце строки. */
function keyHtml(cipher, extra = "") {
  const tips = {
    word: esc(t("Kind.book.preview.refTip", { what: t("Kind.book.preview.whole") })),
    letter: esc(t("Kind.book.preview.refTip", { what: t("Kind.book.preview.letter") })),
  };
  const groups = cipher.groups.map((g) => {
    const letters = [...g.key];
    const refs = g.refs
      .map((r, i) => {
        const read = r.l == null ? g.key : letters[i];
        return `<button type="button" class="cp-book-ref${r.l == null ? " is-word" : ""}" data-k="${wordRef(r.p, r.w)}" data-tooltip="${r.l == null ? tips.word : tips.letter}"><b>${formatRef(r)}</b><i>${esc(read)}</i></button>`;
      })
      .join("");
    return `<span class="cp-book-grp">${refs}</span>`;
  });
  return `<div class="cp-book-key">${parchment([100, 22], "old")}<div class="cp-book-key__row">${groups.join('<span class="cp-book-dot" aria-hidden="true">·</span>')}${extra}</div></div>`;
}

/* ---------- книга для картинки (SVG) ---------- */

const PAGE = { w: 150, padX: 15, spine: 4, top: 14, bottom: 14, fs: 5.3, lh: 7.9, gap: 2.4, head: 17, indent: 3, spreadAt: 16 };
const PAGE_PER = Math.floor((PAGE.w - 2 * PAGE.padX - PAGE.spine) / (PAGE.fs * 0.48));

/** Строки книги по ширине страницы: { text, first } — first у первой строки абзаца (красная строка). */
function bookLines(paras) {
  const lines = [];
  for (const para of paras) {
    let line = "";
    let first = true;
    for (const word of para.text.trim().split(/\s+/)) {
      const cap = first ? PAGE_PER - PAGE.indent : PAGE_PER;
      if (line && line.length + 1 + word.length > cap) {
        lines.push({ text: line, first });
        first = false;
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) lines.push({ text: line, first });
  }
  return lines;
}

/** Высота строк на странице: строка плюс отбивка перед новым абзацем (кроме самой первой). */
const linesHeight = (lines) => lines.reduce((h, l, i) => h + PAGE.lh + (l.first && i > 0 ? PAGE.gap : 0), 0);

function pageText(lines, x0, y0) {
  let y = y0;
  return lines
    .map((l, i) => {
      if (l.first && i > 0) y += PAGE.gap;
      y += PAGE.lh;
      const x = x0 + (l.first ? PAGE.indent * PAGE.fs * 0.5 : 0);
      return `<text x="${num(x)}" y="${num(y - PAGE.lh * 0.28)}">${xml(l.text)}</text>`;
    })
    .join("");
}

/** Книга: одна страница, а если текст длинный — разворот (левая страница с заголовком, правая — продолжение). */
function bookSvg(title, paras, o = {}) {
  const name = String(title ?? "").trim();
  const lines = bookLines(paras);
  const spread = lines.length > PAGE.spreadAt;
  let left = lines;
  let right = [];
  if (spread) {
    // где разрезать, чтобы страницы вышли почти равной высоты (у правой первая строка — без отбивки)
    const total = linesHeight(lines);
    let best = { cut: lines.length, h: Infinity };
    let acc = 0;
    for (let cut = 1; cut < lines.length; cut++) {
      acc += PAGE.lh + (lines[cut - 1].first && cut > 1 ? PAGE.gap : 0);
      const h = Math.max(PAGE.head + acc, total - acc - (lines[cut].first ? PAGE.gap : 0));
      if (h < best.h) best = { cut, h };
    }
    left = lines.slice(0, best.cut);
    right = lines.slice(best.cut);
  }
  const W = spread ? PAGE.w * 2 : PAGE.w;
  const H = num(PAGE.top + Math.max(PAGE.head + linesHeight(left), linesHeight(right)) + PAGE.bottom);
  const box = [0, 0, W, H];
  const out = [svgOpen(box, { ...o, cls: "cp-book-svg" }), paper(box)];
  if (spread) {
    const id = uid();
    out.push(
      `<defs><linearGradient id="${id}s" x1="0" x2="1"><stop offset="0" stop-color="#5a3510" stop-opacity="0"/><stop offset=".5" stop-color="#5a3510" stop-opacity=".3"/><stop offset="1" stop-color="#5a3510" stop-opacity="0"/></linearGradient></defs>`,
      `<rect x="${PAGE.w - 9}" y="0" width="18" height="${H}" fill="url(#${id}s)"/>`,
      `<path d="M${PAGE.w} 0V${H}" stroke="#5a3510" stroke-opacity=".35" stroke-width=".35"/>`,
    );
  }
  const cx = PAGE.w / 2;
  const hy = PAGE.top + 5;
  if (name) out.push(`<text x="${num(cx)}" y="${num(hy)}" font-family="${SERIF_SC}" font-weight="700" font-size="${fit(name, 7.4, PAGE.w - 2 * PAGE.padX, 0.56)}" fill="${INK}" text-anchor="middle" letter-spacing=".3">${xml(name)}</text>`);
  const oy = num(name ? hy + 5.5 : hy);
  out.push(
    `<g fill="${INK_SOFT}" stroke="${INK_SOFT}" stroke-width=".4"><path d="M${num(cx - 26)} ${oy}H${num(cx - 4.5)}M${num(cx + 4.5)} ${oy}H${num(cx + 26)}" fill="none"/>` +
      `<path d="M${num(cx)} ${num(oy - 2)}l2 2-2 2-2-2z" stroke="none"/></g>`,
  );
  out.push(`<g font-family="${SERIF}" font-size="${PAGE.fs}" fill="${INK}">`);
  out.push(pageText(left, PAGE.padX, PAGE.top + PAGE.head));
  if (spread) out.push(pageText(right, PAGE.w + PAGE.padX + PAGE.spine, PAGE.top));
  out.push("</g></svg>");
  return out.join("");
}

/* ---------- окно игрока ---------- */

function playerDesk(view, has, marks) {
  const slip = has.note ? slipSvg(view.note, { script: view.script, label: t("Kind.book.part.note") }) : "";
  if (!has.book) {
    const [, , w, h] = slipBox(slipLines(view.note));
    return `<div class="cp-fit"><div class="cp-stage cp-book-solo" style="--cp-ratio:${w}/${h}"><div class="cp-sheet cp-book-slip">${slip}</div></div></div>`;
  }
  const book = bookHtml(view.title, parseBook(view.source), { marks });
  const side = has.note ? `<aside class="cp-book-side"><div class="cp-book-slip">${slip}</div></aside>` : "";
  return `<div class="cp-book-desk${has.note ? "" : " cp-book-desk--solo"}">${book}${side}</div>`;
}

export default {
  id: "book",
  icon: "fa-solid fa-book",
  script: "note",

  defaults: () => ({ bookTitle: "", source: "", phrase: "", mode: "words" }),

  fields: [
    { name: "bookTitle", type: "text", style: "italic" },
    { name: "mode", type: "select", options: MODES },
    { name: "source", type: "textarea", wide: true, rows: 8, style: "prose" },
    { name: "phrase", type: "textarea", wide: true, rows: 2, style: "prose" },
  ],

  rebuildOn: ["source", "phrase", "mode"],
  shuffle: true,

  build(p) {
    if (!String(p.source ?? "").trim() && !String(p.phrase ?? "").trim()) return { problem: { error: "empty" } };
    const res = encode({ source: p.source, phrase: p.phrase, mode: p.mode, seed: p.seed });
    if (!res.ok) return { problem: { error: res.error, letter: res.letter ?? "", letters: res.letters ?? [], word: res.word ?? "" } };
    const { groups, note, text, dropped, paragraphs, words } = res;
    return { cipher: { groups, note, text, dropped, paragraphs, words } };
  },

  problemText(pr) {
    if (pr.error === "empty") return t("Kind.book.problem.empty");
    if (pr.error === "noBook") return t("Kind.book.problem.noBook");
    if (pr.error === "noPhrase") return t("Kind.book.problem.noPhrase");
    if (pr.error === "noLetter") {
      if (pr.letters?.length > 1) return t("Kind.book.problem.noLetters", { letters: pr.letters.map((l) => `«${l}»`).join(", ") });
      return t("Kind.book.problem.noLetter", { letter: pr.letter, word: pr.word });
    }
    return t("Kind.book.problem.unknown");
  },

  status(p) {
    const c = p.cipher;
    const spelled = c.groups.filter((g) => !g.whole).length;
    const refs = c.groups.reduce((n, g) => n + g.refs.length, 0);
    const words = plural(c.groups.length, "Kind.book.count.words");
    const parts = [
      p.mode === "letters"
        ? t("Kind.book.status.phraseLetters", { words })
        : t("Kind.book.status.phrase", { words, whole: c.groups.length - spelled, spelled }),
      t("Kind.book.status.note", { numbers: plural(refs, "Kind.book.count.numbers") }),
      t("Kind.book.status.book", { paras: plural(c.paragraphs, "Kind.book.count.paras"), words: plural(c.words, "Kind.book.count.words") }),
    ];
    if (c.dropped?.length) parts.push(t("Status.dropped", { chars: c.dropped.join(" ") }));
    return parts.join(" · ");
  },

  meta(p) {
    const c = p.cipher;
    const refs = c.groups.reduce((n, g) => n + g.refs.length, 0);
    return `${plural(refs, "Kind.book.count.numbers")} · ${plural(c.paragraphs, "Kind.book.count.paras")}`;
  },

  parts: () => [
    { id: "note", icon: "fa-solid fa-note-sticky" },
    { id: "book", icon: "fa-solid fa-book" },
  ],

  /** Игроку — только то, что у него в руках: записка без книги, книга без записки. Ответа нет ни там, ни там. */
  view(p, parts) {
    const v = {};
    if (parts.note) Object.assign(v, { note: p.cipher.note, script: p.script ?? "note" });
    if (parts.book) Object.assign(v, { title: p.bookTitle ?? "", source: p.source ?? "" });
    return v;
  },

  code(p) {
    const title = String(p.bookTitle ?? "").trim();
    return {
      line: p.cipher.note,
      notes: [title ? t("Kind.book.code.key", { title }) : t("Kind.book.code.keyUntitled")],
      reads: p.cipher.text,
    };
  },

  preview: {
    render(p, ui) {
      const c = p.cipher;
      const tip = esc(t("Kind.book.preview.numbersTip"));
      const toggle = `<button type="button" class="cp-book-corner" data-action="kind" data-op="numbers" aria-pressed="${Boolean(ui.numbers)}" aria-label="${tip}" data-tooltip="${tip}"><i class="fa-solid fa-list-ol" inert></i></button>`;
      const page = bookHtml(p.bookTitle, parseBook(p.source), { deco: decoOf(c), numbers: ui.numbers, cls: "cp-book-page--preview" });
      return `<div class="cp-book-preview">${keyHtml(c, toggle)}${page}</div>`;
    },
    action(op, ui) {
      if (op === "numbers") ui.numbers = !ui.numbers;
    },
    after(root, ui) {
      const scroller = root.querySelector(".cp-book-scroll");
      if (!scroller) return;
      if (ui.scroll) scroller.scrollTop = ui.scroll;
      scroller.addEventListener("scroll", () => (ui.scroll = scroller.scrollTop), { passive: true });
      const wordsOf = (chip) => root.querySelectorAll(`.cp-book-w[data-k="${chip.dataset.k}"]`);
      for (const chip of root.querySelectorAll(".cp-book-ref")) {
        chip.addEventListener("mouseenter", () => wordsOf(chip).forEach((el) => el.classList.add("is-hot")));
        chip.addEventListener("mouseleave", () => wordsOf(chip).forEach((el) => el.classList.remove("is-hot")));
        chip.addEventListener("click", () => {
          const el = wordsOf(chip)[0];
          if (!el) return;
          const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
          scroller.scrollTo({ top: Math.max(0, top - scroller.clientHeight / 2), behavior: "smooth" });
          el.classList.remove("is-flash");
          void el.offsetWidth;
          el.classList.add("is-flash");
        });
      }
    },
  },

  player: {
    size: { width: 1040, height: 780 },
    render(view, has, state) {
      const marks = new Set(state.marks ?? []);
      let bar = "";
      if (has.book) {
        bar =
          `<div class="cp-toolbar" role="toolbar">` +
          `<button type="button" class="cp-btn" data-action="kind" data-op="clear"${marks.size ? "" : " disabled"}><i class="fa-solid fa-eraser" inert></i> ${esc(t("Kind.book.view.clear"))}</button>` +
          `<span class="cp-toolbar__top cp-book-count">${esc(t("Kind.book.view.marked"))} <b data-marks>${marks.size}</b></span>` +
          `</div>`;
      }
      return bar + playerDesk(view, has, marks);
    },
    bind(root, view, has, state, save) {
      if (!has.book) return {};
      let marks = new Set(state.marks ?? []);
      const count = root.querySelector("[data-marks]");
      const clear = root.querySelector('[data-op="clear"]');
      const words = [...root.querySelectorAll(".cp-book-w")];
      const show = () => {
        for (const el of words) el.classList.toggle("is-marked", marks.has(el.dataset.k));
        if (count) count.textContent = String(marks.size);
        if (clear) clear.disabled = !marks.size;
      };
      root.querySelector(".cp-book-text")?.addEventListener("click", (event) => {
        const el = event.target.closest(".cp-book-w");
        if (!el) return;
        const k = el.dataset.k;
        if (marks.has(k)) marks.delete(k);
        else marks.add(k);
        show();
        save({ marks: [...marks] });
      });
      return {
        action(op) {
          if (op !== "clear" || !marks.size) return;
          marks = new Set();
          show();
          save({ marks: [] });
        },
        apply(next) {
          marks = new Set(next.marks ?? []);
          show();
        },
      };
    },
  },

  images(p) {
    const c = p.cipher;
    return [
      { id: "note", svg: (px) => slipSvg(c.note, { px, script: p.script ?? "note", label: t("Kind.book.part.note") }) },
      { id: "book", svg: (px) => bookSvg(p.bookTitle, parseBook(p.source), { px, label: t("Kind.book.part.book") }) },
    ];
  },

  // Пример для стенда и снимков README — на языке интерфейса.
  demo: () =>
    globalThis.game?.i18n?.lang === "en"
      ? {
          title: "The wanderer's note",
          bookTitle: "Chronicles of the White Spire",
          source: "In the year of the Ashen Moon the bell of the White Spire rang three times at midnight, though no ringer was in the tower. The chronicler Ormund wrote it down that very hour, and his hand was shaking.\nIn the morning a wanderer in a grey cloak stood at the gate. He gave no name, but asked for bread and a place by the fire. The guards let him in: he knew the old word of the gatekeepers, forgotten since the days of the former master.\nFor three nights the wanderer sat in the library and read by a single candle. On the fourth night the candle went out by itself, and the hall smelled of sea salt, though the sea lies forty leagues to the west. In the morning strange notes were found in the margins of the old chronicles.\nThey say that beneath the northern stair there is a door no one has opened since the days of the founders. Its key sank with the first master, and the lock answers only to a living voice. Many have tried to find the word, but the door has kept silent for three hundred years.\nWhen the wanderer left, a note of nothing but numbers lay on the table. Ormund looked at it for a long time, then closed the chronicle and did not take up his pen until spring.",
          phrase: "The voice opens the northern door",
          mode: "words",
          seed: 20261017,
        }
      : {
          title: "Записка странника",
          bookTitle: "Хроники Белого Шпиля",
          source: [
            "В год Пепельной луны колокол Белого Шпиля трижды прозвонил в полночь, хотя звонаря в башне не было. Летописец Ормунд записал это в тот же час, и рука его дрожала.",
            "Наутро у ворот появился странник в сером плаще. Он не назвал имени, но попросил хлеба и места у огня. Стража впустила его: он знал старое слово привратников, забытое ещё при прежнем магистре.",
            "Три ночи странник сидел в библиотеке и читал при одной свече. На четвёртую ночь свеча погасла сама, а в зале запахло морской солью, хотя до моря сорок лиг пути на запад. Утром на полях старых хроник нашли пометки, сделанные чужой рукой.",
            "Говорят, под северной лестницей есть дверь, которую не открывали со времён основателей. Ключ от неё утонул вместе с первым магистром, а замок отзывается только на живой голос. Многие пытались подобрать слово, но дверь молчит уже триста лет.",
            "Когда странник ушёл, на столе осталась записка из одних чисел. Ормунд долго смотрел на неё, потом закрыл хронику и не брал пера до самой весны.",
          ].join("\n"),
          phrase: "Голос откроет северную дверь",
          mode: "words",
          seed: 20261017,
        },
};
