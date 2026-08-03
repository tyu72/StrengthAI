# StrengthAI — build plan

From prototype to an app on your phone. Nine phases, ordered so the thing is usable
early and gets better, rather than being unusable until the end.

**Stack:** React + Vite (you already have it) · Supabase (Postgres + auth) · installable
as a PWA · deployed to the web as well. No native wrapper (Capacitor) for now — see
Phase 4.

**Rule for every phase:** it ends with something you can open and use. If a phase is
dragging, ship it half-done and move on — you can come back.

---

## Phase 0 — Clean slate (½ day)

Strip Base44 out so nothing depends on a platform you're leaving.

- [ ] New branch: `git checkout -b rebuild`
- [ ] Delete `base44/`, `src/api/base44Client.js`
- [ ] Remove `@base44/sdk` from `package.json`
- [ ] Delete the pages you're rebuilding (keep them in git history — they're not lost)
- [ ] Keep: `src/components/ui/*` (shadcn primitives), `vite.config.js`, `tailwind.config.js`

**Done when:** `npm run dev` starts and shows a blank page with no console errors.

---

## Phase 1 — Data foundation (1 day)

- [ ] Create a Supabase project (free tier) at supabase.com
- [ ] Run `supabase/schema.sql` in the SQL editor — creates every table and locks each
      row to its owner
- [ ] Copy your project URL and anon key into `.env.local`
- [ ] Drop in `src/api/db.js` — the data layer
- [ ] Verify: sign up in the Supabase dashboard, then confirm a row appears in `profiles`

**Done when:** you can create a session row from the browser console and see it in the
Supabase table editor.

**Why Supabase:** it's Postgres. If you ever outgrow it, you export a database rather
than rebuilding on someone else's API. Free tier covers you until you have hundreds of
users.

---

## Phase 2 — Auth (½ day)

- [ ] Email + password sign-up, log in, password reset (Supabase does the emails)
- [ ] `<ProtectedRoute>` that redirects to `/login`
- [ ] Session persistence so you don't log in every time

**Done when:** you can sign up, close the tab, reopen it, and still be logged in.

---

## Phase 3 — Logging (2–3 days) ← the app becomes real here

The core loop: start a workout, describe an exercise, log sets, finish.

- [ ] Drop in `src/lib/resolver.js` and `src/lib/coach.js` — already written, tested,
      no dependencies
- [ ] Home screen: start/resume button
- [ ] Workout screen: exercise blocks, sets table, reorder, remove
- [ ] Freeform add-exercise sheet: input, autocomplete from your own variants, resolve,
      confirm
- [ ] Set logger: weight/reps/RIR/RPE, pre-filled from last time
- [ ] Rest timer
- [ ] Finish / discard

**Done when:** you can log a real workout at the gym on your phone's browser. Start
using it for actual training here — everything after this is improvement, not
foundation.

---

## Phase 4 — Installable on your phone, browser-only (½ day)

No native wrapper for now — a PWA instead. Do this early anyway, since it surfaces
problems you can't see in a desktop browser.

- [x] `public/manifest.json` — name, theme/background `#101211`, `display: standalone`,
      192px and 512px icons generated from `prototype/assets/logo.png`
- [x] Manifest linked from `index.html`, plus `apple-mobile-web-app-capable` and a
      `black-translucent` status bar for iOS's add-to-home-screen behavior
- [x] Safe-area insets (`viewport-fit=cover` + `env(safe-area-inset-*)`) so the layout
      clears the notch and home indicator when running standalone
- [ ] Add to home screen on your own phone, confirm it opens without browser chrome
- [ ] Fix what you find on a real device: the keyboard covering inputs, touch targets

**Done when:** the icon is on your home screen and you logged a workout from it.

**Later, not now:** wrapping this as a native app via Capacitor (iOS/Android app store
distribution, haptics, HealthKit) — deferred; revisit if the PWA isn't enough.

---

## Phase 5 — History and progress (2 days)

- [ ] Calendar with workout days, tap for detail
- [ ] Session detail
- [ ] Progress: volume per session, RIR at matched load, exercise picker
- [ ] Weekly training goals

**Done when:** two weeks of your real training render correctly.

---

## Phase 6 — Coaching (2–3 days)

All of this runs on your own data with no model calls.

- [ ] Plateau detection per exercise (`coach.detectPlateau`)
- [ ] Program-level pattern when several stall together (`coach.detectProgramPattern`)
- [ ] Strength goals with decay-adjusted projections (`coach.projectGoal`)
- [ ] Readiness survey and its trend
- [ ] Session notes, plus a manual "exclude this session from trends" action with a
      reason — no medical claims, the lifter decides
- [ ] Accepted recommendations write a plan that shows up in the next workout

**Done when:** the coach says something about your training that you didn't already
know.

---

## Phase 7 — Templates and polish (1–2 days)

- [ ] Workout templates and editor
- [ ] Weekly reports
- [ ] Empty states that teach a first-time user what to type
- [ ] Loading and error states everywhere data is fetched

---

## Phase 8 — Later, deliberately

Not v1. Each is a project of its own:

- **Apple Health sync** — needs a Capacitor plugin and HealthKit entitlements
- **Sharing** — needs image generation and a public link surface
- **Model-backed resolver** — only for descriptions the dictionary misses; costs money
- **App Store submission** — $99/year, privacy policy, screenshots, review.
- **Apple Watch** — a separate native target, effectively a second app

---

## What to do first, right now

1. Create the Supabase project.
2. Run `schema.sql`.
3. Get `npm run dev` working with a login screen.

That's Phase 0–2, and it's the least fun part. Phase 3 is where it becomes yours.
