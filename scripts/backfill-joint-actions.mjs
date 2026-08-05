/**
 * One-off backfill: fill in joint_actions on every variant and cached alias that predates
 * the field — across ALL accounts, not just one.
 *
 * Why this exists: adding a resolver field leaves every previously-resolved row without it,
 * and partial coverage is worse than none. Per-joint volume would quietly exclude the lifts
 * someone has been training longest, which are exactly where a plateau shows up first.
 *
 * Why it needs the service-role key: variants are per-user rows under RLS, so a script that
 * signs in as one lifter can only ever reach that lifter's rows. Filling in every account
 * means crossing account boundaries, which no user is permitted to do — correctly. The
 * service-role key bypasses RLS, which is why it belongs on your machine for a one-time
 * migration and NEVER in the app bundle or in git.
 *
 * Cost: ONE model call per batch of 60, not one per row. The whole database is well under a
 * cent. Idempotent — only touches rows where joint_actions is empty, so re-running is free
 * and a half-finished run just resumes.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY='eyJ...' node scripts/backfill-joint-actions.mjs
 *
 * The key is in Supabase → Project Settings → API → service_role. Treat it like a password:
 * pass it inline as above so it never lands in .env.local or your shell history file.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  console.error("Run: SUPABASE_SERVICE_ROLE_KEY='eyJ...' node scripts/backfill-joint-actions.mjs");
  console.error('Find it in Supabase → Project Settings → API → service_role.');
  process.exit(1);
}

// Service-role client: bypasses RLS, so it sees and writes every account's rows.
const admin = createClient(env.VITE_SUPABASE_URL, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FUNCTION_URL = `${env.VITE_SUPABASE_URL}/functions/v1/resolve-exercise`;
const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Ask the edge function to translate base + mods into joint actions. One call per batch. */
async function resolveActions(items) {
  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ mode: 'backfill', items }),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok || !payload?.ok) {
    throw new Error(`backfill call failed (${res.status}): ${payload?.reason ?? payload?.error ?? 'unknown'}`);
  }
  return payload.results ?? [];
}

async function backfill(table, label) {
  const { data: rows, error } = await admin
    .from(table)
    .select('id, base, mods, joint_actions, user_id')
    .or('joint_actions.is.null,joint_actions.eq.{}');

  if (error) throw new Error(`${table}: ${error.message}`);
  if (!rows?.length) {
    console.log(`${label}: nothing to do.`);
    return;
  }

  const accounts = new Set(rows.map((r) => r.user_id ?? 'shared')).size;
  console.log(`${label}: ${rows.length} row(s) missing actions across ${accounts} account(s).`);

  let written = 0;
  for (const batch of chunk(rows, 60)) {
    const results = await resolveActions(
      batch.map((r) => ({ id: r.id, base: r.base, mods: r.mods ?? [] }))
    );

    for (const result of results) {
      const { error: upErr } = await admin
        .from(table)
        .update({ joint_actions: result.joint_actions })
        .eq('id', result.id);

      // Surface failures. A silent no-op here is how the previous version reported a clean
      // run while writing nothing at all.
      if (upErr) {
        console.error(`  ${result.id}: write failed — ${upErr.message}`);
        continue;
      }
      written += 1;
      const row = batch.find((r) => r.id === result.id);
      console.log(`  ${row?.base ?? result.id} → ${result.joint_actions.join(', ')}`);
    }
  }

  console.log(`${label}: wrote ${written} of ${rows.length}.`);
}

// Aliases first. The cache is what an identical phrase reads from later, so leaving it stale
// would keep minting empty-action variants after the variants themselves were fixed.
await backfill('exercise_aliases', 'Alias cache');
await backfill('exercise_variants', 'Variants');

console.log('\nDone. Safe to re-run — it only touches rows still missing actions.');
