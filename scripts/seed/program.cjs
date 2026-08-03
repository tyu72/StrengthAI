// PROGRAM — three variants stalling in the same two-week window, readiness
// declining across it. Expect the program-level card AND three individual
// plateau cards (program-level is additive context, not a replacement).
'use strict'
const {
  getSession,
  wipeAll,
  daysAgo,
  ensureVariant,
  createSession,
  logSet,
  createReadiness,
} = require('./_lib.cjs')

async function main() {
  const { supabase, userId } = await getSession()
  console.log('Wiping account...')
  await wipeAll(supabase, userId)

  const bench = await ensureVariant(supabase, userId, { base: 'bench press', muscle: 'pectorals', body_part: 'chest' })
  const squat = await ensureVariant(supabase, userId, { base: 'squat', muscle: 'quads', body_part: 'legs' })
  const ohp = await ensureVariant(supabase, userId, { base: 'overhead press', muscle: 'delts', body_part: 'arms' })

  const daysBack = [14, 11, 9, 7, 4, 2] // 6 sessions inside a 14-day window
  const rirs = [3, 2.6, 2.2, 1.8, 1.4, 1] // same falling pattern for all three lifts
  const loads = {
    [bench]: 100,
    [squat]: 120,
    [ohp]: 55,
  }
  // readiness falls across the same window
  const readinessRows = [
    { sleep_hours: 7, energy: 7, soreness: 3, stress: 3 },
    { sleep_hours: 6.5, energy: 6, soreness: 3, stress: 3 },
    { sleep_hours: 6, energy: 6, soreness: 4, stress: 4 },
    { sleep_hours: 5.5, energy: 5, soreness: 5, stress: 4 },
    { sleep_hours: 5, energy: 4, soreness: 6, stress: 5 },
    { sleep_hours: 4.5, energy: 4, soreness: 7, stress: 6 },
  ]

  for (let i = 0; i < daysBack.length; i++) {
    const at = daysAgo(daysBack[i])
    const sessionId = await createSession(supabase, userId, {
      exerciseOrder: [bench, squat, ohp],
      startedAt: at,
      endedAt: at,
    })
    for (const variantId of [bench, squat, ohp]) {
      await logSet(supabase, userId, { sessionId, variantId, weightKg: loads[variantId], reps: 5, rir: rirs[i], loggedAt: at })
    }
    const score = await createReadiness(supabase, userId, { sessionId, ...readinessRows[i], createdAt: at })
    console.log(`  session ${i + 1} (${daysBack[i]}d ago): RIR ${rirs[i]}, readiness ${score}`)
  }

  console.log('Seeded: 6 sessions x 3 lifts (Bench Press, Squat, Overhead Press), all stalling together, readiness falling.')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
