import { describe, it, expect } from 'vitest';
import { createGame, tick, orderRate } from '../src/index.js';

const rng = { next: () => 0.5 };

describe('sim skeleton', () => {
  it('tạo game đúng spec màn 1', () => {
    const s = createGame(42, 'electronics');
    expect(s.money).toBe(100000); // $1,000
    expect(s.channels[0].id).toBe('flea');
    expect(s.grid.cells.filter(Boolean).length).toBe(1); // 1 bàn đóng gói
  });
  it('settleDay trừ thuê kho + bảo trì lúc 00:00', () => {
    let s = createGame(42, 'electronics');
    s = tick(s, 16 * 60, rng); // 08:00 -> 24:00
    // thuê 9 ô × $2 + bảo trì 1 thiết bị × $1 = $19
    expect(s.money).toBe(100000 - 1900);
    expect(s.reports.length).toBe(1);
    expect(s.clock.day).toBe(7);
  });
  it('orderRate tăng khi mở thêm kênh', () => {
    const s = createGame(42, 'electronics');
    const base = orderRate(s, 'electronics', 40, 1);
    s.channels.push({ id: 'mall', open: true, suspended: false, level: 1, ordersDelivered: 0 });
    expect(orderRate(s, 'electronics', 40, 1)).toBeGreaterThan(base * 2.5); // 1.0 + 1.5×1.3
  });
});
