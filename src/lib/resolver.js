/**
 * Freeform exercise resolver.
 *
 * Turns what a lifter types ("single arm cuff tricep extension") into a canonical
 * variant so trends stay continuous across sessions. No network, no model calls,
 * fully deterministic — this runs offline and costs nothing.
 *
 * The problem it solves: an exercise database can't express "cuff instead of rope"
 * or "feet up", but those change the load meaningfully. Free text can express them;
 * the cost is that "feet up narrow grip bench" and "narrow-grip bench, feet elevated"
 * are different strings for the same thing. This module collapses them.
 *
 *   parse(text)                  -> { base, mods }
 *   resolve(text, variants)      -> { status, base, mods, match, score, note }
 *   canonicalLabel(base)         -> "Bench Press"  (mods render as chips, not in the name)
 *
 * status is one of:
 *   'match'   — same variant, keep logging to the existing trend line
 *   'close'   — same movement, different enough modifiers that loads aren't comparable
 *   'new'     — nothing like it in the registry
 *   'unknown' — the movement isn't in the vocabulary below
 *
 * IMPORTANT: 'unknown' is not a rejection. The dictionary being short is the app's
 * problem, not the lifter's — the UI must offer "log it as typed", which creates a
 * variant whose `base` is the normalised raw text. It gets a real trend line, and
 * future identical descriptions match into it. Never block logging mid-workout.
 */

