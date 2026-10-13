import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell, Briefcase, CalendarDays, CheckSquare, Command, FileText, GraduationCap, LayoutDashboard,
  LogOut, Megaphone, Menu, Search, Settings, Shield, Sparkles, Target, BookOpen,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import {
  fetchNotifications, globalSearch, markAllNotificationsRead, markNotificationRead,
  type SearchHit,
} from '@/lib/api'
import { Badge, Button, Menu as Dropdown, ProgressRing, Spinner } from '@/components/ui'
import { cn, initials } from '@/lib/utils'
import { formatDistanceToNowStrict } from 'date-fns'

interface NavItem { to: string; label: string; icon: React.ReactNode; end?: boolean }
const STUDENT_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={16} />, end: true },
  { to: '/tasks', label: 'Tasks', icon: <CheckSquare size={16} /> },
  { to: '/calendar', label: 'Calendar', icon: <CalendarDays size={16} /> },
  { to: '/syllabus', label: 'Syllabus', icon: <BookOpen size={16} /> },
  { to: '/subjects', label: 'Subjects', icon: <GraduationCap size={16} /> },
  { to: '/assignments', label: 'Assignments', icon: <FileText size={16} /> },
  { to: '/assessments', label: 'Quizzes & Exams', icon: <Sparkles size={16} /> },
  { to: '/notes', label: 'Notes & Files', icon: <BookOpen size={16} /> },
  { to: '/announcements', label: 'Announcements', icon: <Megaphone size={16} /> },
  { to: '/opportunities', label: 'Opportunities', icon: <Target size={16} /> },
  { to: '/career', label: 'Career Tracker', icon: <Briefcase size={16} /> },
  { to: '/settings', label: 'Settings', icon: <Settings size={16} /> },
]
const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard size={16} />, end: true },
  { to: '/admin/assignments', label: 'Assignments', icon: <FileText size={16} /> },
  { to: '/admin/assessments', label: 'Quizzes & Exams', icon: <Sparkles size={16} /> },
  { to: '/admin/curriculum', label: 'Semesters & Subjects', icon: <GraduationCap size={16} /> },
  { to: '/admin/syllabus', label: 'Syllabus Units', icon: <BookOpen size={16} /> },
  { to: '/admin/announcements', label: 'Announcements', icon: <Megaphone size={16} /> },
  { to: '/admin/opportunities', label: 'Opportunities', icon: <Target size={16} /> },
  { to: '/admin/resources', label: 'Resources & Files', icon: <FileText size={16} /> },
  { to: '/admin/users', label: 'Users & Roles', icon: <Shield size={16} /> },
  { to: '/', label: 'Student view', icon: <CheckSquare size={16} /> },
]

