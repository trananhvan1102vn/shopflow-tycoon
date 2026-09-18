// apps/web/src/promoView.ts — hàm thuần cho tab Quảng bá (test được không cần store).
import { industries as IND, upgrades as UP } from '@shopflow/data';
import { nightMult, orderRate, trafficEnvMult, type GameState } from '@shopflow/sim';

const SEO_MIN = UP.seoStart as number;

/**
 * Ước tính **đơn/10 giây thực** của một ngành — cùng suy diễn như `estOrdersPerGameHour`
 * (SalesChannels) và `productPriceInfo` (pricingView): mỗi lượt sinh đơn (10 giây thực), mỗi
 * sản phẩm CÒN TỒN đóng góp `orderRate(..., productId) / 5` đơn. Cộng theo TỪNG sản phẩm nên
 * giá tự đặt (`priceMult`) được tính vào, khác với bản cũ nhân số sản phẩm còn tồn.
 * Trả `null` khi ngành không tồn tại hoặc chưa có tồn kho nào (sim không sinh đơn).
 */
export function estOrdersPer10s(game: GameState, industryId: string): number | null {
  const ind = (IND.industries as any[]).find((i) => i.id === industryId);
  if (!ind) return null;
  const stocked = ind.products.filter(
    (p: any) => (p.unlockStage ?? 1) <= game.stage && (game.inventory[p.id] ?? 0) > 0,
  );
  if (stocked.length === 0) return null;
  const env = trafficEnvMult(game.clock, industryId) * nightMult(game.clock.minute);
  const seo = game.seo[industryId] ?? SEO_MIN;
  return stocked.reduce((a: number, p: any) => a + orderRate(game, industryId, seo, env, p.id) / 5, 0);
}
