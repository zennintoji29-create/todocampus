import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlarmClock, ArrowRight, BookOpen, Briefcase, CalendarDays, CheckCircle2, CircleAlert,
  ClipboardList, Flame, Plus, Sparkles, Target, TrendingUp,
} from 'lucide-react'
import { addDays, format, startOfDay, startOfWeek } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useReminders } from '@/hooks/useReminders'
import {
  createTask, fetchAnnouncements, fetchApplications, fetchAssignments, fetchAssessments,
  fetchEvents, fetchGoalLogs, fetchGoals, fetchNotes, fetchOpportunities, fetchSubjects,
  fetchTasks, fetchTopicProgress, fetchUnits, fetchTopics, saveEvent, saveNote,
} from '@/lib/api'
import {
  Badge, Button, Card, CardHeader, Dialog, EmptyState, ErrorState, Field, Input, Progress,
  Select, Skeleton, Tabs, Textarea,
} from '@/components/ui'
import { DeadlineChip, PriorityPill, StatTile, StatusPill, friendlyDate, useNow } from '@/components/shared'
import {
  aggregateProgress, completionRatio, computeNextUp, goalProgress, taskCounts, upcomingDeadlines,
  type TopicLike, type TopicProgressLike,
} from '@/lib/domain'
import { cn, titleCase } from '@/lib/utils'
import { toast } from 'sonner'

