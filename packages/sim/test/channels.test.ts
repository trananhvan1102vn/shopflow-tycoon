import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng, orderRate } from '../src/index.js';
import { openChannel, upgradeChannel, setChannelOpen } from '../src/actions.js';
import { channelWeights } from '../src/formulas.js';
import { channels as CH, stages as ST } from '@shopflow/data';

const rng = makeRng(1);
const atStage2 = () => { const s = createGame(42, 'electronics'); s.stage = 2; return s; };
const OPEN_MALL = ST.quests['2'].find((q: any) => q.id === 'open_mall').bonus;

describe('channels', () => {
  it('mall locked at stage 1, opens at stage 2 for $200', () => {
    expect(openChannel(createGame(42, 'electronics'), 'mall').lastReject).toBeTruthy();
    const s = openChannel(atStage2(), 'mall');
    expect(s.lastReject).toBeNull();
    expect(s.money).toBe(100000 - 20000 + OPEN_MALL);
    expect(s.channels.map(c => c.id)).toContain('mall');
  });
  it('upgrade: level 2 = openCost×2', () => {
    let s = openChannel(atStage2(), 'mall');
    s = upgradeChannel(s, 'mall');
    expect(s.channels.find(c => c.id === 'mall')!.level).toBe(2);
    expect(s.money).toBe(100000 - 20000 - 40000 + OPEN_MALL);
  });
  it('flea upgrade dùng upgradeCostBase (không miễn phí dù openCost 0)', () => {
    let s = createGame(42, 'electronics');
    s = upgradeChannel(s, 'flea');
    expect(s.channels.find(c => c.id === 'flea')!.level).toBe(2);
    expect(s.money).toBe(100000 - 5000); // cấp 2 = 2500×2
    s = upgradeChannel(s, 'flea');
    expect(s.money).toBe(100000 - 5000 - 10000); // cấp 3 = 2500×4
    s.money = 0;
    expect(upgradeChannel({ ...s, channels: s.channels.map(c => ({ ...c, level: 1 as const })) }, 'flea').lastReject).toBeTruthy();
  });
  it('channelWeights áp levelBonus giống orderRate (mall L3 nặng hơn L1 đúng kMult)', () => {
    const s1 = openChannel(atStage2(), 'mall');
    let s3 = upgradeChannel({ ...s1, money: 1_000_000 }, 'mall');
    s3 = upgradeChannel(s3, 'mall');
    expect(s3.channels.find(c => c.id === 'mall')!.level).toBe(3);
    const w = (s: typeof s1) => Object.fromEntries(channelWeights(s, 'electronics'));
    const kMult = CH.levelBonus['2'].kMult * CH.levelBonus['3'].kMult;
    expect(w(s3).mall).toBeCloseTo(w(s1).mall * kMult);
    expect(w(s3).flea).toBeCloseTo(w(s1).flea); // kênh không nâng cấp không đổi
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

describe('SocialShop peak ×3 (per-channel hour multiplier)', () => {
  it('at 12:00 social weight is 3× its base K×A, flea is 2×', () => {
    const s = createGame(42, 'fashion'); s.stage = 3; s.money = 10_000_000;
    const s2 = openChannel(s, 'social');
    const w = (minute: number) => Object.fromEntries(channelWeights({ ...s2, clock: { ...s2.clock, minute } }, 'fashion'));
    const day = w(9 * 60), noon = w(12 * 60);
    expect(noon.social / day.social).toBeCloseTo(3);
    expect(noon.flea / day.flea).toBeCloseTo(2);
  });
});
