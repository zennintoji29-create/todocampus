import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  FileText, Pencil, Plus, Send, Trash2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  adminCreate, adminUpdate, adminDelete, attachToEntity, deleteAttachment,
  fetchAnnouncements, fetchAssignments, fetchAssessments, fetchAttachments, fetchOpportunities,
  fetchSemesters, fetchSubjects, signedUrl,
} from '@/lib/api'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input,
  SearchInput, Select, Spinner, Switch, TableSkeleton, Textarea,
} from '@/components/ui'
import { AdminEditorShell } from './Curriculum'
import { friendlyDate } from '@/components/shared'
import { titleCase } from '@/lib/utils'
import { useAsyncData } from '@/hooks/useAsyncData'
import { formatDistanceToNowStrict } from 'date-fns'

type Status = 'draft' | 'published' | 'archived'
const STATUSES: Status[] = ['draft', 'published', 'archived']
const statusTone = (s: string) => (s === 'published' ? 'accent' : s === 'archived' ? 'neutral' : 'warn') as any

/* ---------------- shared row chrome + attachments ---------------- */
function StatusSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-32 text-[12px]">
      {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
    </Select>
  )
}

function AttachmentsEditor({ entityType, entityId, onChanged }: { entityType: string; entityId: string; onChanged: () => void }) {
  const { data, loading, reload } = useAsyncData(() => fetchAttachments(entityType, entityId), [entityType, entityId])
  const [fileRef, setFileRef] = useState<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const setRef = (el: HTMLInputElement | null) => { setFileRef(el) }

  const upload = async (file: File | null) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) { toast.error('File exceeds the 10 MB limit.'); return }
    setBusy(true)
    try {
      await attachToEntity({ entityType: entityType as any, entityId, label: file.name, file })
      await reload()
      onChanged()
      toast.success('Attachment uploaded')
    } catch (e: any) { toast.error(e?.message ?? 'Upload failed.') }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-line-soft p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-faint">Attachments</p>
        <input ref={setRef} type="file" className="hidden" onChange={(e) => { void upload(e.target.files?.[0] ?? null); e.target.value = '' }} />
        <Button size="sm" variant="secondary" loading={busy} onClick={() => fileRef?.click()}><Upload size={12} /> Add file</Button>
      </div>
      {loading && <Spinner />}
      <div className="space-y-1.5">
        {(data ?? []).map((a: any) => (
          <div key={a.id} className="flex items-center gap-2 rounded-md border border-line-soft px-2.5 py-1.5">
            <FileText size={12} className="shrink-0 text-faint" />
            <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{a.label}</span>
            <button onClick={async () => { try { window.open(await signedUrl(a.storage_path), '_blank', 'noopener') } catch (e: any) { toast.error(e?.message ?? 'Could not open.') } }}
              className="text-[11px] text-accent hover:underline">open</button>
            <button onClick={async () => { await deleteAttachment(a.id); await reload(); onChanged() }}
              className="text-[11px] text-faint hover:text-danger" aria-label="Remove attachment"><X size={12} /></button>
          </div>
        ))}
        {!loading && (data ?? []).length === 0 && <p className="text-[11.5px] text-faint">No attachments.</p>}
      </div>
    </div>
  )
}

