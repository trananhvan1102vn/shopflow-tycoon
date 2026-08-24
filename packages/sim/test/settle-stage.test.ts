import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng } from '../src/index.js';
import { advanceStage } from '../src/actions.js';

const rng = makeRng(1);

describe('settleDay report', () => {
  it('folds day accumulators into the report and resets them', () => {
    let s = createGame(42, 'electronics');
    s.dayRevenue = { flea: 5000 }; s.dayOrders = { flea: 6 };
    s.dayCommission = 600; s.dayPurchases = 2000;
    s = tick(s, 16 * 60, rng);
    const r = s.reports[0];
    expect(r.revenueByChannel).toEqual({ flea: 5000 });
    expect(r.ordersByChannel).toEqual({ flea: 6 });
    expect(r.commission).toBe(600);
    expect(r.purchases).toBe(2000);
    // net = 5000 − 600 − 0 phí kênh − 1800 thuê − 100 bảo trì − 2000 = 500
    expect(r.net).toBe(500);
    expect(s.dayRevenue).toEqual({});
    expect(s.dayCommission).toBe(0);
  });
});

describe('stage progression', () => {
  it('flags stageComplete when all goals met', () => {
    let s = createGame(42, 'electronics');
    s.money = 160000; s.completedOrders = 50; s.rating = 3.5;
    s = tick(s, 4, rng);
    expect(s.stageComplete).toBe(true);
  });
  it('not before goals', () => {
    let s = createGame(42, 'electronics');
    s.money = 160000; s.completedOrders = 49; s.rating = 4;
    s = tick(s, 4, rng);
    expect(s.stageComplete).toBe(false);
  });
  it('advanceStage pays reward and bumps stage', () => {
    let s = createGame(42, 'electronics');
    s.stageComplete = true; s.money = 160000;
    s = advanceStage(s);
    expect(s.stage).toBe(2);
    expect(s.money).toBe(160000 + 40000);
    expect(s.stageComplete).toBe(false);
    expect(advanceStage(createGame(42, 'electronics')).lastReject).toBeTruthy();
  });
});
