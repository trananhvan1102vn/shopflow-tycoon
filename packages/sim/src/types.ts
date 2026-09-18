// Kiểu dữ liệu lõi — spec phần B. Tiền: cent (integer). Thời gian: phút game.
export type Cents = number;
export type GameMinutes = number;

export interface Rng { next(): number } // seedable, 0..1

export interface Order {
  id: string; productId: string; industryId: string; channelId: string;
  value: Cents; slaLeft: GameMinutes; state: 'queued' | 'packing' | 'waiting_stock';
}

export interface ChannelState { id: string; open: boolean; suspended: boolean; ratingLocked: boolean; level: 1 | 2 | 3; ordersDelivered: number }

export type Grade = 'A' | 'B' | 'C';

export interface Delivery {
  id: string; bundleId?: string; items: Record<string, number>; grade: Grade;
  supplierId: string; carrierId: string; cost: Cents;
  state: 'shipping' | 'auditing'; daysLeft: number; itemsTotal: number; itemsChecked: number;
  riskResolved: boolean; risk?: 'delay' | 'customs' | 'loss';
}

export interface DayReport {
  day: number; month: number;
  revenueByChannel: Record<string, Cents>; ordersByChannel: Record<string, number>;
  commission: Cents; channelFees: Cents; rent: Cents; maintenance: Cents;
  purchases: Cents; other: Cents; refunds: Cents; questBonus: Cents; net: Cents;
}

export interface TutorialState { step: number; done: boolean; rewarded: boolean }

/** `ratingApplied`: phần uy tín THỰC SỰ được cộng lúc bắt đầu (sau khi kẹp trần/sàn) — hook kết
 *  thúc hoàn lại đúng bằng nó. Tuỳ chọn để save v3 cũ (chưa có trường này) vẫn đọc được. */
export interface ActiveRandomEvent { id: string; endsDay: number; industryId?: string; ordersDuring: number; ratingApplied?: number }

export interface GameState {
  seed: number; clock: { minute: number; day: number; month: number; year: number };
  money: Cents; rating: number; stage: number; combo: number; bestCombo: number;
  industries: string[]; seo: Record<string, number>;
  grid: { size: number; cells: ({ type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 } | { type: 'pile' } | null)[] };
  inventory: Record<string, number>; unchecked: number;
  inventoryGrades: Record<string, { A: number; B: number; C: number }>;
  orders: Order[]; deliveries: Delivery[]; channels: ChannelState[];
  relationships: Record<string, { xp: number; lastPurchaseDay: number }>;
  upgrades: string[]; marketCycle: string; marketCycleDaysLeft: number; activeEvents: string[];
  reports: DayReport[]; completedOrders: number; cancelledOrders: number; returnedOrders: number;
  orderGenAccum: GameMinutes; packAccum: number;
  orderSeq: number; deliverySeq: number;
  dayRevenue: Record<string, Cents>; dayOrders: Record<string, number>;
  dayCommission: Cents; dayPurchases: Cents; dayRefunds: Cents; dayQuestBonus: Cents;
  onTimeStreak: number; stageComplete: boolean;
  seasonalBought: Record<string, number>;
  profitStreakDays: number; recessionClean: boolean; survivedRecession: boolean;
  retailLotsBought: number; bundleLotsBought: number;
  tutorial: TutorialState; questsDone: string[];
  activeRandomEvents: ActiveRandomEvent[]; priceMult: Record<string, number>; priceWarsWon: number;
  lastReject: string | null;
}
