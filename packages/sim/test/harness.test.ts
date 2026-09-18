import { describe, it, expect } from 'vitest';
import { channels as CH, industries as IND, calendar as CAL } from '@shopflow/data';
import { createGame, tick, makeRng, retailUnitPrice } from '../src/index.js';
import {
  buyRetail, buyBundle, placeEquipment, upgradeChannel,
  openChannel, chooseIndustry, buySeo, buyUpgrade, expandGrid, advanceStage, upgradeEquipment,
} from '../src/actions.js';
import type { GameState, Rng } from '../src/types.js';

/** Bot màn 1: chiến lược đơn giản của người chơi biết chơi (spec Phần E). */
function botAct(s: GameState): GameState {
  // Kênh: nâng Chợ Trời lên cấp 3 ($50 + $100): traffic ×1.875, hoa hồng 12% → 11%.
  // Chỉ nâng khi còn đệm tiền cho kệ/bàn và nhập hàng — nếu không đủ thì làm việc khác trước.
  const flea = s.channels.find((c) => c.id === 'flea')!;
  if (flea.level < 3) {
    const fleaDef = CH.channels.find((d: any) => d.id === 'flea')! as { upgradeCostBase?: number; openCost: number };
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
  if (onHand + soon < 25 && afford(6000 + 2000)) return buyBundle(s, 'electronics', 'starter', { carrierId: 'standard' });
  // Power (2 ngày) là lô giá trị cao, chỉ mua khi đã có đệm tiền.
  if (onHand + inbound < 45 && s.money >= 20000 && afford(12000 + 2000)) return buyBundle(s, 'electronics', 'power', { carrierId: 'standard' });
  // Cứu hộ: mua lẻ khi kho gần cạn.
  const unit = retailUnitPrice(s, 'phone_case');
  if (onHand + inbound < 12 && afford(unit * 10 + 2000)) return buyRetail(s, 'phone_case', 10, { carrierId: 'standard' });
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

/** Bot màn 2–3: mở ngành/kênh mới, mở rộng kho, chạy SEO/nâng cấp, giữ hàng tồn qua nguồn cao cấp hơn. */
const RESERVE = 30000;
const RESCUE_ON_HAND = 15;
function botAct2(s: GameState): GameState {
  const has = (id: string) => s.channels.some((c) => c.id === id);
  const spare = s.money - RESERVE;
  // 0. Cấp cứu tồn kho: sinh đơn chỉ xảy ra khi tồn kho > 0 (xem orders.ts), nên nếu một ngành
  // gần cạn hàng trên kệ, nhập nhanh từ nguồn nội địa (giao trong ngày, không đợi vận chuyển)
  // để không bị đứt mạch sinh đơn giữa hai lô hàng theo lịch (bước 6) vốn mất nhiều ngày để về.
  for (const id of s.industries) {
    const ind = (IND.industries as any[]).find((i) => i.id === id);
    if (ind.products.length === 0) continue; // ngành chưa có dữ liệu sản phẩm (vd. sách ở màn 4)
    const onHand = ind.products.reduce((a: number, p: any) => a + (s.inventory[p.id] ?? 0), 0);
    // SLA rút xuống 12h ở màn 4 → cần đệm tồn kho dày hơn để đơn không hết hạn vì thiếu hàng.
    const rescueFloor = s.stage >= 4 ? 25 : RESCUE_ON_HAND;
    if (onHand < rescueFloor && spare >= 3000) {
      const cheap = ind.products[0];
      const r = buyRetail(s, cheap.id, 20, { carrierId: 'standard', supplierId: 'local' });
      if (!r.lastReject) return r;
    }
  }
  // 1. Ngành mới khi được phép (ngành thứ 2 = fashion, thứ 3 = home, thứ 4 = sách theo unlock số).
  if (s.industries.length < s.stage) {
    const next = (IND.industries as any[]).find((i) =>
      (i.unlock === 'start-option' || Number(i.unlock) <= s.stage) && !s.industries.includes(i.id));
    if (next) return chooseIndustry(s, next.id);
  }
  // 2. Kênh: MegaMall (màn 2), SocialShop (màn 3), Website riêng (màn 4).
  if (s.stage >= 2 && !has('mall') && s.rating >= 3.5 && spare >= 20000) return openChannel(s, 'mall');
  if (s.stage >= 3 && !has('social') && spare >= 15000) return openChannel(s, 'social');
  if (s.stage >= 4 && !has('website') && spare >= 40000) return openChannel(s, 'website');
  // 3. Kho: mở 4×4 (màn 2), 5×5 (màn 4), thêm kệ/bàn/robot theo tỉ lệ, nâng robot lên cấp 2 (màn 4).
  const cells = s.grid.cells, empty = cells.findIndex((c) => c === null);
  const count = (t: string) => cells.filter((c) => c?.type === t).length;
  if (s.stage >= 2 && s.grid.size === 3 && spare >= 40000) return expandGrid(s);
  if (s.stage >= 4 && s.grid.size === 4 && spare >= 120000) return expandGrid(s);
  if (empty >= 0 && count('shelf') < 3 && spare >= 4000) return placeEquipment(s, empty, 'shelf');
  if (empty >= 0 && count('packer') < 3 && spare >= 8000) return placeEquipment(s, empty, 'packer');
  if (empty >= 0 && s.stage >= 2 && count('robot') < 2 && spare >= 12000) return placeEquipment(s, empty, 'robot');
  const robotLv1 = cells.findIndex((c) => c?.type === 'robot' && c.level === 1);
  if (s.stage >= 4 && robotLv1 >= 0 && spare >= 40000) return upgradeEquipment(s, robotLv1);
  // 4. SEO cấp 1–2 cho mọi ngành (cấp 3 ở màn 3 khi dư tiền).
  for (const id of s.industries) {
    const seo = s.seo[id] ?? 40;
    if (seo < 70 && spare >= 40000) return buySeo(s, id);
    if (s.stage >= 3 && seo < 85 && spare >= 200000) return buySeo(s, id);
  }
  // 5. Nâng cấp vĩnh viễn (màn 3): wholesale rồi routing.
  if (s.stage >= 3 && !s.upgrades.includes('wholesale') && spare >= 100000) return buyUpgrade(s, 'wholesale');
  if (s.stage >= 3 && !s.upgrades.includes('routing') && spare >= 16000) return buyUpgrade(s, 'routing');
  // 6. Hàng: mỗi ngành giữ ≥ 40 món trên đường + trên kệ; gói mùa nếu đang mở.
  for (const id of s.industries) {
    const ind = (IND.industries as any[]).find((i) => i.id === id);
    if (ind.products.length === 0) continue; // vd. sách (unlock=4): chưa có products/bundles trong data
    const onHand = ind.products.reduce((a: number, p: any) => a + (s.inventory[p.id] ?? 0), 0);
    const inbound = s.deliveries.filter((d) => ind.products.some((p: any) => p.id in d.items))
      .reduce((a, d) => a + d.itemsTotal - Math.floor(d.itemsChecked), 0);
    // SLA 12h ở màn 4 hết hạn đơn nhanh hơn nếu hết hàng trên kệ — giữ đệm tồn kho dày hơn.
    const keepFloor = s.stage >= 4 ? 90 : 60;
    if (onHand + inbound >= keepFloor) continue;
    const supplierId = s.stage >= 3 ? 'overseas' : s.stage >= 2 ? 'regional' : 'local';
    const bundles = ind.bundles.filter((b: any) => b.unlockStage <= s.stage).sort((a: any, b: any) => b.cost - a.cost);
    const now = s.clock.month * 100 + s.clock.day;
    const seasonal = (CAL.seasonalBundles as any[]).find((sb) => {
      const [[fm, fd], [tm, td]] = sb.window;
      return now >= fm * 100 + fd && now <= tm * 100 + td && (sb.industries === 'all' || sb.industries.includes(id)) && (s.seasonalBought[sb.id] ?? 0) < sb.limit;
    });
    for (const b of bundles) {
      const opts = { carrierId: 'standard', supplierId, grade: 'B' as const, seasonalId: seasonal?.id };
      const r = buyBundle(s, id, b.id, opts);
      if (!r.lastReject) return r;
      const r2 = buyBundle(s, id, b.id, { ...opts, seasonalId: undefined });
      if (!r2.lastReject) return r2;
    }
    const cheap = ind.products[0];
    const r3 = buyRetail(s, cheap.id, supplierId === 'local' ? 10 : 20, { carrierId: 'standard', supplierId });
    if (!r3.lastReject) return r3;
  }
  return s;
}

/**
 * Chạy một màn tới khi hoàn thành hoặc chạm trần tick; theo dõi việc kênh bị ngưng vì thiếu phí
 * và việc có sự kiện ngẫu nhiên nào thật sự chạy trong đoạn đo (chỉ quan sát, không rút RNG).
 */
function runStage(
  s: GameState, rng: Rng, bot: (s: GameState) => GameState, maxTicks: number,
): { s: GameState; ticks: number; suspended: boolean; sawRandomEvent: boolean } {
  let ticks = 0;
  let suspended = false;
  let sawRandomEvent = false;
  while (!s.stageComplete && ticks < maxTicks) {
    if (ticks % 5 === 0) s = bot(s);
    s = tick(s, 4, rng);
    if (s.channels.some((c) => c.suspended)) suspended = true;
    if (s.activeRandomEvents.length > 0) sawRandomEvent = true;
    ticks++;
  }
  return { s, ticks, suspended, sawRandomEvent };
}

describe('balance harness — màn 2 & 3', () => {
  // Đã đo lại bằng botAct2 (mở ngành/kênh/SEO ngay khi đủ tiền — người chơi biết chơi, không giữ
  // vốn không cần thiết): với mục tiêu màn 2/3 đã hiệu chỉnh ngày 2026-09-18 để khớp cửa sổ mới
  // (màn 2 15–30 phút thực, màn 3 25–45 phút — xem ghi chú cùng ngày trong spec 1.9), màn 2 xong ở
  // tick 1035 và màn 3 ở tick 2339 (seed 20260917); cả hai đều nằm trong cửa sổ bên dưới.
  const S2 = { min: 900, max: 1800 };  // 15–30 phút thực sau màn 1 (quyết định 2026-09-18)
  const S3 = { min: 1500, max: 2700 }; // 25–45 phút thực sau màn 2
  it('màn 2 xong trong 15–30 phút, màn 3 trong 25–45 phút, không kênh nào bị ngưng vì thiếu phí', () => {
    const rng = makeRng(20260917);
    let s = createGame(20260917, 'electronics');
    const stage1 = runStage(s, rng, botAct, 1501);
    s = stage1.s;
    expect(s.stageComplete).toBe(true);
    s = advanceStage(s);

    const stage2 = runStage(s, rng, botAct2, S2.max + 1);
    expect(stage2.s.stageComplete, `màn 2 không xong (money=${stage2.s.money}, orders=${stage2.s.completedOrders}, rating=${stage2.s.rating})`).toBe(true);
    expect(stage2.ticks).toBeGreaterThanOrEqual(S2.min);
    s = advanceStage(stage2.s);

    const stage3 = runStage(s, rng, botAct2, S3.max + 1);
    expect(stage3.s.stageComplete, `màn 3 không xong (money=${stage3.s.money}, orders=${stage3.s.completedOrders}, rating=${stage3.s.rating})`).toBe(true);
    expect(stage3.ticks).toBeGreaterThanOrEqual(S3.min);

    expect(stage2.suspended || stage3.suspended, 'kênh bị ngưng vì thiếu phí').toBe(false);
  });
});

describe('balance harness — màn 4', () => {
  // Lặp lại màn 1–3 từ cùng seed để dựng trạng thái đầu màn 4 (độc lập với describe "màn 2 & 3" ở
  // trên — không chia sẻ state), rồi chạy màn 4 với botAct2 mở rộng (ngành thứ 4, Website, kho 5×5,
  // nâng robot cấp 2). Mục tiêu $300,000/4,000 đơn (ngoại suy ×5 chưa kiểm chứng) chỉ đạt $235,702
  // ở tick 3600 (trần cửa sổ) vì đơn + rating đã vượt xa mục tiêu từ trước khi vào màn 4 (tích lũy từ
  // màn 1–3) — tiền mới là yếu tố giới hạn thực sự; đã hiệu chỉnh xuống $220,000/2,900 đơn (giữ tỉ lệ
  // ~7.500 cent/đơn, thưởng 20%, xem packages/data/stages.json + spec 1.9 ngày 2026-09-18). Với mục
  // tiêu mới, màn 4 xong ở tick 2967 (seed 20260917), nằm trong cửa sổ bên dưới.
  const S4 = { min: 2100, max: 3600 }; // 35–60 phút thực sau màn 3 (quyết định 2026-09-18)
  it('màn 4 xong trong 35–60 phút thực, không kênh nào bị ngưng vì thiếu phí', () => {
    const rng = makeRng(20260917);
    let s = createGame(20260917, 'electronics');
    const stage1 = runStage(s, rng, botAct, 1501);
    expect(stage1.s.stageComplete).toBe(true);
    s = advanceStage(stage1.s);

    const stage2 = runStage(s, rng, botAct2, 1801);
    expect(stage2.s.stageComplete).toBe(true);
    s = advanceStage(stage2.s);

    const stage3 = runStage(s, rng, botAct2, 2701);
    expect(stage3.s.stageComplete).toBe(true);
    s = advanceStage(stage3.s);

    const stage4 = runStage(s, rng, botAct2, S4.max + 1);
    expect(stage4.s.stageComplete, `màn 4 không xong (money=${stage4.s.money}, orders=${stage4.s.completedOrders}, rating=${stage4.s.rating})`).toBe(true);
    expect(stage4.ticks).toBeGreaterThanOrEqual(S4.min);
    expect(stage4.suspended, 'kênh bị ngưng vì thiếu phí ở màn 4').toBe(false);
    // Bằng chứng pipeline sự kiện ngẫu nhiên thật sự sống trong lần đo này (spec 1.3).
    expect(stage4.sawRandomEvent, 'không có sự kiện ngẫu nhiên nào chạy trong màn 4').toBe(true);
  });
});
