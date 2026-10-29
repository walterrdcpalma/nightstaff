import { describe, expect, it } from 'vitest';
import { mulberry32, randomIndex } from './rng.ts';

const take = (rng: () => number, n: number) => Array.from({ length: n }, rng);

describe('mulberry32', () => {
  it('a mesma seed dá a mesma sequência', () => {
    expect(take(mulberry32(42), 10)).toEqual(take(mulberry32(42), 10));
  });

  it('seeds diferentes dão sequências diferentes', () => {
    expect(take(mulberry32(1), 10)).not.toEqual(take(mulberry32(2), 10));
  });

  it('devolve valores em [0, 1)', () => {
    for (const x of take(mulberry32(7), 10000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('randomIndex', () => {
  it('devolve inteiros em [0, n) e cobre todos os valores', () => {
    const rng = mulberry32(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const k = randomIndex(rng, 3);
      expect(Number.isInteger(k) && k >= 0 && k < 3).toBe(true);
      seen.add(k);
    }
    expect(seen).toEqual(new Set([0, 1, 2]));
  });
});
