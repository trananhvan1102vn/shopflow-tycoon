// apps/web/src/goals.ts — hàm thuần cho dải mục tiêu + nhiệm vụ (test được không cần store).
import { stages as ST } from '@shopflow/data';
import { questsForStage, type GameState } from '@shopflow/sim';

const pct = (cur: number, target: number) => Math.max(0, Math.min(100, Math.round((cur / target) * 100)));

export function goalProgress(game: Pick<GameState, 'stage' | 'money' | 'completedOrders' | 'rating'>) {
  const goal = (ST.stages as any[])[game.stage - 1]?.goal;
  if (!goal) return null;
  return {
    money: { cur: game.money, target: goal.money, pct: pct(game.money, goal.money) },
    orders: { cur: game.completedOrders, target: goal.orders, pct: pct(game.completedOrders, goal.orders) },
    rating: { cur: game.rating, target: goal.rating, pct: pct(game.rating, goal.rating) },
  };
}

export const QUEST_LABEL: Record<string, string> = {
  open_mall: 'Mở kênh MegaMall',
  buy_seasonal: 'Mua một gói mùa',
  place_robot: 'Đặt robot trong kho',
  run_seo: 'Chạy chiến dịch SEO',
  relationship_3: 'Quan hệ nhà cung cấp cấp 3',
  survive_recession: 'Sống sót một kỳ Suy thoái',
  profit_5_days: 'Lãi ròng dương 5 ngày liên tiếp',
};

export function questProgress(game: Pick<GameState, 'stage' | 'questsDone'>) {
  const list = questsForStage(game.stage).map((q) => ({ ...q, done: game.questsDone.includes(q.id) }));
  return { total: list.length, done: list.filter((q) => q.done).length, list };
}

export function overallGoalPct(game: Parameters<typeof goalProgress>[0]): number | null {
  const p = goalProgress(game);
  return p ? Math.min(p.money.pct, p.orders.pct, p.rating.pct) : null;
}
