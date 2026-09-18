import { MAX_OFFLINE_TICKS } from '@shopflow/sim';
export function elapsedText(ticks: number): string {
  if (ticks >= MAX_OFFLINE_TICKS) return '8 giờ (tối đa)';
  const h = Math.floor(ticks / 3600), m = Math.floor((ticks % 3600) / 60);
  if (h === 0) return `${Math.max(1, m)} phút`;
  return `${h} giờ ${String(m).padStart(2, '0')} phút`;
}
