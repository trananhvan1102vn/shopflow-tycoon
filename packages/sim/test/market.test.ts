import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { settleDay, rollMarketCycle } from '../src/settleDay.js';
import { calendar as CAL, costs as CO } from '@shopflow/data';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const midnight = (stage: number) => { const s = createGame(42, 'electronics'); s.stage = stage; s.clock.day = 8; return s; };

describe('market cycle (từ màn 3, đổi mỗi 5 ngày)', () => {
  it('rollMarketCycle is weighted by p in data order', () => {
    expect(rollMarketCycle(seq(0.0))).toBe('stable');
    expect(rollMarketCycle(seq(0.5))).toBe('boom');     // 0.40 ≤ 0.5 < 0.65
    expect(rollMarketCycle(seq(0.7))).toBe('slow');     // 0.65 ≤ 0.7 < 0.85
    expect(rollMarketCycle(seq(0.9))).toBe('recession');
  });
  it('stays stable before stage 3', () => {
    const s = settleDay(midnight(2), seq(0.9));
    expect(s.marketCycle).toBe('stable'); expect(s.marketCycleDaysLeft).toBe(0);
  });
  it('rolls at stage 3 when daysLeft hits 0, then counts down', () => {
    let s = settleDay(midnight(3), seq(0.9));
    expect(s.marketCycle).toBe('recession');
    expect(s.marketCycleDaysLeft).toBe(CAL.marketCycle.periodDays);
    expect(s.recessionClean).toBe(true);
    s = settleDay(s, seq(0.0));
    expect(s.marketCycle).toBe('recession'); expect(s.marketCycleDaysLeft).toBe(CAL.marketCycle.periodDays - 1);
  });
  it('leaving a clean recession sets survivedRecession', () => {
    let s = midnight(3); s.marketCycle = 'recession'; s.marketCycleDaysLeft = 1;
    s = settleDay(s, seq(0.0)); // countdown → 0
    expect(s.marketCycle).toBe('recession');
    s = settleDay(s, seq(0.0)); // roll → stable
    expect(s.marketCycle).toBe('stable'); expect(s.survivedRecession).toBe(true);
  });
  it('unpaid channel fee during recession dirties recessionClean', () => {
    let s = midnight(3); s.marketCycle = 'recession'; s.marketCycleDaysLeft = 3; s.money = 0;
    s.channels.push({ id: 'mall', open: true, suspended: false, ratingLocked: false, level: 1, ordersDelivered: 0 });
    s = settleDay(s, seq(0.0));
    expect(s.recessionClean).toBe(false);
  });
});

describe('SEO decay + profit streak', () => {
  it('SEO −1/ngày về sàn 40 từ màn 3', () => {
    let s = midnight(3); s.seo = { electronics: 41 };
    s = settleDay(s, seq(0.0)); expect(s.seo.electronics).toBe(40);
    s = settleDay(s, seq(0.0)); expect(s.seo.electronics).toBe(CO.seoFloor);
    const s2 = settleDay({ ...midnight(2), seo: { electronics: 55 } }, seq(0.0));
    expect(s2.seo.electronics).toBe(55);
  });
  it('profitStreakDays counts consecutive net > 0 days', () => {
    let s = midnight(2); s.dayRevenue = { flea: 500000 };
    s = settleDay(s, seq(0.0)); expect(s.profitStreakDays).toBe(1);
    s = settleDay(s, seq(0.0)); expect(s.profitStreakDays).toBe(0); // ngày trống: net âm (thuê kho)
  });
  it('report carries refunds and questBonus, questBonus folded into net', () => {
    let s = midnight(2); s.dayRefunds = 800; s.dayQuestBonus = 5000; s.dayRevenue = { flea: 10000 };
    s = settleDay(s, seq(0.0));
    const r = s.reports[0];
    expect(r.refunds).toBe(800); expect(r.questBonus).toBe(5000);
    expect(r.net).toBe(10000 - 0 - 0 - 1800 - 100 - 0 + 5000);
    expect(s.dayRefunds).toBe(0); expect(s.dayQuestBonus).toBe(0);
  });
});
