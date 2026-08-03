// GOAL-STALLED — flat history (same weight every session), so the observed
// rate is exactly 0. Expect: projectGoal refuses to project — "flat" / "stalled"
// and the honest reason text, not a fabricated ETA.
'use strict'
const { getSession, wipeAll, daysAgo, ensureVariant, createSession, logSet, createGoal } = require('./_lib.cjs')

async function main() {
  const { supabase, userId } = await getSession()
  console.log('Wiping account...')
  await wipeAll(supabase, userId)

  const ohp = await ensureVariant(supabase, userId, { base: 'overhead press', muscle: 'delts', body_part: 'arms' })

  const daysBack = [56, 49, 42, 35, 28, 21, 14, 7]
  const weightKg = 55 // identical every session -> observed rate is exactly 0
  const reps = 5

  for (const d of daysBack) {
    const at = daysAgo(d)
    const sessionId = await createSession(supabase, userId, { exerciseOrder: [ohp], startedAt: at, endedAt: at })
    await logSet(supabase, userId, { sessionId, variantId: ohp, weightKg, reps, rir: 3, loggedAt: at })
  }

  // current e1RM ~= 55*(1+5/30) = 64.2kg. Target well above what a flat trend can reach.
  await createGoal(supabase, userId, { variantId: ohp, targetKg: 80, targetReps: 5, status: 'active' })

  console.log('Seeded: 8 sessions, Overhead Press flat at 55kg x5, goal target 80kg x5 (unreachable at this rate).')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
