import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, CheckCircle2, RotateCcw, Zap } from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import {
  autoImportSubject, fetchSubjects, fetchSubscriptions, fetchTopicProgress,
  fetchTopics, fetchUnits, setTopicProgress, toggleSubscription,
} from '@/lib/api'
import { Badge, Button, Card, EmptyState, ErrorState, Progress, ProgressRing, Select, Skeleton, Switch } from '@/components/ui'
import { TOPIC_STATUS_META } from '@/components/shared'
import { aggregateProgress, completionRatio, type TopicProgressLike, type TopicStatus } from '@/lib/domain'
import { cn } from '@/lib/utils'

const NEXT_STATUS: Record<TopicStatus, TopicStatus> = {
  not_started: 'in_progress', in_progress: 'completed', completed: 'revision_needed', revision_needed: 'in_progress',
}

export default function Syllabus() {
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState('')
  const [busyTopic, setBusyTopic] = useState<string | null>(null)

  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [subjects, units, topics, progress, subs] = await Promise.all([
      fetchSubjects(), fetchUnits(), fetchTopics(), fetchTopicProgress(uid), fetchSubscriptions(uid),
    ])
    return { subjects, units, topics, progress, subs }
  }, [uid])

  const subjectFilter = params.get('subject') ?? ''
  const highlight = params.get('topic')

  const model = useMemo(() => {
    if (!data) return null
    const progressMap: Record<string, TopicProgressLike> = {}
    for (const p of data.progress) {
      progressMap[p.topic_id] = { topicId: p.topic_id, status: p.status, lastStudiedAt: p.last_studied_at, notes: p.notes }
    }
    const topicList = data.topics.map((t: any) => ({ id: t.id, title: t.title, isOptional: t.is_optional, estMinutes: t.est_minutes }))
    const unitsWithTopics = data.units.map((u: any) => ({
      id: u.id, subjectId: u.subject_id, semesterId: u.subjects?.semester_id ?? '',
      topicIds: data.topics.filter((t: any) => t.unit_id === u.id).map((t: any) => t.id),
    }))
    const agg = aggregateProgress(unitsWithTopics, topicList, progressMap)
    const overall = completionRatio(topicList, progressMap)
    return { progressMap, agg, overall, data }
  }, [data])

  const cycle = async (topic: any) => {
    if (!uid) return
    const current = (model?.progressMap[topic.id]?.status ?? 'not_started') as TopicStatus
    const next = NEXT_STATUS[current]
    setBusyTopic(topic.id)
    try {
      await setTopicProgress(uid, topic.id, {
        status: next,
        last_studied_at: next === 'completed' ? new Date().toISOString() : (model?.progressMap[topic.id]?.lastStudiedAt ?? null),
      })
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Could not update.') }
    finally { setBusyTopic(null) }
  }

  const setNotes = async (topic: any, notes: string) => {
    if (!uid) return
    try { await setTopicProgress(uid, topic.id, { notes }); toast.success('Topic notes saved') }
    catch (e: any) { toast.error(e?.message ?? 'Could not save notes.') }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  if (!model || !data) return null
  const { progressMap, agg, overall, data: d } = model

  const subjects = d.subjects.filter((s: any) => !subjectFilter || s.id === subjectFilter)
  const visibleTopicIds = new Set(
    d.topics.filter((t: any) => (!subjectFilter || t.syllabus_units?.subject_id === subjectFilter) && (!filter || (progressMap[t.id]?.status ?? 'not_started') === filter)).map((t: any) => t.id))

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-[12.5px] text-accent">
          <span>Admin mode: Customize, add, or reorganize syllabus units & topics.</span>
          <Link to="/admin/syllabus">
            <Button variant="primary" size="sm">Manage Syllabus Units (Admin)</Button>
          </Link>
        </div>
      )}
      {/* summary */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="flex items-center gap-5 p-5">
          <ProgressRing value={overall.percent} size={104} stroke={8} />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-faint">Overall syllabus</p>
            <p className="mt-1 text-[13px] text-muted">
              <span className="text-ink">{overall.completed}</span> of <span className="text-ink">{overall.applicable}</span> topics completed
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="accent">{overall.inProgress} in progress</Badge>
              {overall.revision > 0 && <Badge tone="warn">{overall.revision} revision</Badge>}
              <Badge tone="neutral">{overall.applicable - overall.started} untouched</Badge>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
              Optional topics are excluded from the completion percentage.
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={subjectFilter} onChange={(e) => setParams(e.target.value ? { subject: e.target.value } : {})} className="w-56">
              <option value="">All subjects</option>
              {d.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </Select>
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-44">
              <option value="">All statuses</option>
              {Object.entries(TOPIC_STATUS_META).map(([k, v]) => <option key={k} value={k}>{(v as any).label}</option>)}
            </Select>
            <Button variant="secondary" size="sm" onClick={() => { setParams({}); setFilter('') }}>
              <RotateCcw size={12} /> Reset
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {d.subjects.slice(0, 8).map((s: any) => {
              const p = agg.subjects.get(s.id) ?? { percent: 0, completed: 0, applicable: 0 }
              const subscribed = d.subs.some((x: any) => x.subject_id === s.id)
              return (
                <Link key={s.id} to={`/syllabus?subject=${s.id}`} className={cn('rounded-lg border p-3 transition-colors', subjectFilter === s.id ? 'border-accent/45 bg-accent/[0.05]' : 'border-line-soft hover:border-accent/25')}>
                  <p className="truncate text-[12.5px] font-medium text-ink">{s.code}</p>
                  <p className="truncate text-[11px] text-faint">{s.name}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Progress value={p.percent} className="flex-1" />
                    <span className="text-[11px] tabular-nums text-accent">{p.percent}%</span>
                  </div>
                  <p className="mt-1 text-[10.5px] text-faint">{p.completed}/{p.applicable} topics{subscribed ? ' · auto-import on' : ''}</p>
                </Link>
              )
            })}
          </div>
        </Card>
      </div>

      {/* hierarchy */}
      <div className="space-y-4">
        {subjects.length === 0 && <Card><EmptyState icon={<BookOpen size={18} />} title="No syllabus published" message="Admins have not published units or topics yet." /></Card>}
        {subjects.map((s: any) => {
          const sp = agg.subjects.get(s.id) ?? { percent: 0, completed: 0, applicable: 0 }
          const units = d.units.filter((u: any) => u.subject_id === s.id)
          const subscribed = d.subs.find((x: any) => x.subject_id === s.id)
          return (
            <Card key={s.id}>
              <div className="flex flex-wrap items-center gap-3 border-b border-line-soft px-4 py-3">
                <Link to={`/subjects/${s.id}`} className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink hover:text-accent">{s.code} — {s.name}</p>
                  <p className="text-[11px] text-faint">{s.faculty ?? 'Faculty TBA'} · {units.length} unit{units.length === 1 ? '' : 's'}</p>
                </Link>
                <div className="ml-auto flex items-center gap-3">
                  <div className="w-28"><Progress value={sp.percent} /></div>
                  <span className="text-[12px] font-semibold tabular-nums text-accent">{sp.percent}%</span>
                  <SyncSubject subjectId={s.id} subscribed={!!subscribed} autoAssign={!!subscribed?.auto_import_assignments} onChanged={() => void reload()} />
                </div>
              </div>

              {units.map((u: any) => {
                const up = agg.units.get(u.id) ?? { percent: 0, completed: 0, applicable: 0 }
                const topics = d.topics.filter((t: any) => t.unit_id === u.id && visibleTopicIds.has(t.id))
                if (topics.length === 0) return null
                return (
                  <div key={u.id} className="border-b border-line-soft last:border-0">
                    <div className="flex items-center gap-3 bg-bg-2/40 px-4 py-2">
                      <p className="text-[12px] font-medium text-muted">Unit {u.unit_number}: {u.title}</p>
                      <div className="ml-auto flex items-center gap-2">
                        <div className="w-20"><Progress value={up.percent} /></div>
                        <span className="w-9 text-right text-[11px] tabular-nums text-faint">{up.percent}%</span>
                      </div>
                    </div>
                    <div className="divide-y divide-line-soft">
                      {topics.map((t: any) => {
                        const st = (progressMap[t.id]?.status ?? 'not_started') as TopicStatus
                        const meta = TOPIC_STATUS_META[st]
                        return (
                          <div key={t.id} className={cn('flex flex-wrap items-center gap-3 px-4 py-2.5', highlight === t.id && 'bg-accent/[0.06]')}>
                            <button
                              onClick={() => cycle(t)}
                              disabled={busyTopic === t.id}
                              className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-all',
                                st === 'completed' ? 'border-accent bg-accent text-bg-0'
                                  : st === 'in_progress' ? 'border-info bg-info/15 text-info'
                                  : st === 'revision_needed' ? 'border-warn bg-warn/15 text-warn' : 'border-line text-transparent hover:border-accent/50')}
                              aria-label={`Mark topic as ${NEXT_STATUS[st]}`}
                            >
                              {st === 'completed' ? <CheckCircle2 size={12} /> : st !== 'not_started' ? <Zap size={11} /> : null}
                            </button>
                            <div className="min-w-0 flex-1">
                              <p className={cn('text-[12.5px]', st === 'completed' ? 'text-faint line-through' : 'text-ink')}>{t.title}</p>
                              <p className="text-[10.5px] text-faint">
                                {t.est_minutes ? `~${t.est_minutes} min` : ''}
                                {progressMap[t.id]?.lastStudiedAt ? ` · studied ${formatDistanceToNowStrict(new Date(progressMap[t.id]!.lastStudiedAt!), { addSuffix: true })}` : ''}
                                {progressMap[t.id]?.notes ? ' · has notes' : ''}
                              </p>
                            </div>
                            <Badge tone={meta.tone}>{meta.label}</Badge>
                            <TopicNotes topic={t} existing={progressMap[t.id]?.notes ?? ''} onSave={(v) => setNotes(t, v)} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function TopicNotes({ topic, existing, onSave }: { topic: any; existing: string; onSave: (v: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState(existing)
  return (
    <>
      <button onClick={() => { setVal(existing); setOpen(true) }} className="text-[11px] text-accent hover:underline">notes</button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setOpen(false)}>
          <div className="anim-modal w-full max-w-md rounded-xl border border-line bg-bg-1 p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-[13px] font-semibold text-ink">Notes · {topic.title}</p>
            <textarea value={val} onChange={(e) => setVal(e.target.value)} className="mt-3 h-40 w-full rounded-lg border border-line bg-bg-2 p-3 text-[13px] text-ink focus:border-accent/60 focus:outline-none" placeholder="Private notes about this topic…" />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={async () => { await onSave(val); setOpen(false) }}>Save</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SyncSubject({ subjectId, subscribed, autoAssign, onChanged }: { subjectId: string; subscribed: boolean; autoAssign: boolean; onChanged: () => void }) {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={autoAssign}
        disabled={busy}
        label="Auto-import"
        onChange={async (v) => {
          if (!user) return
          setBusy(true)
          try {
            if (!subscribed) await toggleSubscription(user.id, subjectId, { auto_import_assignments: v })
            else await toggleSubscription(user.id, subjectId, { auto_import_assignments: v })
            if (v && !subscribed) {
              const r = await autoImportSubject(user.id, subjectId)
              toast.success(`Imported ${r.imported} item${r.imported === 1 ? '' : 's'} from this subject`)
            }
            onChanged()
          } catch (e: any) { toast.error(e?.message ?? 'Could not update subscription.') }
          finally { setBusy(false) }
        }}
      />
    </div>
  )
}