/** Movement vocabulary. `a` holds aliases; every word in an alias must appear in the input. */
export const BASES = [
  // chest
  { k: 'bench press',       a: ['bench press', 'bench', 'flat press'],                                                m: 'pectorals',       p: 'chest' },
  { k: 'incline press',     a: ['incline press', 'incline bench'],                                                    m: 'pectorals',       p: 'chest' },
  { k: 'decline press',     a: ['decline press', 'decline bench'],                                                    m: 'pectorals',       p: 'chest' },
  { k: 'chest press',       a: ['chest press'],                                                                       m: 'pectorals',       p: 'chest' },
  { k: 'push-up',           a: ['push up', 'pushup', 'press up'],                                                     m: 'pectorals',       p: 'chest' },
  { k: 'chest fly',         a: ['chest fly', 'fly', 'flye', 'pec deck', 'pec dec'],                                   m: 'pectorals',       p: 'chest' },
  { k: 'dip',               a: ['dip', 'dips'],                                                                       m: 'triceps',         p: 'arms'  },

  // shoulders
  { k: 'overhead press',    a: ['overhead press', 'ohp', 'shoulder press', 'military press', 'strict press'],          m: 'delts',           p: 'arms'  },
  { k: 'push press',        a: ['push press'],                                                                        m: 'delts',           p: 'arms'  },
  { k: 'arnold press',      a: ['arnold press'],                                                                      m: 'delts',           p: 'arms'  },
  { k: 'lateral raise',     a: ['lateral raise', 'side raise', 'lat raise', 'side lateral'],                           m: 'delts',           p: 'arms'  },
  { k: 'front raise',       a: ['front raise'],                                                                       m: 'delts',           p: 'arms'  },
  { k: 'upright row',       a: ['upright row'],                                                                       m: 'delts',           p: 'arms'  },
  { k: 'rear delt fly',     a: ['rear delt fly', 'reverse fly', 'rear delt', 'reverse pec deck'],                      m: 'delts',           p: 'arms'  },
  { k: 'face pull',         a: ['face pull'],                                                                         m: 'upper back',      p: 'back'  },

  // back
  { k: 'lat pulldown',      a: ['lat pulldown', 'pulldown', 'lat pull down'],                                         m: 'lats',            p: 'back'  },
  { k: 'straight-arm pulldown', a: ['straight arm pulldown', 'straight arm pull down'],                                m: 'lats',            p: 'back'  },
  { k: 'pull-up',           a: ['pull up', 'pullup', 'chin up', 'chinup'],                                            m: 'lats',            p: 'back'  },
  { k: 'row',               a: ['row', 'barbell row', 'cable row', 'seated row', 't bar row', 'chest supported row', 'pendlay row', 'meadows row'], m: 'upper back', p: 'back' },
  { k: 'pullover',          a: ['pullover'],                                                                          m: 'lats',            p: 'back'  },
  { k: 'shrug',             a: ['shrug'],                                                                             m: 'traps',           p: 'back'  },
  { k: 'back extension',    a: ['back extension', 'hyperextension', 'hyper extension'],                               m: 'spinal erectors', p: 'back'  },
  { k: 'good morning',      a: ['good morning'],                                                                      m: 'hamstrings',      p: 'back'  },

  // arms
  { k: 'curl',              a: ['curl', 'bicep curl', 'biceps curl', 'preacher curl', 'hammer curl', 'concentration curl', 'spider curl', 'drag curl'], m: 'biceps', p: 'arms' },
  { k: 'reverse curl',      a: ['reverse curl'],                                                                      m: 'forearms',        p: 'arms'  },
  { k: 'wrist curl',        a: ['wrist curl', 'forearm curl'],                                                        m: 'forearms',        p: 'arms'  },
  { k: 'tricep extension',  a: ['tricep extension', 'triceps extension', 'overhead extension', 'skull crusher', 'skullcrusher', 'french press', 'jm press'], m: 'triceps', p: 'arms' },
  { k: 'pushdown',          a: ['pushdown', 'push down', 'press down', 'pressdown'],                                  m: 'triceps',         p: 'arms'  },
  { k: 'tricep kickback',   a: ['kickback', 'tricep kickback'],                                                       m: 'triceps',         p: 'arms'  },

  // legs
  { k: 'squat',             a: ['squat', 'back squat', 'front squat', 'hack squat', 'goblet squat', 'belt squat'],     m: 'quads',           p: 'legs'  },
  { k: 'leg press',         a: ['leg press'],                                                                         m: 'quads',           p: 'legs'  },
  { k: 'leg extension',     a: ['leg extension', 'knee extension', 'quad extension'],                                 m: 'quads',           p: 'legs'  },
  { k: 'romanian deadlift', a: ['romanian deadlift', 'rdl', 'stiff leg deadlift'],                                    m: 'hamstrings',      p: 'legs'  },
  { k: 'deadlift',          a: ['deadlift', 'rack pull'],                                                             m: 'hamstrings',      p: 'legs'  },
  { k: 'hamstring curl',    a: ['hamstring curl', 'leg curl', 'ham curl'],                                            m: 'hamstrings',      p: 'legs'  },
  { k: 'nordic curl',       a: ['nordic curl', 'nordic ham curl'],                                                    m: 'hamstrings',      p: 'legs'  },
  { k: 'hip thrust',        a: ['hip thrust', 'glute bridge'],                                                        m: 'glutes',          p: 'legs'  },
  { k: 'glute kickback',    a: ['glute kickback', 'cable kickback', 'hip extension'],                                 m: 'glutes',          p: 'legs'  },
  { k: 'hip abduction',     a: ['hip abduction', 'abduction', 'abductor'],                                            m: 'glutes',          p: 'legs'  },
  { k: 'hip adduction',     a: ['hip adduction', 'adduction', 'adductor'],                                            m: 'adductors',       p: 'legs'  },
  { k: 'lunge',             a: ['lunge', 'split squat', 'bulgarian split squat'],                                     m: 'quads',           p: 'legs'  },
  { k: 'step-up',           a: ['step up', 'stepup'],                                                                 m: 'quads',           p: 'legs'  },
  { k: 'calf raise',        a: ['calf raise', 'calve raise', 'calf press'],                                           m: 'calves',          p: 'legs'  },

  // core and full body — body_part is null; the four weekly-goal categories are
  // chest/back/arms/legs, and the schema's check constraint permits null.
  { k: 'crunch',            a: ['crunch', 'cable crunch', 'sit up', 'situp'],                                         m: 'abs',             p: null    },
  { k: 'leg raise',         a: ['leg raise', 'hanging leg raise', 'knee raise'],                                      m: 'abs',             p: null    },
  { k: 'ab wheel',          a: ['ab wheel', 'ab rollout', 'rollout'],                                                 m: 'abs',             p: null    },
  { k: 'plank',             a: ['plank'],                                                                             m: 'abs',             p: null    },
  { k: 'pallof press',      a: ['pallof press', 'pallof'],                                                            m: 'obliques',        p: null    },
  { k: 'woodchop',          a: ['woodchop', 'wood chop'],                                                             m: 'obliques',        p: null    },
  { k: 'clean',             a: ['clean', 'power clean', 'hang clean'],                                                 m: 'full body',       p: null    },
  { k: 'snatch',            a: ['snatch', 'power snatch'],                                                            m: 'full body',       p: null    },
  { k: 'thruster',          a: ['thruster'],                                                                          m: 'full body',       p: null    },
  { k: 'farmer carry',      a: ['farmer carry', 'farmers carry', 'farmer walk', 'suitcase carry'],                     m: 'traps',           p: null    },
  { k: 'sled push',         a: ['sled push', 'prowler push', 'sled'],                                                 m: 'quads',           p: null    },
];

