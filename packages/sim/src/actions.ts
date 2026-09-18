import { industries as IND, suppliers as SUP, stages as ST, calendar as CAL, channels as CH, upgrades as UP } from '@shopflow/data';
import type { Cents, Delivery, GameState, Grade } from './types.js';
import { wholesaleEnvMult } from './env.js';
import { shelfCapacity } from './logistics.js';
import { modifiers } from './modifiers.js';
import { supplierDef, supplierUnlocked, gradeAllowed, gradeCostMult, relationshipDiscount, relationshipPerks, addRelationshipXp } from './suppliers.js';
import { checkQuests } from './quests.js';
import { snapPriceMult } from './pricing.js';

const ok = (s: GameState): GameState => checkQuests({ ...s, lastReject: null });
const reject = (s: GameState, msg: string): GameState => ({ ...s, lastReject: msg });

function findProduct(productId: string) {
  for (const ind of IND.industries)
    for (const p of ind.products) if (p.id === productId) return { ind, p };
  return null;
}

export function pendingAuditCapacity(s: GameState): number {
  const empty = s.grid.cells.filter((c) => c === null).length;
  return empty * ST.warehouse.uncheckedPerEmptyCell - s.unchecked;
}

export interface PurchaseOpts { carrierId: string; supplierId?: string; grade?: Grade; seasonalId?: string }

const norm = (o: PurchaseOpts) => ({ carrierId: o.carrierId, supplierId: o.supplierId ?? 'local', grade: (o.grade ?? 'B') as Grade, seasonalId: o.seasonalId });

/** Ngày giao (spec B3): gói + nguồn + hãng + daysDelta quan hệ (cộng dồn) × Định Tuyến. */
function deliveryDays(s: GameState, baseDays: number, supplierId: string, carrierId: string): number {
  const sup = supplierDef(supplierId); const carrier = (SUP.carriers as any[]).find((c) => c.id === carrierId);
  const raw = baseDays + (sup?.extraDays ?? 0) + (carrier?.daysDelta ?? 0) + relationshipPerks(s, supplierId).daysDelta;
  const mod = modifiers(s, { supplierId });
  return Math.max(0, Math.round(raw * mod.deliveryDays) + mod.deliveryDaysDelta + (supplierId === 'overseas' ? mod.overseasDaysDelta : 0));
}

function shipFee(s: GameState, carrierId: string, industryId: string | null, bundle: boolean): Cents {
  const carrier = (SUP.carriers as any[]).find((c) => c.id === carrierId);
  const ind = industryId ? (IND.industries as any[]).find((i) => i.id === industryId) : null;
  const mult = bundle ? (ind?.traits?.bundleShipMult ?? 1) : 1;
  return Math.round((carrier?.fee ?? 0) * modifiers(s).shipping * mult);
}

export function quoteRetail(s: GameState, productId: string, qty: number, o: PurchaseOpts) {
  const { carrierId, supplierId, grade } = norm(o);
  const f = findProduct(productId)!;
  const sup = supplierDef(supplierId);
  const unit = Math.round(f.p.wholesale * SUP.retail.priceMult * (sup?.costMult ?? 1)
    * gradeCostMult(s, supplierId, grade) * (1 - relationshipDiscount(s, supplierId)));
  const moq = supplierId === 'local' ? SUP.retail.moqLocal : SUP.retail.moqImport;
  return { unit, goods: unit * qty, ship: shipFee(s, carrierId, f.ind.id, false), days: deliveryDays(s, 0, supplierId, carrierId), moq };
}

export const retailUnitPrice = (s: GameState, productId: string): Cents =>
  quoteRetail(s, productId, 1, { carrierId: 'standard' }).unit;

