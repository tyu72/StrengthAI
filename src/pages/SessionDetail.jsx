import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { profile as profileApi, sessions, sets as setsApi, variants as variantsApi } from '@/api/db'
import { canonicalLabel } from '@/lib/resolver'
import { display } from '@/lib/units'
import { sessionVolumeKg } from '@/lib/coach'

export default function SessionDetail() {
  const { sessionId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [unit, setUnit] = useState('lb')
  const [session, setSession] = useState(null)
  const [sessionSets, setSessionSets] = useState([])
  const [variantList, setVariantList] = useState([])
  const [busy, setBusy] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([profileApi.get(), sessions.get(sessionId), setsApi.forSession(sessionId), variantsApi.list()])
      .then(([p, s, st, v]) => {
        if (!alive) return
        // this screen is read-only; the still-in-progress session belongs on /workout
        if (s.status === 'active') {
          navigate(`/workout/${s.id}`, { replace: true })
          return
        }
        setUnit(p?.unit ?? 'lb')
        setSession(s)
        setSessionSets(st)
        setVariantList(v)
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

  const stats = useMemo(() => {
    if (!session) return []
    const volKg = sessionVolumeKg(sessionSets)
    const volK = Math.round((display(volKg, unit) / 1000) * 10) / 10
    const durMin = session.ended_at
      ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000)
      : null
    return [
      { label: 'Sets', value: sessionSets.length },
      { label: 'Volume', value: `${volK}k` },
      { label: 'Time', value: durMin != null ? `${durMin}m` : '—' },
    ]
  }, [session, sessionSets, unit])

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
        mods: v && v.mods?.length ? v.mods.join(' · ') : 'standard',
        sets: varSets.map((s, i) => ({
          id: s.id,
          n: i + 1,
          line: `${display(s.weight_kg, unit)} ${unit} × ${s.reps}${s.rir != null ? ` · RIR ${s.rir}` : ''}`,
        })),
      }
    })
  }, [session, variantById, sessionSets, unit])

  const formattedDate = session
    ? new Date(session.started_at).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : ''

  const handleDelete = async () => {
    setBusy(true)
    try {
      await sessions.remove(sessionId)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <div
        className="sticky z-20 flex items-center gap-3 border-b border-accent bg-background/90 px-[14px] py-[10px] backdrop-blur-md"
        style={{ top: 'var(--safe-top)' }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-muted-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold tracking-[-0.01em]">{session?.name || 'Workout'}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{formattedDate}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-[18px] pt-[14px] pb-8">
        {error && (
          <div className="rounded-[14px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
            {error}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-[14px] border border-border bg-card p-[11px]">
              <div className="font-mono text-[18px] font-medium tracking-[-0.02em]">{s.value}</div>
              <div className="mt-1 text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {blocks.map((block) => (
          <div key={block.variantId} className="rounded-2xl border border-border bg-card p-[13px]">
            <div className="text-[14px] font-semibold tracking-[-0.01em]">{block.name}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{block.mods}</div>
            <div className="mt-2">
              {block.sets.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between border-t border-accent py-[7px] font-mono text-[12.5px]"
                >
                  <span className="text-[#5F665F]">{s.n}</span>
                  <span>{s.line}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialog.Trigger className="flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/30 py-3 text-[13px] text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete session
          </AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
            <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 text-foreground">
              <AlertDialog.Title className="text-[16px] font-semibold">Delete this session?</AlertDialog.Title>
              <AlertDialog.Description className="mt-2 text-[13.5px] text-muted-foreground">
                All logged sets will be deleted. This can&apos;t be undone.
              </AlertDialog.Description>
              <div className="mt-5 flex gap-2">
                <AlertDialog.Close className="flex-1 rounded-xl border border-border py-[10px] text-[13px] text-muted-foreground">
                  Cancel
                </AlertDialog.Close>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-destructive/10 py-[10px] text-[13px] font-semibold text-destructive disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            </AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </div>
    </div>
  )
}
