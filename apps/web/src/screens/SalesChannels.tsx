import { channels as CH, industries as IND, upgrades as UP } from '@shopflow/data';
import { commissionOf, nightMult, orderRate, trafficEnvMult, type ChannelState, type GameState } from '@shopflow/sim';
import { useGame } from '../store';
import { usd } from '../format';

const CH_ICON: Record<string, string> = { flea: '🛍️', mall: '🏬', social: '📣', website: '🌐' };
const IND_ICON: Record<string, string> = {
  electronics: '📱', fashion: '👗', home: '🏠', books: '📚',
  toys: '🎮', beauty: '💄', sports: '⚽', pets: '🐾',
};
/** Tên ngắn cho cột bảng và nhãn cột biểu đồ. */
const CH_SHORT: Record<string, string> = { flea: 'Chợ Trời', mall: 'MegaMall', social: 'Social', website: 'Website' };

/**
 * Ước tính **đơn/giờ game** của MỘT kênh với MỘT ngành.
 *
 * Suy diễn (khớp `genOrders` trong sim):
 * - Sinh đơn chạy mỗi 10 giây thực = 40 phút game.
 * - Mỗi lượt, mỗi sản phẩm CÒN TỒN sinh kỳ vọng `r / 5` đơn, với `r = orderRate(...)`.
 * - 1 giờ game = 60 phút game = 60 / 40 = 1.5 lượt sinh.
 * → đơn/giờ game ≈ (r / 5) × 1.5 × (số sản phẩm còn tồn của ngành).
 *
 * Kênh được cô lập bằng cách clone state chỉ chứa đúng kênh đó, nên con số là
 * phần đóng góp riêng của kênh (kênh đang tạm đóng/khóa → 0, đúng như sim).
 * Trả `null` khi ngành chưa có tồn kho: lúc đó sim không sinh đơn nào cả.
 */
export function estOrdersPerGameHour(game: GameState, ch: ChannelState, industryId: string): number | null {
  const ind = IND.industries.find((i: any) => i.id === industryId);
  if (!ind) return null;
  const stocked = ind.products.filter(
    (p: any) => (p.unlockStage ?? 1) <= game.stage && (game.inventory[p.id] ?? 0) > 0,
  ).length;
  if (stocked === 0) return null;
  const env = trafficEnvMult(game.clock, industryId) * nightMult(game.clock.minute);
  const r = orderRate({ ...game, channels: [ch] }, industryId, game.seo[industryId] ?? UP.seoStart, env);
  return (r / 5) * 1.5 * stocked;
}

/** Tổng đơn/giờ của một kênh trên tất cả ngành đang sở hữu. */
function channelRate(game: GameState, ch: ChannelState): number | null {
  let sum = 0, any = false;
  for (const id of game.industries) {
    const r = estOrdersPerGameHour(game, ch, id);
    if (r !== null) { sum += r; any = true; }
  }
  return any ? sum : null;
}

