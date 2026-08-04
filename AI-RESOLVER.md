# The resolver

You type what you did. The model works out what it is.

```
"zercher barbell squat"
  → Squat  ·  barbell  ·  zercher
    quads (primary), glutes (primary), upper back (secondary), abs (secondary)
    "The front-rack elbow position keeps the torso upright and shifts load onto the
     quads and upper back, so it runs well under a back squat at the same effort."
```

No exercise database, no dropdown, no taxonomy to map onto. Describe the lift the way you
would say it out loud — grip, attachment, stance, tempo — and it becomes a trend line.

## Why it works this way

The obvious design is a dictionary: parse the text, match against a list of known movements
and modifiers, call the model only when nothing matches. That is what this app had, and it
was wrong.

Fifty-odd hand-written aliases outranked the model on any phrase they happened to touch, and
they were confidently wrong in ways nobody could see:

- `heel elevated barbell squat` matched `barbell squat`, because "heel elevated" was not in
  the modifier list. Two different lifts, one trend line, silently.
- `jm press` matched `tricep extension`, because someone had written that alias by hand. A
  JM press is its own movement.
- `zercher barbell squat` came back tagged `barbell` only.

Every one of those corrupts data invisibly. You do not find out until months later, staring
at a flat chart, wondering why your squat stopped moving.

So the model is the authority now. There is no dictionary fallback and no alias list. What
remains is **vocabulary** — canonical strings the model is told to reuse — because the hard
problem was never identifying a Zottman curl. It is making "SLDL", "stiff-legged deadlift"
and "straight leg deads" produce identical tags six weeks apart.

## Three gates

Only the last one costs anything.

**1. Your own history** — `findLocal`, in `src/lib/resolver.js`
Typed this exact phrase before? Instant, offline, free. Most logging never gets past here.

**2. Junk filter** — `isPlausibleExercise`
Rejects keyboard mashing and empty input. Deliberately permissive: it only stops what
*cannot* be an exercise. `chicken parmesan` passes this gate — judging that is the model's
job, and a local wordlist would also reject legitimate obscure movements.

**3. The model** — `supabase/functions/resolve-exercise`
Checks the shared alias cache first. Only a phrase nobody has ever described costs a call,
and it is cached forever after.

## What comes back

```json
{
  "base": "squat",
  "mods": ["barbell", "zercher"],
  "muscles": [
    { "name": "quads",      "role": "primary"   },
    { "name": "glutes",     "role": "primary"   },
    { "name": "upper back", "role": "secondary" },
    { "name": "abs",        "role": "secondary" }
  ],
  "body_part": "legs",
  "note": "The front-rack elbow position keeps the torso upright…",
  "confidence": "high"
}
```

**Muscles are the point.** Fatigue is not per-exercise — a bench press stalls because the
triceps absorbed eighteen sets across bench, dips and pushdowns. Per-exercise analysis can
never see that. Storing primary and secondary muscles at resolve time is what makes
cross-movement fatigue detection possible, which is the thing this whole app exists for.

Primary counts as a full set, secondary as half (`ROLE_WEIGHT`). Honest enough for "you have
done 14 sets of chest this week".

## Four outcomes

| status | what it means | blocks logging? |
| --- | --- | --- |
| `known` | matches a variant you already have | no — continues that trend line |
| `resolved` | the model or the shared cache identified it | no |
| `rejected` | not an exercise | **yes** — the only one that does |
| `unresolved` | offline, or monthly cap hit | no — logs as typed, re-resolve later |

`unresolved` never blocks, deliberately. You are standing at a rack. A workout must always
be loggable, even offline, even out of credit.

## The rule that protects your data

**Every distinguishing term you type must end up in `base` or `mods`.**

If you write "zercher barbell squat" and it returns `["barbell"]`, your Zercher squats merge
into your ordinary barbell squats and months of trend data are quietly corrupted. Explaining
the difference in `note` does not protect you — only the tag keeps the trend lines apart.

This is stated in the prompt, and enforced again server-side: any content word from your
input that neither the base nor a mod accounts for gets appended as a tag. A term the model
forgets degrades to an ugly tag rather than corrupted data. Never trust the model to be
complete on this one.

## Cost

Haiku 4.5, ~$0.002 per novel phrase. Everything else is free:

- repeat exercises → gate 1, no network
- anything anyone has described before → shared cache, no model call
- junk → gate 2, no model call

Realistically: **a few cents in your first month**, then near zero as the cache fills.
Prepaid credit only, so it cannot overrun. A 400-call monthly cap per user is enforced
server-side, where the client cannot edit it.

Low-confidence answers stay private to whoever triggered them — a shaky inference should not
teach everyone something wrong. High-confidence answers are shared, so the first lifter to
describe a movement pays for it and nobody else does.

## Pin the model

`RESOLVER_MODEL` secret, falling back to `claude-haiku-4-5` in `index.ts`.

Never `-latest`. That alias broke this function once: the underlying dated model retired,
calls started 404ing, and because a 404 and a network failure land in the same catch on the
client, the AI layer degraded to "I could not reach the coach just now" and read as bad wifi
for days. A version alias tracks one generation and cannot silently jump.

## Files

```
src/lib/resolver.js            vocabulary, normalization, junk filter, local match
src/api/resolveExercise.js     the three gates
supabase/functions/resolve-exercise/index.ts    cache → cap → model
supabase/migrations/004_ai_first_resolver.sql   muscles, wider body parts
```

## Do not

- **Add an alias list or matching logic to `resolver.js`.** That is the bug this replaced. If
  the model gets something wrong, fix the prompt or the vocabulary.
- **Pre-seed the cache with hand-written entries.** Same problem wearing a different hat, and
  worse — a wrong seed row serves the wrong answer free, forever, and no model call ever
  corrects it.
- **Let the model judge form, injury or programming.** It cannot see you lift. The coaching
  is honest because it is grounded in logged data.
- **Block logging on any failure except `rejected`.**
