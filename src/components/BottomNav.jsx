import { NavLink, useLocation } from 'react-router-dom'
import { House, LineChart } from 'lucide-react'

const ITEMS = [
  { to: '/', label: 'Train', Icon: House, match: (path) => path === '/' || path.startsWith('/workout') },
  { to: '/progress', label: 'Progress', Icon: LineChart, match: (path) => path.startsWith('/progress') },
]

/**
 * Floating translucent overlay, matching the prototype exactly (not sticky-in-flow) —
 * pages that sit under it (Home, Workout, Progress) each add matching bottom padding
 * so content clears the bar instead of scrolling behind it.
 */
export function BottomNav() {
  const location = useLocation()

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <nav
        className="w-full max-w-[440px] border-t border-accent bg-background/[0.86] backdrop-blur-[16px]"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div className="grid grid-cols-2">
          {ITEMS.map(({ to, label, Icon, match }) => {
            const active = match(location.pathname)
            return (
              <NavLink
                key={to}
                to={to}
                className="flex flex-col items-center gap-[3px] py-[10px]"
                style={{ color: active ? '#A8C9A2' : '#5F665F' }}
              >
                <Icon className="h-[21px] w-[21px]" />
                <span className="text-[10px] font-semibold tracking-[0.01em]">{label}</span>
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