export default function SalesChannels() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  if (!game) return null;

  const defs = CH.channels as any[];
  const revenue = Object.values(game.dayRevenue).reduce((a: number, b: number) => a + b, 0);
  const ordersToday = Object.values(game.dayOrders).reduce((a: number, b: number) => a + b, 0);
  const maxBar = Math.max(1, ...defs.map((d) => game.dayOrders[d.id] ?? 0));
  const openStates = game.channels.filter((c) => c.open && !c.suspended && !c.ratingLocked);
  const ownedInds = IND.industries.filter((i: any) => game.industries.includes(i.id));
  const totalRate = openStates.reduce((a, c) => a + (channelRate(game, c) ?? 0), 0);
  const noStock = ownedInds.every((i: any) =>
    i.products.every((p: any) => (game.inventory[p.id] ?? 0) <= 0));

  return (
    <div className="space-y-3">
      {/* ---- Tổng kết hôm nay ---- */}
      <div className="rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
          <h2 className="font-bold uppercase tracking-wide text-slate-500">Hôm nay</h2>
          <p className="text-slate-500">
            Doanh thu <b className="text-emerald-600">{usd(revenue)}</b> · Hoa hồng{' '}
            <b className="text-red-600">−{usd(game.dayCommission)}</b>
          </p>
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div className="flex flex-1 items-end gap-2">
            {defs.map((d) => {
              const n = game.dayOrders[d.id] ?? 0;
              return (
                <div key={d.id} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${n > 0 ? 'bg-emerald-600' : 'bg-slate-200'}`}
                    style={{ height: `${8 + (n / maxBar) * 48}px` }}
                  />
                  <span className="truncate text-[11px] text-slate-500">{CH_SHORT[d.id]}</span>
                  <span className="text-xs font-bold text-slate-800">{n || '—'}</span>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 text-right text-xs text-slate-500">
            <div className="font-bold text-slate-800">{ordersToday} đơn</div>
            <div>≈ {totalRate.toFixed(1)} đơn/giờ</div>
          </div>
        </div>
      </div>

      {/* ---- Thẻ từng kênh ---- */}
      {defs.map((def) => (
        <ChannelCard key={def.id} def={def} game={game} dispatch={dispatch} />
      ))}

      {/* ---- Bảng tốc độ có đơn ---- */}
      <div className="rounded-xl bg-white p-3 shadow">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
          Tốc độ có đơn <span className="font-normal normal-case">(đơn/giờ game, ước tính)</span>
        </h2>
        {openStates.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">Chưa có kênh nào đang bán.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="text-left font-bold">Ngành</th>
                {openStates.map((c) => (
                  <th key={c.id} className="px-1 font-normal">{CH_SHORT[c.id]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ownedInds.map((i: any) => (
                <tr key={i.id}>
                  <td className="py-1 text-xs font-bold">{IND_ICON[i.id]} {i.name} · V {i.V}</td>
                  {openStates.map((c) => {
                    const r = estOrdersPerGameHour(game, c, i.id);
                    return (
                      <td key={c.id} className="p-0.5">
                        <div className="rounded-lg bg-slate-100 py-1 text-center text-sm font-bold text-slate-700">
                          {r === null ? '—' : r.toFixed(1)}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-slate-400">
          {noStock
            ? 'Chưa có tồn kho — nhập hàng để bắt đầu có đơn.'
            : 'Ước tính theo giờ game hiện tại (giờ cao điểm, sự kiện, Rating đều tính vào).'}
        </p>
      </div>
    </div>
  );
}

function ChannelCard({ def, game, dispatch }: {
  def: any; game: GameState; dispatch: (name: string, ...args: unknown[]) => void;
}) {
  const st = game.channels.find((c) => c.id === def.id);
  const stageLocked = def.unlockStage > game.stage;
  const ratingLow = def.minRating != null && game.rating < def.minRating;

  const status = st
    ? st.suspended
      ? { text: 'Tạm ngưng vì thiếu phí', cls: 'bg-red-50 text-red-700' }
      : st.ratingLocked
        ? { text: 'Khóa Rating', cls: 'bg-red-50 text-red-700' }
        : !st.open
          ? { text: 'Tạm đóng', cls: 'bg-slate-100 text-slate-500' }
          : { text: `Đang bán · Cấp ${st.level}`, cls: 'bg-emerald-50 text-emerald-700' }
    : stageLocked
      ? { text: `🔒 Mở ở màn ${def.unlockStage}`, cls: 'bg-slate-100 text-slate-500' }
      : ratingLow
        ? { text: `Cần Rating ≥ ${def.minRating}`, cls: 'bg-amber-50 text-amber-700' }
        : { text: 'Chưa mở', cls: 'bg-slate-100 text-slate-500' };

  const commission = commissionOf(game, def.id);
  const rate = st ? channelRate(game, st) : null;

  // Ngành mạnh nhất của người chơi với kênh này (affinity cao nhất).
  const best = game.industries
    .map((id) => ({ id, a: (CH.affinity as any)[id]?.[def.id] ?? 1 }))
    .sort((a, b) => b.a - a.a)[0];

  // Giá nâng cấp phải khớp `upgradeChannel` trong sim: base = upgradeCostBase ?? openCost.
  const nextLevel = st && st.level < 3 ? ((st.level + 1) as 2 | 3) : null;
  const upgradeCost = nextLevel
    ? (def.upgradeCostBase ?? def.openCost) * (CH.levelBonus as any)[String(nextLevel)].costMult
    : 0;

  const dim = !st && (stageLocked || ratingLow);

  return (
    <div className={`flex items-start gap-3 rounded-xl p-3 shadow ${
      dim ? 'border-2 border-dashed border-slate-200 bg-white/60' : 'bg-white'
    }`}>
      <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl ${
        st?.open && !st.suspended && !st.ratingLocked ? 'bg-emerald-50' : 'bg-slate-100'
      }`}>
        {CH_ICON[def.id]}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <h3 className={`font-bold ${dim ? 'text-slate-400' : ''}`}>{def.name}</h3>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase ${status.cls}`}>
            {status.text}
          </span>
        </div>
        {st && (
          <div className="text-sm leading-none tracking-widest text-emerald-600" aria-label={`Cấp ${st.level}`}>
            {'●'.repeat(st.level)}<span className="text-slate-300">{'○'.repeat(3 - st.level)}</span>
          </div>
        )}
        <p className="mt-0.5 text-xs text-slate-500">
          {commission > 0 ? `Hoa hồng ${(commission * 100).toFixed(0)}%` : 'Không hoa hồng'} ·{' '}
          {def.dailyFee > 0 ? `${usd(def.dailyFee)}/ngày` : 'miễn phí'} · khách ×{def.trafficK}
          {def.minRating != null && ` · cần Rating ≥ ${def.minRating}`}
        </p>
        {def.peakHourMult > 2 && (
          <p className="mt-0.5 text-xs text-violet-700">Đơn dồn giờ cao điểm ×{def.peakHourMult} (11–13h, 19–22h)</p>
        )}
        <p className="mt-0.5 text-xs font-bold text-emerald-700">
          {rate === null ? 'Chưa có tồn kho' : `≈ ${rate.toFixed(1)} đơn/giờ`}
          {best && ` · hợp ngành: ${IND_ICON[best.id]}×${best.a}`}
        </p>
      </div>

      <div className="flex w-24 shrink-0 flex-col gap-1">
        {!st ? (
          <button
            disabled={stageLocked || ratingLow}
            onClick={() => dispatch('openChannel', def.id)}
            className="rounded-xl bg-emerald-700 px-2 py-2 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-500"
          >
            {stageLocked ? `🔒 Màn ${def.unlockStage}`
              : ratingLow ? `Rating ≥ ${def.minRating}`
                : def.openCost > 0 ? `Mở kênh ${usd(def.openCost)}` : 'Mở kênh miễn phí'}
          </button>
        ) : (
          <>
            <button
              disabled={nextLevel === null}
              onClick={() => dispatch('upgradeChannel', def.id)}
              className="rounded-xl bg-emerald-700 px-2 py-2 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-500"
            >
              {nextLevel === null ? 'Đã cấp tối đa' : `Nâng cấp ${usd(upgradeCost)}`}
            </button>
            <button
              onClick={() => dispatch('setChannelOpen', def.id, !st.open)}
              className="rounded-xl bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-700"
            >
              {st.open ? 'Tạm đóng' : 'Mở lại'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
