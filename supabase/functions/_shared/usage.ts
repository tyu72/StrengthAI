/**
 * Usage-cap arithmetic, shared by resolve-exercise and coach-chat.
 *
 * This lives outside both functions and imports nothing, so the code the edge functions run
 * is the code the test suite exercises. That matters here more than usual: the cap this
 * replaces was never tested and, as a result, never fired once.
 *
 * The original read filtered `resolver_usage` on a `created_at` column that does not exist.
 * PostgREST returned an error, `count` came back `undefined`, and `undefined >= 400` is
 * false — so every call was permitted, forever, silently. The matching insert named a
 * `phrase` column that also does not exist and omitted the not-null `day`, so it failed
 * every time too, unchecked. Two broken halves that cancelled into a cap-shaped no-op.
 *
 * The lesson is `checkCap` fails CLOSED. A counter that cannot be read is not evidence of
 * zero usage; it is evidence of nothing, and spending money on it is how the last one went
 * unnoticed for months.
 */

export type UsageRow = { calls?: number | null };

export type CapCheck = {
  /** Safe to make the model call. */
  allow: boolean;
  /** Refused because the budget is spent — a normal, explainable state. */
  capped: boolean;
  /** Refused because the counter could not be read — a fault, not a budget. */
  failed: boolean;
};

/**
 * Read a cap from an env var, falling back to the hardcoded default when it is missing or
 * malformed.
 *
 * `Number(Deno.env.get(...) ?? '400')` looks harmless and is not: a typo'd secret yields
 * `NaN`, and `sum >= NaN` is false for every possible sum, so the cap silently stops
 * existing and every call bills. That is the same failure shape as the broken `created_at`
 * read — a limit that quietly permits everything, with nothing in the logs.
 *
 * The empty string is treated as unset rather than as zero, because `Number('')` is 0 and a
 * cleared secret should restore the default, not refuse every request.
 */
export function capFromEnv(raw: string | undefined | null, fallback: number, name: string): number {
  if (raw == null || raw.trim() === '') return fallback;

  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    // Loud, because the symptom otherwise is an unbounded bill nobody notices.
    console.warn(
      `[usage] ${name}=${JSON.stringify(raw)} is not a valid cap. Falling back to ${fallback}.`
    );
    return fallback;
  }
  return n;
}

/** UTC day key, matching the `day` column on both counter tables. */
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** First day of the UTC month containing `d`, as a day key. */
export function monthStartKey(d: Date = new Date()): string {
  return `${d.toISOString().slice(0, 7)}-01`;
}

/**
 * Total calls across a set of daily counter rows.
 *
 * Both tables store one row per user per day, so a monthly cap is a sum over at most 31
 * rows rather than a row count — counting rows would cap a heavy user at 31 calls and let
 * a light one run forever.
 */
export function sumCalls(rows: UsageRow[] | null | undefined): number {
  return (rows ?? []).reduce((total, r) => total + (Number(r?.calls) || 0), 0);
}

/**
 * May this user make a billable call?
 *
 * `error` is whatever the usage read returned. Passing it in is the point: the decision and
 * the failure mode live together, so a caller cannot accidentally treat an unreadable
 * counter as an empty one.
 */
export function checkCap(
  rows: UsageRow[] | null | undefined,
  error: unknown,
  cap: number
): CapCheck {
  if (error) return { allow: false, capped: false, failed: true };
  // Defence in depth behind `capFromEnv`. A non-finite cap means we do not know the limit,
  // and "unknown limit" must never resolve to "no limit" — that is exactly the bug this
  // module exists to prevent. Callers should use capFromEnv so this never fires.
  if (!Number.isFinite(cap)) {
    console.error(`[usage] refusing to bill against a non-numeric cap (${cap}).`);
    return { allow: false, capped: false, failed: true };
  }
  if (sumCalls(rows) >= cap) return { allow: false, capped: true, failed: false };
  return { allow: true, capped: false, failed: false };
}
