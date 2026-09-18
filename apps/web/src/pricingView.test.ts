import { describe, it, expect } from 'vitest';
import { absDay, createGame, setPrice } from '@shopflow/sim';
import { productPriceInfo } from './pricingView';

const g = () => { const s = createGame(1, 'electronics'); s.stage = 4; s.inventory = { phone_case: 5 }; return s; };

describe('productPriceInfo', () => {
  it('list, price, margin at mult 1 and 1.2', () => {
    const a = productPriceInfo(g(), 'phone_case');
    expect(a).toMatchObject({ list: 800, mult: 1, price: 800, marginPerUnit: 600, rival: null, rivalPrice: null, aboveRival: false });
    const b = productPriceInfo(setPrice(g(), 'phone_case', 1.2), 'phone_case');
    expect(b.price).toBe(960); expect(b.marginPerUnit).toBe(760);
    expect(b.ordersPerHour!).toBeLessThan(a.ordersPerHour!);
  });
  it('null orders/hour when unstocked', () => {
    const s = g(); s.inventory = {};
    expect(productPriceInfo(s, 'phone_case').ordersPerHour).toBeNull();
  });
  it('price war: rival dollar figure, and aboveRival flips once matched', () => {
    const s = g();
    s.activeRandomEvents = [{ id: 'price_war', endsDay: absDay(s.clock) + 3, industryId: 'electronics', ordersDuring: 0 }];
    const a = productPriceInfo(s, 'phone_case');
    expect(a.rival).toBe(0.85);
    expect(a.rivalPrice).toBe(680);
    expect(a.aboveRival).toBe(true);
    const b = productPriceInfo(setPrice(s, 'phone_case', 0.85), 'phone_case');
    expect(b.aboveRival).toBe(false);
  });
});