export function quoteBundle(s: GameState, industryId: string, bundleId: string, o: PurchaseOpts) {
  const { carrierId, supplierId, grade, seasonalId } = norm(o);
  const ind = (IND.industries as any[]).find((i) => i.id === industryId);
  const bundle = ind?.bundles.find((b: any) => b.id === bundleId);
  if (!ind || !bundle) return { goods: 0, ship: 0, days: 0, discountPct: 0 };
  const sup = supplierDef(supplierId);
  let goods = bundle.cost * (sup?.costMult ?? 1) * gradeCostMult(s, supplierId, grade) * (1 - relationshipDiscount(s, supplierId))
    * wholesaleEnvMult(s.clock, industryId) * modifiers(s, { supplierId }).wholesale;
  let discountPct = 0;
  if (seasonalId) {
    const sb = (CAL.seasonalBundles as any[]).find((x) => x.id === seasonalId);
    if (sb) { goods *= 1 - sb.discount; discountPct = sb.discount; }
  }
  return { goods: Math.round(goods), ship: shipFee(s, carrierId, industryId, true), days: deliveryDays(s, bundle.days, supplierId, carrierId), discountPct };
}

function makeDelivery(s: GameState, items: Record<string, number>, cost: Cents, o: ReturnType<typeof norm>, daysLeft: number, bundleId?: string): GameState {
  const itemsTotal = Object.values(items).reduce((a, b) => a + b, 0);
  const d: Delivery = {
    id: `d${s.deliverySeq + 1}`, bundleId, items, grade: o.grade, supplierId: o.supplierId, carrierId: o.carrierId,
    cost, state: daysLeft === 0 ? 'auditing' : 'shipping', daysLeft, itemsTotal, itemsChecked: 0,
    riskResolved: daysLeft === 0,
  };
  const next: GameState = {
    ...s, deliverySeq: s.deliverySeq + 1,
    money: s.money - cost, dayPurchases: s.dayPurchases + cost,
    deliveries: [...s.deliveries, d],
    unchecked: d.state === 'auditing' ? s.unchecked + itemsTotal : s.unchecked,
    retailLotsBought: s.retailLotsBought + (bundleId ? 0 : 1),
    bundleLotsBought: s.bundleLotsBought + (bundleId ? 1 : 0),
  };
  return addRelationshipXp(next, o.supplierId, cost);
}

/** Kiểm tra chung nguồn/hạng/hãng — trả thông báo lỗi hoặc null. */
function purchaseGate(s: GameState, o: ReturnType<typeof norm>): string | null {
  if (!supplierDef(o.supplierId)) return 'Không có nguồn này';
  if (!supplierUnlocked(s, o.supplierId)) return `Nguồn mở ở màn ${supplierDef(o.supplierId).unlockStage}`;
  if (!gradeAllowed(s, o.supplierId, o.grade)) return `Nguồn này chưa có hạng ${o.grade}`;
  if (!(SUP.carriers as any[]).some((c) => c.id === o.carrierId)) return 'Chưa chọn hãng vận chuyển';
  return null;
}

export function buyRetail(s: GameState, productId: string, qty: number, opts: PurchaseOpts): GameState {
  const o = norm(opts);
  const f = findProduct(productId);
  if (!f || !s.industries.includes(f.ind.id)) return reject(s, 'Sản phẩm không thuộc ngành của bạn');
  if (((f.p as any).unlockStage ?? 1) > s.stage) return reject(s, `Mở ở màn ${(f.p as any).unlockStage}`);
  const gate = purchaseGate(s, o); if (gate) return reject(s, gate);
  const q = quoteRetail(s, productId, qty, o);
  if (qty < q.moq) return reject(s, `Tối thiểu ${q.moq} sản phẩm`);
  if (qty > SUP.retail.maxPerOrder) return reject(s, `Tối đa ${SUP.retail.maxPerOrder} sản phẩm/lần`);
  const cost = q.goods + q.ship;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  if (q.days === 0 && qty > pendingAuditCapacity(s)) return reject(s, 'Khu chờ kiểm đã đầy — cần ô trống');
  return ok(makeDelivery(s, { [productId]: qty }, cost, o, q.days));
}

