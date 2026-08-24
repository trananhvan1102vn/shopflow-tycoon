import { industries as IND, suppliers as SUP, stages as ST, calendar as CAL, channels as CH, upgrades as UP } from '@shopflow/data';
import type { Cents, Delivery, GameState } from './types.js';
import { wholesaleEnvMult } from './env.js';
import { shelfCapacity } from './logistics.js';

const ok = (s: GameState): GameState => ({ ...s, lastReject: null });
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

export function retailUnitPrice(s: GameState, productId: string): Cents {
  const f = findProduct(productId)!;
  const tier = SUP.tiers.find((t) => t.id === 'local')!;
  return Math.round(f.p.wholesale * SUP.retail.priceMult * tier.costMult * SUP.grades.B.costMult);
}

function makeDelivery(s: GameState, items: Record<string, number>, cost: Cents, carrierId: string, baseDays: number): { s: GameState; d: Delivery } {
  const carrier = SUP.carriers.find((c) => c.id === carrierId)!;
  const daysLeft = Math.max(0, baseDays + carrier.daysDelta);
  const itemsTotal = Object.values(items).reduce((a, b) => a + b, 0);
  const d: Delivery = {
    id: `d${s.deliverySeq + 1}`, items, grade: 'B', supplierId: 'local', carrierId,
    cost, state: daysLeft === 0 ? 'auditing' : 'shipping', daysLeft, itemsTotal, itemsChecked: 0,
  };
  const next = {
    ...s, deliverySeq: s.deliverySeq + 1,
    money: s.money - cost, dayPurchases: s.dayPurchases + cost,
    deliveries: [...s.deliveries, d],
    unchecked: d.state === 'auditing' ? s.unchecked + itemsTotal : s.unchecked,
  };
  return { s: next, d };
}

export function buyRetail(s: GameState, productId: string, qty: number, carrierId: string): GameState {
  const f = findProduct(productId);
  if (!f || !s.industries.includes(f.ind.id)) return reject(s, 'Sản phẩm không thuộc ngành của bạn');
  if (((f.p as any).unlockStage ?? 1) > s.stage) return reject(s, `Mở ở màn ${(f.p as any).unlockStage}`);
  if (qty < SUP.retail.moqLocal) return reject(s, `Tối thiểu ${SUP.retail.moqLocal} sản phẩm`);
  if (qty > SUP.retail.maxPerOrder) return reject(s, `Tối đa ${SUP.retail.maxPerOrder} sản phẩm/lần`);
  const carrier = SUP.carriers.find((c) => c.id === carrierId);
  if (!carrier) return reject(s, 'Chưa chọn hãng vận chuyển');
  const cost = retailUnitPrice(s, productId) * qty + carrier.fee;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  if (qty > pendingAuditCapacity(s) && Math.max(0, 0 + carrier.daysDelta) === 0)
    return reject(s, 'Khu chờ kiểm đã đầy — cần ô trống');
  return ok(makeDelivery(s, { [productId]: qty }, cost, carrierId, 0).s);
}

