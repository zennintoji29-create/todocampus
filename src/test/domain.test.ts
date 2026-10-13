import { describe, expect, it } from 'vitest'
import {
  aggregateProgress, completionRatio, computeNextUp, deadlineState, daysUntil, eventsOnDay,
  goalProgress, isDueToday, isOverdue, taskCounts, upcomingDeadlines,
} from '@/lib/domain'

const NOW = new Date('2026-01-10T12:00:00')
const tomorrow = new Date(NOW.getTime() + 36e5 * 24).toISOString()
const yesterday = new Date(NOW.getTime() - 36e5 * 24).toISOString()
const in3days = new Date(NOW.getTime() + 36e5 * 72).toISOString()

describe('task deadline logic', () => {
  it('flags overdue only for open tasks with a past deadline', () => {
    expect(isOverdue({ deadline: yesterday, priority: 'low', status: 'todo', id: 'a', title: 'x' }, NOW)).toBe(true)
    expect(isOverdue({ deadline: yesterday, priority: 'low', status: 'completed', id: 'a', title: 'x' }, NOW)).toBe(false)
    expect(isOverdue({ deadline: tomorrow, priority: 'low', status: 'todo', id: 'a', title: 'x' }, NOW)).toBe(false)
    expect(isOverdue({ deadline: null, priority: 'low', status: 'todo', id: 'a', title: 'x' }, NOW)).toBe(false)
  })

  it('due today ignores time-of-day', () => {
    const laterToday = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 23, 0).toISOString()
    expect(isDueToday({ deadline: laterToday, priority: 'low', status: 'todo', id: 'a', title: 'x' }, NOW)).toBe(true)
    expect(isDueToday({ deadline: tomorrow, priority: 'low', status: 'todo', id: 'a', title: 'x' }, NOW)).toBe(false)
  })

  it('deadlineState buckets', () => {
    const t = (iso: string | null) => ({ deadline: iso, priority: 'low' as const, status: 'todo' as const, id: 'a', title: 'x' })
    expect(deadlineState(t(yesterday), NOW)).toBe('overdue')
    expect(deadlineState(t(tomorrow), NOW)).toBe('soon')
    expect(deadlineState(t(in3days), NOW)).toBe('soon')
    expect(deadlineState(t(null), NOW)).toBe('none')
  })

  it('daysUntil is calendar-day based', () => {
    expect(daysUntil(tomorrow, NOW)).toBe(1)
    expect(daysUntil(yesterday, NOW)).toBe(-1)
    expect(daysUntil(null, NOW)).toBeNull()
  })
})

