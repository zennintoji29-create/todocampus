/**
 * Pure domain logic — no React, no network. Everything here is unit tested
 * (src/test/domain.test.ts) and used by the dashboard, tracker and calendar.
 */
import {
  differenceInCalendarDays, isAfter, isBefore, startOfDay, startOfWeek, endOfWeek,
} from 'date-fns'

export type TaskStatus = 'todo' | 'in_progress' | 'completed'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type TopicStatus = 'not_started' | 'in_progress' | 'completed' | 'revision_needed'

export interface TaskLike {
  id: string
  title: string
  deadline: string | null
  priority: Priority
  status: TaskStatus
  isFocus?: boolean
  subjectId?: string | null
  sourceType?: 'personal' | 'assignment' | 'assessment' | 'opportunity'
  reminderMinutes?: number | null
  completedAt?: string | null
  startedAt?: string | null
  createdAt?: string
}

export const PRIORITY_WEIGHT: Record<Priority, number> = { low: 1, medium: 2, high: 3, urgent: 4 }

export function isOverdue(task: TaskLike, now = new Date()) {
  if (task.status === 'completed' || !task.deadline) return false
  return isBefore(new Date(task.deadline), now)
}

export function isDueToday(task: TaskLike, now = new Date()) {
  if (!task.deadline || task.status === 'completed') return false
  const d = startOfDay(new Date(task.deadline))
  return differenceInCalendarDays(d, startOfDay(now)) === 0
}

export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null
  return differenceInCalendarDays(startOfDay(new Date(iso)), startOfDay(now))
}

/** Urgency label used in the dashboard / task list. */
export function deadlineState(task: TaskLike, now = new Date()): 'none' | 'overdue' | 'today' | 'soon' | 'later' {
  if (task.status === 'completed' || !task.deadline) return 'none'
  const days = daysUntil(task.deadline, now)
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'
  return 'later'
}

/**
 * Rank a task for "what should I do next".
 * Overdue always wins, then due-today, then a decaying urgency score, then
 * focus flag. Deterministic tie-break by id so ordering never flickers.
 */
export function computeNextUp(tasks: TaskLike[], now = new Date(), limit = 5): TaskLike[] {
  const score = (t: TaskLike) => {
    const state = deadlineState(t, now)
    let base = 0
    if (state === 'overdue') base = 1000 + Math.min(500, Math.abs(daysUntil(t.deadline, now) ?? 0) * 10)
    else if (state === 'today') base = 800
    else if (state === 'soon') base = 600 - (daysUntil(t.deadline, now) ?? 0) * 5
    else if (state === 'later') base = 200 - Math.min(180, (daysUntil(t.deadline, now) ?? 0))
    else base = 50
    base += PRIORITY_WEIGHT[t.priority] * 12
    if (t.isFocus) base += 25
    if (t.status === 'in_progress') base += 40
    if (t.status === 'todo') base += 5
    return base
  }
  return [...tasks]
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => {
      const d = score(b) - score(a)
      if (d !== 0) return d
      const dl = (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999')
      return dl !== 0 ? dl : a.id.localeCompare(b.id)
    })
    .slice(0, limit)
}

export function taskCounts(tasks: TaskLike[], now = new Date()) {
  const open = tasks.filter((t) => t.status !== 'completed')
  return {
    total: tasks.length,
    pending: open.length,
    inProgress: open.filter((t) => t.status === 'in_progress').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    overdue: open.filter((t) => isOverdue(t, now)).length,
    dueToday: open.filter((t) => isDueToday(t, now)).length,
    dueThisWeek: open.filter((t) => {
      const d = daysUntil(t.deadline, now)
      return d !== null && d >= 0 && d <= 7
    }).length,
  }
}

/* ------------------------------------------------------------------ */
/* Syllabus progress                                                   */
/* ------------------------------------------------------------------ */

export interface TopicLike { id: string; title: string; isOptional?: boolean; estMinutes?: number | null }
export interface TopicProgressLike { topicId: string; status: TopicStatus; lastStudiedAt?: string | null; notes?: string | null }

/**
 * Completion = completed topics / applicable (non-optional) topics.
 * Zero applicable topics => 0, never NaN or 100.
 */
export function completionRatio(
  topics: TopicLike[],
  progress: Record<string, TopicProgressLike>,
  { includeOptional = false } = {},
) {
  const applicable = includeOptional ? topics : topics.filter((t) => !t.isOptional)
  let completed = 0
  let inProgress = 0
  let revision = 0
  let started = 0
  for (const t of applicable) {
    const st = progress[t.id]?.status ?? 'not_started'
    if (st === 'completed') completed++
    else if (st === 'in_progress') inProgress++
    else if (st === 'revision_needed') revision++
    if (st !== 'not_started') started++
  }
  return {
    applicable: applicable.length,
    total: topics.length,
    completed,
    inProgress,
    revision,
    started,
    percent: applicable.length === 0 ? 0 : Math.round((completed / applicable.length) * 100),
  }
}

