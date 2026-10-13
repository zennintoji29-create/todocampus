import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Check, ChevronRight, CloudOff, Download, Filter, ListChecks, Plus, Save, Trash2, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useDebounced } from '@/hooks/useDebounced'
import {
  addSubtask, createTask, deleteSubtask, deleteTask, fetchAttachments, fetchSubtasks, fetchSubjects,
  fetchTasks, signedUrl, updateSubtask, updateTask,
} from '@/lib/api'
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, Menu,
  SearchInput, Select, Switch, TableSkeleton, Textarea,
} from '@/components/ui'
import { DeadlineChip, PriorityPill, SOURCE_META, SourceMissingBanner, StatTile, StatusPill, SyncedAt, friendlyDate } from '@/components/shared'
import { deadlineState, type Priority, type TaskStatus } from '@/lib/domain'
import { cn, titleCase } from '@/lib/utils'

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'completed']

export default function Tasks() {
  const { user } = useAuth()
  const uid = user?.id
  const [params, setParams] = useSearchParams()
  const openId = params.get('task')

  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('')
  const [priority, setPriority] = useState('')
  const [status, setStatus] = useState('')
  const [source, setSource] = useState('')
  const [due, setDue] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const dq = useDebounced(q)

  const { data, loading, error, reload, setData } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [tasks, subjects] = await Promise.all([fetchTasks(uid), fetchSubjects()])
    return { tasks, subjects }
  }, [uid])

  const subjectsById = useMemo(() => new Map((data?.subjects ?? []).map((s: any) => [s.id, s])), [data])

  const rows = useMemo(() => {
    if (!data) return []
    const now = new Date()
    return data.tasks.filter((t: any) => {
      if (dq && !`${t.title} ${t.description ?? ''} ${subjectsById.get(t.subject_id)?.code ?? ''}`.toLowerCase().includes(dq.toLowerCase())) return false
      if (subject && t.subject_id !== subject) return false
      if (priority && t.priority !== priority) return false
      if (status && t.status !== status) return false
      if (source && t.source_type !== source) return false
      if (due) {
        const s = deadlineState({ ...t, deadline: t.deadline }, now)
        if (due === 'overdue' && s !== 'overdue') return false
        if (due === 'today' && s !== 'today') return false
        if (due === 'week' && !(s === 'soon' || s === 'today')) return false
      }
      return true
    })
  }, [data, dq, subject, priority, status, source, due, subjectsById])

  const stats = useMemo(() => {
    const now = new Date()
    const open = (data?.tasks ?? []).filter((t: any) => t.status !== 'completed')
    return {
      pending: open.length,
      overdue: open.filter((t: any) => t.deadline && new Date(t.deadline) < now).length,
      today: open.filter((t: any) => t.deadline && new Date(t.deadline).toDateString() === now.toDateString()).length,
      imported: (data?.tasks ?? []).filter((t: any) => t.source_type !== 'personal').length,
    }
  }, [data])

  const activeFilters = [subject, priority, status, source, due].filter(Boolean).length

  const setTask = async (id: string, patch: Record<string, unknown>, successMsg?: string) => {
    try {
      const updated = await updateTask(id, patch)
      setData((prev: any) => ({ ...prev, tasks: prev.tasks.map((t: any) => (t.id === id ? { ...t, ...updated } : t)) }))
      if (successMsg) toast.success(successMsg)
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not update the task.')
      void reload()
    }
  }

  const cycleStatus = (t: any) => {
    const next = STATUSES[(STATUSES.indexOf(t.status) + 1) % STATUSES.length]
    setTask(t.id, { status: next, completed_at: next === 'completed' ? new Date().toISOString() : null, started_at: next === 'in_progress' && !t.started_at ? new Date().toISOString() : t.started_at }, `Marked ${next.replace('_', ' ')}`)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Pending" value={stats.pending} icon={<ListChecks size={16} />} />
        <StatTile label="Due today" value={stats.today} tone={stats.today ? 'warn' : 'neutral'} icon={<Check size={16} />} />
        <StatTile label="Overdue" value={stats.overdue} tone={stats.overdue ? 'danger' : 'neutral'} icon={<CloudOff size={16} />} />
        <StatTile label="Imported" value={stats.imported} tone="info" icon={<Download size={16} />} hint="linked to official records" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search tasks…" className="min-w-[200px] flex-1" />
          <Button variant={activeFilters ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowFilters((s) => !s)}>
            <Filter size={13} /> Filters{activeFilters ? ` (${activeFilters})` : ''}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} /> New task</Button>
        </div>

        {showFilters && (
          <div className="grid gap-2.5 border-b border-line-soft bg-bg-2/40 p-3 sm:grid-cols-2 lg:grid-cols-5">
            <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">All subjects</option>
              {data?.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
            </Select>
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">Any priority</option>
              {(['urgent', 'high', 'medium', 'low'] as Priority[]).map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </Select>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Any source</option>
              {Object.entries(SOURCE_META).map(([k, v]) => <option key={k} value={k}>{(v as any).label}</option>)}
            </Select>
            <Select value={due} onChange={(e) => setDue(e.target.value)}>
              <option value="">Any deadline</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="week">Next 3 days</option>
            </Select>
            {activeFilters > 0 && (
              <Button size="sm" variant="ghost" className="justify-start" onClick={() => { setSubject(''); setPriority(''); setStatus(''); setSource(''); setDue('') }}>
                <X size={13} /> Clear filters
              </Button>
            )}
          </div>
        )}

        {loading && <TableSkeleton rows={6} cols={5} />}
        {error && <ErrorState message={error} onRetry={() => void reload()} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState
            title={activeFilters || q ? 'No tasks match these filters' : 'No tasks yet'}
            message={activeFilters || q ? 'Adjust or clear the filters above.' : 'Create a personal task, or import an official assignment from the Assignments feed.'}
            action={!activeFilters && !q ? <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} /> New task</Button> : undefined}
          />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="divide-y divide-line-soft">
            {rows.map((t: any) => (
              <div key={t.id} className={cn('group flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-bg-2/60', t.status === 'completed' && 'opacity-65')}>
                <button
                  onClick={() => cycleStatus(t)}
                  aria-label={`Set status (currently ${t.status.replace('_', ' ')})`}
                  className={cn('grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors',
                    t.status === 'completed' ? 'border-accent bg-accent text-bg-0'
                      : t.status === 'in_progress' ? 'border-info text-info' : 'border-line text-transparent hover:border-accent/60')}
                >
                  {t.status === 'completed' ? <Check size={12} /> : t.status === 'in_progress' ? <ChevronRight size={12} /> : null}
                </button>

                <button onClick={() => setParams({ task: t.id })} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn('truncate text-[13px] text-ink', t.status === 'completed' && 'line-through')}>{t.title}</span>
                    <Badge tone={SOURCE_META[t.source_type as keyof typeof SOURCE_META]?.tone ?? 'neutral'}>
                      {SOURCE_META[t.source_type as keyof typeof SOURCE_META]?.label ?? t.source_type}
                    </Badge>
                    {t.is_focus && <Badge tone="accent">focus</Badge>}
                    {t.source_unavailable && <Badge tone="warn">source archived</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {subjectsById.get(t.subject_id) && <span className="text-[11px] text-accent">{subjectsById.get(t.subject_id).code}</span>}
                    <PriorityPill priority={t.priority} />
                    <StatusPill status={t.status} />
                    <DeadlineChip task={{ ...t, deadline: t.deadline }} />
                  </div>
                </button>

                <Menu
                  trigger={<Button variant="ghost" size="icon" aria-label="Task actions">•••</Button>}
                  items={[
                    { label: 'Open details', onSelect: () => setParams({ task: t.id }), icon: <ChevronRight size={13} /> },
                    { label: t.is_focus ? 'Remove from focus' : 'Add to focus', onSelect: () => setTask(t.id, { is_focus: !t.is_focus }), icon: <Check size={13} /> },
                    ...(t.source_type !== 'personal' ? [{
                      label: 'Remove from workspace', onSelect: () => void unlink(t.id), icon: <Download size={13} />,
                    }] : []),
                    { label: 'Delete', onSelect: () => void destroy(t.id, t.title), icon: <Trash2 size={13} />, tone: 'danger' as const },
                  ]}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <TaskDetailDialog
        task={data?.tasks.find((t: any) => t.id === openId) ?? null}
        onClose={() => setParams({})}
        onChanged={() => { void reload() }}
      />

      <CreateTaskDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        subjects={data?.subjects ?? []}
        onCreated={async (payload) => {
          if (!uid) return
          const t = await createTask({
            user_id: uid, source_type: 'personal', title: payload.title,
            description: payload.description || null, deadline: payload.deadline,
            priority: payload.priority, subject_id: payload.subjectId || null,
            status: 'todo', reminder_minutes: payload.reminderMinutes ? Number(payload.reminderMinutes) : null,
          })
          setData((prev: any) => ({ ...prev, tasks: [t, ...prev.tasks] }))
          toast.success('Task created')
          setCreateOpen(false)
        }}
      />
    </div>
  )

  async function unlink(id: string) {
    try {
      await deleteTask(id)
      setData((prev: any) => ({ ...prev, tasks: prev.tasks.filter((t: any) => t.id !== id) }))
      toast.success('Removed from your workspace. The official record is untouched.')
    } catch (e: any) { toast.error(e?.message ?? 'Could not remove.') }
  }

  async function destroy(id: string, title: string) {
    if (!window.confirm(`Delete “${title}” and its subtasks? This cannot be undone.`)) return
    try {
      await deleteTask(id)
      setData((prev: any) => ({ ...prev, tasks: prev.tasks.filter((t: any) => t.id !== id) }))
      toast.success('Task deleted')
    } catch (e: any) { toast.error(e?.message ?? 'Could not delete.') }
  }
}

/* ---------------------------- create dialog ---------------------------- */
export function CreateTaskDialog({ open, onClose, subjects, onCreated, defaults }: {
  open: boolean; onClose: () => void
  subjects: { id: string; name: string; code: string }[]
  onCreated: (payload: Record<string, any>) => Promise<void>
  defaults?: Record<string, any>
}) {
  const [f, setF] = useState({ title: '', description: '', deadline: '', priority: 'medium', subjectId: '', reminderMinutes: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (open && defaults) setF((p) => ({ ...p, ...Object.fromEntries(Object.entries(defaults).filter(([, v]) => v)) }))
  }, [open, defaults])

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!f.title.trim()) e.title = 'Title is required.'
    if (f.deadline && Number.isNaN(new Date(f.deadline).getTime())) e.deadline = 'Invalid date.'
    if (f.deadline && new Date(f.deadline) < new Date(Date.now() - 864e5)) e.deadline = 'Deadline is in the past — pick a future date.'
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await onCreated({
        title: f.title.trim(), description: f.description, priority: f.priority,
        deadline: f.deadline ? new Date(f.deadline).toISOString() : null,
        subjectId: f.subjectId, reminderMinutes: f.reminderMinutes,
      })
      setF({ title: '', description: '', deadline: '', priority: 'medium', subjectId: '', reminderMinutes: '' })
      onClose()
    } catch (err: any) { toast.error(err?.message ?? 'Could not create the task.') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="New personal task" width="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}><Save size={13} /> Create task</Button></>}>
      <div className="space-y-3.5">
        <Field label="Title" error={errors.title}>
          <Input autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Complete normalisation assignment" />
        </Field>
        <Field label="Description" hint="optional">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Deadline" error={errors.deadline}>
            <Input type="datetime-local" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} />
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={(e) => set('priority', e.target.value)}>
              {(['low', 'medium', 'high', 'urgent'] as const).map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
            </Select>
          </Field>
          <Field label="Subject" hint="optional">
            <Select value={f.subjectId} onChange={(e) => set('subjectId', e.target.value)}>
              <option value="">None</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </Select>
          </Field>
          <Field label="Reminder" hint="minutes before deadline">
            <Select value={f.reminderMinutes} onChange={(e) => set('reminderMinutes', e.target.value)}>
              <option value="">None</option>
              <option value="0">At deadline</option>
              <option value="60">1 hour before</option>
              <option value="1440">1 day before</option>
            </Select>
          </Field>
        </div>
      </div>
    </Dialog>
  )
}

/* ---------------------------- detail dialog ---------------------------- */
export function TaskDetailDialog({ task, onClose, onChanged }: { task: any | null; onClose: () => void; onChanged?: () => void }) {
  const taskId = task?.id ?? null
  const [subtasks, setSubtasks] = useState<any[]>([])
  const [newSubtask, setNewSubtask] = useState('')
  const [notes, setNotes] = useState('')
  const [tab, setTab] = useState<'overview' | 'subtasks' | 'notes'>('overview')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<Priority>('medium')
  const [deadline, setDeadline] = useState('')
  const [reminder, setReminder] = useState('')
  const [isFocus, setIsFocus] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!task) return
    setTitle(task.title ?? '')
    setStatus(task.status ?? 'todo')
    setPriority(task.priority ?? 'medium')
    setDeadline(task.deadline ? toLocalInput(task.deadline) : '')
    setReminder(task.reminder_minutes == null ? '' : String(task.reminder_minutes))
    setIsFocus(!!task.is_focus)
    setNotes(task.personal_notes ?? '')
    setEditing(false)
    setTab('overview')
  }, [task])

  const { data: loaded } = useAsyncData(async () => (taskId ? fetchSubtasks(taskId) : []), [taskId])
  useEffect(() => { if (loaded) setSubtasks(loaded as any[]) }, [loaded])

  if (!task) return null

  const refreshSubs = async () => setSubtasks(await fetchSubtasks(taskId!) as any[])

  const patch = async (p: Record<string, unknown>, msg?: string) => {
    setBusy(true)
    try {
      await updateTask(task.id, p)
      onChanged?.()
      if (msg) toast.success(msg)
      setEditing(false)
    } catch (e: any) { toast.error(e?.message ?? 'Update failed.') }
    finally { setBusy(false) }
  }

  const addSub = async () => {
    if (!newSubtask.trim()) return
    try {
      await addSubtask(task.id, newSubtask.trim())
      await refreshSubs()
      setNewSubtask('')
    } catch (e: any) { toast.error(e?.message ?? 'Could not add the subtask.') }
  }

  const openOfficialFiles = async () => {
    if (!task.source_id) return
    try {
      const files = await fetchAttachments(task.source_type === 'assessment' ? 'assessment' : 'assignment', task.source_id)
      if (!files.length) { toast.info('No attachments on the official record.'); return }
      const url = await signedUrl(files[0].storage_path)
      window.open(url, '_blank', 'noopener')
    } catch (e: any) { toast.error(e?.message ?? 'Could not open the attachment.') }
  }

  return (
    <>
      <Dialog
        open onClose={onClose}
        title={editing ? 'Edit task' : task.title}
        description={task.source_type !== 'personal' ? 'Imported from an official record — official fields stay read-only.' : undefined}
        width="lg"
        footer={
          <>
            {task.source_type !== 'personal' && (
              <Button variant="secondary" className="mr-auto" onClick={openOfficialFiles}><Download size={13} /> Official files</Button>
            )}
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {editing
              ? <Button variant="primary" loading={busy} onClick={() => patch({
                  title: title.trim() || task.title, status, priority,
                  deadline: deadline ? new Date(deadline).toISOString() : null,
                  reminder_minutes: reminder === '' ? null : Number(reminder),
                  is_focus: isFocus,
                }, 'Task updated')}>Save changes</Button>
              : <Button variant="primary" onClick={() => setEditing(true)}>Edit task</Button>}
          </>
        }
      >
        <div className="space-y-4">
          <SourceMissingBanner unavailable={!!task.source_unavailable} />

          {editing ? (
            <div className="space-y-3.5">
              <Field label="Title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                    {STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                    {(['low', 'medium', 'high', 'urgent'] as const).map((p) => <option key={p} value={p}>{titleCase(p)}</option>)}
                  </Select>
                </Field>
                <Field label="Deadline">
                  <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
                </Field>
                <Field label="Reminder" hint="minutes before">
                  <Select value={reminder} onChange={(e) => setReminder(e.target.value)}>
                    <option value="">None</option>
                    <option value="0">At deadline</option>
                    <option value="60">1 hour before</option>
                    <option value="1440">1 day before</option>
                  </Select>
                </Field>
              </div>
              <Switch checked={isFocus} onChange={setIsFocus} label="Include in today's focus" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <StatusPill status={task.status} />
                <PriorityPill priority={task.priority} />
                {task.subjects?.code && <Badge tone="info">{task.subjects.code}</Badge>}
                <SyncedAt at={task.synced_at} />
              </div>
              {task.description && <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{task.description}</p>}
              {task.official_description && task.official_description !== task.description && (
                <details className="rounded-lg border border-line-soft p-2.5">
                  <summary className="cursor-pointer text-[11.5px] text-faint">Official description</summary>
                  <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-muted">{task.official_description}</p>
                </details>
              )}
              <div className="grid gap-2 text-[12px] sm:grid-cols-2">
                <div><span className="text-faint">Deadline</span><p className="text-ink">{friendlyDate(task.deadline)}</p></div>
                <div><span className="text-faint">Started</span><p className="text-ink">{task.started_at ? friendlyDate(task.started_at) : '—'}</p></div>
                <div><span className="text-faint">Completed</span><p className="text-ink">{task.completed_at ? friendlyDate(task.completed_at) : '—'}</p></div>
                <div><span className="text-faint">Created</span><p className="text-ink">{friendlyDate(task.created_at)}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <Button key={s} size="sm" variant={task.status === s ? 'primary' : 'secondary'}
                    onClick={() => patch({ status: s, completed_at: s === 'completed' ? new Date().toISOString() : null, started_at: s !== 'todo' && !task.started_at ? new Date().toISOString() : task.started_at }, `Marked ${s.replace('_', ' ')}`)}>
                    {titleCase(s)}
                  </Button>
                ))}
              </div>
            </>
          )}

          <div className="flex gap-1 border-b border-line-soft">
            {(['overview', 'subtasks', 'notes'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-3 py-1.5 text-[12px] font-medium', tab === t ? 'border-b-2 border-accent text-accent' : 'text-faint hover:text-muted')}>
                {titleCase(t)}{t === 'subtasks' && subtasks.length ? ` (${subtasks.filter((s: any) => s.is_done).length}/${subtasks.length})` : ''}
              </button>
            ))}
          </div>

          {tab === 'subtasks' && (
            <div className="space-y-2">
              {subtasks.map((s: any) => (
                <div key={s.id} className="flex items-center gap-2.5">
                  <button
                    onClick={async () => { await updateSubtask(s.id, { is_done: !s.is_done }); await refreshSubs() }}
                    className={cn('grid shrink-0 place-items-center rounded border', s.is_done ? 'border-accent bg-accent text-bg-0' : 'border-line')}
                    style={{ height: 18, width: 18 }} aria-label="Toggle subtask"
                  >
                    {s.is_done && <Check size={11} />}
                  </button>
                  <span className={cn('flex-1 text-[12.5px]', s.is_done ? 'text-faint line-through' : 'text-ink')}>{s.title}</span>
                  <Button variant="ghost" size="icon" aria-label="Delete subtask" onClick={async () => { await deleteSubtask(s.id); await refreshSubs() }}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Input value={newSubtask} onChange={(e) => setNewSubtask(e.target.value)} placeholder="Add a subtask…" onKeyDown={(e) => e.key === 'Enter' && addSub()} />
                <Button variant="secondary" onClick={addSub}><Plus size={13} /> Add</Button>
              </div>
            </div>
          )}

          {tab === 'notes' && (
            <div className="space-y-2">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[140px]"
                placeholder="Private notes for yourself. Never visible to administrators." />
              <Button variant="primary" size="sm" loading={busy} onClick={() => patch({ personal_notes: notes }, 'Notes saved')}>Save notes</Button>
            </div>
          )}

          {tab === 'overview' && (
            <button onClick={() => setConfirmDelete(true)} className="text-[11.5px] text-faint underline-offset-2 hover:text-danger hover:underline">
              {task.source_type !== 'personal' ? 'Remove from my workspace' : 'Delete this task'}
            </button>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete} onClose={() => setConfirmDelete(false)}
        title={task.source_type !== 'personal' ? 'Remove from workspace?' : 'Delete this task?'}
        message={task.source_type !== 'personal'
          ? 'This deletes your personal tracking record only. The official assignment remains published and unchanged.'
          : 'This deletes the task and all its subtasks permanently.'}
        confirmLabel={task.source_type !== 'personal' ? 'Remove' : 'Delete'}
        loading={busy}
        onConfirm={async () => {
          setBusy(true)
          try {
            await deleteTask(task.id)
            onChanged?.()
            setConfirmDelete(false)
            onClose()
            toast.success('Removed.')
          } catch (e: any) { toast.error(e?.message ?? 'Failed.') }
          finally { setBusy(false) }
        }}
      />
    </>
  )
}

/** ISO -> value accepted by <input type="datetime-local"> in local time. */
export function toLocalInput(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
