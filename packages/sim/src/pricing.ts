// packages/sim/src/pricing.ts — tự đặt giá (màn 4) và chiến giá. Thuần.
import { stages as ST, industries as IND } from '@shopflow/data';
import type { ActiveRandomEvent, GameState } from './types.js';
import { activeEventDefs, type EventDef } from './events.js';

const P = ST.pricing as { min: number; max: number; step: number; elasticity: number };

export const priceMultOf = (s: GameState, productId: string): number => s.priceMult[productId] ?? 1;

export function snapPriceMult(mult: number): number {
  const clamped = Math.min(P.max, Math.max(P.min, mult));
  return Math.round(Math.round(clamped / P.step) * P.step * 100) / 100;
}

export function priceWarFor(s: GameState, industryId: string): { rival: number; entry: ActiveRandomEvent; def: EventDef } | null {
  for (const { def, entry } of activeEventDefs(s)) {
    if (def.effects.rivalPriceMult && entry.industryId === industryId) return { rival: def.effects.rivalPriceMult, entry, def };
  }
  return null;
}

/** Hệ số cầu theo giá: mult^(−elasticity), nhân thêm phạt chiến giá nếu đắt hơn đối thủ. */
export function demandMult(s: GameState, productId: string): number {
  const mult = priceMultOf(s, productId);
  let d = Math.pow(mult, -P.elasticity);
  const ind = (IND.industries as any[]).find((i) => i.products.some((p: any) => p.id === productId));
  const war = ind ? priceWarFor(s, ind.id) : null;
  if (war && mult > war.rival) d *= war.def.effects.abovePriceTrafficMult ?? 1;
  return d;
}
