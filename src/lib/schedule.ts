/**
 * Suggested posting times per channel, in the founder's local time. These are
 * widely published engagement benchmarks for B2B audiences (weekday working
 * hours), not measurements of this founder's own audience — the UI says so,
 * and every suggested time can be changed.
 */
export type Channel = "web" | "x" | "linkedin" | "instagram";

type Slot = { days: number[]; hour: number; minute: number }; // days: 0=Sun … 6=Sat

export const BEST_TIMES: Record<Channel, { slots: Slot[]; why: string }> = {
  // The article goes up early so the posts have something to link to.
  web: { slots: [{ days: [1, 2, 3, 4], hour: 7, minute: 30 }], why: "Early on a weekday, before the posts that link to it" },
  linkedin: { slots: [{ days: [2, 3, 4], hour: 8, minute: 30 }], why: "Tue–Thu, 8–10 AM: professionals read before their first meetings" },
  x: { slots: [{ days: [1, 2, 3, 4, 5], hour: 9, minute: 30 }, { days: [1, 2, 3, 4, 5], hour: 12, minute: 15 }], why: "Weekdays mid-morning or lunchtime, when founders check X" },
  instagram: { slots: [{ days: [1, 2, 3, 4, 5], hour: 11, minute: 30 }, { days: [1, 2, 3, 4], hour: 19, minute: 0 }], why: "Weekday late morning or early evening" },
};

/** The next suggested slot strictly after `after`, in the runtime's local timezone. */
export function nextBestTime(channel: Channel, after: Date): Date {
  const { slots } = BEST_TIMES[channel];
  let best: Date | null = null;
  for (let day = 0; day < 14; day++) {
    for (const s of slots) {
      const d = new Date(after);
      d.setDate(d.getDate() + day);
      d.setHours(s.hour, s.minute, 0, 0);
      if (d > after && s.days.includes(d.getDay()) && (!best || d < best)) best = d;
    }
    if (best) return best;
  }
  return new Date(after.getTime() + 86_400_000);
}

/**
 * A full suggested plan: the article first, then each post at its channel's
 * next good slot after the article is live (at least 30 minutes later).
 */
export function suggestPlan(channels: Channel[], now: Date): Record<string, Date> {
  const web = nextBestTime("web", new Date(now.getTime() + 15 * 60_000));
  const plan: Record<string, Date> = { web };
  for (const c of channels) if (c !== "web") plan[c] = nextBestTime(c, new Date(web.getTime() + 30 * 60_000 - 1));
  return plan;
}
