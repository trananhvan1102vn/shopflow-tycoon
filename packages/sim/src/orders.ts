import { industries as IND, stages as ST, upgrades as UP } from '@shopflow/data';
import type { GameState, Order, Rng } from './types.js';
import { orderRate, channelWeights } from './formulas.js';
import { trafficEnvMult, retailEnvMult, hourMult } from './env.js';
import { modifiers } from './modifiers.js';

function pickWeighted(weights: [string, number][], rng: Rng): string {
  const total = weights.reduce((a, [, w]) => a + w, 0);
  let x = rng.next() * total;
  for (const [id, w] of weights) { x -= w; if (x <= 0) return id; }
  return weights[weights.length - 1][0];
}

/** Một lượt sinh đơn (mỗi 40 phút game = 10 giây thực, spec B5). */
export function genOrders(s: GameState, rng: Rng): GameState {
  const stage = ST.stages[s.stage - 1];
  const orders = [...s.orders];
  let seq = s.orderSeq;
  const mod = modifiers(s);
  for (const indId of s.industries) {
    const ind = IND.industries.find((i: any) => i.id === indId)!;
    const weights = channelWeights(s, indId);
    if (!weights.length) continue;
    const env = trafficEnvMult(s.clock, indId) * hourMult(s.clock.minute);
    const retailM = retailEnvMult(s.clock, indId);
    for (const p of ind.products) {
      if (((p as any).unlockStage ?? 1) > s.stage) continue;
      if ((s.inventory[p.id] ?? 0) <= 0) continue;
      const r = orderRate(s, indId, s.seo[indId] ?? UP.seoStart, env);
      const per = r / 5;
      let n = Math.floor(per);
      if (rng.next() < per - n) n++;
      for (let k = 0; k < n; k++) {
        if (orders.length >= stage.queueCap) break;
        const order: Order = {
          id: `o${++seq}`, productId: p.id, industryId: indId,
          channelId: pickWeighted(weights, rng),
          value: Math.round(p.retail * retailM * mod.retail),
          slaLeft: stage.sla, state: 'queued',
        };
        orders.push(order);
      }
    }
  }
  return { ...s, orders, orderSeq: seq };
}
