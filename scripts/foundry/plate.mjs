/* Латунная пластина с окошками поверх письма — общая для решётки и трафарета.
   Рисунок: прямоугольник с прорезями, заклёпки, по желанию метки I–IV по краям.
   Поведение: щелчок — поворот по часовой, правый щелчок — против (если пластину можно вращать),
   тянуть — сдвинуть; отпущенная почти на месте, она ложится ровно — и в окошках загораются буквы.
   С клавиатуры (фокус на пластине): Q / E — повороты, стрелки — сдвиг на клетку, Enter — на место. */

import { brass, num, roundRect, SERIF_SC, svgOpen, uid } from "./paper.mjs";

export const ROMAN = ["I", "II", "III", "IV"];

const mod4 = (k) => ((k % 4) + 4) % 4;

/** Ширина римской цифры кеглем 4.2 — на глаз, чтобы стрелка встала рядом. */
const ROMAN_W = [1.4, 2.8, 4.2, 4.6];

/** Метка края: римская цифра и стрелка «по часовой» рядом, по центру края. */
function mark(i) {
  const w = ROMAN_W[i];
  const gap = 1.2;
  const r = 1.45;
  const left = -(w + gap + 2 * r) / 2;
  const cx = left + w + gap + r;
  // дуга от 35° до 285° по часовой (в SVG углы растут по часовой), наконечник — на конце
  const p = (deg) => [num(cx + r * Math.cos((deg * Math.PI) / 180)), num(r * Math.sin((deg * Math.PI) / 180))];
  const [sx, sy] = p(35);
  const [ex, ey] = p(285);
  const a = (285 * Math.PI) / 180;
  const [tx, ty] = [-Math.sin(a), Math.cos(a)];
  const [nx, ny] = [Math.cos(a), Math.sin(a)];
  const head = [
    [num(ex + tx * 1.35), num(ey + ty * 1.35)],
    [num(ex + nx * 0.85), num(ey + ny * 0.85)],
    [num(ex - nx * 0.85), num(ey - ny * 0.85)],
  ];
  return (
    `<text x="${num(left)}" y="0" dy=".34em" font-family="${SERIF_SC}" font-weight="700" font-size="4.2" stroke="none">${ROMAN[i]}</text>` +
    `<path d="M${sx},${sy}A${r},${r} 0 1 1 ${ex},${ey}" fill="none" stroke-width=".5" stroke-linecap="round"/>` +
    `<path d="M${head.map((pt) => pt.join(",")).join("L")}z" stroke="none"/>`
  );
}

/**
 * Пластина. box — [x, y, w, h] пластины в единицах письма; holes — прорези [x, y, w, h].
 * o.marks — метки I–IV по краям (поворотная решётка); o.px, o.label — для картинки и чтеца экрана.
 */
