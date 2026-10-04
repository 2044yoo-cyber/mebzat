// Small deterministic PRNG (mulberry32) so the seed dataset is reproducible:
// the same script run always produces the same fictional records, which keeps
// re-runs idempotent.

export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = ReturnType<typeof makeRng>;

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function pickSome<T>(rng: Rng, items: readonly T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

export function intBetween(rng: Rng, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function chance(rng: Rng, probability: number) {
  return rng() < probability;
}

/** Walks a fixed list in order, wrapping. Unlike pick(), this is not random:
 * seeding n rows from a list of m gives every entry the same number of uses
 * (±1), which is what the ecosystem seeds want — one of each kind before any
 * repeat, rather than a random draw that leaves gaps and clusters. */
export function cycle<T>(items: readonly T[], index: number): T {
  return items[((index % items.length) + items.length) % items.length];
}
