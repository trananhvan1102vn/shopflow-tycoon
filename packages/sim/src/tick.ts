import type { GameState, Rng } from './types.js';
import { settleDay } from './settleDay.js';

/**
 * tick 1 giây thực = +4 phút game (spec A3).
 * TODO M1: sinh đơn (mỗi 10s), đóng gói (mỗi 1s), SLA, xe hàng, kiểm hàng, sự kiện lịch.
 * Thuần túy: không Date.now(), không Math.random() — chỉ dùng rng.
 */
export function tick(s: GameState, dtGameMinutes: number, rng: Rng): GameState {
  const minute = s.clock.minute + dtGameMinutes;
  let { day, month, year } = s.clock;
  let next: GameState = { ...s, clock: { minute, day, month, year } };
  if (minute >= 24 * 60) {
    next = settleDay(next); // 00:00 — Báo cáo cuối ngày (spec B6)
    next.clock = { minute: minute - 24 * 60, day: day + 1, month, year };
    if (next.clock.day > 30) { next.clock.day = 1; next.clock.month++; }
    if (next.clock.month > 12) { next.clock.month = 1; next.clock.year++; }
  }
  void rng; // dùng ở M1
  return next;
}
