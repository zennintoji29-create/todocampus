import { useState } from 'react'
import { GraduationCap, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  adminCreate, adminDelete, adminUpdate, fetchSemesters, fetchSubjects, fetchUnits, fetchTopics,
} from '@/lib/api'
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Select,
  TableSkeleton, Textarea,
} from '@/components/ui'
import { useAsyncData } from '@/hooks/useAsyncData'

/* ============ generic editor helpers shared by admin pages ============ */
export function AdminEditorShell({ open, title, description, onClose, onSubmit, busy, submitLabel = 'Save', children, width = 'lg' }: {
  open: boolean; title: string; description?: string; onClose: () => void
  onSubmit: () => void; busy?: boolean; submitLabel?: string; children: React.ReactNode; width?: 'sm' | 'md' | 'lg'
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description} width={width}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={onSubmit}><Save size={13} /> {submitLabel}</Button></>}>
      {children}
    </Dialog>
  )
}

/* ===================== Semesters & Subjects ===================== */
export default function Curriculum() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [semesters, subjects] = await Promise.all([fetchSemesters(), fetchSubjects()])
    return { semesters, subjects }
  }, [])
  const [semesterForm, setSemesterForm] = useState<null | { id?: string; number: string; name: string; start_date: string; end_date: string; is_active: boolean }>(null)
  const [subjectForm, setSubjectForm] = useState<null | { id?: string; semester_id: string; code: string; name: string; credits: string; faculty: string; description: string; position: string }>(null)
  const [confirm, setConfirm] = useState<{ kind: 'semester' | 'subject'; id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const saveSemester = async () => {
    const f = semesterForm!
    const num = Number(f.number)
    if (!Number.isInteger(num) || num < 1 || num > 12) { toast.error('Semester number must be 1–12.'); return }
    if (f.start_date && f.end_date && f.end_date <= f.start_date) { toast.error('End date must be after the start date.'); return }
    setBusy(true)
    try {
      const payload = { number: num, name: f.name.trim() || `Semester ${num}`, start_date: f.start_date || null, end_date: f.end_date || null, is_active: f.is_active }
      if (f.id) await adminUpdate('semesters', f.id, payload)
      else await adminCreate('semesters', payload)
      toast.success(f.id ? 'Semester updated' : 'Semester created')
      setSemesterForm(null)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Save failed.') }
    finally { setBusy(false) }
  }

  const saveSubject = async () => {
    const f = subjectForm!
    if (!f.semester_id) { toast.error('Choose a semester.'); return }
    if (!f.code.trim() || !f.name.trim()) { toast.error('Code and name are required.'); return }
    setBusy(true)
    try {
      const payload = {
        semester_id: f.semester_id, code: f.code.trim().toUpperCase(), name: f.name.trim(),
        credits: f.credits ? Number(f.credits) : null, faculty: f.faculty || null,
        description: f.description || null, position: Number(f.position || 0),
      }
      if (f.id) await adminUpdate('subjects', f.id, payload)
      else await adminCreate('subjects', payload)
      toast.success(f.id ? 'Subject updated' : 'Subject created')
      setSubjectForm(null)
      await reload()
    } catch (e: any) {
      toast.error(e?.message?.includes('already exists') ? 'That subject code already exists in this semester.' : e?.message ?? 'Save failed.')
    }
    finally { setBusy(false) }
  }

  const destroy = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      await adminDelete(confirm.kind === 'semester' ? 'semesters' : 'subjects', confirm.id)
      toast.success('Deleted')
      setConfirm(null)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
    finally { setBusy(false) }
  }

  if (loading) return <TableSkeleton rows={6} cols={4} />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <div>
            <h3 className="text-[13px] font-semibold text-ink">Semesters</h3>
            <p className="text-[11px] text-faint">{data?.semesters.length ?? 0} total</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => setSemesterForm({ number: '', name: '', start_date: '', end_date: '', is_active: true })}>
            <Plus size={13} /> New semester
          </Button>
        </div>
        <div className="divide-y divide-line-soft">
          {(data?.semesters ?? []).map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-bg-2 text-[11px] font-semibold text-accent">{s.number}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{s.name}</p>
                <p className="text-[11px] text-faint">{s.start_date ?? '—'} → {s.end_date ?? '—'}</p>
              </div>
              {s.is_active ? <Badge tone="accent">active</Badge> : <Badge tone="neutral">inactive</Badge>}
              <Button variant="ghost" size="icon" aria-label="Edit semester" onClick={() => setSemesterForm({ id: s.id, number: String(s.number), name: s.name, start_date: s.start_date ?? '', end_date: s.end_date ?? '', is_active: s.is_active })}><Pencil size={13} /></Button>
              <Button variant="ghost" size="icon" aria-label="Delete semester" onClick={() => setConfirm({ kind: 'semester', id: s.id, name: s.name })}><Trash2 size={13} /></Button>
            </div>
          ))}
          {(data?.semesters ?? []).length === 0 && <EmptyState title="No semesters" message="Create the first semester to start building the curriculum." />}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <div>
            <h3 className="text-[13px] font-semibold text-ink">Subjects</h3>
            <p className="text-[11px] text-faint">Grouped by semester · {data?.subjects.length ?? 0} total</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => setSubjectForm({ semester_id: '', code: '', name: '', credits: '', faculty: '', description: '', position: '0' })}>
            <Plus size={13} /> New subject
          </Button>
        </div>
        <div className="divide-y divide-line-soft">
          {(data?.semesters ?? []).map((sem: any) => {
            const subs = (data?.subjects ?? []).filter((s: any) => s.semester_id === sem.id)
            return (
              <div key={sem.id} className="p-3">
                <p className="mb-2 flex items-center gap-2 text-[11.5px] font-medium text-faint">
                  <GraduationCap size={12} /> {sem.name}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {subs.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-lg border border-line-soft bg-bg-2 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-accent">{s.code}</p>
                        <p className="truncate text-[12.5px] text-ink">{s.name}</p>
                        {s.faculty && <p className="truncate text-[10.5px] text-faint">{s.faculty}</p>}
                      </div>
                      <div className="flex shrink-0 flex-col gap-0.5">
                        <Button variant="ghost" size="icon" aria-label="Edit subject" onClick={() => setSubjectForm({
                          id: s.id, semester_id: s.semester_id, code: s.code, name: s.name,
                          credits: s.credits != null ? String(s.credits) : '', faculty: s.faculty ?? '',
                          description: s.description ?? '', position: String(s.position ?? 0),
                        })}><Pencil size={12} /></Button>
                        <Button variant="ghost" size="icon" aria-label="Delete subject" onClick={() => setConfirm({ kind: 'subject', id: s.id, name: `${s.code} ${s.name}` })}><Trash2 size={12} /></Button>
                      </div>
                    </div>
                  ))}
                  {subs.length === 0 && <p className="text-[11.5px] text-faint">No subjects in this semester.</p>}
                </div>
              </div>
            )
          })}
          {(data?.subjects ?? []).length === 0 && <EmptyState title="No subjects" message="Create subjects and assign them to semesters." />}
        </div>
      </Card>

      <AdminEditorShell open={!!semesterForm} title={semesterForm?.id ? 'Edit semester' : 'New semester'} onClose={() => setSemesterForm(null)} onSubmit={saveSemester} busy={busy} width="md">
        {semesterForm && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Number" hint="1–12"><Input type="number" min={1} max={12} value={semesterForm.number} onChange={(e) => setSemesterForm({ ...semesterForm, number: e.target.value })} /></Field>
              <Field label="Name" hint="optional"><Input value={semesterForm.name} onChange={(e) => setSemesterForm({ ...semesterForm, name: e.target.value })} placeholder="Semester 5" /></Field>
              <Field label="Start date"><Input type="date" value={semesterForm.start_date} onChange={(e) => setSemesterForm({ ...semesterForm, start_date: e.target.value })} /></Field>
              <Field label="End date"><Input type="date" value={semesterForm.end_date} onChange={(e) => setSemesterForm({ ...semesterForm, end_date: e.target.value })} /></Field>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              <input type="checkbox" checked={semesterForm.is_active} onChange={(e) => setSemesterForm({ ...semesterForm, is_active: e.target.checked })} className="accent-[#22d3a5]" />
              Active semester (students see it first)
            </label>
          </div>
        )}
      </AdminEditorShell>

      <AdminEditorShell open={!!subjectForm} title={subjectForm?.id ? 'Edit subject' : 'New subject'} onClose={() => setSubjectForm(null)} onSubmit={saveSubject} busy={busy}>
        {subjectForm && (
          <div className="space-y-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Semester">
                <Select value={subjectForm.semester_id} onChange={(e) => setSubjectForm({ ...subjectForm, semester_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {(data?.semesters ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <Field label="Code" hint="e.g. CS301"><Input value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} /></Field>
              <Field label="Name" className="sm:col-span-2"><Input value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} placeholder="Database Management Systems" /></Field>
              <Field label="Credits" hint="optional"><Input type="number" step="0.5" min={0} value={subjectForm.credits} onChange={(e) => setSubjectForm({ ...subjectForm, credits: e.target.value })} /></Field>
              <Field label="Faculty"><Input value={subjectForm.faculty} onChange={(e) => setSubjectForm({ ...subjectForm, faculty: e.target.value })} /></Field>
              <Field label="Position" hint="ordering"><Input type="number" value={subjectForm.position} onChange={(e) => setSubjectForm({ ...subjectForm, position: e.target.value })} /></Field>
            </div>
            <Field label="Description" hint="optional"><Textarea value={subjectForm.description} onChange={(e) => setSubjectForm({ ...subjectForm, description: e.target.value })} /></Field>
          </div>
        )}
      </AdminEditorShell>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy} onConfirm={destroy}
        title="Delete permanently?"
        message={`“${confirm?.name}” and everything under it (subjects, units, topics, official progress references) will be removed. Students' personal progress rows referencing these topics are preserved.`} />
    </div>
  )
}

