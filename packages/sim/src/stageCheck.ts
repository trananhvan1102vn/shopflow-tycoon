import { stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

/** Đánh dấu hoàn thành màn khi đạt cả 3 mục tiêu (spec). Gọi cuối mỗi tick. */
export function checkStage(s: GameState): GameState {
  if (s.stageComplete) return s;
  const goal = ST.stages[s.stage - 1]?.goal;
  if (!goal) return s;
  if (s.money >= goal.money && s.completedOrders >= goal.orders && s.rating >= goal.rating)
    return { ...s, stageComplete: true };
  return s;
}
