// Shared helpers for the Coach-verification seed scripts in this folder.
// Every script signs in as the seed account and writes backdated rows directly via
// @supabase/supabase-js — RLS scopes everything to that account, same as the app itself.
'use strict'

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const SEED_EMAIL = 'strengthai.seed.test@example.com'

function loadEnvLocal() {
  const envPath = path.join(__dirname, '..', '..', '.env.local')
  const out = {}
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

async function getSession() {
  const password = process.env.SEED_PASSWORD
  if (!password) {
    console.error('Set SEED_PASSWORD to the seed account password, e.g.:')
    console.error('  SEED_PASSWORD=xxx node scripts/seed/plateau.cjs')
    process.exit(1)
  }
  const env = loadEnvLocal()
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
  const { data, error } = await supabase.auth.signInWithPassword({ email: SEED_EMAIL, password })
  if (error) {
    console.error('Login failed:', error.message)
    process.exit(1)
  }
  return { supabase, userId: data.user.id }
}

/** Backdated local date, noon, N days before today. */
function daysAgo(n) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

const iso = (d) => d.toISOString()

async function ensureVariant(supabase, userId, { base, mods = [], muscle, body_part }) {
  const row = { user_id: userId, base, mods: [...mods].sort(), muscle, body_part, source_text: base }
  const { data, error } = await supabase
    .from('exercise_variants')
    .upsert(row, { onConflict: 'user_id,base,mods' })
    .select()
    .single()
  if (error) throw new Error(`ensureVariant(${base}): ${error.message}`)
  return data.id
}

async function createSession(supabase, userId, { name = null, exerciseOrder, notes = null, startedAt, endedAt }) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .insert({
      user_id: userId,
      name,
      status: 'completed',
      exercise_order: exerciseOrder,
      notes,
      started_at: iso(startedAt),
      ended_at: iso(endedAt),
    })
    .select()
    .single()
  if (error) throw new Error(`createSession: ${error.message}`)
  return data.id
}

async function logSet(supabase, userId, { sessionId, variantId, weightKg, reps, rir, rpe = null, setNumber = 1, loggedAt }) {
  const { error } = await supabase.from('workout_sets').insert({
    user_id: userId,
    session_id: sessionId,
    variant_id: variantId,
    weight_kg: weightKg,
    reps,
    rir,
    rpe,
    set_number: setNumber,
    logged_at: iso(loggedAt),
  })
  if (error) throw new Error(`logSet: ${error.message}`)
}

/** Mirrors src/lib/units.js's readinessScore — duplicated here since that file is an ES module. */
function readinessScore({ sleep_hours, energy, soreness, stress }) {
  const sleep = Math.min(sleep_hours / 7, 1) * 10
  return Math.round(((sleep + energy + (10 - soreness) + (10 - stress)) / 4) * 10) / 10
}

async function createReadiness(supabase, userId, { sessionId, sleep_hours, energy, soreness, stress, createdAt }) {
  const score = readinessScore({ sleep_hours, energy, soreness, stress })
  const { error } = await supabase.from('readiness_entries').insert({
    user_id: userId,
    session_id: sessionId,
    sleep_hours,
    energy,
    soreness,
    stress,
    score,
    created_at: iso(createdAt),
  })
  if (error) throw new Error(`createReadiness: ${error.message}`)
  return score
}

async function createRecommendation(supabase, userId, { kind, variantId = null, title, body, actions, status, createdAt }) {
  const { error } = await supabase.from('coach_recommendations').insert({
    user_id: userId,
    kind,
    variant_id: variantId,
    title,
    body,
    actions,
    status,
    created_at: iso(createdAt),
  })
  if (error) throw new Error(`createRecommendation: ${error.message}`)
}

async function createGoal(supabase, userId, { variantId, targetKg, targetReps, status = 'active' }) {
  const { error } = await supabase.from('strength_goals').insert({
    user_id: userId,
    variant_id: variantId,
    target_kg: targetKg,
    target_reps: targetReps,
    status,
  })
  if (error) throw new Error(`createGoal: ${error.message}`)
}

async function wipeAll(supabase, userId) {
  // workout_sessions cascades to workout_sets/readiness_entries; exercise_variants
  // cascades to coach_plans/coach_recommendations/strength_goals. Deleted explicitly
  // anyway so the order and result are obvious from the log, not implicit in FKs.
  const tables = [
    'workout_sessions',
    'pattern_flags',
    'coach_plans',
    'coach_recommendations',
    'strength_goals',
    'muscle_goals',
    'weekly_reports',
    'workout_templates',
    'exercise_variants',
  ]
  for (const t of tables) {
    const { error } = await supabase.from(t).delete().eq('user_id', userId)
    if (error) throw new Error(`wipe ${t}: ${error.message}`)
    console.log(`  cleared ${t}`)
  }
}

const KG_PER_LB = 1 / 2.20462262
const lb = (kg) => Math.round(kg * 2.20462262 * 10) / 10

module.exports = {
  SEED_EMAIL,
  getSession,
  daysAgo,
  iso,
  ensureVariant,
  createSession,
  logSet,
  createReadiness,
  createRecommendation,
  createGoal,
  wipeAll,
  readinessScore,
  lb,
  KG_PER_LB,
}