/**
 * Modifier vocabulary. `c` groups them so the UI can order chips sensibly.
 * `n` is the loading explanation shown to the lifter — this is what makes a fork
 * feel like a reason rather than a bug.
 */
export const MODS = [
  { k: 'narrow grip',     c: 'grip',       a: ['narrow grip', 'close grip'],                          n: 'Close grip shortens the shoulder moment arm and hands work to the triceps — usually 5–10% under your standard-grip top set at the same effort.' },
  { k: 'wide grip',       c: 'grip',       a: ['wide grip'],                                          n: 'Wide grip lengthens the chest moment arm but cuts range of motion. Heavier per rep, shorter stroke.' },
  { k: 'neutral grip',    c: 'grip',       a: ['neutral grip', 'hammer grip', 'parallel grip'],       n: 'Neutral grip is elbow-friendly and usually runs slightly stronger than pronated.' },
  { k: 'supinated',       c: 'grip',       a: ['supinated', 'underhand', 'reverse grip'],             n: 'Underhand pulls more biceps into the movement — its own strength curve.' },
  { k: 'thumbless',       c: 'grip',       a: ['thumbless', 'false grip', 'suicide grip'],            n: '' },
  { k: 'straps',          c: 'grip',       a: ['straps', 'with straps'],                              n: 'Straps take grip out of the equation, so the number reflects the target muscle rather than your hands — not comparable to strapless sets.' },
  { k: 'feet up',         c: 'stance',     a: ['feet up', 'feet elevated', 'legs up', 'feet on bench'], n: 'No leg drive and a narrower base. The pattern looks identical but the ceiling is lower — comparing it to a standard bench would read as a false plateau.' },
  { k: 'sumo',            c: 'stance',     a: ['sumo'],                                               n: 'Wider stance, shorter bar path, more hip-dominant.' },
  { k: 'staggered',       c: 'stance',     a: ['staggered', 'b stance'],                              n: 'One side does the work while the trail leg stabilizes — counts as unilateral volume.' },
  { k: 'heel elevated',   c: 'stance',     a: ['heel elevated', 'heels elevated', 'heel raised', 'heels raised', 'on plates', 'squat shoes'], n: 'Raising the heels lets the knee travel further forward and keeps the torso upright, shifting the work onto the quads. It usually runs heavier than the same squat flat-footed, so the two are not comparable loads.' },
  { k: 'toes elevated',   c: 'stance',     a: ['toes elevated', 'toe elevated', 'toes raised'],       n: 'Raising the toes does the reverse — the shin stays vertical, knee travel is limited and the hips take more of the lift. Expect a lighter bar than flat-footed at the same effort.' },
  { k: 'close stance',    c: 'stance',     a: ['close stance', 'narrow stance'],                      n: '' },
  { k: 'wide stance',     c: 'stance',     a: ['wide stance'],                                        n: '' },
  { k: 'cuff',            c: 'attachment', a: ['cuff', 'ankle cuff', 'wrist cuff'],                   n: 'A cuff bypasses the grip and moves the load point higher up the forearm. Shorter moment arm at the elbow, so the stack runs heavier than a rope for the same triceps tension.' },
  { k: 'rope',            c: 'attachment', a: ['rope'],                                               n: 'Rope allows end-range pronation and a longer moment arm at lockout — lighter stack for the same effort than a bar or cuff.' },
  { k: 'straight bar',    c: 'attachment', a: ['straight bar', 'bar attachment'],                     n: 'Fixed pronation and a locked hand path — usually the heaviest pushdown attachment.' },
  { k: 'ez bar',          c: 'attachment', a: ['ez bar', 'ezbar'],                                    n: 'Semi-supinated wrist angle, slightly less biceps peak tension than a straight bar.' },
  { k: 'v-bar',           c: 'attachment', a: ['v bar', 'vbar'],                                      n: '' },
  { k: 'single handle',   c: 'attachment', a: ['single handle', 'd handle', 'stirrup'],               n: '' },
  { k: 'single arm',      c: 'side',       a: ['single arm', 'one arm', 'unilateral'],                n: 'One arm at a time: one fewer chain to stabilize and no bilateral deficit, so per-side load is not half the two-arm number.' },
  { k: 'single leg',      c: 'side',       a: ['single leg', 'one leg'],                              n: 'Per-side load with a much higher stability cost.' },
  { k: 'dumbbell',        c: 'implement',  a: ['dumbbell', 'dumbbells', 'db'],                        n: 'Per-hand load with a higher stabilizer demand than the barbell equivalent.' },
  { k: 'barbell',         c: 'implement',  a: ['barbell', 'bb'],                                      n: '' },
  { k: 'cable',           c: 'implement',  a: ['cable'],                                              n: 'Constant tension across the range — stack numbers are not comparable to free weight.' },
  { k: 'machine',         c: 'implement',  a: ['machine', 'selectorized'],                            n: 'Fixed path; the machine carries the stability, so loads run higher than free weight.' },
  { k: 'plate loaded',    c: 'implement',  a: ['plate loaded', 'plateloaded', 'hammer strength', 'iso lateral'], n: 'Plate-loaded machines report the plates you hung, not the resistance at your hands — leverage and carriage weight mean this number is only comparable to itself.' },
  { k: 'smith',           c: 'implement',  a: ['smith machine', 'smith'],                             n: 'Fixed bar path removes the balance requirement.' },
  { k: 'kettlebell',      c: 'implement',  a: ['kettlebell', 'kb'],                                   n: '' },
  { k: 'seated',          c: 'angle',      a: ['seated'],                                             n: '' },
  { k: 'standing',        c: 'angle',      a: ['standing'],                                           n: '' },
  { k: 'incline',         c: 'angle',      a: ['incline'],                                            n: 'On an incline the stretched position carries the load, which usually means a lighter weight than the flat or standing version.' },
  { k: 'decline',         c: 'angle',      a: ['decline'],                                            n: '' },
  { k: 'preacher',        c: 'angle',      a: ['preacher'],                                           n: 'The pad blocks any swing and puts peak tension in the stretched position — expect less load than a standing curl.' },
  { k: 'spider',          c: 'angle',      a: ['spider'],                                             n: '' },
  { k: 'chest supported', c: 'angle',      a: ['chest supported'],                                    n: 'Chest support removes torso fatigue — pure back stimulus, higher usable load.' },
  { k: 'bent over',       c: 'angle',      a: ['bent over'],                                          n: '' },
  { k: 'lying',           c: 'angle',      a: ['lying', 'prone'],                                     n: '' },
  { k: 'high to low',     c: 'angle',      a: ['high to low'],                                        n: 'Cable line from above biases the lower/sternal fibres.' },
  { k: 'low to high',     c: 'angle',      a: ['low to high'],                                        n: 'Cable line from below biases the clavicular fibres.' },
  { k: 'paused',          c: 'tempo',      a: ['paused', 'pause'],                                    n: 'A pause kills the stretch reflex. Same weight, different stimulus — it gets its own trend line on purpose.' },
  { k: 'slow eccentric',  c: 'tempo',      a: ['slow eccentric', 'tempo', 'controlled eccentric'],    n: 'Longer time under tension at a lower absolute load.' },
  { k: 'deficit',         c: 'rom',        a: ['deficit'],                                            n: 'Extra range at the bottom — expect a lower load than the standard version.' },
  { k: 'pin',             c: 'rom',        a: ['pins', 'rack pull', 'pin press'],                     n: 'Dead-stop from pins removes elastic energy.' },
  { k: 'partial',         c: 'rom',        a: ['partial', 'partials', 'lengthened partial'],          n: 'Shortened range, higher load — not comparable to full-ROM sets.' },
  { k: 'assisted',        c: 'load',       a: ['assisted'],                                           n: 'Assistance is subtracted from bodyweight, so the number goes DOWN as you get stronger. This trend line runs backwards from every other one.' },
  { k: 'weighted',        c: 'load',       a: ['weighted', 'added weight'],                           n: 'Added load on top of bodyweight — only the added weight is tracked, so bodyweight changes move this trend without any change in strength.' },
  { k: 'bodyweight',      c: 'load',       a: ['bodyweight', 'body weight'],                          n: '' },
  { k: 'banded',          c: 'load',       a: ['banded', 'with bands', 'bands'],                      n: 'Accommodating resistance: bar weight alone understates the top-end load.' },
  { k: 'chains',          c: 'load',       a: ['chains'],                                             n: '' },
];

