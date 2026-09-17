import { stages as ST, upgrades as UP } from '@shopflow/data';
import type { GameState } from './types.js';

export function createGame(seed: number, startIndustry: string): GameState {
  const size = 3;
  const cells = Array(size * size).fill(null);
  cells[4] = { type: 'packer', level: 1 }; // bàn đóng gói có sẵn ở giữa
  return {
    seed, clock: { minute: 8 * 60, day: 6, month: 1, year: 1 },
    money: ST.startingMoney, rating: ST.rating.start, stage: 1, combo: 0, bestCombo: 0,
    industries: [startIndustry], seo: { [startIndustry]: UP.seoStart }, grid: { size, cells },
    inventory: {}, unchecked: 0, inventoryGrades: {}, orders: [], deliveries: [],
    channels: [{ id: 'flea', open: true, suspended: false, ratingLocked: false, level: 1, ordersDelivered: 0 }],
    relationships: {}, upgrades: [], marketCycle: 'stable', marketCycleDaysLeft: 0, activeEvents: [],
    reports: [], completedOrders: 0, cancelledOrders: 0, returnedOrders: 0,
    orderGenAccum: 0, packAccum: 0, orderSeq: 0, deliverySeq: 0,
    dayRevenue: {}, dayOrders: {}, dayCommission: 0, dayPurchases: 0, dayRefunds: 0, dayQuestBonus: 0,
    onTimeStreak: 0, stageComplete: false, seasonalBought: {},
    profitStreakDays: 0, recessionClean: true, survivedRecession: false,
    retailLotsBought: 0, bundleLotsBought: 0,
    tutorial: { step: 0, done: false, rewarded: false }, questsDone: [],
    lastReject: null,
  };
}
