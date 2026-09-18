import { describe, it, expect } from 'vitest';
import { calendar as CAL } from '@shopflow/data';
import { eventEffectText, RANDOM_EVENT_NAME } from './eventText';

/** Chuỗi chính xác cho từng def hiện có trong calendar.randomEvents.defs (spec Phase 2). */
const EXPECTED: Record<string, string> = {
  flash_sale: 'Giá lẻ ×2',
  supply_crisis: 'Giá sỉ ×1.5 · giao +1 ngày',
  kol_review: 'Uy tín +0.5',
  golden_hour: 'Khách ×3',
  customs_strike: 'Nguồn xa +3 ngày',
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
