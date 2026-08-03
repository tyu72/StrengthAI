import { ChevronDown, ChevronUp, Plus, Trash2, X } from 'lucide-react'
import { display } from '@/lib/units'

export function ExerciseBlock({ block, index, total, unit, onUp, onDown, onRemove, onDeleteSet, onLogSet }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-start justify-between gap-2 px-[13px] pt-[13px] pb-[11px]">
        <div className="flex gap-2">
          <div className="flex flex-col gap-0.5 pt-0.5">
            <button onClick={onUp} disabled={index === 0} className="text-[#5F665F] disabled:opacity-30">
              <ChevronUp className="h-[15px] w-[15px]" />
            </button>
            <button onClick={onDown} disabled={index === total - 1} className="text-[#5F665F] disabled:opacity-30">
              <ChevronDown className="h-[15px] w-[15px]" />
            </button>
          </div>
          <div>
            <div className="text-[14.5px] font-semibold tracking-[-0.01em]">{block.name}</div>
            {block.chips.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {block.chips.map((c) => (
                  <span key={c} className="rounded-md bg-accent px-[7px] py-[3px] text-[10px] text-[#9AA39C]">
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button onClick={onRemove} className="shrink-0 text-[#5F665F]">
          <X className="h-4 w-4" />
        </button>
      </div>

      {block.sets.length > 0 && (
        <div className="px-[13px] pb-2">
          <div className="grid grid-cols-[20px_1fr_46px_42px_42px_24px] gap-[6px] text-[9px] uppercase tracking-[0.05em] text-[#5F665F]">
            <div>#</div>
            <div>Weight</div>
            <div>Reps</div>
            <div>RIR</div>
            <div>RPE</div>
            <div />
          </div>
          {block.sets.map((s) => (
            <div
              key={s.id}
              className="grid grid-cols-[20px_1fr_46px_42px_42px_24px] items-center gap-[6px] border-t border-accent py-[7px] font-mono text-[13px]"
            >
              <div className="text-[#5F665F]">{s.set_number}</div>
              <div>
                {display(s.weight_kg, unit)}
                <span className="ml-0.5 font-sans text-[10px] text-muted-foreground">{unit}</span>
              </div>
              <div>{s.reps}</div>
              <div className={s.rir != null && s.rir <= 1 ? 'text-[#F2B544]' : ''}>{s.rir ?? '—'}</div>
              <div>{s.rpe ?? '—'}</div>
              <button onClick={() => onDeleteSet(s.id)} className="text-[#5F665F]">
                <Trash2 className="h-[15px] w-[15px]" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onLogSet}
        className="flex w-full items-center justify-center gap-1 border-t border-accent py-[10px] text-[13px] font-semibold text-primary"
      >
        <Plus className="h-[17px] w-[17px]" />
        Log set
      </button>
    </div>
  )
}
