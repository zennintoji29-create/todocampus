/**
 * Typed data-access layer. Every function goes through the Supabase client,
 * so Postgres RLS is the authority on who may read/write what. Nothing here
 * uses a service-role key and nothing is stored in module-level caches.
 */
import { supabase, BUCKETS, MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME } from './supabase'
import { toMessage } from './errors'
import { storageKey } from './utils'

export const API_ERROR = (e: unknown) => toMessage(e)
const unwrap = <T>({ data, error }: { data: T | null; error: { message: string } | null }): T => {
  if (error) throw new Error(toMessage(error))
  return data as T
}

export type Role = 'student' | 'admin'
export interface Profile {
  id: string; email: string | null; full_name: string | null; role: Role
  roll_number: string | null; semester_id: string | null; created_at: string
}

/* ==================== auth & profile ==================== */
export async function fetchProfile(userId: string): Promise<Profile> {
  const p = await supabase.from('profiles').select('*').eq('id', userId).single()
  return unwrap(p)
}

export async function updateProfile(userId: string, patch: Partial<Pick<Profile, 'full_name' | 'roll_number' | 'semester_id'>>) {
  return unwrap(await supabase.from('profiles').update(patch).eq('id', userId).select().single())
}

export async function listUsers() {
  return unwrap(await supabase.from('profiles').select('*').order('created_at', { ascending: false }))
}

export async function setUserRole(userId: string, role: Role) {
  return unwrap(await supabase.from('profiles').update({ role }).eq('id', userId).select().single())
}

export async function listAdminEmails() {
  return unwrap(await supabase.from('admin_emails').select('email').order('email'))
}

export async function allowAdminEmail(email: string) {
  return unwrap(await supabase.from('admin_emails').upsert({ email: email.toLowerCase() }).select().single())
}

export async function revokeAdminEmail(email: string) {
  return unwrap(await supabase.from('admin_emails').delete().eq('email', email).select())
}

/* ==================== academic structure ==================== */
export const fetchSemesters = async () =>
  unwrap(await supabase.from('semesters').select('*').order('number'))

export const fetchSubjects = async () =>
  unwrap(await supabase.from('subjects').select('*, semesters(id,name,number)').order('position'))

export const fetchUnits = async () =>
  unwrap(await supabase.from('syllabus_units').select('*, subjects(id,code,name,semester_id)').order('unit_number'))

export const fetchTopics = async () =>
  unwrap(await supabase.from('syllabus_topics').select('*, syllabus_units(id,title,unit_number,subject_id)').order('position'))

const insert = (table: string, row: Record<string, unknown>) =>
  supabase.from(table).insert(row).select().single().then(unwrap)

const update = (table: string, id: string, row: Record<string, unknown>) =>
  supabase.from(table).update(row).eq('id', id).select().single().then(unwrap)

const remove = (table: string, id: string) =>
  supabase.from(table).delete().eq('id', id).then(unwrap)

export const adminCreate = insert
export const adminUpdate = update
export const adminDelete = remove

/* ==================== official content ==================== */
export const fetchAssignments = async (opts: { includeArchived?: boolean; limit?: number } = {}) => {
  let q = supabase.from('assignments').select('*, subjects(id,code,name), semesters(id,name,number)')
    .order('deadline', { ascending: true })
    .limit(opts.limit ?? 300)
  if (!opts.includeArchived) q = q.neq('status', 'archived')
  return q.then(unwrap)
}

export const fetchAssessments = async (opts: { includeArchived?: boolean; limit?: number } = {}) => {
  let q = supabase.from('assessments').select('*, subjects(id,code,name), semesters(id,name,number)')
    .order('starts_at', { ascending: true })
    .limit(opts.limit ?? 300)
  if (!opts.includeArchived) q = q.neq('status', 'archived')
  return q.then(unwrap)
}

export const fetchAnnouncements = async (opts: { includeUnpublished?: boolean; limit?: number } = {}) => {
  let q = supabase.from('announcements').select('*, profiles!created_by(full_name), semesters(id,name,number)')
    .order('is_pinned', { ascending: false }).order('publish_at', { ascending: false })
    .limit(opts.limit ?? 200)
  if (!opts.includeUnpublished) q = q.eq('status', 'published')
  return q.then(unwrap)
}

