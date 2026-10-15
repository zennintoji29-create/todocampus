import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BookOpen, GraduationCap, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import {
  autoImportSubject, fetchAssignments, fetchAssessments, fetchSemesters, fetchSubjects,
  fetchSubscriptions, fetchTasks, fetchTopicProgress, fetchTopics, fetchUnits, toggleSubscription,
} from '@/lib/api'
import { Badge, Button, Card, EmptyState, ErrorState, Progress, ProgressRing, Skeleton, Switch } from '@/components/ui'
import { friendlyDate } from '@/components/shared'
import { aggregateProgress, completionRatio } from '@/lib/domain'
import { toast } from 'sonner'

export function SubjectsPage() {
  const { isAdmin } = useAuth()
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [subjects, semesters] = await Promise.all([fetchSubjects(), fetchSemesters()])
    return { subjects, semesters }
  }, [])

  if (loading) return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  const bySemester = new Map<string, any[]>()
  for (const s of data?.subjects ?? []) {
    const k = s.semester_id ?? 'none'
    ;(bySemester.get(k) ?? bySemester.set(k, []).get(k)!).push(s)
  }

  return (
    <div className="space-y-5">
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent/10 p-3 text-[12.5px] text-accent">
          <span>Admin mode: Manage curriculum subjects, faculties, and semester assignments.</span>
          <Link to="/admin/curriculum">
            <Button variant="primary" size="sm">Manage Curriculum & Subjects (Admin)</Button>
          </Link>
        </div>
      )}
      {(data?.semesters ?? []).filter((s: any) => s.is_active).map((sem: any) => (
        <section key={sem.id}>
          <div className="mb-2 flex items-center gap-2">
            <GraduationCap size={15} className="text-accent" />
            <h2 className="text-[13px] font-semibold text-ink">{sem.name}</h2>
            <Badge tone="neutral">{(bySemester.get(sem.id) ?? []).length} subjects</Badge>
            {sem.start_date && <span className="text-[11px] text-faint">{sem.start_date} → {sem.end_date}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(bySemester.get(sem.id) ?? []).map((s: any) => (
              <Link key={s.id} to={`/subjects/${s.id}`} className="rounded-xl border border-line bg-bg-1 p-4 transition-colors hover:border-accent/35">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-accent">{s.code}</p>
                    <p className="truncate text-[13px] text-ink">{s.name}</p>
                  </div>
                  {s.credits && <Badge tone="neutral">{s.credits} cr</Badge>}
                </div>
                {s.faculty && <p className="mt-1.5 flex items-center gap-1 text-[11px] text-faint"><Users size={11} />{s.faculty}</p>}
              </Link>
            ))}
            {(bySemester.get(sem.id) ?? []).length === 0 && <p className="col-span-full py-4 text-[12px] text-faint">No subjects published for this semester.</p>}
          </div>
        </section>
      ))}
      {(data?.subjects ?? []).length === 0 && <Card><EmptyState icon={<BookOpen size={18} />} title="No subjects yet" message="An administrator has not published the curriculum." /></Card>}
    </div>
  )
}