/* ===================== Syllabus units & topics ===================== */
export function AdminSyllabus() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [subjects, units, topics] = await Promise.all([fetchSubjects(), fetchUnits(), fetchTopics()])
    return { subjects, units, topics }
  }, [])
  const [unitForm, setUnitForm] = useState<null | { id?: string; subject_id: string; unit_number: string; title: string; description: string }>(null)
  const [topicForm, setTopicForm] = useState<null | { id?: string; unit_id: string; title: string; details: string; outcomes: string; est_minutes: string; is_optional: boolean; position: string }>(null)
  const [confirm, setConfirm] = useState<{ table: string; id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const saveUnit = async () => {
    const f = unitForm!
    if (!f.subject_id) { toast.error('Choose a subject.'); return }
    const n = Number(f.unit_number)
    if (!Number.isInteger(n) || n < 1) { toast.error('Unit number must be a positive integer.'); return }
    if (!f.title.trim()) { toast.error('Unit title is required.'); return }
    setBusy(true)
    try {
      const payload = { subject_id: f.subject_id, unit_number: n, title: f.title.trim(), description: f.description || null }
      if (f.id) await adminUpdate('syllabus_units', f.id, payload)
      else await adminCreate('syllabus_units', payload)
      toast.success(f.id ? 'Unit updated' : 'Unit created')
      setUnitForm(null)
      await reload()
    } catch (e: any) {
      toast.error(e?.message?.includes('already exists') ? 'That unit number already exists for this subject.' : e?.message ?? 'Save failed.')
    } finally { setBusy(false) }
  }

  const saveTopic = async () => {
    const f = topicForm!
    if (!f.unit_id) { toast.error('Choose a unit.'); return }
    if (!f.title.trim()) { toast.error('Topic title is required.'); return }
    setBusy(true)
    try {
      const payload = {
        unit_id: f.unit_id, title: f.title.trim(), details: f.details || null, outcomes: f.outcomes || null,
        est_minutes: f.est_minutes ? Number(f.est_minutes) : null, is_optional: f.is_optional,
        position: Number(f.position || 0),
      }
      if (f.id) await adminUpdate('syllabus_topics', f.id, payload)
      else await adminCreate('syllabus_topics', payload)
      toast.success(f.id ? 'Topic updated' : 'Topic created')
      setTopicForm(null)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Save failed.') }
    finally { setBusy(false) }
  }

  const destroy = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      await adminDelete(confirm.table, confirm.id)
      toast.success('Deleted')
      setConfirm(null)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
    finally { setBusy(false) }
  }

  if (loading) return <TableSkeleton rows={8} cols={4} />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  const unitsBySubject = new Map<string, any[]>()
  for (const u of data?.units ?? []) {
    const k = u.subject_id
    ;(unitsBySubject.get(k) ?? unitsBySubject.set(k, []).get(k)!).push(u)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-faint">{data?.units.length ?? 0} units · {data?.topics.length ?? 0} topics. Students track completion privately; this is the official syllabus.</p>
        <Button size="sm" variant="primary" onClick={() => setUnitForm({ subject_id: '', unit_number: '', title: '', description: '' })}><Plus size={13} /> New unit</Button>
      </div>

      {(data?.subjects ?? []).map((s: any) => {
        const units = (unitsBySubject.get(s.id) ?? []).sort((a: any, b: any) => a.unit_number - b.unit_number)
        return (
          <Card key={s.id}>
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-2.5">
              <p className="text-[13px] font-semibold text-ink"><span className="text-accent">{s.code}</span> — {s.name}</p>
              <Button size="sm" variant="secondary" onClick={() => setUnitForm({ subject_id: s.id, unit_number: '', title: '', description: '' })}><Plus size={12} /> Unit</Button>
            </div>
            <div className="divide-y divide-line-soft">
              {units.length === 0 && <p className="px-4 py-4 text-[12px] text-faint">No units yet.</p>}
              {units.map((u: any) => {
                const topics = (data?.topics ?? []).filter((t: any) => t.unit_id === u.id).sort((a: any, b: any) => a.position - b.position)
                return (
                  <div key={u.id} className="p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="info">Unit {u.unit_number}</Badge>
                      <p className="min-w-0 flex-1 truncate text-[13px] text-ink">{u.title}</p>
                      <Button variant="ghost" size="icon" aria-label="Edit unit" onClick={() => setUnitForm({ id: u.id, subject_id: u.subject_id, unit_number: String(u.unit_number), title: u.title, description: u.description ?? '' })}><Pencil size={12} /></Button>
                      <Button variant="ghost" size="icon" aria-label="Delete unit" onClick={() => setConfirm({ table: 'syllabus_units', id: u.id, name: `Unit ${u.unit_number}: ${u.title}` })}><Trash2 size={12} /></Button>
                    </div>
                    {u.description && <p className="mt-1 text-[11.5px] text-faint">{u.description}</p>}
                    <div className="mt-2 space-y-1.5">
                      {topics.map((t: any) => (
                        <div key={t.id} className="flex items-center gap-2.5 rounded-md border border-line-soft bg-bg-2/50 px-2.5 py-1.5">
                          {t.is_optional && <Badge tone="warn">optional</Badge>}
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{t.title}</span>
                          {t.est_minutes && <span className="shrink-0 text-[10.5px] text-faint">{t.est_minutes}m</span>}
                          <Button variant="ghost" size="icon" aria-label="Edit topic" onClick={() => setTopicForm({
                            id: t.id, unit_id: t.unit_id, title: t.title, details: t.details ?? '',
                            outcomes: t.outcomes ?? '', est_minutes: t.est_minutes ? String(t.est_minutes) : '',
                            is_optional: t.is_optional, position: String(t.position ?? 0),
                          })}><Pencil size={11} /></Button>
                          <Button variant="ghost" size="icon" aria-label="Delete topic" onClick={() => setConfirm({ table: 'syllabus_topics', id: t.id, name: t.title })}><Trash2 size={11} /></Button>
                        </div>
                      ))}
                      <Button variant="ghost" size="sm" onClick={() => setTopicForm({ unit_id: u.id, title: '', details: '', outcomes: '', est_minutes: '', is_optional: false, position: String(topics.length + 1) })}>
                        <Plus size={11} /> Add topic
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}

      <AdminEditorShell open={!!unitForm} title={unitForm?.id ? 'Edit unit' : 'New unit'} onClose={() => setUnitForm(null)} onSubmit={saveUnit} busy={busy} width="md">
        {unitForm && (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Subject">
                <Select value={unitForm.subject_id} onChange={(e) => setUnitForm({ ...unitForm, subject_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {(data?.subjects ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </Select>
              </Field>
              <Field label="Unit number"><Input type="number" min={1} value={unitForm.unit_number} onChange={(e) => setUnitForm({ ...unitForm, unit_number: e.target.value })} /></Field>
            </div>
            <Field label="Title"><Input value={unitForm.title} onChange={(e) => setUnitForm({ ...unitForm, title: e.target.value })} placeholder="Relational Model" /></Field>
            <Field label="Description" hint="optional"><Textarea value={unitForm.description} onChange={(e) => setUnitForm({ ...unitForm, description: e.target.value })} /></Field>
          </div>
        )}
      </AdminEditorShell>

      <AdminEditorShell open={!!topicForm} title={topicForm?.id ? 'Edit topic' : 'New topic'} onClose={() => setTopicForm(null)} onSubmit={saveTopic} busy={busy} width="md">
        {topicForm && (
          <div className="space-y-3.5">
            <Field label="Unit">
              <Select value={topicForm.unit_id} onChange={(e) => setTopicForm({ ...topicForm, unit_id: e.target.value })}>
                <option value="">Choose…</option>
                {(data?.units ?? []).sort((a: any, b: any) => a.unit_number - b.unit_number).map((u: any) => {
                  const subj = (data?.subjects ?? []).find((s: any) => s.id === u.subject_id)
                  return <option key={u.id} value={u.id}>{subj?.code} · Unit {u.unit_number}: {u.title}</option>
                })}
              </Select>
            </Field>
            <Field label="Title"><Input value={topicForm.title} onChange={(e) => setTopicForm({ ...topicForm, title: e.target.value })} placeholder="Entity-Relationship modelling" /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Est. minutes" hint="optional"><Input type="number" min={1} value={topicForm.est_minutes} onChange={(e) => setTopicForm({ ...topicForm, est_minutes: e.target.value })} /></Field>
              <Field label="Position"><Input type="number" value={topicForm.position} onChange={(e) => setTopicForm({ ...topicForm, position: e.target.value })} /></Field>
              <div className="pt-5">
                <label className="flex items-center gap-2 text-[12.5px] text-muted">
                  <input type="checkbox" checked={topicForm.is_optional} onChange={(e) => setTopicForm({ ...topicForm, is_optional: e.target.checked })} className="accent-[#22d3a5]" />
                  Optional topic
                </label>
              </div>
            </div>
            <Field label="Details" hint="optional"><Textarea value={topicForm.details} onChange={(e) => setTopicForm({ ...topicForm, details: e.target.value })} /></Field>
            <Field label="Learning outcomes" hint="optional"><Textarea value={topicForm.outcomes} onChange={(e) => setTopicForm({ ...topicForm, outcomes: e.target.value })} /></Field>
          </div>
        )}
      </AdminEditorShell>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy} onConfirm={destroy}
        title="Delete permanently?" message={`“${confirm?.name}” will be removed from the official syllabus.`} />
    </div>
  )
}
