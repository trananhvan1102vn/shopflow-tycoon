import { describe, it, expect } from 'vitest';
import { sparklinePoints, sparklineZeroY, unlocksAfterStage, unlockLabel } from './report';

describe('sparkline', () => {
  it('0 điểm → rỗng', () => {
    expect(sparklinePoints([])).toBe('');
    expect(sparklineZeroY([])).toBeNull();
  });
  it('1 điểm → đoạn ngang giữa khung', () => {
    expect(sparklinePoints([500], 100, 48, 4)).toBe('0,24 100,24');
  });
  it('mọi giá trị bằng nhau → không chia cho 0', () => {
    expect(sparklinePoints([7, 7, 7], 100, 48, 4)).toBe('0.0,24.0 50.0,24.0 100.0,24.0');
  });
  it('min xuống đáy, max lên đỉnh', () => {
    const pts = sparklinePoints([0, 100], 100, 48, 4).split(' ');
    expect(pts[0]).toBe('0.0,44.0');
    expect(pts[1]).toBe('100.0,4.0');
  });
  it('mốc 0 chỉ có khi nằm trong khoảng', () => {
    expect(sparklineZeroY([-100, 100], 48, 4)).toBe(24);
    expect(sparklineZeroY([50, 100])).toBeNull();
    expect(sparklineZeroY([-100, -50])).toBeNull();
  });
});

describe('unlocks sau khi qua màn', () => {
  it('qua màn 1 → khoe đồ của màn 2', () => {
    const u = unlocksAfterStage(1);
    expect(u).toContain('channel-mall');
    expect(u).toContain('robot');
    expect(u).toContain('grid-4x4');
    expect(u).toContain('industry-choice-2');
  });
  it('nhãn tiếng Việt, id lạ bị lọc bỏ', () => {
    expect(unlockLabel('channel-mall')).toBe('Kênh MegaMall');
    expect(unlockLabel('khong-ton-tai')).toBeUndefined();
    for (const n of [1, 2, 3, 4, 5]) {
      expect(unlocksAfterStage(n).every((id) => unlockLabel(id) !== undefined)).toBe(true);
    }
  });
  it('màn cuối không có entry kế → rỗng', () => {
    expect(unlocksAfterStage(6)).toEqual([]);
  });
});
