import { calendar as CAL, costs as CO, industries as IND, upgrades as UP } from '@shopflow/data';
import { absDay, activeEventDefs, nightMult, orderRate, trafficEnvMult, type GameState } from '@shopflow/sim';
import { useGame } from '../store';
import { usdCents } from '../format';
import { eventEffectText } from '../eventText';

const IND_ICON: Record<string, string> = {
  electronics: '📱', fashion: '👗', home: '🏠', books: '📚',
  toys: '🎮', beauty: '💄', sports: '⚽', pets: '🐾',
};

const SEO_MIN = UP.seoStart as number;
const SEO_MAX = Math.max(...(UP.seoCampaigns as any[]).map((c) => c.score));

/** Cùng phép so sánh `m*100 + d` như `inRange` trong `env.ts` — ngày nằm trong [from, to]. */
const inWindow = (m: number, d: number, from: number[], to: number[]): boolean =>
  m * 100 + d >= from[0] * 100 + from[1] && m * 100 + d <= to[0] * 100 + to[1];

const key = (from: number[]): number => from[0] * 100 + from[1];
const dm = (p: number[]): string => `${p[1]}/${p[0]}`;
/** "14/2" khi sự kiện 1 ngày, "18/12–25/12" khi kéo dài. */
const range = (from: number[], to: number[]): string =>
  key(from) === key(to) ? dm(from) : `${dm(from)}–${dm(to)}`;

const hits = (industries: any, industryId: string): boolean =>
  industries === 'all' || (industries as string[]).includes(industryId);

const CYCLE_NAME: Record<string, string> = { stable: 'Ổn định', boom: 'Hưng thịnh', slow: 'Trầm lắng', recession: 'Suy thoái' };
const CYCLE_ICON: Record<string, string> = { stable: '⚖️', boom: '📈', slow: '🌫️', recession: '📉' };

/**
 * Sự kiện sắp tới: sự kiện đầu tiên **chưa kết thúc** tính từ hôm nay (đang diễn ra cũng tính).
 * Hết năm thì vòng lại sự kiện đầu tiên của năm sau.
 */
function nextEvent(month: number, day: number): any {
  const today = month * 100 + day;
  const evs = CAL.events as any[];
  const upcoming = evs.filter((e) => key(e.to) >= today).sort((a, b) => key(a.from) - key(b.from));
  return upcoming[0] ?? evs[0];
}

/**
 * Ước tính **đơn/10 giây thực** của một ngành — cùng suy diễn như `estOrdersPerGameHour`
 * trong `SalesChannels`: mỗi lượt sinh đơn (10 giây thực), mỗi sản phẩm CÒN TỒN sinh
 * kỳ vọng `orderRate(...) / 5` đơn. Trả `null` khi ngành chưa có tồn kho (sim không sinh đơn).
 */
function estOrdersPer10s(game: GameState, industryId: string): number | null {
  const ind = (IND.industries as any[]).find((i) => i.id === industryId);
  if (!ind) return null;
  const stocked = ind.products.filter(
    (p: any) => (p.unlockStage ?? 1) <= game.stage && (game.inventory[p.id] ?? 0) > 0,
  ).length;
  if (stocked === 0) return null;
  const env = trafficEnvMult(game.clock, industryId) * nightMult(game.clock.minute);
  return (orderRate(game, industryId, game.seo[industryId] ?? SEO_MIN, env) / 5) * stocked;
}

