/**
 * When plugin jobs (api.schedule) are due. Pure, unit-tested. Times are judged in India Standard Time:
 * hourly jobs run once per clock hour, daily jobs once per day from 06:00 IST.
 */
export type JobEvery = "hourly" | "daily";

export const DAILY_JOB_HOUR_IST = 6;
const IST_OFFSET_MS = 5.5 * 3600_000;

/** "2026-11-18T09" in IST. */
const istHour = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 13);
const istDay = (d: Date) => istHour(d).slice(0, 10);

export function isJobDue(every: JobEvery, lastRunAt: Date | null, now: Date) {
  if (every === "hourly") return !lastRunAt || istHour(lastRunAt) < istHour(now);
  const hourNow = Number(istHour(now).slice(11, 13));
  if (hourNow < DAILY_JOB_HOUR_IST) return false;
  return !lastRunAt || istDay(lastRunAt) < istDay(now);
}
