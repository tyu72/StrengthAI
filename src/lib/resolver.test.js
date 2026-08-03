import { describe, it, expect } from 'vitest';
import { parse, resolve, scoreMods, suggest } from './resolver.js';

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
