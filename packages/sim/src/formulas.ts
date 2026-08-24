import { channels as CH, industries as IND, stages as ST } from '@shopflow/data';
import type { GameState } from './types.js';

/** Spec B5: đơn/tick-10s cho một sản phẩm. Trả về r; số đơn = floor(r/5) + Bernoulli(frac). */
export function orderRate(s: GameState, industryId: string, seoScore: number, envMult: number): number {
  const ind = IND.industries.find((i: any) => i.id === industryId)!;
  let channelSum = 0;
  for (const c of s.channels) {
    if (!c.open || c.suspended || c.ratingLocked) continue;
    const def = CH.channels.find((d: any) => d.id === c.id)!;
    let k = def.trafficK;
    if (c.level >= 2) k *= CH.levelBonus['2'].kMult;
    if (c.level >= 3) k *= CH.levelBonus['3'].kMult;
    const a = (CH.affinity as any)[industryId]?.[c.id] ?? 1;
    channelSum += k * a;
  }
  const ratingMult = 0.6 + 0.1 * s.rating; // ST.rating.trafficFormula
  return (seoScore / 5) * ind.V * channelSum * ratingMult * envMult;
}

/** Trọng số gán đơn vào kênh (B5). */
export function channelWeights(s: GameState, industryId: string): [string, number][] {
  return s.channels
    .filter((c) => c.open && !c.suspended && !c.ratingLocked)
    .map((c) => {
      const def = CH.channels.find((d: any) => d.id === c.id)!;
      const a = (CH.affinity as any)[industryId]?.[c.id] ?? 1;
      return [c.id, def.trafficK * a] as [string, number];
    });
}
