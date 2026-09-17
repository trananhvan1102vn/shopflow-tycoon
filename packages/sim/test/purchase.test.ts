import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buyRetail, buyBundle, retailUnitPrice } from '../src/actions.js';

// createGame bắt đầu ở ngày 6 = cuối tuần (calendar.weekendDays), nên các test giá gói
// cơ bản dùng ngày thường để tách bạch với test nhân hệ số cuối tuần.
const weekday = (industry = 'electronics') => {
  const s = createGame(42, industry);
  s.clock.day = 8;
  return s;
};

describe('buyRetail', () => {
  it('charges wholesale×1.2×qty + carrier fee; standard = same-day audit', () => {
    const s = buyRetail(createGame(42, 'electronics'), 'phone_case', 10, { carrierId: 'standard' });
    // 200×1.2=240 ×10 + 2000 ship = 4400
    expect(s.money).toBe(100000 - 4400);
    expect(s.dayPurchases).toBe(4400);
    expect(s.deliveries).toHaveLength(1);
    expect(s.deliveries[0].state).toBe('auditing');
    expect(s.deliveries[0].itemsTotal).toBe(10);
    expect(s.unchecked).toBe(10);
    expect(s.lastReject).toBeNull();
  });
  it('economy adds a day → shipping', () => {
    const s = buyRetail(createGame(42, 'electronics'), 'phone_case', 10, { carrierId: 'economy' });
    expect(s.deliveries[0].state).toBe('shipping');
    expect(s.deliveries[0].daysLeft).toBe(1);
  });
  it('rejects below MOQ 5 and above 100', () => {
    expect(buyRetail(createGame(42, 'electronics'), 'phone_case', 4, { carrierId: 'standard' }).lastReject).toBeTruthy();
    expect(buyRetail(createGame(42, 'electronics'), 'phone_case', 101, { carrierId: 'standard' }).lastReject).toBeTruthy();
  });
  it('rejects when broke, state unchanged', () => {
    const s0 = createGame(42, 'electronics'); s0.money = 100;
    const s = buyRetail(s0, 'phone_case', 10, { carrierId: 'standard' });
    expect(s.lastReject).toBeTruthy();
    expect(s.deliveries).toHaveLength(0);
    expect(s.money).toBe(100);
  });
  it('unit price helper', () => {
    expect(retailUnitPrice(createGame(42, 'electronics'), 'phone_case')).toBe(240);
  });
});

describe('buyBundle', () => {
  it('starter bundle: cost + ship, 1 day transit (standard)', () => {
    const s = buyBundle(weekday(), 'electronics', 'starter', { carrierId: 'standard' });
    expect(s.money).toBe(100000 - 6000 - 2000);
    expect(s.deliveries[0].daysLeft).toBe(1);
    expect(s.deliveries[0].itemsTotal).toBe(25); // 15 ốp + 10 cáp
  });
  it('express shaves a day: starter arrives same tick', () => {
    const s = buyBundle(weekday(), 'electronics', 'starter', { carrierId: 'express' });
    expect(s.deliveries[0].state).toBe('auditing');
  });
  it('stage-locked bundle rejected at stage 1', () => {
    const s = buyBundle(weekday(), 'electronics', 'audio', { carrierId: 'standard' });
    expect(s.lastReject).toBeTruthy();
  });
  it('weekend wholesale ×0.95 applies to bundle cost', () => {
    const s0 = createGame(42, 'electronics'); s0.clock.day = 6;
    const s = buyBundle(s0, 'electronics', 'starter', { carrierId: 'standard' });
    expect(s.money).toBe(100000 - Math.round(6000 * 0.95) - 2000);
  });
  it('audit space: rejects when pallets full', () => {
    const s0 = createGame(42, 'electronics');
    s0.unchecked = 8 * 500; // 8 ô trống của lưới 3×3 đã đầy
    const s = buyRetail(s0, 'phone_case', 10, { carrierId: 'standard' });
    expect(s.lastReject).toBeTruthy();
  });
});
