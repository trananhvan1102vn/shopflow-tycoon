// Kiểm tra data tối thiểu: JSON parse được, id duy nhất, affinity đủ kênh, tổng xác suất chu kỳ = 1.
import * as d from './index.js';
const die = (m) => { console.error('DATA INVALID:', m); process.exit(1); };
const ids = new Set();
for (const i of d.industries.industries) { if (ids.has(i.id)) die('trùng industry id ' + i.id); ids.add(i.id); }
// Product id phải duy nhất TOÀN CỤC: findProduct/setPrice/priceMult/demandMult đều khoá theo id trần.
const pids = new Map();
for (const i of d.industries.industries)
  for (const p of i.products) {
    if (pids.has(p.id)) die(`trùng product id ${p.id} (${pids.get(p.id)} và ${i.id})`);
    pids.set(p.id, i.id);
  }
// Bundle không được chứa sản phẩm khoá ở stage cao hơn chính bundle đó.
for (const i of d.industries.industries) {
  const stageOf = new Map(i.products.map((p) => [p.id, p.unlockStage ?? 1]));
  for (const b of i.bundles) {
    const bStage = b.unlockStage ?? 1;
    for (const pid of Object.keys(b.items)) {
      if (!stageOf.has(pid)) die(`bundle ${i.id}.${b.id} tham chiếu sản phẩm không tồn tại: ${pid}`);
      const pStage = stageOf.get(pid);
      if (pStage > bStage)
        die(`bundle ${i.id}.${b.id} (stage ${bStage}) chứa ${pid} khoá tới stage ${pStage}`);
    }
  }
}
const chIds = d.channels.channels.map((c) => c.id);
for (const [ind, m] of Object.entries(d.channels.affinity))
  for (const c of chIds) if (!(c in m)) die(`affinity thiếu ${ind}.${c}`);
for (const c of d.channels.channels)
  if (!(c.openCost > 0) && !(c.upgradeCostBase > 0)) die(`kênh ${c.id} mở miễn phí cần upgradeCostBase > 0`);
const p = d.calendar.marketCycle.states.reduce((s, x) => s + x.p, 0);
if (Math.abs(p - 1) > 1e-9) die('tổng xác suất chu kỳ = ' + p);
if (d.stages.stages.length !== 6) die('cần 6 stage');
// Quests: id duy nhất toàn cục, bonus > 0, stage key hợp lệ.
const qids = new Set();
for (const [st, list] of Object.entries(d.stages.quests ?? {})) {
  if (!(Number(st) >= 2 && Number(st) <= 6)) die('quests: stage key không hợp lệ ' + st);
  for (const q of list) {
    if (qids.has(q.id)) die('trùng quest id ' + q.id); qids.add(q.id);
    if (!(q.bonus > 0)) die(`quest ${q.id} cần bonus > 0`);
    // Ngưỡng của hai nhiệm vụ đếm số phải nằm ở data (quests.ts chỉ có mặc định cấu trúc `?? 1`).
    if ((q.id === 'web_100_orders' || q.id === 'win_price_war') && !(q.threshold > 0))
      die(`quest ${q.id} cần threshold > 0`);
  }
}
if (!(d.stages.tutorialReward > 0)) die('tutorialReward phải > 0');
const re = d.calendar.randomEvents;
if (!Array.isArray(re?.defs) || re.defs.length === 0) die('randomEvents.defs trống');
const evIds = new Set();
// Khoá hiệu ứng ngoài danh sách này sẽ bị modifiers()/events.ts bỏ qua im lặng → bắt lỗi gõ sai ở đây.
const EFFECT_KEYS = new Set(['trafficMult', 'retailMult', 'wholesaleMult', 'deliveryDaysDelta',
  'overseasDaysDelta', 'ratingDelta', 'rivalPriceMult', 'abovePriceTrafficMult']);
for (const e of re.defs) {
  if (evIds.has(e.id)) die('trùng random event id ' + e.id); evIds.add(e.id);
  if (!(e.weight > 0)) die(`event ${e.id} cần weight > 0`);
  if (!(e.days >= 1)) die(`event ${e.id} cần days ≥ 1`);
  if (!e.effects || typeof e.effects !== 'object') die(`event ${e.id} thiếu effects`);
  for (const k of Object.keys(e.effects))
    if (!EFFECT_KEYS.has(k)) die(`event ${e.id} có khoá effects lạ: ${k}`);
}
if (!(re.maxActive >= 1)) die('randomEvents.maxActive ≥ 1');
const pr = d.stages.pricing;
if (!(pr && pr.min < 1 && pr.max > 1 && pr.step > 0 && pr.elasticity > 0)) die('stages.pricing không hợp lệ');
// snapPriceMult làm tròn về 2 chữ số thập phân, nên step phải là bội của 0.01 mới snap đúng.
if (Math.abs(pr.step * 100 - Math.round(pr.step * 100)) > 1e-9) die('stages.pricing.step phải là bội của 0.01 (snapPriceMult làm tròn 2 chữ số)');
console.log('data ok:', ids.size, 'industries,', chIds.length, 'channels,', d.calendar.events.length, 'events');
