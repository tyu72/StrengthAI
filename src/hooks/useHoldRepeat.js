import { useCallback, useEffect, useRef } from 'react'

// One immediate step, a pause long enough that an ordinary tap is never mistaken for a
// hold, then a fast repeat. Reaching 225 lb shouldn't be twenty separate taps.
const HOLD_DELAY = 380
const HOLD_INTERVAL = 90

/**
 * Press-and-hold repeat for stepper buttons.
 *
 * Wire it with Pointer Events, which cover mouse, touch and pen from one pair of
 * handlers — and crucially give you `onPointerCancel`, so a hold that turns into a
 * page scroll stops repeating instead of running on invisibly:
 *
 *   onPointerDown={() => start(inc)}
 *   onPointerUp={stop}
 *   onPointerLeave={stop}
 *   onPointerCancel={stop}
 *
 * `start` fires the action itself, so the button must NOT also carry an onClick —
 * pointerdown and click both firing would double every tap.
 *
 * The repeated `fn` must compute from the setter's own callback argument, not from a
 * value closed over at render. The interval re-invokes the same function object, so a
 * render-time read would apply the identical step forever and the number would advance
 * once and then stick.
 */
export function useHoldRepeat() {
  const delayRef = useRef(null)
  const repeatRef = useRef(null)

  const stop = useCallback(() => {
    clearTimeout(delayRef.current)
    clearInterval(repeatRef.current)
    delayRef.current = null
    repeatRef.current = null
  }, [])

  const start = useCallback(
    (fn) => {
      fn()
      stop()
      delayRef.current = setTimeout(() => {
        repeatRef.current = setInterval(fn, HOLD_INTERVAL)
      }, HOLD_DELAY)
    },
    [stop]
  )

  // A sheet can close mid-hold (pointerup lands outside the unmounted button), which
  // would otherwise leave the interval running against a dead component.
  useEffect(() => stop, [stop])

  return { start, stop }
}
