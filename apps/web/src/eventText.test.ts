import { describe, it, expect } from 'vitest';
import { calendar as CAL } from '@shopflow/data';
import { absDay } from '@shopflow/sim';
import { diffEventKeys, eventDaysLeft, eventEffectText, RANDOM_EVENT_NAME } from './eventText';

/** Chuỗi chính xác cho từng def hiện có trong calendar.randomEvents.defs (spec Phase 2). */
const EXPECTED: Record<string, string> = {
  flash_sale: 'Giá lẻ ×2',
  supply_crisis: 'Giá sỉ ×1.5 · lô đặt mới giao +1 ngày',
  kol_review: 'Uy tín +0.5',
  golden_hour: 'Khách ×3',
  customs_strike: 'Nguồn xa: lô đặt mới +3 ngày',
  price_war: 'Đối thủ bán ×0.85 · khách ×0.5 nếu đắt hơn',
};

describe('eventEffectText', () => {
  const defs = CAL.randomEvents.defs as any[];

  it('covers all six random-event defs from data', () => {
    expect(defs.map((d) => d.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const def of defs) {
    it(`${def.id} → "${EXPECTED[def.id]}"`, () => {
      expect(eventEffectText(def)).toBe(EXPECTED[def.id]);
    });
  }
});

describe('RANDOM_EVENT_NAME', () => {
  it('returns the Vietnamese/display name from data for a known id', () => {
    expect(RANDOM_EVENT_NAME('price_war')).toBe('Chiến giá');
    expect(RANDOM_EVENT_NAME('kol_review')).toBe('KOL Review');
  });
  it('falls back to the raw id when unknown', () => {
    expect(RANDOM_EVENT_NAME('nope')).toBe('nope');
  });
});

describe('eventDaysLeft', () => {
  const clock = (day: number) => ({ minute: 0, day, month: 1, year: 1 });
  // Sự kiện khởi động trong lần settle đóng ngày D có endsDay = D + days và sống các ngày D+1…D+days.
  const startedOnDay8 = (days: number) => ({ endsDay: absDay(clock(8)) + days });

  it('ngày sống CUỐI CÙNG là "Còn 1 ngày" (không phải 0)', () => {
    expect(eventDaysLeft(startedOnDay8(3), clock(11))).toBe(1);
  });
  it('ngày đầu tiên sống của sự kiện 3 ngày là "Còn 3 ngày"', () => {
    expect(eventDaysLeft(startedOnDay8(3), clock(9))).toBe(3);
  });
  it('sự kiện 1 ngày chỉ sống đúng ngày hôm sau và hiện "Còn 1 ngày"', () => {
    expect(eventDaysLeft(startedOnDay8(1), clock(9))).toBe(1);
  });
});

describe('diffEventKeys', () => {
  it('reports no change when the key sets are identical', () => {
    expect(diffEventKeys(['flash_sale@10'], ['flash_sale@10'])).toEqual({ started: [], ended: [] });
  });
  it('reports a new key as started', () => {
    expect(diffEventKeys([], ['flash_sale@10'])).toEqual({ started: ['flash_sale@10'], ended: [] });
  });
  it('reports a removed key as ended', () => {
    expect(diffEventKeys(['flash_sale@10'], [])).toEqual({ started: [], ended: ['flash_sale@10'] });
  });
  it('same-id restart in one update (new endsDay) yields one ended and one started', () => {
    expect(diffEventKeys(['price_war@365'], ['price_war@368'])).toEqual({
      started: ['price_war@368'],
      ended: ['price_war@365'],
    });
  });
});
