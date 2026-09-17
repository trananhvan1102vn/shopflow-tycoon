import { channels as CH, costs as CO, calendar as CAL, upgrades as UP } from '@shopflow/data';
import type { GameState, DayReport, Rng } from './types.js';
import { advanceShipping } from './logistics.js';
import { decayRelationships } from './suppliers.js';
import { checkQuests } from './quests.js'; // Task 7 creates it; until then use the stub below

/** Chu kỳ thị trường: chọn trạng thái theo trọng số p, đúng thứ tự trong data. */
export function rollMarketCycle(rng: Rng): string {
  const states = CAL.marketCycle.states as { id: string; p: number }[];
  let x = rng.next();
  for (const st of states) { x -= st.p; if (x < 0) return st.id; }
  return states[states.length - 1].id;
}

/** Kết toán 00:00 (spec B6/B7). */
export function settleDay(s: GameState, rng: Rng): GameState {
  s = decayRelationships(advanceShipping(s, rng));
  const equipment = s.grid.cells.filter((c): c is { type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 } => !!c && c.type !== 'pile');
  const rent = CO.warehouseRentPerCellPerDay * s.grid.size * s.grid.size;
  const maintenance = equipment.reduce((sum, e) => sum + CO.maintenancePerEquipmentLevelPerDay * e.level, 0);
  let channelFees = 0;
  let money = s.money - rent - maintenance;
  let recessionClean = s.recessionClean;
  const paid = s.channels.map((c) => {
    if (!c.open) return c;
    const def = CH.channels.find((d: any) => d.id === c.id)!;
    if (!def.dailyFee) return { ...c, suspended: false };
    if (money >= def.dailyFee) { money -= def.dailyFee; channelFees += def.dailyFee; return { ...c, suspended: false }; }
    if (s.marketCycle === 'recession') recessionClean = false;
    return { ...c, suspended: true }; // thiếu tiền → tạm ngưng kênh có phí
  });
  const rated = paid.map((c) => {
    const def = CH.channels.find((d: any) => d.id === c.id)!;
    if (!(def as any).minRating) return c;
    if (s.rating < (def as any).minRating) return { ...c, ratingLocked: true };
    if (c.ratingLocked && s.rating >= (def as any).minRating) return { ...c, ratingLocked: false };
    return c;
  });

  // Chu kỳ thị trường (màn 3+): đổi mỗi periodDays.
  let marketCycle = s.marketCycle, marketCycleDaysLeft = s.marketCycleDaysLeft, survivedRecession = s.survivedRecession;
  if (s.stage >= CAL.marketCycle.fromStage) {
    if (marketCycleDaysLeft <= 0) {
      const next = rollMarketCycle(rng);
      if (marketCycle === 'recession' && next !== 'recession' && recessionClean) survivedRecession = true;
      if (next === 'recession' && marketCycle !== 'recession') recessionClean = true;
      marketCycle = next; marketCycleDaysLeft = CAL.marketCycle.periodDays;
    } else marketCycleDaysLeft--;
  }

  // SEO hao hụt (màn 3+).
  let seo = s.seo;
  if (s.stage >= CO.seoDecayFromStage) {
    seo = { ...s.seo };
    for (const id of s.industries) seo[id] = Math.max(CO.seoFloor, (seo[id] ?? UP.seoStart) - CO.seoDecayPerDay);
  }

  const revenue = Object.values(s.dayRevenue).reduce((a, b) => a + b, 0);
  const report: DayReport = {
    day: s.clock.day, month: s.clock.month,
    revenueByChannel: s.dayRevenue, ordersByChannel: s.dayOrders,
    commission: s.dayCommission, channelFees, rent, maintenance,
    purchases: s.dayPurchases, other: 0, refunds: s.dayRefunds, questBonus: s.dayQuestBonus,
    net: revenue - s.dayCommission - channelFees - rent - maintenance - s.dayPurchases + s.dayQuestBonus,
  };
  const out: GameState = {
    ...s, money, channels: rated, reports: [...s.reports, report], seo,
    marketCycle, marketCycleDaysLeft, recessionClean, survivedRecession,
    profitStreakDays: report.net > 0 ? s.profitStreakDays + 1 : 0,
    dayRevenue: {}, dayOrders: {}, dayCommission: 0, dayPurchases: 0, dayRefunds: 0, dayQuestBonus: 0,
  };
  return checkQuests(out);
}