const MOD_ORDER = ['side', 'implement', 'attachment', 'grip', 'stance', 'angle', 'tempo', 'rom', 'load'];

/**
 * Words that carry no loading information, so leaving them unexplained shouldn't trigger
 * an AI call. Everything else the lifter types must be accounted for.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'with', 'of', 'for', 'to', 'at', 'in', 'on', 'my', 'me',
  'using', 'use', 'used', 'plus', 'both', 'set', 'sets', 'rep', 'reps', 'x', 'then',
  'from', 'some', 'it', 'today', 'warmup', 'warm', 'superset', 'first', 'last',
  'second', 'third', 'heavy', 'light', 'easy', 'hard', 'quick', 'normal', 'regular',
  'standard', 'usual',
]);

/**
 * Every word that appears in a movement name. These are the nouns lifts are built from
 * ("press", "row", "curl"), so an unmatched one means the dictionary is missing a
 * variation of something it knows — not that the lifter described a load the app can't
 * account for. "landmine press" is missing 'landmine', not 'press'.
 */
const BASE_VOCAB = new Set(
  BASES.flatMap((b) => [b.k, ...b.a]).flatMap((phrase) => phrase.split(' '))
);

/** Thresholds. Tune these if matching feels too eager or too shy. */
export const MATCH_THRESHOLD = 0.75;
export const CLOSE_THRESHOLD = 0.30;

