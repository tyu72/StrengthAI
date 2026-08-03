// Wipes every row belonging to the seed account. Run alone when you want the
// account empty with nothing re-seeded.
'use strict'
const { getSession, wipeAll, SEED_EMAIL } = require('./_lib.cjs')

async function main() {
  const { supabase, userId } = await getSession()
  console.log(`Wiping ${SEED_EMAIL} (${userId})...`)
  await wipeAll(supabase, userId)
  console.log('Done. Account is empty.')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
