import { describe, it, expect } from 'vitest';
import { createGame } from '@shopflow/sim';
import { completedSteps, TUTORIAL } from './tutorial';

const ctx = (over: any = {}, visited: any[] = []) => ({ game: { ...createGame(1, 'electronics'), ...over }, visited });

describe('tutorial predicates', () => {
  it('8 steps, each with a tab', () => { expect(TUTORIAL).toHaveLength(8); expect(TUTORIAL.every((s) => s.text && s.tab)).toBe(true); });
  it('0 when nothing done; 1 after visiting Nhập', () => {
    expect(completedSteps(ctx())).toBe(0);
    expect(completedSteps(ctx({}, ['nhap']))).toBe(1);
  });
  it('steps must be consecutive: a shelf without purchases still counts 1', () => {
    const g = createGame(1, 'electronics'); g.grid.cells[0] = { type: 'shelf', level: 1 };
    expect(completedSteps(ctx(g, ['nhap']))).toBe(1);
  });
  it('full run reaches 8', () => {
    const g = createGame(1, 'electronics');
    g.retailLotsBought = 1; g.bundleLotsBought = 1;
    g.grid.cells[0] = { type: 'shelf', level: 1 }; g.grid.cells[1] = { type: 'packer', level: 1 };
    g.completedOrders = 1; g.reports = [{} as any];
    expect(completedSteps(ctx(g, ['nhap', 'ban']))).toBe(8);
    expect(completedSteps(ctx(g, ['nhap']))).toBe(5); // chưa mở tab Bán
  });
});
