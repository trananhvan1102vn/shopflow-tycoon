// apps/web/src/pricingView.ts — hàm thuần cho tab Bán ▸ Giá bán (test được không cần store).
import { industries as IND, upgrades as UP } from '@shopflow/data';
import { nightMult, orderRate, priceMultOf, priceWarFor, trafficEnvMult, type Cents, type GameState } from '@shopflow/sim';

export interface PriceInfo {
  list: Cents;
  mult: number;
  price: Cents;
  marginPerUnit: Cents;
  ordersPerHour: number | null;
  rival: number | null;
  rivalPrice: Cents | null;
  aboveRival: boolean;
}

function findProduct(productId: string) {
  for (const ind of IND.industries as any[])
    for (const p of ind.products) if (p.id === productId) return { ind, p };
  return null;
}

/**
 * Thông tin giá của MỘT sản phẩm cho tab Giá bán.
 *
 * `ordersPerHour` dùng đúng suy diễn của `estOrdersPerGameHour` (SalesChannels.tsx) nhưng
 * theo TỪNG sản phẩm: mỗi kênh đang mở đóng góp `(orderRate(..., productId) / 5) × 1.5`,
 * không nhân thêm số sản phẩm còn tồn (đã là per-product). `null` khi sản phẩm hết tồn kho.
 */
export function productPriceInfo(game: GameState, productId: string): PriceInfo {
  const found = findProduct(productId);
  if (!found) throw new Error(`Sản phẩm không tồn tại: ${productId}`);
  const { ind, p } = found;

  const list: Cents = p.retail;
  const mult = priceMultOf(game, productId);
  const price = Math.round(list * mult);
  const marginPerUnit = price - (p.wholesale as Cents);

  const stocked = (game.inventory[productId] ?? 0) > 0;
  let ordersPerHour: number | null = null;
  if (stocked) {
    const env = trafficEnvMult(game.clock, ind.id) * nightMult(game.clock.minute);
    const seo = game.seo[ind.id] ?? UP.seoStart;
    let sum = 0;
    for (const c of game.channels) {
      if (!c.open || c.suspended || c.ratingLocked) continue;
      const r = orderRate({ ...game, channels: [c] }, ind.id, seo, env, productId);
      sum += (r / 5) * 1.5;
    }
    ordersPerHour = sum;
  }

  const war = priceWarFor(game, ind.id);
  const rival = war ? war.rival : null;
  const rivalPrice = war ? Math.round(list * war.rival) : null;
  const aboveRival = rival !== null && mult > rival;

  return { list, mult, price, marginPerUnit, ordersPerHour, rival, rivalPrice, aboveRival };
}
