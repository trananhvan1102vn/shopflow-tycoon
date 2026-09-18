import { describe, it, expect } from 'vitest';
import { elapsedText } from './offline';
import { MAX_OFFLINE_TICKS } from '@shopflow/sim';

describe('elapsedText', () => {
  it('formats ticks (1 tick = 1 giây thực)', () => {
    expect(elapsedText(90)).toBe('1 phút');
    expect(elapsedText(3900)).toBe('1 giờ 05 phút');
    expect(elapsedText(MAX_OFFLINE_TICKS)).toBe('8 giờ (tối đa)');
  });
});
