// Kiểu dữ liệu lõi — spec phần B. Tiền: cent (integer). Thời gian: phút game.
export type Cents = number;
export type GameMinutes = number;

export interface Rng { next(): number } // seedable, 0..1

export interface Order {
  id: string; productId: string; industryId: string; channelId: string;
  value: Cents; slaLeft: GameMinutes; state: 'queued' | 'packing' | 'waiting_stock';
}

export interface ChannelState { id: string; open: boolean; suspended: boolean; ratingLocked: boolean; level: 1 | 2 | 3; ordersDelivered: number }

export interface Delivery {
  id: string; bundleId?: string; items: Record<string, number>; grade: 'A' | 'B' | 'C';
  supplierId: string; carrierId: string; cost: Cents;
  state: 'shipping' | 'auditing'; daysLeft: number; itemsTotal: number; itemsChecked: number;
}

export interface DayReport {
  day: number; month: number;
  revenueByChannel: Record<string, Cents>; ordersByChannel: Record<string, number>;
  commission: Cents; channelFees: Cents; rent: Cents; maintenance: Cents;
  purchases: Cents; other: Cents; net: Cents;
}

export interface GameState {
  seed: number; clock: { minute: number; day: number; month: number; year: number };
  money: Cents; rating: number; stage: number; combo: number; bestCombo: number;
  industries: string[]; seo: Record<string, number>;
  grid: { size: number; cells: ({ type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 } | { type: 'pile' } | null)[] };
  inventory: Record<string, number>; unchecked: number;
  orders: Order[]; deliveries: Delivery[]; channels: ChannelState[];
  relationships: Record<string, { xp: number; lastPurchaseDay: number }>;
  upgrades: string[]; marketCycle: string; activeEvents: string[];
  reports: DayReport[]; completedOrders: number;
  orderGenAccum: GameMinutes; packAccum: number;
  orderSeq: number; deliverySeq: number;
  dayRevenue: Record<string, Cents>; dayOrders: Record<string, number>;
  dayCommission: Cents; dayPurchases: Cents;
  onTimeStreak: number; stageComplete: boolean;
  seasonalBought: Record<string, number>;
  lastReject: string | null;
}
