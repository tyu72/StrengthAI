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
 *   canonicalLabel(base, mods)   -> "Bench Press"  (mods render as chips, not in the name)
 *
 * status is one of:
 *   'match'   — same variant, keep logging to the existing trend line
 *   'close'   — same movement, different enough modifiers that loads aren't comparable
 *   'new'     — nothing like it in the registry
 *   'unknown' — no movement recognised; ask the lifter to name the lift
 */

/** Movement vocabulary. `a` holds aliases; every word in an alias must appear in the input. */
export const BASES = [
  { k: 'bench press',       a: ['bench press', 'bench', 'flat press'],                                              m: 'pectorals',  p: 'chest' },
  { k: 'incline press',     a: ['incline press', 'incline bench', 'incline'],                                       m: 'pectorals',  p: 'chest' },
  { k: 'decline press',     a: ['decline press', 'decline bench', 'decline'],                                       m: 'pectorals',  p: 'chest' },
  { k: 'chest fly',         a: ['chest fly', 'fly', 'flye', 'pec deck'],                                            m: 'pectorals',  p: 'chest' },
  { k: 'overhead press',    a: ['overhead press', 'ohp', 'shoulder press', 'military press'],                       m: 'delts',      p: 'arms'  },
  { k: 'lateral raise',     a: ['lateral raise', 'side raise', 'lat raise'],                                        m: 'delts',      p: 'arms'  },
  { k: 'rear delt fly',     a: ['rear delt fly', 'reverse fly', 'rear delt'],                                       m: 'delts',      p: 'arms'  },
  { k: 'face pull',         a: ['face pull'],                                                                       m: 'upper back', p: 'back'  },
  { k: 'tricep extension',  a: ['tricep extension', 'triceps extension', 'overhead extension', 'skull crusher'],    m: 'triceps',    p: 'arms'  },
  { k: 'pushdown',          a: ['pushdown', 'press down', 'pressdown'],                                             m: 'triceps',    p: 'arms'  },
  { k: 'lat pulldown',      a: ['lat pulldown', 'pulldown'],                                                        m: 'lats',       p: 'back'  },
  { k: 'pull-up',           a: ['pull up', 'pullup', 'chin up', 'chinup'],                                          m: 'lats',       p: 'back'  },
  { k: 'row',               a: ['row', 'barbell row', 'cable row', 'seated row', 't bar row', 'chest supported row'], m: 'upper back', p: 'back' },
  { k: 'shrug',             a: ['shrug'],                                                                           m: 'traps',      p: 'back'  },
  { k: 'pullover',          a: ['pullover'],                                                                        m: 'lats',       p: 'back'  },
  { k: 'curl',              a: ['curl', 'bicep curl', 'biceps curl', 'preacher curl', 'hammer curl'],               m: 'biceps',     p: 'arms'  },
  { k: 'squat',             a: ['squat', 'back squat', 'front squat', 'hack squat'],                                m: 'quads',      p: 'legs'  },
  { k: 'leg press',         a: ['leg press'],                                                                       m: 'quads',      p: 'legs'  },
  { k: 'leg extension',     a: ['leg extension', 'knee extension'],                                                 m: 'quads',      p: 'legs'  },
  { k: 'romanian deadlift', a: ['romanian deadlift', 'rdl', 'stiff leg deadlift'],                                  m: 'hamstrings', p: 'legs'  },
  { k: 'deadlift',          a: ['deadlift'],                                                                        m: 'hamstrings', p: 'legs'  },
  { k: 'hamstring curl',    a: ['hamstring curl', 'leg curl', 'ham curl'],                                          m: 'hamstrings', p: 'legs'  },
  { k: 'hip thrust',        a: ['hip thrust', 'glute bridge'],                                                      m: 'glutes',     p: 'legs'  },
  { k: 'lunge',             a: ['lunge', 'split squat', 'bulgarian split squat'],                                   m: 'quads',      p: 'legs'  },
  { k: 'calf raise',        a: ['calf raise', 'calve raise'],                                                       m: 'calves',     p: 'legs'  },
  { k: 'dip',               a: ['dip', 'dips'],                                                                     m: 'triceps',    p: 'arms'  },
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
  { k: 'feet up',         c: 'stance',     a: ['feet up', 'feet elevated', 'legs up', 'feet on bench'], n: 'No leg drive and a narrower base. The pattern looks identical but the ceiling is lower — comparing it to a standard bench would read as a false plateau.' },
  { k: 'sumo',            c: 'stance',     a: ['sumo'],                                               n: 'Wider stance, shorter bar path, more hip-dominant.' },
  { k: 'staggered',       c: 'stance',     a: ['staggered', 'b stance'],                              n: 'One side does the work while the trail leg stabilizes — counts as unilateral volume.' },
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
  { k: 'smith',           c: 'implement',  a: ['smith machine', 'smith'],                             n: 'Fixed bar path removes the balance requirement.' },
  { k: 'kettlebell',      c: 'implement',  a: ['kettlebell', 'kb'],                                   n: '' },
  { k: 'seated',          c: 'angle',      a: ['seated'],                                             n: '' },
  { k: 'standing',        c: 'angle',      a: ['standing'],                                           n: '' },
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
  { k: 'banded',          c: 'load',       a: ['banded', 'with bands', 'bands'],                      n: 'Accommodating resistance: bar weight alone understates the top-end load.' },
  { k: 'chains',          c: 'load',       a: ['chains'],                                             n: '' },
];

const MOD_ORDER = ['side', 'implement', 'attachment', 'grip', 'stance', 'angle', 'tempo', 'rom', 'load'];

/** Thresholds. Tune these if matching feels too eager or too shy. */
export const MATCH_THRESHOLD = 0.75;
export const CLOSE_THRESHOLD = 0.30;

const normalize = (t) =>
  ' ' + String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

/** Every word of the alias must be present (order-independent, so "incline dumbbell press" hits "incline press"). */
const hasAll = (text, alias) =>
  alias.split(' ').every((w) => text.includes(` ${w} `) || text.includes(` ${w}s `));

/** Free text -> movement + modifiers. */
export function parse(text) {
  const t = normalize(text);

  // longest matching alias wins, so "incline bench" beats "bench"
  let base = null, best = 0;
  for (const b of BASES) {
    for (const alias of b.a) {
      if (hasAll(t, alias) && alias.length > best) { best = alias.length; base = b; }
    }
  }

  const baseWords = base ? base.k.split(' ') : [];
  const mods = MODS
    // a modifier already implied by the movement name is not a modifier
    .filter((m) => m.a.some((alias) => hasAll(t, alias)) && !m.k.split(' ').every((w) => baseWords.includes(w)))
    .sort((a, b) => MOD_ORDER.indexOf(a.c) - MOD_ORDER.indexOf(b.c));

  return { base, mods };
}

/** Title-cased movement. Modifiers are shown as chips rather than crammed into the name. */
export function canonicalLabel(base) {
  return String(base || '').split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
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
 * @param {Array}  variants        this user's registry: { id, base, mods[] , uses }
 * @returns {{status,base,mods,modObjs,match,score,note,raw}}
 */
export function resolve(text, variants = []) {
  const { base, mods } = parse(text);
  if (!base) return { status: 'unknown', raw: text, base: null, mods: [], modObjs: [], match: null, score: 0, note: '' };

  const keys = mods.map((m) => m.k).sort();

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
