import { describe, it, expect, vi, afterEach } from 'vitest';
import { capFromEnv, checkCap, dayKey, monthStartKey, sumCalls } from './usage.ts';

/**
 * These exist because the cap they replace was never tested and never fired. Each test below
 * corresponds to one thing the previous implementation got wrong.
 */

describe('sumCalls', () => {
  it('sums the daily counters rather than counting rows', () => {
    // The bug in miniature: three rows, 340 calls. Counting rows says 3.
    expect(sumCalls([{ calls: 120 }, { calls: 200 }, { calls: 20 }])).toBe(340);
  });

  it('treats an empty month as zero', () => {
    expect(sumCalls([])).toBe(0);
  });

  it('survives null counters without poisoning the total', () => {
    expect(sumCalls([{ calls: 5 }, { calls: null }, {}])).toBe(5);
  });
});

describe('checkCap', () => {
  const rows = (total: number) => [{ calls: total }];

  it('allows a call below the cap', () => {
    expect(checkCap(rows(399), null, 400)).toEqual({ allow: true, capped: false, failed: false });
  });

  it('fires exactly at the cap', () => {
    const r = checkCap(rows(400), null, 400);
    expect(r.allow).toBe(false);
    expect(r.capped).toBe(true);
  });

  it('stays fired past the cap', () => {
    expect(checkCap(rows(4000), null, 400).capped).toBe(true);
  });

  it('fails closed when the counter cannot be read', () => {
    // The whole bug. The old code let a failed read mean "no usage recorded" and billed
    // the call anyway; `undefined >= 400` is false, so it never refused anything.
    const r = checkCap(undefined, { message: 'column does not exist' }, 400);
    expect(r.allow).toBe(false);
    expect(r.failed).toBe(true);
    expect(r.capped).toBe(false);
  });

  it('distinguishes a spent budget from a broken counter', () => {
    // They are different states and the caller answers them differently: one is a message
    // to the lifter about their limit, the other is an outage.
    expect(checkCap(rows(400), null, 400).failed).toBe(false);
    expect(checkCap(rows(0), new Error('boom'), 400).capped).toBe(false);
  });

  it('a zeroed counter is not a licence to spend past the cap', () => {
    expect(checkCap([{ calls: 0 }], null, 0).capped).toBe(true);
  });
});

describe('capFromEnv', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the env value when it is a valid number', () => {
    expect(capFromEnv('2', 400, 'X')).toBe(2);
    expect(capFromEnv('  40  ', 40, 'X')).toBe(40);
  });

  it('falls back when the var is unset', () => {
    expect(capFromEnv(undefined, 400, 'X')).toBe(400);
    expect(capFromEnv(null, 40, 'X')).toBe(40);
  });

  it('treats a cleared secret as unset, not as a cap of zero', () => {
    // Number('') is 0, which would refuse every request rather than restoring the default.
    expect(capFromEnv('', 400, 'X')).toBe(400);
    expect(capFromEnv('   ', 400, 'X')).toBe(400);
  });

  it('falls back on a typo instead of disabling the cap', () => {
    // The bug: Number('4OO') is NaN, and `sum >= NaN` is false for every sum, so the cap
    // silently stopped existing and every call billed.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(capFromEnv('4OO', 400, 'RESOLVER_MONTHLY_CAP')).toBe(400);
    expect(capFromEnv('forty', 40, 'COACH_CHAT_DAILY_CAP')).toBe(40);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(String(warn.mock.calls[0][0])).toContain('RESOLVER_MONTHLY_CAP');
  });

  it('rejects a negative cap', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(capFromEnv('-1', 400, 'X')).toBe(400);
  });

  it('a typo can never widen the budget', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of ['4OO', 'forty', 'NaN', 'Infinity', '', '  ', '-5', 'null']) {
      expect(capFromEnv(bad, 400, 'X')).toBeLessThanOrEqual(400);
    }
  });
});

describe('checkCap with a broken cap', () => {
  afterEach(() => vi.restoreAllMocks());

  it('refuses rather than bills when the cap is not a number', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = checkCap([{ calls: 0 }], null, Number.NaN);
    expect(r.allow).toBe(false);
    expect(r.failed).toBe(true);
  });
});

describe('day keys', () => {
  it('formats a day the way the counter column stores it', () => {
    expect(dayKey(new Date('2026-03-09T23:30:00Z'))).toBe('2026-03-09');
  });

  it('anchors the month window to the first, so a monthly sum spans the whole month', () => {
    expect(monthStartKey(new Date('2026-03-31T23:59:59Z'))).toBe('2026-03-01');
    expect(monthStartKey(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
  });

  it('a day inside the month sorts at or after the month start, so >= day selects it', () => {
    // This is the comparison the resolver's query makes; if it inverted, the cap would read
    // an empty month every time and never fire again.
    const d = new Date('2026-03-15T12:00:00Z');
    expect(dayKey(d) >= monthStartKey(d)).toBe(true);
    expect(dayKey(new Date('2026-02-28T12:00:00Z')) >= monthStartKey(d)).toBe(false);
  });
});
