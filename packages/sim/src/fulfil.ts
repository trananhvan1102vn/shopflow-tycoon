import { channels as CH, stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

type Equip = { type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 };

const neighbors = (i: number, size: number): number[] => {
  const r = Math.floor(i / size), c = i % size, out: number[] = [];
  if (r > 0) out.push(i - size);
  if (r < size - 1) out.push(i + size);
  if (c > 0) out.push(i - 1);
  if (c < size - 1) out.push(i + 1);
  return out;
};

export function packCapacityPerSecond(s: GameState): number {
  const cells = s.grid.cells;
  const hasShelf = cells.some((c) => c?.type === 'shelf');
  let cap = 0;
  cells.forEach((c, i) => {
    if (!c || c.type === 'pile') return;
    const e = c as Equip;
    if (e.type === 'packer') cap += ST.warehouse.packer.levels[e.level - 1].speed;
    if (e.type === 'robot' && hasShelf) {
      const adj = neighbors(i, s.grid.size).some((j) => cells[j]?.type === 'shelf');
      cap += ST.warehouse.robot.levels[e.level - 1].speed * (adj ? 1 + ST.warehouse.robot.adjacentShelfBonus : 1);
    }
  });
  return cap;
}

export const comboBonus = (streak: number): number =>
  Math.min(Math.floor(streak / ST.combo.ordersPerStep) * ST.combo.bonusPerStep, ST.combo.maxBonus);

export function commissionOf(s: GameState, channelId: string): number {
  const def = CH.channels.find((d) => d.id === channelId)!;
  const st = s.channels.find((c) => c.id === channelId);
  let com = def.commission;
  if (st && st.level >= 3) com += CH.levelBonus['3'].commissionDelta;
  return Math.max(0, com);
}

/** Đóng gói giao: capacity đơn / giây thực (dt=4 phút game = 1 giây thực). */
export function fulfilOrders(s: GameState, dtGameMinutes: number): GameState {
  let accum = s.packAccum + packCapacityPerSecond(s) * (dtGameMinutes / 4);
  let n = Math.floor(accum);
  if (n <= 0) return { ...s, packAccum: accum };
  accum -= n;
  const inventory = { ...s.inventory };
  const dayRevenue = { ...s.dayRevenue }, dayOrders = { ...s.dayOrders };
  let { money, rating, dayCommission, onTimeStreak, completedOrders } = s;
  const channels = s.channels.map((c) => ({ ...c }));
  const remaining = [] as typeof s.orders;
  for (const o of s.orders) {
    if (n > 0 && (inventory[o.productId] ?? 0) > 0) {
      n--;
      inventory[o.productId]--;
      const revenue = Math.round(o.value * (1 + comboBonus(onTimeStreak)));
      const comAmt = Math.round(revenue * commissionOf(s, o.channelId));
      money += revenue - comAmt;
      dayRevenue[o.channelId] = (dayRevenue[o.channelId] ?? 0) + revenue;
      dayOrders[o.channelId] = (dayOrders[o.channelId] ?? 0) + 1;
      dayCommission += comAmt;
      rating = Math.min(ST.rating.max, rating + ST.rating.perDelivered);
      onTimeStreak++;
      completedOrders++;
      const ch = channels.find((c) => c.id === o.channelId);
      if (ch) ch.ordersDelivered++;
    } else remaining.push(o);
  }
  return {
    ...s, packAccum: accum, inventory, orders: remaining, money, rating,
    dayRevenue, dayOrders, dayCommission, onTimeStreak, completedOrders,
    channels, combo: comboBonus(onTimeStreak), bestCombo: Math.max(s.bestCombo, comboBonus(onTimeStreak)),
  };
}

export function expireSla(s: GameState, dtGameMinutes: number): GameState {
  let rating = s.rating, streak = s.onTimeStreak, expired = 0;
  const orders = s.orders.flatMap((o) => {
    const slaLeft = o.slaLeft - dtGameMinutes;
    if (slaLeft <= 0) {
      expired++;
      rating = Math.max(ST.rating.min, rating + ST.rating.perCancelled);
      streak = 0;
      return [];
    }
    return [{ ...o, slaLeft }];
  });
  if (!expired) return { ...s, orders };
  return { ...s, orders, rating, onTimeStreak: streak, combo: comboBonus(streak) };
}
