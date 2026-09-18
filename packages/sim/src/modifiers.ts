// Một nơi duy nhất gom mọi hệ số từ nâng cấp vĩnh viễn (B8) và chu kỳ thị trường (B7).
// M2b: sự kiện ngẫu nhiên thêm dòng vào đây.
import { upgrades as UP, calendar as CAL } from '@shopflow/data';
import type { GameState } from './types.js';
import { activeEventDefs } from './events.js';
import { relationshipPerks } from './suppliers.js';

export interface Modifiers {
  traffic: number; retail: number; wholesale: number; shipping: number;
  deliveryDays: number; robotSpeed: number; commissionDelta: number;
  cancelPenaltyMult: number; ratingRegenPerHour: number;
  deliveryDaysDelta: number; overseasDaysDelta: number;
}

export function modifiers(s: GameState, opts: { supplierId?: string } = {}): Modifiers {
  const m: Modifiers = { traffic: 1, retail: 1, wholesale: 1, shipping: 1, deliveryDays: 1, robotSpeed: 1,
    commissionDelta: 0, cancelPenaltyMult: 1, ratingRegenPerHour: 0, deliveryDaysDelta: 0, overseasDaysDelta: 0 };
  const cyc = (CAL.marketCycle.states as any[]).find((x) => x.id === s.marketCycle);
  if (cyc) { m.traffic *= cyc.traffic; m.retail *= cyc.retail; m.wholesale *= cyc.wholesale; m.shipping *= cyc.shipping; }
  for (const id of s.upgrades) {
    const e = (UP.upgrades as any[]).find((u) => u.id === id)?.effect ?? {};
    if (e.deliveryDaysMult) m.deliveryDays *= e.deliveryDaysMult;
    if (e.trafficMult) m.traffic *= e.trafficMult;
    if (e.robotSpeedMult) m.robotSpeed *= e.robotSpeedMult;
    if (e.cancelPenaltyHalf) m.cancelPenaltyMult *= 0.5;
    if (e.ratingRegenPerHour) m.ratingRegenPerHour += e.ratingRegenPerHour;
    if (e.wholesaleMult) m.wholesale *= e.wholesaleMult;
    if (e.commissionDelta) m.commissionDelta += e.commissionDelta;
  }
  // M2b: sự kiện ngẫu nhiên (spec B7). Miễn nhiễm khủng hoảng nguồn ở cấp quan hệ 5 (crisisImmune).
  const immune = opts.supplierId ? relationshipPerks(s, opts.supplierId).crisisImmune : false;
  for (const { def } of activeEventDefs(s)) {
    if (def.id === 'supply_crisis' && immune) continue;
    const e = def.effects;
    if (e.trafficMult) m.traffic *= e.trafficMult;
    if (e.retailMult) m.retail *= e.retailMult;
    if (e.wholesaleMult) m.wholesale *= e.wholesaleMult;
    if (e.deliveryDaysDelta) m.deliveryDaysDelta += e.deliveryDaysDelta;
    if (e.overseasDaysDelta) m.overseasDaysDelta += e.overseasDaysDelta;
  }
  return m;
}
