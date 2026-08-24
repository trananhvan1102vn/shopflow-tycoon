import { stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

export function createGame(seed: number, startIndustry: string): GameState {
  const size = 3;
  const cells = Array(size * size).fill(null);
  cells[4] = { type: 'packer', level: 1 }; // bàn đóng gói có sẵn ở giữa
  return {
    seed, clock: { minute: 8 * 60, day: 6, month: 1, year: 1 },
    money: ST.startingMoney, rating: ST.rating.start, stage: 1, combo: 0, bestCombo: 0,
    industries: [startIndustry], seo: {}, grid: { size, cells },
    inventory: {}, unchecked: 0, orders: [], deliveries: [],
    channels: [{ id: 'flea', open: true, suspended: false, level: 1, ordersDelivered: 0 }],
    relationships: {}, upgrades: [], marketCycle: 'stable', activeEvents: [],
    reports: [], completedOrders: 0,
  };
}
