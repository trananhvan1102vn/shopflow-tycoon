import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng, orderRate } from '../src/index.js';
import { buyUpgrade } from '../src/actions.js';
import { modifiers } from '../src/modifiers.js';
import { commissionOf, packCapacityPerSecond, expireSla } from '../src/fulfil.js';
import { calendar as CAL } from '@shopflow/data';

const rng = makeRng(1);
const atStage3 = () => { const s = createGame(42, 'electronics'); s.stage = 3; s.money = 10_000_000; return s; };

describe('modifiers', () => {
  it('neutral by default', () => {
    const m = modifiers(createGame(42, 'electronics'));
    expect(m).toEqual({ traffic: 1, retail: 1, wholesale: 1, shipping: 1, deliveryDays: 1, robotSpeed: 1,
      commissionDelta: 0, cancelPenaltyMult: 1, ratingRegenPerHour: 0 });
  });
  it('market cycle boom applies four multipliers', () => {
    const s = createGame(42, 'electronics'); s.marketCycle = 'boom';
    const boom = CAL.marketCycle.states.find((x: any) => x.id === 'boom');
    const m = modifiers(s);
    expect(m.traffic).toBe(boom.traffic); expect(m.retail).toBe(boom.retail);
    expect(m.wholesale).toBe(boom.wholesale); expect(m.shipping).toBe(boom.shipping);
  });
});

describe('buyUpgrade', () => {
  it('stage-gated, once, charges cost', () => {
    const s1 = createGame(42, 'electronics'); s1.money = 10_000_000;
    expect(buyUpgrade(s1, 'routing').lastReject).toBeTruthy();
    let s = buyUpgrade(atStage3(), 'routing');
    expect(s.lastReject).toBeNull();
    expect(s.upgrades).toEqual(['routing']);
    expect(s.money).toBe(10_000_000 - 16000);
    expect(buyUpgrade(s, 'routing').lastReject).toBeTruthy();
    expect(buyUpgrade(s, 'nope').lastReject).toBeTruthy();
  });
  it('seo_pro ×1.3 traffic through orderRate', () => {
    const s0 = atStage3(); s0.inventory = { phone_case: 5 };
    const base = orderRate(s0, 'electronics', 40, 1);
    const s = buyUpgrade(s0, 'seo_pro');
    expect(orderRate(s, 'electronics', 40, 1)).toBeCloseTo(base * 1.3);
  });
  it('negotiator −2 điểm hoa hồng, floor 0', () => {
    const s = buyUpgrade(atStage3(), 'negotiator');
    expect(commissionOf(s, 'flea')).toBeCloseTo(0.10);
  });
  it('robot_fast ×1.5 robot capacity', () => {
    const s0 = atStage3();
    s0.grid.cells[0] = { type: 'shelf', level: 1 }; s0.grid.cells[1] = { type: 'robot', level: 1 };
    const base = packCapacityPerSecond(s0);
    const s = buyUpgrade(s0, 'robot_fast');
    // bàn 1.0 không đổi; robot 0.5×1.25 (cạnh kệ) ×1.5
    expect(packCapacityPerSecond(s)).toBeCloseTo(base + 0.5 * 1.25 * 0.5);
  });
  it('cs halves cancel penalty and regenerates rating', () => {
    let s = buyUpgrade(atStage3(), 'cs');
    s.rating = 4; s.orders = [{ id: 'o1', productId: 'phone_case', industryId: 'electronics', channelId: 'flea', value: 800, slaLeft: 1, state: 'queued' }];
    s = expireSla(s, 4);
    expect(s.rating).toBeCloseTo(3.95);
    expect(s.cancelledOrders).toBe(1);
    s.orders = []; s.rating = 4;
    s = tick(s, 60, rng); // 1 giờ game → +0.01
    expect(s.rating).toBeCloseTo(4.01, 3);
  });
});
