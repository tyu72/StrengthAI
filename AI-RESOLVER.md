# Setting up the AI resolver

The resolver has three layers. Only the third costs anything, and it is only reached for
phrasing nobody has ever typed before.

| Layer | Speed | Cost | Works offline |
| --- | --- | --- | --- |
| 1. Dictionary (`src/lib/resolver.js`) | instant | free | yes |
| 2. Alias cache (`exercise_aliases`) | instant | free | no (one query) |
| 3. AI (`resolve-exercise` function) | ~1s | ~$0.001 | no |

Every AI answer is written back into layer 2. High-confidence answers are shared across
all users, so the same phrase is never paid for twice by anyone. The app gets cheaper and
faster the more it is used.

## What it costs

About a tenth of a cent per novel phrase. A lifter's first month is 40–60 new movements,
so roughly 5 cents each, then it falls away as their vocabulary is covered.

Credit is **prepaid**. Buy $5, leave auto-reload OFF, and $5 is a hard ceiling — the
balance cannot go negative. If it ever ran out, the resolver falls back to the dictionary
and log-as-typed, and the app keeps working.

## Steps

**1. Get an API key**

console.anthropic.com → Billing → add $5 credit → **turn auto-reload off** → API Keys →
create a key. It starts `sk-ant-`.

**2. Run the migration**

Supabase → SQL Editor → New query → paste all of
`supabase/migrations/002_ai_resolver.sql` → Run.

**3. Deploy the function**

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>     # Settings → General
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy resolve-exercise
```

**4. Check it**

Type something the dictionary doesn't know — `heel elevated barbell squat`. It should
resolve to Squat with `barbell` + `heel elevated` and explain that elevating the heels
shifts the load toward the quads and lets the knee travel further forward.

Then type it again: instant, no model call. That's layer 2 working.

Then type `chicken parmesan`. It should be refused with a sentence telling you what to
type instead.

## Guardrails

**Junk filter** (`isPlausibleExercise`, client-side, free) rejects input that cannot be an
exercise — too short, no vowels, keyboard runs, repeated characters. Deliberately
high-precision: it only blocks the impossible, because a false rejection is far more
annoying than a fraction of a cent.

**Model gate** does the semantic judgment: food, gibberish, abuse, questions, and pure
cardio are refused with copy written for the lifter. It is told to be generous with
obscure names, gym slang and typos.

**Daily cap** — 50 new exercises per account per day, counted server-side. The app is
public, so without it one account could drain the balance. Change with
`supabase secrets set RESOLVER_DAILY_CAP=100`.

**Shared cache is high-confidence only.** A shaky resolution stays private to the lifter
who triggered it, so it cannot teach everyone something wrong.

**Auth required.** The function reads the caller's identity from their own JWT, so the key
cannot be used as an open proxy by anyone who finds the URL.

## The rule that matters

**Never block logging.** Every path — offline, out of credit, capped, unrecognised — ends
somewhere the lifter can still record the set. `status: 'unresolved'` means "log it as
typed", which creates a variant from the raw text that future identical descriptions match
into. Refusing to record what someone did because a dictionary is short, or the wifi is
bad, is the one failure this app cannot have.

Only `status: 'rejected'` blocks, and only for input that is genuinely not an exercise.

## What is NOT AI, deliberately

The coaching math is arithmetic and stays that way: RIR at matched load, plateau
detection, the program-level check, goal projections. A model would be slower, cost money,
and be less reliable at statistics.

Worth doing later, once there is real training data to explain: AI plateau diagnoses and
weekly reports. Those are the two places a paragraph of real synthesis beats a template —
the detection is already honest, but the explanation is currently a hardcoded string
chosen by an `if`.
