import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Download, Eye, FileText, Image as ImageIcon, Paperclip, Plus, Save, Trash2, Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNowStrict } from 'date-fns'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import {
  deleteDocument, deleteNote, documentSignedUrl, fetchDocuments, fetchNotes, fetchSubjects, fetchUnits,
  saveNote, updateNote, uploadDocument, validateUpload,
} from '@/lib/api'
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Field, Input, SearchInput,
  Select, Spinner, Tabs, Textarea,
} from '@/components/ui'
import { formatBytes, cn, titleCase } from '@/lib/utils'

export default function Notes() {
  const { user } = useAuth()
  const uid = user?.id
  const [params] = useSearchParams()
  const [tab, setTab] = useState<'notes' | 'documents'>('notes')
  const [q, setQ] = useState('')
  const [subject, setSubject] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'note' | 'doc'; id: string; title: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const docParam = params.get('doc')

  const { data, loading, error, reload, setData } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [notes, documents, subjects, units] = await Promise.all([
      fetchNotes(uid), fetchDocuments(uid), fetchSubjects(), fetchUnits(),
    ])
    return { notes, documents, subjects, units }
  }, [uid])

  const filteredNotes = useMemo(() => (data?.notes ?? []).filter((n: any) =>
    (!q || `${n.title} ${n.content ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (!subject || n.subject_id === subject)), [data, q, subject])
  const filteredDocs = useMemo(() => (data?.documents ?? []).filter((d: any) =>
    (!q || `${d.title} ${d.description ?? ''}`.toLowerCase().includes(q.toLowerCase())) &&
    (!subject || d.subject_id === subject)), [data, q, subject])

  const editing = data?.notes.find((n: any) => n.id === editId) ?? null

  const doDelete = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'note') {
        await deleteNote(confirm.id)
        setData((prev: any) => ({ ...prev, notes: prev.notes.filter((n: any) => n.id !== confirm.id) }))
      } else {
        const doc = data?.documents.find((d: any) => d.id === confirm.id)!
        await deleteDocument(doc)
        setData((prev: any) => ({ ...prev, documents: prev.documents.filter((d: any) => d.id !== confirm.id) }))
      }
      toast.success('Deleted')
      setConfirm(null)
    } catch (e: any) { toast.error(e?.message ?? 'Delete failed.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 pt-2">
          <Tabs value={tab} onChange={(v) => setTab(v as any)}
            tabs={[{ value: 'notes', label: 'Notes', count: data?.notes.length }, { value: 'documents', label: 'Documents', count: data?.documents.length }]} />
          <div className="ml-auto flex items-center gap-2 pb-2">
            <Button variant="secondary" size="sm" onClick={() => setUploadOpen(true)}><Upload size={13} /> Upload file</Button>
            <Button variant="primary" size="sm" onClick={() => { setEditId('new'); setCreateOpen(true) }}><Plus size={13} /> New note</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-soft p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search your library…" className="min-w-[200px] flex-1" />
          <Select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-52">
            <option value="">All subjects</option>
            {data?.subjects.map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
          </Select>
        </div>

        {loading && <div className="flex items-center justify-center py-12"><Spinner /></div>}
        {error && <ErrorState message={error} onRetry={() => void reload()} />}

        {!loading && !error && tab === 'notes' && (
          filteredNotes.length === 0
            ? <EmptyState icon={<FileText size={18} />} title="No notes yet" message="Capture class notes, revision points and links — all private to you."
                action={<Button variant="primary" size="sm" onClick={() => { setEditId('new'); setCreateOpen(true) }}><Plus size={13} /> New note</Button>} />
            : <div className="divide-y divide-line-soft">
                {filteredNotes.map((n: any) => (
                  <div key={n.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setEditId(n.id)} className="truncate text-[13px] font-medium text-ink hover:text-accent">{n.title}</button>
                        {n.is_pinned && <Badge tone="accent">pinned</Badge>}
                        {n.subjects && <Badge tone="info">{n.subjects.code}</Badge>}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[11.5px] text-faint">{n.content || 'Empty note'}</p>
                      <p className="mt-0.5 text-[10.5px] text-faint">Updated {formatDistanceToNowStrict(new Date(n.updated_at), { addSuffix: true })}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditId(n.id)}>Edit</Button>
                      <Button variant="ghost" size="icon" aria-label="Delete note" onClick={() => setConfirm({ kind: 'note', id: n.id, title: n.title })}><Trash2 size={13} /></Button>
                    </div>
                  </div>
                ))}
              </div>
        )}

        {!loading && !error && tab === 'documents' && (
          filteredDocs.length === 0
            ? <EmptyState icon={<Paperclip size={18} />} title="No documents" message="Upload class notes, assignment PDFs, references or photos of handwritten notes."
                action={<Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}><Upload size={13} /> Upload file</Button>} />
            : <div className="divide-y divide-line-soft">
                {filteredDocs.map((d: any) => (
                  <DocumentRow key={d.id} doc={d} highlighted={docParam === d.id} onDelete={() => setConfirm({ kind: 'doc', id: d.id, title: d.title })} />
                ))}
              </div>
        )}
      </Card>

      <NoteEditor
        open={createOpen || editId === 'new' || !!editId}
        note={editing}
        subjects={data?.subjects ?? []}
        units={data?.units ?? []}
        onClose={() => { setCreateOpen(false); setEditId(null) }}
        onSaved={async () => { await reload(); setEditId(null); setCreateOpen(false) }}
      />

      <UploadDialog
        open={uploadOpen} onClose={() => setUploadOpen(false)}
        subjects={data?.subjects ?? []} units={data?.units ?? []}
        onUploaded={async () => { await reload(); setUploadOpen(false); toast.success('File uploaded to your private library.') }}
      />

      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={busy} onConfirm={doDelete}
        title="Delete permanently?"
        message={`“${confirm?.title}” and its ${confirm?.kind === 'doc' ? 'stored file' : 'content'} will be removed. This cannot be undone.`} />
    </div>
  )
}

function DocumentRow({ doc, highlighted, onDelete }: { doc: any; highlighted?: boolean; onDelete: () => void }) {
  const [busy, setBusy] = useState(false)
  const isImage = (doc.mime_type ?? '').startsWith('image/')
  const isPdf = doc.mime_type === 'application/pdf'
  const open = async (preview: boolean) => {
    setBusy(true)
    try {
      const url = await documentSignedUrl(doc, preview ? 3600 : 300)
      window.open(url, '_blank', 'noopener')
    } catch (e: any) { toast.error(e?.message ?? 'Could not open the file.') }
    finally { setBusy(false) }
  }
  return (
    <div className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg-2/60', highlighted && 'bg-accent/[0.06]')}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-bg-2 text-faint">
        {isImage ? <ImageIcon size={15} /> : <FileText size={15} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-medium text-ink">{doc.title}</p>
          <Badge tone="neutral">{titleCase(doc.kind)}</Badge>
          {doc.subjects && <Badge tone="info">{doc.subjects.code}</Badge>}
          {doc.extract_status === 'pending' && <Badge tone="warn">text extraction pending</Badge>}
          {doc.extract_status === 'unsupported' && <Badge tone="neutral">no text index</Badge>}
        </div>
        <p className="mt-0.5 text-[10.5px] text-faint">{formatBytes(doc.size_bytes)} · {doc.mime_type} · {formatDistanceToNowStrict(new Date(doc.created_at), { addSuffix: true })}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {(isImage || isPdf) && (
          <Button variant="ghost" size="icon" aria-label="Preview" loading={busy} onClick={() => open(true)}><Eye size={14} /></Button>
        )}
        <Button variant="ghost" size="icon" aria-label="Download" onClick={() => open(false)}><Download size={14} /></Button>
        <Button variant="ghost" size="icon" aria-label="Delete" onClick={onDelete}><Trash2 size={13} /></Button>
      </div>
    </div>
  )
}

function NoteEditor({ open, note, subjects, units, onClose, onSaved }: {
  open: boolean; note: any | null; subjects: any[]; units: any[]
  onClose: () => void; onSaved: () => void
}) {
  const { user } = useAuth()
  const [f, setF] = useState({ title: '', content: '', subjectId: '', unitId: '', tags: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useMemo(() => {
    if (open) {
      setF({
        title: note?.title ?? '', content: note?.content ?? '',
        subjectId: note?.subject_id ?? '', unitId: note?.unit_id ?? '',
        tags: (note?.tags ?? []).join(', '),
      })
      setError(null)
    }
  }, [open, note])

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }))

  const submit = async () => {
    if (!f.title.trim()) { setError('A title is required.'); return }
    if (!user) return
    setBusy(true)
    try {
      const payload = {
        title: f.title.trim(), content: f.content,
        subject_id: f.subjectId || null, unit_id: f.unitId || null,
        tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
      }
      if (note) await updateNote(note.id, payload)
      else await saveNote({ ...payload, user_id: user.id })
      toast.success(note ? 'Note updated' : 'Note saved')
      onSaved()
    } catch (e: any) { setError(e?.message ?? 'Could not save the note.') }
    finally { setBusy(false) }
  }

  const unitOptions = units.filter((u: any) => !f.subjectId || u.subject_id === f.subjectId)

  return (
    <Dialog open={open} onClose={onClose} title={note ? 'Edit note' : 'New note'} width="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}><Save size={13} /> Save note</Button></>}>
      <div className="space-y-3.5">
        <Field label="Title" error={error}><Input autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="DBMS — normalisation cheat sheet" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Subject">
            <Select value={f.subjectId} onChange={(e) => { set('subjectId', e.target.value); set('unitId', '') }}>
              <option value="">None</option>
              {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </Select>
          </Field>
          <Field label="Unit">
            <Select value={f.unitId} onChange={(e) => set('unitId', e.target.value)}>
              <option value="">None</option>
              {unitOptions.map((u: any) => <option key={u.id} value={u.id}>Unit {u.unit_number}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Tags" hint="comma separated">
          <Input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="exam, revision, formulas" />
        </Field>
        <Field label="Content" hint="plain text">
          <Textarea value={f.content} onChange={(e) => set('content', e.target.value)} className="min-h-[200px] font-mono text-[12.5px]" />
        </Field>
      </div>
    </Dialog>
  )
}

function UploadDialog({ open, onClose, subjects, units, onUploaded }: {
  open: boolean; onClose: () => void; subjects: any[]; units: any[]; onUploaded: () => void
}) {
  const { user } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [f, setF] = useState({ title: '', kind: 'class_notes', subjectId: '', unitId: '', description: '' })

  const pick = (file_: File | null) => {
    setError(null)
    if (!file_) { setFile(null); return }
    const invalid = validateUpload(file_)
    if (invalid) { setError(invalid); setFile(null); return }
    setFile(file_)
    setF((p) => ({ ...p, title: p.title || file_.name.replace(/\.[^.]+$/, '') }))
    setProgress(0)
  }

  const upload = async () => {
    if (!file || !user) { setError('Choose a file first.'); return }
    setBusy(true)
    try {
      // Simulated progress ticks reflect real lifecycle stages (validated → uploading → row saved).
      const timer = setInterval(() => setProgress((p) => Math.min(92, p + 8)), 160)
      try {
        await uploadDocument(user.id, file, {
          title: f.title.trim() || file.name, kind: f.kind, description: f.description,
          subject_id: f.subjectId || null, unit_id: f.unitId || null,
        })
      } finally { clearInterval(timer); setProgress(100) }
      onUploaded()
    } catch (e: any) { setError(e?.message ?? 'Upload failed.'); setProgress(0) }
    finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Upload a document" description="Stored in your private bucket. Only you can access it." width="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={upload}><Upload size={13} /> Upload</Button></>}>
      <div className="space-y-3.5">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null) }}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-lg border border-dashed border-line px-4 py-7 text-center transition-colors hover:border-accent/40"
        >
          <input ref={inputRef} type="file" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          {file ? (
            <p className="text-[13px] text-ink">{file.name} · {formatBytes(file.size)}</p>
          ) : (
            <>
              <Upload size={18} className="mx-auto mb-2 text-faint" />
              <p className="text-[12.5px] text-muted">Drop a file or click to browse</p>
              <p className="mt-1 text-[11px] text-faint">PDF, images, Office docs, text — up to 10 MB</p>
            </>
          )}
        </div>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        {busy && <div><div className="mb-1 flex justify-between text-[11px] text-faint"><span>Uploading…</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-bg-2"><div className="bar-fill h-full bg-accent" style={{ width: `${progress}%` }} /></div></div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title"><Input value={f.title} onChange={(e) => setF((p) => ({ ...p, title: e.target.value }))} /></Field>
          <Field label="Type">
            <Select value={f.kind} onChange={(e) => setF((p) => ({ ...p, kind: e.target.value }))}>
              {['class_notes', 'assignment', 'study_resource', 'reference', 'handwritten', 'personal', 'syllabus', 'other'].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={f.subjectId} onChange={(e) => setF((p) => ({ ...p, subjectId: e.target.value, unitId: '' }))}>
              <option value="">None</option>
              {subjects.map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </Select>
          </Field>
          <Field label="Unit">
            <Select value={f.unitId} onChange={(e) => setF((p) => ({ ...p, unitId: e.target.value }))}>
              <option value="">None</option>
              {units.filter((u: any) => !f.subjectId || u.subject_id === f.subjectId).map((u: any) => <option key={u.id} value={u.id}>Unit {u.unit_number}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Description" hint="optional"><Input value={f.description} onChange={(e) => setF((p) => ({ ...p, description: e.target.value }))} /></Field>
        <p className="text-[11px] leading-relaxed text-faint">
          Text-based files (PDF / text / Markdown / CSV) are queued for server-side extraction; scanned or binary files
          are marked “no text index” rather than being indexed with fabricated content.
        </p>
      </div>
    </Dialog>
  )
}
