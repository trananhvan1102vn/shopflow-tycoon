import { stages as ST, suppliers as SUP } from '@shopflow/data';
import type { GameState, Delivery, Rng } from './types.js';

type Equip = { type: 'shelf' | 'packer' | 'robot'; level: 1 | 2 | 3 };
const equips = (s: GameState) =>
  s.grid.cells.filter((c): c is Equip => !!c && c.type !== 'pile');

export const packerSpeedTotal = (s: GameState) =>
  equips(s).filter((e) => e.type === 'packer')
    .reduce((a, e) => a + ST.warehouse.packer.levels[e.level - 1].speed, 0);

export const shelfCapacity = (s: GameState) =>
  equips(s).filter((e) => e.type === 'shelf')
    .reduce((a, e) => a + ST.warehouse.shelf.levels[e.level - 1].cap, 0);

/** Rủi ro nguồn (spec B2) — chỉ xét một lần, đêm đầu tiên lô còn đang vận chuyển. */
function resolveRisk(d: Delivery, rng: Rng): Delivery {
  if (d.riskResolved) return d;
  const risk = (SUP.tiers as any[]).find((t) => t.id === d.supplierId)?.risk;
  let out: Delivery = { ...d, riskResolved: true };
  if (!risk) return out;
  if (risk.delayChance != null && rng.next() < risk.delayChance)
    out = { ...out, daysLeft: out.daysLeft + risk.delayDays, risk: 'delay' };
  if (risk.customsChance != null) {
    const customs = rng.next() < risk.customsChance;
    const loss = rng.next() < risk.lossChance;
    if (customs) out = { ...out, daysLeft: out.daysLeft + risk.customsDays, risk: 'customs' };
    if (loss) {
      const items = Object.fromEntries(Object.entries(out.items).map(([k, v]) => [k, Math.floor(v * (1 - risk.lossPct))]));
      const itemsTotal = Object.values(items).reduce((a, b) => a + b, 0);
      out = { ...out, items, itemsTotal, risk: customs ? 'customs' : 'loss' };
    }
  }
  return out;
}

/** Gọi từ settleDay: xe chạy qua đêm. */
export function advanceShipping(s: GameState, rng: Rng): GameState {
  let unchecked = s.unchecked;
  const deliveries = s.deliveries.map((d0) => {
    if (d0.state !== 'shipping') return d0;
    const d = resolveRisk(d0, rng);
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
