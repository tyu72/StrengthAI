import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { ArrowLeft, Check, Sparkles, Trash2 } from 'lucide-react'
import { profile as profileApi, sessions, sets as setsApi, variants as variantsApi } from '@/api/db'
import { canonicalLabel } from '@/lib/resolver'
import { ExerciseBlock } from '@/components/workout/ExerciseBlock'
import { AddExerciseSheet } from '@/components/workout/AddExerciseSheet'
import { SetLoggerSheet } from '@/components/workout/SetLoggerSheet'
import { RestTimer } from '@/components/workout/RestTimer'

const REST_KEY = 'strengthai.rest'
const REST_SECONDS = 150

export default function Workout() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [unit, setUnit] = useState('lb')
  const [session, setSession] = useState(null)
  const [name, setName] = useState('')
  const [variantList, setVariantList] = useState([])
  const [sessionSets, setSessionSets] = useState([])
  const [busy, setBusy] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [logVariantId, setLogVariantId] = useState(null)
  const [restEnd, setRestEnd] = useState(null)
  const [restLen, setRestLen] = useState(REST_SECONDS)
  const [restFor, setRestFor] = useState('')

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REST_KEY)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved.restEnd > Date.now()) {
        setRestEnd(saved.restEnd)
        setRestLen(saved.restLen)
        setRestFor(saved.restFor)
      } else {
        localStorage.removeItem(REST_KEY)
      }
    } catch {
      localStorage.removeItem(REST_KEY)
    }
  }, [])

  useEffect(() => {
    let alive = true
    Promise.all([profileApi.get(), sessions.get(sessionId), variantsApi.list(), setsApi.forSession(sessionId)])
      .then(([p, s, v, st]) => {
        if (!alive) return
        // this screen is for the live session only; a finished one is read-only on /session
        if (s.status !== 'active') {
          navigate(`/session/${s.id}`, { replace: true })
          return
        }
        setUnit(p?.unit ?? 'lb')
        setSession(s)
        setName(s.name || '')
        setVariantList(v)
        setSessionSets(st)
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [sessionId])

  const variantById = useMemo(() => {
    const map = new Map()
    variantList.forEach((v) => map.set(v.id, v))
    return map
  }, [variantList])

  const blocks = useMemo(() => {
    const order = session?.exercise_order || []
    return order.map((vid) => {
      const v = variantById.get(vid)
      const varSets = sessionSets
        .filter((s) => s.variant_id === vid)
        .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at))
      return {
        variantId: vid,
        name: v ? canonicalLabel(v.base) : 'Unknown exercise',
        chips: v ? [...(v.mods || []), v.muscle].filter(Boolean) : [],
        sets: varSets,
      }
    })
  }, [session, variantById, sessionSets])

  const formattedDate = session
    ? new Date(session.started_at).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : ''

  const persistName = async () => {
    if (!session || name === (session.name || '')) return
    try {
      const updated = await sessions.update(sessionId, { name })
      setSession(updated)
    } catch (err) {
      setError(err.message)
    }
  }

  const reorder = async (index, direction) => {
    const prevOrder = session.exercise_order || []
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= prevOrder.length) return
    const order = [...prevOrder]
    ;[order[index], order[newIndex]] = [order[newIndex], order[index]]

    setSession((s) => ({ ...s, exercise_order: order }))
    try {
      await sessions.update(sessionId, { exercise_order: order })
    } catch (err) {
      setSession((s) => ({ ...s, exercise_order: prevOrder }))
      setError(err.message)
    }
  }

  const removeExercise = async (vid) => {
    const prevOrder = session.exercise_order || []
    const prevSets = sessionSets
    const removedSets = prevSets.filter((s) => s.variant_id === vid)
    const newOrder = prevOrder.filter((id) => id !== vid)

    setSession((s) => ({ ...s, exercise_order: newOrder }))
    setSessionSets((list) => list.filter((s) => s.variant_id !== vid))
    try {
      await sessions.update(sessionId, { exercise_order: newOrder })
      await Promise.all(removedSets.map((s) => setsApi.remove(s.id)))
    } catch (err) {
      setSession((s) => ({ ...s, exercise_order: prevOrder }))
      setSessionSets(prevSets)
      setError(err.message)
    }
  }

  const deleteSet = async (setId) => {
    const prevSets = sessionSets
    setSessionSets((list) => list.filter((s) => s.id !== setId))
    try {
      await setsApi.remove(setId)
    } catch (err) {
      setSessionSets(prevSets)
      setError(err.message)
    }
  }

  const handleAddExercise = async ({ variantId, base, mods, muscle, bodyPart, sourceText }) => {
    let vid = variantId
    if (!vid) {
      const created = await variantsApi.ensure({ base, mods, muscle, body_part: bodyPart, source_text: sourceText })
      vid = created.id
      setVariantList((list) => (list.some((v) => v.id === created.id) ? list : [...list, created]))
    }
    await variantsApi.bumpUse(vid)
    setVariantList((list) => list.map((v) => (v.id === vid ? { ...v, uses: (v.uses || 0) + 1 } : v)))

    const prevOrder = session.exercise_order || []
    if (!prevOrder.includes(vid)) {
      const newOrder = [...prevOrder, vid]
      setSession((s) => ({ ...s, exercise_order: newOrder }))
      await sessions.update(sessionId, { exercise_order: newOrder })
    }
  }

  const startRestTimer = (name) => {
    const end = Date.now() + REST_SECONDS * 1000
    setRestEnd(end)
    setRestLen(REST_SECONDS)
    setRestFor(name)
    localStorage.setItem(REST_KEY, JSON.stringify({ restEnd: end, restLen: REST_SECONDS, restFor: name }))
  }

  const extendRest = () => {
    const newEnd = restEnd + 30000
    const newLen = restLen + 30
    setRestEnd(newEnd)
    setRestLen(newLen)
    localStorage.setItem(REST_KEY, JSON.stringify({ restEnd: newEnd, restLen: newLen, restFor }))
  }

  const skipRest = () => {
    setRestEnd(null)
    localStorage.removeItem(REST_KEY)
  }

  const handleLogSet = (variantId, { weightKg, reps, rir, rpe }) => {
    const variant = variantById.get(variantId)
    const variantName = variant ? canonicalLabel(variant.base) : ''
    const setNumber = sessionSets.filter((s) => s.variant_id === variantId).length + 1
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const optimisticSet = {
      id: tempId,
      session_id: sessionId,
      variant_id: variantId,
      weight_kg: weightKg,
      reps,
      rir,
      rpe,
      set_number: setNumber,
      logged_at: new Date().toISOString(),
    }

    setSessionSets((list) => [...list, optimisticSet])
    startRestTimer(variantName)

    setsApi
      .log({
        session_id: sessionId,
        variant_id: variantId,
        weight_kg: weightKg,
        reps,
        rir,
        rpe,
        set_number: setNumber,
      })
      .then((real) => {
        setSessionSets((list) => list.map((s) => (s.id === tempId ? real : s)))
      })
      .catch((err) => {
        setSessionSets((list) => list.filter((s) => s.id !== tempId))
        setError(err.message)
      })
  }

  const handleFinish = async () => {
    setBusy(true)
    try {
      await sessions.finish(sessionId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const handleDiscard = async () => {
    setBusy(true)
    try {
      await sessions.remove(sessionId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setDiscardOpen(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">
      <div
        className="sticky z-20 flex items-center justify-between gap-2 border-b border-accent bg-background/90 px-[14px] py-[10px] backdrop-blur-md"
        style={{ top: 'var(--safe-top)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-muted-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-sm font-semibold tracking-[-0.01em]">{session?.name || 'Workout'}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{formattedDate}</div>
        </div>
        <button
          onClick={handleFinish}
          disabled={busy}
          className="flex shrink-0 items-center gap-1 rounded-[11px] bg-primary px-[14px] py-[9px] text-[13px] font-bold text-primary-foreground disabled:opacity-60"
        >
          <Check className="h-[17px] w-[17px]" />
          Finish
        </button>
      </div>

      <div className="flex flex-col gap-3 px-[18px] pt-[14px] pb-[76px]">
        {error && (
          <div className="rounded-[14px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={persistName}
          placeholder="Name this workout"
          className="rounded-2xl border border-border bg-card px-4 py-[14px] text-base font-semibold tracking-[-0.01em] text-foreground placeholder:font-normal placeholder:text-muted-foreground/50"
        />

        {blocks.map((block, i) => (
          <ExerciseBlock
            key={block.variantId}
            block={block}
            index={i}
            total={blocks.length}
            unit={unit}
            onUp={() => reorder(i, -1)}
            onDown={() => reorder(i, 1)}
            onRemove={() => removeExercise(block.variantId)}
            onDeleteSet={deleteSet}
            onLogSet={() => setLogVariantId(block.variantId)}
          />
        ))}

        <button
          onClick={() => setAddOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-[15px] text-[13.5px] font-medium text-[#9AA39C]"
        >
          <Sparkles className="h-[18px] w-[18px] text-primary" />
          Describe an exercise
        </button>

        <AlertDialog.Root open={discardOpen} onOpenChange={setDiscardOpen}>
          <AlertDialog.Trigger className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 py-3 text-[13px] text-destructive">
            <Trash2 className="h-4 w-4" />
            Discard workout
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
            <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 text-foreground">
              <AlertDialog.Title className="text-[16px] font-semibold">Discard this workout?</AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-[13.5px] text-muted-foreground">
                All logged sets will be deleted. This can&apos;t be undone.
              </AlertDialog.Description>
              <div className="mt-5 flex gap-2">
                <AlertDialog.Close className="flex-1 rounded-xl border border-border py-[10px] text-[13px] text-muted-foreground">
                  Cancel
                </AlertDialog.Close>
                <button
                  onClick={handleDiscard}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-destructive/10 py-[10px] text-[13px] font-semibold text-destructive disabled:opacity-60"
                >
                  Discard
                </button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>

      <AddExerciseSheet
        open={addOpen}
        onOpenChange={setAddOpen}
        variants={variantList}
        unit={unit}
        onAdd={handleAddExercise}
      />

      <SetLoggerSheet
        open={!!logVariantId}
        onOpenChange={(v) => !v && setLogVariantId(null)}
        variantId={logVariantId}
        variantName={logVariantId ? canonicalLabel(variantById.get(logVariantId)?.base || '') : ''}
        unit={unit}
        onSave={(payload) => handleLogSet(logVariantId, payload)}
      />

      <RestTimer restEnd={restEnd} restLen={restLen} restFor={restFor} onExtend={extendRest} onSkip={skipRest} />
    </div>
  )
}
