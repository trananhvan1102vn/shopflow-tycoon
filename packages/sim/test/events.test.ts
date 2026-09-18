// packages/sim/test/events.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { rollRandomEvent, activeEventDefs } from '../src/events.js';
import { modifiers } from '../src/modifiers.js';
import { settleDay } from '../src/settleDay.js';
import { absDay } from '../src/suppliers.js';
import { calendar as CAL } from '@shopflow/data';

const seq = (...vals: number[]) => { let i = 0; return { next: () => vals[Math.min(i++, vals.length - 1)] }; };
const at4 = () => { const s = createGame(42, 'electronics'); s.stage = 4; s.clock.day = 8; s.industries = ['electronics', 'fashion']; return s; };
const defs = CAL.randomEvents.defs as any[];
const idx = (id: string) => defs.findIndex((d) => d.id === id);
/** rng value that selects def #i under equal weights */
const pick = (i: number) => (i + 0.5) / defs.length;

describe('rollRandomEvent', () => {
  it('no roll below fromStage; no start when chance fails', () => {
    const s3 = createGame(42, 'electronics'); s3.stage = 3;
    expect(rollRandomEvent(s3, seq(0.0)).activeRandomEvents).toEqual([]);
    expect(rollRandomEvent(at4(), seq(0.5)).activeRandomEvents).toEqual([]);
  });
  it('starts a weighted def with endsDay = today + days', () => {
    const s = rollRandomEvent(at4(), seq(0.01, pick(idx('flash_sale'))));
    expect(s.activeRandomEvents).toHaveLength(1);
    expect(s.activeRandomEvents[0]).toMatchObject({ id: 'flash_sale', endsDay: absDay(s.clock) + 2, ordersDuring: 0 });
  });
  it('maxActive: no second event while one is active', () => {
    let s = rollRandomEvent(at4(), seq(0.01, pick(idx('flash_sale'))));
    s = rollRandomEvent(s, seq(0.01, pick(idx('golden_hour'))));
    expect(s.activeRandomEvents).toHaveLength(1);
  });
  it('price_war targets an owned industry (third draw)', () => {
    const s = rollRandomEvent(at4(), seq(0.01, pick(idx('price_war')), 0.6));
    expect(s.activeRandomEvents[0]).toMatchObject({ id: 'price_war', industryId: 'fashion' });
  });
  it('expires at endsDay; KOL ở sát trần chỉ hoàn lại đúng phần đã cộng (4.8 → 5.0 → 4.8)', () => {
    let s = at4(); s.rating = 4.8;
    s = rollRandomEvent(s, seq(0.01, pick(idx('kol_review'))));
    expect(s.rating).toBe(5);
    expect(s.activeRandomEvents[0].ratingApplied).toBeCloseTo(0.2);
    s.clock.day += 2;
    s = rollRandomEvent(s, seq(0.99));
    expect(s.activeRandomEvents).toEqual([]);
    expect(s.rating).toBeCloseTo(4.8);
  });
  it('dưới trần thì cộng/trừ trọn delta (4.0 → 4.5 → 4.0)', () => {
    let s = at4(); s.rating = 4;
    s = rollRandomEvent(s, seq(0.01, pick(idx('kol_review'))));
    expect(s.rating).toBeCloseTo(4.5);
    expect(s.activeRandomEvents[0].ratingApplied).toBeCloseTo(0.5);
    s.clock.day += 2;
    s = rollRandomEvent(s, seq(0.99));
    expect(s.rating).toBeCloseTo(4);
  });
  it('entry v3 cũ (không có ratingApplied) vẫn hoàn lại trọn delta của def', () => {
    const s = at4(); s.rating = 4.5;
    s.activeRandomEvents = [{ id: 'kol_review', endsDay: absDay(s.clock), ordersDuring: 0 }];
    const out = rollRandomEvent(s, seq(0.99));
    expect(out.activeRandomEvents).toEqual([]);
    expect(out.rating).toBeCloseTo(4);
  });
  it('bỏ entry có id không còn def (save cũ/bị sửa) — giữ nguyên chuỗi rút RNG', () => {
    const s = at4();
    s.activeRandomEvents = [{ id: 'nope', endsDay: 9999, ordersDuring: 0 }];
    let calls = 0;
    const vals = [0.01, pick(idx('flash_sale'))];
    const rng = { next: () => vals[Math.min(calls++, vals.length - 1)] };
    const out = rollRandomEvent(s, rng);
    expect(out.activeRandomEvents.map((e) => e.id)).toEqual(['flash_sale']);
    expect(calls).toBe(2); // chance + def, không rút thêm lần nào
  });
});

describe('modifiers with events', () => {
  it('flash_sale ×2 retail; golden_hour ×3 traffic; supply_crisis ×1.5 wholesale +1 day; customs_strike +3 overseas days', () => {
    const start = (id: string) => rollRandomEvent(at4(), seq(0.01, pick(idx(id)), 0.1));
    expect(modifiers(start('flash_sale')).retail).toBe(2);
    expect(modifiers(start('golden_hour')).traffic).toBe(3);
    const sc = modifiers(start('supply_crisis'));
    expect(sc.wholesale).toBe(1.5); expect(sc.deliveryDaysDelta).toBe(1);
    expect(modifiers(start('customs_strike')).overseasDaysDelta).toBe(3);
  });
  it('crisis immunity (relationship level 5) skips supply_crisis for that supplier', () => {
    const s = rollRandomEvent(at4(), seq(0.01, pick(idx('supply_crisis'))));
    s.relationships = { overseas: { xp: 200, lastPurchaseDay: 8 } };
    expect(modifiers(s, { supplierId: 'overseas' }).wholesale).toBe(1);
    expect(modifiers(s, { supplierId: 'local' }).wholesale).toBe(1.5);
  });
  it('settleDay rolls after the market roll (draw order) and activeEventDefs lists the def', () => {
    const s0 = at4(); s0.marketCycleDaysLeft = 0; s0.clock.minute = 24 * 60;
    // draws: market (0.0 → stable), chance (0.01), def (flash_sale)
    const s = settleDay(s0, seq(0.0, 0.01, pick(idx('flash_sale'))));
    expect(activeEventDefs(s).map((x) => x.def.id)).toEqual(['flash_sale']);
  });
});
