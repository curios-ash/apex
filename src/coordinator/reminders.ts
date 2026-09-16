// Renewal-reminder scheduling. The daily cron drafts one reminder action per
// obligation per threshold bucket (30/14/7 days out), idempotently. All date
// math is UTC day-granularity; dates are yyyy-mm-dd strings.

export const REMINDER_THRESHOLDS_DAYS = [30, 14, 7] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// Whole days from `from` to `to` (negative when `to` is in the past).
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((parseIsoDay(to) - parseIsoDay(from)) / DAY_MS);
}

// Which reminder bucket a days-until count falls in. Overdue counts as the
// tightest bucket, so a late-appearing obligation gets exactly one reminder
// instead of three at once.
export function reminderBucket(daysUntil: number): 30 | 14 | 7 | null {
  if (daysUntil <= 7) return 7;
  if (daysUntil <= 14) return 14;
  if (daysUntil <= 30) return 30;
  return null;
}

export interface ReminderDue {
  obligationId: string;
  thresholdDays: number;
}

// Given pending obligations and the reminders already drafted (any status —
// a rejected reminder is deliberately not re-drafted), returns the
// (obligation, threshold) pairs due today. At most one per obligation per
// run, and never the same pair twice.
export function remindersDue(
  pending: { id: string; dueDate: string }[],
  existing: { obligationId: string; thresholdDays: number }[],
  today: string,
): ReminderDue[] {
  const seen = new Set(existing.map((e) => `${e.obligationId}:${e.thresholdDays}`));
  const due: ReminderDue[] = [];
  for (const obligation of pending) {
    const bucket = reminderBucket(daysBetweenIso(today, obligation.dueDate));
    if (bucket === null) continue;
    if (seen.has(`${obligation.id}:${bucket}`)) continue;
    due.push({ obligationId: obligation.id, thresholdDays: bucket });
  }
  return due;
}
