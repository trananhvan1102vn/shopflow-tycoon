import { industries as IND, suppliers as SUP, stages as ST, calendar as CAL } from '@shopflow/data';
import type { Cents, Delivery, GameState } from './types.js';
import { wholesaleEnvMult } from './env.js';

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
