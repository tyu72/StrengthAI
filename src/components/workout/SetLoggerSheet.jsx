import { useEffect, useState } from 'react'
import { CalendarClock, Minus, Plus } from 'lucide-react'
import { Sheet } from '@/components/Sheet'
import { sets as setsApi } from '@/api/db'
import { display, rirToRpe, step, toKg } from '@/lib/units'
import { e1rm } from '@/lib/coach'

function numField(value, setValue, stepAmt, max, placeholder) {
  return {
    value,
    placeholder: placeholder === '' || placeholder == null ? '' : String(placeholder),
    onChange: (e) => setValue(e.target.value),
    inc: () => setValue(String(Math.min(max, (parseFloat(value) || 0) + stepAmt))),
    dec: () => setValue(String(Math.max(0, (parseFloat(value) || 0) - stepAmt))),
  }
}

export function SetLoggerSheet({ open, onOpenChange, variantId, variantName, unit, plan, onSave }) {
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  const [rpe, setRpe] = useState('')
  const [last, setLast] = useState(null)
  const [best, setBest] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!open || !variantId) return
    setWeight('')
    setReps('')
    setRir('')
    setRpe('')
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

  const repsField = numField(reps, setReps, 1, 100, best ? best.reps : '')
  const rirField = numField(rir, setRir, 0.5, 5, best ? best.rir : '')
  const rpeField = numField(rpe, setRpe, 0.5, 10, best ? best.rpe : '')

  const handleSave = () => {
    const weightKg = toKg(weight !== '' ? weight : weightPh, unit)
    const repsVal = parseFloat(reps) || (best ? best.reps : 0)
    const rirVal = rir !== '' ? parseFloat(rir) : best ? best.rir : 2
    const rpeVal = rpe !== '' ? parseFloat(rpe) : rirToRpe(rirVal)
    onSave({ weightKg, reps: repsVal, rir: rirVal, rpe: rpeVal })
    onOpenChange(false)
  }

  const fields = [
    { label: 'Reps', f: repsField },
    { label: 'RIR', f: rirField },
    { label: 'RPE', f: rpeField },
  ]

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

        <div className="mt-[9px] grid grid-cols-3 gap-2">
          {fields.map(({ label, f }) => (
            <div key={label} className="min-w-0 rounded-[14px] border border-border bg-background p-[10px]">
              <div className="text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                {label}
              </div>
              <div className="mt-[5px] flex items-center gap-px">
                <button onClick={f.dec} className="flex h-[30px] w-6 shrink-0 items-center justify-center text-[#5F665F]">
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  value={f.value}
                  onChange={f.onChange}
                  type="number"
                  placeholder={f.placeholder}
                  className="w-full min-w-0 flex-1 bg-transparent text-center font-mono text-[19px] text-foreground outline-none"
                />
                <button onClick={f.inc} className="flex h-[30px] w-6 shrink-0 items-center justify-center text-[#5F665F]">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
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
