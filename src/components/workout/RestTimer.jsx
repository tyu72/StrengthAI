import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

const CIRCUMFERENCE = 94.2 // 2*pi*r for r=15, matches the prototype's ring exactly

/**
 * `restEnd` is an absolute deadline (epoch ms), not a countdown — recomputed from
 * Date.now() every tick so it can't drift, and so a persisted deadline (see
 * Workout.jsx) resumes counting correctly after a reload rather than resetting.
 */
export function RestTimer({ restEnd, restLen, restFor, onExtend, onSkip }) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!restEnd) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [restEnd])

  useEffect(() => {
    if (restEnd && now >= restEnd) onSkip()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, restEnd])

  if (!restEnd) return null
  const left = Math.max(0, Math.ceil((restEnd - now) / 1000))
  if (left <= 0) return null

  const label = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  const offset = CIRCUMFERENCE * (1 - left / (restLen || 150))

  return (
    <div
      className="fixed z-[31] flex items-center gap-[11px] rounded-2xl border border-[#313632] bg-[#1E2220] px-[13px] py-[11px] shadow-lg"
      style={{
        left: '50%',
        transform: 'translateX(-50%)',
        // sits above the fixed bottom nav (~58px) plus its own 18px gap
        bottom: 'calc(76px + var(--safe-bottom))',
        width: 'calc(100% - 28px)',
        maxWidth: '412px',
      }}
    >
      <div className="relative h-[34px] w-[34px] shrink-0">
        <svg viewBox="0 0 36 36" className="h-[34px] w-[34px] -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#313632" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="#A8C9A2"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[17px] tracking-[-0.02em]">{label}</div>
        <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">Rest · {restFor}</div>
      </div>
      <button onClick={onExtend} className="shrink-0 rounded-[9px] border border-[#3A403B] px-[9px] py-[7px] text-[11.5px] font-semibold">
        +30s
      </button>
      <button onClick={onSkip} className="shrink-0 p-1 text-muted-foreground">
        <X className="h-[18px] w-[18px]" />
      </button>
    </div>
  )
}
