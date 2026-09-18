import { useState } from 'react';
import { industries as IND, stages as ST } from '@shopflow/data';
import { priceWarFor } from '@shopflow/sim';
import { useGame } from '../store';
import { usdCents } from '../format';
import { eventDaysLeft } from '../eventText';
import { productPriceInfo } from '../pricingView';

const P = ST.pricing as { min: number; max: number; step: number; elasticity: number };
const round2 = (n: number) => Math.round(n * 100) / 100;

export default function SalesPricing() {
  const game = useGame((s) => s.game);
  const dispatch = useGame((s) => s.dispatch);
  const [industryId, setIndustryId] = useState<string | null>(null);
  if (!game) return null;

  if (game.stage < 4) {
    return (
      <p className="rounded-xl bg-white p-8 text-center text-sm text-slate-500 shadow">
        🔒 Tự đặt giá mở ở màn 4
      </p>
    );
  }

  const owned = IND.industries.filter((i: any) => game.industries.includes(i.id));
  const ind = owned.find((i: any) => i.id === industryId) ?? owned[0];
  if (!ind) return null;

  const war = priceWarFor(game, ind.id);
  const products = ind.products.filter((p: any) => (p.unlockStage ?? 1) <= game.stage);

  return (
    <div className="space-y-3">
      {owned.length >= 2 && (
        <select
          value={ind.id}
          onChange={(e) => setIndustryId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm font-bold shadow"
        >
          {owned.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      )}

      {war && (
        <div className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-900 shadow">
          ⚔️ Chiến giá · đối thủ bán rẻ hơn {Math.round((1 - war.rival) * 100)}% · còn{' '}
          {eventDaysLeft(war.entry, game.clock)} ngày · {war.entry.ordersDuring}/{war.def.minOrders ?? 0} đơn giá ≤ đối thủ
        </div>
      )}

      <div className="space-y-2">
        {products.map((p: any) => {
          const info = productPriceInfo(game, p.id);
          const atMin = info.mult <= P.min + 1e-9;
          const atMax = info.mult >= P.max - 1e-9;
          return (
            <div key={p.id} className="rounded-xl bg-white p-3 shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-bold">{p.name}</h3>
                    {info.aboveRival && (
                      <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        đắt hơn đối thủ
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Niêm yết {usdCents(info.list)}</p>
                  {info.rivalPrice !== null && (
                    <p className={`text-xs font-bold ${info.aboveRival ? 'text-red-600' : 'text-amber-600'}`}>
                      Đối thủ: {usdCents(info.rivalPrice)}
                    </p>
                  )}
                </div>
                {info.mult !== 1 && (
                  <button
                    onClick={() => dispatch('setPrice', p.id, 1)}
                    className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"
                  >
                    Về giá niêm yết
                  </button>
                )}
              </div>

              <div className="mt-2 flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-xl border border-slate-200 px-1">
                  <button
                    disabled={atMin}
                    onClick={() => dispatch('setPrice', p.id, round2(info.mult - P.step))}
                    aria-label={`Giảm giá ${p.name}`}
                    className="px-2 py-1 text-lg font-bold text-slate-400 disabled:text-slate-200"
                  >
                    −
                  </button>
                  <span className="w-24 text-center text-2xl font-black text-slate-900">{usdCents(info.price)}</span>
                  <button
                    disabled={atMax}
                    onClick={() => dispatch('setPrice', p.id, round2(info.mult + P.step))}
                    aria-label={`Tăng giá ${p.name}`}
                    className="px-2 py-1 text-lg font-bold text-emerald-600 disabled:text-slate-200"
                  >
                    ＋
                  </button>
                </div>
                <div className="text-xs text-slate-500">
                  <div>{info.ordersPerHour === null ? 'Chưa có tồn kho' : `≈ ${info.ordersPerHour.toFixed(1)} đơn/giờ`}</div>
                  <div>Lãi/đơn <b className="text-emerald-600">{usdCents(info.marginPerUnit)}</b></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
