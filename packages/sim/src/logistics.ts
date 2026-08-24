import { stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

type Equip = { type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 };
const equips = (s: GameState) =>
  s.grid.cells.filter((c): c is Equip => !!c && c.type !== 'pile');

export const packerSpeedTotal = (s: GameState) =>
  equips(s).filter((e) => e.type === 'packer')
    .reduce((a, e) => a + ST.warehouse.packer.levels[e.level - 1].speed, 0);

export const shelfCapacity = (s: GameState) =>
  equips(s).filter((e) => e.type === 'shelf')
    .reduce((a, e) => a + ST.warehouse.shelf.levels[e.level - 1].cap, 0);

/** Gọi từ settleDay: xe chạy qua đêm. */
export function advanceShipping(s: GameState): GameState {
  let unchecked = s.unchecked;
  const deliveries = s.deliveries.map((d) => {
    if (d.state !== 'shipping') return d;
    const daysLeft = d.daysLeft - 1;
    if (daysLeft <= 0) { unchecked += d.itemsTotal; return { ...d, daysLeft: 0, state: 'auditing' as const }; }
    return { ...d, daysLeft };
  });
  return { ...s, deliveries, unchecked };
}

/** Gọi mỗi tick: kiểm hàng = ΣtốcĐộBàn × 20 SP/giờ (spec B4). */
export function runAudits(s: GameState, dtGameMinutes: number): GameState {
  let budget = packerSpeedTotal(s) * ST.warehouse.auditPerPackerSpeedPerHour * (dtGameMinutes / 60);
  if (budget <= 0) return s;
  let space = shelfCapacity(s) - Object.values(s.inventory).reduce((a, b) => a + b, 0);
  if (space <= 0) return s;
  const inventory = { ...s.inventory };
  const deliveries = s.deliveries.map((d) => ({ ...d, items: { ...d.items } }));
  for (const d of deliveries) {
    if (d.state !== 'auditing') continue;
    if (budget <= 0 || space <= 0) break;
    let n = Math.min(Math.floor(budget), d.itemsTotal - d.itemsChecked, space);
    // giữ phần lẻ: cho phép kiểm dở 1 SP bằng cách tích lũy qua itemsChecked thực số
    const frac = Math.min(budget, d.itemsTotal - d.itemsChecked, space);
    n = Math.floor(d.itemsChecked + frac) - Math.floor(d.itemsChecked);
    d.itemsChecked = Math.min(d.itemsTotal, d.itemsChecked + frac);
    budget -= frac; space -= n;
    // phân bổ n SP đã kiểm vào tồn kho theo thứ tự items
    let left = n;
    for (const pid of Object.keys(d.items)) {
      const take = Math.min(d.items[pid], left);
      if (take > 0) { d.items[pid] -= take; inventory[pid] = (inventory[pid] ?? 0) + take; left -= take; }
    }
  }
  const remaining = deliveries.filter((d) => d.state !== 'auditing' || Object.values(d.items).some((v) => v > 0));
  const unchecked = remaining.filter((d) => d.state === 'auditing')
    .reduce((a, d) => a + Object.values(d.items).reduce((x, y) => x + y, 0), 0);
  return { ...s, deliveries: remaining, inventory, unchecked };
}
