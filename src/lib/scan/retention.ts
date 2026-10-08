/**
 * How long a scan's photo lives, how many scans a day a person gets, and how
 * long one analysis may stream.
 *
 * A meal photo tied to an account is personal data: it is kept
 * SCAN_PHOTO_RETENTION_DAYS and then deleted by the worker's hourly sweep —
 * the estimate stays. That number is a constant, not a knob: it is the number
 * the consent text promises. A scan that never finished (still `analyzing`,
 * or ended without food / with an error / cancelled) is removed with its
 * files after UNFINISHED_SCAN_TTL_HOURS.
 *
 * The daily cap (SCAN_DAILY_LIMIT, per user per UTC day) bounds the cost once
 * a provider bills per image. It stays env-driven and is read per call
 * (`scanDailyLimit()`, like SCAN_PACE_MS), so a gate can flip it for one
 * request. An unset, empty or malformed value is the default (Compose passes
 * `${VAR:-…}`); 0 or less switches scanning OFF — the honest 503
 * SCAN_UNAVAILABLE («Сканер скоро»), never a 429 that promises «tomorrow».
 *
 * SCAN_STREAM_DEADLINE_MS is the hard ceiling of one scan stream: past it the
 * run is cancelled and the socket closed, whatever the recognizer or the
 * client is doing (the route wires it through `withDeadline`).
 */
const DAY_MS = 24 * 3_600_000;

/**
 * Days a scan photo (and its thumb) is kept — the number the consent text
 * promises (`Legal.scan.p3`, bible §4.11); change it = a new
 * `SCAN_CONSENT_VERSION` + the pin test (`legal-text-pins.test.ts`).
 */
export const SCAN_PHOTO_RETENTION_DAYS = 30;

/** Scans per user per UTC day when SCAN_DAILY_LIMIT says nothing usable. */
export const DEFAULT_SCAN_DAILY_LIMIT = 50;

/** SCAN_DAILY_LIMIT when it is an integer, else 50. 0 or less = scanning is off (503, not 429). */
export function scanDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.SCAN_DAILY_LIMIT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_SCAN_DAILY_LIMIT;
  const n = Number(raw);
  return Number.isInteger(n) ? n : DEFAULT_SCAN_DAILY_LIMIT;
}

/** A scan still unfinished after this long is removed with its files. */
export const UNFINISHED_SCAN_TTL_HOURS = 24;

/** The hard deadline of one scan stream (the analysis plus its frames). A constant — no env. */
export const SCAN_STREAM_DEADLINE_MS = 120_000;

/** When a photo taken at `from` is deleted by the retention sweep. */
export function photoExpiresAt(from: Date): Date {
  return new Date(from.getTime() + SCAN_PHOTO_RETENTION_DAYS * DAY_MS);
}
