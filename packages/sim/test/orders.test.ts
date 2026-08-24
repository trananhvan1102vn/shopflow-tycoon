import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng } from '../src/index.js';
import { genOrders } from '../src/orders.js';
import { stages as ST } from '@shopflow/data';

function stocked() {
  const s = createGame(42, 'electronics');
  s.inventory = { phone_case: 50, cable: 50 };
  return s;
}

describe('order generation', () => {
  it('creates orders only for stocked products, assigned to open channels', () => {
    const s = genOrders(stocked(), makeRng(1));
    expect(s.orders.length).toBeGreaterThan(0);
    for (const o of s.orders) {
      expect(['phone_case', 'cable']).toContain(o.productId);
      expect(o.channelId).toBe('flea');
      expect(o.slaLeft).toBe(ST.stages[0].sla);
      expect(o.state).toBe('queued');
      expect(o.value).toBeGreaterThan(0);
    }
  });
  it('no stock → no orders', () => {
    expect(genOrders(createGame(42, 'electronics'), makeRng(1)).orders).toHaveLength(0);
  });
  it('respects queue cap', () => {
    let s = stocked();
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) s = genOrders(s, rng);
    expect(s.orders.length).toBeLessThanOrEqual(ST.stages[0].queueCap);
  });
  it('tick fires generation every 40 game-minutes', () => {
    let s = stocked();
    const rng = makeRng(3);
    for (let i = 0; i < 10; i++) s = tick(s, 4, rng); // 40 min
    const after40 = s.orders.length;
    expect(after40).toBeGreaterThan(0);
    expect(s.orderGenAccum).toBeLessThan(40);
  });
  it('deterministic for same seed', () => {
    const a = genOrders(stocked(), makeRng(9));
    const b = genOrders(stocked(), makeRng(9));
    expect(a.orders).toEqual(b.orders);
  });
});
