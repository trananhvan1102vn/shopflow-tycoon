import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { levelK } from '../src/formulas.js';
import { logisticsSuspended } from '../src/env.js';
import { advanceShipping } from '../src/logistics.js';
import { buyBundle, chooseIndustry, openChannel } from '../src/actions.js';
import { checkQuests } from '../src/quests.js';
import { channels as CH } from '@shopflow/data';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const web = (CH.channels as any[]).find((c) => c.id === 'website');

describe('website loyalty', () => {
  it('K grows +0.1 per 100 orders, capped at 1.4', () => {
    expect(levelK(web, 1, 0)).toBeCloseTo(0.6);
    expect(levelK(web, 1, 250)).toBeCloseTo(0.8);
    expect(levelK(web, 1, 5000)).toBeCloseTo(1.4);
    expect(levelK(web, 2, 100)).toBeCloseTo(0.7 * CH.levelBonus['2'].kMult);
  });
});

describe('logistics suspension', () => {
  it('flags New Year 1–2/1 and Christmas 24–26/12 only', () => {
    expect(logisticsSuspended(1, 1)).toBe(true); expect(logisticsSuspended(1, 2)).toBe(true); expect(logisticsSuspended(1, 3)).toBe(false);
    expect(logisticsSuspended(12, 24)).toBe(true); expect(logisticsSuspended(12, 26)).toBe(true); expect(logisticsSuspended(12, 23)).toBe(false);
  });
  it('advanceShipping does not count down on a suspended day', () => {
    let s = createGame(42, 'electronics'); s.clock = { minute: 0, day: 1, month: 1, year: 1 };
    s = buyBundle(s, 'electronics', 'power', { carrierId: 'standard' }); // 2 ngày
    const before = s.deliveries[0].daysLeft;
    expect(advanceShipping(s, seq(0.5)).deliveries[0].daysLeft).toBe(before);
    s.clock.day = 3;
    expect(advanceShipping(s, seq(0.5)).deliveries[0].daysLeft).toBe(before - 1);
  });
});

describe('fourth industry + stage-4 quests', () => {
  it('books pickable at stage 4, not at 3', () => {
    const s3 = createGame(42, 'electronics'); s3.stage = 3; s3.industries = ['electronics', 'fashion', 'home'];
    expect(chooseIndustry(s3, 'books').lastReject).toBeTruthy();
    const s4 = { ...s3, stage: 4 };
    expect(chooseIndustry(s4, 'books').industries).toContain('books');
  });
  it('web_100_orders and win_price_war pay once', () => {
    let s = createGame(42, 'electronics'); s.stage = 4; s.money = 100_000_000;
    s = openChannel(s, 'website');
    s.channels = s.channels.map((c) => c.id === 'website' ? { ...c, ordersDelivered: 100 } : c);
    s.priceWarsWon = 1;
    const out = checkQuests(s);
    expect(out.questsDone.sort()).toEqual(['web_100_orders', 'win_price_war']);
    expect(checkQuests(out).money).toBe(out.money);
  });
});
