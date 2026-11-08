import type { Cadence } from "@/lib/db/schema";

/** Calendar maths for the editorial calendar. Days are YYYY-MM-DD in UTC. */

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** The next publish days for a cadence, starting from the first `weekday` (0 = Sunday) on or after `from`. */
export function cadenceDates(cadence: Cadence, from: Date, horizonDays: number, weekday = 2): string[] {
  if (cadence === "none") return [];
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const out: string[] = [];
  if (cadence === "monthly") {
    for (let i = 0; i < 12; i++) {
      const firstOfMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      const offset = (weekday - firstOfMonth.getUTCDay() + 7) % 7;
      const day = addDays(firstOfMonth, offset);
      if (day < start) continue;
      if (day.getTime() - start.getTime() > horizonDays * 86_400_000) break;
      out.push(ymd(day));
    }
    return out;
  }
  const step = cadence === "weekly" ? 7 : 14;
  let day = addDays(start, (weekday - start.getUTCDay() + 7) % 7);
  while (day.getTime() - start.getTime() <= horizonDays * 86_400_000) {
    out.push(ymd(day));
    day = addDays(day, step);
  }
  return out;
}

/** Weeks (Monday first) covering a month, for the calendar grid. */
export function monthGrid(year: number, month0: number): string[][] {
  const first = new Date(Date.UTC(year, month0, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  let day = addDays(first, -lead);
  const weeks: string[][] = [];
  do {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(ymd(day));
      day = addDays(day, 1);
    }
    weeks.push(week);
  } while (day.getUTCMonth() === month0);
  return weeks;
}

export function monthParam(raw: string | undefined, now = new Date()): { year: number; month0: number; key: string; prev: string; next: string; label: string } {
  const m = raw?.match(/^(\d{4})-(\d{2})$/);
  const year = m ? Number(m[1]) : now.getUTCFullYear();
  const month0 = m ? Number(m[2]) - 1 : now.getUTCMonth();
  const key = (y: number, mo: number) => {
    const d = new Date(Date.UTC(y, mo, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const label = new Date(Date.UTC(year, month0, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return { year, month0, key: key(year, month0), prev: key(year, month0 - 1), next: key(year, month0 + 1), label };
}
