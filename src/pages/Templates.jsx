import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { Dumbbell, Play, Plus, Trash2 } from 'lucide-react'
import { sessions, templates as templatesApi, variants as variantsApi } from '@/api/db'
import { canonicalLabel } from '@/lib/resolver'

export default function Templates() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [templateList, setTemplateList] = useState([])
  const [variantList, setVariantList] = useState([])
  const [active, setActive] = useState(null)
  const [starting, setStarting] = useState(null)
  // Deleting a template is irreversible and was a single unguarded tap. SessionDetail already
  // confirms before destroying a session; this is the same class of action.
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([templatesApi.list(), variantsApi.list(), sessions.active()])
      .then(([t, v, act]) => {
        if (!alive) return
        setTemplateList(t)
        setVariantList(v)
        setActive(act)
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const variantById = useMemo(() => {
    const map = new Map()
    variantList.forEach((v) => map.set(v.id, v))
    return map
  }, [variantList])

  const handleNew = async () => {
    try {
      const created = await templatesApi.create({ name: 'New workout', exercise_order: [] })
      navigate(`/template/${created.id}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async () => {
    const target = pendingDelete
    if (!target) return
    setPendingDelete(null)
    const prev = templateList
    setTemplateList((list) => list.filter((t) => t.id !== target.id))
    try {
      await templatesApi.remove(target.id)
    } catch (err) {
      setTemplateList(prev)
      setError(err.message)
    }
  }

  const handleStart = async (template) => {
    if (active) {
      navigate(`/workout/${active.id}`)
      return
    }
    setStarting(template.id)
    try {
      const created = await sessions.start({
        name: template.name,
        template_id: template.id,
        exercise_order: template.exercise_order || [],
      })
      navigate(`/workout/${created.id}`)
    } catch (err) {
      setError(err.message)
      setStarting(null)
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
    <div className="min-h-full bg-background px-[18px] pt-[14px] pb-[76px] text-foreground">
      {error && (
        <div className="mb-3 rounded-[14px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
          {error}
        </div>
      )}

      <div className="mb-[18px] flex items-start justify-between">
        <div>
          <div className="text-[22px] font-bold tracking-[-0.025em]">Workouts</div>
          <div className="mt-[3px] text-[12px] text-muted-foreground">Reusable templates</div>
        </div>
        <button
          onClick={handleNew}
          className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-primary text-primary-foreground"
        >
          <Plus className="h-[22px] w-[22px]" />
        </button>
      </div>

      {templateList.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] py-[60px] text-center text-[#5F665F]">
          <Dumbbell className="h-[38px] w-[38px]" />
          <div className="text-[13px]">No templates yet. Tap + to build one.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {templateList.map((t) => {
            const summary =
              (t.exercise_order || [])
                .map((vid) => {
                  const v = variantById.get(vid)
                  return v ? canonicalLabel(v.base) : null
                })
                .filter(Boolean)
                .join(' · ') || 'Empty'
            return (
              <div key={t.id} className="rounded-[18px] border border-border bg-card p-[15px]">
                <div className="flex items-start justify-between gap-[10px]">
                  <button onClick={() => navigate(`/template/${t.id}`)} className="min-w-0 flex-1 text-left">
                    <div className="text-[15px] font-semibold tracking-[-0.01em]">{t.name}</div>
                    <div className="mt-[3px] truncate text-[12px] leading-[1.4] text-muted-foreground">{summary}</div>
                  </button>
                  <button onClick={() => setPendingDelete(t)} className="text-[#5F665F]">
                    <Trash2 className="h-[17px] w-[17px]" />
                  </button>
                </div>
                <button
                  onClick={() => handleStart(t)}
                  disabled={starting === t.id}
                  className="mt-3 flex w-full items-center justify-center gap-[6px] rounded-xl border border-[#313632] bg-[#1E2220] py-[11px] text-[13px] font-semibold disabled:opacity-60"
                >
                  <Play className="h-[17px] w-[17px] fill-primary text-primary" />
                  Start
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Same pattern and copy shape as SessionDetail's delete guard. */}
      <AlertDialog.Root open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-black/60" />
          <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(90vw,360px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 text-foreground">
            <AlertDialog.Title className="text-[16px] font-semibold">
              Delete “{pendingDelete?.name}”?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-[13.5px] text-muted-foreground">
              The template is removed. Workouts you already logged from it are not affected.
            </AlertDialog.Description>
            <div className="mt-5 flex gap-2">
              <AlertDialog.Close className="flex-1 rounded-xl border border-border py-[10px] text-[13px] text-muted-foreground">
                Cancel
              </AlertDialog.Close>
              <button
                onClick={handleDelete}
                className="flex-1 rounded-xl bg-destructive/10 py-[10px] text-[13px] font-semibold text-destructive"
              >
                Delete
              </button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  )
}
