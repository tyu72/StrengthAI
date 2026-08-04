import { useEffect, useMemo, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { resolve, suggest, canonicalLabel, rawBase } from '@/lib/resolver'
import { resolveExercise } from '@/api/resolveExercise'
import { sets as setsApi } from '@/api/db'
import { display } from '@/lib/units'

const pluralize = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

// Shown only when there's no history yet to suggest from — teaches the freeform
// syntax with real resolver vocabulary (grip/attachment/stance) rather than a blank box.
const EXAMPLES = ['single arm cuff tricep extension', 'feet up narrow grip bench press', 'romanian deadlift']

// exercise_variants.resolved_by only allows dictionary/ai/manual. A cache hit is an AI
// answer someone already paid for, so it records as 'ai' — the column is about how the
// movement was worked out, not which layer served it this time.
const resolvedByFor = (source) => (source === 'dictionary' ? 'dictionary' : 'ai')

function ResolutionCard({ result, unit, submitting, onConfirm, onRetry }) {
  // Genuinely not an exercise. The only status that blocks logging.
  if (result.status === 'rejected') {
    return (
      <div className="mt-[10px] rounded-[18px] border border-border bg-card p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#F2B544]">
          Not an exercise
        </div>
        <div className="mt-2 text-[17px] font-bold tracking-[-0.02em]">&quot;{result.raw}&quot;</div>
        <div className="mt-[9px] text-[12.5px] leading-[1.55] text-muted-foreground">{result.reason}</div>
        <button
          onClick={onRetry}
          className="mt-[14px] w-full rounded-[12px] bg-primary py-[11px] text-[13px] font-bold text-primary-foreground"
        >
          Try again
        </button>
      </div>
    )
  }

  // Offline, capped, or out of credit. Never a dead end — the set still gets logged, and
  // the raw phrase becomes a variant that future identical descriptions match into.
  if (result.status === 'unresolved') {
    return (
      <div className="mt-[10px] rounded-[18px] border border-border bg-card p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#4C8E96]">
          Log it as typed
        </div>
        <div className="mt-2 text-[17px] font-bold tracking-[-0.02em]">{rawBase(result.raw)}</div>
        <div className="mt-[9px] text-[12.5px] leading-[1.55] text-muted-foreground">{result.reason}</div>
        <button
          onClick={() =>
            onConfirm({
              base: rawBase(result.raw),
              mods: [],
              muscle: null,
              bodyPart: null,
              sourceText: result.raw,
              resolvedBy: 'manual',
            })
          }
          disabled={submitting}
          className="mt-[14px] w-full rounded-[12px] bg-primary py-[11px] text-[13px] font-bold text-primary-foreground disabled:opacity-60"
        >
          Add to workout
        </button>
      </div>
    )
  }

  const matched = result.status === 'match'
  const close = result.status === 'close'
  const name = canonicalLabel(result.base.k)
  const chips = [...result.mods, result.base.m].filter(Boolean)
  const accent = matched ? '#A8C9A2' : close ? '#F2B544' : '#4C8E96'
  const borderColor = matched ? 'rgba(168,201,162,.3)' : close ? 'rgba(242,181,68,.32)' : '#272C29'
  const bgColor = matched ? 'rgba(168,201,162,.06)' : close ? 'rgba(242,181,68,.05)' : '#171A18'
  const statusLabel = matched ? 'Matched to an existing variant' : close ? 'Close, but not the same thing' : 'New variant'

  // A cached answer was inferred by the model too, so it carries the same caveat.
  const inferred = result.source === 'ai' || result.source === 'cache'
  const lowConfidence = inferred && result.confidence === 'low'

  let trend
  if (matched) {
    const uses = result.match?.uses || 0
    const last = result.lastSet
    trend = `Continues the trend line you already have — logged ${pluralize(uses)}${
      last ? `, last at ${display(last.weight_kg, unit)} ${unit} × ${last.reps}` : ''
    }.`
  } else if (close) {
    const matchMods = (result.match.mods || []).join(' · ') || 'standard'
    trend = `Closest match is ${canonicalLabel(result.match.base)} (${matchMods}). The modifiers differ enough that loads will not be comparable, so I would start a separate line.`
  } else {
    trend = 'No prior match. Starting a fresh trend line — future sessions with this description will land here automatically.'
  }

  const confirmNew = () =>
    onConfirm({
      base: result.base.k,
      mods: result.mods,
      muscle: result.base.m,
      bodyPart: result.base.p,
      sourceText: result.raw,
      resolvedBy: resolvedByFor(result.source),
      loadNote: result.note || null,
      confidence: result.confidence || null,
    })
  const confirmExisting = () => onConfirm({ variantId: result.match.id })

  return (
    <div className="mt-[10px] rounded-[18px] border p-4" style={{ borderColor, background: bgColor }}>
      <div className="text-[10px] font-bold uppercase tracking-[0.13em]" style={{ color: accent }}>
        {statusLabel}
      </div>
      <div className="mt-[10px] text-[17px] font-bold tracking-[-0.02em]">{name}</div>
      {chips.length > 0 && (
        <div className="mt-[9px] flex flex-wrap gap-[5px]">
          {chips.map((c) => (
            <span key={c} className="rounded-[7px] bg-[#1E2220] px-2 py-1 text-[11px] text-[#C7CCC6]">
              {c}
            </span>
          ))}
        </div>
      )}
      <div className="mt-[11px] text-[12.5px] leading-[1.55] text-muted-foreground">{trend}</div>
      {result.note && (
        <div className="mt-[11px] rounded-[13px] border border-border bg-background p-3">
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Why the load will differ
          </div>
          <div className="mt-[5px] text-[12.5px] leading-[1.55] text-[#C7CCC6]">{result.note}</div>
        </div>
      )}
      {lowConfidence && (
        <div className="mt-[9px] text-[11px] leading-[1.5] text-[#8A928C]">
          The coach worked this one out from the name rather than recognising it — worth a look before you trust the
          loading note.
        </div>
      )}
      <div className="mt-[14px] flex gap-2">
        {close && (
          <button
            onClick={confirmExisting}
            disabled={submitting}
            className="flex-1 rounded-[12px] border border-[#313632] py-[11px] text-[12.5px] font-semibold disabled:opacity-60"
          >
            Same as before
          </button>
        )}
        <button
          onClick={matched ? confirmExisting : confirmNew}
          disabled={submitting}
          className={`${close ? 'flex-[2]' : 'flex-1'} rounded-[12px] bg-primary py-[11px] text-[13px] font-bold text-primary-foreground disabled:opacity-60`}
        >
          {close ? 'Log as new variant' : 'Add to workout'}
        </button>
      </div>
    </div>
  )
}

export function AddExerciseSheet({ open, onOpenChange, variants, unit, onAdd }) {
  const [query, setQuery] = useState('')
  const [resolved, setResolved] = useState(null)
  const [resolving, setResolving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResolved(null)
      setResolving(false)
      setError(null)
    }
  }, [open])

  const suggestions = useMemo(() => suggest(query, variants, 8), [query, variants])
  const suggestTitle = query.trim() ? 'From your history' : 'Most logged'

  // Layer 1 only. Free, offline, instant — so it runs on every keystroke. Layers 2 and 3
  // are deliberately NOT here: resolving as you type would send "heel", "heel el",
  // "heel elev" to the model, and every prefix is a novel phrase that gets cached and
  // billed. They run from runResolve, on Enter or the Resolve button.
  const live = useMemo(() => {
    const text = query.trim()
    if (!text) return null
    return { ...resolve(text, variants), source: 'dictionary', confidence: 'high' }
  }, [query, variants])

  const localUnknown = live?.status === 'unknown'
  const preview = !resolved && live && !localUnknown ? live : null
  const shown = resolved ?? preview

  const runResolve = async () => {
    const text = query.trim()
    if (!text || resolving) return
    setResolving(true)
    setError(null)
    try {
      const r = await resolveExercise(text, variants)
      if (r.status === 'match' && r.match) {
        try {
          const hist = await setsApi.forVariant(r.match.id)
          r.lastSet = hist.length ? hist[hist.length - 1] : null
        } catch {
          r.lastSet = null
        }
      }
      setResolved(r)
    } catch (err) {
      setError(err.message)
    } finally {
      setResolving(false)
    }
  }

  const confirm = async (payload) => {
    setSubmitting(true)
    setError(null)
    try {
      await onAdd(payload)
      onOpenChange(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <div className="px-[18px] pb-2">
        <div className="text-[17px] font-bold tracking-[-0.02em]">What are you doing?</div>
        <div className="mt-1 text-[12.5px] leading-[1.5] text-muted-foreground">
          Describe it the way you&apos;d say it out loud — grip, attachment, stance, tempo. The coach resolves it to
          a trend line.
        </div>
        <div className="mt-[13px] flex items-center gap-[10px] rounded-[15px] border border-border bg-background px-[14px] py-[13px]">
          <Sparkles className="h-[19px] w-[19px] shrink-0 text-primary" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setResolved(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && runResolve()}
            placeholder="single arm cuff tricep extension"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {query.trim() && !resolved && (
            <button
              onClick={runResolve}
              disabled={resolving}
              className="flex shrink-0 items-center justify-center rounded-[10px] bg-primary px-3 py-[7px] text-[12.5px] font-bold text-primary-foreground disabled:opacity-60"
            >
              {resolving ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : 'Resolve'}
            </button>
          )}
        </div>
      </div>

      <div className="px-[18px] pb-6">
        {error && (
          <div className="mt-3 rounded-[13px] border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12.5px] text-destructive">
            {error}
          </div>
        )}

        {resolving && (
          <div className="mt-[10px] flex items-center gap-[10px] rounded-[18px] border border-border bg-card p-4">
            <Loader2 className="h-[18px] w-[18px] shrink-0 animate-spin text-primary" />
            <div className="text-[12.5px] leading-[1.5] text-muted-foreground">
              {localUnknown ? 'Asking the coach…' : 'Checking your history…'}
            </div>
          </div>
        )}

        {!resolving && shown && (
          <ResolutionCard
            result={shown}
            unit={unit}
            submitting={submitting}
            onConfirm={confirm}
            onRetry={() => {
              setResolved(null)
              setQuery('')
            }}
          />
        )}

        {!resolving && !resolved && localUnknown && (
          <div className="mt-[10px] rounded-[14px] border border-dashed border-border px-[13px] py-3 text-[12px] leading-[1.55] text-muted-foreground">
            Not in the dictionary yet. Press Enter, or tap Resolve, and the coach will work it out — that only takes
            a call the first time anyone describes it this way.
          </div>
        )}

        {!resolved && suggestions.length > 0 && (
          <>
            <div className="mt-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              {suggestTitle}
            </div>
            <div className="flex flex-col gap-[7px]">
              {suggestions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => confirm({ variantId: v.id })}
                  disabled={submitting}
                  className="flex items-center gap-[11px] rounded-[14px] border border-border bg-background px-[13px] py-3 text-left disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold">{canonicalLabel(v.base)}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {(v.mods || []).join(' · ') || 'standard'}
                    </div>
                  </div>
                  <div className="shrink-0 font-mono text-[10.5px] text-[#5F665F]">{v.uses || 0}×</div>
                </button>
              ))}
            </div>
          </>
        )}

        {!resolved && suggestions.length === 0 && !query.trim() && (
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              Try something like
            </div>
            <div className="flex flex-col gap-[7px]">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setQuery(ex)}
                  className="rounded-[14px] border border-dashed border-border px-[13px] py-3 text-left text-[13px] text-muted-foreground"
                >
                  &quot;{ex}&quot;
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}
