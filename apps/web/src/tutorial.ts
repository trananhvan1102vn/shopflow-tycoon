// apps/web/src/tutorial.ts — điều kiện 8 bước hướng dẫn (spec C3); sim chỉ lưu tiến độ.
import type { GameState } from '@shopflow/sim';
import type { Tab } from './components/TabBar';

export interface TutorialCtx { game: GameState; visited: Tab[] }

export const TUTORIAL: { text: string; tab: Tab; done: (c: TutorialCtx) => boolean }[] = [
  { text: 'Mở tab Nhập để xem nguồn hàng.', tab: 'nhap', done: (c) => c.visited.includes('nhap') },
  { text: 'Nhập lẻ 10 sản phẩm đầu tiên (giao ngay).', tab: 'nhap', done: (c) => c.game.retailLotsBought >= 1 },
  { text: 'Mua gói sỉ đầu tiên — xe về sau 1 ngày.', tab: 'nhap', done: (c) => c.game.bundleLotsBought >= 1 },
  { text: 'Về Kho, chọn Kệ hàng rồi chạm ô trống.', tab: 'kho', done: (c) => c.game.grid.cells.some((x) => x?.type === 'shelf') },
  { text: 'Đặt thêm một Bàn đóng gói để giao nhanh hơn.', tab: 'kho', done: (c) => c.game.grid.cells.filter((x) => x?.type === 'packer').length >= 2 },
  { text: 'Mở tab Bán hàng: Chợ Trời Online đã bật — mỗi đơn mất 12% hoa hồng.', tab: 'ban', done: (c) => c.visited.includes('ban') },
  { text: 'Chờ đơn đầu tiên được giao.', tab: 'ban', done: (c) => c.game.completedOrders >= 1 },
  { text: 'Xem Báo cáo cuối ngày đầu tiên lúc 00:00: thu, chi, lãi.', tab: 'kho', done: (c) => c.game.reports.length >= 1 },
];

/** Số bước liên tiếp đã xong tính từ bước 1 (chơi lệch thứ tự vẫn được tính khi các bước trước hoàn tất). */
export function completedSteps(c: TutorialCtx): number {
  let n = 0;
  for (const step of TUTORIAL) { if (!step.done(c)) break; n++; }
  return n;
}
