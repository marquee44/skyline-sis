import { DateTime } from 'luxon';

export interface AvailabilityRuleLike {
  weekday: number; // 0=Sun … 6=Sat
  startTime: string; // "HH:mm" in `timezone`
  endTime: string;
  slotMinutes: number;
  timezone: string; // IANA
}

export interface Slot {
  startUtc: Date;
  endUtc: Date;
}

// Our schema uses 0=Sun…6=Sat; luxon uses 1=Mon…7=Sun. Map luxon → ours.
function luxonToOurWeekday(luxonWeekday: number): number {
  return luxonWeekday % 7; // Sun: 7%7=0, Mon:1, … Sat:6
}

/**
 * Generate bookable slots for an advisor between two calendar dates (inclusive),
 * honouring each rule's own IANA timezone so DST transitions are handled by
 * luxon rather than a fixed offset. All returned instants are UTC.
 *
 * @param fromISODate "YYYY-MM-DD" (interpreted per-rule timezone)
 * @param toISODate   "YYYY-MM-DD"
 * @param now         instants at or before this are dropped (no past slots)
 * @param taken       set of epoch-ms of already-reserved slot starts
 */
export function generateSlots(
  rules: AvailabilityRuleLike[],
  fromISODate: string,
  toISODate: string,
  now: Date,
  taken: Set<number> = new Set(),
): Slot[] {
  const slots: Slot[] = [];
  const nowMs = now.getTime();

  const start = DateTime.fromISO(fromISODate);
  const end = DateTime.fromISO(toISODate);
  if (!start.isValid || !end.isValid) return slots;

  for (let day = start; day <= end; day = day.plus({ days: 1 })) {
    const dateStr = day.toISODate(); // "YYYY-MM-DD"
    if (!dateStr) continue;

    for (const rule of rules) {
      // Build the day in the rule's timezone to get the correct weekday + offset.
      const dayInTz = DateTime.fromISO(dateStr, { zone: rule.timezone });
      if (!dayInTz.isValid) continue;
      if (luxonToOurWeekday(dayInTz.weekday) !== rule.weekday) continue;

      let cursor = DateTime.fromISO(`${dateStr}T${rule.startTime}`, { zone: rule.timezone });
      const windowEnd = DateTime.fromISO(`${dateStr}T${rule.endTime}`, { zone: rule.timezone });
      if (!cursor.isValid || !windowEnd.isValid) continue;

      while (cursor.plus({ minutes: rule.slotMinutes }) <= windowEnd) {
        const slotEnd = cursor.plus({ minutes: rule.slotMinutes });
        const startUtc = cursor.toUTC().toJSDate();
        if (startUtc.getTime() > nowMs && !taken.has(startUtc.getTime())) {
          slots.push({ startUtc, endUtc: slotEnd.toUTC().toJSDate() });
        }
        cursor = slotEnd;
      }
    }
  }

  // De-duplicate (overlapping rules) and sort chronologically.
  const byStart = new Map<number, Slot>();
  for (const s of slots) byStart.set(s.startUtc.getTime(), s);
  return [...byStart.values()].sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
}
