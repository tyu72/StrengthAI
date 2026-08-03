// GOAL-ACHIEVED — history that clears a goal target. Expect: on load, Coach
// flips the goal to 'achieved' (write-on-read) and renders the "Target reached"
// card instead of a projection.
'use strict'
const { getSession, wipeAll, daysAgo, ensureVariant, createSession, logSet, createGoal } = require('./_lib.cjs')

async function main() {
  const { supabase, userId } = await getSession()
  console.log('Wiping account...')
  await wipeAll(supabase, userId)

  const deadlift = await ensureVariant(supabase, userId, { base: 'deadlift', muscle: 'hamstrings', body_part: 'legs' })

  const daysBack = [70, 60, 50, 40, 30, 20, 10, 3]
  const weights = [100, 108, 115, 122, 128, 135, 142, 150] // kg, rising
  const reps = 5

  for (let i = 0; i < daysBack.length; i++) {
    const at = daysAgo(daysBack[i])
    const sessionId = await createSession(supabase, userId, { exerciseOrder: [deadlift], startedAt: at, endedAt: at })
    await logSet(supabase, userId, { sessionId, variantId: deadlift, weightKg: weights[i], reps, rir: 2, loggedAt: at })
  }

  // best e1RM right now is 150kg x5 -> e1rm = 150*(1+5/30) = 175kg. Target well under that.
  await createGoal(supabase, userId, { variantId: deadlift, targetKg: 140, targetReps: 5, status: 'active' })

  console.log('Seeded: 8 sessions, Deadlift 100kg -> 150kg x5, goal target 140kg x5 (already cleared).')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
