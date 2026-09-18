import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { buyRetail } from '../src/actions.js';
import { runAudits } from '../src/logistics.js';
import { fulfilOrders } from '../src/fulfil.js';
import type { Order } from '../src/types.js';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const order = (id: string): Order => ({ id, productId: 'phone_case', industryId: 'electronics', channelId: 'flea', value: 800, slaLeft: 1440, state: 'queued' });

function stocked(grade: 'A' | 'B' | 'C') {
  const s = createGame(42, 'electronics'); s.stage = 2; s.money = 1_000_000;
  s.grid.cells[0] = { type: 'shelf', level: 1 };
  s.inventory = { phone_case: 10 };
  s.inventoryGrades = { phone_case: { A: 0, B: 0, C: 0, [grade]: 10 } as any };
  s.orders = [order('o1')];
  return s;
}

describe('grade mix from audits', () => {
  it('runAudits records checked units under the lot grade', () => {
    let s = createGame(42, 'electronics'); s.stage = 2; s.grid.cells[0] = { type: 'shelf', level: 1 };
    s = buyRetail(s, 'phone_case', 10, { carrierId: 'standard', grade: 'A' });
    s = runAudits(s, 30); // 1 bàn: 20 SP/giờ → 10 SP sau 30 phút
    expect(s.inventory.phone_case).toBe(10);
    expect(s.inventoryGrades.phone_case).toEqual({ A: 10, B: 0, C: 0 });
  });
});

describe('returns at delivery', () => {
  // Điện tử: returnRateBonus 0.03 ⇒ A 4%, B 7%, C 13%.
  it('no return: revenue credited, grade decremented', () => {
    const s = fulfilOrders(stocked('B'), 4, seq(0.5, 0.99));
    expect(s.money).toBe(1_000_000 + 704);
    expect(s.inventoryGrades.phone_case).toEqual({ A: 0, B: 9, C: 0 });
    expect(s.returnedOrders).toBe(0);
  });
  it('grade B return: refund, unit destroyed, rating −0.02, still counts delivered', () => {
    const s = fulfilOrders(stocked('B'), 4, seq(0.5, 0.01));
    expect(s.money).toBe(1_000_000);
    expect(s.dayRevenue.flea ?? 0).toBe(0);
    expect(s.dayCommission).toBe(0);
    expect(s.dayRefunds).toBe(800);
    expect(s.inventory.phone_case).toBe(9);
    expect(s.rating).toBeCloseTo(3.98);
    expect(s.returnedOrders).toBe(1);
    expect(s.completedOrders).toBe(1);
    expect(s.channels[0].ordersDelivered).toBe(1);
    expect(s.orders).toHaveLength(0);
  });
  it('grade C return: rating −0.05', () => {
    expect(fulfilOrders(stocked('C'), 4, seq(0.5, 0.01)).rating).toBeCloseTo(3.95);
  });
  it('grade A return: unit back on shelf, no rating hit', () => {
    const s = fulfilOrders(stocked('A'), 4, seq(0.5, 0.01));
    expect(s.inventory.phone_case).toBe(10);
    expect(s.inventoryGrades.phone_case.A).toBe(10);
    expect(s.rating).toBe(4);
  });
  it('empty mix falls back to grade B', () => {
    const s0 = stocked('B'); s0.inventoryGrades = {};
    const s = fulfilOrders(s0, 4, seq(0.5, 0.01));
    expect(s.rating).toBeCloseTo(3.98);
  });
});