export function buyBundle(s: GameState, industryId: string, bundleId: string, carrierId: string, seasonalId?: string): GameState {
  const ind = IND.industries.find((i) => i.id === industryId);
  if (!ind || !s.industries.includes(industryId)) return reject(s, 'Ngành chưa mở');
  const bundle = ind.bundles.find((b) => b.id === bundleId);
  if (!bundle) return reject(s, 'Không có gói này');
  if (bundle.unlockStage > s.stage) return reject(s, `Mở ở màn ${bundle.unlockStage}`);
  const carrier = SUP.carriers.find((c) => c.id === carrierId);
  if (!carrier) return reject(s, 'Chưa chọn hãng vận chuyển');
  let cost = bundle.cost * wholesaleEnvMult(s.clock, industryId);
  let seasonalBought = s.seasonalBought;
  if (seasonalId) {
    if (s.stage < 2) return reject(s, 'Gói mùa mở ở màn 2');
    const sb = CAL.seasonalBundles.find((x) => x.id === seasonalId);
    if (!sb) return reject(s, 'Không có gói mùa này');
    const [[fm, fd], [tm, td]] = sb.window;
    const a = s.clock.month * 100 + s.clock.day;
    if (a < fm * 100 + fd || a > tm * 100 + td) return reject(s, 'Ngoài cửa sổ gói mùa');
    if (sb.industries !== 'all' && !(sb.industries as string[]).includes(industryId)) return reject(s, 'Gói mùa không áp dụng ngành này');
    if ((s.seasonalBought[seasonalId] ?? 0) >= sb.limit) return reject(s, 'Hết lượt mua gói mùa');
    cost *= 1 - sb.discount;
    seasonalBought = { ...s.seasonalBought, [seasonalId]: (s.seasonalBought[seasonalId] ?? 0) + 1 };
  }
  cost = Math.round(cost) + carrier.fee;
  if (s.money < cost) return reject(s, 'Không đủ tiền');
  const itemsTotal = Object.values(bundle.items).reduce((a, b) => a + b, 0);
  if (Math.max(0, bundle.days + carrier.daysDelta) === 0 && itemsTotal > pendingAuditCapacity(s))
    return reject(s, 'Khu chờ kiểm đã đầy — cần ô trống');
  const r = makeDelivery({ ...s, seasonalBought }, bundle.items as Record<string, number>, cost, carrierId, bundle.days);
  return ok(r.s);
}

export function expediteDelivery(s: GameState, deliveryId: string): GameState {
  const d = s.deliveries.find((x) => x.id === deliveryId);
  if (!d || d.state !== 'shipping') return reject(s, 'Lô hàng không thể nâng cấp');
  if (d.carrierId === 'express') return reject(s, 'Đã là Hỏa tốc');
  const express = SUP.carriers.find((c) => c.id === 'express')!;
  const current = SUP.carriers.find((c) => c.id === d.carrierId)!;
  const extra = express.fee - current.fee;
  if (s.money < extra) return reject(s, 'Không đủ tiền');
  const daysLeft = d.daysLeft - 1;
  const arrived = daysLeft <= 0;
  const deliveries = s.deliveries.map((x) =>
    x.id === deliveryId
      ? { ...x, carrierId: 'express', daysLeft: Math.max(0, daysLeft), state: arrived ? ('auditing' as const) : ('shipping' as const) }
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
  const next = ST.warehouse.grids.find((g) => g.size === s.grid.size + 1);
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
  const def = CH.channels.find((d) => d.id === channelId);
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
  const def = CH.channels.find((d) => d.id === channelId);
  const st = s.channels.find((c) => c.id === channelId);
  if (!def || !st) return reject(s, 'Kênh chưa mở');
  if (st.level >= 3) return reject(s, 'Đã cấp tối đa');
  const cost = def.openCost * CH.levelBonus[String(st.level + 1) as '2' | '3'].costMult;
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
  const next = UP.seoCampaigns.find((c) => c.score > current);
  if (!next) return reject(s, 'SEO đã tối đa');
  if (((next as any).unlockStage ?? 1) > s.stage) return reject(s, `Cấp ${next.level} mở ở màn ${(next as any).unlockStage}`);
  if (s.money < next.cost) return reject(s, 'Không đủ tiền');
  return ok({ ...s, money: s.money - next.cost, seo: { ...s.seo, [industryId]: next.score } });
}

export function chooseIndustry(s: GameState, industryId: string): GameState {
  const ind = IND.industries.find((i) => i.id === industryId);
  if (!ind || ind.unlock !== 'start-option') return reject(s, 'Ngành này chưa thể mở');
  if (s.industries.includes(industryId)) return reject(s, 'Ngành đã mở');
  if (s.industries.length >= s.stage) return reject(s, 'Chưa mở thêm ngành ở màn này');
  return ok({ ...s, industries: [...s.industries, industryId], seo: { ...s.seo, [industryId]: UP.seoStart } });
}

export function advanceStage(s: GameState): GameState {
  if (!s.stageComplete) return reject(s, 'Chưa hoàn thành mục tiêu màn');
  const reward = ST.stages[s.stage - 1].reward ?? 0;
  return ok({ ...s, money: s.money + reward, stage: s.stage + 1, stageComplete: false });
}
