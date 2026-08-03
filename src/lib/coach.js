/**
 * Coaching analysis. Pure functions over logged sets — no network, no model calls.
 *
 * Everything here is deliberately conservative: it only claims something when the
 * data supports it, and it says why. That was the strongest part of the Base44
 * version and it survives the rebuild intact.
 */

/** Epley estimated 1RM. Fine up to ~10 reps, drifts optimistic beyond that. */
export const e1rm = (weightKg, reps) => (weightKg || 0) * (1 + (reps || 0) / 30);

/**
 * RIR at matched load, one point per session.
 *
 * The signal: hold weight × reps constant and watch effort. If RIR falls while the
 * load is unchanged, the same work is costing more — fatigue, not weakness. Comparing
 * raw RIR across different loads tells you nothing, which is why this only uses the
 * lifter's most-repeated weight × reps combination for that variant.
 *
 * @param {Array} sets     rows for ONE variant: { session_id, weight_kg, reps, rir }
 * @param {Object} dates   { [session_id]: ISO date string }
 * @param {Set}   excluded session ids the lifter excluded from analysis
 * @returns {Array<{sessionId,date,rir}>} chronological, [] when there's nothing honest to say
 */
export function matchedRirSeries(sets = [], dates = {}, excluded = new Set()) {
  const usable = sets.filter((s) => s.rir != null && !excluded.has(s.session_id));
  if (!usable.length) return [];

  const counts = {};
  for (const s of usable) {
    const key = `${s.weight_kg}|${s.reps}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  let modal = null, modalCount = 0;
  for (const [key, n] of Object.entries(counts)) {
    if (n > modalCount) { modalCount = n; modal = key; }
  }
  // one occurrence is a data point, not a trend
  if (!modal || modalCount < 2) return [];

  const bySession = {};
  for (const s of usable) {
    if (`${s.weight_kg}|${s.reps}` !== modal) continue;
    (bySession[s.session_id] = bySession[s.session_id] || []).push(s);
  }

  return Object.keys(bySession)
    .sort((a, b) => new Date(dates[a] || 0) - new Date(dates[b] || 0))
    .map((sessionId) => {
      const group = bySession[sessionId];
      const rir = group.reduce((a, s) => a + s.rir, 0) / group.length;
      return { sessionId, date: dates[sessionId], rir: Math.round(rir * 10) / 10 };
    });
}

/**
 * Is this lift stalled?
 * Needs at least three matched sessions and a full point of RIR lost. A single bad
 * session is not a plateau, and half a point is inside the noise of self-reported RIR.
 */
export function detectPlateau(series = []) {
  if (series.length < 3) return { stalled: false, reason: 'not enough matched sessions' };
  const drop = series[0].rir - series[series.length - 1].rir;
  const rirs = series.slice(-5).map((p) => p.rir);
  const mean = rirs.reduce((a, b) => a + b, 0) / rirs.length;
  const sd = Math.sqrt(rirs.reduce((a, b) => a + (b - mean) ** 2, 0) / rirs.length);

  return {
    stalled: drop >= 1,
    watch: drop >= 0.5 && drop < 1,
    drop: Math.round(drop * 10) / 10,
    sessions: series.length,
    stability: drop >= 1 ? 'declining' : sd >= 0.75 ? 'volatile' : 'stable',
  };
}

/**
 * Program-level check.
 *
 * The Base44 version diagnosed each exercise alone, so four lifts stalling in the same
 * fortnight became four unrelated plateaus. Across different movement patterns that is
 * almost never four problems — it's recovery. This looks for that.
 *
 * @param {Array} perVariant [{ variantId, name, series }]
 * @param {Array} readiness  [{ created_at, score }] chronological
 */
export function detectProgramPattern(perVariant = [], readiness = []) {
  const stalled = perVariant
    .map((v) => ({ ...v, verdict: detectPlateau(v.series) }))
    .filter((v) => v.verdict.stalled);

  if (stalled.length < 2) return { detected: false, stalled };

  // readiness moving the same way turns a coincidence into a diagnosis
  let readinessTrend = null;
  if (readiness.length >= 4) {
    const half = Math.floor(readiness.length / 2);
    const avg = (arr) => arr.reduce((a, r) => a + (r.score || 0), 0) / (arr.length || 1);
    readinessTrend = Math.round((avg(readiness.slice(half)) - avg(readiness.slice(0, half))) * 10) / 10;
  }

  return {
    detected: true,
    stalled,
    readinessTrend,
    confidence: stalled.length >= 3 && readinessTrend != null && readinessTrend < -0.5 ? 'high' : 'moderate',
  };
}

/**
 * Goal projection.
 *
 * Straight-line extrapolation says "+2 lb/week forever", which is false — gains
 * decelerate as you approach your ceiling. So this returns the linear number AND a
 * decay-adjusted range, and refuses to project at all when the rate isn't positive.
 *
 * The decay multipliers (1.4×–2.1×) are a deliberate blunt instrument. A per-lifter
 * model would be better, and needs more data than a new user has.
 */
export function projectGoal({ currentKg, targetKg, history = [], weeksObserved = 8 }) {
  if (!history.length) return { projectable: false, reason: 'no history' };

  const earlyWindow = history.slice(0, Math.max(1, Math.floor(history.length / 3)));
  const earlyBest = Math.max(...earlyWindow.map((s) => e1rm(s.weight_kg, s.reps)));
  const ratePerWeek = (currentKg - earlyBest) / weeksObserved;
  const gap = targetKg - currentKg;

  if (gap <= 0) return { projectable: false, achieved: true, ratePerWeek };
  if (ratePerWeek <= 0.1) {
    return {
      projectable: false,
      achieved: false,
      ratePerWeek: Math.round(ratePerWeek * 100) / 100,
      reason: 'no positive rate over the observed window — a projection here would be fiction',
    };
  }

  const linearWeeks = Math.ceil(gap / ratePerWeek);
  return {
    projectable: true,
    achieved: false,
    ratePerWeek: Math.round(ratePerWeek * 100) / 100,
    linearWeeks,
    decayWeeks: [Math.ceil(linearWeeks * 1.4), Math.ceil(linearWeeks * 2.1)],
    caveat: 'Linear pace assumes a constant rate forever. Strength decelerates near your ceiling, so treat the decay-adjusted range as the honest answer.',
  };
}

/** Sunday-start week containing `d`. */
export function weekRange(d = new Date()) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(d.getDate() - d.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return [start, end];
}

export function sessionVolumeKg(sets = []) {
  return sets.reduce((a, s) => a + (s.weight_kg || 0) * (s.reps || 0), 0);
}
