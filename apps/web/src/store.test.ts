import { describe, it, expect } from 'vitest';
import { usd, usdCents, gameTime, dateStr } from './format';

describe('format', () => {
  it('usd', () => {
    expect(usd(160000)).toBe('$1,600');
    expect(usd(-4400)).toBe('-$44');
  });
  it('usdCents giữ cent, bỏ .00 khi tròn đô', () => {
    expect(usdCents(4275)).toBe('$42.75');
    expect(usdCents(4000)).toBe('$40');
    expect(usdCents(240)).toBe('$2.40');
    expect(usdCents(160000)).toBe('$1,600');
    expect(usdCents(-4405)).toBe('-$44.05');
  });
  it('gameTime/dateStr', () => {
    expect(gameTime(8 * 60)).toBe('08:00');
    expect(dateStr({ day: 6, month: 1 })).toBe('Ngày 6 · Tháng 1');
  });
});
