import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng } from '../src/index.js';
import { buyRetail, buyBundle, expediteDelivery } from '../src/actions.js';
import { runAudits, shelfCapacity } from '../src/logistics.js';

const rng = makeRng(1);

function withShelf(s = createGame(42, 'electronics')) {
  s.grid.cells[0] = { type: 'shelf', level: 1 };
  return s;
}

describe('delivery pipeline', () => {
  it('shipping counts down at settleDay and lands as auditing', () => {
    let s = withShelf();
    s = buyBundle(s, 'electronics', 'starter', { carrierId: 'standard' }); // 1 day
    expect(s.deliveries[0].state).toBe('shipping');
    s = tick(s, 16 * 60, rng); // qua 00:00
    expect(s.deliveries[0].state).toBe('auditing');
    expect(s.unchecked).toBe(25);
  });
  it('audit shelves items at packerSpeed×20/hour', () => {
    let s = withShelf();
    s = buyRetail(s, 'phone_case', 10, { carrierId: 'standard' }); // auditing ngay
    // 1 bàn tốc độ 1.0 → 20 SP/giờ game → 10 SP sau 30 phút
    s = runAudits(s, 30);
    expect(s.inventory.phone_case).toBe(10);
    expect(s.deliveries).toHaveLength(0);
    expect(s.unchecked).toBe(0);
  });
  it('audit progresses fractionally via tick', () => {
    let s = withShelf();
    s = buyRetail(s, 'phone_case', 20, { carrierId: 'standard' });
    s = tick(s, 4, rng); // 4 phút = 1.33 SP kiểm xong ~1
    expect(s.unchecked).toBe(20 - (s.inventory.phone_case ?? 0));
    for (let i = 0; i < 20; i++) s = tick(s, 4, rng);
    // sau 84 phút: 20 SP đã kiểm hết (một phần có thể đã bán qua đơn phát sinh)
    expect(s.unchecked).toBe(0);
  });
  it('expediteDelivery: trả phần chênh Express, về sớm 1 ngày', () => {
    let s = withShelf();
    s = buyBundle(s, 'electronics', 'starter', { carrierId: 'standard' }); // 1 ngày
    const moneyBefore = s.money;
    s = expediteDelivery(s, s.deliveries[0].id);
    // chênh Express 4000 − Standard 2000 = 2000
    expect(s.money).toBe(moneyBefore - 2000);
    expect(s.deliveries[0].state).toBe('auditing'); // 1 − 1 = 0 ngày
    expect(s.unchecked).toBe(25);
    // đã là express → từ chối
    let s2 = withShelf();
    s2 = buyBundle(s2, 'electronics', 'power', { carrierId: 'express' }); // 2−1 = 1 ngày shipping
    expect(expediteDelivery(s2, s2.deliveries[0].id).lastReject).toBeTruthy();
  });
  it('shelf space caps shelving; remainder stays unchecked', () => {
    let s = withShelf();               // 1 kệ cap 100
    s.inventory = { cable: 95 };       // còn 5 chỗ
    s = buyRetail(s, 'phone_case', 10, { carrierId: 'standard' });
    s = runAudits(s, 60);
    expect(s.inventory.phone_case).toBe(5);
    expect(s.unchecked).toBe(5);
    expect(s.deliveries).toHaveLength(1); // chưa xong
  });
  it('no shelf → nothing shelves', () => {
    let s = createGame(42, 'electronics'); // không kệ
    expect(shelfCapacity(s)).toBe(0);
    s = buyRetail(s, 'phone_case', 10, { carrierId: 'standard' });
    s = runAudits(s, 120);
    expect(s.inventory.phone_case ?? 0).toBe(0);
    expect(s.unchecked).toBe(10);
  });
});
