/* Случайность с зерном: один и тот же seed даёт тот же шифр. Ничего из Foundry. */

/** Сидируемый генератор случайных чисел [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Новое зерно для шифра. */
export const newSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;

export const randInt = (rng, n) => Math.floor(rng() * n);

export const pick = (rng, list) => list[randInt(rng, list.length)];

/** Перемешанная копия списка (Фишер — Йетс). */
export function shuffle(rng, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
