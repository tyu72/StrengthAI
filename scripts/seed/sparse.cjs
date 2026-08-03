// SPARSE — 2 sessions total. Every coaching surface should show its honest empty
// state: too little data to claim anything, not a fabricated verdict.
'use strict'
const { getSession, wipeAll, daysAgo, ensureVariant, createSession, logSet } = require('./_lib.cjs')

async function main() {
  const { supabase, userId } = await getSession()
  console.log('Wiping account...')
  await wipeAll(supabase, userId)

  const bench = await ensureVariant(supabase, userId, { base: 'bench press', muscle: 'pectorals', body_part: 'chest' })

  const s1 = await createSession(supabase, userId, {
    exerciseOrder: [bench],
    startedAt: daysAgo(10),
    endedAt: daysAgo(10),
  })
  await logSet(supabase, userId, { sessionId: s1, variantId: bench, weightKg: 100, reps: 5, rir: 2.5, loggedAt: daysAgo(10) })

  const s2 = await createSession(supabase, userId, {
    exerciseOrder: [bench],
    startedAt: daysAgo(6),
    endedAt: daysAgo(6),
  })
  await logSet(supabase, userId, { sessionId: s2, variantId: bench, weightKg: 100, reps: 5, rir: 2, loggedAt: daysAgo(6) })

  console.log('Seeded: 2 sessions, 1 set each, Bench Press 100kg x5.')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
