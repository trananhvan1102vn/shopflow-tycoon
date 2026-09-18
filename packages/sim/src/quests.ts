// Nhiệm vụ màn (checklist spec B9) — "mềm": thưởng tiền, không chặn qua màn.
import { stages as ST, upgrades as UP } from '@shopflow/data';
import type { GameState } from './types.js';
import { relationshipLevel } from './suppliers.js';

export interface QuestDef { id: string; bonus: number; threshold?: number }

export const questsForStage = (stage: number): QuestDef[] => ((ST as any).quests?.[String(stage)] ?? []) as QuestDef[];
export const questDone = (s: GameState, id: string): boolean => s.questsDone.includes(id);

const PREDICATES: Record<string, (s: GameState, q: QuestDef) => boolean> = {
  open_mall: (s) => s.channels.some((c) => c.id === 'mall'),
  buy_seasonal: (s) => Object.values(s.seasonalBought).some((n) => n > 0),
  place_robot: (s) => s.grid.cells.some((c) => c?.type === 'robot'),
  run_seo: (s) => Object.values(s.seo).some((v) => v > UP.seoStart),
  relationship_3: (s) => Object.keys(s.relationships).some((id) => relationshipLevel(s, id) >= 2), // index 2 = "cấp 3" trong spec (cấp 1 = 0 XP)
  survive_recession: (s) => s.survivedRecession,
  profit_5_days: (s) => s.profitStreakDays >= 5,
  web_100_orders: (s, q) => (s.channels.find((c) => c.id === 'website')?.ordersDelivered ?? 0) >= (q.threshold ?? 100),
  win_price_war: (s) => s.priceWarsWon >= 1,
};

/** Mọi id nhiệm vụ có predicate — dùng để đối chiếu với `stages.quests` trong test. */
export const QUEST_PREDICATE_IDS: string[] = Object.keys(PREDICATES);

/** Trả thưởng cho mọi nhiệm vụ của màn hiện tại vừa đạt; mỗi nhiệm vụ chỉ một lần. */
export function checkQuests(s: GameState): GameState {
  let out = s;
  for (const q of questsForStage(s.stage)) {
    if (out.questsDone.includes(q.id)) continue;
    const pred = PREDICATES[q.id];
    if (!pred || !pred(out, q)) continue;
    out = { ...out, money: out.money + q.bonus, dayQuestBonus: out.dayQuestBonus + q.bonus, questsDone: [...out.questsDone, q.id] };
  }
  return out;
}
