export const usd = (cents: number): string =>
  (cents < 0 ? '-$' : '$') + Math.round(Math.abs(cents) / 100).toLocaleString('en-US');
/** Giá chính xác tới cent — bỏ phần thập phân khi tròn đô. Dùng ở chỗ số hiển thị phải khớp số bị trừ. */
export const usdCents = (cents: number): string => {
  const abs = Math.abs(Math.round(cents));
  const rem = abs % 100;
  return (
    (cents < 0 ? '-$' : '$') +
    Math.floor(abs / 100).toLocaleString('en-US') +
    (rem === 0 ? '' : `.${String(rem).padStart(2, '0')}`)
  );
};
export const gameTime = (minute: number): string => {
  const h = Math.floor(minute / 60) % 24, m = Math.floor(minute % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
export const dateStr = (c: { day: number; month: number }): string => `Ngày ${c.day} · Tháng ${c.month}`;
/** Danh sách giờ → chuỗi khoảng gọn: [11,12,13,19,20,21,22] → "11–13h, 19–22h". */
export const hourRanges = (hours: number[]): string => {
  const runs: number[][] = [];
  for (const h of [...hours].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1];
    if (last && h === last[last.length - 1] + 1) last.push(h);
    else runs.push([h]);
  }
  return runs.map((r) => (r.length === 1 ? `${r[0]}h` : `${r[0]}–${r[r.length - 1]}h`)).join(', ');
};
