import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { fulfilOrders, expireSla, comboBonus, packCapacityPerSecond } from '../src/fulfil.js';
import type { Order } from '../src/types.js';

const order = (id: string, over: Partial<Order> = {}): Order => ({
  id, productId: 'phone_case', industryId: 'electronics', channelId: 'flea',
  value: 800, slaLeft: 1440, state: 'queued', ...over,
});

function ready() {
  const s = createGame(42, 'electronics'); // 1 bàn tốc độ 1.0 giữa lưới
  s.grid.cells[0] = { type: 'shelf', level: 1 };
  s.inventory = { phone_case: 10 };
  s.orders = [order('o1'), order('o2')];
  return s;
}

const noReturn = { next: () => 0.99 };

describe('fulfilment', () => {
  it('delivers capacity×dt orders: 1 packer → 1 đơn/giây thực (dt=4)', () => {
    let s = fulfilOrders(ready(), 4, noReturn);
    expect(s.orders).toHaveLength(1);
    // 800 × (1−12% hoa hồng flea) = 704
    expect(s.money).toBe(100000 + 704);
    expect(s.dayRevenue.flea).toBe(800);
    expect(s.dayCommission).toBe(96);
    expect(s.dayOrders.flea).toBe(1);
    expect(s.rating).toBeCloseTo(4.02);
    expect(s.completedOrders).toBe(1);
    expect(s.inventory.phone_case).toBe(9);
    expect(s.onTimeStreak).toBe(1);
  });
  it('no stock → order waits', () => {
    const s0 = ready(); s0.inventory = {};
    const s = fulfilOrders(s0, 4, noReturn);
    expect(s.orders).toHaveLength(2);
    expect(s.money).toBe(100000);
  });
  it('combo: 10 on-time → +5% revenue', () => {
    expect(comboBonus(9)).toBe(0);
    expect(comboBonus(10)).toBeCloseTo(0.05);
    expect(comboBonus(200)).toBeCloseTo(0.5);
    const s0 = ready(); s0.onTimeStreak = 10;
    const s = fulfilOrders(s0, 4, noReturn);
    expect(s.dayRevenue.flea).toBe(Math.round(800 * 1.05));
  });
  it('robot counts only with a shelf, +25% adjacent', () => {
    const s = createGame(42, 'electronics'); // packer ở ô 4 (giữa 3×3)
    expect(packCapacityPerSecond(s)).toBe(1);
    s.grid.cells[0] = { type: 'robot', level: 1 }; // 0.5, không kệ → không tính
    expect(packCapacityPerSecond(s)).toBe(1);
    s.grid.cells[1] = { type: 'shelf', level: 1 }; // ô 1 kề ô 0
    expect(packCapacityPerSecond(s)).toBeCloseTo(1 + 0.5 * 1.25);
  });
  it('SLA expiry: đơn rơi, −0.1 rating, combo reset', () => {
    const s0 = ready(); s0.onTimeStreak = 25;
    s0.orders = [order('o1', { slaLeft: 3 })];
    const s = expireSla(s0, 4);
    expect(s.orders).toHaveLength(0);
    expect(s.rating).toBeCloseTo(3.9);
    expect(s.onTimeStreak).toBe(0);
    expect(s.combo).toBe(0);
  });
});
