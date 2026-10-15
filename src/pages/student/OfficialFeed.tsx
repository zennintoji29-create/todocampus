import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, CalendarClock, Check, Download, ExternalLink, Info, MapPin, Paperclip,
  Plus, Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNowStrict } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useDebounced } from '@/hooks/useDebounced'
import {
  fetchAnnouncementReads, fetchAnnouncements, fetchApplications, fetchAssignments, fetchAssessments,
  fetchAttachments, fetchOpportunities, fetchSubjects, fetchTasks, importAssessment, importAssignment,
  markAnnouncementRead, saveOpportunity, signedUrl,
} from '@/lib/api'
import {
  Badge, Button, Card, EmptyState, ErrorState, SearchInput, Select, Spinner, TableSkeleton,
} from '@/components/ui'
import { friendlyDate } from '@/components/shared'
import { cn, formatBytes, titleCase } from '@/lib/utils'

type FeedKind = 'assignments' | 'assessments'

/* ===================== Shared official feed ===================== */
function OfficialFeed({ kind }: { kind: FeedKind }) {
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('')
  const [status, setStatus] = useState('')
  const [importing, setImporting] = useState<string | null>(null)
  const dq = useDebounced(q)

  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [assignments, assessments, subjects, tasks] = await Promise.all([
      fetchAssignments({ limit: 300 }), fetchAssessments({ limit: 300 }), fetchSubjects(), fetchTasks(uid),
    ])
    return { assignments, assessments, subjects, tasks }
  }, [uid])

  const importedIds = useMemo(() => {
    const s = new Set<string>()
    for (const t of data?.tasks ?? []) {
      if (t.source_type === 'assignment') s.add(`assignment:${t.source_id}`)
      if (t.source_type === 'assessment') s.add(`assessment:${t.source_id}`)
    }
    return s
  }, [data])

  const rows = useMemo(() => {
    if (!data) return []
    const source = kind === 'assignments' ? data.assignments : data.assessments
    const now = new Date()
    return source.filter((r: any) => {
      const title = r.title
      const code = r.code ?? ''
      const sname = r.subjects?.code ?? ''
      if (dq && !`${title} ${code} ${sname} ${r.description ?? r.instructions ?? ''}`.toLowerCase().includes(dq.toLowerCase())) return false
      if (subject && r.subject_id !== subject) return false
      if (status === 'upcoming') {
        const d = kind === 'assignments' ? r.deadline : r.starts_at
        if (!d || new Date(d) < now) return false
      }
      if (status === 'past') {
        const d = kind === 'assignments' ? r.deadline : r.starts_at
        if (!d || new Date(d) >= now) return false
      }
      return true
    })
  }, [data, kind, dq, subject, status])

  const doImport = async (row: any) => {
    if (!uid) return
    const sourceKey = `${kind === 'assignments' ? 'assignment' : 'assessment'}:${row.id}`
    if (importedIds.has(sourceKey)) { toast.info('Already in your workspace.'); return }
    setImporting(row.id)
    try {
      if (kind === 'assignments') {
        await importAssignment({ id: row.id, title: row.title, description: row.description, deadline: row.deadline, subject_id: row.subject_id, semester_id: row.semester_id, priority: row.priority }, uid)
      } else {
        await importAssessment({ id: row.id, title: row.title, instructions: row.instructions, starts_at: row.starts_at, subject_id: row.subject_id, semester_id: row.semester_id }, uid)
      }
      toast.success('Added to your workspace')
      await reload()
    } catch (e: any) {
      toast.error(e?.message?.includes('already exists')
        ? 'This item is already in your workspace.'
        : e?.message ?? 'Could not import.')
    } finally { setImporting(null) }
  }

  const total = kind === 'assignments' ? data?.assignments.length ?? 0 : data?.assessments.length ?? 0
  const upcomingCount = useMemo(() => {
    if (!data) return 0
    const now = new Date()
    const list = kind === 'assignments' ? data.assignments : data.assessments
    return list.filter((r: any) => {
      const d = kind === 'assignments' ? r.deadline : r.starts_at
      return d && new Date(d) >= now
    }).length
  }, [data, kind])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-faint">
        <span>{total} published</span>
        <span>·</span>
        <span className="text-accent">{upcomingCount} upcoming</span>
        {isAdmin && (
          <Link
            to={kind === 'assignments' ? '/admin/assignments' : '/admin/assessments'}
            className="inline-flex items-center gap-1 rounded-md bg-accent/15 px-2.5 py-1 text-[12px] font-medium text-accent hover:bg-accent/25 transition-colors"
          >
            <Plus size={13} />
            {kind === 'assignments' ? 'New assignment (Admin)' : 'New quiz / exam (Admin)'}
          </Link>
        )}
        <span className="ml-auto">Import an item to start tracking it privately.</span>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder={kind === 'assignments' ? 'Search assignments…' : 'Search quizzes & exams…'} className="min-w-[200px] flex-1" />
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-44">
            <option value="">All subjects</option>
            {data?.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
            <option value="">Any time</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </Select>
        </div>

        {loading && <TableSkeleton rows={6} cols={4} />}
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState title="Nothing here yet" message={q || subject || status ? 'Try clearing the filters.' : 'No published content in this category yet.'} />
        )}
        {!loading && !error && rows.length > 0 && (
          <div className="divide-y divide-line-soft">
            {rows.map((r: any) => {
              const deadline = kind === 'assignments' ? r.deadline : r.starts_at
              const sourceKey = `${kind === 'assignments' ? 'assignment' : 'assessment'}:${r.id}`
              const isImported = importedIds.has(sourceKey)
              const overdue = deadline && new Date(deadline) < new Date() && kind === 'assignments'
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/${kind}/${r.id}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="truncate text-[13px] font-medium text-ink hover:text-accent">{r.title}</span>
                      {r.code && <Badge tone="neutral">{r.code}</Badge>}
                      {kind === 'assessments' && <Badge tone="info">{titleCase(r.kind)}</Badge>}
                      {overdue && <Badge tone="danger">past deadline</Badge>}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                      {r.subjects && <span className="text-accent/90">{r.subjects.code}</span>}
                      <span className="inline-flex items-center gap-1"><CalendarClock size={11} />{friendlyDate(deadline)}</span>
                      {kind === 'assessments' && r.duration_minutes && <span>{r.duration_minutes} min</span>}
                      {r.priority && kind === 'assignments' && <span>{titleCase(r.priority)} priority</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isAdmin && (
                      <Link
                        to={kind === 'assignments' ? `/admin/assignments?edit=${r.id}` : `/admin/assessments?edit=${r.id}`}
                        className="rounded border border-line-soft bg-bg-2 px-2 py-1 text-[11px] font-medium text-ink-muted hover:border-accent hover:text-accent transition-colors"
                        title="Edit or delete in Admin Portal"
                      >
                        Manage
                      </Link>
                    )}
                    {isImported ? (
                      <Badge tone="accent"><Check size={11} /> In your workspace</Badge>
                    ) : (
                      <Button
                        size="sm" variant="primary" loading={importing === r.id}
                        onClick={() => doImport(r)}
                      >
                        <Plus size={13} /> Add to workspace
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

export const AssignmentsFeed = () => <OfficialFeed kind="assignments" />
export const AssessmentsFeed = () => <OfficialFeed kind="assessments" />

/* ===================== Assignment / assessment detail ===================== */
export function AssignmentDetail() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const navigate = useNavigate()
  const [importing, setImporting] = useState(false)

  const { data, loading, error } = useAsyncData(async () => {
    const list = await fetchAssignments({ limit: 300 })
    return list.find((a: any) => a.id === id) ?? null
  }, [id])
  const { data: isImported } = useAsyncData(async () => {
    if (!uid || !id) return false
    const tasks = await fetchTasks(uid)
    return tasks.some((t: any) => t.source_type === 'assignment' && t.source_id === id)
  }, [uid, id])

  if (loading) return <div className="space-y-3"><div className="skeleton h-8 w-1/2" /><div className="skeleton h-40" /></div>
  if (error) return <ErrorState message={error} />
  if (!data) return <EmptyState title="Assignment not found" message="It may have been archived or removed." action={<Button onClick={() => navigate('/assignments')}>Back to assignments</Button>} />

  const d: any = data
  const links: string[] = Array.isArray(d.reference_links) ? d.reference_links : []

  const doImport = async () => {
    if (!uid) return
    setImporting(true)
    try {
      await importAssignment({ id: d.id, title: d.title, description: d.description, deadline: d.deadline, subject_id: d.subject_id, semester_id: d.semester_id, priority: d.priority }, uid)
      toast.success('Added to your workspace')
      await navigate('/tasks')
    } catch (e: any) { toast.error(e?.message ?? 'Could not import (maybe already imported).') }
    finally { setImporting(false) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/assignments')}><ArrowLeft size={14} /> Back</Button>
        {isAdmin && (
          <Link to={`/admin/assignments?edit=${d.id}`}>
            <Button variant="secondary" size="sm">Edit / Delete in Admin</Button>
          </Link>
        )}
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{d.title}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {d.code && <Badge tone="neutral">{d.code}</Badge>}
              {d.subjects && <Badge tone="info">{d.subjects.code}</Badge>}
              <Badge tone={new Date(d.deadline) < new Date() ? 'danger' : 'accent'}>{titleCase(d.priority)} priority</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link to={`/admin/assignments?edit=${d.id}`}>
                <Button variant="secondary" size="sm">Admin Manage</Button>
              </Link>
            )}
            {isImported ? (
              <Badge tone="accent"><Check size={11} /> In your workspace</Badge>
            ) : (
              <Button variant="primary" loading={importing} onClick={doImport}><Plus size={13} /> Add to workspace</Button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-y border-line-soft py-4 sm:grid-cols-3">
          <div><p className="text-[10.5px] uppercase tracking-wider text-faint">Deadline</p><p className="text-[13px] text-ink">{friendlyDate(d.deadline)}</p><p className="text-[11px] text-faint">{formatDistanceToNowStrict(new Date(d.deadline), { addSuffix: true })}</p></div>
          <div><p className="text-[10.5px] uppercase tracking-wider text-faint">Type</p><p className="text-[13px] text-ink">{titleCase(d.kind)}</p></div>
          <div><p className="text-[10.5px] uppercase tracking-wider text-faint">Published</p><p className="text-[13px] text-ink">{d.publish_date ?? '—'}</p></div>
        </div>

        {d.description && <p className="mt-4 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted">{d.description}</p>}
        {d.instructions && (
          <div className="mt-4 rounded-lg border border-line-soft p-3">
            <p className="mb-1 text-[10.5px] uppercase tracking-wider text-faint">Instructions</p>
            <p className="whitespace-pre-wrap text-[13px] text-muted">{d.instructions}</p>
          </div>
        )}
        {links.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[10.5px] uppercase tracking-wider text-faint">Reference links</p>
            <ul className="space-y-1">
              {links.map((l, i) => (
                <li key={i}>
                  <a href={l} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-accent hover:underline">
                    {l} <ExternalLink size={11} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AttachmentsList entityType="assignment" entityId={d.id} />
      </Card>
    </div>
  )
}

export function AssessmentDetail() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const navigate = useNavigate()
  const [importing, setImporting] = useState(false)
  const { data, loading, error } = useAsyncData(async () => {
    const list = await fetchAssessments({ limit: 300 })
    return list.find((a: any) => a.id === id) ?? null
  }, [id])

  if (loading) return <div className="space-y-3"><div className="skeleton h-8 w-1/2" /><div className="skeleton h-40" /></div>
  if (error) return <ErrorState message={error} />
  if (!data) return <EmptyState title="Assessment not found" message="It may have been archived or removed." action={<Button onClick={() => navigate('/assessments')}>Back</Button>} />
  const d: any = data
  const links: string[] = Array.isArray(d.reference_links) ? d.reference_links : []

  const doImport = async () => {
    if (!uid) return
    setImporting(true)
    try {
      await importAssessment({ id: d.id, title: d.title, instructions: d.instructions, starts_at: d.starts_at, subject_id: d.subject_id, semester_id: d.semester_id }, uid)
      toast.success('Added to your workspace')
      await navigate('/tasks')
    } catch { toast.error('Could not import (maybe already imported).') }
    finally { setImporting(false) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/assessments')}><ArrowLeft size={14} /> Back</Button>
        {isAdmin && (
          <Link to={`/admin/assessments?edit=${d.id}`}>
            <Button variant="secondary" size="sm">Edit / Delete in Admin</Button>
          </Link>
        )}
      </div>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-ink">{d.title}</h2>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Badge tone="info">{titleCase(d.kind)}</Badge>
              {d.subjects && <Badge tone="neutral">{d.subjects.code}</Badge>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link to={`/admin/assessments?edit=${d.id}`}>
                <Button variant="secondary" size="sm">Admin Manage</Button>
              </Link>
            )}
            <Button variant="primary" loading={importing} onClick={doImport}><Plus size={13} /> Add to workspace</Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-y border-line-soft py-4 sm:grid-cols-4">
          <div><p className="text-[10.5px] uppercase tracking-wider text-faint">Date & time</p><p className="text-[13px] text-ink">{friendlyDate(d.starts_at)}</p></div>
          <div><p className="text-[10.5px] uppercase tracking-wider text-faint">Duration</p><p className="text-[13px] text-ink">{d.duration_minutes ? `${d.duration_minutes} min` : '—'}</p></div>
          <div><p className="text-[10.5px] uppercase tracking-wider text-faint">Venue</p><p className="text-[13px] text-ink">{d.venue ?? '—'}</p></div>
          <div><p className="text-[10.5px] uppercase tracking-wider text-faint">Countdown</p><p className="text-[13px] text-accent">{formatDistanceToNowStrict(new Date(d.starts_at), { addSuffix: true })}</p></div>
        </div>

        {d.syllabus_coverage && (
          <div className="mt-4">
            <p className="mb-1 text-[10.5px] uppercase tracking-wider text-faint">Syllabus coverage</p>
            <p className="text-[13px] text-muted">{d.syllabus_coverage}</p>
          </div>
        )}
        {d.instructions && (
          <div className="mt-4 rounded-lg border border-line-soft p-3">
            <p className="mb-1 text-[10.5px] uppercase tracking-wider text-faint">Instructions</p>
            <p className="whitespace-pre-wrap text-[13px] text-muted">{d.instructions}</p>
          </div>
        )}
        {links.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[10.5px] uppercase tracking-wider text-faint">References</p>
            {links.map((l, i) => (
              <a key={i} href={l} target="_blank" rel="noopener noreferrer" className="block text-[12.5px] text-accent hover:underline">{l}</a>
            ))}
          </div>
        )}
        <AttachmentsList entityType="assessment" entityId={d.id} />
      </Card>
    </div>
  )
}

function AttachmentsList({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { data, loading } = useAsyncData(() => fetchAttachments(entityType, entityId), [entityType, entityId])
  const open = async (path: string) => {
    try { window.open(await signedUrl(path), '_blank', 'noopener') }
    catch (e: any) { toast.error(e?.message ?? 'Could not open the file.') }
  }
  return (
    <div className="mt-4">
      <p className="mb-1.5 text-[10.5px] uppercase tracking-wider text-faint">Attachments</p>
      {loading && <Spinner />}
      {!loading && (data ?? []).length === 0 && <p className="text-[12px] text-faint">None.</p>}
      {(data ?? []).map((a: any) => (
        <button key={a.id} onClick={() => open(a.storage_path)} className="mb-1 flex w-full items-center gap-2 rounded-lg border border-line-soft px-3 py-2 text-left transition-colors hover:border-accent/30">
          <Paperclip size={13} className="text-faint" />
          <span className="flex-1 truncate text-[12.5px] text-ink">{a.label || a.storage_path.split('/').pop()}</span>
          <span className="text-[11px] text-faint">{formatBytes(a.size_bytes)}</span>
          <Download size={13} className="text-faint" />
        </button>
      ))}
    </div>
  )
}

/* ===================== Announcements ===================== */
export function AnnouncementsPage() {
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const [category, setCategory] = useState('')
  const [q, setQ] = useState('')
  const { data, loading, error, reload, setData } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [announcements, reads] = await Promise.all([fetchAnnouncements({ limit: 100 }), fetchAnnouncementReads(uid)])
    return { announcements, reads: new Set(reads.map((r: any) => r.announcement_id)) }
  }, [uid])

  const rows = (data?.announcements ?? []).filter((a: any) =>
    (!category || a.category === category) &&
    (!q || `${a.title} ${a.body}`.toLowerCase().includes(q.toLowerCase())))

  const markRead = async (id: string) => {
    if (!uid || data?.reads.has(id)) return
    try {
      await markAnnouncementRead(uid, id)
      setData((prev: any) => ({ ...prev, reads: new Set([...prev.reads, id]) }))
    } catch { /* non-critical */ }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search announcements…" className="min-w-[200px] flex-1" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="">All categories</option>
            {['notice', 'class', 'academic', 'schedule', 'event', 'exam', 'urgent'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </Select>
          {isAdmin && (
            <Link to="/admin/announcements">
              <Button variant="primary" size="sm">
                <Plus size={13} /> Post announcement (Admin)
              </Button>
            </Link>
          )}
        </div>
        {loading && <TableSkeleton rows={5} cols={3} />}
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {!loading && !error && rows.length === 0 && <EmptyState icon={<Info size={18} />} title="No announcements" message="Official notices from your college will appear here." />}
        <div className="divide-y divide-line-soft">
          {rows.map((a: any) => {
            const unread = !data?.reads.has(a.id)
            return (
              <div key={a.id} className="flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-bg-2/60">
                <Link to={`/announcements/${a.id}`} onClick={() => markRead(a.id)} className={cn('min-w-0 flex-1', unread && 'text-accent')}>
                  <div className="flex flex-wrap items-center gap-2">
                    {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    {a.is_pinned && <Badge tone="accent">pinned</Badge>}
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{a.title}</span>
                    <Badge tone={a.category === 'urgent' ? 'danger' : a.category === 'exam' ? 'warn' : 'neutral'}>{a.category}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted">{a.body}</p>
                  <p className="mt-1.5 text-[10.5px] text-faint">
                    {formatDistanceToNowStrict(new Date(a.publish_at), { addSuffix: true })}
                    {a.profiles?.full_name ? ` · ${a.profiles.full_name}` : ''}
                  </p>
                </Link>
                {isAdmin && (
                  <Link to={`/admin/announcements?edit=${a.id}`} className="ml-3 shrink-0">
                    <Button variant="ghost" size="sm" className="text-[11px]">Edit</Button>
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

export function AnnouncementDetail() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const navigate = useNavigate()
  const { data, loading, error } = useAsyncData(async () => {
    const list = await fetchAnnouncements({ limit: 100 })
    return list.find((a: any) => a.id === id) ?? null
  }, [id])

  useAsyncData(async () => {
    if (uid && id) { try { await markAnnouncementRead(uid, id) } catch { /* noop */ } }
    return null
  }, [uid, id])

  if (loading) return <div className="skeleton h-64" />
  if (error) return <ErrorState message={error} />
  if (!data) return <EmptyState title="Announcement not found" action={<Button onClick={() => navigate('/announcements')}>Back</Button>} />
  const a: any = data
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/announcements')}><ArrowLeft size={14} /> Back</Button>
        {isAdmin && (
          <Link to={`/admin/announcements?edit=${a.id}`}>
            <Button variant="secondary" size="sm">Edit / Delete in Admin</Button>
          </Link>
        )}
      </div>
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          {a.is_pinned && <Badge tone="accent">pinned</Badge>}
          <Badge tone={a.category === 'urgent' ? 'danger' : 'neutral'}>{a.category}</Badge>
          {a.audience !== 'all' && <Badge tone="info">{titleCase(a.audience)} only</Badge>}
        </div>
        <h2 className="mt-3 text-[20px] font-semibold tracking-tight text-ink">{a.title}</h2>
        <p className="mt-1.5 text-[11.5px] text-faint">
          {format(new Date(a.publish_at), 'd MMM yyyy, HH:mm')}
          {a.profiles?.full_name ? ` · ${a.profiles.full_name}` : ''}
        </p>
        <p className="mt-5 whitespace-pre-wrap text-[14px] leading-relaxed text-muted">{a.body}</p>
        <AttachmentsList entityType="announcement" entityId={a.id} />
      </Card>
    </div>
  )
}

/* ===================== Opportunities ===================== */
export function OpportunitiesPage() {
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const dq = useDebounced(q)

  const { data, loading, error, reload, setData } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [opportunities, apps] = await Promise.all([fetchOpportunities({ limit: 200 }), fetchApplications(uid)])
    return { opportunities, savedIds: new Set(apps.map((a: any) => a.source_opportunity_id).filter(Boolean)) }
  }, [uid])

  const rows = (data?.opportunities ?? []).filter((o: any) => {
    if (category && o.category !== category) return false
    if (saved && !data?.savedIds.has(o.id)) return false
    if (dq && !`${o.title} ${o.organization} ${o.role ?? ''}`.toLowerCase().includes(dq.toLowerCase())) return false
    return true
  })

  const doSave = async (o: any) => {
    if (!uid) return
    setSaving(o.id)
    try {
      await saveOpportunity(uid, o)
      toast.success('Saved to your career tracker')
      setData((prev: any) => ({ ...prev, savedIds: new Set([...prev.savedIds, o.id]) }))
    } catch (e: any) { toast.error(e?.message ?? 'Could not save (maybe already saved).') }
    finally { setSaving(null) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search opportunities…" className="min-w-[200px] flex-1" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-48">
            <option value="">All categories</option>
            {['internship', 'placement', 'hackathon', 'workshop', 'scholarship', 'competition', 'conference', 'chapter_event'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </Select>
          <label className="flex items-center gap-1.5 text-[12px] text-muted">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="accent-[#22d3a5]" /> Saved only
          </label>
          {isAdmin && (
            <Link to="/admin/opportunities">
              <Button variant="primary" size="sm">
                <Plus size={13} /> Add opportunity (Admin)
              </Button>
            </Link>
          )}
        </div>
        {loading && <TableSkeleton rows={5} cols={4} />}
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {!loading && !error && rows.length === 0 && <EmptyState icon={<Sparkles size={18} />} title="No opportunities" message="Internships, placements and hackathons published by admins appear here." />}
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {rows.map((o: any) => (
            <Card key={o.id} className="flex flex-col p-4 transition-colors hover:border-accent/30">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-ink">{o.title}</p>
                  <p className="truncate text-[11.5px] text-faint">{o.organization}{o.role ? ` · ${o.role}` : ''}</p>
                </div>
                <Badge tone={o.category === 'placement' ? 'accent' : 'info'}>{titleCase(o.category)}</Badge>
              </div>
              {o.description && <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-muted">{o.description}</p>}
              {o.eligibility && <p className="mt-1.5 text-[11px] text-faint"><span className="text-muted">Eligibility:</span> {o.eligibility}</p>}
              <div className="mt-3 flex items-center gap-2 text-[11px] text-faint">
                {o.application_deadline && (
                  <span className={cn('inline-flex items-center gap-1', new Date(o.application_deadline) < new Date() ? 'text-danger' : '')}>
                    <CalendarClock size={11} /> Apply by {format(new Date(o.application_deadline), 'd MMM')}
                  </span>
                )}
                {o.location && <span className="inline-flex items-center gap-1"><MapPin size={11} />{o.location}</span>}
              </div>
              <div className="mt-3 flex items-center gap-2 pt-1">
                {data?.savedIds.has(o.id)
                  ? <Badge tone="accent"><Check size={11} /> Saved</Badge>
                  : <Button size="sm" variant="primary" loading={saving === o.id} onClick={() => doSave(o)}>Save</Button>}
                <Link to={`/opportunities/${o.id}`}><Button size="sm" variant="ghost">Details</Button></Link>
                {isAdmin && (
                  <Link to={`/admin/opportunities?edit=${o.id}`}>
                    <Button size="sm" variant="ghost">Edit (Admin)</Button>
                  </Link>
                )}
                {o.apply_url && (
                  <a href={o.apply_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost">Apply <ExternalLink size={11} /></Button>
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  )
}

export function OpportunityDetail() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const uid = user?.id
  const navigate = useNavigate()
  const { data, loading, error } = useAsyncData(async () => {
    const list = await fetchOpportunities({ limit: 200 })
    return list.find((o: any) => o.id === id) ?? null
  }, [id])
  const { data: apps } = useAsyncData(async () => (uid ? fetchApplications(uid) : []), [uid])
  const app = (apps ?? []).find((a: any) => a.source_opportunity_id === id)

  if (loading) return <div className="skeleton h-64" />
  if (error) return <ErrorState message={error} />
  if (!data) return <EmptyState title="Opportunity not found" action={<Button onClick={() => navigate('/opportunities')}>Back</Button>} />
  const o: any = data

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/opportunities')}><ArrowLeft size={14} /> Back</Button>
        {isAdmin && (
          <Link to={`/admin/opportunities?edit=${o.id}`}>
            <Button variant="secondary" size="sm">Edit / Delete in Admin</Button>
          </Link>
        )}
      </div>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight text-ink">{o.title}</h2>
            <p className="mt-1 text-[12.5px] text-faint">{o.organization}{o.role ? ` · ${o.role}` : ''}</p>
          </div>
          <Badge tone="info">{titleCase(o.category)}</Badge>
        </div>
        {o.application_deadline && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] text-warn">
            <CalendarClock size={13} /> Apply by {friendlyDate(o.application_deadline)}
          </p>
        )}
        {o.description && <p className="mt-4 whitespace-pre-wrap text-[14px] leading-relaxed text-muted">{o.description}</p>}
        {o.eligibility && (
          <div className="mt-4 rounded-lg border border-line-soft p-3">
            <p className="mb-1 text-[10.5px] uppercase tracking-wider text-faint">Eligibility</p>
            <p className="text-[13px] text-muted">{o.eligibility}</p>
          </div>
        )}
        <div className="mt-5 flex items-center gap-2">
          {o.apply_url && (
            <a href={o.apply_url} target="_blank" rel="noopener noreferrer">
              <Button variant="primary">Apply now <ExternalLink size={13} /></Button>
            </a>
          )}
          {app
            ? <Link to={`/career/${app.id}`}><Button variant="secondary">Track in Career Tracker</Button></Link>
            : <SaveOpportunityButton uid={uid!} opp={o} />}
        </div>
        <AttachmentsList entityType="opportunity" entityId={o.id} />
      </Card>
    </div>
  )
}

function SaveOpportunityButton({ uid, opp }: { uid: string; opp: any }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button variant="secondary" loading={busy} onClick={async () => {
      setBusy(true)
      try { await saveOpportunity(uid, opp); toast.success('Saved'); location.reload() }
      catch (e: any) { toast.error(e?.message ?? 'Could not save.') }
      finally { setBusy(false) }
    }}>
      <Plus size={13} /> Save to tracker
    </Button>
  )
}
