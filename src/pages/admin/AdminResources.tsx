import { useMemo, useState } from 'react'
import { FileText, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  adminCreate, adminDelete, adminUpdate, fetchOfficialResources, fetchSemesters, fetchSubjects,
} from '@/lib/api'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Input, Select,
  TableSkeleton, Textarea,
} from '@/components/ui'
import { AdminEditorShell } from './Curriculum'
import { titleCase } from '@/lib/utils'
import { useAsyncData } from '@/hooks/useAsyncData'
import { formatDistanceToNowStrict } from 'date-fns'

export default function AdminResources() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [resources, subjects, semesters] = await Promise.all([fetchOfficialResources(), fetchSubjects(), fetchSemesters()])
    return { resources, subjects, semesters }
  }, [])
  const [q, setQ] = useState('')
  const [form, setForm] = useState<null | Record<string, any>>(null)
  const [confirm, setConfirm] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const rows = useMemo(() => (data?.resources ?? []).filter((r: any) =>
    !q || `${r.title} ${r.description ?? ''}`.toLowerCase().includes(q.toLowerCase())), [data, q])

  const openNew = () => setForm({ isNew: true, id: null, title: '', description: '', url: '', subject_id: '', status: 'published' })
  const openEdit = (r: any) => setForm({
    isNew: false, id: r.id, title: r.title, description: r.description ?? '',
    url: r.url ?? '', subject_id: r.subject_id ?? '', status: r.status,
  })

  const save = async () => {
    const f = form!
    if (!f.title.trim()) { toast.error('Title is required.'); return }
    if (f.url && !/^https?:\/\//i.test(f.url)) { toast.error('URL must start with http(s)://'); return }
    setBusy(true)
    try {
      const payload = { title: f.title.trim(), description: f.description || null, url: f.url || null, subject_id: f.subject_id || null, status: f.status }
      if (f.isNew) await adminCreate('official_resources', payload)
      else await adminUpdate('official_resources', f.id, payload)
      toast.success(f.isNew ? 'Resource created' : 'Resource updated')
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
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search resources…"
            className="h-9 min-w-[200px] flex-1 rounded-lg border border-line bg-bg-2 px-3 text-[13px] text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none" />
          <Button variant="primary" size="sm" onClick={openNew}><Plus size={13} /> New resource</Button>
        </div>
        <div className="divide-y divide-line-soft">
          {rows.length === 0 && <EmptyState title="No official resources" message="Link reference material, notes and downloads for students." />}
          {rows.map((r: any) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
              <FileText size={15} className="shrink-0 text-faint" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-[13px] font-medium text-ink">{r.title}</p>
                  <Badge tone={r.status === 'published' ? 'accent' : 'neutral'}>{r.status}</Badge>
                  {r.subjects && <Badge tone="info">{r.subjects.code}</Badge>}
                </div>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                  {r.description && <span className="truncate">{r.description}</span>}
                  <span>· {formatDistanceToNowStrict(new Date(r.updated_at), { addSuffix: true })}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Select value={r.status} onChange={async (v) => { await adminUpdate('official_resources', r.id, { status: v }); await reload() }} className="h-8 w-32 text-[12px]">
                  {['draft', 'published', 'archived'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
                <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(r)}><Pencil size={13} /></Button>
                <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => setConfirm(r)}><Trash2 size={13} /></Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <AdminEditorShell open={!!form} title={form?.isNew ? 'New official resource' : 'Edit resource'} onClose={() => setForm(null)} onSubmit={save} busy={busy}>
        {form && (
          <div className="space-y-3.5">
            <Field label="Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="DBMS Reference Notes" /></Field>
            <Field label="URL" hint="link to hosted material"><Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" /></Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Subject" hint="optional">
                <Select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })}>
                  <option value="">None</option>
                  {(data?.subjects ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {['draft', 'published', 'archived'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Description" hint="optional"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          </div>
        )}
      </AdminEditorShell>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy}
        title="Delete resource?" message={`"${confirm?.title}" will be removed.`}
        onConfirm={async () => {
          setBusy(true)
          try { await adminDelete('official_resources', confirm.id); setConfirm(null); await reload(); toast.success('Deleted') }
          catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
          finally { setBusy(false) }
        }} />
    </div>
  )
}

/* ===================== Users & roles ===================== */
export function AdminUsers() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const api = await import('@/lib/api')
    const [users, adminEmails] = await Promise.all([api.listUsers(), api.listAdminEmails()])
    return { users, adminEmails }
  }, [])
  const [q, setQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<any | null>(null)

  const rows = (data?.users ?? []).filter((u: any) =>
    (!q || `${u.full_name ?? ''} ${u.email ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (!roleFilter || u.role === roleFilter))

  const setRole = async (userId: string, role: 'student' | 'admin') => {
    setBusy(true)
    try {
      const { setUserRole } = await import('@/lib/api')
      await setUserRole(userId, role)
      toast.success(`Role changed to ${role}`)
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Could not change the role — only admins may do this.') }
    finally { setBusy(false) }
  }

  const addAllow = async () => {
    const email = newEmail.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast.error('Enter a valid email address.'); return }
    setBusy(true)
    try {
      const { allowAdminEmail } = await import('@/lib/api')
      await allowAdminEmail(email)
      setNewEmail('')
      toast.success('Added — new signups with this email become admins automatically')
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Could not add.') }
    finally { setBusy(false) }
  }

  const revoke = async (email: string) => {
    setBusy(true)
    try {
      const { revokeAdminEmail } = await import('@/lib/api')
      await revokeAdminEmail(email)
      toast.success('Removed from the allow list')
      await reload()
    } catch (e: any) { toast.error(e?.message ?? 'Could not remove.') }
    finally { setBusy(false) }
    setConfirm(null)
  }

  if (loading) return <TableSkeleton rows={6} cols={4} />
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search users…"
            className="h-9 min-w-[200px] flex-1 rounded-lg border border-line bg-bg-2 px-3 text-[13px] text-ink placeholder:text-faint focus:border-accent/60 focus:outline-none" />
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-36">
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="admin">Admins</option>
          </Select>
          <Badge tone="neutral">{data?.users.length ?? 0} users</Badge>
        </div>
        <div className="divide-y divide-line-soft">
          {rows.map((u: any) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-bg-2 text-[11px] font-semibold text-accent">
                {(u.full_name ?? u.email ?? '?').slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{u.full_name ?? 'Unnamed'}</p>
                <p className="truncate text-[11px] text-faint">{u.email}</p>
              </div>
              <Select value={u.role} onChange={(e) => setRole(u.id, e.target.value as any)} disabled={busy} className="h-8 w-36 text-[12px]">
                <option value="student">Student</option>
                <option value="admin">Administrator</option>
              </Select>
            </div>
          ))}
          {rows.length === 0 && <EmptyState title="No users found" />}
        </div>
        <div className="border-t border-line-soft px-4 py-2.5">
          <p className="text-[11px] leading-relaxed text-faint">
            Role changes take effect on the user's next page load and are enforced by database policies — a student
            cannot promote themselves even by calling the API directly.
          </p>
        </div>
      </Card>

      <Card>
        <div className="border-b border-line-soft px-4 py-3">
          <h3 className="text-[13px] font-semibold text-ink">Admin allow list</h3>
          <p className="text-[11px] text-faint">Emails whose new signups are automatically granted the admin role.</p>
        </div>
        <div className="p-4">
          <div className="flex gap-2">
            <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="faculty@college.edu" className="flex-1" />
            <Button variant="primary" loading={busy} onClick={addAllow}><Plus size={13} /> Add</Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(data?.adminEmails ?? []).map((e: any) => (
              <span key={e.email} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bg-2 px-2 py-1 text-[12px] text-muted">
                {e.email}
                <button onClick={() => setConfirm(e.email)} aria-label="Remove" className="text-faint hover:text-danger"><X size={11} /></button>
              </span>
            ))}
            {(data?.adminEmails ?? []).length === 0 && <p className="text-[12px] text-faint">Empty. Only existing admins can grant admin access.</p>}
          </div>
        </div>
      </Card>

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy}
        title="Remove from allow list?" message={`${confirm} will no longer auto-promote on signup. Existing accounts keep their current role.`}
        confirmLabel="Remove"
        onConfirm={() => revoke(confirm)} />
    </div>
  )
}