export const fetchOpportunities = async (opts: { includeArchived?: boolean; limit?: number } = {}) => {
  let q = supabase.from('opportunities').select('*').order('application_deadline', { ascending: true })
    .limit(opts.limit ?? 300)
  if (!opts.includeArchived) q = q.neq('status', 'archived')
  return q.then(unwrap)
}

export const fetchOfficialResources = async () =>
  unwrap(await supabase.from('official_resources').select('*, subjects(id,code,name)').order('created_at', { ascending: false }))

export const fetchAttachments = async (entityType: string, entityId: string) =>
  unwrap(await supabase.from('attachments').select('*').eq('entity_type', entityType).eq('entity_id', entityId))

/** Official file upload: only admins may write to the `official` bucket. */
export async function uploadOfficialFile(file: File, opts: { mime: string; folder: string }) {
  if (!ALLOWED_UPLOAD_MIME.includes(opts.mime as never)) throw new Error('Unsupported file type.')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('File exceeds the 10 MB limit.')
  const user = (await supabase.auth.getUser()).data.user
  if (!user) throw new Error('Not signed in.')
  const path = storageKey(user.id, file.name)
  const { error } = await supabase.storage.from(BUCKETS.official)
    .upload(path, file, { contentType: opts.mime, upsert: false })
  if (error) throw new Error(toMessage(error))
  return { path, size: file.size }
}

/** Creates an attachment row for an official entity. */
export async function attachToEntity(args: {
  entityType: 'assignment' | 'assessment' | 'announcement' | 'opportunity' | 'official_resource'
  entityId: string; label: string; file: File
}) {
  const { path, size } = await uploadOfficialFile(args.file, { mime: args.file.type, folder: 'official' })
  return insert('attachments', {
    entity_type: args.entityType, entity_id: args.entityId, label: args.label,
    storage_path: path, mime_type: args.file.type, size_bytes: size,
  })
}

export async function deleteAttachment(id: string) {
  const rows: any = await fetchAttachmentsById(id)
  if (rows?.storage_path) {
    await supabase.storage.from(BUCKETS.official).remove([rows.storage_path])
  }
  return remove('attachments', id)
}
const fetchAttachmentsById = async (id: string) =>
  unwrap(await supabase.from('attachments').select('*').eq('id', id).maybeSingle())

export function attachmentUrl(path: string) {
  return supabase.storage.from(BUCKETS.official).getPublicUrl(path).data.publicUrl
}
/** Signed URL works for the private `official` bucket. */
export async function signedUrl(path: string, expires = 300) {
  const { data, error } = await supabase.storage.from(BUCKETS.official).createSignedUrl(path, expires)
  if (error) throw new Error(toMessage(error))
  return data.signedUrl
}

/* ==================== tasks (personal + imported) ==================== */
export const fetchTasks = async (userId: string) => {
  const rows = unwrap(await supabase.from('tasks').select('*, subjects(id,code,name), semesters(id,name,number)')
    .eq('user_id', userId).order('deadline', { ascending: true, nullsFirst: false }))
  return rows
}

export const fetchSubtasks = async (taskId: string) =>
  unwrap(await supabase.from('subtasks').select('*').eq('task_id', taskId).order('position'))

export const createTask = (row: Record<string, unknown>) => insert('tasks', row)
export const updateTask = (id: string, row: Record<string, unknown>) => update('tasks', id, row)
export const deleteTask = (id: string) => remove('tasks', id)

export const addSubtask = (taskId: string, title: string) =>
  insert('subtasks', { task_id: taskId, title })
export const updateSubtask = (id: string, row: Record<string, unknown>) => update('subtasks', id, row)
export const deleteSubtask = (id: string) => remove('subtasks', id)

/**
 * Import an official record into the personal workspace.
 * - Duplicate protection is enforced by the partial unique index `uniq_task_import`
 *   (user_id, source_type, source_id); a second attempt surfaces a friendly error.
 * - Personal fields are initialized; official fields are a snapshot that stays
 *   synchronised by the `sync_task_from_*` database triggers.
 */
export async function importAssignment(a: { id: string; title: string; description?: string | null; deadline: string; subject_id?: string | null; semester_id?: string | null; priority?: string }, userId: string) {
  return createTask({
    user_id: userId, source_type: 'assignment', source_id: a.id,
    title: a.title, description: a.description ?? null,
    deadline: a.deadline, subject_id: a.subject_id ?? null, semester_id: a.semester_id ?? null,
    priority: a.priority ?? 'medium',
    official_title: a.title, official_description: a.description ?? null,
    official_deadline: a.deadline, official_status: 'published', synced_at: new Date().toISOString(),
  })
}