export function SubjectDetail() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [subjects, units, topics, progress, assignments, assessments, tasks, subs] = await Promise.all([
      fetchSubjects(), fetchUnits(), fetchTopics(), fetchTopicProgress(uid),
      fetchAssignments({ limit: 300 }), fetchAssessments({ limit: 300 }), fetchTasks(uid), fetchSubscriptions(uid),
    ])
    return { subjects, units, topics, progress, assignments, assessments, tasks, subs }
  }, [uid])

  const model = useMemo(() => {
    if (!data) return null
    const subject = data.subjects.find((s: any) => s.id === id)
    if (!subject) return { subject: null }
    const myUnits = data.units.filter((u: any) => u.subject_id === id)
    const myTopics = data.topics.filter((t: any) => myUnits.some((u: any) => u.id === t.unit_id))
    const progressMap: Record<string, any> = {}
    for (const p of data.progress) progressMap[p.topic_id] = p
    const topicList = myTopics.map((t: any) => ({ id: t.id, title: t.title, isOptional: t.is_optional, estMinutes: t.est_minutes }))
    const agg = aggregateProgress(myUnits.map((u: any) => ({ id: u.id, subjectId: u.subject_id, semesterId: u.subjects?.semester_id ?? '', topicIds: myTopics.filter((t: any) => t.unit_id === u.id).map((t: any) => t.id) })), topicList, progressMap)
    const stats = completionRatio(topicList, progressMap)
    return {
      subject, myUnits, myTopics, progressMap, agg, stats,
      assignments: data.assignments.filter((a: any) => a.subject_id === id),
      assessments: data.assessments.filter((a: any) => a.subject_id === id),
      myTasks: data.tasks.filter((t: any) => t.subject_id === id),
      sub: data.subs.find((s: any) => s.subject_id === id),
    }
  }, [data, id])

  if (loading) return <Skeleton className="h-64" />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  if (!model || !model.subject) return <EmptyState title="Subject not found" />
  const { subject, myUnits, myTopics, progressMap, stats, assignments, assessments, myTasks, agg, sub } = model as any

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex items-center justify-between rounded-lg border border-accent/30 bg-accent/10 px-3.5 py-2 text-[12px] text-accent">
          <span>Admin mode: Need to update syllabus topics, units, or subject metadata?</span>
          <Link to="/admin/curriculum">
            <Button variant="secondary" size="sm">Manage in Curriculum Admin</Button>
          </Link>
        </div>
      )}
      <Card className="flex flex-wrap items-center gap-5 p-5">
        <ProgressRing value={stats.percent} size={86} />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] text-accent">{subject.code}</p>
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">{subject.name}</h2>
          <p className="mt-1 text-[12px] text-faint">
            {subject.faculty ?? 'Faculty TBA'}{subject.credits ? ` · ${subject.credits} credits` : ''}
          </p>
          {subject.description && <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted">{subject.description}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Switch
            checked={!!sub?.auto_import_assignments} disabled={busy}
            label="Auto-import new work"
            onChange={async (v) => {
              if (!user || !id) return
              setBusy(true)
              try {
                await toggleSubscription(user.id, id, { auto_import_assignments: v })
                if (v) {
                  const r = await autoImportSubject(user.id, id)
                  toast.success(`Imported ${r.imported} published item${r.imported === 1 ? '' : 's'}`)
                } else toast.success('Subscription disabled')
                await reload()
              } catch (e: any) { toast.error(e?.message ?? 'Could not update.') }
              finally { setBusy(false) }
            }}
          />
          <Link to={`/syllabus?subject=${id}`}><Button size="sm" variant="secondary">Open syllabus tracker</Button></Link>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-line-soft px-4 py-3"><h3 className="text-[13px] font-semibold text-ink">Syllabus · {stats.completed}/{stats.applicable} topics</h3></div>
          <div className="divide-y divide-line-soft">
            {myUnits.map((u: any) => {
              const p = agg.units.get(u.id) ?? { percent: 0, completed: 0, applicable: 0 }
              const topics = myTopics.filter((t: any) => t.unit_id === u.id)
              return (
                <div key={u.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <p className="text-[12.5px] font-medium text-muted">Unit {u.unit_number}: {u.title}</p>
                    <div className="ml-auto w-24"><Progress value={p.percent} /></div>
                    <span className="w-9 text-right text-[11px] text-faint">{p.percent}%</span>
                  </div>
                  {u.description && <p className="mt-1 text-[11.5px] text-faint">{u.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {topics.map((t: any) => {
                      const st = progressMap[t.id]?.status ?? 'not_started'
                      return <Badge key={t.id} tone={st === 'completed' ? 'accent' : st === 'in_progress' ? 'info' : st === 'revision_needed' ? 'warn' : 'neutral'}>{t.title}</Badge>
                    })}
                  </div>
                </div>
              )
            })}
            {myUnits.length === 0 && <p className="px-4 py-8 text-center text-[12px] text-faint">No units published for this subject.</p>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="border-b border-line-soft px-4 py-2.5"><h3 className="text-[12.5px] font-semibold text-ink">Official work</h3></div>
            <div className="divide-y divide-line-soft">
              {[...assignments.map((a: any) => ({ ...a, _type: 'Assignment', _date: a.deadline, _link: `/assignments/${a.id}` })),
                ...assessments.map((a: any) => ({ ...a, _type: titleCaseLocal(a.kind), _date: a.starts_at, _link: `/assessments/${a.id}` }))]
                .sort((a: any, b: any) => new Date(a._date).getTime() - new Date(b._date).getTime())
                .slice(0, 8).map((x: any) => (
                  <Link key={x.id} to={x._link} className="flex items-center gap-2.5 px-4 py-2 hover:bg-bg-2/60">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] text-ink">{x.title}</p>
                      <p className="text-[10.5px] text-faint">{x._type} · {friendlyDate(x._date)}</p>
                    </div>
                  </Link>
                ))}
              {assignments.length + assessments.length === 0 && <p className="px-4 py-8 text-center text-[12px] text-faint">Nothing published for this subject.</p>}
            </div>
          </Card>

          <Card>
            <div className="border-b border-line-soft px-4 py-2.5"><h3 className="text-[12.5px] font-semibold text-ink">My tasks</h3></div>
            <div className="divide-y divide-line-soft">
              {myTasks.slice(0, 8).map((t: any) => (
                <Link key={t.id} to={`/tasks?task=${t.id}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-bg-2/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] text-ink">{t.title}</p>
                    <p className="text-[10.5px] text-faint">{t.status.replace('_', ' ')} · {friendlyDate(t.deadline)}</p>
                  </div>
                </Link>
              ))}
              {myTasks.length === 0 && <p className="px-4 py-8 text-center text-[12px] text-faint">No tasks for this subject yet.</p>}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

function titleCaseLocal(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