/** Roll topic metrics up to units, subjects and semesters. */
export function aggregateProgress(
  units: { id: string; subjectId: string; semesterId: string; topicIds: string[] }[],
  topics: TopicLike[],
  progress: Record<string, TopicProgressLike>,
) {
  const byId = new Map(topics.map((t) => [t.id, t]))
  const sums = () => ({ applicable: 0, completed: 0, inProgress: 0, revision: 0 })
  const rollup = (topicIds: string[]) => {
    const s = sums()
    for (const id of topicIds) {
      const t = byId.get(id)
      if (!t || t.isOptional) continue
      s.applicable++
      const st = progress[id]?.status ?? 'not_started'
      if (st === 'completed') s.completed++
      else if (st === 'in_progress') s.inProgress++
      else if (st === 'revision_needed') s.revision++
    }
    return {
      ...s,
      percent: s.applicable === 0 ? 0 : Math.round((s.completed / s.applicable) * 100),
    }
  }

  const unitMap = new Map<string, ReturnType<typeof rollup>>()
  const subjectMap = new Map<string, ReturnType<typeof rollup> & { units: number }>()
  const semesterMap = new Map<string, ReturnType<typeof rollup> & { subjects: number; units: number }>()

  const add = <T extends { applicable: number; completed: number; inProgress: number; revision: number }>(
    map: Map<string, T>, key: string, part: { applicable: number; completed: number; inProgress: number; revision: number },
  ) => {
    const cur = (map.get(key) ?? { applicable: 0, completed: 0, inProgress: 0, revision: 0 }) as T
    map.set(key, {
      ...cur,
      applicable: cur.applicable + part.applicable,
      completed: cur.completed + part.completed,
      inProgress: cur.inProgress + part.inProgress,
      revision: cur.revision + part.revision,
    } as T)
  }

  for (const u of units) {
    const r = rollup(u.topicIds)
    unitMap.set(u.id, r)
    add(subjectMap, u.subjectId, r)
    subjectMap.set(u.subjectId, { ...subjectMap.get(u.subjectId)!, units: (subjectMap.get(u.subjectId)?.units ?? 0) + 1 })
    add(semesterMap, u.semesterId, r)
    const sm = semesterMap.get(u.semesterId)!
    semesterMap.set(u.semesterId, { ...sm, units: sm.units + 1 })
  }
  for (const [sid] of subjectMap) {
    const sem = units.find((u) => u.subjectId === sid)?.semesterId
    if (sem && !semesterMap.get(sem)?.subjects) {
      const cur = semesterMap.get(sem)!
      semesterMap.set(sem, { ...cur, subjects: 0 })
    }
  }
  for (const [sem, s] of semesterMap) {
    const subjects = new Set(units.filter((u) => u.semesterId === sem).map((u) => u.subjectId)).size
    semesterMap.set(sem, { ...s, subjects })
  }

  const withPercent = (m: Map<string, ReturnType<typeof rollup>>) =>
    new Map([...m.entries()].map(([k, v]) => [k, { ...v, percent: v.applicable ? Math.round((v.completed / v.applicable) * 100) : 0 }]))

  return { units: withPercent(unitMap), subjects: withPercent(subjectMap), semesters: withPercent(semesterMap) }
}

/* ------------------------------------------------------------------ */
/* Weekly goals                                                        */
/* ------------------------------------------------------------------ */

export type GoalMetric =
  | 'topics_completed' | 'assignments_completed' | 'tasks_completed'
  | 'dsa_problems' | 'study_sessions' | 'study_minutes'

export const GOAL_METRIC_LABEL: Record<GoalMetric, string> = {
  topics_completed: 'Syllabus topics completed',
  assignments_completed: 'Assignments finished',
  tasks_completed: 'Tasks completed',
  dsa_problems: 'DSA problems solved',
  study_sessions: 'Study sessions logged',
  study_minutes: 'Study minutes',
}

export function goalProgress(target: number, logs: { amount: number }[]) {
  const total = logs.reduce((sum, l) => sum + l.amount, 0)
  const percent = target <= 0 ? 0 : Math.min(100, Math.round((total / target) * 100))
  return { total, percent, reached: target > 0 && total >= target }
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

export function weekWindow(date: Date, offset = 0) {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const from = new Date(start)
  from.setDate(from.getDate() + offset * 7)
  const to = endOfWeek(from, { weekStartsOn: 1 })
  return { from, to }
}

export interface CalendarEventLike {
  id: string
  title: string
  startsAt: string
  endsAt: string
  kind: 'study_session' | 'exam' | 'assignment' | 'task' | 'event' | 'reminder'
  official?: boolean
}

export function eventsOnDay(events: CalendarEventLike[], day: Date) {
  const d0 = startOfDay(day).getTime()
  const d1 = d0 + 24 * 3600 * 1000
  return events
    .filter((e) => {
      const s = new Date(e.startsAt).getTime()
      const en = new Date(e.endsAt).getTime()
      return s < d1 && en > d0
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** Upcoming official deadlines merged from assignments/assessments/tasks. */
export function upcomingDeadlines<T extends { deadline: string | null; title: string; id: string }>(
  items: T[], now = new Date(), days = 30, limit = 10,
): (T & { daysLeft: number })[] {
  return items
    .filter((i) => i.deadline && !isAfter(new Date(i.deadline), new Date(now.getTime() + days * 864e5)))
    .map((i) => ({ ...i, daysLeft: daysUntil(i.deadline, now)! }))
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, limit)
}

export const CATEGORY_COLOR: Record<string, string> = {
  study_session: '#22d3a5',
  exam: '#ef4b4b',
  assignment: '#f5a524',
  task: '#3aa0ff',
  event: '#8a99ad',
  reminder: '#5d6b7e',
}