export async function importAssessment(a: { id: string; title: string; instructions?: string | null; starts_at: string; subject_id?: string | null; semester_id?: string | null }, userId: string) {
  return createTask({
    user_id: userId, source_type: 'assessment', source_id: a.id,
    title: a.title, description: a.instructions ?? null,
    deadline: a.starts_at, subject_id: a.subject_id ?? null, semester_id: a.semester_id ?? null,
    priority: 'high',
    official_title: a.title, official_description: a.instructions ?? null,
    official_deadline: a.starts_at, official_status: 'published', synced_at: new Date().toISOString(),
  })
}

/** Remove from the personal workspace only — never touches official content. */
export const unlinkTask = (id: string) => deleteTask(id)

/* ==================== subject subscriptions ==================== */
export const fetchSubscriptions = async (userId: string) =>
  unwrap(await supabase.from('subject_subscriptions').select('*, subjects(id,code,name)').eq('user_id', userId))

export const toggleSubscription = (userId: string, subjectId: string, patch: Partial<Record<'auto_import_assignments' | 'auto_import_assessments', boolean>>) =>
  upsert('subject_subscriptions', { user_id: userId, subject_id: subjectId, ...patch })

const upsert = (table: string, row: Record<string, unknown>) =>
  supabase.from(table).upsert(row, { onConflict: 'user_id,subject_id' }).select().single().then(unwrap)

/**
 * One-tap "auto-import everything published in this subject".
 * Reads official rows (public to all signed-in students) and inserts missing
 * imports; already-imported rows are skipped, so it is idempotent.
 */
export async function autoImportSubject(userId: string, subjectId: string) {
  const [assignments, assessments] = await Promise.all([
    supabase.from('assignments').select('id,title,description,deadline,priority').eq('subject_id', subjectId).eq('status', 'published').then(unwrap),
    supabase.from('assessments').select('id,title,instructions,starts_at').eq('subject_id', subjectId).eq('status', 'published').then(unwrap),
  ])
  const existing = await supabase.from('tasks').select('source_type,source_id').eq('user_id', userId)
    .not('source_id', 'is', null).then(unwrap)
  const have = new Set(existing.map((e) => `${e.source_type}:${e.source_id}`))
  const rows: Record<string, unknown>[] = []
  for (const a of assignments) {
    if (have.has(`assignment:${a.id}`)) continue
    rows.push({
      user_id: userId, source_type: 'assignment', source_id: a.id, title: a.title,
      description: a.description, deadline: a.deadline, subject_id: subjectId, priority: a.priority,
      official_title: a.title, official_description: a.description, official_deadline: a.deadline,
      official_status: 'published', synced_at: new Date().toISOString(),
    })
  }
  for (const a of assessments) {
    if (have.has(`assessment:${a.id}`)) continue
    rows.push({
      user_id: userId, source_type: 'assessment', source_id: a.id, title: a.title,
      description: a.instructions, deadline: a.starts_at, subject_id: subjectId, priority: 'high',
      official_title: a.title, official_description: a.instructions, official_deadline: a.starts_at,
      official_status: 'published', synced_at: new Date().toISOString(),
    })
  }
  if (rows.length) {
    const { error } = await supabase.from('tasks').insert(rows)
    if (error) throw new Error(toMessage(error))
  }
  return { imported: rows.length, skipped: existing.filter((e) => have.has(`${e.source_type}:${e.source_id}`)).length }
}

/* ==================== syllabus tracker ==================== */
export const fetchTopicProgress = async (userId: string) =>
  unwrap(await supabase.from('topic_progress').select('*').eq('user_id', userId))

export const setTopicProgress = (userId: string, topicId: string, patch: Record<string, unknown>) =>
  upsert('topic_progress', { user_id: userId, topic_id: topicId, ...patch })

/* ==================== notes & documents ==================== */
export const fetchNotes = async (userId: string) =>
  unwrap(await supabase.from('notes').select('*, subjects(id,code,name), semesters(id,name,number)').eq('user_id', userId).order('updated_at', { ascending: false }))