describe('computeNextUp ranking', () => {
  const base = { priority: 'low', status: 'todo' } as const
  it('overdue beats urgent-distant, focus is a tiebreak', () => {
    const tasks = [
      { id: 'distant-urgent', title: 'urgent but far', deadline: new Date(NOW.getTime() + 30 * 864e5).toISOString(), ...base, priority: 'urgent' as const },
      { id: 'overdue', title: 'overdue low', deadline: yesterday, ...base },
      { id: 'focus', title: 'focus far', deadline: new Date(NOW.getTime() + 10 * 864e5).toISOString(), ...base, isFocus: true },
    ]
    const ranked = computeNextUp(tasks, NOW).map((t) => t.id)
    expect(ranked[0]).toBe('overdue')
    expect(ranked).toContain('focus')
  })
  it('excludes completed and respects the limit', () => {
    const tasks = [
      { id: 'done', title: 'done', deadline: yesterday, priority: 'low' as const, status: 'completed' as const },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, title: `t${i}`, deadline: tomorrow, priority: 'medium' as const, status: 'todo' as const })),
    ]
    expect(computeNextUp(tasks, NOW, 5)).toHaveLength(5)
  })
  it('is deterministic for identical scores', () => {
    const tasks = [
      { id: 'b', title: 'b', deadline: tomorrow, priority: 'low' as const, status: 'todo' as const },
      { id: 'a', title: 'a', deadline: tomorrow, priority: 'low' as const, status: 'todo' as const },
    ]
    expect(computeNextUp(tasks, NOW).map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('taskCounts', () => {
  it('counts pending / overdue / today', () => {
    const todayISO = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 18, 0).toISOString()
    const c = taskCounts([
      { id: '1', title: 'a', deadline: todayISO, priority: 'low', status: 'todo' },
      { id: '2', title: 'b', deadline: yesterday, priority: 'low', status: 'todo' },
      { id: '3', title: 'c', deadline: null, priority: 'low', status: 'in_progress' },
      { id: '4', title: 'd', deadline: yesterday, priority: 'low', status: 'completed' },
    ], NOW)
    expect(c).toMatchObject({ total: 4, pending: 3, overdue: 1, dueToday: 1, completed: 1, inProgress: 1 })
  })
})

describe('completionRatio', () => {
  const topics = [
    { id: '1', title: 't1' }, { id: '2', title: 't2' }, { id: '3', title: 't3' },
    { id: '4', title: 'opt', isOptional: true },
  ]
  it('optional topics are excluded by default', () => {
    const p = { '1': { topicId: '1', status: 'completed' as const } }
    expect(completionRatio(topics, p).percent).toBe(33) // 1 of 3
  })
  it('zero applicable topics is 0, never NaN', () => {
    expect(completionRatio([], {}).percent).toBe(0)
    expect(completionRatio([{ id: 'x', title: 'o', isOptional: true }], {}).percent).toBe(0)
  })
  it('tallies in-progress and revision', () => {
    const p = {
      '1': { topicId: '1', status: 'completed' as const },
      '2': { topicId: '2', status: 'in_progress' as const },
      '3': { topicId: '3', status: 'revision_needed' as const },
    }
    const r = completionRatio(topics, p)
    expect(r.completed).toBe(1)
    expect(r.inProgress).toBe(1)
    expect(r.revision).toBe(1)
    expect(r.percent).toBe(33)
  })
})

describe('aggregateProgress', () => {
  it('rolls topics up to unit / subject / semester', () => {
    const units = [
      { id: 'u1', subjectId: 's1', semesterId: 'sem1', topicIds: ['t1', 't2'] },
      { id: 'u2', subjectId: 's1', semesterId: 'sem1', topicIds: ['t3'] },
      { id: 'u3', subjectId: 's2', semesterId: 'sem1', topicIds: ['t4'] },
    ]
    const topics = [
      { id: 't1', title: 'a' }, { id: 't2', title: 'b' }, { id: 't3', title: 'c' }, { id: 't4', title: 'd' },
    ]
    const p = { t1: { topicId: 't1', status: 'completed' as const }, t4: { topicId: 't4', status: 'completed' as const } }
    const agg = aggregateProgress(units, topics, p)
    expect(agg.units.get('u1')?.percent).toBe(50)
    expect(agg.units.get('u2')?.percent).toBe(0)
    expect(agg.subjects.get('s1')?.percent).toBe(33)
    expect(agg.subjects.get('s2')?.percent).toBe(100)
    expect(agg.semesters.get('sem1')?.percent).toBe(50)
  })
})

describe('goalProgress', () => {
  it('caps at 100 and detects reaching the target', () => {
    expect(goalProgress(10, [{ amount: 3 }, { amount: 4 }])).toEqual({ total: 7, percent: 70, reached: false })
    expect(goalProgress(2, [{ amount: 5 }])).toEqual({ total: 5, percent: 100, reached: true })
    expect(goalProgress(0, [])).toEqual({ total: 0, percent: 0, reached: false })
  })
  it('nets negative log entries (undo)', () => {
    expect(goalProgress(3, [{ amount: 2 }, { amount: -1 }, { amount: 2 }]).total).toBe(3)
  })
})

describe('calendar helpers', () => {
  it('eventsOnDay matches overlapping events and sorts', () => {
    const events = [
      { id: 'b', title: 'b', startsAt: '2026-01-10T14:00:00Z', endsAt: '2026-01-10T15:00:00Z', kind: 'task' as const },
      { id: 'a', title: 'a', startsAt: '2026-01-10T09:00:00Z', endsAt: '2026-01-10T10:00:00Z', kind: 'exam' as const },
      { id: 'c', title: 'c', startsAt: '2026-01-09T23:00:00Z', endsAt: '2026-01-10T01:00:00Z', kind: 'event' as const },
      { id: 'd', title: 'd', startsAt: '2026-01-11T10:00:00Z', endsAt: '2026-01-11T11:00:00Z', kind: 'event' as const },
    ]
    const ids = eventsOnDay(events, new Date('2026-01-10T12:00:00Z')).map((e) => e.id)
    expect(ids).toEqual(['c', 'a', 'b'])
  })

  it('upcomingDeadlines filters the window, sorts and caps', () => {
    const items = [
      { id: '1', title: 'far', deadline: new Date(NOW.getTime() + 40 * 864e5).toISOString() },
      { id: '2', title: 'near', deadline: in3days },
      { id: '3', title: 'today', deadline: new Date(NOW.getTime() + 3600_000).toISOString() },
      { id: '4', title: 'none', deadline: null },
    ]
    const out = upcomingDeadlines(items, NOW, 30, 5)
    expect(out.map((o) => o.id)).toEqual(['3', '2'])
    expect(out[0].daysLeft).toBe(0)
  })
})
