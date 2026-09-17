// Tua bù thời gian offline (spec A3: tối đa 8 giờ thực) bằng cách chạy tick thật.
import type { Cents, GameState, Rng } from './types.js';
import { tick } from './tick.js';
import { activeEvents } from './env.js';

export const MAX_OFFLINE_TICKS = 8 * 60 * 60; // 8 giờ thực × 1 tick/giây

export interface OfflineSummary {
  ticks: number; ordersDelivered: number; ordersCancelled: number; ordersReturned: number;
  netRevenue: Cents; daysSettled: number; feesPaid: Cents;
  eventsStarted: string[]; eventsEnded: string[]; lowStock: string[]; stageCompleted: boolean;
}

const partialRevenue = (s: GameState): Cents =>
  Object.values(s.dayRevenue).reduce((a, b) => a + b, 0) - s.dayCommission;

export function fastForward(s: GameState, ticks: number, rng: Rng): { state: GameState; summary: OfflineSummary } {
  const n = Math.max(0, Math.min(MAX_OFFLINE_TICKS, Math.floor(ticks)));
  const seen = new Set<string>(activeEvents(s.clock.month, s.clock.day).map((e: any) => e.id));
  const started = new Set<string>(), ended = new Set<string>();
  let state = s, applied = 0;
  for (; applied < n; applied++) {
    state = tick(state, 4, rng);
    const now = new Set<string>(activeEvents(state.clock.month, state.clock.day).map((e: any) => e.id));
    for (const id of now) if (!seen.has(id)) { started.add(id); seen.add(id); }
    for (const id of [...seen]) if (!now.has(id)) { ended.add(id); seen.delete(id); }
    if (state.stageComplete && !s.stageComplete) { applied++; break; }
  }
  const newReports = state.reports.slice(s.reports.length);
  const feesPaid = newReports.reduce((a, r) => a + r.rent + r.maintenance + r.channelFees, 0);
  const reportRevenue = newReports.reduce((a, r) => a + Object.values(r.revenueByChannel).reduce((x, y) => x + y, 0) - r.commission, 0);
  const netRevenue = newReports.length > 0
    ? reportRevenue + partialRevenue(state)
    : partialRevenue(state) - partialRevenue(s);
  return {
    state,
    summary: {
      ticks: applied,
      ordersDelivered: state.completedOrders - s.completedOrders,
      ordersCancelled: state.cancelledOrders - s.cancelledOrders,
      ordersReturned: state.returnedOrders - s.returnedOrders,
      netRevenue, daysSettled: newReports.length, feesPaid,
      eventsStarted: [...started], eventsEnded: [...ended],
      lowStock: Object.entries(state.inventory).filter(([, n]) => n < 10).map(([id]) => id),
      stageCompleted: state.stageComplete && !s.stageComplete,
    },
  };
}
