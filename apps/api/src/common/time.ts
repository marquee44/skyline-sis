import { IANAZone } from 'luxon';

/** True if `tz` is a valid IANA timezone name (e.g. "Asia/Dubai"). */
export function isValidTimezone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

/** "HH:mm" → minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
