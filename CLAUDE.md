# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo state — read this first

This repo is currently a **build package**, not yet a running app. There is no
`package.json`, no Vite scaffold, and no `node_modules` — only the plan, the database
schema, the pure-logic modules, and the prototype UI reference. `BUILD-PLAN.md` is the
ordered task list (nine phases) for turning this into an actual React + Capacitor app;
`README.md` explains what each piece is for and the rules that must survive the rebuild.

Before assuming `npm run dev` or `npm test` works, check whether Phase 0/1 setup
(`npm install`, `.env.local`, wiring `src/` into a real Vite project) has happened yet —
if `package.json` still doesn't exist, that setup is the actual task at hand.

## Commands (once the Vite project exists)

```bash
npm install @supabase/supabase-js
npm install -D vitest
npm test          # runs vitest — 30 tests across resolver.test.js and coach.test.js
npm run dev
```

To run a single test file: `npx vitest run src/lib/resolver.test.js`.
The resolver and coach tests have no setup requirements (no DB, no mocks) — they're
plain function tests and should pass before any UI is written.

Database: paste `supabase/schema.sql` into the Supabase SQL editor once per project.
It's idempotent (`create table if not exists`, `drop policy if exists`) so re-running it
is safe.

## Architecture

**Pure logic is separated from I/O on purpose**, so the hard-to-get-right parts can be
tested without a database or a UI:

- `src/lib/resolver.js` — freeform exercise text → canonical variant. No network, no
  model calls, fully deterministic.
- `src/lib/coach.js` — plateau detection, program-level pattern detection, goal
  projection, session-note risk classification. Pure functions over already-loaded sets.
- `src/lib/units.js` — kg/lb conversion, RIR/RPE conversion, readiness score.
- `src/api/db.js` — the *only* file that touches Supabase. Screens call these functions
  and never import `@supabase/supabase-js` directly; swapping backends later means
  rewriting this one file instead of every page.

`prototype/StrengthAI-standalone.html` (and `.dc.html`) is the high-fidelity UI
reference — colors, spacing, type and copy are final there. When building screens,
recreate it with the shadcn/Tailwind components in the target project rather than
copying its inline styles.

### The resolver (`src/lib/resolver.js`)

There is no global exercise database. A lifter's registry is built entirely from what
they've logged (`exercise_variants` in the DB, keyed by `user_id, base, mods`).
`resolve(text, variants)` returns one of four statuses, and the UI behavior for each is
a hard rule, not a suggestion:

- `match` — same variant; confirm and continue the existing trend line.
- `close` — same movement, different-enough modifiers. Show both options and let the
  lifter decide. **Never merge silently** — a false match corrupts the trend in a way
  the lifter can't see, and that's the core promise of the product.
- `new` — nothing like it; create a fresh variant.
- `unknown` — text has modifiers but no recognized movement; ask for the lift name.

`BASES` and `MODS` are the movement/modifier vocabularies. Each `MODS` entry carries an
`n` (loading-explanation) string — shown to the lifter as `resolve(...).note` — that
explains *why* a modifier changes the load (e.g. cuff vs. rope moment arm). This is
what makes a fork in the trend line feel earned rather than arbitrary; when adding a
modifier, write that explanation, don't leave it blank unless there's truly nothing to
say. `MATCH_THRESHOLD` / `CLOSE_THRESHOLD` tune how eager matching is — see
`scoreMods` for the overlap formula (intersection over the larger set).

### The coach (`src/lib/coach.js`)

Deliberately conservative: every function either has data-backed grounds to claim
something, or explicitly declines to. Patterns to preserve when extending this:

- `matchedRirSeries` only compares sessions at the *same* weight × reps (the lifter's
  modal combination for that variant) — RIR at different loads isn't comparable.
- `detectPlateau` requires ≥3 matched sessions and a full RIR point of drop; half a
  point is noise in self-reported RIR.
- `detectProgramPattern` looks for ≥2 lifts stalling together plus a falling readiness
  trend, because diagnosing each exercise in isolation turns "recovery" into several
  unrelated false plateaus (a bug from the prior Base44 version).
- `projectGoal` refuses to project when the observed rate isn't positive, and always
  returns a decay-adjusted range alongside the naive linear one — straight-line
  extrapolation is knowingly false near a lifter's ceiling.
- No injury/pain classification exists or is planned — cut deliberately to avoid
  medical claims. Session notes are plain text; the only related feature is a manual
  "exclude this session from trends" action where the lifter gives their own reason.

### Data layer (`src/api/db.js`)

- Every write resolves the current user id itself (`uid()`) and throws if unauthenticated.
- `ok()` throws on any Supabase error deliberately — no bare `catch {}`. Catch at the UI
  layer and surface something to the user; don't swallow errors here.
- `variants.ensure` upserts on `(user_id, base, mods)` with `mods` pre-sorted, so the
  unique index is what actually prevents two racing clients from forking a trend line.
- `sets.all()` pulls full history and computes trends client-side — correct at personal
  scale. Don't build a `variant_stats` rollup table until this is actually slow (see the
  scale note at the bottom of the file).

### Database (`supabase/schema.sql`)

- All weights are stored in kilograms; unit is a per-profile display preference
  (`profile.unit`). Every conversion goes through `src/lib/units.js` — never convert
  inline, mixed units in storage is a months-long bug to track down.
- **RLS is the actual security boundary**, not a nicety: the anon key ships inside the
  app bundle, so the `"own rows"` policies (auth.uid() = user_id) are what stop one
  user reading another's data. Any new table needs RLS enabled and a matching policy,
  following the existing `do $$ ... foreach t in array [...] $$` pattern.
- `pattern_flags`, `coach_recommendations`, `coach_plans` are the coach's output tables;
  an accepted recommendation becomes a `coach_plans` row consumed by the next session.

## Design reference (from the prototype)

- Type: Instrument Sans for interface text, JetBrains Mono for anything compared
  numerically (weights, reps, RIR, dates). Numbers are tabular.
- Color: `#101211` background, `#171A18` cards, `#272C29` borders, `#ECEFEA` text,
  `#8A928C`/`#5F665F` secondary/tertiary text, `#A8C9A2` accent (actions/positive,
  `#12160B` text on filled accent buttons), `#4C8E96` secondary data series,
  `#F2B544` warnings/plateaus/health advisories, `#F2705C` destructive.
- Radii: 11px controls, 14–16px inner cards, 18–20px outer cards, 22px sheets. Sheets
  animate up over 260ms on `cubic-bezier(.32,.72,0,1)`.
