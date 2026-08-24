import type { GameState, Rng } from './types.js';
import { settleDay } from './settleDay.js';
import { genOrders } from './orders.js';
import { runAudits } from './logistics.js';
import { fulfilOrders, expireSla } from './fulfil.js';

/** tick: 1 giây thực = +4 phút game (spec A3). Thuần túy, chỉ dùng rng. */
export function tick(s: GameState, dtGameMinutes: number, rng: Rng): GameState {
  let next: GameState = { ...s, clock: { ...s.clock, minute: s.clock.minute + dtGameMinutes } };
  next.orderGenAccum = s.orderGenAccum + dtGameMinutes;
  while (next.orderGenAccum >= 40) {
    next = genOrders(next, rng);
    next.orderGenAccum -= 40;
  }
  next = runAudits(next, dtGameMinutes);
  next = fulfilOrders(next, dtGameMinutes);
  next = expireSla(next, dtGameMinutes);
  if (next.clock.minute >= 24 * 60) {
    next = settleDay(next);
    next.clock = { ...next.clock, minute: next.clock.minute - 24 * 60, day: next.clock.day + 1 };
    if (next.clock.day > 30) { next.clock.day = 1; next.clock.month++; }
    if (next.clock.month > 12) { next.clock.month = 1; next.clock.year++; }
  }
  return next;
}
