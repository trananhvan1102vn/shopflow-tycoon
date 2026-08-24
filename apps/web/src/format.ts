export const usd = (cents: number): string =>
  (cents < 0 ? '-$' : '$') + Math.round(Math.abs(cents) / 100).toLocaleString('en-US');
export const gameTime = (minute: number): string => {
  const h = Math.floor(minute / 60) % 24, m = Math.floor(minute % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
export const dateStr = (c: { day: number; month: number }): string => `Ngày ${c.day} · Tháng ${c.month}`;
