import { calendar as CAL } from '@shopflow/data';

export interface EnvClock { minute: number; day: number; month: number }
type CalEvent = (typeof CAL.events)[number];

const inRange = (m: number, d: number, from: number[], to: number[]) =>
  m * 100 + d >= from[0] * 100 + from[1] && m * 100 + d <= to[0] * 100 + to[1];

export function activeEvents(month: number, day: number): CalEvent[] {
  return CAL.events.filter((e: any) => inRange(month, day, e.from, e.to));
}

const hits = (e: CalEvent, industryId: string) =>
  e.industries === 'all' || (e.industries as string[]).includes(industryId);

export function hourMult(minute: number): number {
  const h = Math.floor(minute / 60) % 24;
  if (CAL.hourly.peakHours.includes(h)) return 2; // flea/mall peakHourMult; social ×3 comes at màn 3
  if (CAL.hourly.nightHours.includes(h)) return CAL.hourly.nightMult;
  return 1;
}

export function trafficEnvMult(clock: EnvClock, industryId: string): number {
  let m = 1;
  if (CAL.weekendDays.includes(clock.day)) m *= CAL.weekend.trafficMult;
  if (clock.day === clock.month) m *= CAL.doubleDay.trafficMult;
  for (const e of activeEvents(clock.month, clock.day)) if (hits(e, industryId)) m *= e.trafficMult;
  return m;
}

export function retailEnvMult(clock: EnvClock, industryId: string): number {
  let m = 1;
  if (CAL.weekendDays.includes(clock.day)) m *= CAL.weekend.retailMult;
  if (clock.day === clock.month) m *= CAL.doubleDay.retailMult;
  for (const e of activeEvents(clock.month, clock.day))
    if (hits(e, industryId) && (e as any).retailMult) m *= (e as any).retailMult;
  return m;
}

export function wholesaleEnvMult(clock: EnvClock, industryId: string): number {
  let m = 1;
  if (CAL.weekendDays.includes(clock.day)) m *= CAL.weekend.wholesaleMult;
  for (const e of activeEvents(clock.month, clock.day))
    if (hits(e, industryId) && (e as any).wholesaleMult) m *= (e as any).wholesaleMult;
  return m;
}
