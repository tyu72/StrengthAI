import { describe, it, expect } from 'vitest';
import { parse, resolve, scoreMods, suggest, rawBase, isPlausibleExercise } from './resolver.js';

// The registry a lifter might realistically have built up.
const VARIANTS = [
  { id: 'v1', base: 'bench press',      mods: ['feet up', 'narrow grip'],       uses: 8, muscle: 'pectorals' },
  { id: 'v2', base: 'bench press',      mods: [],                               uses: 3, muscle: 'pectorals' },
  { id: 'v3', base: 'tricep extension', mods: ['cable', 'cuff', 'single arm'],  uses: 6, muscle: 'triceps' },
  { id: 'v4', base: 'row',              mods: ['chest supported', 'machine'],   uses: 5, muscle: 'upper back' },
];

describe('parse', () => {
  it('finds the movement even when modifiers sit between the alias words', () => {
    expect(parse('incline dumbbell press').base.k).toBe('incline press');
  });

  it('prefers the longest matching alias', () => {
    expect(parse('incline bench press').base.k).toBe('incline press');
    expect(parse('bench press').base.k).toBe('bench press');
  });

  it('does not treat a word from the movement name as a modifier', () => {
    const { base, mods } = parse('incline press');
    expect(base.k).toBe('incline press');
    expect(mods.map((m) => m.k)).not.toContain('incline');
  });

  it('picks up modifiers regardless of word order', () => {
    const a = parse('feet up narrow grip bench press').mods.map((m) => m.k).sort();
    const b = parse('narrow grip bench, feet elevated').mods.map((m) => m.k).sort();
    expect(a).toEqual(b);
  });

  it('returns no movement when there is nothing to hang it on', () => {
    expect(parse('single arm cuff').base).toBeNull();
  });

  // Coverage regressions found in real gym use. Each of these silently failed once.
  it('knows the machine movements people actually use', () => {
    expect(parse('plate loaded chest press').base.k).toBe('chest press');
    expect(parse('machine shoulder press').base.k).toBe('overhead press');
    expect(parse('seated chest press').base.k).toBe('chest press');
    expect(parse('hammer strength row').base.k).toBe('row');
  });

  it('does not let a bare angle word hijack the movement', () => {
    // 'incline' is both an angle modifier and part of 'incline press'. A bare
    // 'incline' must not outrank the actual lift being named.
    expect(parse('incline dumbbell curl').base.k).toBe('curl');
    expect(parse('incline curl').mods.map((m) => m.k)).toContain('incline');
    expect(parse('incline dumbbell press').base.k).toBe('incline press');
    expect(parse('incline bench press').base.k).toBe('incline press');
  });

  it('treats plate-loaded as its own implement, not just a machine', () => {
    const mods = parse('plate loaded chest press').mods.map((m) => m.k);
    expect(mods).toContain('plate loaded');
  });

  it('resolves a curl variant to curl plus a position modifier', () => {
    const { base, mods } = parse('preacher curl');
    expect(base.k).toBe('curl');
    expect(mods.map((m) => m.k)).toContain('preacher');
  });

  it('keeps specific leg movements from collapsing into squat or curl', () => {
    expect(parse('bulgarian split squat').base.k).toBe('lunge');
    expect(parse('seated leg curl').base.k).toBe('hamstring curl');
    expect(parse('nordic curl').base.k).toBe('nordic curl');
    expect(parse('hanging leg raise').base.k).toBe('leg raise');
  });
});

describe('scoreMods', () => {
  it('two empty sets are the same thing', () => {
    expect(scoreMods([], [])).toBe(1);
  });
  it('identical sets score 1', () => {
    expect(scoreMods(['cuff', 'single arm'], ['single arm', 'cuff'])).toBe(1);
  });
  it('divides by the larger set, so extra modifiers cost you', () => {
    expect(scoreMods(['cable', 'cuff', 'single arm'], ['single arm'])).toBeCloseTo(1 / 3);
  });
});

