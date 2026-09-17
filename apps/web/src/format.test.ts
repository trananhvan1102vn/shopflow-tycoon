import { describe, it, expect } from 'vitest';
import { calendar as CAL } from '@shopflow/data';
import { usd, usdCents, gameTime, dateStr, hourRanges } from './format';

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
  it('hourRanges gộp giờ liên tiếp thành khoảng', () => {
    expect(hourRanges(CAL.hourly.peakHours)).toBe('11–13h, 19–22h');
    expect(hourRanges([9])).toBe('9h');
    expect(hourRanges([22, 11, 12])).toBe('11–12h, 22h');
    expect(hourRanges([])).toBe('');
  });
});