export function buyBundle(s: GameState, industryId: string, bundleId: string, opts: PurchaseOpts): GameState {
  const o = norm(opts);
  const ind = (IND.industries as any[]).find((i) => i.id === industryId);
  if (!ind || !s.industries.includes(industryId)) return reject(s, 'Ngành chưa mở');
  const bundle = ind.bundles.find((b: any) => b.id === bundleId);
  if (!bundle) return reject(s, 'Không có gói này');
  if (bundle.unlockStage > s.stage) return reject(s, `Mở ở màn ${bundle.unlockStage}`);
  const gate = purchaseGate(s, o); if (gate) return reject(s, gate);
  let seasonalBought = s.seasonalBought;
  if (o.seasonalId) {
    if (s.stage < 2) return reject(s, 'Gói mùa mở ở màn 2');
    const sb = (CAL.seasonalBundles as any[]).find((x) => x.id === o.seasonalId);
    if (!sb) return reject(s, 'Không có gói mùa này');
    const [[fm, fd], [tm, td]] = sb.window;
    const a = s.clock.month * 100 + s.clock.day;
    if (a < fm * 100 + fd || a > tm * 100 + td) return reject(s, 'Ngoài cửa sổ gói mùa');
    if (sb.industries !== 'all' && !(sb.industries as string[]).includes(industryId)) return reject(s, 'Gói mùa không áp dụng ngành này');
    if ((s.seasonalBought[o.seasonalId] ?? 0) >= sb.limit) return reject(s, 'Hết lượt mua gói mùa');
    seasonalBought = { ...s.seasonalBought, [o.seasonalId]: (s.seasonalBought[o.seasonalId] ?? 0) + 1 };
  }
  const q = quoteBundle(s, industryId, bundleId, o);
  const cost = q.goods + q.ship;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  const itemsTotal = Object.values(bundle.items as Record<string, number>).reduce((a, b) => a + b, 0);
  if (q.days === 0 && itemsTotal > pendingAuditCapacity(s)) return reject(s, 'Khu chờ kiểm đã đầy — cần ô trống');
  return ok(makeDelivery({ ...s, seasonalBought }, bundle.items as Record<string, number>, cost, o, q.days, bundleId));
}

export function expediteDelivery(s: GameState, deliveryId: string): GameState {
  const d = s.deliveries.find((x) => x.id === deliveryId);
  if (!d || d.state !== 'shipping') return reject(s, 'Lô hàng không thể nâng cấp');
  if (d.carrierId === 'express') return reject(s, 'Đã là Hỏa tốc');
  const express = SUP.carriers.find((c: any) => c.id === 'express')!;
  const current = SUP.carriers.find((c: any) => c.id === d.carrierId)!;
  const extra = express.fee - current.fee;
  if (s.money < extra) return reject(s, 'Không đủ tiền');
  const daysLeft = d.daysLeft - 1;
  const arrived = daysLeft <= 0;
  const deliveries = s.deliveries.map((x) =>
    x.id === deliveryId
      ? { ...x, carrierId: 'express', cost: x.cost + extra, daysLeft: Math.max(0, daysLeft), state: arrived ? ('auditing' as const) : ('shipping' as const) }
      : x);
  return ok({
    ...s, money: s.money - extra, dayPurchases: s.dayPurchases + extra, deliveries,
    unchecked: arrived ? s.unchecked + d.itemsTotal : s.unchecked,
  });
}

export function placeEquipment(s: GameState, cellIndex: number, type: 'shelf' | 'packer' | 'robot'): GameState {
  if (cellIndex < 0 || cellIndex >= s.grid.cells.length) return reject(s, 'Ô không hợp lệ');
  if (s.grid.cells[cellIndex] !== null) return reject(s, 'Ô đã có thiết bị');
  const def = ST.warehouse[type];
  if ((def as any).unlockStage && (def as any).unlockStage > s.stage)
    return reject(s, `Mở ở màn ${(def as any).unlockStage}`);
  if (s.money < def.place) return reject(s, 'Không đủ tiền');
  const cells = [...s.grid.cells];
  cells[cellIndex] = { type, level: 1 };
  return ok({ ...s, money: s.money - def.place, grid: { ...s.grid, cells } });
}

