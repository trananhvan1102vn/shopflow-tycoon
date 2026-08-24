import { describe, it, expect } from 'vitest';
import { channels as CH } from '@shopflow/data';
import { createGame, tick, makeRng, retailUnitPrice } from '../src/index.js';
import { buyRetail, buyBundle, placeEquipment, upgradeChannel } from '../src/actions.js';
import type { GameState } from '../src/types.js';

/** Bot màn 1: chiến lược đơn giản của người chơi biết chơi (spec Phần E). */
function botAct(s: GameState): GameState {
  // Kênh: nâng Chợ Trời lên cấp 3 ($50 + $100): traffic ×1.875, hoa hồng 12% → 11%.
  // Chỉ nâng khi còn đệm tiền cho kệ/bàn và nhập hàng — nếu không đủ thì làm việc khác trước.
  const flea = s.channels.find((c) => c.id === 'flea')!;
  if (flea.level < 3) {
    const fleaDef = CH.channels.find((d) => d.id === 'flea')! as { upgradeCostBase?: number; openCost: number };
    const upCost = (fleaDef.upgradeCostBase ?? fleaDef.openCost) * CH.levelBonus[String(flea.level + 1) as '2' | '3'].costMult;
    if (s.money >= upCost + 30000) return upgradeChannel(s, 'flea');
  }
  // Thiết bị: 1 kệ (bắt buộc để kiểm hàng) + bàn thứ 2 + kệ thứ 2 sớm nhất có thể
  const shelfCount = s.grid.cells.filter((c) => c?.type === 'shelf').length;
  const packerCount = s.grid.cells.filter((c) => c?.type === 'packer').length;
  const empty = s.grid.cells.findIndex((c) => c === null);
  if (shelfCount === 0 && empty >= 0) return placeEquipment(s, empty, 'shelf');
  if (packerCount < 2 && s.money > 15000 && empty >= 0) return placeEquipment(s, empty, 'packer');
  if (shelfCount < 2 && s.money > 25000 && empty >= 0) return placeEquipment(s, empty, 'shelf');

  // Hàng: giữ mạch bán liên tục — luôn có lô về trong hôm nay/ngày mai
  const inbound = s.deliveries.reduce((a, d) => a + d.itemsTotal - Math.floor(d.itemsChecked), 0);
  const onHand = Object.values(s.inventory).reduce((a, b) => a + b, 0);
  const soon = s.deliveries
    .filter((d) => d.state === 'auditing' || d.daysLeft <= 1)
    .reduce((a, d) => a + d.itemsTotal - Math.floor(d.itemsChecked), 0);
  // Ngân sách nhập hàng: ngày đầu gom vốn thoải mái; từ ngày 2 chỉ tiêu ≤70% doanh thu trong ngày
  // (hoa hồng 11% + thuê 1800 + bảo trì ⇒ ngày nào cũng còn lãi dương).
  const dayRev = Object.values(s.dayRevenue).reduce((a, b) => a + b, 0);
  const budget = s.reports.length === 0 ? s.money : dayRev * 0.7 - s.dayPurchases;
  const afford = (cost: number) => s.money >= cost + 3000 && budget >= cost;

  // Starter (1 ngày) là xương sống: về kịp ngày hôm sau, kho không đứt hàng.
  if (onHand + soon < 25 && afford(6000 + 2000)) return buyBundle(s, 'electronics', 'starter', 'standard');
  // Power (2 ngày) là lô giá trị cao, chỉ mua khi đã có đệm tiền.
  if (onHand + inbound < 45 && s.money >= 20000 && afford(12000 + 2000)) return buyBundle(s, 'electronics', 'power', 'standard');
  // Cứu hộ: mua lẻ khi kho gần cạn.
  const unit = retailUnitPrice(s, 'phone_case');
  if (onHand + inbound < 12 && afford(unit * 10 + 2000)) return buyRetail(s, 'phone_case', 10, 'standard');
  return s;
}

describe('balance harness — màn 1 (README gate)', () => {
  it('15–25 phút thực, hoa hồng 5–12%, lãi ròng dương từ ngày 2', () => {
    const rng = makeRng(20260824);
    let s = createGame(20260824, 'electronics');
    let ticks = 0;
    const MAX = 1500; // 25 phút
    while (!s.stageComplete && ticks < MAX + 1) {
      if (ticks % 5 === 0) s = botAct(s);
      s = tick(s, 4, rng);
      ticks++;
    }
    expect(s.stageComplete, `màn 1 không xong trong 25 phút (money=${s.money}, orders=${s.completedOrders})`).toBe(true);
    expect(ticks, 'màn 1 xong quá nhanh (<15 phút)').toBeGreaterThanOrEqual(900);

    const gross = s.reports.reduce((a, r) => a + Object.values(r.revenueByChannel).reduce((x, y) => x + y, 0), 0)
      + Object.values(s.dayRevenue).reduce((a, b) => a + b, 0);
    const commission = s.reports.reduce((a, r) => a + r.commission, 0) + s.dayCommission;
    const share = commission / gross;
    expect(share).toBeGreaterThanOrEqual(0.05);
    expect(share).toBeLessThanOrEqual(0.12);

    for (let i = 1; i < s.reports.length; i++) {
      expect(s.reports[i].net, `ngày ${i + 1} lãi âm`).toBeGreaterThan(0);
    }
  });
});