describe('resolve', () => {
  it('matches two different phrasings of the same lift to one variant', () => {
    const a = resolve('feet up narrow grip bench press', VARIANTS);
    const b = resolve('narrow-grip bench, feet elevated', VARIANTS);
    expect(a.status).toBe('match');
    expect(b.status).toBe('match');
    expect(a.match.id).toBe(b.match.id);
    expect(a.match.id).toBe('v1');
  });

  it('keeps a plain bench separate from the feet-up variant', () => {
    // this is the important one: silently merging these would corrupt the trend
    const r = resolve('bench press', VARIANTS);
    expect(r.match.id).toBe('v2');
    expect(r.status).toBe('match');
  });

  it('flags a rope-for-cuff swap as close, not identical', () => {
    const r = resolve('rope tricep extension one arm', VARIANTS);
    expect(r.status).toBe('close');
    expect(r.match.id).toBe('v3');
    expect(r.note).toMatch(/rope|moment arm/i);
  });

  it('starts a new line for a movement never logged before', () => {
    expect(resolve('hip thrust', VARIANTS).status).toBe('new');
  });

  it('asks for the movement when it only sees modifiers', () => {
    const r = resolve('single arm cuff', VARIANTS);
    expect(r.status).toBe('unknown');
    expect(r.raw).toBe('single arm cuff');
  });

  it('still hands back the modifiers it understood on an unknown movement', () => {
    // The UI logs unknowns as typed, so the mods it did recognise must survive.
    const r = resolve('single arm cable thing', VARIANTS);
    expect(r.status).toBe('unknown');
    expect(r.mods).toEqual(['cable', 'single arm']);
  });

  it('normalises raw text into a usable base for log-as-typed', () => {
    expect(rawBase('  Jefferson   Curl! ')).toBe('jefferson curl!');
    expect(rawBase('Chest Supported Y Raise')).toBe('chest supported y raise');
  });

  it('matches a movement previously logged as typed, instead of forking it', () => {
    // Logged-as-typed variants carry the whole phrase as their base. Without a raw-base
    // check, "jefferson curl" parses to base "curl", never matches its own variant, and
    // forks a new trend line on every session — the exact failure the resolver exists to
    // prevent. It also means a repeat phrase never reaches the paid AI layer.
    const registry = [{ id: 'raw1', base: 'jefferson curl', mods: [], uses: 2 }];
    const r = resolve('jefferson curl', registry);
    expect(r.status).toBe('match');
    expect(r.match.id).toBe('raw1');
  });

  it('matches a raw variant regardless of casing and spacing', () => {
    const registry = [{ id: 'raw2', base: 'tuck front lever raise', mods: [], uses: 1 }];
    expect(resolve('  Tuck   Front Lever Raise ', registry).match.id).toBe('raw2');
  });

  it('still prefers a dictionary variant when no raw variant exists', () => {
    expect(resolve('bench press', VARIANTS).match.id).toBe('v2');
  });

  it('is insensitive to punctuation and casing', () => {
    const a = resolve('Feet-Up, Narrow-Grip Bench Press!', VARIANTS);
    expect(a.status).toBe('match');
    expect(a.match.id).toBe('v1');
  });

  it('explains why the load will differ', () => {
    expect(resolve('single arm cuff tricep extension', VARIANTS).note).toBeTruthy();
  });
});

describe('suggest', () => {
  it('orders by how often the lifter uses them', () => {
    expect(suggest('', VARIANTS)[0].id).toBe('v1');
  });
  it('filters on partial words', () => {
    expect(suggest('tricep', VARIANTS).map((v) => v.id)).toEqual(['v3']);
  });
});

