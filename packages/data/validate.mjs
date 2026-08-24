// Kiểm tra data tối thiểu: JSON parse được, id duy nhất, affinity đủ kênh, tổng xác suất chu kỳ = 1.
import * as d from './index.js';
const die = (m) => { console.error('DATA INVALID:', m); process.exit(1); };
const ids = new Set();
for (const i of d.industries.industries) { if (ids.has(i.id)) die('trùng industry id ' + i.id); ids.add(i.id); }
const chIds = d.channels.channels.map((c) => c.id);
for (const [ind, m] of Object.entries(d.channels.affinity))
  for (const c of chIds) if (!(c in m)) die(`affinity thiếu ${ind}.${c}`);
const p = d.calendar.marketCycle.states.reduce((s, x) => s + x.p, 0);
if (Math.abs(p - 1) > 1e-9) die('tổng xác suất chu kỳ = ' + p);
if (d.stages.stages.length !== 6) die('cần 6 stage');
console.log('data ok:', ids.size, 'industries,', chIds.length, 'channels,', d.calendar.events.length, 'events');
