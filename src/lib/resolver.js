/**
 * Exercise vocabulary and input hygiene.
 *
 * ARCHITECTURE NOTE — read this before adding anything here.
 *
 * This file used to be a matching engine: it parsed free text against a hand-written
 * dictionary of movements and modifiers, and answered FIRST, with the model consulted only
 * when it drew a blank. That was backwards, and every serious resolver bug came from it —
 * fifty-odd hand-written aliases outranking the model on any phrase they happened to touch.
 * "heel elevated barbell squat" resolved as a plain barbell squat and silently merged two
 * different lifts into one trend line. "jm press" resolved as a tricep extension because
 * someone had written that alias by hand.
 *
 * The model is the authority now. What survives here is VOCABULARY, not matching: the
 * canonical strings the model is told to reuse so that two sessions describing the same
 * lift six weeks apart produce identical tags. That is the actual hard problem. Identifying
 * a Zottman curl is easy; making "SLDL", "stiff-legged deadlift" and "straight leg deads"
 * converge on one trend line is what keeps the coaching honest.
 *
 * Speed and cost are the cache's job (`exercise_aliases`), not this file's.
 *
 * DO NOT add alias lists or matching logic here. If the model gets something wrong, fix the
 * prompt or the vocabulary — never add a hand-written override.
 */

/**
 * Canonical movement names. The model is told to reuse one of these when it fits and to
 * invent a new name only when nothing does. This is a convergence aid, NOT a whitelist —
 * a movement missing from this list still resolves fine.
 */
export const VOCAB_BASES = [
  // chest
  'bench press', 'incline press', 'decline press', 'chest press', 'chest fly', 'push-up', 'dip',
  // shoulders
  'overhead press', 'push press', 'arnold press', 'lateral raise', 'front raise',
  'upright row', 'rear delt fly', 'face pull',
  // back
  'lat pulldown', 'straight-arm pulldown', 'pull-up', 'row', 'pullover', 'shrug',
  'back extension', 'good morning',
  // arms
  'curl', 'reverse curl', 'preacher curl', 'wrist curl', 'tricep extension', 'pushdown',
  'tricep kickback', 'skull crusher', 'jm press',
  // legs
  'squat', 'leg press', 'hack squat', 'leg extension', 'romanian deadlift', 'deadlift',
  'rack pull', 'hamstring curl', 'nordic curl', 'hip thrust', 'glute kickback',
  'hip abduction', 'hip adduction', 'lunge', 'split squat', 'step-up', 'calf raise',
  // core
  'crunch', 'leg raise', 'ab wheel', 'plank', 'pallof press', 'woodchop', 'back extension',
  // full body
  'clean', 'snatch', 'thruster', 'farmer carry', 'sled push', 'kettlebell swing',
];

/**
 * Canonical modifier strings, grouped by the dimension they vary. Grouping matters: the
 * model is told a variant may carry at most one modifier per group, which stops it
 * returning both "seated" and "standing", or both "rope" and "straight bar".
 */
export const VOCAB_MODS = {
  implement: ['barbell', 'dumbbell', 'cable', 'machine', 'smith machine', 'kettlebell',
    'plate loaded', 'bodyweight', 'band', 'landmine', 'trap bar', 'ez bar', 'safety bar'],
  attachment: ['rope', 'straight bar', 'v-bar', 'single handle', 'cuff', 'wide bar',
    'lat bar', 'stirrup'],
  grip: ['narrow grip', 'wide grip', 'neutral grip', 'supinated', 'pronated', 'mixed grip',
    'false grip', 'hook grip'],
  stance: ['feet up', 'heel elevated', 'toes elevated', 'sumo', 'conventional', 'staggered',
    'wide stance', 'narrow stance', 'b stance'],
  angle: ['seated', 'standing', 'lying', 'prone', 'incline', 'decline', 'chest supported',
    'bent over', 'kneeling', 'high to low', 'low to high', 'behind the neck', 'front rack',
    'zercher', 'overhead'],
  tempo: ['paused', 'slow eccentric', 'explosive', 'cluster', '1.5 rep'],
  rom: ['deficit', 'partial', 'lengthened partial', 'pin', 'block', 'floor', 'full rom'],
  load: ['banded', 'chains', 'accommodating resistance'],
  side: ['single arm', 'single leg', 'alternating'],
};

/** Flat list, for prompt construction and validation. */
export const ALL_MODS = Object.values(VOCAB_MODS).flat();

/**
 * Canonical muscle names. This is the vocabulary that makes cross-movement fatigue
 * detection possible — if the model calls it "tricep" one week and "triceps brachii" the
 * next, weekly volume per muscle becomes meaningless.
 */
export const MUSCLES = [
  'pectorals', 'upper chest',
  'lats', 'upper back', 'traps', 'lower back',
  'front delts', 'side delts', 'rear delts',
  'biceps', 'triceps', 'brachialis', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
  'abs', 'obliques',
];

/**
 * Broad grouping, for weekly training goals.
 *
 * Widened from the original chest/back/arms/legs. Shoulders were being filed under arms and
 * core had nowhere to go at all, which made per-muscle volume dishonest the moment anyone
 * trained delts directly.
 */
export const BODY_PARTS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'];

