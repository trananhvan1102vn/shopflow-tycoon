import { channels as CH, costs as CO } from '@shopflow/data';
import type { GameState, DayReport } from './types.js';
import { advanceShipping } from './logistics.js';

/** Kết toán 00:00 (spec B6). TODO M1: cộng revenue/commission tích lũy trong ngày. */
export function settleDay(s: GameState): GameState {
  s = advanceShipping(s);
  const equipment = s.grid.cells.filter((c): c is { type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 } => !!c && c.type !== 'pile');
  const rent = CO.warehouseRentPerCellPerDay * s.grid.size * s.grid.size;
  const maintenance = equipment.reduce((sum, e) => sum + CO.maintenancePerEquipmentLevelPerDay * e.level, 0);
  let channelFees = 0;
  const channels = s.channels.map((c) => {
    if (!c.open) return c;
    const def = CH.channels.find((d) => d.id === c.id)!;
    return { ...c, suspended: false, fee: def.dailyFee } as typeof c & { fee: number };
  });
  let money = s.money - rent - maintenance;
  const paid = channels.map((c: any) => {
    if (!c.open || !c.fee) return c;
    if (money >= c.fee) { money -= c.fee; channelFees += c.fee; return c; }
    return { ...c, suspended: true }; // thiếu tiền → tạm ngưng kênh có phí
  });
  const rated = paid.map((c: any) => {
    const def = CH.channels.find((d) => d.id === c.id)!;
    if (!(def as any).minRating) return c;
    if (s.rating < (def as any).minRating) return { ...c, ratingLocked: true };
    if (c.ratingLocked && s.rating >= (def as any).minRating) return { ...c, ratingLocked: false };
    return c;
  });
  const report: DayReport = {
    day: s.clock.day, month: s.clock.month,
    revenueByChannel: {}, ordersByChannel: {}, commission: 0,
    channelFees, rent, maintenance, purchases: 0, other: 0,
    net: -(rent + maintenance + channelFees),
  };
  return { ...s, money, channels: rated.map(({ fee, ...c }: any) => c), reports: [...s.reports, report] };
}
