// apps/web/src/skipDay.ts — thuần; dùng chung cho worker và màn Thêm ▸ Qua ngày.
import type { GameState } from '@shopflow/sim';

const DAY = 24 * 60;      // phút game / ngày (khớp tick.ts)
const TICK = 4;           // phút game / tick (spec A3)

export function skipDayInfo(game: Pick<GameState, 'clock' | 'orders'>) {
  const minutesLeft = DAY - game.clock.minute;
  return {
    minutesLeft,
    ticks: Math.ceil(minutesLeft / TICK),
    atRisk: game.orders.filter((o) => o.slaLeft <= minutesLeft).length,
  };
}
