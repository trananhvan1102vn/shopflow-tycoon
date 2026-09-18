// packages/sim/src/events.ts — sự kiện ngẫu nhiên (spec B7, màn 4+), bảng dữ liệu → modifiers.
// Import-cycle rule: file này chỉ được import data, types và suppliers.ts (không bao giờ
// modifiers.ts, formulas.ts, pricing.ts) — modifiers.ts import ngược lại events.ts.
import { calendar as CAL, stages as ST, industries as IND } from '@shopflow/data';
import type { ActiveRandomEvent, GameState, Rng } from './types.js';
import { absDay } from './suppliers.js';

export interface EventDef {
  id: string; name: string; days: number; weight: number;
  effects: { trafficMult?: number; retailMult?: number; wholesaleMult?: number; deliveryDaysDelta?: number;
    overseasDaysDelta?: number; ratingDelta?: number; rivalPriceMult?: number; abovePriceTrafficMult?: number };
  targetIndustry?: 'owned'; minOrders?: number;
}

const RE = CAL.randomEvents as { fromStage: number; dailyChance: number; maxActive: number; defs: EventDef[] };

export const randomEventDef = (id: string): EventDef | undefined => RE.defs.find((d) => d.id === id);

export function activeEventDefs(s: GameState): { def: EventDef; entry: ActiveRandomEvent }[] {
  return s.activeRandomEvents.flatMap((entry) => { const def = randomEventDef(entry.id); return def ? [{ def, entry }] : []; });
}

const clampRating = (r: number) => Math.min(ST.rating.max, Math.max(ST.rating.min, r));

function pickDef(rng: Rng): EventDef {
  const total = RE.defs.reduce((a, d) => a + d.weight, 0);
  let x = rng.next() * total;
  for (const d of RE.defs) { x -= d.weight; if (x < 0) return d; }
  return RE.defs[RE.defs.length - 1];
}

/** Kết thúc sự kiện đã hết hạn (áp hook kết thúc). */
function expireEvents(s: GameState): GameState {
  const today = absDay(s.clock);
  let rating = s.rating, priceWarsWon = s.priceWarsWon;
  const keep: ActiveRandomEvent[] = [];
  for (const e of s.activeRandomEvents) {
    const def = randomEventDef(e.id);
    // Không còn def (save cũ / bị sửa tay) → bỏ luôn, nếu giữ lại thì nó chiếm chỗ maxActive vĩnh viễn.
    if (!def) continue;
    if (e.endsDay > today) { keep.push(e); continue; }
    if (def.effects.ratingDelta) rating = clampRating(rating - (e.ratingApplied ?? def.effects.ratingDelta));
    if (def.effects.rivalPriceMult && e.industryId) {
      const rival = def.effects.rivalPriceMult;
      const ind = (IND.industries as any[]).find((i) => i.id === e.industryId);
      if (!ind) continue;
      // Chỉ xét sản phẩm người chơi đặt được giá ở màn hiện tại (setPrice từ chối hàng còn khoá).
      const matched = ind.products
        .filter((p: any) => (p.unlockStage ?? 1) <= s.stage)
        .every((p: any) => (s.priceMult[p.id] ?? 1) <= rival);
      if (matched && e.ordersDuring >= (def.minOrders ?? 0)) priceWarsWon++;
    }
  }
  return keep.length === s.activeRandomEvents.length && rating === s.rating && priceWarsWon === s.priceWarsWon
    ? s : { ...s, activeRandomEvents: keep, rating, priceWarsWon };
}

/**
 * Gọi cuối settleDay (sau chu kỳ thị trường). Thứ tự rút RNG cố định — đây là hợp đồng
 * ràng buộc với các test hiện có (rủi ro từng lô hàng, rồi chu kỳ thị trường đã rút trước đó):
 * 1) xác suất ngày, 2) chọn sự kiện theo trọng số, 3) chọn ngành (chỉ khi targetIndustry: 'owned').
 */
export function rollRandomEvent(s: GameState, rng: Rng): GameState {
  if (s.stage < RE.fromStage) return s;
  let out = expireEvents(s);
  if (out.activeRandomEvents.length >= RE.maxActive) return out;
  if (rng.next() >= RE.dailyChance) return out;
  const def = pickDef(rng);
  let industryId: string | undefined;
  if (def.targetIndustry === 'owned') industryId = out.industries[Math.floor(rng.next() * out.industries.length)];
  let rating = out.rating;
  // Ghi lại phần thực sự cộng được (sát trần thì < delta) để hook kết thúc không trừ quá tay.
  let ratingApplied: number | undefined;
  if (def.effects.ratingDelta) {
    rating = clampRating(rating + def.effects.ratingDelta);
    ratingApplied = rating - out.rating;
  }
  const entry: ActiveRandomEvent = {
    id: def.id, endsDay: absDay(out.clock) + def.days, ordersDuring: 0,
    ...(industryId ? { industryId } : {}), ...(ratingApplied !== undefined ? { ratingApplied } : {}),
  };
  return { ...out, rating, activeRandomEvents: [...out.activeRandomEvents, entry] };
}
