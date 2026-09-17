import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { absDay } from '../src/suppliers.js';

describe('createGame v2 fields', () => {
  it('initialises M2a state', () => {
    const s = createGame(42, 'electronics');
    expect(s.inventoryGrades).toEqual({});
    expect(s.marketCycle).toBe('stable');
    expect(s.marketCycleDaysLeft).toBe(0);
    expect(s.cancelledOrders).toBe(0);
    expect(s.returnedOrders).toBe(0);
    expect(s.profitStreakDays).toBe(0);
    expect(s.recessionClean).toBe(true);
    expect(s.survivedRecession).toBe(false);
    expect(s.retailLotsBought).toBe(0);
    expect(s.bundleLotsBought).toBe(0);
    expect(s.tutorial).toEqual({ step: 0, done: false, rewarded: false });
    expect(s.questsDone).toEqual([]);
    expect(s.dayRefunds).toBe(0);
    expect(s.dayQuestBonus).toBe(0);
  });
  it('absDay: 12 tháng × 30 ngày', () => {
    expect(absDay({ day: 6, month: 1, year: 1 })).toBe(6);
    expect(absDay({ day: 1, month: 2, year: 1 })).toBe(31);
    expect(absDay({ day: 1, month: 1, year: 2 })).toBe(361);
  });
});
