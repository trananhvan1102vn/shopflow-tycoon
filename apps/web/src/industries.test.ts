import { describe, it, expect } from 'vitest';
import { pickableIndustries } from './industries';

describe('pickableIndustries', () => {
  it('stage 4 with all three starters owned unlocks the fourth industry (books)', () => {
    const r = pickableIndustries(['electronics', 'fashion', 'home'], 4);
    expect(r.map((i) => i.id)).toEqual(['books']);
  });
  it('stage 3 with two starters owned still offers the remaining starter', () => {
    const r = pickableIndustries(['electronics', 'fashion'], 3);
    expect(r.map((i) => i.id)).toEqual(['home']);
  });
  it('stage 4 with the fourth industry also owned has nothing left to pick', () => {
    const r = pickableIndustries(['electronics', 'fashion', 'home', 'books'], 4);
    expect(r).toEqual([]);
  });
});
