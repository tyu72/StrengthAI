import { useAuth } from '@/context/AuthContext'

// Placeholder only — the real home/workout screen is Phase 3. This exists so
// ProtectedRoute has something concrete to guard and the login/session-persistence
// loop is testable end to end.
export default function Home() {
  const { user, signOut } = useAuth()

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-foreground">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-[14px]">
        <div className="text-[11px] text-muted-foreground">Signed in as</div>
        <div className="mt-0.5 text-sm font-medium">{user?.email}</div>
        <button onClick={signOut} className="mt-3 text-[13px] text-destructive">
          Log out
        </button>
      </div>
    </div>
  )
}