/* ===================== Assignments ===================== */
export function AdminAssignments() {
  const [params] = useSearchParams()
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [assignments, subjects, semesters] = await Promise.all([
      fetchAssignments({ includeArchived: true, limit: 500 }), fetchSubjects(), fetchSemesters(),
    ])
    return { assignments, subjects, semesters }
  }, [])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [form, setForm] = useState<null | Record<string, any>>(null)
  const [confirm, setConfirm] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => (data?.assignments ?? []).filter((a: any) =>
    (!q || `${a.title} ${a.code ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (!status || a.status === status)), [data, q, status])

  const openNew = () => setForm({
    title: '', code: '', description: '', subject_id: '', semester_id: '', kind: 'assignment',
    instructions: '', links: '', publish_date: new Date().toISOString().slice(0, 10),
    deadline: '', priority: 'medium', status: 'draft', isNew: true, id: null,
  })

  const openEdit = (a: any) => setForm({
    id: a.id, isNew: false, title: a.title, code: a.code ?? '', description: a.description ?? '',
    subject_id: a.subject_id ?? '', semester_id: a.semester_id ?? '', kind: a.kind,
    instructions: a.instructions ?? '', links: (a.reference_links ?? []).join('\n'),
    publish_date: a.publish_date ?? '', deadline: toLocal(a.deadline), priority: a.priority, status: a.status,
  })

  const save = async () => {
    const f = form!
    if (!f.title.trim()) { toast.error('Title is required.'); return }
    if (!f.deadline) { toast.error('A deadline is required.'); return }
    const deadline = new Date(f.deadline)
    if (Number.isNaN(deadline.getTime())) { toast.error('Invalid deadline date.'); return }
    if (f.publish_date && deadline < new Date(f.publish_date)) { toast.error('Deadline cannot be before the publication date.'); return }
    setBusy(true)
    try {
      const links = (f.links as string).split('\n').map((l) => l.trim()).filter((l) => l.length > 0)
      for (const l of links) if (!/^https?:\/\//i.test(l)) { throw new Error(`"${l}" is not a valid http(s) link.`) }
      const payload = {
        title: f.title.trim(), code: f.code.trim() || null, description: f.description,
        subject_id: f.subject_id || null, semester_id: f.semester_id || null, kind: f.kind,
        instructions: f.instructions || null, reference_links: links,
        publish_date: f.publish_date || null, deadline: deadline.toISOString(),
        priority: f.priority, status: f.status,
      }
      if (f.isNew) await adminCreate('assignments', payload)
      else await adminUpdate('assignments', f.id, payload)
      toast.success(f.isNew ? 'Assignment created' : 'Assignment updated')
      setForm(null)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Save failed.') }
    finally { setBusy(false) }
  }

  const quickStatus = async (a: any, next: string) => {
    try {
      await adminUpdate('assignments', a.id, {
        status: next,
        archived_at: next === 'archived' ? new Date().toISOString() : null,
      })
      toast.success(`Status changed to ${titleCase(next)}`)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Update failed.') }
  }

  if (loading) return <TableSkeleton rows={8} cols={5} />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search assignments…" className="min-w-[200px] flex-1" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
          <Button variant="primary" size="sm" onClick={openNew}><Plus size={13} /> New assignment</Button>
        </div>
        <div className="divide-y divide-line-soft">
          {rows.length === 0 && <EmptyState title="No assignments" message="Publish the first assignment for your students." />}
          {rows.map((a: any) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-medium text-ink">{a.title}</p>
                  {a.code && <Badge tone="neutral">{a.code}</Badge>}
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                  {new Date(a.deadline) < new Date() && a.status === 'published' && <Badge tone="danger">past deadline</Badge>}
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                  {a.subjects && <span className="text-accent/90">{a.subjects.code}</span>}
                  <span>due {friendlyDate(a.deadline)}</span>
                  <span>{titleCase(a.priority)}</span>
                  <span>updated {formatDistanceToNowStrict(new Date(a.updated_at), { addSuffix: true })}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusSelect value={a.status} onChange={(v) => quickStatus(a, v)} />
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(a)}><Pencil size={13} /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirm(a)}><Trash2 size={13} /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <AdminEditorShell
        open={!!form} title={form?.isNew ? 'New assignment' : 'Edit assignment'}
        description={form?.status === 'published' ? 'Students see this immediately. Deadline changes sync to imported tasks.' : 'Drafts are invisible to students.'}
        onClose={() => setForm(null)} onSubmit={save} busy={busy}
        submitLabel={form?.isNew ? 'Create' : 'Save changes'}
      >
        {form && (
          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Normalisation Assignment" /></Field>
              <Field label="Code" hint="optional"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="DBMS-01" /></Field>
              <Field label="Type">
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {['assignment', 'project', 'lab', 'presentation', 'essay', 'other'].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
                </Select>
              </Field>
              <Field label="Subject">
                <Select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                  <option value="">None</option>
                  {(data?.subjects ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </Select>
              </Field>
              <Field label="Semester">
                <Select value={form.semester_id} onChange={(e) => setForm({ ...form, semester_id: e.target.value })}>
                  <option value="">None</option>
                  {(data?.semesters ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Publication date"><Input type="date" value={form.publish_date} onChange={(e) => setForm({ ...form, publish_date: e.target.value })} /></Field>
              <Field label="Deadline"><Input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></Field>
              <Field label="Priority">
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
            <Field label="Instructions" hint="optional"><Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></Field>
            <Field label="Reference links" hint="one URL per line, optional"><Textarea value={form.links} onChange={(e) => setForm({ ...form, links: e.target.value })} className="min-h-[60px] font-mono text-[12px]" placeholder="https://" /></Field>
            {!form.isNew && <AttachmentsEditor entityType="assignment" entityId={form.id} onChanged={() => void reload()} />}
          </div>
        )}
      </AdminEditorShell>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy}
        title="Delete assignment?"
        message={`"${confirm?.title}" will be removed for every student. Consider archiving instead — imported tasks keep their personal progress either way.`}
        onConfirm={async () => {
          setBusy(true)
          try { await adminDelete('assignments', confirm.id); setConfirm(null); await reload(); toast.success('Deleted') }
          catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
          finally { setBusy(false) }
        }} />
      {params.get('edit') && null}
    </div>
  )
}

/* ===================== Assessments ===================== */
export function AdminAssessments() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [assessments, subjects, semesters] = await Promise.all([
      fetchAssessments({ includeArchived: true, limit: 500 }), fetchSubjects(), fetchSemesters(),
    ])
    return { assessments, subjects, semesters }
  }, [])
  const [q, setQ] = useState('')
  const [form, setForm] = useState<null | Record<string, any>>(null)
  const [confirm, setConfirm] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = (data?.assessments ?? []).filter((a: any) =>
    !q || `${a.title}`.toLowerCase().includes(q.toLowerCase()))

  const openNew = () => setForm({
    isNew: true, id: null, title: '', kind: 'quiz', subject_id: '', semester_id: '',
    starts_at: '', duration_minutes: '60', syllabus_coverage: '', instructions: '',
    links: '', venue: '', status: 'draft',
  })
  const openEdit = (a: any) => setForm({
    isNew: false, id: a.id, title: a.title, kind: a.kind, subject_id: a.subject_id ?? '',
    semester_id: a.semester_id ?? '', starts_at: toLocal(a.starts_at),
    duration_minutes: a.duration_minutes ? String(a.duration_minutes) : '',
    syllabus_coverage: a.syllabus_coverage ?? '', instructions: a.instructions ?? '',
    links: (a.reference_links ?? []).join('\n'), venue: a.venue ?? '', status: a.status,
  })

  const save = async () => {
    const f = form!
    if (!f.title.trim()) { toast.error('Title is required.'); return }
    if (!f.starts_at) { toast.error('Date and time are required.'); return }
    const starts = new Date(f.starts_at)
    if (Number.isNaN(starts.getTime())) { toast.error('Invalid date.'); return }
    if (f.duration_minutes && Number(f.duration_minutes) <= 0) { toast.error('Duration must be a positive number of minutes.'); return }
    setBusy(true)
    try {
      const links = (f.links as string).split('\n').map((l) => l.trim()).filter(Boolean)
      const payload = {
        title: f.title.trim(), kind: f.kind, subject_id: f.subject_id || null, semester_id: f.semester_id || null,
        starts_at: starts.toISOString(), duration_minutes: f.duration_minutes ? Number(f.duration_minutes) : null,
        syllabus_coverage: f.syllabus_coverage || null, instructions: f.instructions || null,
        reference_links: links, venue: f.venue || null, status: f.status,
      }
      if (f.isNew) await adminCreate('assessments', payload)
      else await adminUpdate('assessments', f.id, payload)
      toast.success(f.isNew ? 'Assessment created' : 'Assessment updated')
      setForm(null)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Save failed.') }
    finally { setBusy(false) }
  }

  if (loading) return <TableSkeleton rows={6} cols={5} />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search quizzes and exams…" className="min-w-[200px] flex-1" />
          <Button variant="primary" size="sm" onClick={openNew}><Plus size={13} /> New quiz / exam</Button>
        </div>
        <div className="divide-y divide-line-soft">
          {rows.length === 0 && <EmptyState title="No assessments" message="Create quizzes, mid-terms and exams here." />}
          {rows.map((a: any) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-medium text-ink">{a.title}</p>
                  <Badge tone="info">{titleCase(a.kind)}</Badge>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                </div>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-faint">
                  {a.subjects && <span className="text-accent/90">{a.subjects.code}</span>}
                  <span>{friendlyDate(a.starts_at)}</span>
                  {a.duration_minutes && <span>{a.duration_minutes} min</span>}
                  {a.venue && <span>{a.venue}</span>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusSelect value={a.status} onChange={async (v) => {
                  await adminUpdate('assessments', a.id, { status: v, archived_at: v === 'archived' ? new Date().toISOString() : null })
                  await reload(); toast.success(`Status changed to ${titleCase(v)}`)
                }} />
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(a)}><Pencil size={13} /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirm(a)}><Trash2 size={13} /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <AdminEditorShell open={!!form} title={form?.isNew ? 'New quiz / exam' : 'Edit assessment'} onClose={() => setForm(null)} onSubmit={save} busy={busy} submitLabel={form?.isNew ? 'Create' : 'Save'}>
        {form && (
          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="DBMS Unit 1 Quiz" /></Field>
              <Field label="Kind">
                <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {['quiz', 'test', 'exam', 'midterm', 'viva', 'lab_exam'].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
              <Field label="Subject">
                <Select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                  <option value="">None</option>
                  {(data?.subjects ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </Select>
              </Field>
              <Field label="Semester">
                <Select value={form.semester_id} onChange={(e) => setForm({ ...form, semester_id: e.target.value })}>
                  <option value="">None</option>
                  {(data?.semesters ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Date and time"><Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></Field>
              <Field label="Duration (minutes)" hint="optional"><Input type="number" min={1} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></Field>
              <Field label="Venue" hint="optional"><Input value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} placeholder="LH-302" /></Field>
            </div>
            <Field label="Syllabus coverage" hint="optional"><Input value={form.syllabus_coverage} onChange={(e) => setForm({ ...form, syllabus_coverage: e.target.value })} placeholder="Unit 1: Relational Model" /></Field>
            <Field label="Instructions" hint="optional"><Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} /></Field>
            <Field label="Reference links" hint="one URL per line, optional"><Textarea value={form.links} onChange={(e) => setForm({ ...form, links: e.target.value })} className="min-h-[60px] font-mono text-[12px]" /></Field>
            {!form.isNew && <AttachmentsEditor entityType="assessment" entityId={form.id} onChanged={() => void reload()} />}
          </div>
        )}
      </AdminEditorShell>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy}
        title="Delete assessment?" message={`"${confirm?.title}" will be removed for every student. Archiving keeps personal history intact.`}
        onConfirm={async () => {
          setBusy(true)
          try { await adminDelete('assessments', confirm.id); setConfirm(null); await reload(); toast.success('Deleted') }
          catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
          finally { setBusy(false) }
        }} />
    </div>
  )
}

/* ===================== Announcements ===================== */
export function AdminAnnouncements() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [announcements, semesters] = await Promise.all([fetchAnnouncements({ includeUnpublished: true, limit: 200 }), fetchSemesters()])
    return { announcements, semesters }
  }, [])
  const [q, setQ] = useState('')
  const [form, setForm] = useState<null | Record<string, any>>(null)
  const [confirm, setConfirm] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = (data?.announcements ?? []).filter((a: any) => !q || a.title.toLowerCase().includes(q.toLowerCase()))

  const openNew = () => setForm({
    isNew: true, id: null, title: '', body: '', category: 'notice', audience: 'all',
    audience_semester_id: '', is_pinned: false, status: 'draft',
  })
  const openEdit = (a: any) => setForm({
    isNew: false, id: a.id, title: a.title, body: a.body, category: a.category,
    audience: a.audience, audience_semester_id: a.audience_semester_id ?? '',
    is_pinned: a.is_pinned, status: a.status,
  })

  const save = async () => {
    const f = form!
    if (!f.title.trim()) { toast.error('Title is required.'); return }
    if (!f.body.trim()) { toast.error('Body is required.'); return }
    if (f.audience === 'semester' && !f.audience_semester_id) { toast.error('Choose a semester for the audience.'); return }
    setBusy(true)
    try {
      const payload = {
        title: f.title.trim(), body: f.body, category: f.category, audience: f.audience,
        audience_semester_id: f.audience === 'semester' ? f.audience_semester_id : null,
        is_pinned: f.is_pinned, status: f.status,
      }
      if (f.isNew) await adminCreate('announcements', payload)
      else await adminUpdate('announcements', f.id, payload)
      toast.success(f.status === 'published' ? 'Published — students notified' : 'Saved')
      setForm(null)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Save failed.') }
    finally { setBusy(false) }
  }

  if (loading) return <TableSkeleton rows={5} cols={4} />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search announcements…" className="min-w-[200px] flex-1" />
          <Button variant="primary" size="sm" onClick={openNew}><Plus size={13} /> New announcement</Button>
        </div>
        <div className="divide-y divide-line-soft">
          {rows.length === 0 && <EmptyState title="No announcements" message="Publish notices, class updates and exam information." />}
          {rows.map((a: any) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {a.is_pinned && <Badge tone="accent">pinned</Badge>}
                  <p className="truncate text-[13px] font-medium text-ink">{a.title}</p>
                  <Badge tone={a.category === 'urgent' ? 'danger' : 'neutral'}>{a.category}</Badge>
                  <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[11.5px] text-faint">
                  {a.body} · {formatDistanceToNowStrict(new Date(a.publish_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {a.status !== 'published' && (
                  <Button size="sm" variant="primary" onClick={async () => { await adminUpdate('announcements', a.id, { status: 'published' }); await reload(); toast.success('Published — students notified') }}>
                    <Send size={12} /> Publish
                  </Button>
                )}
                <StatusSelect value={a.status} onChange={async (v) => { await adminUpdate('announcements', a.id, { status: v }); await reload() }} />
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(a)}><Pencil size={13} /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirm(a)}><Trash2 size={13} /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <AdminEditorShell open={!!form} title={form?.isNew ? 'New announcement' : 'Edit announcement'}
        description="Publishing fans out in-app notifications to the targeted audience instantly."
        onClose={() => setForm(null)} onSubmit={save} busy={busy} submitLabel={form?.status === 'published' ? 'Publish' : 'Save'}>
        {form && (
          <div className="space-y-3.5">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Body"><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="min-h-[120px]" /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Category">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {['notice', 'class', 'academic', 'schedule', 'event', 'exam', 'urgent'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                </Select>
              </Field>
              <Field label="Audience">
                <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}>
                  {['all', 'students', 'admins', 'semester'].map((a) => <option key={a} value={a}>{titleCase(a)}</option>)}
                </Select>
              </Field>
              {form.audience === 'semester' && (
                <Field label="Semester">
                  <Select value={form.audience_semester_id} onChange={(e) => setForm({ ...form, audience_semester_id: e.target.value })}>
                    <option value="">Choose…</option>
                    {(data?.semesters ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Switch checked={form.is_pinned} onChange={(v) => setForm({ ...form, is_pinned: v })} label="Pin to top" />
              <div className="w-40">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="h-8 text-[12px]">
                  {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </div>
            </div>
            {!form.isNew && <AttachmentsEditor entityType="announcement" entityId={form.id} onChanged={() => void reload()} />}
          </div>
        )}
      </AdminEditorShell>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy}
        title="Delete announcement?" message={`"${confirm?.title}" and its notifications will be removed.`}
        onConfirm={async () => {
          setBusy(true)
          try { await adminDelete('announcements', confirm.id); setConfirm(null); await reload(); toast.success('Deleted') }
          catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
          finally { setBusy(false) }
        }} />
    </div>
  )
}

/* ===================== Opportunities ===================== */
export function AdminOpportunities() {
  const { data, loading, error, reload } = useAsyncData(() => fetchOpportunities({ includeArchived: true, limit: 300 }), [])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const [form, setForm] = useState<null | Record<string, any>>(null)
  const [confirm, setConfirm] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = (data ?? []).filter((o: any) =>
    (!q || `${o.title} ${o.organization}`.toLowerCase().includes(q.toLowerCase())) &&
    (!category || o.category === category))

  const openNew = () => setForm({
    isNew: true, id: null, title: '', category: 'internship', organization: '', role: '',
    eligibility: '', description: '', apply_url: '', application_deadline: '',
    publish_date: new Date().toISOString().slice(0, 10), location: '', stipend: '', status: 'draft',
  })
  const openEdit = (o: any) => setForm({
    isNew: false, id: o.id, title: o.title, category: o.category, organization: o.organization,
    role: o.role ?? '', eligibility: o.eligibility ?? '', description: o.description ?? '',
    apply_url: o.apply_url ?? '', application_deadline: o.application_deadline ? toLocal(o.application_deadline) : '',
    publish_date: o.publish_date ?? '', location: o.location ?? '', stipend: o.stipend ?? '', status: o.status,
  })

  const save = async () => {
    const f = form!
    if (!f.title.trim()) { toast.error('Title is required.'); return }
    if (!f.organization.trim()) { toast.error('Organization is required.'); return }
    if (f.apply_url && !/^https?:\/\//i.test(f.apply_url)) { toast.error('Application URL must start with http(s)://'); return }
    setBusy(true)
    try {
      const payload = {
        title: f.title.trim(), category: f.category, organization: f.organization.trim(),
        role: f.role || null, eligibility: f.eligibility || null, description: f.description,
        apply_url: f.apply_url || null,
        application_deadline: f.application_deadline ? new Date(f.application_deadline).toISOString() : null,
        publish_date: f.publish_date || null, location: f.location || null, stipend: f.stipend || null,
        status: f.status,
      }
      if (f.isNew) await adminCreate('opportunities', payload)
      else await adminUpdate('opportunities', f.id, payload)
      toast.success(f.isNew ? 'Opportunity created' : 'Opportunity updated')
      setForm(null)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Save failed.') }
    finally { setBusy(false) }
  }

  if (loading) return <TableSkeleton rows={6} cols={4} />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search opportunities…" className="min-w-[200px] flex-1" />
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-44">
            <option value="">All categories</option>
            {['internship', 'placement', 'hackathon', 'workshop', 'scholarship', 'competition', 'conference', 'chapter_event'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </Select>
          <Button variant="primary" size="sm" onClick={openNew}><Plus size={13} /> New opportunity</Button>
        </div>
        <div className="divide-y divide-line-soft">
          {rows.length === 0 && <EmptyState title="No opportunities" message="Publish internships, placements, hackathons and more." />}
          {rows.map((o: any) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-medium text-ink">{o.title}</p>
                  <Badge tone="info">{titleCase(o.category)}</Badge>
                  <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-faint">
                  {o.organization}{o.role ? ` · ${o.role}` : ''}{o.application_deadline ? ` · apply by ${friendlyDate(o.application_deadline)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusSelect value={o.status} onChange={async (v) => {
                  await adminUpdate('opportunities', o.id, { status: v, archived_at: v === 'archived' ? new Date().toISOString() : null })
                  await reload(); toast.success(`Status changed to ${titleCase(v)}`)
                }} />
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(o)}><Pencil size={13} /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirm(o)}><Trash2 size={13} /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <AdminEditorShell open={!!form} title={form?.isNew ? 'New opportunity' : 'Edit opportunity'} onClose={() => setForm(null)} onSubmit={save} busy={busy} submitLabel={form?.isNew ? 'Create' : 'Save'}>
        {form && (
          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Backend Engineering Internship" /></Field>
              <Field label="Category">
                <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {['internship', 'placement', 'hackathon', 'workshop', 'scholarship', 'competition', 'conference', 'chapter_event'].map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
                </Select>
              </Field>
              <Field label="Organization"><Input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></Field>
              <Field label="Role" hint="optional"><Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></Field>
              <Field label="Location" hint="optional"><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></Field>
              <Field label="Application deadline"><Input type="datetime-local" value={form.application_deadline} onChange={(e) => setForm({ ...form, application_deadline: e.target.value })} /></Field>
              <Field label="Publish date"><Input type="date" value={form.publish_date} onChange={(e) => setForm({ ...form, publish_date: e.target.value })} /></Field>
              <Field label="Application URL" className="sm:col-span-2"><Input value={form.apply_url} onChange={(e) => setForm({ ...form, apply_url: e.target.value })} placeholder="https://" /></Field>
              <Field label="Eligibility" hint="optional"><Textarea value={form.eligibility} onChange={(e) => setForm({ ...form, eligibility: e.target.value })} /></Field>
              <Field label="Stipend" hint="optional"><Input value={form.stipend} onChange={(e) => setForm({ ...form, stipend: e.target.value })} /></Field>
            </div>
            <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-[100px]" /></Field>
            <div className="w-40">
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
            </div>
            {!form.isNew && <AttachmentsEditor entityType="opportunity" entityId={form.id} onChanged={() => void reload()} />}
          </div>
        )}
      </AdminEditorShell>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy}
        title="Delete opportunity?" message={`"${confirm?.title}" will be removed. Students' saved applications keep their private notes and status.`}
        onConfirm={async () => {
          setBusy(true)
          try { await adminDelete('opportunities', confirm.id); setConfirm(null); await reload(); toast.success('Deleted') }
          catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
          finally { setBusy(false) }
        }} />
    </div>
  )
}

function toLocal(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
