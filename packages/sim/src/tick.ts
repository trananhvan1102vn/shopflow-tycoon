import { stages as ST } from '@shopflow/data';
import type { GameState, Rng } from './types.js';
import { settleDay } from './settleDay.js';
import { genOrders } from './orders.js';
import { runAudits } from './logistics.js';
import { fulfilOrders, expireSla } from './fulfil.js';
import { checkStage } from './stageCheck.js';
import { modifiers } from './modifiers.js';

/** tick: 1 giây thực = +4 phút game (spec A3). Thuần túy, chỉ dùng rng. */
export function tick(s: GameState, dtGameMinutes: number, rng: Rng): GameState {
  let next: GameState = { ...s, clock: { ...s.clock, minute: s.clock.minute + dtGameMinutes } };
  next.orderGenAccum = s.orderGenAccum + dtGameMinutes;
  while (next.orderGenAccum >= 40) {
    next = genOrders(next, rng);
    next.orderGenAccum -= 40;
  }
  next = runAudits(next, dtGameMinutes);
  next = fulfilOrders(next, dtGameMinutes, rng);
  next = expireSla(next, dtGameMinutes);
  const regen = modifiers(next).ratingRegenPerHour;
  if (regen > 0) next.rating = Math.min(ST.rating.max, next.rating + regen * (dtGameMinutes / 60));
  if (next.clock.minute >= 24 * 60) {
    next = settleDay(next, rng);
    next.clock = { ...next.clock, minute: next.clock.minute - 24 * 60, day: next.clock.day + 1 };
    if (next.clock.day > 30) { next.clock.day = 1; next.clock.month++; }
    if (next.clock.month > 12) { next.clock.month = 1; next.clock.year++; }
  }
  next = checkStage(next);
  return next;
}
