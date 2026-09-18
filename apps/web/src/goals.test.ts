import { describe, it, expect } from 'vitest';
import { goalProgress, questProgress, QUEST_LABEL } from './goals';
import { stages as ST } from '@shopflow/data';

const g = (over: any = {}) => ({ stage: 1, money: 80000, completedOrders: 25, rating: 4.2, questsDone: [], ...over }) as any;

describe('goalProgress', () => {
  it('pct clamps to 100 and uses the current stage goal', () => {
    const p = goalProgress(g())!;
    expect(p.money.target).toBe(ST.stages[0].goal.money);
    expect(p.money.pct).toBe(50);
    expect(p.orders.pct).toBe(50);
    expect(p.rating.pct).toBe(100);
  });
  it('null when stage has no goal', () => { expect(goalProgress(g({ stage: 6 }))).toBeNull(); });
});
describe('questProgress', () => {
  it('counts done quests of the current stage and labels every id', () => {
    const q = questProgress(g({ stage: 2, questsDone: ['open_mall'] }));
    expect(q.total).toBe(4); expect(q.done).toBe(1);
    expect(q.list.find((x) => x.id === 'open_mall')!.done).toBe(true);
    for (const x of q.list) expect(QUEST_LABEL[x.id]).toBeTruthy();
    expect(questProgress(g({ stage: 3 })).list.every((x) => QUEST_LABEL[x.id])).toBe(true);
  });
});
import { overallGoalPct } from './goals';
describe('overallGoalPct', () => {
  it('is the weakest goal', () => { expect(overallGoalPct(g({ money: 80000, completedOrders: 4, rating: 4.2 }))).toBe(8); });
  it('null without a goal', () => { expect(overallGoalPct(g({ stage: 6 }))).toBeNull(); });
});