export const saveNote = (row: Record<string, unknown>) => insert('notes', row)
export const updateNote = (id: string, row: Record<string, unknown>) => update('notes', id, row)
export const deleteNote = (id: string) => remove('notes', id)

export const fetchDocuments = async (userId: string) =>
  unwrap(await supabase.from('documents').select('*, subjects(id,code,name), semesters(id,name,number)').eq('user_id', userId).order('updated_at', { ascending: false }))

export function validateUpload(file: File) {
  if (file.size === 0) return 'File is empty.'
  if (file.size > MAX_UPLOAD_BYTES) return 'File exceeds the 10 MB limit.'
  if (!ALLOWED_UPLOAD_MIME.includes(file.type as never)) return `Unsupported file type: ${file.type || 'unknown'}.`
  return null
}

export async function uploadDocument(userId: string, file: File, meta: Record<string, unknown> = {}) {
  const invalid = validateUpload(file)
  if (invalid) throw new Error(invalid)
  const path = storageKey(userId, file.name)
  const { error } = await supabase.storage.from(BUCKETS.personal)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(toMessage(error))
  const doc = await insert('documents', {
    user_id: userId, title: meta.title ?? file.name, kind: meta.kind ?? 'other',
    storage_path: path, mime_type: file.type, size_bytes: file.size,
    description: meta.description ?? null, semester_id: meta.semester_id ?? null,
    subject_id: meta.subject_id ?? null, unit_id: meta.unit_id ?? null, topic_id: meta.topic_id ?? null,
    extract_status: /pdf|text|markdown|csv/.test(file.type) ? 'pending' : 'unsupported',
  })
  return doc
}

export async function deleteDocument(doc: { id: string; storage_path: string }) {
  await supabase.storage.from(BUCKETS.personal).remove([doc.storage_path])
  return remove('documents', doc.id)
}

export async function documentSignedUrl(doc: { storage_path: string }, expires = 600) {
  const { data, error } = await supabase.storage.from(BUCKETS.personal).createSignedUrl(doc.storage_path, expires)
  if (error) throw new Error(toMessage(error))
  return data.signedUrl
}

/* ==================== career tracker ==================== */
export const fetchApplications = async (userId: string) =>
  unwrap(await supabase.from('career_applications').select('*, opportunities(id,title,organization,category,application_deadline)')
    .eq('user_id', userId).order('updated_at', { ascending: false }))

export const saveApplication = (row: Record<string, unknown>) => insert('career_applications', row)
export const updateApplication = (id: string, row: Record<string, unknown>) => update('career_applications', id, row)
export const deleteApplication = (id: string) => remove('career_applications', id)

export async function saveOpportunity(userId: string, opp: {
  id: string; title: string; organization?: string | null; role?: string | null
  category: string; apply_url?: string | null; application_deadline?: string | null
}) {
  return saveApplication({
    user_id: userId, source_opportunity_id: opp.id, title: opp.title,
    organization: opp.organization ?? '', role: opp.role ?? null,
    opportunity_type: opp.category, apply_url: opp.apply_url ?? null,
    deadline: opp.application_deadline ?? null, status: 'saved',
  })
}

/* ==================== calendar / study sessions ==================== */
export const fetchEvents = async (userId: string) =>
  unwrap(await supabase.from('study_events').select('*, subjects(id,code,name)').eq('user_id', userId).order('starts_at'))

export const saveEvent = (row: Record<string, unknown>) => insert('study_events', row)
export const updateEvent = (id: string, row: Record<string, unknown>) => update('study_events', id, row)
export const deleteEvent = (id: string) => remove('study_events', id)

/* ==================== weekly goals ==================== */
export const fetchGoals = async (userId: string) =>
  unwrap(await supabase.from('weekly_goals').select('*, subjects(id,code,name)').eq('user_id', userId).order('week_start', { ascending: false }))

export const fetchGoalLogs = async (userId: string) =>
  unwrap(await supabase.from('goal_logs').select('*').eq('user_id', userId))

export const saveGoal = (row: Record<string, unknown>) => insert('weekly_goals', row)
export const updateGoal = (id: string, row: Record<string, unknown>) => update('weekly_goals', id, row)
export const deleteGoal = (id: string) => remove('weekly_goals', id)
export const logGoal = (row: Record<string, unknown>) => insert('goal_logs', row)

