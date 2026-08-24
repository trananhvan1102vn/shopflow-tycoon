import { describe, it, expect } from 'vitest';
import { usd, gameTime, dateStr } from './format';

describe('format', () => {
  it('usd', () => {
    expect(usd(160000)).toBe('$1,600');
    expect(usd(-4400)).toBe('-$44');
  });
  it('gameTime/dateStr', () => {
    expect(gameTime(8 * 60)).toBe('08:00');
    expect(dateStr({ day: 6, month: 1 })).toBe('Ngày 6 · Tháng 1');
  });
});
