// RESURFACE — a plateau gets dismissed, then more sessions land at a HEAVIER
// load that also stalls. Expect: Scan DOES create a new recommendation, at the
// new (higher) matched load — the lifter broke through and stalled again.
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
  const reps = 5
  const oldKg = 100
  const newKg = 110 // heavier — and this is the load that needs to win the "most repeated load" count

  // Phase 1: the original stall at the old load, 3 matched sessions, RIR 3 -> 1.
  const phase1Days = [40, 35, 30]
  const phase1Rirs = [3, 2, 1]
  for (let i = 0; i < phase1Days.length; i++) {
    const at = daysAgo(phase1Days[i])
    const sessionId = await createSession(supabase, userId, { exerciseOrder: [bench], startedAt: at, endedAt: at })
    await logSet(supabase, userId, { sessionId, variantId: bench, weightKg: oldKg, reps, rir: phase1Rirs[i], loggedAt: at })
  }

  await createRecommendation(supabase, userId, {
    kind: 'plateau',
    variantId: bench,
    title: 'Bench Press',
    body: 'Load has not moved while RIR fell 2 points. That is a fatigue plateau, not a strength ceiling — the same weight is simply costing more.',
    actions: { matchedLoadKg: oldKg, drop: 2, sessions: 3 },
    status: 'dismissed',
    createdAt: daysAgo(28),
  })

  // Phase 2: the lifter broke through, and now stalls again 10kg heavier.
  // 4 sessions (more than phase 1's 3) so the heavier load becomes the modal
  // matched combination the resolver's matchedRirSeries picks up.
  const phase2Days = [20, 14, 9, 4]
  const phase2Rirs = [3, 2.3, 1.6, 1]
  for (let i = 0; i < phase2Days.length; i++) {
    const at = daysAgo(phase2Days[i])
    const sessionId = await createSession(supabase, userId, { exerciseOrder: [bench], startedAt: at, endedAt: at })
    await logSet(supabase, userId, { sessionId, variantId: bench, weightKg: newKg, reps, rir: phase2Rirs[i], loggedAt: at })
  }

  console.log(`Seeded: 3 sessions stalled at ${oldKg}kg + dismissed, then 4 sessions stalled again at ${newKg}kg.`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