export function plateSvg(box, holes, o = {}) {
  const [x, y, w, h] = box;
  const id = uid();
  const b = brass();
  const d = roundRect(x, y, w, h, 3) + holes.map(([hx, hy, hw, hh]) => `M${num(hx)},${num(hy)}h${num(hw)}v${num(hh)}h${num(-hw)}z`).join("");
  const out = [svgOpen(box, { ...o, cls: "cp-plate-svg" })];
  out.push(
    "<defs>",
    b.defs,
    `<radialGradient id="${id}r" cx="35%" cy="35%" r="65%"><stop offset="0" stop-color="#f6dea4"/><stop offset=".6" stop-color="#a27838"/><stop offset="1" stop-color="#4f3815"/></radialGradient>`,
    "</defs>",
  );
  out.push(`<path d="${d}" fill="${b.fill}" fill-rule="evenodd" stroke="#3b2a12" stroke-width=".6"/>`);
  out.push(`<path d="${d}" fill="#000" fill-rule="evenodd" filter="${b.grain}"/>`);
  out.push(`<path d="${d}" fill="${b.shine}" fill-rule="evenodd"/>`);
  out.push(`<path d="${roundRect(x + 1.8, y + 1.8, w - 3.6, h - 3.6, 2)}" fill="none" stroke="#2e200c" stroke-width=".45" opacity=".55"/>`);
  out.push(`<path d="${roundRect(x + 2.1, y + 2.1, w - 4.2, h - 4.2, 1.8)}" fill="none" stroke="#efcd8a" stroke-width=".3" opacity=".7"/>`);
  out.push('<g fill="none" stroke-width=".4">');
  for (const [hx, hy, hw, hh] of holes) {
    out.push(`<path d="M${num(hx)},${num(hy + hh)}V${num(hy)}H${num(hx + hw)}" stroke="#2a1d0a"/><path d="M${num(hx + hw)},${num(hy)}V${num(hy + hh)}H${num(hx)}" stroke="#f1d394" opacity=".75"/>`);
  }
  out.push("</g>");
  const k = 3.4;
  out.push(`<g fill="url(#${id}r)" stroke="#3b2a12" stroke-width=".25">`);
  for (const [cx, cy] of [[x + k, y + k], [x + w - k, y + k], [x + k, y + h - k], [x + w - k, y + h - k]]) out.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="1.15"/>`);
  out.push("</g>");
  if (o.marks) {
    const mid = 3.5;
    const marks = [
      [x + w / 2, y + mid, 0],
      [x + mid, y + h / 2, -90],
      [x + w / 2, y + h - mid, 180],
      [x + w - mid, y + h / 2, 90],
    ];
    marks.forEach(([mx, my, a], i) => {
      const label = mark(i);
      out.push(`<g transform="translate(${num(mx)} ${num(my)}) rotate(${a})">`);
      out.push(`<g transform="translate(.22 .28)" fill="#f3d79c" stroke="#f3d79c" opacity=".4">${label}</g>`);
      out.push(`<g fill="#2e200c" stroke="#2e200c">${label}</g>`);
      out.push("</g>");
    });
  }
  out.push("</svg>");
  return out.join("");
}

/** Где пластина лежит на письме — стиль в процентах от письма. sheet и plate — [x, y, w, h] в одних единицах. */
export function plateStyle(sheet, plate) {
  const pct = (v, of) => `${num((v / of) * 100)}%`;
  return `left:${pct(plate[0] - sheet[0], sheet[2])};top:${pct(plate[1] - sheet[1], sheet[3])};width:${pct(plate[2], sheet[2])};height:${pct(plate[3], sheet[3])}`;
}

/**
 * Оживить пластину на столе. stage — элемент, в котором лежат письмо и .cp-plate.
 * o.sheet, o.plate — [x, y, w, h] письма и пластины; o.step — сколько единиц в одной клетке сдвига;
 * o.state — { k, dx, dy, lifted } (сдвиг в клетках); o.rotatable — можно ли вращать;
 * o.cellsAt(k) — какие клетки письма открыты в положении k (Set индексов data-i); o.glow — зажигать ли их;
 * o.onChange(state) — после каждого поворота и сдвига; o.fixed — только показать, без мыши.
 * Возвращает { rotate, align, lift, show, apply, state }.
 */
export function bindPlate(stage, o) {
  const plate = stage.querySelector(".cp-plate");
  if (!plate) return null;
  const [, , pw, ph] = o.plate;
  const sw = o.sheet[2];
  const step = o.step ?? 10;
  const rotatable = o.rotatable !== false;
  const st = { k: 0, dx: 0, dy: 0, lifted: false };
  const cells = [...stage.querySelectorAll(".cp-glow, .cp-l")];
  let dragging = false;

  const aligned = () => st.dx === 0 && st.dy === 0;
  const unitPx = () => (stage.getBoundingClientRect().width / sw) * step || 1;

  function place() {
    const tx = ((st.dx * step) / pw) * 100;
    const ty = ((st.dy * step) / ph) * 100;
    plate.style.transform = `translate(${num(tx)}%, ${num(ty)}%) rotate(${st.k * 90}deg)`;
    plate.classList.toggle("is-lifted", st.lifted);
    stage.dataset.top = ROMAN[mod4(st.k)];
  }

  function light() {
    const on = o.glow !== false && !st.lifted && aligned() ? o.cellsAt(mod4(st.k)) : new Set();
    for (const el of cells) el.classList.toggle("is-lit", on.has(Number(el.dataset.i)));
    stage.classList.toggle("is-aligned", aligned() && !st.lifted);
  }

  function set(next) {
    st.k = Number(next?.k) || 0;
    st.dx = Number(next?.dx) || 0;
    st.dy = Number(next?.dy) || 0;
    st.lifted = Boolean(next?.lifted);
    place();
    light();
  }

  function commit() {
    place();
    light();
    o.onChange?.({ ...st });
  }

  const api = {
    rotate(dir) {
      if (!rotatable) return;
      st.k += dir;
      st.lifted = false;
      commit();
    },
    align() {
      st.dx = 0;
      st.dy = 0;
      st.lifted = false;
      commit();
    },
    lift(value = !st.lifted) {
      st.lifted = value;
      commit();
    },
    /** Показать положение без сохранения (пошаговая проверка у ведущего). */
    show(k) {
      set({ k });
    },
    /** Чужое изменение на общем столе: принять, если сами сейчас не тянем. */
    apply(next) {
      if (!dragging) set(next);
    },
    get state() {
      return { ...st };
    },
  };

  set(o.state);
  if (o.fixed) return api;

  let drag = null;
  plate.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    plate.focus({ preventScroll: true });
    drag = { x: event.clientX, y: event.clientY, dx: st.dx, dy: st.dy, moved: false, button: event.button };
    plate.setPointerCapture?.(event.pointerId);
  });
  plate.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const mx = event.clientX - drag.x;
    const my = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(mx, my) < 5) return;
    if (!drag.moved) {
      drag.moved = true;
      dragging = true;
      plate.classList.add("is-dragging");
    }
    st.dx = drag.dx + mx / unitPx();
    st.dy = drag.dy + my / unitPx();
    place();
    light();
  });
  const end = (cancel) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    dragging = false;
    plate.classList.remove("is-dragging");
    if (!d.moved) {
      if (!cancel) api.rotate(d.button === 2 ? -1 : 1);
      return;
    }
    if (Math.hypot(st.dx, st.dy) < 0.45) {
      st.dx = 0;
      st.dy = 0;
    }
    commit();
  };
  plate.addEventListener("pointerup", () => end(false));
  plate.addEventListener("pointercancel", () => end(true));
  plate.addEventListener("contextmenu", (event) => event.preventDefault());
  plate.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    const move = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[key];
    if (rotatable && (key === "q" || key === "й")) api.rotate(-1);
    else if (rotatable && (key === "e" || key === "у")) api.rotate(1);
    else if (key === "enter" || key === "home") api.align();
    else if (move) {
      st.dx = Math.round(st.dx) + move[0];
      st.dy = Math.round(st.dy) + move[1];
      commit();
    } else return;
    // Иначе Foundry сдвинет карту или повернёт токен.
    event.preventDefault();
    event.stopPropagation();
  });
  return api;
}
