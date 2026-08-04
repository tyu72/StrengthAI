// Supabase Edge Function: resolve-exercise
//
// The AI half of the resolver. The client tries its local dictionary and the shared
// alias cache first, so this only runs for phrasing nobody has ever typed before.
//
// Deploy:
//   supabase functions deploy resolve-exercise
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Why server-side: the API key cannot ship in the browser bundle. This also enforces a
// signed-in caller and a per-user daily cap, so the key can never be used as an open,
// billable proxy by anyone who finds the URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MODEL = Deno.env.get('RESOLVER_MODEL') ?? 'claude-3-5-haiku-latest';
const DAILY_CAP = Number(Deno.env.get('RESOLVER_DAILY_CAP') ?? 50);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/**
 * The prompt has two jobs: reject anything that isn't a resistance-training movement,
 * and keep trend lines continuous for anything that is.
 *
 * Continuity is why it's handed the known vocabulary and the lifter's own registry: a
 * model naming things freely would return "Barbell Bench Press" today and "Bench Press
 * (Barbell)" next week, forking the trend line — exactly the failure the resolver exists
 * to prevent.
 */
function buildPrompt(text: string, knownBases: string[], knownMods: string[], userBases: string[]) {
  return `A lifter typed this into a workout logger, describing an exercise they are about to log:

"${text}"

STEP 1 — Decide whether this is a resistance-training exercise at all.

Reject it if it is: not an exercise; a food, object, place, person or random text; gibberish;
abusive or sexual; a question or a message to you rather than a movement name; or pure
cardio with no load and reps (running, cycling, rowing for time), because this app tracks
weight and reps.

Accept it if it is a movement performed against resistance — barbell, dumbbell, machine,
cable, band, or bodyweight — even if it is obscure, badly spelled, gym slang, or a variation
you have to infer. Be generous here: lifters use shorthand, regional names and typos, and a
false rejection is much more annoying than a slightly uncertain resolution.

If you reject it, respond with exactly:
{"ok":false,"reason":"<one short sentence, addressed to the lifter, saying what to type instead>"}

STEP 2 — If it is an exercise, resolve it.

KNOWN MOVEMENTS (reuse one of these whenever the description is a variation of it, rather
than a genuinely different movement pattern):
${knownBases.join(', ')}

KNOWN MODIFIERS (reuse these exact strings wherever they apply):
${knownMods.join(', ')}

MOVEMENTS THIS LIFTER HAS ALREADY LOGGED (strongly prefer these — reusing one keeps their
existing trend line intact):
${userBases.length ? userBases.join(', ') : '(none yet)'}

Rules:
- "base" is the movement pattern: lowercase, singular, no modifiers in it. A heel-elevated
  back squat is still "squat". A single-arm cable row is still "row".
- Only invent a new base when the pattern genuinely isn't listed — a Jefferson curl is not
  a bicep curl, but a spider curl is.
- "mods" are what changes how it loads: implement, attachment, grip, stance, angle, tempo,
  range of motion, load type, unilateral. Lowercase, 1-3 words each. Reuse a known modifier
  string exactly when it fits. Omit anything the description doesn't state — never guess.
- "muscle" is the primary muscle worked, lowercase ("quads", "pectorals", "triceps").
- "body_part" is exactly one of: chest, back, arms, legs — or null for core, carries and
  full-body movements.
- "note" explains in one or two sentences why this variant loads differently from the plain
  version: moment arm, joint count, stability demand, range of motion, leg drive. Concrete
  biomechanics, no filler. Empty string if the modifiers don't change loading.
- "confidence" is "high" when you are sure what movement this is, "low" when you are
  inferring from an ambiguous or badly garbled description.

Respond with JSON only, no prose:
{"ok":true,"base":"...","mods":["..."],"muscle":"...","body_part":"..."|null,"note":"...","confidence":"high"|"low"}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Not signed in' }, 401);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'Resolver not configured' }, 503);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Identify the caller from their own JWT — never trust a user id sent in the body.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401);
  const userId = userData.user.id;

  let body: { text?: string; knownBases?: string[]; knownMods?: string[]; userBases?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }

  const text = String(body.text ?? '').trim().slice(0, 120);
  if (text.length < 3) return json({ ok: false, reason: 'Too short to be an exercise.' });

  const admin = createClient(url, serviceKey);
  const today = new Date().toISOString().slice(0, 10);

  // Daily cap. The app is public, so without this one account could burn the balance.
  const { data: usage } = await admin
    .from('resolver_usage')
    .select('calls')
    .eq('user_id', userId)
    .eq('day', today)
    .maybeSingle();

  if ((usage?.calls ?? 0) >= DAILY_CAP) {
    return json(
      { ok: false, capped: true, reason: `You have hit today's limit of ${DAILY_CAP} new exercises. Log it as typed — it still gets its own trend line.` },
      429
    );
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0,
        messages: [
          { role: 'user', content: buildPrompt(text, body.knownBases ?? [], body.knownMods ?? [], body.userBases ?? []) },
          // Prefilling the brace forces JSON and drops any preamble.
          { role: 'assistant', content: '{' },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error('[resolve-exercise] Anthropic error', res.status, detail);
      return json({ error: 'Upstream resolver failed', status: res.status }, 502);
    }

    const data = await res.json();
    const raw = '{' + (data?.content?.[0]?.text ?? '');

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[resolve-exercise] Unparseable model output', raw);
      return json({ error: 'Resolver returned malformed output' }, 502);
    }

    // Count the call whether or not it resolved — a rejection still cost money.
    await admin.from('resolver_usage').upsert(
      { user_id: userId, day: today, calls: (usage?.calls ?? 0) + 1 },
      { onConflict: 'user_id,day' }
    );

    if (parsed.ok === false) {
      return json({
        ok: false,
        rejected: true,
        reason: String(parsed.reason ?? '').trim() || 'That does not look like an exercise.',
      });
    }

    // Validate before it can reach the database — a model returning "Chest" for
    // body_part would violate the schema's check constraint.
    const PARTS = ['chest', 'back', 'arms', 'legs'];
    const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

    const base = norm(parsed.base);
    if (!base) return json({ ok: false, rejected: true, reason: 'I could not name that movement.' });

    const part = norm(parsed.body_part);
    const confidence = parsed.confidence === 'low' ? 'low' : 'high';

    const result = {
      ok: true,
      base,
      mods: Array.isArray(parsed.mods)
        ? [...new Set(parsed.mods.map(norm).filter((m) => m && m.length <= 24))].sort()
        : [],
      muscle: norm(parsed.muscle) || null,
      body_part: PARTS.includes(part) ? part : null,
      note: String(parsed.note ?? '').trim(),
      confidence,
      source: 'ai' as const,
    };

    // Cache it. High-confidence answers go in the SHARED cache so nobody pays for this
    // phrase again; low-confidence stays private, so a shaky guess can't teach everyone
    // something wrong.
    await admin.from('exercise_aliases').upsert(
      {
        phrase: text.toLowerCase().replace(/\s+/g, ' '),
        base: result.base,
        mods: result.mods,
        muscle: result.muscle,
        body_part: result.body_part,
        note: result.note,
        confidence,
        source: 'ai',
        shared: confidence === 'high',
        user_id: confidence === 'high' ? null : userId,
      },
      { onConflict: 'phrase,user_id' }
    );

    return json(result);
  } catch (err) {
    console.error('[resolve-exercise] Unhandled failure', err);
    return json({ error: 'Resolver unavailable' }, 502);
  }
});
