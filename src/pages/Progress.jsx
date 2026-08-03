import { useEffect, useMemo, useState } from 'react'
import { profile as profileApi, sessions, sets as setsApi, variants as variantsApi } from '@/api/db'
import { canonicalLabel } from '@/lib/resolver'
import { display } from '@/lib/units'
import { detectPlateau, matchedRirSeries, sessionVolumeKg } from '@/lib/coach'
import { VolumeChart } from '@/components/progress/VolumeChart'
import { RirChart } from '@/components/progress/RirChart'

const STABILITY_LABEL = { declining: 'Declining', volatile: 'Volatile', stable: 'Stable' }

export default function Progress() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [unit, setUnit] = useState('lb')
  const [sessionList, setSessionList] = useState([])
  const [allSets, setAllSets] = useState([])
  const [variantList, setVariantList] = useState([])
  const [selectedVariantId, setSelectedVariantId] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([profileApi.get(), sessions.list(), setsApi.all(), variantsApi.list()])
      .then(([p, sessionRows, setRows, variantRows]) => {
        if (!alive) return
        setUnit(p?.unit ?? 'lb')
        setSessionList(sessionRows)
        setAllSets(setRows)
        setVariantList(variantRows)
      })
      .catch((err) => alive && setError(err.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  const datesBySession = useMemo(() => {
    const map = {}
    sessionList.forEach((s) => {
      map[s.id] = s.started_at
    })
    return map
  }, [sessionList])

  // variants.list() already orders by uses desc, so this chip order is most-used-first for free
  const exercisesWithSets = useMemo(() => {
    const used = new Set(allSets.map((s) => s.variant_id))
    return variantList.filter((v) => used.has(v.id))
  }, [allSets, variantList])

  const selectedId =
    selectedVariantId && exercisesWithSets.some((v) => v.id === selectedVariantId)
      ? selectedVariantId
      : exercisesWithSets[0]?.id ?? null

  const matchedSeries = useMemo(() => {
    if (!selectedId) return []
    const setsForVariant = allSets.filter((s) => s.variant_id === selectedId)
    return matchedRirSeries(setsForVariant, datesBySession, new Set())
  }, [allSets, selectedId, datesBySession])

  const plateau = matchedSeries.length >= 3 ? detectPlateau(matchedSeries) : null
  const declining = plateau?.stability === 'declining'

  const stats = useMemo(() => {
    const volKg = sessionVolumeKg(allSets)
    const stabilityLabel = plateau ? STABILITY_LABEL[plateau.stability] : 'No data'
    return [
      { label: 'Sessions', value: sessionList.length.toLocaleString(), color: '#ECEFEA' },
      { label: 'Sets', value: allSets.length.toLocaleString(), color: '#ECEFEA' },
      { label: 'Total volume', value: `${Math.round(display(volKg, unit)).toLocaleString()} ${unit}`, color: '#ECEFEA' },
      { label: 'RIR stability', value: stabilityLabel, color: declining ? '#F2B544' : '#A8C9A2' },
    ]
  }, [allSets, sessionList, unit, plateau, declining])

  const volumeData = useMemo(() => {
    const bySession = {}
    allSets.forEach((s) => {
      bySession[s.session_id] = (bySession[s.session_id] || 0) + s.weight_kg * s.reps
    })
    return Object.entries(bySession)
      .map(([sessionId, volKg]) => ({
        date: datesBySession[sessionId],
        volume: Math.round(display(volKg, unit)),
      }))
      .filter((x) => x.date && x.volume > 0)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-12)
      .map((x) => ({
        volume: x.volume,
        label: new Date(x.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        shortLabel: new Date(x.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      }))
  }, [allSets, datesBySession, unit])

  const selectedVariant = exercisesWithSets.find((v) => v.id === selectedId)
  const rirSub = selectedVariant
    ? `Actual RIR at your most-repeated load for ${canonicalLabel(selectedVariant.base)}. Lower means the same weight is costing more.`
    : 'Log a few sets to see this.'

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

      <div className="mb-4 text-[22px] font-bold tracking-[-0.025em]">Progress</div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-[13px]">
            <div className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{s.label}</div>
            <div className="mt-1 font-mono text-[21px] font-medium tracking-[-0.03em]" style={{ color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="mb-[14px] rounded-[18px] border border-border bg-card p-[15px]">
        <div className="text-[13px] font-semibold">Volume per session</div>
        <div className="mt-0.5 mb-2 text-[11.5px] text-muted-foreground">
          Last {volumeData.length} sessions · {unit}
        </div>
        <VolumeChart data={volumeData} unit={unit} />
      </div>

      <div className="rounded-[18px] border border-border bg-card p-[15px]">
        <div className="flex items-center justify-between">
          <div className="text-[13px] font-semibold">RIR at matched load</div>
          {declining && (
            <div className="flex items-center gap-1 text-[10px] font-semibold text-[#F2B544]">
              <span>▼</span>Declining
            </div>
          )}
        </div>
        <div className="mt-1 mb-[10px] text-[11.5px] leading-[1.45] text-muted-foreground">{rirSub}</div>

        {exercisesWithSets.length > 0 && (
          <div className="mb-3 flex gap-[6px] overflow-x-auto">
            {exercisesWithSets.map((v) => {
              const isSel = v.id === selectedId
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  className="shrink-0 rounded-full px-[11px] py-[6px] text-[11.5px]"
                  style={{
                    border: `1px solid ${isSel ? 'rgba(168,201,162,.5)' : '#272C29'}`,
                    background: isSel ? 'rgba(168,201,162,.1)' : 'transparent',
                    color: isSel ? '#A8C9A2' : '#8A928C',
                  }}
                >
                  {canonicalLabel(v.base)}
                </button>
              )
            })}
          </div>
        )}

        <RirChart points={matchedSeries} declining={declining} />
      </div>
    </div>
  )
}
