import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { checkQuests, questsForStage, questDone, QUEST_PREDICATE_IDS } from '../src/quests.js';
import { openChannel, buySeo, placeEquipment, advanceStage } from '../src/actions.js';
import { stages as ST } from '@shopflow/data';

const at = (stage: number) => { const s = createGame(42, 'electronics'); s.stage = stage; s.money = 10_000_000; return s; };

describe('quests', () => {
  it('data: stage 2 has 4, stage 3 has 3, stage 1 none', () => {
    expect(questsForStage(1)).toEqual([]);
    expect(questsForStage(2).map((q) => q.id)).toEqual(['open_mall', 'buy_seasonal', 'place_robot', 'run_seo']);
    expect(questsForStage(3)).toHaveLength(3);
  });
  it('open_mall pays once via action ok()', () => {
    let s = openChannel(at(2), 'mall');
    const bonus = ST.quests['2'][0].bonus;
    expect(questDone(s, 'open_mall')).toBe(true);
    expect(s.money).toBe(10_000_000 - 20000 + bonus);
    expect(s.dayQuestBonus).toBe(bonus);
    s = checkQuests(s);
    expect(s.money).toBe(10_000_000 - 20000 + bonus); // không trả lần 2
  });
  it('only current-stage quests are evaluated', () => {
    const s = openChannel(at(3), 'mall');
    expect(questDone(s, 'open_mall')).toBe(false);
  });
  it('place_robot, run_seo', () => {
    let s = at(2);
    s = placeEquipment(s, 0, 'robot'); expect(questDone(s, 'place_robot')).toBe(true);
    s = buySeo(s, 'electronics'); expect(questDone(s, 'run_seo')).toBe(true);
  });
  it('stage 3 predicates: relationship_3, survive_recession, profit_5_days', () => {
    const s = at(3);
    s.relationships = { local: { xp: 30, lastPurchaseDay: 6 } };
    s.survivedRecession = true; s.profitStreakDays = 5;
    const out = checkQuests(s);
    expect(out.questsDone.sort()).toEqual(['profit_5_days', 'relationship_3', 'survive_recession']);
    const bonus3 = ST.quests['3'][0].bonus;
    expect(out.money).toBe(10_000_000 + 3 * bonus3);
  });
  it('buy_seasonal', () => {
    const s = at(2); s.seasonalBought = { valentine_gift: 1 };
    expect(questDone(checkQuests(s), 'buy_seasonal')).toBe(true);
  });
  it('every quest id in data has a predicate', () => {
    const ids = Object.entries((ST as any).quests as Record<string, { id: string }[]>)
      .flatMap(([, qs]) => qs.map((q) => q.id));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(QUEST_PREDICATE_IDS, `nhiệm vụ "${id}" thiếu predicate`).toContain(id);
  });
  it('advanceStage resets profitStreakDays so profit_5_days cannot pay out instantly', () => {
    const s = at(2);
    s.stageComplete = true; s.profitStreakDays = 9;
    const out = advanceStage(s);
    expect(out.stage).toBe(3);
    expect(out.profitStreakDays).toBe(0);
    expect(questDone(out, 'profit_5_days')).toBe(false);
  });
});