const TASK_FILTER_KEY = 'campusos.dashboard.taskFilter'
const SUBJECT_FILTER_KEY = 'campusos.dashboard.subjectFilter'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const uid = user?.id
  const now = useNow()
  const navigate = useNavigate()
  const [taskFilter, setTaskFilter] = useState<string>(() => localStorage.getItem(TASK_FILTER_KEY) ?? 'all')
  const [subjectFilter, setSubjectFilter] = useState<string>(() => localStorage.getItem(SUBJECT_FILTER_KEY) ?? '')
  const [quickOpen, setQuickOpen] = useState<'task' | 'note' | 'session' | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload, setData } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [tasks, subjects, units, topics, progress, assignments, assessments, announcements, opportunities, apps, goals, goalLogs, events, notes] =
      await Promise.all([
        fetchTasks(uid), fetchSubjects(), fetchUnits(), fetchTopics(), fetchTopicProgress(uid),
        fetchAssignments({ limit: 200 }), fetchAssessments({ limit: 200 }), fetchAnnouncements({ limit: 8 }),
        fetchOpportunities({ limit: 60 }), fetchApplications(uid), fetchGoals(uid), fetchGoalLogs(uid),
        fetchEvents(uid), fetchNotes(uid),
      ])
    return { tasks, subjects, units, topics, progress, assignments, assessments, announcements, opportunities, apps, goals, goalLogs, events, notes }
  }, [uid])

  /* ---------------------------- reminders ------------------------------ */
  useReminders(useMemo(() => {
    if (!data) return []
    const open = data.tasks.filter((t) => t.status !== 'completed' && t.deadline)
    return open.flatMap((t) => {
      const due = new Date(t.deadline!).getTime()
      const offsets = [1440, 60, 0].filter((m) => t.reminder_minutes === m)
      return offsets.map((m) => ({
        id: `${t.id}:${m}`, title: t.title, at: due - m * 60_000,
        body: m === 0 ? `Due now · ${t.priority} priority` : `Due in ${m >= 1440 ? 'a day' : 'an hour'}`,
        url: `/tasks?task=${t.id}`,
      }))
    })
  }, [data]))

  /* ------------------------------ derived ------------------------------ */
  const derived = useMemo(() => {
    if (!data) return null
    const subjectsById = new Map(data.subjects.map((s: any) => [s.id, s]))
    const topicList: TopicLike[] = data.topics.map((t: any) => ({
      id: t.id, title: t.title, isOptional: t.is_optional, estMinutes: t.est_minutes,
    }))
    const progressMap: Record<string, TopicProgressLike> = {}
    for (const p of data.progress) {
      progressMap[p.topic_id] = { topicId: p.topic_id, status: p.status, lastStudiedAt: p.last_studied_at }
    }
    const units = data.units.map((u: any) => ({
      id: u.id, subjectId: u.subject_id, semesterId: u.semester_id ?? '',
      topicIds: data.topics.filter((t: any) => t.unit_id === u.id).map((t: any) => t.id),
    }))
    const agg = aggregateProgress(units, topicList, progressMap)
    const overall = completionRatio(topicList, progressMap)

    const tasks = data.tasks.map((t: any) => ({
      id: t.id, title: t.title, deadline: t.deadline, priority: t.priority, status: t.status,
      isFocus: t.is_focus, subjectId: t.subject_id, sourceType: t.source_type, reminderMinutes: t.reminder_minutes,
    }))
    const counts = taskCounts(tasks, now)
    const filtered = tasks.filter((t) =>
      (subjectFilter ? t.subjectId === subjectFilter : true) &&
      (taskFilter === 'all' ? true
        : taskFilter === 'overdue' ? (counts.overdue && deadlineOverdue(t, now))
        : taskFilter === 'today' ? deadlineToday(t, now)
        : taskFilter === 'pending' ? t.status !== 'completed'
        : t.status === taskFilter))

    const nextUp = computeNextUp(tasks, now, 6)
    const todayEvents = data.events.filter((e: any) => {
      const s = startOfDay(new Date(e.starts_at)).getTime()
      return s >= startOfDay(now).getTime() && s < startOfDay(now).getTime() + 864e5
    })

    // 14-day workload chart (real task deadlines)
    const workload = Array.from({ length: 14 }).map((_, i) => {
      const day = addDays(startOfDay(now), i)
      const key = format(day, 'yyyy-MM-dd')
      const count = tasks.filter((t) => t.deadline && format(new Date(t.deadline), 'yyyy-MM-dd') === key).length
      return { day: format(day, 'EEE'), date: format(day, 'd MMM'), count }
    })

    const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    const weekGoals = data.goals.filter((g: any) => g.week_start === weekStart).map((g: any) => {
      const logs = data.goalLogs.filter((l: any) => l.goal_id === g.id)
      return { ...g, ...goalProgress(g.target, logs) }
    })

    const savedOpps = new Set(data.apps.map((a: any) => a.source_opportunity_id).filter(Boolean))
    return {
      subjectsById, topicList, progressMap, agg, overall, tasks, counts, filtered, nextUp,
      todayEvents, workload, weekGoals,
      announcements: data.announcements,
      savedOpportunities: data.opportunities.filter((o: any) => savedOpps.has(o.id)).slice(0, 4),
      careerPipeline: data.apps,
      recentNotes: data.notes.slice(0, 3),
      savedOpportunityIds: savedOpps,
    }
  }, [data, now, subjectFilter, taskFilter])

  if (loading) return <DashboardSkeleton />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  if (!derived || !data) return null

  const { counts, overall, agg, filtered, nextUp, workload, weekGoals } = derived

  const setFilter = (fn: (v: string) => void, v: string, key: string) => { fn(v); localStorage.setItem(key, v) }

  return (
    <div className="space-y-5">
      {/* ------------------------------ hero ------------------------------ */}
      <section className="relative overflow-hidden rounded-xl border border-line bg-bg-1 p-5">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-accent/[0.06] blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-faint">
              {format(now, 'EEEE, d MMMM yyyy')}
            </p>
            <h2 className="mt-1 text-[21px] font-semibold tracking-tight text-ink">
              {greeting()}, {(profile?.full_name ?? 'there').split(' ')[0]}
            </h2>
            <p className="mt-1 text-[13px] text-muted">{headline(counts, overall.percent)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setQuickOpen('session')}><CalendarDays size={13} /> Study session</Button>
            <Button variant="secondary" size="sm" onClick={() => setQuickOpen('note')}><BookOpen size={13} /> Quick note</Button>
            <Button variant="primary" size="sm" onClick={() => setQuickOpen('task')}><Plus size={13} /> Quick task</Button>
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <StatTile label="Pending" value={counts.pending} hint={`${counts.inProgress} in progress`} icon={<ClipboardList size={16} />} onClick={() => setFilter(setTaskFilter, 'pending', TASK_FILTER_KEY)} />
          <StatTile label="Due today" value={counts.dueToday} tone={counts.dueToday ? 'warn' : 'neutral'} hint="deadlines today" icon={<AlarmClock size={16} />} onClick={() => setFilter(setTaskFilter, 'today', TASK_FILTER_KEY)} />
          <StatTile label="Overdue" value={counts.overdue} tone={counts.overdue ? 'danger' : 'neutral'} hint="needs attention" icon={<CircleAlert size={16} />} onClick={() => setFilter(setTaskFilter, 'overdue', TASK_FILTER_KEY)} />
          <StatTile label="Completed" value={counts.completed} tone="info" hint="all time" icon={<CheckCircle2 size={16} />} onClick={() => setFilter(setTaskFilter, 'completed', TASK_FILTER_KEY)} />
          <StatTile label="Syllabus" value={`${overall.percent}%`} hint={`${overall.completed}/${overall.applicable} topics`} icon={<BookOpen size={16} />} onClick={() => navigate('/syllabus')} />
          <StatTile label="Career apps" value={derived.careerPipeline.length} hint={`${derived.careerPipeline.filter((a: any) => a.status === 'interview' || a.status === 'offer').length} in interview/offer`} icon={<Briefcase size={16} />} onClick={() => navigate('/career')} />
        </div>
      </section>

      {/* ----------------------- focus + next up -------------------------- */}
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            title="Today & this week"
            subtitle={`${filtered.length} task${filtered.length === 1 ? '' : 's'} in view`}
            action={
              <div className="flex items-center gap-2">
                <Select value={subjectFilter} onChange={(e) => setFilter(setSubjectFilter, e.target.value, SUBJECT_FILTER_KEY)} className="h-8 w-40 text-[12px]">
                  <option value="">All subjects</option>
                  {data.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </Select>
                <Link to="/tasks" className="text-[11.5px] text-accent hover:underline">Open tasks</Link>
              </div>
            }
          />
          <div className="border-b border-line-soft px-4 py-2">
            <Tabs
              value={taskFilter}
              onChange={(v) => setFilter(setTaskFilter, v, TASK_FILTER_KEY)}
              tabs={[
                { value: 'all', label: 'All', count: data.tasks.length },
                { value: 'today', label: 'Today', count: counts.dueToday },
                { value: 'overdue', label: 'Overdue', count: counts.overdue },
                { value: 'in_progress', label: 'In progress', count: counts.inProgress },
                { value: 'completed', label: 'Done', count: counts.completed },
              ]}
            />
          </div>
          <div className="max-h-[380px] overflow-y-auto">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 size={18} />}
                title={taskFilter === 'all' ? 'No tasks yet' : 'Nothing in this view'}
                message={taskFilter === 'all' ? 'Create a task, or import an official assignment to start tracking it.' : 'Try another filter.'}
                action={taskFilter === 'all' ? <Button variant="primary" size="sm" onClick={() => setQuickOpen('task')}><Plus size={13} /> New task</Button> : undefined}
              />
            ) : filtered.slice(0, 40).map((t: any) => (
              <Link
                key={t.id} to={`/tasks?task=${t.id}`}
                className="flex items-center gap-3 border-b border-line-soft px-4 py-2.5 transition-colors last:border-0 hover:bg-bg-2"
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', t.priority === 'urgent' ? 'bg-danger' : t.priority === 'high' ? 'bg-warn' : 'bg-faint')} />
                <div className="min-w-0 flex-1">
                  <p className={cn('truncate text-[13px] text-ink', t.status === 'completed' && 'text-faint line-through')}>{t.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {t.subjectId && derived.subjectsById.get(t.subjectId) && (
                      <span className="text-[10.5px] text-faint">{derived.subjectsById.get(t.subjectId).code}</span>
                    )}
                    {t.sourceType !== 'personal' && <Badge tone="info">imported</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill status={t.status} />
                  <DeadlineChip task={t} now={now} />
                </div>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recommended next" subtitle="Ranked by deadline urgency and priority" icon={<Flame size={14} />} />
          <div className="divide-y divide-line-soft">
            {nextUp.length === 0 && <p className="px-4 py-8 text-center text-[12px] text-faint">Nothing pending. Add work to get recommendations.</p>}
            {nextUp.map((t: any, i: number) => (
              <Link key={t.id} to={`/tasks?task=${t.id}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-bg-2 text-[10px] font-semibold text-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-ink">{t.title}</p>
                  <p className="text-[10.5px] text-faint">{t.deadline ? friendlyDate(t.deadline) : 'No deadline'}</p>
                </div>
                <PriorityPill priority={t.priority} />
              </Link>
            ))}
          </div>

          <div className="border-t border-line-soft px-4 py-3">
            <p className="mb-2 text-[10.5px] font-medium uppercase tracking-wider text-faint">Upcoming official deadlines</p>
            <ul className="space-y-1.5">
              {upcomingDeadlines([
                ...data.assignments.map((a: any) => ({ id: a.id, title: a.title, deadline: a.deadline, link: `/assignments/${a.id}` })),
                ...data.assessments.map((a: any) => ({ id: a.id, title: a.title, deadline: a.starts_at, link: `/assessments/${a.id}` })),
              ], now, 21, 4).map((d: any) => (
                <li key={d.id}>
                  <Link to={d.link} className="flex items-center gap-2 text-[12px] text-muted hover:text-ink">
                    <ArrowRight size={12} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate">{d.title}</span>
                    <span className={cn('shrink-0 text-[10.5px]', d.daysLeft < 0 ? 'text-danger' : d.daysLeft <= 3 ? 'text-warn' : 'text-faint')}>
                      {d.daysLeft < 0 ? `${-d.daysLeft}d late` : d.daysLeft === 0 ? 'today' : `in ${d.daysLeft}d`}
                    </span>
                  </Link>
                </li>
              ))}
              {data.assignments.length + data.assessments.length === 0 && <li className="text-[12px] text-faint">No published deadlines yet.</li>}
            </ul>
          </div>
        </Card>
      </div>

      {/* ------------------ analytics + goals + calendar ------------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="14-day workload" subtitle="Count of task deadlines per day (live from your tasks)" icon={<TrendingUp size={14} />} />
          <div className="h-[190px] px-2 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={workload} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke="#141B26" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: '#5D6B7E', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#5D6B7E', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: '#10161F' }}
                  contentStyle={{ background: '#0C1018', border: '1px solid #1A2230', borderRadius: 8, fontSize: 12 }}
                  labelFormatter={(_l, p) => (p?.[0]?.payload?.date ?? '')}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {workload.map((w, i) => (
                    <Cell key={i} fill={w.count > 2 ? '#f5a524' : '#22d3a5'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="This week's goals" subtitle="Progress computed from logged activity" icon={<Target size={14} />}
            action={<Link to="/settings#goals" className="text-[11.5px] text-accent hover:underline">Manage</Link>} />
          <div className="space-y-3 p-4">
            {weekGoals.length === 0 && <p className="py-6 text-center text-[12px] text-faint">No goals for this week yet.</p>}
            {weekGoals.map((g: any) => (
              <div key={g.id} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[12.5px] text-muted">{g.title}</span>
                  <span className="shrink-0 text-[11.5px] tabular-nums text-ink">{g.total}/{g.target}</span>
                </div>
                <Progress value={g.percent} tone={g.reached ? 'accent' : 'info'} />
              </div>
            ))}
            {weekGoals.length > 0 && (
              <Link to="/settings#goals"><Button size="sm" variant="secondary" className="w-full">Open study planner</Button></Link>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* per-subject syllabus */}
        <Card className="xl:col-span-2">
          <CardHeader title="Syllabus by subject" subtitle="Completed topics / applicable topics" icon={<BookOpen size={14} />}
            action={<Link to="/syllabus" className="text-[11.5px] text-accent hover:underline">Open tracker</Link>} />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            {data.subjects.length === 0 && <p className="col-span-full py-6 text-center text-[12px] text-faint">No subjects published yet.</p>}
            {data.subjects.map((s: any) => {
              const p = agg.subjects.get(s.id) ?? { percent: 0, applicable: 0, completed: 0 }
              return (
                <Link key={s.id} to={`/syllabus?subject=${s.id}`} className="rounded-lg border border-line-soft p-3 transition-colors hover:border-accent/30">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink">{s.name}</p>
                      <p className="text-[10.5px] text-faint">{s.code} · {p.completed}/{p.applicable} topics</p>
                    </div>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-accent">{p.percent}%</span>
                  </div>
                  <Progress value={p.percent} />
                </Link>
              )
            })}
          </div>
        </Card>

        {/* today calendar preview */}
        <Card>
          <CardHeader title="Today's schedule" icon={<CalendarDays size={14} />}
            action={<Link to="/calendar" className="text-[11.5px] text-accent hover:underline">Calendar</Link>} />
          <div className="divide-y divide-line-soft">
            {derived.todayEvents.length === 0 && <p className="px-4 py-8 text-center text-[12px] text-faint">No study sessions scheduled today.</p>}
            {derived.todayEvents.map((e: any) => (
              <Link key={e.id} to="/calendar" className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-2">
                <span className="w-14 shrink-0 text-[11px] tabular-nums text-faint">{format(new Date(e.starts_at), 'HH:mm')}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{e.title}</span>
                <Badge tone="accent">{titleCase(e.kind)}</Badge>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* announcements + opportunities */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Recent announcements" icon={<Sparkles size={14} />}
            action={<Link to="/announcements" className="text-[11.5px] text-accent hover:underline">All notices</Link>} />
          <div className="divide-y divide-line-soft">
            {derived.announcements.length === 0 && <p className="px-4 py-8 text-center text-[12px] text-faint">Nothing published yet.</p>}
            {derived.announcements.map((a: any) => (
              <Link key={a.id} to={`/announcements/${a.id}`} className="block px-4 py-2.5 hover:bg-bg-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-[12.5px] font-medium text-ink">{a.title}</p>
                  <Badge tone={a.category === 'urgent' ? 'danger' : a.category === 'exam' ? 'warn' : 'neutral'}>{a.category}</Badge>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11.5px] text-faint">{a.body}</p>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Saved opportunities" icon={<Briefcase size={14} />}
            action={<Link to="/opportunities" className="text-[11.5px] text-accent hover:underline">Browse</Link>} />
          <div className="divide-y divide-line-soft">
            {derived.savedOpportunities.length === 0 && <p className="px-4 py-8 text-center text-[12px] text-faint">Save an opportunity to track it here.</p>}
            {derived.savedOpportunities.map((o: any) => (
              <Link key={o.id} to={`/opportunities/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-ink">{o.title}</p>
                  <p className="truncate text-[11px] text-faint">{o.organization} · {titleCase(o.category)}</p>
                </div>
                {o.application_deadline && (
                  <span className="shrink-0 text-[10.5px] text-faint">{format(new Date(o.application_deadline), 'd MMM')}</span>
                )}
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <QuickAddDialog
        kind={quickOpen}
        onClose={() => setQuickOpen(null)}
        subjects={data.subjects}
        onCreated={async (kind, payload) => {
          if (!uid) return
          setBusy(true)
          try {
            if (kind === 'task') {
              const t = await createTask({
                user_id: uid, source_type: 'personal', title: payload.title,
                description: payload.description ?? null, deadline: payload.deadline ?? null,
                priority: payload.priority ?? 'medium', subject_id: payload.subjectId || null,
                status: 'todo',
              })
              setData((prev: any) => ({ ...prev, tasks: [t, ...prev.tasks] }))
            } else if (kind === 'note') {
              const n = await saveNote({
                user_id: uid, title: payload.title!, content: payload.description ?? '',
                subject_id: payload.subjectId || null,
              })
              setData((prev: any) => ({ ...prev, notes: [n, ...prev.notes] }))
            } else {
              const start = new Date(payload.deadline!)
              const end = new Date(start.getTime() + (payload.duration ?? 60) * 60_000)
              const ev = await saveEvent({
                user_id: uid, title: payload.title!, kind: 'study_session',
                starts_at: start.toISOString(), ends_at: end.toISOString(),
                subject_id: payload.subjectId || null,
              })
              setData((prev: any) => ({ ...prev, events: [...prev.events, ev] }))
            }
            toast.success(kind === 'task' ? 'Task created' : kind === 'note' ? 'Note saved' : 'Study session scheduled')
            setQuickOpen(null)
          } catch (e: any) {
            toast.error(e?.message ?? 'Could not save.')
          } finally { setBusy(false) }
        }}
        busy={busy}
      />
    </div>
  )
}

/* ----------------------------- helpers --------------------------------- */
function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}
function headline(counts: ReturnType<typeof taskCounts>, syllabusPercent: number) {
  const bits: string[] = []
  if (counts.overdue) bits.push(`${counts.overdue} overdue item${counts.overdue > 1 ? 's' : ''}`)
  if (counts.dueToday) bits.push(`${counts.dueToday} due today`)
  if (!bits.length) bits.push(`${counts.pending} pending task${counts.pending === 1 ? '' : 's'}`)
  return `${bits.join(' · ')}. Syllabus is ${syllabusPercent}% complete.`
}
function deadlineOverdue(t: { deadline: string | null; status: string }, now: Date) {
  return !!t.deadline && t.status !== 'completed' && new Date(t.deadline) < now
}
function deadlineToday(t: { deadline: string | null; status: string }, now: Date) {
  if (!t.deadline || t.status === 'completed') return false
  return new Date(t.deadline).toDateString() === now.toDateString()
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-bg-1 p-5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="mt-3 h-6 w-72" />
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[68px]" />)}
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Skeleton className="h-[230px] xl:col-span-2" />
        <Skeleton className="h-[230px]" />
      </div>
    </div>
  )
}

/* --------------------------- quick add dialog --------------------------- */
export function QuickAddDialog({ kind, onClose, subjects, onCreated, busy, prefill }: {
  kind: 'task' | 'note' | 'session' | null
  onClose: () => void
  subjects: { id: string; name: string; code: string }[]
  onCreated: (kind: 'task' | 'note' | 'session', payload: Record<string, any>) => Promise<void>
  busy?: boolean
  prefill?: Partial<Record<string, string>>
}) {
  const [form, setForm] = useState({
    title: prefill?.title ?? '',
    description: prefill?.description ?? '',
    deadline: prefill?.deadline ?? '',
    priority: prefill?.priority ?? 'medium',
    subjectId: prefill?.subjectId ?? '',
    duration: prefill?.duration ?? '60',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.title.trim()) { setError('A title is required.'); return }
    if (kind === 'session' && form.deadline) {
      if (Number(form.duration) <= 0) { setError('Duration must be greater than zero.'); return }
    }
    setError(null)
    await onCreated(kind!, {
      title: form.title.trim(), description: form.description,
      deadline: form.deadline ? new Date(form.deadline).toISOString() : null,
      priority: form.priority, subjectId: form.subjectId, duration: Number(form.duration || 60),
    })
    setForm({ title: '', description: '', deadline: '', priority: 'medium', subjectId: '', duration: '60' })
  }

  const titles = { task: 'New task', note: 'Quick note', session: 'Schedule a study session' }
  return (
    <Dialog
      open={kind !== null} onClose={onClose}
      title={kind ? titles[kind] : ''}
      description={kind === 'task' ? 'Personal task in your workspace.' : kind === 'note' ? 'Saved privately to your notes.' : 'Adds a study session to your calendar.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            {kind === 'session' ? 'Schedule' : kind === 'note' ? 'Save note' : 'Create task'}
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label={kind === 'session' ? 'What will you study?' : kind === 'note' ? 'Note title' : 'Task title'} error={error}>
          <Input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)}
            placeholder={kind === 'session' ? 'DBMS — normalisation practice' : kind === 'note' ? 'Lecture 7 summary' : 'Finish normalisation assignment'} />
        </Field>
        {kind !== 'note' && (
          <Field label={kind === 'session' ? 'Starts at' : 'Deadline'} hint="optional">
            <Input type="datetime-local" value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </Field>
        )}
        {kind === 'session' && (
          <Field label="Duration (minutes)">
            <Input type="number" min={5} step={5} value={form.duration} onChange={(e) => set('duration', e.target.value)} />
          </Field>
        )}
        {kind === 'task' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
              </Select>
            </Field>
            <Field label="Subject" hint="optional">
              <Select value={form.subjectId} onChange={(e) => set('subjectId', e.target.value)}>
                <option value="">None</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
              </Select>
            </Field>
          </div>
        )}
        <Field label={kind === 'note' ? 'Content' : 'Description'} hint={kind === 'note' ? 'markdown supported' : 'optional'}>
          <Textarea value={form.description} onChange={(e) => set('description', e.target.value)}
            placeholder={kind === 'note' ? 'Key points, formulas, links…' : 'Any details you want to remember'} />
        </Field>
      </div>
    </Dialog>
  )
}
