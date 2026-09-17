// Nhà cung cấp, hạng hàng, quan hệ (spec B2). Thuần, không RNG.
import type { GameState } from './types.js';

/** Ngày tuyệt đối: 12 tháng × 30 ngày (khớp tick.ts). */
export const absDay = (c: { day: number; month: number; year: number }): number =>
  (c.year - 1) * 360 + (c.month - 1) * 30 + c.day;
