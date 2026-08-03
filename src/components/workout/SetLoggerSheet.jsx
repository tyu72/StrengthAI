import { useEffect, useState } from 'react'
import { CalendarClock, Minus, Plus } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { sets as setsApi } from '@/api/db'
import { display, rirToRpe, step, toKg } from '@/lib/units'
import { e1rm } from '@/lib/coach'

// RIR is what the lifter enters and what the coach reads; RPE is derived (10 - RIR).
// Asking for both let them contradict each other, so RPE is display-only now.
// Half steps exist only between 1 and 3 — that's the range where "maybe two, maybe
// three" is a real answer. Nobody can judge the difference between 4 and 4.5.
const RIR_SCALE = [
  { rir: 0, label: 'Failure', sub: 'Nothing left in the tank' },
  { rir: 1, label: 'Near failure', sub: 'One more rep, no question' },
  { rir: 1.5, label: 'Near failure', sub: 'Maybe one, maybe two' },
  { rir: 2, label: 'Hard', sub: 'Two more reps' },
  { rir: 2.5, label: 'Hard', sub: 'Maybe two, maybe three' },
  { rir: 3, label: 'Controlled', sub: 'Three more reps' },
  { rir: 4, label: 'Comfortable', sub: 'Four more reps' },
  { rir: 5, label: 'Easy', sub: 'Five or more — a warmup weight' },
]

export function SetLoggerSheet({ open, onOpenChange, variantId, variantName, unit, plan, onSave }) {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  const [last, setLast] = useState(null)
  const [best, setBest] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!open || !variantId) return
    setWeight('')
    setReps('')
    setRir('')
    setLast(null)
    setBest(null)
    setHistoryLoading(true)
    let alive = true
    setsApi
      .forVariant(variantId)
      .then((hist) => {
        if (!alive || !hist.length) return
        setLast(hist[hist.length - 1])
        setBest(hist.reduce((a, b) => (e1rm(b.weight_kg, b.reps) > e1rm(a.weight_kg, a.reps) ? b : a)))
      })
      .finally(() => alive && setHistoryLoading(false))
    return () => {
      alive = false
    }
  }, [open, variantId])

  const weightPh = plan ? display(plan.target_load_kg, unit) : best ? display(best.weight_kg, unit) : 0
  const stepAmt = step(unit)
  const logRef = historyLoading
    ? 'Loading history…'
    : last
      ? `last ${display(last.weight_kg, unit)} ${unit} × ${last.reps} @ RIR ${last.rir}`
      : 'first time logging this'
  const logPlan = plan ? `Coach plan: ${Math.round(weightPh)} ${unit} at RIR 3 — pre-filled below.` : null

  const repsPh = best ? best.reps : 0
  const repsInc = () => setReps(String(Math.min(100, (parseFloat(reps) || repsPh) + 1)))
  const repsDec = () => setReps(String(Math.max(1, (parseFloat(reps) || repsPh) - 1)))

  const rirSel = rir === '' ? null : parseFloat(rir)
  const rirRow = RIR_SCALE.find((r) => r.rir === rirSel)
  const rirHint = last ? `Last time you logged RIR ${last.rir}` : 'How many more reps could you have done?'

  const handleSave = () => {
    const weightKg = toKg(weight !== '' ? weight : weightPh, unit)
    const repsVal = parseFloat(reps) || (best ? best.reps : 0)
    const rirVal = rirSel == null ? (best ? best.rir : 2) : rirSel
    onSave({ weightKg, reps: repsVal, rir: rirVal, rpe: rirToRpe(rirVal) })
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <div className="px-[18px] pb-6">
        <div className="text-[16px] font-bold tracking-[-0.02em]">{variantName}</div>
        <div className="mt-1 font-mono text-[11.5px] text-muted-foreground">{logRef}</div>
        {logPlan && (
          <div className="mt-[7px] flex items-start gap-[6px] text-[11.5px] leading-[1.45] text-primary">
            <CalendarClock className="mt-[1px] h-[14px] w-[14px] shrink-0" />
            {logPlan}
          </div>
        )}

        <div className="mt-4 rounded-2xl border border-border bg-background px-[14px] py-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Weight</div>
            <div className="text-[11px] uppercase text-muted-foreground">{unit}</div>
          </div>
          <div className="mt-[6px] flex items-center gap-[10px]">
            <button
              onClick={() => setWeight(String(Math.max(0, (parseFloat(weight) || weightPh) - stepAmt)))}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border text-muted-foreground"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              type="number"
              disabled={historyLoading}
              placeholder={historyLoading ? '' : String(weightPh)}
              className="min-w-0 flex-1 bg-transparent text-center font-mono text-[30px] tracking-[-0.04em] text-foreground outline-none disabled:opacity-50"
            />
            <button
              onClick={() => setWeight(String((parseFloat(weight) || weightPh) + stepAmt))}
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] border border-border text-muted-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-[9px] flex items-center justify-between gap-3 rounded-2xl border border-border bg-background px-[14px] py-[10px]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Reps</div>
          <div className="flex items-center gap-[6px]">
            <button
              onClick={repsDec}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-border text-muted-foreground"
            >
              <Minus className="h-[18px] w-[18px]" />
            </button>
            <input
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              type="number"
              placeholder={String(repsPh)}
              className="w-[58px] bg-transparent text-center font-mono text-[24px] tracking-[-0.03em] text-foreground outline-none"
            />
            <button
              onClick={repsInc}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] border border-border text-muted-foreground"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        <div className="mt-[9px] rounded-2xl border border-border bg-background px-3 pb-3 pt-[13px]">
          <div className="text-center text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
            Reps in reserve
          </div>
          <div
            className={`mt-[5px] text-center font-mono text-[38px] leading-[1.05] tracking-[-0.05em] ${
              rirSel == null ? 'text-[#3A403B]' : rirSel <= 1 ? 'text-[#F2B544]' : 'text-primary'
            }`}
          >
            {rirSel == null ? '—' : rirSel}
          </div>
          <div className="mt-[2px] text-center text-[13px] font-semibold">{rirRow ? rirRow.label : 'Rate the set'}</div>
          <div className="mt-[2px] text-center text-[11.5px] text-muted-foreground">
            {rirRow ? rirRow.sub : rirHint}
          </div>

          <div className="mt-[11px] flex gap-[3px]">
            {RIR_SCALE.map(({ rir: stop }) => (
              <button
                key={stop}
                onClick={() => setRir(String(stop))}
                className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-[11px] border font-mono text-[13px] ${
                  stop === rirSel
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-transparent bg-card text-muted-foreground'
                }`}
              >
                {stop}
              </button>
            ))}
          </div>

          <div className="mt-[10px] flex items-center justify-center gap-[6px] border-t border-[#1E2220] pt-[9px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.11em] text-[#5F665F]">RPE</div>
            <div className="font-mono text-[13px] text-muted-foreground">
              {rirSel == null ? '—' : rirToRpe(rirSel)}
            </div>
          </div>
        </div>

        <div className="mt-[14px] flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-2xl border border-border py-[14px] text-center text-[13px] text-muted-foreground"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={historyLoading}
            className="flex-[2] rounded-2xl bg-primary py-[14px] text-center text-[14px] font-bold text-primary-foreground disabled:opacity-60"
          >
            Log set
          </button>
        </div>
      </div>
    </Sheet>
  )
}