export default function Promo() {
  const game = useGame((s) => s.game);
  if (!game) return null;

  const { day, month, year } = game.clock;
  const ev = nextEvent(month, day);
  const ongoing = ev != null && inWindow(month, day, ev.from, ev.to);
  const mine = ev ? game.industries.filter((id) => hits(ev.industries, id)) : [];
  const evIndNames = !ev
    ? ''
    : ev.industries === 'all'
      ? 'Mọi ngành'
      : (ev.industries as string[])
          .map((id) => (IND.industries as any[]).find((i) => i.id === id)?.name ?? id)
          .join(' · ');

  // Gói mùa đang mở hôm nay (nếu có) — nhắc hạn chót đặt gói.
  const bundleNow = (CAL.seasonalBundles as any[]).find((b) =>
    inWindow(month, day, b.window[0], b.window[1]));

  /** Ưu tiên: sự kiện > cửa sổ gói mùa > cuối tuần. */
  const dayClass = (d: number): string => {
    if (d === day) return 'bg-slate-900 font-bold text-white';
    if ((CAL.events as any[]).some((e) => inWindow(month, d, e.from, e.to)))
      return 'bg-rose-400 font-bold text-white';
    if ((CAL.seasonalBundles as any[]).some((b) => inWindow(month, d, b.window[0], b.window[1])))
      return 'bg-amber-100 text-amber-900';
    if ((CAL.weekendDays as number[]).includes(d)) return 'bg-slate-200 text-slate-600';
    return 'bg-slate-50 text-slate-500';
  };

  const ownedInds = (IND.industries as any[]).filter((i) => game.industries.includes(i.id));

  return (
    <div className="space-y-3">
      {/* ---- Hai thẻ đầu ---- */}
      <div className="grid grid-cols-2 gap-3">
        {game.stage < CAL.marketCycle.fromStage ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white/60 p-3">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Thị trường</h2>
            <p className="mt-1 font-bold text-slate-400">🔒 Chu kỳ thị trường</p>
            <p className="mt-0.5 text-xs text-slate-400">Mở ở màn {CAL.marketCycle.fromStage}</p>
          </div>
        ) : (() => {
          const st = (CAL.marketCycle.states as any[]).find((x) => x.id === game.marketCycle) ?? CAL.marketCycle.states[0];
          const bad = game.marketCycle === 'recession' || game.marketCycle === 'slow';
          return (
            <div className={`rounded-xl p-3 ${bad ? 'bg-slate-100' : 'bg-sky-50'}`}>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Thị trường</h2>
              <p className="mt-1 font-bold">{CYCLE_ICON[st.id]} {CYCLE_NAME[st.id] ?? st.id}</p>
              <p className="mt-0.5 text-xs text-slate-600">khách ×{st.traffic} · giá lẻ ×{st.retail} · giá sỉ ×{st.wholesale} · ship ×{st.shipping}</p>
              <p className="mt-0.5 text-xs text-slate-500">Còn {game.marketCycleDaysLeft} ngày</p>
            </div>
          );
        })()}

        <div className="rounded-xl bg-rose-50 p-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-rose-400">Sắp tới</h2>
          {ev ? (
            <>
              <p className="mt-1 font-bold text-rose-900">
                {ev.name} <span className="font-normal">{range(ev.from, ev.to)}</span>
              </p>
              <p className="mt-0.5 text-xs text-rose-700">
                {evIndNames} · khách ×{ev.trafficMult}
              </p>
              {ongoing && (
                <span className="mt-1 inline-block rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold uppercase text-white">
                  đang diễn ra
                </span>
              )}
              {mine.length > 0 && (
                <span className="mt-1 ml-1 inline-block rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
                  ngành của bạn!
                </span>
              )}
            </>
          ) : (
            <p className="mt-1 text-xs text-rose-700">Chưa có sự kiện nào.</p>
          )}
        </div>
      </div>

      {/* ---- Sự kiện ngẫu nhiên đang diễn ra (màn 4+, spec Phase 2) ---- */}
      {game.activeRandomEvents.length > 0 && (
        <div className="rounded-xl bg-violet-50 p-3">
          <h2 className="text-xs font-bold uppercase tracking-wide text-violet-500">Đang diễn ra</h2>
          {activeEventDefs(game).map(({ def, entry }) => (
            <div key={entry.id} className="mt-1 first:mt-0">
              <p className="font-bold text-violet-900">⚡ {def.name}</p>
              <p className="mt-0.5 text-xs text-violet-700">{eventEffectText(def)}</p>
              <p className="mt-0.5 text-xs text-violet-700">Còn {entry.endsDay - absDay(game.clock)} ngày</p>
              {def.effects.rivalPriceMult != null && entry.industryId && (
                <p className="mt-0.5 text-xs text-violet-700">
                  {(IND.industries as any[]).find((i) => i.id === entry.industryId)?.name ?? entry.industryId} ·{' '}
                  {entry.ordersDuring}/{def.minOrders} đơn
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---- Lịch tháng ---- */}
      <div className="rounded-xl bg-white p-3 shadow">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <h2 className="font-bold">Tháng {month} · Năm {year}</h2>
          <div className="flex gap-2 text-[11px] text-slate-500">
            <Dot cls="bg-rose-400" label="Sự kiện" />
            <Dot cls="bg-amber-300" label="Gói mùa" />
            <Dot cls="bg-slate-300" label="Cuối tuần" />
            <Dot cls="bg-slate-900" label="Hôm nay" />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1.5">
          {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
            <div
              key={d}
              aria-current={d === day ? 'date' : undefined}
              className={`rounded-lg py-2 text-center text-sm ${dayClass(d)}`}
            >
              {d}
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Ngày {day}/{month}
          {bundleNow && ` · Gói mùa còn mở tới ${dm(bundleNow.window[1])}`}
        </p>
      </div>

      {/* ---- Chiến dịch SEO ---- */}
      <h2 className="pt-1 text-xs font-bold uppercase tracking-wide text-slate-500">
        Chiến dịch SEO theo ngành
      </h2>
      {ownedInds.map((ind) => (
        <SeoCard key={ind.id} ind={ind} game={game} ev={ev} />
      ))}
    </div>
  );
}

function Dot({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

function SeoCard({ ind, game, ev }: { ind: any; game: GameState; ev: any }) {
  const dispatch = useGame((s) => s.dispatch);
  const score = game.seo[ind.id] ?? SEO_MIN;
  const camps = UP.seoCampaigns as any[];
  // Cùng luật với `buySeo` trong sim: chiến dịch kế tiếp = mốc điểm đầu tiên cao hơn hiện tại.
  const next = camps.find((c) => c.score > score);
  const level = camps.filter((c) => c.score <= score).length;
  const stageLocked = game.stage < 2;
  const campLocked = next != null && (next.unlockStage ?? 1) > game.stage;
  const disabled = stageLocked || next == null || campLocked;

  const label = stageLocked
    ? '🔒 Màn 2'
    : next == null
      ? 'SEO đã tối đa'
      : campLocked
        ? `🔒 Màn ${next.unlockStage}`
        : `Nâng SEO cấp ${next.level} ${usdCents(next.cost)}`;

  const rate = estOrdersPer10s(game, ind.id);
  const pct = Math.max(0, Math.min(100, ((score - SEO_MIN) / (SEO_MAX - SEO_MIN)) * 100));
  // Gợi ý chạy SEO trước sự kiện có lợi cho ngành này.
  const boost = ev && !inWindow(game.clock.month, game.clock.day, ev.from, ev.to)
    && hits(ev.industries, ind.id) ? ev : null;

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white p-3 shadow">
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-2xl">
        {IND_ICON[ind.id] ?? '🏷️'}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate font-bold">{ind.name}</h3>
          <span className="shrink-0 text-xs font-bold text-emerald-700">SEO {score}</span>
        </div>
        <div className="mt-1 h-2 w-full rounded-full bg-slate-200">
          <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Cấp {level}/{camps.length} ·{' '}
          {rate === null ? 'Chưa có tồn kho' : `≈ ${rate.toFixed(1)} đơn/10 giây`}
        </p>
        {game.stage >= CO.seoDecayFromStage && score > CO.seoFloor && (
          <p className="mt-0.5 text-xs text-amber-600">Hao hụt −{CO.seoDecayPerDay} điểm/ngày về {CO.seoFloor}</p>
        )}
        {boost && (
          <p className="mt-0.5 text-xs font-bold text-amber-600">
            Chạy trước {boost.name} để tận dụng ×{boost.trafficMult}
          </p>
        )}
      </div>

      <button
        disabled={disabled}
        onClick={() => dispatch('buySeo', ind.id)}
        className="w-28 shrink-0 rounded-xl bg-emerald-700 px-2 py-2 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-500"
      >
        {label}
      </button>
    </div>
  );
}
