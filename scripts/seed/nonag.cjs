// NONAG — a plateau gets dismissed, then more sessions land at the SAME load.
// Expect: Scan does NOT re-create a recommendation, even though the underlying
// series still looks stalled (drop 3 -> 1 over all 6 sessions). This is the dedup
// rule doing its job, not the app failing to notice.
'use strict'
const {
  getSession,
  wipeAll,
  daysAgo,
  ensureVariant,
  createSession,
  logSet,
  createRecommendation,
} = require('./_lib.cjs')

async function main() {
  const { supabase, userId } = await getSession()
  console.log('Wiping account...')
  await wipeAll(supabase, userId)

  const bench = await ensureVariant(supabase, userId, { base: 'bench press', muscle: 'pectorals', body_part: 'chest' })
  const weightKg = 100
  const reps = 5

  // Phase 1: the original stall, 3 matched sessions, RIR 3 -> 1.
  const phase1Days = [40, 35, 30]
  const phase1Rirs = [3, 2, 1]
  for (let i = 0; i < phase1Days.length; i++) {
    const at = daysAgo(phase1Days[i])
    const sessionId = await createSession(supabase, userId, { exerciseOrder: [bench], startedAt: at, endedAt: at })
    await logSet(supabase, userId, { sessionId, variantId: bench, weightKg, reps, rir: phase1Rirs[i], loggedAt: at })
  }

  // The lifter dismissed it a couple of days after session 3.
  await createRecommendation(supabase, userId, {
    kind: 'plateau',
    variantId: bench,
    title: 'Bench Press',
    body: 'Load has not moved while RIR fell 2 points. That is a fatigue plateau, not a strength ceiling — the same weight is simply costing more.',
    actions: { matchedLoadKg: weightKg, drop: 2, sessions: 3 },
    status: 'dismissed',
    createdAt: daysAgo(28),
  })

  // Phase 2: more sessions at the SAME load. Still low RIR, no further drop.
  const phase2Days = [20, 14, 7]
  const phase2Rirs = [1, 1, 1]
  for (let i = 0; i < phase2Days.length; i++) {
    const at = daysAgo(phase2Days[i])
    const sessionId = await createSession(supabase, userId, { exerciseOrder: [bench], startedAt: at, endedAt: at })
    await logSet(supabase, userId, { sessionId, variantId: bench, weightKg, reps, rir: phase2Rirs[i], loggedAt: at })
  }

  console.log('Seeded: 3 sessions stalled + dismissed, then 3 more sessions at the SAME 100kg x5 load.')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