/* ==================== notifications ==================== */
export const fetchNotifications = async (userId: string) =>
  unwrap(await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(80))

export const markNotificationRead = (id: string) =>
  supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).then(unwrap)

export const markAllNotificationsRead = (userId: string) =>
  supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null).then(unwrap)

export const fetchAnnouncementReads = async (userId: string) =>
  unwrap(await supabase.from('announcement_reads').select('announcement_id').eq('user_id', userId))

export const markAnnouncementRead = (userId: string, announcementId: string) =>
  upsert('announcement_reads', { user_id: userId, announcement_id: announcementId, read_at: new Date().toISOString() })

export const fetchActivity = async (userId: string) =>
  unwrap(await supabase.from('activity_log').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(25))

/* ==================== global search ==================== */
export interface SearchHit {
  id: string; type: 'task' | 'assignment' | 'assessment' | 'note' | 'topic' | 'announcement' | 'opportunity' | 'subject' | 'document' | 'application'
  title: string; subtitle?: string; link: string
}

/**
 * Runs a bounded parallel fan-out of `ilike` searches. Every query is still
 * subject to RLS, so results can only include rows the user may read.
 */
export async function globalSearch(userId: string, term: string): Promise<SearchHit[]> {
  const q = term.trim()
  if (q.length < 2) return []
  const like = `%${q}%`
  const [tasks, assignments, assessments, notes, topics, announcements, opportunities, subjects, docs, apps] =
    await Promise.all([
      supabase.from('tasks').select('id,title').eq('user_id', userId).ilike('title', like).limit(6).then(unwrap),
      supabase.from('assignments').select('id,title,code').neq('status', 'archived').ilike('title', like).limit(6).then(unwrap),
      supabase.from('assessments').select('id,title').neq('status', 'archived').ilike('title', like).limit(6).then(unwrap),
      supabase.from('notes').select('id,title,content').eq('user_id', userId).ilike('title', like).limit(6).then(unwrap),
      supabase.from('syllabus_topics').select('id,title,syllabus_units!inner(subject_id,subjects!inner(code,name))').ilike('title', like).limit(6).then(unwrap),
      supabase.from('announcements').select('id,title,body').eq('status', 'published').ilike('title', like).limit(6).then(unwrap),
      supabase.from('opportunities').select('id,title,organization').neq('status', 'archived').ilike('title', like).limit(6).then(unwrap),
      supabase.from('subjects').select('id,name,code').ilike('name', like).limit(6).then(unwrap),
      supabase.from('documents').select('id,title').eq('user_id', userId).ilike('title', like).limit(6).then(unwrap),
      supabase.from('career_applications').select('id,title,organization').eq('user_id', userId).ilike('title', like).limit(6).then(unwrap),
    ])
  const hits: SearchHit[] = []
  tasks.forEach((t) => hits.push({ id: t.id, type: 'task', title: t.title, link: `/tasks?task=${t.id}` }))
  assignments.forEach((a) => hits.push({ id: a.id, type: 'assignment', title: a.title, subtitle: a.code ?? undefined, link: `/assignments/${a.id}` }))
  assessments.forEach((a) => hits.push({ id: a.id, type: 'assessment', title: a.title, link: `/assessments/${a.id}` }))
  notes.forEach((n) => hits.push({ id: n.id, type: 'note', title: n.title, subtitle: (n.content ?? '').slice(0, 60), link: `/notes/${n.id}` }))
  topics.forEach((t: any) => hits.push({ id: t.id, type: 'topic', title: t.title, subtitle: t.syllabus_units?.subjects?.code, link: `/syllabus?topic=${t.id}` }))
  announcements.forEach((a) => hits.push({ id: a.id, type: 'announcement', title: a.title, link: `/announcements/${a.id}` }))
  opportunities.forEach((o) => hits.push({ id: o.id, type: 'opportunity', title: o.title, subtitle: o.organization, link: `/opportunities/${o.id}` }))
  subjects.forEach((s) => hits.push({ id: s.id, type: 'subject', title: s.name, subtitle: s.code, link: `/subjects/${s.id}` }))
  docs.forEach((d) => hits.push({ id: d.id, type: 'document', title: d.title, link: `/notes?doc=${d.id}` }))
  apps.forEach((a) => hits.push({ id: a.id, type: 'application', title: a.title, subtitle: a.organization, link: `/career/${a.id}` }))
  return hits
}
