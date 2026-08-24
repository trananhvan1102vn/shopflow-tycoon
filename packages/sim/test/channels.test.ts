import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng, orderRate } from '../src/index.js';
import { openChannel, upgradeChannel, setChannelOpen } from '../src/actions.js';

const rng = makeRng(1);
const atStage2 = () => { const s = createGame(42, 'electronics'); s.stage = 2; return s; };

describe('channels', () => {
  it('mall locked at stage 1, opens at stage 2 for $200', () => {
    expect(openChannel(createGame(42, 'electronics'), 'mall').lastReject).toBeTruthy();
    const s = openChannel(atStage2(), 'mall');
    expect(s.lastReject).toBeNull();
    expect(s.money).toBe(100000 - 20000);
    expect(s.channels.map(c => c.id)).toContain('mall');
  });
  it('upgrade: level 2 = openCost×2', () => {
    let s = openChannel(atStage2(), 'mall');
    s = upgradeChannel(s, 'mall');
    expect(s.channels.find(c => c.id === 'mall')!.level).toBe(2);
    expect(s.money).toBe(100000 - 20000 - 40000);
  });
  it('tạm đóng removes channel from order rate', () => {
    let s = openChannel(atStage2(), 'mall');
    const before = orderRate(s, 'electronics', 40, 1);
    s = setChannelOpen(s, 'mall', false);
    expect(orderRate(s, 'electronics', 40, 1)).toBeLessThan(before);
  });
  it('mall rating-locks at settleDay when rating < 3.5, unlocks when recovered', () => {
    let s = openChannel(atStage2(), 'mall');
    s.rating = 3.0;
    s = tick(s, 16 * 60, rng); // qua 00:00
    expect(s.channels.find(c => c.id === 'mall')!.ratingLocked).toBe(true);
    // mall bị khóa → không đóng góp vào tốc độ đơn
    const fleaOnly = { ...s, channels: s.channels.filter(c => c.id === 'flea') };
    expect(orderRate(s, 'electronics', 40, 1)).toBeCloseTo(orderRate(fleaOnly as any, 'electronics', 40, 1));
    s.rating = 3.8;
    s = tick(s, 24 * 60, rng); // thêm 1 ngày
    expect(s.channels.find(c => c.id === 'mall')!.ratingLocked).toBe(false);
  });
});
