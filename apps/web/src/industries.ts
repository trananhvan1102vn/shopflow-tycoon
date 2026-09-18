// apps/web/src/industries.ts — hàm thuần cho danh sách ngành có thể mở (chọn ngành đầu game / mở rộng).
import { industries as IND } from '@shopflow/data';

/**
 * Ngành chưa sở hữu và đã mở khoá ở `stage` (spec 1.7): `unlock === 'start-option'` (ba ngành
 * khởi điểm, mở mọi lúc) hoặc `Number(unlock) <= stage` (mở theo màn). Đây chỉ là điều kiện
 * "ngành nào khả dụng" — không áp trần tổng số ngành sở hữu (`industries.length < stage` phía
 * `chooseIndustry` trong sim); nơi gọi tự kiểm tra trần đó khi cần (vd. có nút "mở ngành" hay
 * không).
 */
export function pickableIndustries(owned: string[], stage: number): any[] {
  return (IND.industries as any[]).filter(
    (i) => !owned.includes(i.id) && (i.unlock === 'start-option' || Number(i.unlock) <= stage),
  );
}
