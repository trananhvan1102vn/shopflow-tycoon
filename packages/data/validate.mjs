// Kiểm tra data tối thiểu: JSON parse được, id duy nhất, affinity đủ kênh, tổng xác suất chu kỳ = 1.
import * as d from './index.js';
const die = (m) => { console.error('DATA INVALID:', m); process.exit(1); };
const ids = new Set();
for (const i of d.industries.industries) { if (ids.has(i.id)) die('trùng industry id ' + i.id); ids.add(i.id); }
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
console.log('data ok:', ids.size, 'industries,', chIds.length, 'channels,', d.calendar.events.length, 'events');
