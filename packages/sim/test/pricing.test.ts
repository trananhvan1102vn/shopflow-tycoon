import { describe, it, expect } from 'vitest';
import { createGame, orderRate } from '../src/index.js';
import { setPrice } from '../src/actions.js';
import { snapPriceMult, demandMult, priceWarFor } from '../src/pricing.js';
import { rollRandomEvent } from '../src/events.js';
import { fulfilOrders } from '../src/fulfil.js';
import { stages as ST, calendar as CAL } from '@shopflow/data';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const at4 = () => { const s = createGame(42, 'electronics'); s.stage = 4; s.clock.day = 8; s.inventory = { phone_case: 10 }; s.inventoryGrades = { phone_case: { A: 0, B: 10, C: 0 } }; return s; };
const P = ST.pricing;
const defs = CAL.randomEvents.defs as any[];
const pick = (id: string) => (defs.findIndex((d) => d.id === id) + 0.5) / defs.length;

describe('setPrice', () => {
  it('stage gate, clamp, snap, delete at 1', () => {
    expect(setPrice(createGame(42, 'electronics'), 'phone_case', 1.2).lastReject).toBeTruthy();
    let s = setPrice(at4(), 'phone_case', 1.2);
    expect(s.lastReject).toBeNull(); expect(s.priceMult.phone_case).toBe(1.2);
    s = setPrice(s, 'phone_case', 9); expect(s.priceMult.phone_case).toBe(P.max);
    s = setPrice(s, 'phone_case', 0.72); expect(s.priceMult.phone_case).toBe(0.7);
    s = setPrice(s, 'phone_case', 1); expect('phone_case' in s.priceMult).toBe(false);
    expect(setPrice(at4(), 'nope', 1.1).lastReject).toBeTruthy();
    expect(setPrice(at4(), 'tshirt', 1.1).lastReject).toBeTruthy(); // ngành chưa sở hữu
  });
  it('snapPriceMult', () => {
    expect(snapPriceMult(1.234)).toBe(1.25); expect(snapPriceMult(0.5)).toBe(P.min); expect(snapPriceMult(2)).toBe(P.max);
  });
});

describe('elasticity', () => {
  it('rate scales by mult^-elasticity and value by mult', () => {
    const s0 = at4();
    const base = orderRate(s0, 'electronics', 40, 1, 'phone_case');
    const s = setPrice(s0, 'phone_case', 1.3);
    expect(orderRate(s, 'electronics', 40, 1, 'phone_case')).toBeCloseTo(base * Math.pow(1.3, -P.elasticity));
    expect(demandMult(s, 'phone_case')).toBeCloseTo(Math.pow(1.3, -P.elasticity));
    expect(orderRate(s, 'electronics', 40, 1)).toBeCloseTo(base); // industry-level estimate ignores product pricing
  });
});

describe('price war', () => {
  const warOn = () => { const s = at4(); return rollRandomEvent(s, seq(0.01, pick('price_war'), 0.0)); };
  it('penalises products priced above the rival', () => {
    const s = warOn();
    const pw = priceWarFor(s, 'electronics')!;
    expect(pw.rival).toBe(0.85);
    expect(demandMult(s, 'phone_case')).toBeCloseTo(pw.def.effects.abovePriceTrafficMult!); // mult 1 > 0.85
    const s2 = setPrice(s, 'phone_case', 0.85);
    expect(demandMult(s2, 'phone_case')).toBeCloseTo(Math.pow(0.85, -P.elasticity));
  });
  it('counts delivered orders of the industry and awards the win at expiry', () => {
    let s = warOn();
    for (const p of ['phone_case', 'cable', 'power_bank', 'earbuds', 'watch']) s = setPrice(s, p, 0.85);
    s.grid.cells[0] = { type: 'shelf', level: 1 };
    s.orders = Array.from({ length: 20 }, (_, i) => ({ id: `o${i}`, productId: 'phone_case', industryId: 'electronics', channelId: 'flea', value: 800, slaLeft: 720, state: 'queued' as const }));
    s.inventory = { phone_case: 30 }; s.inventoryGrades = { phone_case: { A: 0, B: 30, C: 0 } };
    for (let i = 0; i < 20; i++) s = fulfilOrders(s, 4, seq(0.5, 0.99)); // 1 unit/tick
    expect(s.activeRandomEvents[0].ordersDuring).toBe(20);
    s.clock.day += 3;
    s = rollRandomEvent(s, seq(0.99));
    expect(s.priceWarsWon).toBe(1);
  });
  it('lost when a product stays above the rival', () => {
    let s = warOn(); s.clock.day += 3;
    s = rollRandomEvent(s, seq(0.99));
    expect(s.priceWarsWon).toBe(0);
  });
});
