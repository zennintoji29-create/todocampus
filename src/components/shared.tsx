import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns'
import { AlertTriangle, CheckCircle2, Circle, CloudOff, Layers, Loader2, Link2 } from 'lucide-react'
import { Badge, Progress } from '@/components/ui'
import { cn } from '@/lib/utils'
import { deadlineState, type Priority, type TaskLike, type TaskStatus } from '@/lib/domain'

/* ------------------------------ Status dot ------------------------------- */
export const STATUS_META: Record<TaskStatus, { label: string; tone: 'neutral' | 'accent' | 'info'; icon: ReactNode }> = {
  todo: { label: 'Not started', tone: 'neutral', icon: <Circle size={13} /> },
  in_progress: { label: 'In progress', tone: 'info', icon: <Loader2 size={13} /> },
  completed: { label: 'Completed', tone: 'accent', icon: <CheckCircle2 size={13} /> },
}

export const PRIORITY_META: Record<Priority, { label: string; tone: 'neutral' | 'warn' | 'danger' | 'info' }> = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'warn' },
  urgent: { label: 'Urgent', tone: 'danger' },
}

export const TOPIC_STATUS_META = {
  not_started: { label: 'Not started', tone: 'neutral' },
  in_progress: { label: 'In progress', tone: 'info' },
  completed: { label: 'Completed', tone: 'accent' },
  revision_needed: { label: 'Revision needed', tone: 'warn' },
} as const

export const SOURCE_META = {
  personal: { label: 'Personal', tone: 'neutral' as const, icon: <Circle size={11} /> },
  assignment: { label: 'Official assignment', tone: 'info' as const, icon: <Layers size={11} /> },
  assessment: { label: 'Official quiz / exam', tone: 'info' as const, icon: <Layers size={11} /> },
  opportunity: { label: 'Opportunity', tone: 'info' as const, icon: <Link2 size={11} /> },
}

export function StatusPill({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status]
  return <Badge tone={m.tone}>{m.icon}{m.label}</Badge>
}

export function PriorityPill({ priority }: { priority: Priority }) {
  const m = PRIORITY_META[priority]
  return <Badge tone={m.tone}>{m.label}</Badge>
}

/* ---------------------------- Deadline chip ----------------------------- */
export function DeadlineChip({ task, now = new Date() }: { task: TaskLike; now?: Date }) {
  const state = deadlineState(task, now)
  if (state === 'none') return null
  const map = {
    overdue: { text: `Overdue · ${formatDistanceToNowStrict(new Date(task.deadline!), { addSuffix: false })} ago`, cls: 'text-danger border-danger/30 bg-danger/10' },
    today: { text: 'Due today', cls: 'text-warn border-warn/30 bg-warn/10' },
    soon: { text: `Due ${formatDistanceToNowStrict(new Date(task.deadline!), { addSuffix: true })}`, cls: 'text-warn border-warn/25 bg-warn/5' },
    later: { text: format(new Date(task.deadline!), 'd MMM'), cls: 'text-faint border-line bg-bg-2' },
  } as const
  const m = map[state]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium', m.cls)}>
      {state === 'overdue' && <AlertTriangle size={10} />}{m.text}
    </span>
  )
}

export function friendlyDate(iso?: string | null) {
  if (!iso) return 'No date'
  const d = new Date(iso)
  if (isToday(d)) return `Today, ${format(d, 'HH:mm')}`
  if (isTomorrow(d)) return `Tomorrow, ${format(d, 'HH:mm')}`
  return format(d, 'd MMM yyyy, HH:mm')
}

/* ------------------------------ Stat tile -------------------------------- */
export function StatTile({ label, value, hint, tone = 'accent', icon, onClick }: {
  label: string; value: ReactNode; hint?: ReactNode; tone?: 'accent' | 'warn' | 'danger' | 'neutral' | 'info'; icon?: ReactNode; onClick?: () => void
}) {
  const ring = { accent: 'text-accent border-accent/20 bg-accent/8', warn: 'text-warn border-warn/20 bg-warn/8', danger: 'text-danger border-danger/20 bg-danger/8', neutral: 'text-ink border-line bg-bg-2', info: 'text-info border-info/20 bg-info/8' }
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cn('group flex items-center gap-3 rounded-xl border border-line bg-bg-1 p-3.5 text-left transition-colors', onClick && 'hover:border-accent/35')}>
      {icon && <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg border', ring[tone])}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-[10.5px] font-medium uppercase tracking-wider text-faint">{label}</p>
        <p className="truncate text-lg font-semibold leading-tight tracking-tight text-ink">{value}</p>
        {hint && <p className="truncate text-[11px] text-faint">{hint}</p>}
      </div>
    </Comp>
  )
}

/* --------------------------- Source unavailable -------------------------- */
export function SourceMissingBanner({ unavailable }: { unavailable: boolean }) {
  if (!unavailable) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border border-warn/25 bg-warn/5 px-3 py-2 text-[12px] text-warn">
      <CloudOff size={14} className="mt-0.5 shrink-0" />
      <span>The official source for this item was archived or removed. Your personal progress and notes are preserved.</span>
    </div>
  )
}

/* ------------------------------ Sync note -------------------------------- */
export function SyncedAt({ at }: { at?: string | null }) {
  if (!at) return null
  return <span className="text-[10.5px] text-faint">Synced {formatDistanceToNowStrict(new Date(at), { addSuffix: true })}</span>
}

/* ---------------------------- Subject link ------------------------------- */
export function SubjectTag({ subject }: { subject?: { id: string; code?: string; name: string } | null }) {
  if (!subject) return null
  return (
    <Link to={`/subjects/${subject.id}`} onClick={(e) => e.stopPropagation()} className="text-[11px] text-accent/90 hover:text-accent hover:underline">
      {subject.code ?? subject.name}
    </Link>
  )
}

/* --------------------------- Inline progress row ------------------------ */
export function ProgressRow({ label, percent, detail, tone }: { label: ReactNode; percent: number; detail?: string; tone?: 'accent' | 'warn' }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[12.5px] text-muted">{label}</span>
        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink">{percent}%</span>
      </div>
      <Progress value={percent} tone={tone ?? 'accent'} />
      {detail && <p className="text-[11px] text-faint">{detail}</p>}
    </div>
  )
}

/* -------------------------- Countdown (live) ---------------------------- */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
