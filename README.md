# StrengthAI — app build package

Everything needed to turn the prototype into a real app: the plan, the database, and
the logic that's hard to get right. Hand this to Claude Code inside your repo.

## Start here

1. Read **`BUILD-PLAN.md`** — nine phases, ordered so the app is usable by phase 3.
2. Open the prototype (`prototype/StrengthAI-standalone.html`) and click through it.
   That's the target: every screen, interaction and piece of copy is decided.
3. Start Phase 0.

## What's in this package

```
BUILD-PLAN.md               the ordered plan, with "done when" for each phase
supabase/schema.sql         complete database: tables, indexes, RLS. Run once.
src/lib/resolver.js         freeform text -> canonical exercise variant
src/lib/resolver.test.js    tests, including the cases that must not regress
src/lib/coach.js            plateau detection, program-level check, projections, note classifier
src/lib/coach.test.js       tests
src/lib/units.js            kg/lb, e1RM, readiness score
src/api/db.js               Supabase data layer — the only file that touches the database
prototype/                  the working prototype, as the UI reference
```

The `src/` files drop straight into your existing Vite project at the same paths. They
have no dependencies beyond `@supabase/supabase-js` (only `db.js` needs it) — the
resolver and coach modules are plain JavaScript and run anywhere, including in tests.

## Setup

```bash
npm install @supabase/supabase-js
npm install -D vitest
```

`.env.local`:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Add to `package.json`:

```json
"scripts": { "test": "vitest" }
```

Then `npm test` — 30 tests, no setup required. They should pass before you write any UI.

## The design

The prototype is high fidelity: colors, type, spacing and copy are final. Recreate it
with the shadcn/Tailwind components already in your repo rather than copying inline
styles.

**Type:** Instrument Sans for interface, JetBrains Mono for anything you compare
(weights, reps, RIR, dates). Numbers are tabular.

**Color:**

| | |
| --- | --- |
| `#101211` | app background |
| `#171A18` | cards |
| `#272C29` | borders |
| `#ECEFEA` | text |
| `#8A928C` | secondary text |
| `#5F665F` | tertiary text |
| `#A8C9A2` | accent — actions, positive states |
| `#4C8E96` | secondary data series |
| `#F2B544` | warnings, plateaus, health advisories |
| `#F2705C` | destructive |

Accent on a filled button takes `#12160B` text. Radii: 11px controls, 14–16px inner
cards, 18–20px outer cards, 22px sheets. Sheets animate up over 260ms on
`cubic-bezier(.32,.72,0,1)`.

## The part that matters

Freeform logging replaces the exercise database. The lifter types what they did; the
resolver turns it into a canonical variant so trends stay continuous.

```js
import { resolve, suggest } from '@/lib/resolver';
import { variants as variantsApi } from '@/api/db';

const registry = await variantsApi.list();
const r = resolve('single arm cuff tricep extension', registry);

// r.status: 'match' | 'close' | 'new' | 'unknown'
// r.note:   why this loads differently from the near neighbour
```

Then in the UI:

- **match** — "Continues the trend line you already have, logged 8 times." Confirm adds it.
- **close** — show both options. The lifter decides whether it's the same lift. Never
  merge silently: that corrupts the trend, which is the whole product.
- **new** — "Starting a fresh trend line." Create the variant.
- **unknown** — the text has modifiers but no movement. Ask for the lift name.

Show `r.note` whenever it's present. "A cuff moves the load point up the forearm, so
the stack runs heavier than a rope" is the moment the app earns trust.

## Things to get right

**Never merge variants silently.** A false match makes the coaching wrong in a way the
lifter can't see. Ask instead.

**Store kilograms, display the preference.** Every conversion goes through
`src/lib/units.js`. Mixed units in the database is a bug you'll be chasing for months.

**Surface errors.** `db.js` throws on every Supabase error deliberately — the old
backend had bare `catch {}` blocks, so failures were invisible. Catch them in the UI
and show something.

**RLS is the security boundary.** The anon key ships inside the app bundle. The
policies in `schema.sql` are what actually stop one user reading another's data.

**No medical claims.** The app doesn't classify or diagnose anything from session
notes. Notes are just notes; the lifter can manually exclude a session from trend
analysis with a reason (fatigue, travel, illness — whatever it was), which keeps a
bad week from reading as a plateau without the app claiming to know why.

## Later, not now

- **Model-backed resolver** — for descriptions the dictionary misses. Send the parse
  result plus the lifter's registry, ask for a canonical variant, cache the answer as a
  new alias. Costs money, so it's optional and off by default.
- **Incremental stats** — a `variant_stats` table maintained by a trigger, so trends
  read one row instead of the whole history. Not until it's slow.
- **App Store** — needs a developer account, privacy policy, screenshots.
