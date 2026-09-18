import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buyRetail, buyBundle, quoteRetail, quoteBundle, retailUnitPrice } from '../src/actions.js';
import { relationshipLevel, relationshipDiscount, relationshipPerks, gradeCostMult, gradeAllowed } from '../src/suppliers.js';

const rich = (stage = 3) => { const s = createGame(42, 'electronics'); s.stage = stage; s.money = 10_000_000; s.clock.day = 8; return s; };

describe('supplier & grade gating', () => {
  it('stage 1: local only, grade B only', () => {
    const s = createGame(42, 'electronics');
    expect(gradeAllowed(s, 'local', 'A')).toBe(false);
    expect(gradeAllowed(s, 'local', 'B')).toBe(true);
    expect(buyRetail(s, 'phone_case', 10, { carrierId: 'standard', grade: 'A' }).lastReject).toBeTruthy();
    expect(buyRetail(s, 'phone_case', 20, { carrierId: 'standard', supplierId: 'regional' }).lastReject).toBeTruthy();
  });
  it('stage 2: local A ok, regional MOQ 20, +2 days, −20%', () => {
    const s0 = rich(2);
    expect(buyRetail(s0, 'phone_case', 10, { carrierId: 'standard', supplierId: 'regional' }).lastReject).toBeTruthy(); // MOQ 20
    const q = quoteRetail(s0, 'phone_case', 20, { carrierId: 'standard', supplierId: 'regional', grade: 'C' });
    // 200 × 1.2 × 0.8 × 0.85 = 163.2 → 163
    expect(q.unit).toBe(163); expect(q.days).toBe(2); expect(q.moq).toBe(20);
    const s = buyRetail(s0, 'phone_case', 20, { carrierId: 'standard', supplierId: 'regional', grade: 'C' });
    expect(s.lastReject).toBeNull();
    expect(s.deliveries[0]).toMatchObject({ supplierId: 'regional', grade: 'C', daysLeft: 2, state: 'shipping', riskResolved: false });
    expect(s.retailLotsBought).toBe(1);
  });
  it('overseas locked until stage 3; grade A not offered there', () => {
    expect(buyRetail(rich(2), 'phone_case', 20, { carrierId: 'standard', supplierId: 'overseas' }).lastReject).toBeTruthy();
    expect(gradeAllowed(rich(3), 'overseas', 'A')).toBe(false);
    const s = buyBundle(rich(3), 'electronics', 'starter', { carrierId: 'standard', supplierId: 'overseas', grade: 'C' });
    expect(s.lastReject).toBeNull();
    // 6000 × 0.65 × 0.85 = 3315 ; days 1 + 4 + 0 = 5
    expect(s.deliveries[0].cost).toBe(3315 + 2000);
    expect(s.deliveries[0].daysLeft).toBe(5);
    expect(s.deliveries[0].bundleId).toBe('starter');
    expect(s.bundleLotsBought).toBe(1);
  });
  it('bundleShipMult: home bundles ship ×1.5', () => {
    const s = rich(1); s.industries = ['home'];
    const q = quoteBundle(s, 'home', 'kitchen', { carrierId: 'standard' });
    expect(q.ship).toBe(3000);
  });
  it('stage 2: relationship XP does not accrue yet (quan hệ nguồn mở ở màn 3)', () => {
    const s = buyBundle(rich(2), 'electronics', 'power', { carrierId: 'standard' });
    expect(s.lastReject).toBeNull();
    expect(s.relationships).toEqual({});
  });
});

describe('relationship', () => {
  it('xp = floor(cost / $100); level thresholds; discount applies', () => {
    let s = rich(3);
    // 30 lượt Power Bundle nội địa ≈ $120 mỗi lượt ⇒ ≥ 30 XP ⇒ cấp 2 (index 2, −6%)
    for (let i = 0; i < 30; i++) s = buyBundle(s, 'electronics', 'power', { carrierId: 'standard' });
    expect(s.relationships.local.xp).toBeGreaterThanOrEqual(30);
    expect(relationshipLevel(s, 'local')).toBe(2);
    expect(relationshipDiscount(s, 'local')).toBe(0.06);
    const q = quoteBundle(s, 'electronics', 'starter', { carrierId: 'standard' });
    expect(q.goods).toBe(Math.round(6000 * (1 - 0.06)));
  });
  it('level ≥ 2 (index): grade A at grade-B price', () => {
    const s = rich(3); s.relationships = { local: { xp: 30, lastPurchaseDay: 8 } };
    expect(gradeCostMult(s, 'local', 'A')).toBe(1.0);
    const s2 = rich(3);
    expect(gradeCostMult(s2, 'local', 'A')).toBe(1.1);
  });
  it('level index 3: −1 day delivery', () => {
    const s = rich(3); s.relationships = { regional: { xp: 80, lastPurchaseDay: 8 } };
    const q = quoteBundle(s, 'electronics', 'starter', { carrierId: 'standard', supplierId: 'regional' });
    expect(q.days).toBe(1 + 2 - 1);
  });
  it('perks are cumulative: at the top level (xp 200) grade A still costs grade B and delivery is still −1 day', () => {
    const s = rich(3);
    s.relationships = { local: { xp: 200, lastPurchaseDay: 8 }, regional: { xp: 200, lastPurchaseDay: 8 } };
    expect(relationshipLevel(s, 'local')).toBe(4);
    expect(relationshipPerks(s, 'local')).toEqual({ exclusiveBundle: true, daysDelta: -1, crisisImmune: true });
    expect(gradeCostMult(s, 'local', 'A')).toBe(1.0);
    const q = quoteBundle(s, 'electronics', 'starter', { carrierId: 'standard', supplierId: 'regional' });
    expect(q.days).toBe(1 + 2 - 1);
  });
  it('perks accumulate level by level', () => {
    const at = (xp: number) => { const s = rich(3); s.relationships = { local: { xp, lastPurchaseDay: 8 } }; return relationshipPerks(s, 'local'); };
    expect(at(0)).toEqual({ exclusiveBundle: false, daysDelta: 0, crisisImmune: false });
    expect(at(10)).toEqual({ exclusiveBundle: false, daysDelta: 0, crisisImmune: false });
    expect(at(30)).toEqual({ exclusiveBundle: true, daysDelta: 0, crisisImmune: false });
    expect(at(80)).toEqual({ exclusiveBundle: true, daysDelta: -1, crisisImmune: false });
    expect(at(200)).toEqual({ exclusiveBundle: true, daysDelta: -1, crisisImmune: true });
  });
  it('retailUnitPrice unchanged for local/B', () => {
    expect(retailUnitPrice(createGame(42, 'electronics'), 'phone_case')).toBe(240);
  });
});
