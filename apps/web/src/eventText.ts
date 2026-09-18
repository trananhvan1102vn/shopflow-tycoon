// apps/web/src/eventText.ts — text thuần cho sự kiện ngẫu nhiên (thẻ Quảng bá, toast, welcome-back).
import { calendar as CAL } from '@shopflow/data';
import { absDay, type EventDef, type GameState } from '@shopflow/sim';

const RE = CAL.randomEvents as { defs: { id: string; name: string }[] };

/**
 * Số ngày còn lại để hiển thị "Còn N ngày". Sự kiện khởi động trong lần settle đóng ngày D có
 * `endsDay = D + days` và còn sống các ngày D+1…D+days, nên NGÀY SỐNG CUỐI CÙNG phải hiện "Còn 1
 * ngày" — `endsDay − absDay` trần trụi sẽ ra 0 đúng vào ngày người chơi còn hành động được.
 */
export const eventDaysLeft = (entry: { endsDay: number }, clock: GameState['clock']): number =>
  entry.endsDay - absDay(clock) + 1;

/** Tên hiển thị của một sự kiện ngẫu nhiên theo id; rơi về chính id khi không tìm thấy. */
export const RANDOM_EVENT_NAME = (id: string): string => RE.defs.find((d) => d.id === id)?.name ?? id;

/**
 * Dòng mô tả hiệu ứng của một def, đúng thứ tự các khoá trong `effects` (spec Phase 2),
 * nối bằng " · ". Mỗi khoá hiệu ứng có đúng một đoạn văn bản cố định.
 */
export function eventEffectText(def: EventDef): string {
  const e = def.effects;
  const parts: string[] = [];
  if (e.trafficMult != null) parts.push(`Khách ×${e.trafficMult}`);
  if (e.retailMult != null) parts.push(`Giá lẻ ×${e.retailMult}`);
  if (e.wholesaleMult != null) parts.push(`Giá sỉ ×${e.wholesaleMult}`);
  // "lô đặt mới": deliveryDays được chốt lúc mua, nên sự kiện chỉ ảnh hưởng lô đặt sau khi nó bắt đầu.
  if (e.deliveryDaysDelta != null) parts.push(`lô đặt mới giao +${e.deliveryDaysDelta} ngày`);
  if (e.overseasDaysDelta != null) parts.push(`Nguồn xa: lô đặt mới +${e.overseasDaysDelta} ngày`);
  if (e.ratingDelta != null) parts.push(`Uy tín +${e.ratingDelta}`);
  if (e.rivalPriceMult != null) parts.push(`Đối thủ bán ×${e.rivalPriceMult}`);
  if (e.abovePriceTrafficMult != null) parts.push(`khách ×${e.abovePriceTrafficMult} nếu đắt hơn`);
  return parts.join(' · ');
}

/**
 * Diff hai tập khoá **theo instance** của sự kiện ngẫu nhiên (không phải theo id): mỗi khoá
 * gồm `${id}@${endsDay}`, nên một sự kiện cùng id nhưng khởi động lại (endsDay mới, sau khi
 * cái cũ vừa kết thúc trong cùng lần settle) tạo ra một khoá KHÁC — được tính là vừa kết thúc
 * (khoá cũ) vừa bắt đầu (khoá mới), thay vì bị "biến mất" vì chuỗi id nối lại trùng nhau.
 */
export function diffEventKeys(prev: string[], next: string[]): { started: string[]; ended: string[] } {
  return {
    started: next.filter((k) => !prev.includes(k)),
    ended: prev.filter((k) => !next.includes(k)),
  };
}
