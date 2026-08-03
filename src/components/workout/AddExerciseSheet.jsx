import { useEffect, useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Sheet } from './Sheet'
import { resolve, suggest, canonicalLabel } from '@/lib/resolver'
import { sets as setsApi } from '@/api/db'
import { display } from '@/lib/units'

const pluralize = (n) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`)

function ResolutionCard({ result, unit, submitting, onConfirm, onRetry }) {
  if (result.status === 'unknown') {
    return (
      <div className="mt-[10px] rounded-[18px] border border-border bg-card p-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#F2B544]">
          Needs a movement name
        </div>
        <div className="mt-2 text-[17px] font-bold tracking-[-0.02em]">&quot;{result.raw}&quot;</div>
        <div className="mt-[9px] text-[12.5px] leading-[1.55] text-muted-foreground">
          I can read modifiers but not the movement. Add the lift itself — &quot;cuff tricep extension&quot;,
          &quot;feet up bench press&quot;.
        </div>
        <button
          onClick={onRetry}
          className="mt-[14px] w-full rounded-[12px] bg-primary py-[11px] text-[13px] font-bold text-primary-foreground"
        >
          Try again
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
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResult(null)
      setError(null)
    }
  }, [open])

  const suggestions = useMemo(() => suggest(query, variants, 8), [query, variants])
  const suggestTitle = query.trim() ? 'From your history' : 'Most logged'

  const runResolve = async () => {
    const text = query.trim()
    if (!text) return
    const r = resolve(text, variants)
    if (r.status === 'match' && r.match) {
      try {
        const hist = await setsApi.forVariant(r.match.id)
        r.lastSet = hist.length ? hist[hist.length - 1] : null
      } catch {
        r.lastSet = null
      }
    }
    setResult(r)
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
              setResult(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && runResolve()}
            placeholder="single arm cuff tricep extension"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {query.trim() && !result && (
            <button
              onClick={runResolve}
              className="shrink-0 rounded-[10px] bg-primary px-3 py-[7px] text-[12.5px] font-bold text-primary-foreground"
            >
              Resolve
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

        {result && (
          <ResolutionCard
            result={result}
            unit={unit}
            submitting={submitting}
            onConfirm={confirm}
            onRetry={() => setResult(null)}
          />
        )}

        {!result && suggestions.length > 0 && (
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
      </div>
    </Sheet>
  )
}
