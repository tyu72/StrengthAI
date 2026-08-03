// PLATEAU — one variant, 6 sessions at a matched load, RIR falling 3 -> 1.
// Expect a single STALLED plateau card on Coach.
'use strict'
const { getSession, wipeAll, daysAgo, ensureVariant, createSession, logSet } = require('./_lib.cjs')

async function main() {
  const { supabase, userId } = await getSession()
  console.log('Wiping account...')
  await wipeAll(supabase, userId)

  const bench = await ensureVariant(supabase, userId, { base: 'bench press', muscle: 'pectorals', body_part: 'chest' })

  const daysBack = [30, 25, 20, 15, 10, 5]
  const rirs = [3, 2.6, 2.2, 1.8, 1.4, 1]
  const weightKg = 100
  const reps = 5

  for (let i = 0; i < daysBack.length; i++) {
    const at = daysAgo(daysBack[i])
    const sessionId = await createSession(supabase, userId, { exerciseOrder: [bench], startedAt: at, endedAt: at })
    await logSet(supabase, userId, { sessionId, variantId: bench, weightKg, reps, rir: rirs[i], loggedAt: at })
  }

  console.log(`Seeded: 6 sessions, Bench Press ${weightKg}kg x${reps}, RIR ${rirs.join(' -> ')}.`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
