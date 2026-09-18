// Hàm thuần cho C10/C13 — tách khỏi component để test được mà không phải dựng
// store (store.ts tạo Worker ngay khi import, jsdom không có Worker).
import { stages as ST } from '@shopflow/data';

/**
 * Toạ độ polyline cho sparkline lãi ròng.
 *
 * - 0 điểm → chuỗi rỗng (nơi gọi sẽ không vẽ gì).
 * - 1 điểm → đoạn ngang giữa khung (một điểm không thành đường).
 * - Mọi giá trị bằng nhau → cũng nằm giữa khung (tránh chia cho 0).
 */
export function sparklinePoints(nets: number[], w = 320, h = 48, pad = 4): string {
  if (nets.length === 0) return '';
  const inner = h - pad * 2;
  const min = Math.min(...nets);
  const max = Math.max(...nets);
  const span = max - min;
  const y = (v: number) => (span === 0 ? pad + inner / 2 : pad + inner * (1 - (v - min) / span));
  if (nets.length === 1) return `0,${y(nets[0])} ${w},${y(nets[0])}`;
  const step = w / (nets.length - 1);
  return nets.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
}

/** Toạ độ y của mốc 0 cùng hệ quy chiếu với `sparklinePoints` — null nếu 0 nằm ngoài khung. */
export function sparklineZeroY(nets: number[], h = 48, pad = 4): number | null {
  if (nets.length === 0) return null;
  const min = Math.min(...nets);
  const max = Math.max(...nets);
  if (min > 0 || max < 0) return null;
  const inner = h - pad * 2;
  if (max === min) return pad + inner / 2;
  return pad + inner * (1 - (0 - min) / (max - min));
}

/** id mở khoá → nhãn tiếng Việt. Id lạ → không có nhãn, chip bị bỏ qua. */
export const UNLOCK_LABEL: Record<string, string> = {
  'channel-flea': 'Kênh Chợ Trời',
  'channel-mall': 'Kênh MegaMall',
  'channel-social': 'Kênh SocialShop',
  'channel-website': 'Website riêng',
  robot: 'Robot kho',
  'robot-l2': 'Robot cấp 2',
  'seo-1-2': 'SEO cấp 1–2',
  'seo-3': 'SEO cấp 3',
  'supplier-local': 'Nguồn địa phương',
  'supplier-regional': 'Nguồn khu vực',
  'supplier-overseas': 'Nguồn nhập khẩu',
  grades: 'Hạng hàng A/B/C',
  calendar: 'Lịch & gói mùa',
  'seasonal-bundles': 'Gói theo mùa',
  'grid-4x4': 'Kho 4×4',
  'grid-5x5': 'Kho 5×5',
  'grid-6x6': 'Kho 6×6',
  'carriers-all': '3 hãng ship',
  'industry-choice-2': 'Ngành thứ 2',
  'industry-choice-3': 'Ngành thứ 3',
  'industry-choice-4': 'Ngành thứ 4',
  'industry-choice-5': 'Ngành thứ 5',
  'equipment-l2': 'Thiết bị cấp 2',
  'equipment-l3': 'Thiết bị cấp 3',
  'speed-2x': 'Tua nhanh ×2',
  upgrades: 'Nâng cấp thiết bị',
  relationship: 'Thân thiết nhà cung cấp',
  'market-cycle': 'Chu kỳ thị trường',
  'random-events': 'Sự kiện ngẫu nhiên',
  'custom-pricing': 'Tự đặt giá',
  automation: 'Tự động hoá',
  achievements: 'Thành tựu',
  leaderboard: 'Bảng xếp hạng',
  'industries-6-8-purchasable': 'Mở thêm ngành 6–8',
};

export const unlockLabel = (id: string): string | undefined => UNLOCK_LABEL[id];

/**
 * Danh sách id mở khoá để khoe khi vừa qua màn `stage`.
 *
 * `ST.stages` là mảng 0-index theo `n - 1`: `stages[stage - 1]` là entry của
 * chính màn vừa xong (chứa `goal`/`reward` của nó — khớp `advanceStage` trong
 * sim dùng `ST.stages[s.stage - 1].reward`), còn `stages[stage]` là entry của
 * màn kế — tức những thứ *sẽ* dùng được sau khi qua màn. Kiểm chứng bằng dữ
 * liệu: `channel-mall` / `grid-4x4` / `robot` nằm trong `stages[1].unlocks`
 * (n = 2) và đúng bằng các mục có `unlockStage: 2` trong channels/stages.json.
 * Màn cuối → không có entry kế → mảng rỗng.
 */
export function unlocksAfterStage(stage: number): string[] {
  const next = (ST.stages as any[])[stage];
  return ((next?.unlocks ?? []) as string[]).filter((id) => UNLOCK_LABEL[id] !== undefined);
}

/** Mô tả hiệu ứng nâng cấp đúng con số trong data (C12). */
export function upgradeEffectText(effect: Record<string, unknown>): string {
  const parts: string[] = [];
  if (effect.deliveryDaysMult != null) parts.push(`Ngày giao ×${effect.deliveryDaysMult}`);
  if (effect.trafficMult != null) parts.push(`Khách ×${effect.trafficMult}`);
  if (effect.robotSpeedMult != null) parts.push(`Tốc độ robot ×${effect.robotSpeedMult}`);
  if (effect.cancelPenaltyHalf) parts.push('Phạt hủy đơn ÷2');
  if (effect.ratingRegenPerHour != null) parts.push(`Rating hồi +${effect.ratingRegenPerHour}/giờ`);
  if (effect.wholesaleMult != null) parts.push(`Giá sỉ ×${effect.wholesaleMult}`);
  if (effect.commissionDelta != null) parts.push(`Hoa hồng mọi kênh ${Number(effect.commissionDelta) < 0 ? '−' : '+'}${Math.abs(Number(effect.commissionDelta) * 100)} điểm %`);
  return parts.join(' · ');
}
