import { describe, it, expect } from 'vitest';
import { suggestNext, ago } from './suggestNext.js';

const DAY = 864e5;
const NOW = new Date('2026-08-04T12:00:00Z').getTime();
const daysAgo = (n) => new Date(NOW - n * DAY).toISOString();

const VARIANTS = [
  { id: 'bench', base: 'bench press', mods: [] },
  { id: 'incline', base: 'incline press', mods: ['dumbbell'] },
  { id: 'pushdown', base: 'pushdown', mods: ['rope'] },
  { id: 'legpress', base: 'leg press', mods: [] },
  { id: 'fly', base: 'chest fly', mods: [] },
];

// Two push days in the same order, plus one leg day that shares nothing with them.
const SESSIONS = [
  { id: 's1', status: 'completed', started_at: daysAgo(14), exercise_order: ['bench', 'incline', 'pushdown'] },
  { id: 's2', status: 'completed', started_at: daysAgo(7), exercise_order: ['bench', 'incline', 'pushdown'] },
  { id: 's3', status: 'completed', started_at: daysAgo(5), exercise_order: ['legpress'] },
  { id: 's4', status: 'active', started_at: daysAgo(0), exercise_order: ['bench'] },
];

const SETS = [
  { session_id: 's1', variant_id: 'bench' },
  { session_id: 's2', variant_id: 'incline' },
  { session_id: 's3', variant_id: 'legpress' },
];

const base = { variants: VARIANTS, sessions: SESSIONS, sets: SETS, templates: [], now: NOW };
const idsOf = (rows) => rows.map((r) => r.variant.id);
const reasonOf = (rows, id) => rows.find((r) => r.variant.id === id)?.reason;

describe('suggestNext', () => {
  it('never suggests something already in the session', () => {
    const rows = suggestNext({ ...base, currentOrder: ['bench', 'incline'] });
    expect(idsOf(rows)).not.toContain('bench');
    expect(idsOf(rows)).not.toContain('incline');
  });

  it('puts the template remainder first — it is the one thing that needs no inference', () => {
    const templates = [{ id: 't1', name: 'Push A', exercise_order: ['bench', 'fly'] }];
    const rows = suggestNext({ ...base, templates, templateId: 't1', currentOrder: ['bench'] });
    expect(idsOf(rows)[0]).toBe('fly');
    expect(reasonOf(rows, 'fly')).toBe('next in Push A');
  });

  it('predicts what follows what, and says so', () => {
    const rows = suggestNext({ ...base, currentOrder: ['bench'] });
    expect(idsOf(rows)[0]).toBe('incline');
    expect(reasonOf(rows, 'incline')).toBe('usually after Bench Press');
  });

  it('ranks a co-occurring lift above one that never appears alongside', () => {
    const rows = suggestNext({ ...base, currentOrder: ['bench'] });
    expect(idsOf(rows).indexOf('incline')).toBeLessThan(idsOf(rows).indexOf('legpress'));
  });

  // The rule that keeps the reasons honest.
  it('never claims session membership for a lift with no overlap', () => {
    const rows = suggestNext({ ...base, currentOrder: ['bench'] });
    // A leg press has never shared a session with a bench press, so saying "often in this
    // session" would be the app contradicting its own data.
    expect(reasonOf(rows, 'legpress')).not.toBe('often in this session');
    expect(reasonOf(rows, 'legpress')).toBe('last trained 5 days ago');
  });

  it('falls through to recency rather than going silent', () => {
    const rows = suggestNext({ ...base, currentOrder: ['bench'] });
    expect(reasonOf(rows, 'fly')).toBe('not logged yet');
  });

  it('ignores sessions that were never completed', () => {
    // s4 is active and contains bench; it must not teach the ranking anything.
    const rows = suggestNext({
      ...base,
      sessions: [{ id: 's4', status: 'active', started_at: daysAgo(0), exercise_order: ['bench', 'fly'] }],
      currentOrder: ['bench'],
    });
    expect(reasonOf(rows, 'fly')).toBe('not logged yet');
  });

  it('offers everything it knows, so the list is never a dead end', () => {
    const rows = suggestNext({ ...base, currentOrder: [] });
    expect(idsOf(rows).sort()).toEqual(['bench', 'fly', 'incline', 'legpress', 'pushdown']);
  });

  it('is safe on an empty account', () => {
    expect(suggestNext()).toEqual([]);
    expect(suggestNext({ variants: [], sessions: [], sets: [] })).toEqual([]);
  });
});

describe('ago', () => {
  it('reads the way a person would say it', () => {
    expect(ago(NOW, NOW)).toBe('today');
    expect(ago(NOW - DAY, NOW)).toBe('yesterday');
    expect(ago(NOW - 5 * DAY, NOW)).toBe('5 days ago');
    expect(ago(NOW - 21 * DAY, NOW)).toBe('3 weeks ago');
  });
});
