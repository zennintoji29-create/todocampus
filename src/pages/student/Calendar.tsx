import { useMemo, useState } from 'react'
import {
  addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth,
  isToday, startOfMonth, startOfWeek, subMonths, subWeeks,
} from 'date-fns'
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useReminders } from '@/hooks/useReminders'
import {
  deleteEvent, fetchAnnouncements, fetchAssessments, fetchAssignments, fetchEvents, fetchSubjects,
  fetchTasks, saveEvent, updateEvent,
} from '@/lib/api'
import {
  Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Select, Spinner, Textarea,
} from '@/components/ui'
import { CATEGORY_COLOR, eventsOnDay, type CalendarEventLike } from '@/lib/domain'
import { cn, titleCase } from '@/lib/utils'

type View = 'day' | 'week' | 'month'

export default function Calendar() {
  const { user } = useAuth()
  const uid = user?.id
  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [selected, setSelected] = useState(() => new Date())
  const [editing, setEditing] = useState<any | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [events, tasks, assignments, assessments, announcements, subjects] = await Promise.all([
      fetchEvents(uid), fetchTasks(uid), fetchAssignments({ limit: 300 }),
      fetchAssessments({ limit: 300 }), fetchAnnouncements({ limit: 50 }), fetchSubjects(),
    ])
    return { events, tasks, assignments, assessments, announcements, subjects }
  }, [uid])

  const calendar: CalendarEventLike[] = useMemo(() => {
    if (!data) return []
    const evs: CalendarEventLike[] = []
    for (const e of data.events) {
      evs.push({ id: e.id, title: e.title, startsAt: e.starts_at, endsAt: e.ends_at, kind: e.kind, official: false })
    }
    for (const t of data.tasks) {
      if (!t.deadline || t.status === 'completed') continue
      evs.push({
        id: `task:${t.id}`, title: t.title, startsAt: t.deadline,
        endsAt: new Date(new Date(t.deadline).getTime() + 30 * 60_000).toISOString(),
        kind: t.source_type === 'assessment' ? 'exam' : 'assignment', official: t.source_type !== 'personal',
      })
    }
    for (const a of data.assignments) {
      evs.push({ id: `asg:${a.id}`, title: a.title, startsAt: a.deadline, endsAt: a.deadline, kind: 'assignment', official: true })
    }
    for (const a of data.assessments) {
      const end = new Date(new Date(a.starts_at).getTime() + (a.duration_minutes ?? 60) * 60_000).toISOString()
      evs.push({ id: `asm:${a.id}`, title: a.title, startsAt: a.starts_at, endsAt: end, kind: 'exam', official: true })
    }
    return evs
  }, [data])

  useReminders(useMemo(() => data?.events.map((e: any) => ({
    id: e.id, title: e.title, at: new Date(e.starts_at).getTime() - (e.reminder_minutes ?? 15) * 60_000,
    body: 'Study session starting soon',
  })) ?? [], [data]), true)

  const nav = (dir: 1 | -1) => {
    setCursor((c) => (view === 'month' ? (dir === 1 ? addMonths(c, 1) : subMonths(c, 1))
      : view === 'week' ? (dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1))
      : (dir === 1 ? addWeeks(c, 1) : subWeeks(c, 1))))
  }

  const days = useMemo(() => {
    if (view === 'day') return [selected]
    if (view === 'week') {
      const s = startOfWeek(cursor, { weekStartsOn: 1 })
      return Array.from({ length: 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i))
    }
    const s = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 })
    const e = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: s, end: e })
  }, [view, cursor, selected])

  if (loading) return <div className="grid place-items-center py-20"><Spinner /></div>
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  if (!data) return null

  const title = view === 'day' ? format(selected, 'd MMMM yyyy')
    : view === 'week' ? `${format(days[0], 'd MMM')} – ${format(days[days.length - 1], 'd MMM yyyy')}`
    : format(cursor, 'MMMM yyyy')

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <Button variant="ghost" size="icon" aria-label="Previous" onClick={() => nav(-1)}><ChevronLeft size={15} /></Button>
          <Button variant="ghost" size="icon" aria-label="Next" onClick={() => nav(1)}><ChevronRight size={15} /></Button>
          <Button variant="secondary" size="sm" onClick={() => { setCursor(new Date()); setSelected(new Date()) }}>Today</Button>
          <h3 className="ml-1 text-[13.5px] font-semibold text-ink">{title}</h3>
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-line bg-bg-2 p-0.5">
            {(['day', 'week', 'month'] as View[]).map((v) => (
              <button key={v} onClick={() => setView(v)}
                className={cn('rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors', view === v ? 'bg-bg-0 text-accent' : 'text-faint hover:text-muted')}>
                {titleCase(v)}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}><CalendarPlus size={13} /> New session</Button>
        </div>

        {view === 'month' ? (
          <div>
            <div className="grid grid-cols-7 border-b border-line-soft">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="px-2 py-2 text-center text-[10.5px] uppercase tracking-wider text-faint">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((d, i) => {
                const evs = eventsOnDay(calendar, d)
                const outside = !isSameMonth(d, cursor)
                return (
                  <button key={i} onClick={() => { setSelected(d); setView('day') }}
                    className={cn('min-h-[92px] border-b border-r border-line-soft p-1.5 text-left transition-colors hover:bg-bg-2/60',
                      outside && 'opacity-40', isToday(d) && 'bg-accent/[0.04]')}>
                    <span className={cn('inline-grid h-5.5 w-5.5 place-items-center rounded-full text-[11px]', isToday(d) ? 'bg-accent font-semibold text-bg-0' : 'text-muted', 'height:22px;width:22px')}>
                      {format(d, 'd')}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {evs.slice(0, 3).map((e) => (
                        <div key={e.id} className="flex items-center gap-1 text-[10px] leading-tight">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.kind] }} />
                          <span className="truncate text-faint">{e.title}</span>
                        </div>
                      ))}
                      {evs.length > 3 && <p className="text-[9.5px] text-faint">+{evs.length - 3} more</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className={cn('grid gap-px bg-line-soft', view === 'week' ? 'grid-cols-7' : 'grid-cols-1')}>
            {days.map((d) => {
              const evs = eventsOnDay(calendar, d)
              return (
                <div key={d.toISOString()} className={cn('min-h-[110px] bg-bg-1 p-2', isToday(d) && 'bg-accent/[0.03]')}>
                  <p className={cn('mb-1.5 text-[11px] font-medium', isToday(d) ? 'text-accent' : 'text-faint')}>
                    {format(d, view === 'week' ? 'EEE d' : 'EEEE, d MMMM')}
                  </p>
                  <div className="space-y-1">
                    {evs.length === 0 && <p className="text-[10.5px] text-faint/70">Free</p>}
                    {evs.map((e) => (
                      <button key={e.id}
                        onClick={() => e.id.startsWith('ev:') && setEditing(data.events.find((x: any) => x.id === e.id.slice(3)))}
                        className="flex w-full items-center gap-1.5 rounded-md border border-line-soft bg-bg-2 px-1.5 py-1 text-left text-[10.5px] transition-colors hover:border-accent/35">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.kind] }} />
                        <span className="min-w-0 flex-1 truncate text-ink">{e.title}</span>
                        {e.official && <span className="shrink-0 text-[8.5px] uppercase text-faint">official</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-2.5">
          {Object.entries(CATEGORY_COLOR).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[10.5px] text-faint">
              <span className="h-2 w-2 rounded-full" style={{ background: c }} />{titleCase(k)}
            </span>
          ))}
        </div>
      </Card>

      {/* day detail */}
      <Card className="h-fit">
        <div className="border-b border-line-soft px-4 py-3">
          <h3 className="text-[13px] font-semibold text-ink">{format(selected, 'EEEE, d MMMM')}</h3>
          <p className="text-[11px] text-faint">{eventsOnDay(calendar, selected).length} item(s) scheduled</p>
        </div>
        <div className="divide-y divide-line-soft">
          {eventsOnDay(calendar, selected).length === 0 && (
            <EmptyState title="Nothing scheduled" message="Add a study session to plan this day."
              action={<Button size="sm" variant="secondary" onClick={() => setCreating(true)}><CalendarPlus size={12} /> Add session</Button>} />
          )}
          {eventsOnDay(calendar, selected).map((e) => {
            const isMine = e.id.startsWith('ev:')
            const ev = isMine ? data.events.find((x: any) => x.id === e.id.slice(3)) : null
            return (
              <div key={e.id} className="flex items-start gap-2.5 px-4 py-2.5">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: CATEGORY_COLOR[e.kind] }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-ink">{e.title}</p>
                  <p className="flex items-center gap-1 text-[10.5px] text-faint">
                    <Clock size={10} />{format(new Date(e.startsAt), 'HH:mm')}–{format(new Date(e.endsAt), 'HH:mm')}
                    {e.official ? ' · official' : ''}
                  </p>
                </div>
                {isMine && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setEditing(ev)}>✎</Button>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirmDelete(ev)}><Trash2 size={13} /></Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      <SessionDialog
        open={creating || !!editing}
        event={editing}
        subjects={data.subjects}
        onClose={() => { setCreating(false); setEditing(null) }}
        onSaved={async () => { await reload(); setCreating(false); setEditing(null); toast.success('Study session saved') }}
      />

      <ConfirmDialog open={!!confirmDelete} onClose={() => setConfirmDelete(null)} loading={busy}
        title="Delete study session?" message={`“${confirmDelete?.title}” will be permanently removed from your calendar.`}
        onConfirm={async () => {
          setBusy(true)
          try { await deleteEvent(confirmDelete.id); await reload(); setConfirmDelete(null); toast.success('Deleted') }
          catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
          finally { setBusy(false) }
        }} />
    </div>
  )
}

function SessionDialog({ open, event, subjects, onClose, onSaved }: {
  open: boolean; event: any | null; subjects: any[]; onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const [f, setF] = useState({ title: '', description: '', date: '', start: '09:00', end: '10:00', subjectId: '', kind: 'study_session' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useMemo(() => {
    if (!open) return
    if (event) {
      setF({
        title: event.title, description: event.description ?? '',
        date: new Date(event.starts_at).toISOString().slice(0, 10),
        start: format(new Date(event.starts_at), 'HH:mm'),
        end: format(new Date(event.ends_at), 'HH:mm'),
        subjectId: event.subject_id ?? '', kind: event.kind,
      })
    } else {
      const now = new Date()
      setF({ title: '', description: '', date: format(now, 'yyyy-MM-dd'), start: format(now, 'HH:mm'), end: format(new Date(now.getTime() + 3600_000), 'HH:mm'), subjectId: '', kind: 'study_session' })
    }
    setError(null)
  }, [open, event])

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!f.title.trim()) { setError('Title is required.'); return }
    if (!f.date) { setError('Pick a date.'); return }
    const starts = new Date(`${f.date}T${f.start}`)
    const ends = new Date(`${f.date}T${f.end}`)
    if (!(ends > starts)) { setError('End time must be after the start time.'); return }
    setBusy(true)
    try {
      const payload = {
        title: f.title.trim(), description: f.description || null, kind: f.kind,
        starts_at: starts.toISOString(), ends_at: ends.toISOString(),
        subject_id: f.subjectId || null,
      }
      if (event) await updateEvent(event.id, payload)
      else if (user) await saveEvent({ ...payload, user_id: user.id })
      onSaved()
    } catch (e: any) { setError(e?.message ?? 'Could not save.') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title={event ? 'Edit study session' : 'New study session'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save session</Button></>}>
      <div className="space-y-3.5">
        <Field label="Title" error={error}><Input autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="DBMS — practise normalisation" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date"><Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></Field>
          <Field label="Start"><Input type="time" value={f.start} onChange={(e) => set('start', e.target.value)} /></Field>
          <Field label="End"><Input type="time" value={f.end} onChange={(e) => set('end', e.target.value)} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            <Select value={f.kind} onChange={(e) => set('kind', e.target.value)}>
              {['study_session', 'reminder', 'event'].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)}>
              <option value="">None</option>
              {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Notes" hint="optional"><Textarea value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      </div>
    </Dialog>
  )
}