const normalize = (t) =>
  ' ' + String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

/** Every word of the alias must be present (order-independent, so "incline dumbbell press" hits "incline press"). */
const hasAll = (text, alias) =>
  alias.split(' ').every((w) => text.includes(` ${w} `) || text.includes(` ${w}s `));

/**
 * Free text -> movement + modifiers + anything left unaccounted for.
 *
 * `unexplained` is the important one. A dictionary that silently drops the words it
 * doesn't know will read "heel elevated barbell squat" as a plain barbell squat and merge
 * two genuinely different lifts into one trend line — invisibly, at full confidence. So
 * every word has to be either consumed by the matched movement, consumed by a matched
 * modifier, or a stopword. Anything else means the dictionary did NOT fully understand
 * the input, and the AI layer has to decide.
 */
export function parse(text) {
  const t = normalize(text);

  // longest matching alias wins, so "hamstring curl" beats "curl"
  let base = null, best = 0, baseAlias = '';
  for (const b of BASES) {
    for (const alias of b.a) {
      if (hasAll(t, alias) && alias.length > best) { best = alias.length; base = b; baseAlias = alias; }
    }
  }

  const baseWords = base ? base.k.split(' ') : [];

  // track which alias matched each modifier, so we know which words it accounts for
  const hits = [];
  for (const m of MODS) {
    const alias = m.a.find((a) => hasAll(t, a));
    // a modifier already implied by the movement name is not a modifier
    if (alias && !m.k.split(' ').every((w) => baseWords.includes(w))) hits.push({ m, alias });
  }
  hits.sort((a, b) => MOD_ORDER.indexOf(a.m.c) - MOD_ORDER.indexOf(b.m.c));
  const mods = hits.map((h) => h.m);

  const explained = new Set();
  const add = (phrase) => String(phrase).split(' ').forEach((w) => w && explained.add(w));
  add(baseAlias);
  add(baseWords.join(' '));
  hits.forEach((h) => { add(h.alias); add(h.m.k); });

  const unexplained = t.trim().split(' ').filter((w) => {
    if (!w || STOPWORDS.has(w) || /^\d/.test(w)) return false;
    const singular = w.replace(/s$/, '');
    if (BASE_VOCAB.has(w) || BASE_VOCAB.has(singular)) return false;
    return !explained.has(w) && !explained.has(singular) && !explained.has(w + 's');
  });

  return { base, mods, unexplained };
}

