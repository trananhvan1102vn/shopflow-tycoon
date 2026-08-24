import { describe, it, expect } from 'vitest';
import { createGame } from '../src/index.js';
import { placeEquipment, upgradeEquipment, removeEquipment, expandGrid } from '../src/actions.js';

describe('warehouse actions', () => {
  it('places a shelf for $40', () => {
    const s = placeEquipment(createGame(42, 'electronics'), 0, 'shelf');
    expect(s.money).toBe(100000 - 4000);
    expect(s.grid.cells[0]).toEqual({ type: 'shelf', level: 1 });
    expect(s.lastReject).toBeNull();
  });
  it('rejects occupied cell (packer có sẵn ở ô 4)', () => {
    expect(placeEquipment(createGame(42, 'electronics'), 4, 'shelf').lastReject).toBeTruthy();
  });
  it('robot locked at stage 1', () => {
    expect(placeEquipment(createGame(42, 'electronics'), 0, 'robot').lastReject).toBeTruthy();
    const s2 = createGame(42, 'electronics'); s2.stage = 2;
    expect(placeEquipment(s2, 0, 'robot').lastReject).toBeNull();
  });
  it('equipment upgrades are stage-3 locked in M1', () => {
    expect(upgradeEquipment(createGame(42, 'electronics'), 4).lastReject).toBeTruthy();
  });
  it('remove costs $10 and frees the cell', () => {
    let s = placeEquipment(createGame(42, 'electronics'), 0, 'shelf');
    s = removeEquipment(s, 0);
    expect(s.grid.cells[0]).toBeNull();
    expect(s.money).toBe(100000 - 4000 - 1000);
  });
  it('cannot remove a shelf holding needed stock', () => {
    let s = placeEquipment(createGame(42, 'electronics'), 0, 'shelf');
    s.inventory = { phone_case: 50 };
    expect(removeEquipment(s, 0).lastReject).toBeTruthy();
  });
  it('expandGrid: stage 2 → 4×4 for $400, cells preserved row-major', () => {
    const s0 = createGame(42, 'electronics'); s0.stage = 2;
    const s = expandGrid(s0);
    expect(s.grid.size).toBe(4);
    expect(s.money).toBe(100000 - 40000);
    expect(s.grid.cells).toHaveLength(16);
    expect(s.grid.cells[1 * 4 + 1]).toEqual({ type: 'packer', level: 1 }); // ô (1,1) cũ
    expect(expandGrid(createGame(42, 'electronics')).lastReject).toBeTruthy(); // stage 1
  });
});
