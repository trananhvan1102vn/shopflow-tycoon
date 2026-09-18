import { describe, it, expect } from 'vitest';
import { createGame, tick, makeRng } from '../src/index.js';
import { buyRetail, placeEquipment } from '../src/actions.js';
import { fastForward, MAX_OFFLINE_TICKS } from '../src/fastForward.js';

function playing() {
  let s = createGame(42, 'electronics');
  s = placeEquipment(s, 0, 'shelf');
  s = buyRetail(s, 'phone_case', 40, { carrierId: 'standard' });
  return s;
}

describe('fastForward', () => {
  it('equals N single ticks for the same seed', () => {
    const a = fastForward(playing(), 500, makeRng(7)).state;
    let b = playing(); const rng = makeRng(7);
    for (let i = 0; i < 500; i++) b = tick(b, 4, rng);
    expect(a).toEqual(b);
  });
  it('summary matches counter diffs', () => {
    const s0 = playing();
    // 40 giờ game kể từ 08:00 ngày 6 → cắt qua 2 mốc nửa đêm (16h tới 00:00 ngày 7,
    // rồi 24h tới 00:00 ngày 8) nên có 2 lần kết toán, không phải 1.
    const { state, summary } = fastForward(s0, 600, makeRng(7));
    expect(summary.ticks).toBe(600);
    expect(summary.ordersDelivered).toBe(state.completedOrders - s0.completedOrders);
    expect(summary.ordersCancelled).toBe(state.cancelledOrders);
    expect(summary.ordersReturned).toBe(state.returnedOrders);
    expect(summary.daysSettled).toBe(state.reports.length);
    expect(state.reports.length).toBe(2);
    const feesFromReports = state.reports.reduce((a, r) => a + r.rent + r.maintenance + r.channelFees, 0);
    expect(summary.feesPaid).toBe(feesFromReports);
    const revenueFromReports = state.reports.reduce(
      (a, r) => a + Object.values(r.revenueByChannel).reduce((x, y) => x + y, 0) - r.commission, 0);
    expect(summary.netRevenue).toBe(
      revenueFromReports
      + Object.values(state.dayRevenue).reduce((x, y) => x + y, 0) - state.dayCommission);
    expect(summary.lowStock.every((id) => (state.inventory[id] ?? 0) < 10)).toBe(true);
  });
  it('netRevenue excludes the partial day revenue the player already had when leaving', () => {
    const s0 = playing();
    s0.dayRevenue = { flea: 12345 };   // đã bán được trong ngày trước khi rời đi
    s0.dayCommission = 1481;
    const startingPartial = 12345 - 1481;

    const { state, summary } = fastForward(s0, 600, makeRng(7));
    expect(state.reports.length).toBeGreaterThanOrEqual(1); // có kết toán → phần dở dang trên đã vào báo cáo

    // Tính tay: thu ròng ghi trong các báo cáo mới + phần dở dang của ngày đang chạy,
    // trừ phần đã có sẵn lúc rời đi (nó nằm trong báo cáo đầu tiên nên nếu không trừ sẽ bị đếm thêm).
    const inReports = state.reports.reduce(
      (a, r) => a + Object.values(r.revenueByChannel).reduce((x, y) => x + y, 0) - r.commission, 0);
    const openDay = Object.values(state.dayRevenue).reduce((x, y) => x + y, 0) - state.dayCommission;
    expect(summary.netRevenue).toBe(inReports + openDay - startingPartial);

    // Kiểm tra độc lập: doanh thu có sẵn từ trước không được làm đổi con số "kiếm khi vắng".
    expect(summary.netRevenue).toBe(fastForward(playing(), 600, makeRng(7)).summary.netRevenue);
  });
  it('clamps to [0, MAX_OFFLINE_TICKS]', () => {
    expect(fastForward(playing(), -5, makeRng(1)).summary.ticks).toBe(0);
    expect(fastForward(playing(), 10 ** 9, makeRng(1)).summary.ticks).toBe(MAX_OFFLINE_TICKS);
  });
  it('stops early when a stage completes', () => {
    const s0 = playing(); s0.money = 159_999; s0.completedOrders = 49; s0.rating = 4;
    const { state, summary } = fastForward(s0, 3000, makeRng(7));
    expect(state.stageComplete).toBe(true);
    expect(summary.stageCompleted).toBe(true);
    expect(summary.ticks).toBeLessThan(3000);
  });
  it('reports events started/ended', () => {
    const s0 = playing(); s0.clock = { minute: 0, day: 13, month: 2, year: 1 }; // Valentine 14–15/2
    const { summary } = fastForward(s0, 360 * 3, makeRng(1)); // 3 ngày
    expect(summary.eventsStarted).toContain('valentine');
    expect(summary.eventsEnded).toContain('valentine');
  });
  it('random events (stage 4): started/ended counts match the id diff between start and end states', () => {
    // Seed 25, 10 ngày: một sự kiện ngẫu nhiên (golden_hour) khởi động trong cửa sổ và
    // vẫn còn hiệu lực ở cuối — chọn thực nghiệm để tránh một chu kỳ start+end trọn vẹn,
    // vốn làm phép trừ tập hợp id đơn giản không còn phản ánh đúng tổng started+ended.
    const s0 = createGame(25, 'electronics'); s0.stage = 4;
    const idsBefore = new Set(s0.activeRandomEvents.map((e) => e.id));
    const { state, summary } = fastForward(s0, 360 * 10, makeRng(25));
    const idsAfter = new Set(state.activeRandomEvents.map((e) => e.id));
    const diff = [...idsBefore].filter((id) => !idsAfter.has(id)).length
      + [...idsAfter].filter((id) => !idsBefore.has(id)).length;
    expect(summary.randomEventsStarted.length + summary.randomEventsEnded.length).toBe(diff);
    expect(summary.randomEventsStarted).toContain('golden_hour');
    expect(summary.randomEventsEnded).toEqual([]);
  });
});