/* ----------------------------- Command palette --------------------------- */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)
  const nav = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (open) { setQ(''); setHits([]); setCursor(0); setTimeout(() => inputRef.current?.focus(), 40) } }, [open])

  useEffect(() => {
    if (!open || !user || q.trim().length < 2) { setHits([]); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await globalSearch(user.id, q)
        if (!cancelled) { setHits(r); setCursor(0) }
      } finally { if (!cancelled) setLoading(false) }
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, open, user])

  const go = (h: SearchHit) => { nav(h.link); onClose() }
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      <div className="anim-fade absolute inset-0 bg-black/75" onClick={onClose} />
      <div className="anim-modal relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-bg-1 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
          {loading ? <Spinner /> : <Search size={15} className="text-faint" />}
          <input
            ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
              if (e.key === 'Enter' && hits[cursor]) go(hits[cursor])
            }}
            placeholder="Search tasks, assignments, notes, syllabus, announcements, opportunities…"
            className="flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-faint focus:outline-none"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-faint">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto">
          {q.trim().length < 2 && <p className="px-4 py-6 text-center text-[12px] text-faint">Type at least two characters to search everything you can access.</p>}
          {q.trim().length >= 2 && !loading && hits.length === 0 && (
            <p className="px-4 py-6 text-center text-[12px] text-faint">No matches for “{q}”.</p>
          )}
          {hits.map((h, i) => (
            <button
              key={`${h.type}-${h.id}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(h)}
              className={cn('flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors', i === cursor ? 'bg-bg-2' : 'hover:bg-bg-2')}
            >
              <Badge tone="neutral" className="w-[86px] justify-center">{h.type}</Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink">{h.title}</span>
                {h.subtitle && <span className="block truncate text-[11px] text-faint">{h.subtitle}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ----------------------------- Notification bell ------------------------ */
function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { data, setData, reload } = useAsyncData(
    () => (user ? fetchNotifications(user.id) : Promise.resolve([])), [user?.id])

  const unread = useMemo(() => (data ?? []).filter((n) => !n.read_at), [data])
  if (!user) return null

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" aria-label={`Notifications (${unread.length} unread)`} onClick={() => setOpen((o) => !o)} className="relative">
        <Bell size={16} />
        {unread.length > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-bg-0 anim-ring">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="anim-modal absolute right-0 z-40 mt-1 w-[340px] overflow-hidden rounded-xl border border-line bg-bg-1 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-line-soft px-3.5 py-2.5">
              <span className="text-[12.5px] font-semibold text-ink">Notifications</span>
              <button
                className="text-[11px] text-accent hover:underline"
                onClick={async () => {
                  await markAllNotificationsRead(user.id)
                  setData((prev) => (prev ?? []).map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
                }}
              >
                Mark all read
              </button>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {(data ?? []).length === 0 && <p className="px-4 py-8 text-center text-[12px] text-faint">You're all caught up.</p>}
              {(data ?? []).map((n) => (
                <button
                  key={n.id}
                  onClick={async () => {
                    if (!n.read_at) {
                      await markNotificationRead(n.id)
                      setData((prev) => (prev ?? []).map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x))
                    }
                    if (n.link) window.location.assign(n.link)
                    setOpen(false)
                  }}
                  className={cn('block w-full border-b border-line-soft px-3.5 py-2.5 text-left transition-colors hover:bg-bg-2', !n.read_at && 'bg-accent/[0.04]')}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink">{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted">{n.body}</p>}
                      <p className="mt-0.5 text-[10.5px] text-faint">{formatDistanceToNowStrict(new Date(n.created_at), { addSuffix: true })}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => { void reload(); setOpen(false) }} className="w-full py-2 text-[11.5px] text-faint hover:text-muted">Refresh</button>
          </div>
        </>
      )}
    </div>
  )
}

/* -------------------------------- App shell ------------------------------ */
export default function AppShell({ variant = 'student' }: { variant?: 'student' | 'admin' }) {
  const { profile, signOut, isAdmin } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  const nav = variant === 'admin' ? ADMIN_NAV : STUDENT_NAV

  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o) }
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault(); setPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { window.scrollTo({ top: 0 }) }, [location.pathname])

  const title = nav.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)))?.label ?? 'CampusOS'

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to={variant === 'admin' ? '/admin' : '/'} className="flex items-center gap-2.5 px-4 py-4">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/12 text-accent"><GraduationCap size={17} /></span>
        <div>
          <p className="text-[13.5px] font-semibold leading-none tracking-tight text-ink">CampusOS</p>
          <p className="mt-0.5 text-[10.5px] uppercase tracking-wider text-faint">{variant === 'admin' ? 'Admin portal' : 'Student workspace'}</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
        {nav.map((n) => (
          <NavLink
            key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
              isActive
                ? 'bg-accent/10 font-medium text-accent'
                : 'text-muted hover:bg-bg-2 hover:text-ink',
            )}
          >
            {n.icon}{n.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-line-soft p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-2 text-[11px] font-semibold text-accent">
            {initials(profile?.full_name, profile?.email)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-ink">{profile?.full_name ?? 'Loading…'}</p>
            <p className="truncate text-[10.5px] text-faint">{profile?.role === 'admin' ? 'Administrator' : profile?.email}</p>
          </div>
          <Dropdown
            align="right"
            trigger={<Button variant="ghost" size="icon" aria-label="Account menu"><LogOut size={15} /></Button>}
            items={[
              ...(isAdmin ? [{ label: variant === 'admin' ? 'Student workspace' : 'Admin portal', onSelect: () => window.location.assign(variant === 'admin' ? '/' : '/admin'), icon: <Shield size={13} /> }] : []),
              { label: 'Settings', onSelect: () => window.location.assign('/settings'), icon: <Settings size={13} /> },
              { label: 'Sign out', onSelect: () => void signOut(), icon: <LogOut size={13} />, tone: 'danger' as const },
            ]}
          />
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-bg-0">
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 border-r border-line bg-bg-1 lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="anim-fade absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="anim-modal absolute inset-y-0 left-0 w-[262px] border-r border-line bg-bg-1">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-bg-0/85 px-4 backdrop-blur-md">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={17} />
          </Button>
          <h1 className="truncate text-[14px] font-semibold tracking-tight text-ink">{title}</h1>
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden items-center gap-2 rounded-lg border border-line bg-bg-1 px-2.5 py-1.5 text-[12px] text-faint transition-colors hover:border-accent/35 hover:text-muted sm:flex"
          >
            <Search size={13} />
            <span className="w-32 text-left">Search everything…</span>
            <kbd className="rounded border border-line px-1 text-[10px]"><Command size={9} className="inline" />K</kbd>
          </button>
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}><Search size={16} /></Button>
          <NotificationBell />
        </header>

        <main className="anim-page min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <Outlet />
        </main>

        <footer className="border-t border-line-soft px-6 py-4 text-[11px] text-faint">
          CampusOS · data is scoped to your account by database row-level security.
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}

/** Full-screen loader used while auth resolves. */
export function FullPageLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-bg-0">
      <div className="flex flex-col items-center gap-3">
        <ProgressRing value={70} size={54} stroke={4}>
          <Spinner />
        </ProgressRing>
        <p className="text-[12px] text-faint">Loading CampusOS…</p>
      </div>
    </div>
  )
}