export function upgradeEquipment(s: GameState, cellIndex: number): GameState {
  const cell = s.grid.cells[cellIndex];
  if (!cell || cell.type === 'pile') return reject(s, 'Không có thiết bị ở ô này');
  const levels = ST.warehouse[cell.type].levels as { cost?: number; unlockStage?: number }[];
  const nextLv = levels[cell.level]; // level là 1-based, mảng 0-based → phần tử kế
  if (!nextLv) return reject(s, 'Đã cấp tối đa');
  if ((nextLv.unlockStage ?? 1) > s.stage) return reject(s, `Mở ở màn ${nextLv.unlockStage}`);
  if (s.money < (nextLv.cost ?? 0)) return reject(s, 'Không đủ tiền');
  const cells = [...s.grid.cells];
  cells[cellIndex] = { ...cell, level: (cell.level + 1) as 2 | 3 };
  return ok({ ...s, money: s.money - (nextLv.cost ?? 0), grid: { ...s.grid, cells } });
}

export function removeEquipment(s: GameState, cellIndex: number): GameState {
  const cell = s.grid.cells[cellIndex];
  if (!cell || cell.type === 'pile') return reject(s, 'Không có thiết bị ở ô này');
  if (s.money < ST.warehouse.demolish) return reject(s, 'Không đủ tiền');
  if (cell.type === 'shelf') {
    const stock = Object.values(s.inventory).reduce((a, b) => a + b, 0);
    const capAfter = shelfCapacity(s) - ST.warehouse.shelf.levels[cell.level - 1].cap;
    if (stock > capAfter) return reject(s, 'Kệ còn hàng — bán bớt trước khi gỡ');
  }
  const cells = [...s.grid.cells];
  cells[cellIndex] = null;
  return ok({ ...s, money: s.money - ST.warehouse.demolish, grid: { ...s.grid, cells } });
}

export function expandGrid(s: GameState): GameState {
  const next = ST.warehouse.grids.find((g: any) => g.size === s.grid.size + 1);
  if (!next) return reject(s, 'Đã là kho lớn nhất');
  if ((next as any).unlockStage > s.stage) return reject(s, `Mở ở màn ${(next as any).unlockStage}`);
  if (s.money < next.cost) return reject(s, 'Không đủ tiền');
  const size = next.size;
  const cells = Array<(typeof s.grid.cells)[number]>(size * size).fill(null);
  s.grid.cells.forEach((c, i) => {
    const r = Math.floor(i / s.grid.size), col = i % s.grid.size;
    cells[r * size + col] = c;
  });
  return ok({ ...s, money: s.money - next.cost, grid: { size, cells } });
}

export function openChannel(s: GameState, channelId: string): GameState {
  const def = CH.channels.find((d: any) => d.id === channelId);
  if (!def) return reject(s, 'Không có kênh này');
  if (s.channels.some((c) => c.id === channelId)) return reject(s, 'Kênh đã mở');
  if (def.unlockStage > s.stage) return reject(s, `Mở ở màn ${def.unlockStage}`);
  if ((def as any).minRating && s.rating < (def as any).minRating)
    return reject(s, `Cần Rating ≥ ${(def as any).minRating}`);
  if (s.money < def.openCost) return reject(s, 'Không đủ tiền');
  return ok({
    ...s, money: s.money - def.openCost,
    channels: [...s.channels, { id: channelId, open: true, suspended: false, ratingLocked: false, level: 1 as const, ordersDelivered: 0 }],
  });
}

export function upgradeChannel(s: GameState, channelId: string): GameState {
  const def = CH.channels.find((d: any) => d.id === channelId);
  const st = s.channels.find((c) => c.id === channelId);
  if (!def || !st) return reject(s, 'Kênh chưa mở');
  if (st.level >= 3) return reject(s, 'Đã cấp tối đa');
  // Kênh mở miễn phí (flea) có giá nâng cấp riêng để cấp 2–3 không thành đồ cho không (spec B5).
  const base = (def as any).upgradeCostBase ?? def.openCost;
  const cost = base * CH.levelBonus[String(st.level + 1) as '2' | '3'].costMult;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  return ok({
    ...s, money: s.money - cost,
    channels: s.channels.map((c) => (c.id === channelId ? { ...c, level: (c.level + 1) as 2 | 3 } : c)),
  });
}