/** Title-cased movement. Modifiers are shown as chips rather than crammed into the name. */
export function canonicalLabel(base) {
  return String(base || '').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Normalised free text, for use as the `base` of an unrecognised movement. */
export function rawBase(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Cheap junk filter, run BEFORE the AI fallback.
 *
 * Two jobs: stop obvious garbage from costing a model call, and give immediate feedback
 * instead of a second of spinner. It is deliberately high-precision and low-recall — it
 * only rejects things that cannot possibly be an exercise. Deciding whether a plausible
 * phrase is actually a lift is the model's job, because that needs meaning, not regex.
 *
 * Returns { ok: true } or { ok: false, reason } where reason is display-ready copy.
 */
export function isPlausibleExercise(text) {
  const t = String(text || '').trim();

  if (t.length < 3) return { ok: false, reason: 'Too short to be an exercise.' };
  if (t.length > 120) return { ok: false, reason: 'That is longer than an exercise name. Describe just the movement.' };

  const letters = t.replace(/[^a-z]/gi, '');
  if (letters.length < 3) return { ok: false, reason: 'That needs to be a movement name.' };
  if (!/[aeiouy]/i.test(letters)) return { ok: false, reason: 'That does not look like words.' };

  // "aaaaaa", "!!!!!!"
  if (/^(.)\1+$/.test(t.replace(/\s/g, ''))) return { ok: false, reason: 'That does not look like words.' };

  // keyboard runs
  const flat = letters.toLowerCase();
  const RUNS = ['qwerty', 'asdf', 'zxcv', 'qwer', 'hjkl', 'abcdef'];
  if (RUNS.some((r) => flat.includes(r))) return { ok: false, reason: 'That does not look like words.' };

  // needs at least one real word
  if (!t.split(/\s+/).some((w) => w.replace(/[^a-z]/gi, '').length >= 3)) {
    return { ok: false, reason: 'That needs to be a movement name.' };
  }

  return { ok: true };
}

/**
 * Overlap score between two modifier sets.
 * Intersection over the LARGER set: adding a modifier the other lacks costs you,
 * but two sets that fully agree score 1 regardless of size.
 */
export function scoreMods(a = [], b = []) {
  const denom = Math.max(a.length, b.length);
  if (denom === 0) return 1;
  return b.filter((x) => a.includes(x)).length / denom;
}

/**
 * @param {string} text            what the lifter typed
 * @param {Array}  variants        this user's registry: { id, base, mods[], uses }
 * @returns {{status,base,mods,modObjs,match,score,note,raw}}
 */
export function resolve(text, variants = []) {
  // A movement previously logged as typed lives in the registry with the raw phrase as
  // its base. Check that FIRST — otherwise "jefferson curl" parses to base "curl", never
  // matches its own raw variant, and forks a second trend line every time it is logged.
  // This is also what stops repeat raw phrases reaching the paid AI layer at all.
  const { base, mods, unexplained } = parse(text);

  // Only when the phrase isn't itself a dictionary base, though. For "bench press" the
  // raw text and the parsed base are the same string, and taking the shortcut would
  // return whichever bench variant sits first in the registry while ignoring modifiers —
  // silently merging a plain bench into the feet-up trend line.
  const raw = rawBase(text);
  const rawMatch = raw === base?.k ? null : variants.find((v) => v.base === raw);

  // Words the dictionary couldn't account for become a single modifier tag. That keeps
  // the lift categorised while still forcing it onto its own trend line, so the worst
  // case (AI unreachable) is an odd-looking tag rather than a silent merge.
  const extra = unexplained.length ? [unexplained.join(' ')] : [];
  const keys = [...mods.map((m) => m.k), ...extra].sort();

  if (rawMatch) {
    return {
      status: 'match',
      base: { k: rawMatch.base, m: rawMatch.muscle ?? null, p: rawMatch.body_part ?? null },
      mods: [...(rawMatch.mods || [])].sort(),
      modObjs: mods,
      match: rawMatch,
      score: 1,
      note: '',
      raw: text,
    };
  }

  if (!base) {
    // Unrecognised movement. The UI must still let the lifter log it — pass
    // { base: { k: rawBase(text), m: null, p: null }, mods: keys } to variant creation.
    //
    // Only the modifiers actually recognised, not the unexplained tag: this path already
    // escalates on status alone, and folding the leftover words in here would write junk
    // like "thing" into the registry as a real modifier.
    return {
      status: 'unknown',
      raw: text,
      base: null,
      mods: mods.map((m) => m.k).sort(),
      modObjs: mods,
      match: null,
      score: 0,
      note: '',
      unexplained,
      needsAI: extra.length > 0,
    };
  }

  let match = null, score = -1;
  for (const v of variants.filter((v) => v.base === base.k)) {
    const s = scoreMods(v.mods || [], keys);
    if (s > score) { score = s; match = v; }
  }

  let status = 'new';
  if (match && score >= MATCH_THRESHOLD) status = 'match';
  else if (match && score >= CLOSE_THRESHOLD) status = 'close';

  return {
    status,
    base,
    mods: keys,
    modObjs: mods,
    match: status === 'new' ? null : match,
    score: Math.max(0, score),
    note: mods.map((m) => m.n).filter(Boolean).slice(0, 2).join(' '),
    // The dictionary read the movement but not all of the description, so it cannot claim
    // a confident answer. resolveExercise escalates these to the cache and the model, and
    // only falls back to the reading above if neither is reachable.
    unexplained,
    needsAI: extra.length > 0,
    raw: text,
  };
}

/** Suggestions for the type-ahead: the lifter's own variants, most-used first. */
export function suggest(text, variants = [], limit = 8) {
  const q = normalize(text).trim();
  const ranked = [...variants].sort((a, b) => (b.uses || 0) - (a.uses || 0));
  if (!q) return ranked.slice(0, limit);
  const words = q.split(' ').filter((w) => w.length > 1);
  return ranked
    .filter((v) => {
      const hay = normalize(`${v.base} ${(v.mods || []).join(' ')} ${v.muscle || ''}`);
      return words.some((w) => hay.includes(w));
    })
    .slice(0, limit);
}