describe('unexplained words', () => {
  // The silent-merge bug: the dictionary knew 'squat' and 'barbell', dropped 'heel' and
  // 'elevated', and merged a heel-elevated squat into the plain barbell squat trend at
  // full confidence. Every word must now be accounted for.
  it('reports words the dictionary could not account for', () => {
    expect(parse('zercher barbell squat').unexplained).toEqual(['zercher']);
    // 'press' is a movement noun the dictionary knows, so only 'landmine' is missing
    expect(parse('landmine press').unexplained).toEqual(['landmine']);
  });

  it('accounts for every word of a fully understood description', () => {
    expect(parse('feet up narrow grip bench press').unexplained).toEqual([]);
    expect(parse('single arm cuff tricep extension').unexplained).toEqual([]);
    expect(parse('chest supported machine row').unexplained).toEqual([]);
  });

  it('ignores filler and set notation', () => {
    expect(parse('bench press with a narrow grip').unexplained).toEqual([]);
    expect(parse('3x10 barbell squat').unexplained).toEqual([]);
    expect(parse('warmup barbell squat').unexplained).toEqual([]);
  });

  it('flags needsAI so the resolver escalates instead of guessing', () => {
    expect(resolve('zercher barbell squat', VARIANTS).needsAI).toBe(true);
    expect(resolve('feet up narrow grip bench press', VARIANTS).needsAI).toBe(false);
  });

  // 'heel elevated' was the phrase that exposed the silent merge, and it is now in the
  // stance vocabulary — so layer 1 keeps the trend lines apart on its own, with a real
  // loading note and no model call. The escalation path above still covers everything
  // the dictionary genuinely doesn't know.
  it('handles heel elevated in the dictionary rather than escalating it', () => {
    const r = resolve('heel elevated barbell squat', VARIANTS);
    expect(r.mods).toContain('heel elevated');
    expect(r.needsAI).toBe(false);
    expect(r.note).toBeTruthy();
  });

  it('will not silently merge an unexplained variant into an existing trend line', () => {
    const registry = [{ id: 'sq1', base: 'squat', mods: ['barbell'], uses: 9 }];
    const r = resolve('heel elevated barbell squat', registry);
    // must not be a full match on the plain barbell squat
    expect(r.status).not.toBe('match');
    // and the unexplained words survive as a tag, so the trend lines stay separate
    expect(r.mods).toContain('heel elevated');
  });

  it('still matches the plain version exactly', () => {
    const registry = [{ id: 'sq1', base: 'squat', mods: ['barbell'], uses: 9 }];
    const r = resolve('barbell squat', registry);
    expect(r.status).toBe('match');
    expect(r.needsAI).toBe(false);
  });
});

describe('isPlausibleExercise', () => {
  it('rejects things that cannot be an exercise', () => {
    expect(isPlausibleExercise('a').ok).toBe(false);
    expect(isPlausibleExercise('!!!!').ok).toBe(false);
    expect(isPlausibleExercise('aaaaaaa').ok).toBe(false);
    expect(isPlausibleExercise('asdfgh').ok).toBe(false);
    expect(isPlausibleExercise('qwerty').ok).toBe(false);
    expect(isPlausibleExercise('123456').ok).toBe(false);
    expect(isPlausibleExercise('x'.repeat(200)).ok).toBe(false);
  });

  it('always gives display-ready copy on rejection', () => {
    const r = isPlausibleExercise('!!');
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/[a-z]/);
    expect(r.reason.endsWith('.')).toBe(true);
  });

  it('lets real descriptions through, including obscure and misspelled ones', () => {
    expect(isPlausibleExercise('heel elevated barbell squat').ok).toBe(true);
    expect(isPlausibleExercise('jefferson curl').ok).toBe(true);
    expect(isPlausibleExercise('zercher squat').ok).toBe(true);
    expect(isPlausibleExercise('benhc pres').ok).toBe(true);
    expect(isPlausibleExercise('kroc row').ok).toBe(true);
    expect(isPlausibleExercise('seal row').ok).toBe(true);
  });

  it('does not reject a plausible phrase just because the dictionary lacks it', () => {
    // Semantic judgment is the model's job. This gate only catches impossible input.
    expect(isPlausibleExercise('landmine press').ok).toBe(true);
    expect(isPlausibleExercise('half kneeling cable row').ok).toBe(true);
  });
});
