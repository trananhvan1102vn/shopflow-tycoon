// Nhà cung cấp, hạng hàng, quan hệ (spec B2). Thuần, không RNG.
import { suppliers as SUP } from '@shopflow/data';
import type { GameState, Grade } from './types.js';

/** Ngày tuyệt đối: 12 tháng × 30 ngày (khớp tick.ts). */
export const absDay = (c: { day: number; month: number; year: number }): number =>
  (c.year - 1) * 360 + (c.month - 1) * 30 + c.day;

export const supplierDef = (id: string): any => (SUP.tiers as any[]).find((t) => t.id === id);

export const supplierUnlocked = (s: GameState, supplierId: string): boolean =>
  (supplierDef(supplierId)?.unlockStage ?? 99) <= s.stage;

/** Hạng được phép ở nhà cung cấp này theo màn (spec B2: nội địa màn 1 chỉ B). */
export function gradeAllowed(s: GameState, supplierId: string, grade: Grade): boolean {
  const def = supplierDef(supplierId);
  if (!def) return false;
  const list: string[] = s.stage === 1 && def.gradesStage1 ? def.gradesStage1 : def.grades;
  return list.includes(grade);
}

/** Cấp quan hệ = chỉ số (0-based) của mốc XP cao nhất đã đạt. */
export function relationshipLevel(s: GameState, supplierId: string): number {
  const xp = s.relationships[supplierId]?.xp ?? 0;
  const levels = SUP.relationship.levels as { xp: number }[];
  let lv = 0;
  levels.forEach((l, i) => { if (xp >= l.xp) lv = i; });
  return lv;
}

export const relationshipDiscount = (s: GameState, supplierId: string): number =>
  (SUP.relationship.levels as any[])[relationshipLevel(s, supplierId)].discount ?? 0;

export function relationshipXp(s: GameState, supplierId: string): { xp: number; level: number; nextXp: number | null } {
  const xp = s.relationships[supplierId]?.xp ?? 0;
  const level = relationshipLevel(s, supplierId);
  const next = (SUP.relationship.levels as any[])[level + 1];
  return { xp, level, nextXp: next ? next.xp : null };
}

/** Hệ số giá theo hạng; đặc quyền cấp có `exclusiveBundle`: hạng A giá hạng B. */
export function gradeCostMult(s: GameState, supplierId: string, grade: Grade): number {
  const lv = (SUP.relationship.levels as any[])[relationshipLevel(s, supplierId)];
  if (grade === 'A' && lv.exclusiveBundle) return SUP.grades.B.costMult;
  return (SUP.grades as any)[grade].costMult;
}

/**
 * Cộng XP sau khi mua: $100 = 1 XP (spec B2).
 * Ruling M2a/task-3: "quan hệ nguồn" là tính năng mở ở màn 3 (spec) — trước đó không tích XP,
 * để không đổi cân bằng màn 1 (mọi test màn 1/2 hiện có không phụ thuộc XP).
 */
export function addRelationshipXp(s: GameState, supplierId: string, cost: number): GameState {
  if (s.stage < 3) return s;
  const cur = s.relationships[supplierId] ?? { xp: 0, lastPurchaseDay: absDay(s.clock) };
  return { ...s, relationships: { ...s.relationships, [supplierId]: {
    xp: cur.xp + Math.floor(cost / SUP.relationship.xpPerCents), lastPurchaseDay: absDay(s.clock) } } };
}