/** Which body part a muscle rolls up into. */
export const MUSCLE_TO_PART = {
  pectorals: 'chest', 'upper chest': 'chest',
  lats: 'back', 'upper back': 'back', traps: 'back', 'lower back': 'back',
  'front delts': 'shoulders', 'side delts': 'shoulders', 'rear delts': 'shoulders',
  biceps: 'arms', triceps: 'arms', brachialis: 'arms', forearms: 'arms',
  quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs',
  adductors: 'legs', abductors: 'legs',
  abs: 'core', obliques: 'core',
};

/**
 * Set-counting weight per role. A secondary muscle takes real but partial stimulus, and
 * counting it as a full set would make every pressing movement look like shoulder volume.
 * Half is the usual convention in the hypertrophy literature and it is honest enough for
 * "you have done 14 sets of chest this week".
 */
export const ROLE_WEIGHT = { primary: 1, secondary: 0.5 };

/** Lowercase, collapse whitespace, strip punctuation. The cache key. */
export function normalizePhrase(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Looser key, for comparing two phrases to each other — NOT for the cache.
 *
 * `normalizePhrase` keeps hyphens, because canonical names contain them (`push-up`,
 * `straight-arm pulldown`, `v-bar`) and the cache key has to be stable. But a lifter who
 * writes "feet-up bench" one week and "feet up bench" the next means the same lift, and an
 * exact-match gate that says otherwise sends them to the model for a phrase they already
 * have. Folding hyphens to spaces here fixes the comparison without touching the key.
 */
function matchKey(text) {
  return normalizePhrase(text).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Title-cased movement name for display. Modifiers render as chips, not in the name. */
export function canonicalLabel(base) {
  return String(base || '')
    .split(' ')
    .map((w) => (w.length <= 2 && w !== 'ab' ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * Free junk filter, client-side, before anything costs money.
 *
 * Deliberately permissive: it only rejects input that CANNOT be an exercise. Anything
 * plausible goes to the model, which is far better at judging than a regex. The model's own
 * refusal is the real filter; this just stops keyboard mashing and obvious nonsense from
 * being billable.
 */
export function isPlausibleExercise(text) {
  const t = normalizePhrase(text);
  if (!t) return { ok: false, reason: 'Type what you did.' };
  if (t.length < 3) return { ok: false, reason: 'A bit more detail — name the movement.' };
  if (t.length > 120) return { ok: false, reason: 'Too long. Just name the movement and how you did it.' };
  // A run of consonants this long is keyboard mashing, not a word. Five rather than six:
  // "asdfgh" is a home-row smash whose "sdfgh" is exactly five.
  //
  // There is deliberately NO "must contain a vowel" rule. Lifters type abbreviations —
  // SLDL, RDL, OHP, BSS — and every one of them is vowel-free. Rejecting those locally
  // would be the same mistake as the old dictionary: a hand-written rule overruling the
  // model on input it would have handled correctly. Vowel-free mashing ("xzcvbnm") is
  // caught by the consonant run anyway, which is the honest signal.
  if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(t)) {
    return { ok: false, reason: "That does not look like an exercise." };
  }
  if (/^(.)\1+$/.test(t.replace(/\s/g, ''))) {
    return { ok: false, reason: "That does not look like an exercise." };
  }
  return { ok: true };
}

/**
 * Autocomplete from the lifter's own history. Free, offline, and the fastest path for
 * anything they train regularly — most logging should never reach the model at all.
 */
export function suggest(text, variants = [], limit = 8) {
  const q = matchKey(text);
  const ranked = [...variants].sort((a, b) => (b.uses || 0) - (a.uses || 0));
  if (!q) return ranked.slice(0, limit);

  const words = q.split(' ').filter((w) => w.length > 1);
  const scored = ranked
    .map((v) => {
      const hay = matchKey(
        `${v.base} ${(v.mods || []).join(' ')} ${v.source_text || ''} ${v.muscle || ''}`
      );
      const hits = words.filter((w) => hay.includes(w)).length;
      // Exactness is judged against what identifies the variant — the phrase they typed, or
      // its full tag set — never the whole haystack. The haystack also carries the muscle,
      // so it can essentially never equal the query, which silently disabled this tie-break
      // and let a more-used near-match outrank an exact one ("bench press" landing on the
      // feet-up narrow-grip variant instead of the plain one).
      const exact =
        matchKey(v.source_text || '') === q ||
        matchKey(`${v.base} ${(v.mods || []).join(' ')}`) === q
          ? 1
          : 0;
      return { v, hits, exact };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.exact - a.exact || b.hits - a.hits || (b.v.uses || 0) - (a.v.uses || 0));

  return scored.slice(0, limit).map((s) => s.v);
}

/**
 * Has this lifter logged this exact phrase before?
 *
 * The zero-cost, zero-latency path — checked against variants already in memory, so a
 * repeated exercise resolves instantly and offline. `source_text` is what they originally
 * typed, so this hits whenever they describe it the same way twice.
 */
export function findLocal(text, variants = []) {
  const q = matchKey(text);
  if (!q) return null;
  return variants.find((v) => matchKey(v.source_text || '') === q) || null;
}

/** Set counts per muscle across a list of resolved variants. Drives per-muscle volume. */
export function muscleSetCounts(sets = [], variantsById = {}) {
  const counts = {};
  for (const s of sets) {
    const variant = variantsById[s.variant_id];
    if (!variant) continue;
    const muscles = Array.isArray(variant.muscles) ? variant.muscles : [];
    for (const m of muscles) {
      const weight = ROLE_WEIGHT[m.role] ?? 0;
      if (!weight) continue;
      counts[m.name] = (counts[m.name] || 0) + weight;
    }
  }
  return counts;
}
