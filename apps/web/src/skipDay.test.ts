import { describe, it, expect } from 'vitest';
import { skipDayInfo } from './skipDay';

const g = (minute: number, slas: number[] = []) => ({
  clock: { minute, day: 6, month: 1, year: 1 },
  orders: slas.map((slaLeft, i) => ({ id: `o${i}`, productId: 'p', industryId: 'e', channelId: 'flea', value: 1, slaLeft, state: 'queued' as const })),
});

describe('skipDayInfo', () => {
  it('ticks to midnight, rounded up', () => {
    expect(skipDayInfo(g(8 * 60))).toMatchObject({ minutesLeft: 960, ticks: 240 });
    expect(skipDayInfo(g(1439))).toMatchObject({ minutesLeft: 1, ticks: 1 });
    expect(skipDayInfo(g(0))).toMatchObject({ minutesLeft: 1440, ticks: 360 });
  });
  it('counts orders that expire before midnight', () => {
    expect(skipDayInfo(g(20 * 60, [100, 240, 241, 1000])).atRisk).toBe(2);
  });
});
