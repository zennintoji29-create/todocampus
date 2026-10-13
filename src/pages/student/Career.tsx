import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Briefcase, ExternalLink, Kanban, List, Plus, Save, Trash2, TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNowStrict, isPast } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import {
  deleteApplication, fetchApplications, updateApplication, saveApplication,
} from '@/lib/api'
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input,
  SearchInput, Select, Skeleton, Textarea,
} from '@/components/ui'
import { StatTile, friendlyDate } from '@/components/shared'
import { cn, safeExternalUrl, titleCase } from '@/lib/utils'

const PIPELINE = ['saved', 'planning', 'applied', 'assessment', 'interview', 'offer', 'rejected', 'closed'] as const
const STATUS_TONE: Record<string, any> = {
  saved: 'neutral', planning: 'info', applied: 'info', assessment: 'warn',
  interview: 'accent', offer: 'accent', rejected: 'danger', closed: 'neutral',
}

export default function Career() {
  const { user } = useAuth()
  const uid = user?.id
  const [status, setStatus] = useState('')
  const [type, setType] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, setConfirm] = useState<any | null>(null)
  const [view, setView] = useState<'list' | 'board'>('list')
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload, setData } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    return { apps: await fetchApplications(uid) }
  }, [uid])

  const rows = useMemo(() => (data?.apps ?? []).filter((a: any) =>
    (!status || a.status === status) &&
    (!type || a.opportunity_type === type) &&
    (!q || `${a.title} ${a.organization}`.toLowerCase().includes(q.toLowerCase()))), [data, status, type, q])

  const stats = useMemo(() => {
    const apps = data?.apps ?? []
    return {
      total: apps.length,
      active: apps.filter((a: any) => !['rejected', 'closed'].includes(a.status)).length,
      interview: apps.filter((a: any) => ['assessment', 'interview', 'offer'].includes(a.status)).length,
      offers: apps.filter((a: any) => a.status === 'offer').length,
      expiring: apps.filter((a: any) => a.deadline && !['rejected', 'closed', 'offer'].includes(a.status) && isPast(new Date(a.deadline))).length,
    }
  }, [data])

  const setAppStatus = async (id: string, next: string) => {
    try {
      const updated = await updateApplication(id, { status: next, applied_on: next === 'applied' && !data?.apps.find((a: any) => a.id === id)?.applied_on ? format(new Date(), 'yyyy-MM-dd') : undefined })
      setData((prev: any) => ({ ...prev, apps: prev.apps.map((a: any) => (a.id === id ? { ...a, ...updated } : a)) }))
      toast.success(`Status → ${titleCase(next)}`)
    } catch (e: any) { toast.error(e?.message ?? 'Update failed.') }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    )
  }
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Tracked" value={stats.total} icon={<Briefcase size={16} />} />
        <StatTile label="Active" value={stats.active} tone="info" />
        <StatTile label="In process" value={stats.interview} tone="warn" icon={<TrendingUp size={16} />} />
        <StatTile label="Offers" value={stats.offers} tone="accent" />
        <StatTile label="Expired deadlines" value={stats.expiring} tone={stats.expiring ? 'danger' : 'neutral'} />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search applications…" className="min-w-[180px] flex-1" />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
            <option value="">All statuses</option>
            {PIPELINE.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
          </Select>
          <Select value={type} onChange={(e) => setType(e.target.value)} className="w-44">
            <option value="">All types</option>
            {['internship', 'placement', 'hackathon', 'workshop', 'scholarship', 'competition', 'conference', 'chapter_event'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
          </Select>
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-bg-2 p-0.5">
            <button onClick={() => setView('list')} className={cn('rounded-md px-2 py-1', view === 'list' ? 'bg-bg-0 text-accent' : 'text-faint')} aria-label="List view"><List size={13} /></button>
            <button onClick={() => setView('board')} className={cn('rounded-md px-2 py-1', view === 'board' ? 'bg-bg-0 text-accent' : 'text-faint')} aria-label="Board view"><Kanban size={13} /></button>
          </div>
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} /> Add manually</Button>
        </div>

        {rows.length === 0
          ? <EmptyState icon={<Briefcase size={18} />} title="No applications tracked" message="Save an opportunity from the Opportunities feed, or add one manually."
              action={<Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} /> Add manually</Button>} />
          : view === 'list' ? (
            <div className="divide-y divide-line-soft">
              {rows.map((a: any) => (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => setOpenId(a.id)} className="truncate text-[13px] font-medium text-ink hover:text-accent">{a.title}</button>
                      <Badge tone={STATUS_TONE[a.status]}>{titleCase(a.status)}</Badge>
                      <Badge tone="neutral">{titleCase(a.opportunity_type)}</Badge>
                      {a.source_opportunity_id && <Badge tone="info">imported</Badge>}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-faint">
                      {a.organization}{a.role ? ` · ${a.role}` : ''}
                      {a.deadline ? ` · apply by ${format(new Date(a.deadline), 'd MMM')}` : ''}
                      {a.applied_on ? ` · applied ${format(new Date(a.applied_on), 'd MMM')}` : ''}
                    </p>
                    {a.next_action && <p className="mt-0.5 text-[11.5px] text-accent">Next: {a.next_action}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Select value={a.status} onChange={(e) => setAppStatus(a.id, e.target.value)} className="h-8 w-36 text-[12px]">
                      {PIPELINE.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                    </Select>
                    <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirm(a)}><Trash2 size={13} /></Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto p-4">
              {PIPELINE.map((s) => {
                const col = rows.filter((a: any) => a.status === s)
                return (
                  <div key={s} className="w-56 shrink-0 rounded-lg border border-line bg-bg-2/40 p-2">
                    <div className="mb-2 flex items-center justify-between px-1">
                      <span className="text-[11.5px] font-medium text-muted">{titleCase(s)}</span>
                      <Badge tone={STATUS_TONE[s]}>{col.length}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {col.map((a: any) => (
                        <button key={a.id} onClick={() => setOpenId(a.id)} className="w-full rounded-md border border-line bg-bg-1 p-2 text-left transition-colors hover:border-accent/30">
                          <p className="truncate text-[11.5px] text-ink">{a.title}</p>
                          <p className="truncate text-[10px] text-faint">{a.organization}</p>
                        </button>
                      ))}
                      {col.length === 0 && <p className="px-1 py-3 text-center text-[10.5px] text-faint">Empty</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
      </Card>

      <ApplicationDialog id={openId} onClose={() => setOpenId(null)} onChanged={() => void reload()} />
      <ApplicationEditor
        open={createOpen} onClose={() => setCreateOpen(false)}
        onSaved={async () => { await reload(); setCreateOpen(false); toast.success('Application tracked') }}
      />

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy}
        title="Delete application?" message={`“${confirm?.title}” and its private notes will be permanently deleted.`}
        onConfirm={async () => {
          setBusy(true)
          try { await deleteApplication(confirm.id); await reload(); setConfirm(null); toast.success('Deleted') }
          catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
          finally { setBusy(false) }
        }} />
    </div>
  )
}

function ApplicationDialog(props: { id: string | null; onClose: () => void; onChanged: () => void }) {
  return <InnerApplicationDialog {...props} />
}

function InnerApplicationDialog({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth()
  const uid = user?.id
  const navigate = useNavigate()
  const { data, loading: l2 } = useAsyncData(async () => {
    if (!uid || !id) return null
    const apps = await fetchApplications(uid)
    return apps.find((a: any) => a.id === id) ?? null
  }, [uid, id])
  const [notes, setNotes] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [busy, setBusy] = useState(false)

  useMemo(() => {
    if (data) { setNotes(data.personal_notes ?? ''); setNextAction(data.next_action ?? '') }
  }, [data])

  if (!id) return null
  if (l2) return null
  if (!data) return <Dialog open onClose={onClose} title="Not found"><p className="text-[12px] text-faint">This application is no longer in your tracker.</p></Dialog>
  const a: any = data
  const url = safeExternalUrl(a.apply_url)

  return (
    <Dialog open onClose={onClose} title={a.title} width="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>
        {a.source_opportunity_id && <Button variant="secondary" onClick={() => { onClose(); navigate(`/opportunities/${a.source_opportunity_id}`) }}>View official posting</Button>}
        <Button variant="primary" loading={busy} onClick={async () => {
          setBusy(true)
          try { await updateApplication(a.id, { personal_notes: notes, next_action: nextAction }); toast.success('Saved'); onChanged() }
          catch (e: any) { toast.error(e?.message ?? 'Save failed.') }
          finally { setBusy(false) }
        }}><Save size={13} /> Save</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge tone={STATUS_TONE[a.status]}>{titleCase(a.status)}</Badge>
          <Badge tone="neutral">{titleCase(a.opportunity_type)}</Badge>
          {a.source_opportunity_id && <Badge tone="info">imported</Badge>}
        </div>
        <div className="grid gap-3 text-[12.5px] sm:grid-cols-2">
          <div><span className="text-faint">Organization</span><p className="text-ink">{a.organization || '—'}</p></div>
          <div><span className="text-faint">Role</span><p className="text-ink">{a.role || '—'}</p></div>
          <div><span className="text-faint">Deadline</span><p className="text-ink">{friendlyDate(a.deadline)}</p></div>
          <div><span className="text-faint">Applied on</span><p className="text-ink">{a.applied_on ?? '—'}</p></div>
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-accent hover:underline">
            {url} <ExternalLink size={11} />
          </a>
        )}
        <Field label="Next action"><Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Book a mock interview" /></Field>
        <Field label="Private notes" hint="only visible to you">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[140px]" placeholder="Recruiter feedback, questions asked, prep notes…" />
        </Field>
        <p className="text-[11px] text-faint">Last updated {formatDistanceToNowStrict(new Date(a.updated_at), { addSuffix: true })}</p>
      </div>
    </Dialog>
  )
}

function ApplicationEditor({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth()
  const [f, setF] = useState({ title: '', organization: '', role: '', type: 'internship', url: '', deadline: '', notes: '', nextAction: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!f.title.trim()) e.title = 'Title is required.'
    if (f.url && !/^https?:\/\//i.test(f.url)) e.url = 'Must be a valid http(s) URL.'
    setErrors(e)
    if (Object.keys(e).length || !user) return
    setBusy(true)
    try {
      await saveApplication({
        user_id: user.id, title: f.title.trim(), organization: f.organization, role: f.role || null,
        opportunity_type: f.type, apply_url: f.url || null,
        deadline: f.deadline ? new Date(f.deadline).toISOString() : null,
        status: 'planning', personal_notes: f.notes || null, next_action: f.nextAction || null,
      })
      onSaved()
    } catch (err: any) { toast.error(err?.message ?? 'Could not save.') }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Track an opportunity manually" width="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save application</Button></>}>
      <div className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title / role" error={errors.title}><Input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Software Engineer Intern" /></Field>
          <Field label="Organization"><Input value={f.organization} onChange={(e) => set('organization', e.target.value)} /></Field>
          <Field label="Type">
            <Select value={f.type} onChange={(e) => set('type', e.target.value)}>
              {['internship', 'placement', 'hackathon', 'workshop', 'scholarship', 'competition', 'conference', 'chapter_event'].map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </Select>
          </Field>
          <Field label="Deadline"><Input type="datetime-local" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></Field>
        </div>
        <Field label="Application URL" error={errors.url}><Input value={f.url} onChange={(e) => set('url', e.target.value)} placeholder="https://…" /></Field>
        <Field label="Next action"><Input value={f.nextAction} onChange={(e) => set('nextAction', e.target.value)} /></Field>
        <Field label="Private notes"><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      </div>
    </Dialog>
  )
}
