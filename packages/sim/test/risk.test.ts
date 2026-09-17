import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buyBundle } from '../src/actions.js';
import { advanceShipping } from '../src/logistics.js';
import { decayRelationships } from '../src/suppliers.js';
import { settleDay } from '../src/settleDay.js';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const lot = (supplierId: string) => {
  const s = createGame(42, 'electronics'); s.stage = 3; s.money = 10_000_000; s.clock.day = 8;
  return buyBundle(s, 'electronics', 'starter', { carrierId: 'standard', supplierId, grade: 'B' });
};

describe('supplier risk (first night only)', () => {
  it('regional: delay when roll < 0.05', () => {
    const s = advanceShipping(lot('regional'), seq(0.01));
    expect(s.deliveries[0]).toMatchObject({ risk: 'delay', riskResolved: true, daysLeft: 3 + 1 - 1 });
  });
  it('regional: no delay otherwise', () => {
    const s = advanceShipping(lot('regional'), seq(0.5));
    expect(s.deliveries[0].risk).toBeUndefined();
    expect(s.deliveries[0].daysLeft).toBe(2);
  });
  it('overseas: customs +2 and loss 10% can both fire; customs wins the tag', () => {
    const s = advanceShipping(lot('overseas'), seq(0.05, 0.01));
    const d = s.deliveries[0];
    expect(d.risk).toBe('customs');
    expect(d.daysLeft).toBe(5 + 2 - 1);
    // 15 ốp → 13, 10 cáp → 9 (floor of ×0.9)
    expect(d.items).toEqual({ phone_case: 13, cable: 9 });
    expect(d.itemsTotal).toBe(22);
  });
  it('overseas: loss only', () => {
    const d = advanceShipping(lot('overseas'), seq(0.5, 0.01)).deliveries[0];
    expect(d.risk).toBe('loss'); expect(d.daysLeft).toBe(4);
  });
  it('resolved once: second night rolls nothing', () => {
    let s = advanceShipping(lot('regional'), seq(0.5));
    s = advanceShipping(s, seq(0.01));
    expect(s.deliveries[0].risk).toBeUndefined();
    expect(s.deliveries[0].daysLeft).toBe(1);
  });
});

describe('relationship decay', () => {
  it('drops one level after 30 idle days', () => {
    const s = createGame(42, 'electronics');
    s.relationships = { local: { xp: 35, lastPurchaseDay: 6 } };
    s.clock.day = 6; s.clock.month = 2; // absDay 36 → 30 ngày sau
    const d = decayRelationships(s);
    expect(d.relationships.local.xp).toBe(10); // về mốc cấp trước (index 1)
    expect(d.relationships.local.lastPurchaseDay).toBe(36);
    expect(decayRelationships(createGame(42, 'electronics')).relationships).toEqual({});
  });
  it('settleDay applies decay', () => {
    const s = createGame(42, 'electronics');
    s.relationships = { local: { xp: 10, lastPurchaseDay: 6 } };
    s.clock = { minute: 24 * 60, day: 6, month: 2, year: 1 };
    expect(settleDay(s, seq(0.5)).relationships.local.xp).toBe(0);
  });
});
