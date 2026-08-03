import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut, Minus, Plus } from 'lucide-react'
import { auth, muscleGoals, profile as profileApi } from '@/api/db'
import { PART_LABELS, PART_ORDER } from '@/pages/Home'

const UNIT_OPTS = [
  { key: 'kg', label: 'kg', hint: 'Kilograms' },
  { key: 'lb', label: 'lb', hint: 'Pounds' },
]

const DIET_OPTS = [
  { key: 'cutting', label: 'Cutting', hint: 'Deficit' },
  { key: 'maintaining', label: 'Maintaining', hint: 'Neutral' },
  { key: 'bulking', label: 'Bulking', hint: 'Surplus' },
]

export default function Settings() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [profileRow, setProfileRow] = useState(null)
  const [mgoals, setMgoals] = useState([])
  // per-body-part debounce so a burst of stepper clicks coalesces into one write —
  // two independent upserts fired back to back have no ordering guarantee, so the
  // last click's value isn't reliably the last one persisted otherwise
  const goalTimers = useRef({})

  useEffect(() => {
    let alive = true
    Promise.all([profileApi.get(), muscleGoals.list()])
      .then(([p, g]) => {
        if (!alive) return
        setProfileRow(p)
        setMgoals(g)
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const pickUnit = async (unit) => {
    if (unit === profileRow.unit) return
    const prev = profileRow
    setProfileRow((p) => ({ ...p, unit }))
    try {
      await profileApi.update({ unit })
    } catch (err) {
      setProfileRow(prev)
      setError(err.message)
    }
  }

  const pickDiet = async (diet) => {
    const next = profileRow.diet_phase === diet ? null : diet
    const prev = profileRow
    setProfileRow((p) => ({ ...p, diet_phase: next }))
    try {
      await profileApi.update({ diet_phase: next })
    } catch (err) {
      setProfileRow(prev)
      setError(err.message)
    }
  }

  // Reads the current value from the updater (not from a render-time closure) so two
  // rapid clicks each see the other's result instead of both computing from the same
  // stale render, then debounces the actual write per body part.
  const bumpGoal = (bodyPart, delta) => {
    let clamped
    setMgoals((list) => {
      const current = list.find((g) => g.body_part === bodyPart)?.weekly_target ?? 0
      clamped = Math.max(0, Math.min(7, current + delta))
      const exists = list.some((g) => g.body_part === bodyPart)
      return exists
        ? list.map((g) => (g.body_part === bodyPart ? { ...g, weekly_target: clamped } : g))
        : [...list, { body_part: bodyPart, weekly_target: clamped }]
    })
    clearTimeout(goalTimers.current[bodyPart])
    goalTimers.current[bodyPart] = setTimeout(() => {
      muscleGoals.set(bodyPart, clamped).catch((err) => setError(err.message))
    }, 400)
  }

  const handleLogout = async () => {
    await auth.signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  const goalByPart = new Map(mgoals.map((g) => [g.body_part, g.weekly_target]))

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <div
        className="sticky z-20 flex items-center gap-[10px] border-b border-accent bg-background/90 px-[14px] py-[10px] backdrop-blur-md"
        style={{ top: 'var(--safe-top)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-muted-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="text-[15px] font-bold tracking-[-0.02em]">Settings</div>
      </div>

      <div className="flex flex-col gap-0 px-[18px] pt-[16px] pb-8">
        {error && (
          <div className="mb-3 rounded-[14px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Units</div>
        <div className="mb-[22px] grid grid-cols-2 gap-2">
          {UNIT_OPTS.map((o) => {
            const isSel = profileRow.unit === o.key
            return (
              <button
                key={o.key}
                onClick={() => pickUnit(o.key)}
                className="rounded-2xl border p-[14px] text-left"
                style={{
                  borderColor: isSel ? 'rgba(168,201,162,.45)' : '#272C29',
                  background: isSel ? 'rgba(168,201,162,.07)' : 'transparent',
                }}
              >
                <div className="text-[15px] font-bold" style={{ color: isSel ? '#A8C9A2' : '#ECEFEA' }}>
                  {o.label}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{o.hint}</div>
              </button>
            )
          })}
        </div>

        <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Diet phase
        </div>
        <div className="mb-[9px] text-[12px] leading-[1.45] text-muted-foreground">
          Optional. Lets the coach separate a real plateau from a calorie deficit.
        </div>
        <div className="mb-[22px] grid grid-cols-3 gap-2">
          {DIET_OPTS.map((o) => {
            const isSel = profileRow.diet_phase === o.key
            return (
              <button
                key={o.key}
                onClick={() => pickDiet(o.key)}
                className="rounded-[14px] border p-3 text-center"
                style={{
                  borderColor: isSel ? 'rgba(168,201,162,.45)' : '#272C29',
                  background: isSel ? 'rgba(168,201,162,.07)' : 'transparent',
                }}
              >
                <div className="text-[13px] font-semibold" style={{ color: isSel ? '#A8C9A2' : '#ECEFEA' }}>
                  {o.label}
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{o.hint}</div>
              </button>
            )
          })}
        </div>

        <div className="mb-[9px] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Weekly training goals
        </div>
        <div className="mb-[22px] flex flex-col gap-[9px]">
          {PART_ORDER.map((part) => {
            const val = goalByPart.get(part) ?? 0
            return (
              <div
                key={part}
                className="flex items-center justify-between gap-3 rounded-[14px] border border-border bg-card px-[14px] py-3"
              >
                <div className="text-[14px] font-medium">{PART_LABELS[part]}</div>
                <div className="flex items-center gap-[10px]">
                  <button
                    onClick={() => bumpGoal(part, -1)}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-border text-muted-foreground"
                  >
                    <Minus className="h-[17px] w-[17px]" />
                  </button>
                  <div className="w-4 text-center font-mono text-[15px]">{val}</div>
                  <button
                    onClick={() => bumpGoal(part, 1)}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-border text-muted-foreground"
                  >
                    <Plus className="h-[17px] w-[17px]" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mb-[9px] text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Account
        </div>
        <div className="rounded-2xl border border-border bg-card p-[14px]">
          <div className="text-[11px] text-muted-foreground">Signed in as</div>
          <div className="mt-0.5 text-[14px] font-medium">{profileRow.email}</div>
          <button onClick={handleLogout} className="mt-3 flex items-center gap-[7px] text-[13px] text-destructive">
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
