import { useState } from 'react';
import { industries as IND, suppliers as SUP, calendar as CAL } from '@shopflow/data';
import { wholesaleEnvMult, activeEvents } from '@shopflow/sim';
import { useGame } from '../store';
import { usdCents } from '../format';

const SEASONAL_NAME: Record<string, string> = {
  valentine_gift: 'Gói quà Valentine',
  back_school: 'Gói tựu trường',
  black_friday: 'Gói Black Friday',
  holiday_gift: 'Gói quà cuối năm',
};

/** Khoá so sánh cửa sổ lịch (giống sim): tháng*100 + ngày. */
const dayKey = (m: number, d: number) => m * 100 + d;
/** Số ngày tuyệt đối trong năm — lịch game có 12 tháng × 30 ngày (tick.ts). */
const dayOfYear = (m: number, d: number) => (m - 1) * 30 + d;

export default function RestockBundles() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [industryId, setIndustryId] = useState<string | null>(null);
  const [carrierId, setCarrierId] = useState('economy');
  if (!game) return null;

  const owned = IND.industries.filter((i: any) => game.industries.includes(i.id));
  const ind = owned.find((i: any) => i.id === industryId) ?? owned[0];
  if (!ind) return null;

  const carrier = SUP.carriers.find((c: any) => c.id === carrierId)!;
  const env = wholesaleEnvMult(game.clock, ind.id);
  const retailOf = (pid: string) => ind.products.find((p: any) => p.id === pid)?.retail ?? 0;
  const nameOf = (pid: string) => ind.products.find((p: any) => p.id === pid)?.name ?? pid;
  const cheapEvent = activeEvents(game.clock.month, game.clock.day).find((e: any) => e.wholesaleMult);

  // Gói mùa: data không liên kết id gói mùa với id bundle, nên M1 áp giảm giá lên gói
  // rẻ nhất còn hợp lệ theo màn của ngành — buyBundle nhận (industryId, bundleId, …, seasonalId).
  const legal = ind.bundles.filter((b: any) => b.unlockStage <= game.stage);
  const cheapest = legal.slice().sort((a: any, b: any) => a.cost - b.cost)[0];
  const now = dayKey(game.clock.month, game.clock.day);
  const seasonal =
    game.stage >= 2 && cheapest
      ? CAL.seasonalBundles.find((sb: any) => {
          const [[fm, fd], [tm, td]] = sb.window;
          const inWindow = now >= dayKey(fm, fd) && now <= dayKey(tm, td);
          const forInd = sb.industries === 'all' || (sb.industries as string[]).includes(ind.id);
          return inWindow && forInd;
        })
      : undefined;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {owned.length >= 2 && (
          <select value={ind.id} onChange={(e) => setIndustryId(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-white p-2 text-sm font-bold shadow">
            {owned.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        )}
        <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)}
          aria-label="Hãng vận chuyển"
          className="flex-1 rounded-xl border border-slate-200 bg-white p-2 text-sm font-bold shadow">
          {SUP.carriers.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name} {usdCents(c.fee)} · {c.daysDelta > 0 ? `+${c.daysDelta}n` : c.daysDelta < 0 ? `${c.daysDelta}n` : 'đúng hẹn'}
            </option>
          ))}
        </select>
      </div>

      {cheapEvent && (
        <p className="rounded-xl bg-emerald-50 p-2 text-xs font-bold text-emerald-700">
          {cheapEvent.name}: giá sỉ {Math.round(((cheapEvent as any).wholesaleMult - 1) * 100)}%
        </p>
      )}

      {seasonal && cheapest && (
        <SeasonalCard
          seasonal={seasonal}
          bundle={cheapest}
          env={env}
          fee={carrier.fee}
          bought={game.seasonalBought[seasonal.id] ?? 0}
          daysLeft={
            dayOfYear(seasonal.window[1][0], seasonal.window[1][1]) -
            dayOfYear(game.clock.month, game.clock.day)
          }
          onBuy={() => dispatch('buyBundle', ind.id, cheapest.id, carrierId, seasonal.id)}
        />
      )}

      <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Gói thường · {ind.name}</h2>

      <div className="space-y-2">
        {ind.bundles.map((b: any) => {
          const locked = b.unlockStage > game.stage;
          const items = Object.entries(b.items as Record<string, number>);
          const cost = Math.round(b.cost * env) + carrier.fee;
          const days = Math.max(0, b.days + carrier.daysDelta);
          const revenue = items.reduce((a, [pid, n]) => a + retailOf(pid) * n, 0);
          return (
            <div key={b.id} className={`rounded-xl bg-white p-3 shadow ${locked ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold">{locked ? '🔒 ' : ''}{b.name}</div>
                <div className="shrink-0 text-right">
                  <div className="font-bold text-emerald-700">{usdCents(Math.round(b.cost * env))}</div>
                  <div className="text-[11px] text-slate-500">
                    + ship {usdCents(carrier.fee)} · {days === 0 ? 'về hôm nay' : `${days} ngày`}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {items.map(([pid, n]) => (
                  <span key={pid} className="rounded bg-slate-100 px-2 py-0.5 text-xs">{n} {nameOf(pid)}</span>
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Bán hết thu ~<b className="text-slate-800">{usdCents(revenue)}</b> · lãi ≈ <b className="text-slate-800">{usdCents(revenue - cost)}</b>
                </p>
                {locked ? (
                  <span className="shrink-0 text-xs font-bold text-slate-500">Màn {b.unlockStage}</span>
                ) : (
                  <button onClick={() => dispatch('buyBundle', ind.id, b.id, carrierId)}
                    className="shrink-0 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-bold text-white">
                    Mua
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SeasonalCard({ seasonal, bundle, env, fee, bought, daysLeft, onBuy }: {
  seasonal: any; bundle: any; env: number; fee: number; bought: number; daysLeft: number; onBuy: () => void;
}) {
  const full = Math.round(bundle.cost * env) + fee;
  const sale = Math.round(bundle.cost * env * (1 - seasonal.discount)) + fee;
  const left = seasonal.limit - bought;
  return (
    <div className="rounded-xl border-2 border-orange-300 bg-orange-50 p-3">
      <div className="flex items-center justify-between text-xs font-bold text-orange-700">
        <span>🎁 GÓI MÙA · CÒN {Math.max(0, daysLeft)} NGÀY</span>
        <span className="rounded-full bg-white px-2 py-0.5">Còn {Math.max(0, left)} lượt</span>
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <div className="font-bold">{SEASONAL_NAME[seasonal.id] ?? seasonal.id}</div>
          <div className="text-xs text-slate-600">Áp cho {bundle.name} · giảm {Math.round(seasonal.discount * 100)}%</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs text-slate-400 line-through">{usdCents(full)}</div>
          <div className="text-xl font-bold text-orange-600">{usdCents(sale)}</div>
        </div>
      </div>
      <button disabled={left <= 0} onClick={onBuy}
        className="mt-2 w-full rounded-xl bg-orange-600 p-2 font-bold text-white disabled:bg-slate-300">
        {left <= 0 ? 'Hết lượt mua' : 'Mua gói mùa'}
      </button>
    </div>
  );
}