export function setChannelOpen(s: GameState, channelId: string, open: boolean): GameState {
  if (!s.channels.some((c) => c.id === channelId)) return reject(s, 'Kênh chưa mở');
  return ok({ ...s, channels: s.channels.map((c) => (c.id === channelId ? { ...c, open } : c)) });
}

export function buySeo(s: GameState, industryId: string): GameState {
  if (!s.industries.includes(industryId)) return reject(s, 'Ngành chưa mở');
  if (s.stage < 2) return reject(s, 'SEO mở ở màn 2');
  const current = s.seo[industryId] ?? UP.seoStart;
  const next = UP.seoCampaigns.find((c: any) => c.score > current);
  if (!next) return reject(s, 'SEO đã tối đa');
  if (((next as any).unlockStage ?? 1) > s.stage) return reject(s, `Cấp ${next.level} mở ở màn ${(next as any).unlockStage}`);
  if (s.money < next.cost) return reject(s, 'Không đủ tiền');
  return ok({ ...s, money: s.money - next.cost, seo: { ...s.seo, [industryId]: next.score } });
}

export function buyUpgrade(s: GameState, id: string): GameState {
  const def = (UP.upgrades as any[]).find((u) => u.id === id);
  if (!def) return reject(s, 'Không có nâng cấp này');
  if (s.stage < 3) return reject(s, 'Nâng cấp mở ở màn 3');
  if (s.upgrades.includes(id)) return reject(s, 'Đã mua nâng cấp này');
  if (s.money < def.cost) return reject(s, 'Không đủ tiền');
  return ok({ ...s, money: s.money - def.cost, dayPurchases: s.dayPurchases + def.cost, upgrades: [...s.upgrades, id] });
}

export function chooseIndustry(s: GameState, industryId: string): GameState {
  const ind = IND.industries.find((i: any) => i.id === industryId);
  if (!ind || ind.unlock !== 'start-option') return reject(s, 'Ngành này chưa thể mở');
  if (s.industries.includes(industryId)) return reject(s, 'Ngành đã mở');
  if (s.industries.length >= s.stage) return reject(s, 'Chưa mở thêm ngành ở màn này');
  return ok({ ...s, industries: [...s.industries, industryId], seo: { ...s.seo, [industryId]: UP.seoStart } });
}

export function setPrice(s: GameState, productId: string, mult: number): GameState {
  if (s.stage < 4) return reject(s, 'Tự đặt giá mở ở màn 4');
  const f = findProduct(productId);
  if (!f || !s.industries.includes(f.ind.id)) return reject(s, 'Sản phẩm không thuộc ngành của bạn');
  if (((f.p as any).unlockStage ?? 1) > s.stage) return reject(s, `Mở ở màn ${(f.p as any).unlockStage}`);
  const snapped = snapPriceMult(mult);
  const priceMult = { ...s.priceMult };
  if (snapped === 1) delete priceMult[productId]; else priceMult[productId] = snapped;
  return ok({ ...s, priceMult });
}

export function advanceStage(s: GameState): GameState {
  if (!s.stageComplete) return reject(s, 'Chưa hoàn thành mục tiêu màn');
  const reward = ST.stages[s.stage - 1].reward ?? 0;
  // Chuỗi ngày lãi đếm lại từ đầu ở màn mới: nhiệm vụ `profit_5_days` (màn 3) phải được
  // kiếm trong màn 3, không được trả ngay khi vừa bước vào nhờ chuỗi tích ở màn 2.
  return ok({ ...s, money: s.money + reward, stage: s.stage + 1, stageComplete: false, profitStreakDays: 0 });
}
