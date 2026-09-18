import { channels as CH, stages as ST, suppliers as SUP, industries as IND } from '@shopflow/data';
import type { GameState, Grade, Rng } from './types.js';
import { modifiers } from './modifiers.js';

const RETURN_RATING: Record<Grade, number> = { A: 0, B: -0.02, C: -0.05 }; // spec B2: hạng B/C −0.02/−0.05

/** Chọn hạng của 1 đơn vị theo tỉ lệ tồn; mix trống/không nhất quán → B.
 * Luôn rút đúng 1 rng.next() (kể cả khi rơi vào nhánh mặc định) để số lần gọi rng
 * không phụ thuộc dữ liệu tồn kho — giữ tính xác định/replay của pipeline. */
function pickGrade(mix: { A: number; B: number; C: number } | undefined, rng: Rng): Grade {
  const total = mix ? mix.A + mix.B + mix.C : 0;
  const roll = rng.next();
  if (!mix || total <= 0) return 'B';
  let x = roll * total;
  for (const g of ['A', 'B', 'C'] as Grade[]) { x -= mix[g]; if (x < 0) return g; }
  return 'C';
}

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
  const mod = modifiers(s);
  let cap = 0;
  cells.forEach((c, i) => {
    if (!c || c.type === 'pile') return;
    const e = c as Equip;
    if (e.type === 'packer') cap += ST.warehouse.packer.levels[e.level - 1].speed;
    if (e.type === 'robot' && hasShelf) {
      const adj = neighbors(i, s.grid.size).some((j) => cells[j]?.type === 'shelf');
      cap += ST.warehouse.robot.levels[e.level - 1].speed * (adj ? 1 + ST.warehouse.robot.adjacentShelfBonus : 1) * mod.robotSpeed;
    }
  });
  return cap;
}

export const comboBonus = (streak: number): number =>
  Math.min(Math.floor(streak / ST.combo.ordersPerStep) * ST.combo.bonusPerStep, ST.combo.maxBonus);

export function commissionOf(s: GameState, channelId: string): number {
  const def = CH.channels.find((d: any) => d.id === channelId)!;
  const st = s.channels.find((c) => c.id === channelId);
  let com = def.commission;
  if (st && st.level >= 3) com += CH.levelBonus['3'].commissionDelta;
  com += modifiers(s).commissionDelta;
  return Math.max(0, com);
}

/** Đóng gói giao: capacity đơn / giây thực (dt=4 phút game = 1 giây thực). */
export function fulfilOrders(s: GameState, dtGameMinutes: number, rng: Rng): GameState {
  let accum = s.packAccum + packCapacityPerSecond(s) * (dtGameMinutes / 4);
  let n = Math.floor(accum);
  if (n <= 0) return { ...s, packAccum: accum };
  accum -= n;
  const inventory = { ...s.inventory };
  const grades = { ...s.inventoryGrades };
  const dayRevenue = { ...s.dayRevenue }, dayOrders = { ...s.dayOrders };
  let { money, rating, dayCommission, onTimeStreak, completedOrders, returnedOrders, dayRefunds } = s;
  const channels = s.channels.map((c) => ({ ...c }));
  const activeRandomEvents = s.activeRandomEvents.slice();
  const remaining = [] as typeof s.orders;
  for (const o of s.orders) {
    if (n > 0 && (inventory[o.productId] ?? 0) > 0) {
      n--;
      inventory[o.productId]--;
      const g = pickGrade(grades[o.productId], rng);
      if (grades[o.productId]) { grades[o.productId] = { ...grades[o.productId], [g]: Math.max(0, grades[o.productId][g] - 1) }; }
      const ind = (IND.industries as any[]).find((i) => i.id === o.industryId);
      const returnRate = (SUP.grades as any)[g].returnRate + (ind?.traits?.returnRateBonus ?? 0);
      const returned = rng.next() < returnRate;
      if (returned) {
        returnedOrders++; dayRefunds += o.value;
        if (g === 'A') {
          inventory[o.productId]++;
          if (grades[o.productId]) grades[o.productId] = { ...grades[o.productId], A: grades[o.productId].A + 1 };
        } else rating = Math.max(ST.rating.min, rating + RETURN_RATING[g]);
      } else {
        const revenue = Math.round(o.value * (1 + comboBonus(onTimeStreak)));
        const comAmt = Math.round(revenue * commissionOf(s, o.channelId));
        money += revenue - comAmt;
        dayRevenue[o.channelId] = (dayRevenue[o.channelId] ?? 0) + revenue;
        dayCommission += comAmt;
        rating = Math.min(ST.rating.max, rating + ST.rating.perDelivered);
      }
      dayOrders[o.channelId] = (dayOrders[o.channelId] ?? 0) + 1;
      onTimeStreak++;
      completedOrders++;
      const ch = channels.find((c) => c.id === o.channelId);
      if (ch) ch.ordersDelivered++;
      const warIdx = activeRandomEvents.findIndex((e) => e.industryId === o.industryId);
      if (warIdx >= 0) activeRandomEvents[warIdx] = { ...activeRandomEvents[warIdx], ordersDuring: activeRandomEvents[warIdx].ordersDuring + 1 };
    } else remaining.push(o);
  }
  return {
    ...s, packAccum: accum, inventory, inventoryGrades: grades, orders: remaining, money, rating,
    dayRevenue, dayOrders, dayCommission, onTimeStreak, completedOrders, returnedOrders, dayRefunds,
    channels, combo: comboBonus(onTimeStreak), bestCombo: Math.max(s.bestCombo, comboBonus(onTimeStreak)),
    activeRandomEvents,
  };
}

export function expireSla(s: GameState, dtGameMinutes: number): GameState {
  const penalty = ST.rating.perCancelled * modifiers(s).cancelPenaltyMult;
  let rating = s.rating, streak = s.onTimeStreak, expired = 0;
  const orders = s.orders.flatMap((o) => {
    const slaLeft = o.slaLeft - dtGameMinutes;
    if (slaLeft <= 0) {
      expired++;
      rating = Math.max(ST.rating.min, rating + penalty);
      streak = 0;
      return [];
    }
    return [{ ...o, slaLeft }];
  });
  if (!expired) return { ...s, orders };
  return { ...s, orders, rating, onTimeStreak: streak, combo: comboBonus(streak), cancelledOrders: s.cancelledOrders + expired };
}
