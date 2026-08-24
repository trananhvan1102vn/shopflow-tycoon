import { describe, it, expect } from 'vitest';
import { trafficEnvMult, retailEnvMult, wholesaleEnvMult, hourMult, activeEvents } from '../src/env.js';

const at = (month: number, day: number, minute = 9 * 60) => ({ minute, day, month });

describe('env multipliers', () => {
  it('weekday off-peak = 1', () => {
    expect(trafficEnvMult(at(1, 8), 'electronics')).toBe(1);
    expect(retailEnvMult(at(1, 8), 'electronics')).toBe(1);
  });
  it('weekend: traffic ×1.3, retail ×1.05, wholesale ×0.95', () => {
    expect(trafficEnvMult(at(1, 6), 'electronics')).toBeCloseTo(1.3);
    expect(retailEnvMult(at(1, 6), 'electronics')).toBeCloseTo(1.05);
    expect(wholesaleEnvMult(at(1, 6), 'electronics')).toBeCloseTo(0.95);
  });
  it('peak hour ×2, night ×0.5', () => {
    expect(hourMult(12 * 60)).toBe(2);
    expect(hourMult(3 * 60)).toBe(0.5);
    expect(hourMult(9 * 60)).toBe(1);
  });
  it('Valentine hits fashion only', () => {
    expect(activeEvents(2, 14).map(e => e.id)).toContain('valentine');
    expect(trafficEnvMult(at(2, 16), 'fashion')).toBe(1);           // after window
    expect(trafficEnvMult(at(2, 15), 'fashion')).toBeCloseTo(2.5);  // weekday, in window
    expect(trafficEnvMult(at(2, 15), 'electronics')).toBe(1);
    expect(retailEnvMult(at(2, 15), 'fashion')).toBeCloseTo(1.5);
  });
  it('double day (day === month): traffic ×3, retail ×2', () => {
    expect(trafficEnvMult(at(3, 3), 'electronics')).toBeCloseTo(3);
    expect(retailEnvMult(at(3, 3), 'electronics')).toBeCloseTo(2);
  });
});
