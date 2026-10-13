import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { FullPageLoader } from './AppShell'
import { EmptyState } from '@/components/ui'
import { ShieldAlert } from 'lucide-react'

/** Requires an authenticated session; role is re-verified from the profiles row. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, profile, profileLoading } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (profileLoading || (!profile && !profileLoading)) {
    // Brief window while the profile row loads — avoid flashing the login page.
    if (profileLoading) return <FullPageLoader />
  }
  return <>{children}</>
}

/**
 * Admin-only gate. This is UX only: every privileged operation is additionally
 * rejected by Postgres RLS, so bypassing this component grants nothing.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading, profileLoading, isAdmin } = useAuth()
  if (loading || profileLoading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) {
    return (
      <div className="grid min-h-screen place-items-center bg-bg-0 p-6">
        <EmptyState
          icon={<ShieldAlert size={18} />}
          title="Administrator access required"
          message="Your account does not have the administrator role. Ask an existing administrator to promote you from Admin → Users & Roles."
        />
      </div>
    )
  }
  return <>{children}</>
}

export function RequireStudent({ children }: { children: ReactNode }) {
  const { user, loading, profileLoading } = useAuth()
  if (loading || profileLoading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}
