import { describe, it, expect } from 'vitest';
import { createGame, setPrice } from '@shopflow/sim';
import { productPriceInfo } from './pricingView';

const g = () => { const s = createGame(1, 'electronics'); s.stage = 4; s.inventory = { phone_case: 5 }; return s; };

describe('productPriceInfo', () => {
  it('list, price, margin at mult 1 and 1.2', () => {
    const a = productPriceInfo(g(), 'phone_case');
    expect(a).toMatchObject({ list: 800, mult: 1, price: 800, marginPerUnit: 600, rival: null, aboveRival: false });
    const b = productPriceInfo(setPrice(g(), 'phone_case', 1.2), 'phone_case');
    expect(b.price).toBe(960); expect(b.marginPerUnit).toBe(760);
    expect(b.ordersPerHour!).toBeLessThan(a.ordersPerHour!);
  });
  it('null orders/hour when unstocked', () => {
    const s = g(); s.inventory = {};
    expect(productPriceInfo(s, 'phone_case').ordersPerHour).toBeNull();
  });
});
