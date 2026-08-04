/**
 * Three-layer exercise resolution.
 *
 *   1. Local dictionary   — instant, free, works offline. Covers most input.
 *   2. Alias cache        — every phrase the AI has ever resolved, shared across users.
 *                           Instant and free from the second time anyone types it.
 *   3. AI (Edge Function) — reached only for phrasing neither layer has seen.
 *
 * The consequence: the app gets cheaper and faster the longer it is used, and layers 1
 * and 2 keep working with no signal — which matters, because gym basements have none and
 * a resolver that needs the internet fails exactly when you need it.
 *
 * Every path ends somewhere the lifter can still log the set. Refusing to record what
 * they did because the app doesn't recognise a phrase is never acceptable.
 */
import { supabase } from './db.js';
import { resolve as resolveLocal, isPlausibleExercise, rawBase, BASES, MODS } from '../lib/resolver.js';

const KNOWN_BASES = BASES.map((b) => b.k);
const KNOWN_MODS = MODS.map((m) => m.k);

/** Look the phrase up in the shared + personal alias cache. */
async function fromCache(phrase) {
  const { data, error } = await supabase
    .from('exercise_aliases')
    .select('*')
    .eq('phrase', phrase)
    // a personal row (from a low-confidence resolution) wins over the shared one
    .order('user_id', { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    console.warn('[resolver] alias cache unavailable', error.message);
    return null;
  }
  return data?.[0] ?? null;
}

/**
 * @param {string} text        what the lifter typed
 * @param {Array}  variants    their registry, for match/close scoring
 * @returns {Promise<object>}  a resolution the UI can render:
 *   { status, base, mods, match, note, source, confidence, reason? }
 *   status: 'match' | 'close' | 'new' | 'rejected' | 'unresolved'
 */
export async function resolveExercise(text, variants = []) {
  // ---- Layer 1: dictionary
  const local = resolveLocal(text, variants);

  // A confident dictionary answer accounts for every word typed. If some went
  // unexplained, the dictionary read the movement but not the whole description — the
  // difference between "barbell squat" and "heel elevated barbell squat" — so it must not
  // claim a match. Escalate, and keep the local reading only as an offline fallback.
  if (local.status !== 'unknown' && !local.needsAI) {
    return { ...local, source: 'dictionary', confidence: 'high' };
  }

  // Junk gate. Free, instant, and stops obvious garbage from costing a model call.
  const plausible = isPlausibleExercise(text);
  if (!plausible.ok) {
    return { status: 'rejected', reason: plausible.reason, raw: text, source: 'local' };
  }

  const phrase = rawBase(text);

  // ---- Layer 2: alias cache
  const cached = await fromCache(phrase);
  if (cached) {
    return scoreAgainstRegistry(
      {
        base: { k: cached.base, m: cached.muscle, p: cached.body_part },
        mods: cached.mods ?? [],
        note: cached.note ?? '',
        confidence: cached.confidence,
        source: 'cache',
      },
      variants,
      text
    );
  }

  // ---- Layer 3: AI
  try {
    const { data, error } = await supabase.functions.invoke('resolve-exercise', {
      body: {
        text,
        knownBases: KNOWN_BASES,
        knownMods: KNOWN_MODS,
        userBases: [...new Set(variants.map((v) => v.base))],
      },
    });

    if (error) throw error;

    if (data?.ok === false) {
      // The model judged it not an exercise, or the daily cap was hit. Both are honest
      // rejections with copy written for the lifter.
      return {
        status: data.capped ? 'unresolved' : 'rejected',
        reason: data.reason,
        raw: text,
        source: 'ai',
      };
    }

    return scoreAgainstRegistry(
      {
        base: { k: data.base, m: data.muscle, p: data.body_part },
        mods: data.mods ?? [],
        note: data.note ?? '',
        confidence: data.confidence,
        source: 'ai',
      },
      variants,
      text
    );
  } catch (err) {
    // Offline, function down, or out of credit. Never a dead end.
    console.warn('[resolver] AI fallback unavailable', err?.message ?? err);

    // If the dictionary got the movement and only some describing words were unclear,
    // fall back to that reading. The unexplained words are already folded in as a
    // modifier tag, so it lands as 'close' or 'new' against the registry rather than
    // silently merging into an existing trend line.
    if (local.status !== 'unknown') {
      return { ...local, source: 'offline', confidence: 'low' };
    }

    return {
      status: 'unresolved',
      reason: 'I could not reach the coach just now. Log it as typed — it still gets its own trend line.',
      raw: text,
      source: 'offline',
    };
  }
}

/**
 * Once a base and mods exist — from any layer — scoring against the lifter's registry is
 * identical, so match/close/new behaves the same whether the answer came from the
 * dictionary, the cache or the model.
 */
function scoreAgainstRegistry(resolved, variants, text) {
  const keys = [...resolved.mods].sort();
  let match = null;
  let score = -1;

  for (const v of variants.filter((v) => v.base === resolved.base.k)) {
    const denom = Math.max((v.mods || []).length, keys.length);
    const s = denom === 0 ? 1 : keys.filter((k) => (v.mods || []).includes(k)).length / denom;
    if (s > score) {
      score = s;
      match = v;
    }
  }

  let status = 'new';
  if (match && score >= 0.75) status = 'match';
  else if (match && score >= 0.3) status = 'close';

  return {
    status,
    base: resolved.base,
    mods: keys,
    match: status === 'new' ? null : match,
    score: Math.max(0, score),
    note: resolved.note,
    source: resolved.source,
    confidence: resolved.confidence,
    raw: text,
  };
}
