import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buySeo, chooseIndustry } from '../src/actions.js';

const atStage2 = () => { const s = createGame(42, 'electronics'); s.stage = 2; return s; };

describe('SEO', () => {
  it('locked at stage 1', () => {
    expect(buySeo(createGame(42, 'electronics'), 'electronics').lastReject).toBeTruthy();
  });
  it('level 1: $160 → score 55; level 2: $400 → 70; level 3 stage-locked', () => {
    let s = buySeo(atStage2(), 'electronics');
    expect(s.seo.electronics).toBe(55);
    expect(s.money).toBe(100000 - 16000);
    s = buySeo(s, 'electronics');
    expect(s.seo.electronics).toBe(70);
    expect(buySeo(s, 'electronics').lastReject).toBeTruthy(); // cấp 3 → màn 3
  });
});

describe('chooseIndustry', () => {
  it('stage 2 unlocks a second industry with SEO 40', () => {
    expect(chooseIndustry(createGame(42, 'electronics'), 'fashion').lastReject).toBeTruthy();
    const s = chooseIndustry(atStage2(), 'fashion');
    expect(s.industries).toEqual(['electronics', 'fashion']);
    expect(s.seo.fashion).toBe(40);
  });
  it('rejects duplicates and non-starter industries', () => {
    expect(chooseIndustry(atStage2(), 'electronics').lastReject).toBeTruthy();
    expect(chooseIndustry(atStage2(), 'books').lastReject).toBeTruthy();
  });
});
