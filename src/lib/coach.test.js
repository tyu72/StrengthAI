import { describe, it, expect } from 'vitest';
import {
  matchedRirSeries, detectPlateau, detectProgramPattern,
  projectGoal, classifyNote, e1rm,
} from './coach.js';

const set = (session_id, weight_kg, reps, rir) => ({ session_id, weight_kg, reps, rir });

describe('matchedRirSeries', () => {
  const dates = { s1: '2026-01-01', s2: '2026-01-08', s3: '2026-01-15' };

  it('tracks effort at the most-repeated load', () => {
    const series = matchedRirSeries(
      [set('s1', 84, 8, 3), set('s2', 84, 8, 2), set('s3', 84, 8, 1)],
      dates
    );
    expect(series.map((p) => p.rir)).toEqual([3, 2, 1]);
  });

  it('ignores sets at other loads — mixing them would be meaningless', () => {
    const series = matchedRirSeries(
      [set('s1', 84, 8, 3), set('s1', 60, 12, 1), set('s2', 84, 8, 2)],
      dates
    );
    expect(series).toHaveLength(2);
  });

  it('averages multiple matching sets within one session', () => {
    const series = matchedRirSeries(
      [set('s1', 84, 8, 3), set('s1', 84, 8, 2), set('s2', 84, 8, 2), set('s2', 84, 8, 2)],
      dates
    );
    expect(series[0].rir).toBe(2.5);
  });

  it('says nothing when the load never repeats', () => {
    expect(matchedRirSeries([set('s1', 84, 8, 3), set('s2', 86, 8, 3)], dates)).toEqual([]);
  });

  it('drops sessions the lifter excluded', () => {
    const series = matchedRirSeries(
      [set('s1', 84, 8, 3), set('s2', 84, 8, 1), set('s3', 84, 8, 2)],
      dates,
      new Set(['s2'])
    );
    expect(series.map((p) => p.sessionId)).toEqual(['s1', 's3']);
  });
});

describe('detectPlateau', () => {
  const series = (...rirs) => rirs.map((rir, i) => ({ sessionId: `s${i}`, rir, date: `2026-01-0${i + 1}` }));

  it('needs three sessions before saying anything', () => {
    expect(detectPlateau(series(3, 1)).stalled).toBe(false);
  });

  it('calls a full point of lost RIR a plateau', () => {
    expect(detectPlateau(series(3, 2, 1.5, 1)).stalled).toBe(true);
  });

  it('does not call half a point a plateau — that is noise', () => {
    const r = detectPlateau(series(3, 2.8, 2.5));
    expect(r.stalled).toBe(false);
    expect(r.watch).toBe(true);
  });

  it('separates volatile from declining', () => {
    expect(detectPlateau(series(3, 1, 3, 1, 3)).stability).toBe('volatile');
    expect(detectPlateau(series(3, 3, 3, 3)).stability).toBe('stable');
  });
});

describe('detectProgramPattern', () => {
  const stalledSeries = [{ rir: 3 }, { rir: 2 }, { rir: 1 }].map((p, i) => ({ ...p, sessionId: `s${i}` }));
  const flatSeries = [{ rir: 3 }, { rir: 3 }, { rir: 3 }].map((p, i) => ({ ...p, sessionId: `s${i}` }));

  it('one stalled lift is an exercise problem, not a program problem', () => {
    const r = detectProgramPattern([
      { variantId: 'a', series: stalledSeries },
      { variantId: 'b', series: flatSeries },
    ]);
    expect(r.detected).toBe(false);
  });

  it('several at once is a program problem', () => {
    const r = detectProgramPattern([
      { variantId: 'a', series: stalledSeries },
      { variantId: 'b', series: stalledSeries },
      { variantId: 'c', series: stalledSeries },
    ]);
    expect(r.detected).toBe(true);
    expect(r.stalled).toHaveLength(3);
  });

  it('falling readiness raises confidence', () => {
    const readiness = [{ score: 8 }, { score: 8 }, { score: 6 }, { score: 6 }];
    const r = detectProgramPattern(
      [{ variantId: 'a', series: stalledSeries }, { variantId: 'b', series: stalledSeries }, { variantId: 'c', series: stalledSeries }],
      readiness
    );
    expect(r.confidence).toBe('high');
    expect(r.readinessTrend).toBeLessThan(0);
  });
});

describe('projectGoal', () => {
  const history = [
    { weight_kg: 80, reps: 5 }, { weight_kg: 82, reps: 5 },
    { weight_kg: 85, reps: 5 }, { weight_kg: 88, reps: 5 },
  ];

  it('gives a decay range that is always longer than the linear guess', () => {
    const r = projectGoal({ currentKg: e1rm(88, 5), targetKg: 120, history });
    expect(r.projectable).toBe(true);
    expect(r.decayWeeks[0]).toBeGreaterThan(r.linearWeeks);
    expect(r.decayWeeks[1]).toBeGreaterThan(r.decayWeeks[0]);
  });

  it('refuses to project when progress has stopped', () => {
    const flat = [{ weight_kg: 100, reps: 5 }, { weight_kg: 100, reps: 5 }, { weight_kg: 100, reps: 5 }];
    const r = projectGoal({ currentKg: e1rm(100, 5), targetKg: 130, history: flat });
    expect(r.projectable).toBe(false);
    expect(r.reason).toMatch(/fiction/);
  });

  it('reports an already-passed target as achieved rather than stalled', () => {
    const r = projectGoal({ currentKg: 130, targetKg: 100, history });
    expect(r.achieved).toBe(true);
    expect(r.projectable).toBe(false);
  });
});

describe('classifyNote', () => {
  it('catches indirect phrasing a keyword list would miss', () => {
    expect(classifyNote("my shoulder's been off all week").risk).toBe(true);
    expect(classifyNote('something felt wrong on the third rep').risk).toBe(true);
    expect(classifyNote('had to rack it early').risk).toBe(true);
  });

  it('does not flag effort language containing a trigger word', () => {
    expect(classifyNote('that last set hurt so good').risk).toBe(false);
    expect(classifyNote('legs burned like hell, great session').risk).toBe(false);
  });

  it('flags explicit discomfort with high confidence', () => {
    const r = classifyNote('sharp pain in my elbow');
    expect(r.risk).toBe(true);
    expect(r.confidence).toBe('high');
  });

  it('stays quiet on ordinary notes', () => {
    expect(classifyNote('felt strong, added 5lb').risk).toBe(false);
  });

  it('returns null for an empty note', () => {
    expect(classifyNote('   ')).toBeNull();
  });
});
