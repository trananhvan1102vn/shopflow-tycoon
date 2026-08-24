import { describe, it, expect } from 'vitest';
import { makeRng } from '../src/rng.js';

describe('makeRng', () => {
  it('same seed → same sequence, in [0,1)', () => {
    const a = makeRng(42), b = makeRng(42);
    for (let i = 0; i < 100; i++) {
      const v = a.next();
      expect(v).toBe(b.next());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('different seeds differ', () => {
    expect(makeRng(1).next()).not.toBe(makeRng(2).next());
  });
});
