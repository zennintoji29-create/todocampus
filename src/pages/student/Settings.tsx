import { useEffect, useMemo, useState } from 'react'
import { startOfWeek, format } from 'date-fns'
import { toast } from 'sonner'
import { Bell, BellRing, KeyRound, LogOut, Plus, Save, Target, Trash2, User, Volume2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useAsyncData } from '@/hooks/useAsyncData'
import { useBrowserNotifications } from '@/hooks/useReminders'
import {
  deleteGoal, fetchGoalLogs, fetchGoals, fetchSemesters, fetchSubjects, logGoal, saveGoal, updateProfile,
} from '@/lib/api'
import {
  Badge, Button, Card, CardHeader, Field, Input, Progress, Select, Tabs,
} from '@/components/ui'
import { GOAL_METRIC_LABEL, type GoalMetric, goalProgress } from '@/lib/domain'
import { titleCase } from '@/lib/utils'

type Tab = 'profile' | 'goals' | 'notifications'

export default function Settings() {
  const [tab, setTab] = useState<Tab>(() =>
    window.location.hash === '#goals' ? 'goals' : window.location.hash === '#notifications' ? 'notifications' : 'profile')
  return (
    <div className="max-w-4xl space-y-4">
      <Card>
        <Tabs value={tab} onChange={(v) => { setTab(v as Tab); window.location.hash = v === 'profile' ? '' : `#${v}` }}
          tabs={[
            { value: 'profile', label: 'Profile' },
            { value: 'goals', label: 'Weekly goals' },
            { value: 'notifications', label: 'Notifications' },
          ]} />
      </Card>
      {tab === 'profile' && <ProfileSettings />}
      {tab === 'goals' && <GoalsSettings />}
      {tab === 'notifications' && <NotificationSettings />}
    </div>
  )
}

function ProfileSettings() {
  const { user, profile, signOut, refreshProfile } = useAuth()
  const { data: semesters } = useAsyncData(() => fetchSemesters(), [])
  const [f, setF] = useState({
    full_name: profile?.full_name ?? '',
    roll_number: profile?.roll_number ?? '',
    semester_id: profile?.semester_id ?? '',
  })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (profile) {
      setF({
        full_name: profile.full_name ?? '',
        roll_number: profile.roll_number ?? '',
        semester_id: profile.semester_id ?? '',
      })
    }
  }, [profile])

  const submit = async () => {
    setBusy(true)
    try {
      await updateProfile(user!.id, {
        full_name: f.full_name.trim() || null,
        roll_number: f.roll_number.trim() || null,
        semester_id: f.semester_id || null,
      })
      await refreshProfile()
      toast.success('Profile updated')
    } catch (e: any) { toast.error(e?.message ?? 'Could not save.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Account" icon={<User size={14} />} subtitle={profile?.email} />
        <div className="space-y-3.5 p-4">
          <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF((p) => ({ ...p, full_name: e.target.value }))} /></Field>
          <Field label="Roll number"><Input value={f.roll_number} onChange={(e) => setF((p) => ({ ...p, roll_number: e.target.value }))} /></Field>
          <Field label="Semester">
            <Select value={f.semester_id} onChange={(e) => setF((p) => ({ ...p, semester_id: e.target.value }))}>
              <option value="">Not set</option>
              {(semesters ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.name || `Semester ${s.number}`}</option>)}
            </Select>
          </Field>
          <div className="flex items-center gap-2">
            <Button variant="primary" loading={busy} onClick={submit}><Save size={13} /> Save changes</Button>
            <span className="text-[11.5px] text-faint">
              Role: <Badge tone={profile?.role === 'admin' ? 'accent' : 'neutral'}>{titleCase(profile?.role ?? 'student')}</Badge>
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Security" icon={<KeyRound size={14} />} />
        <div className="space-y-2.5 p-4 text-[12.5px] text-muted">
          <p>Password reset, email change and account deletion are handled by Supabase Auth.</p>
          <div className="flex gap-2">
            <a href="/forgot-password"><Button variant="secondary" size="sm">Send password reset email</Button></a>
            <Button variant="danger" size="sm" onClick={() => void signOut()}><LogOut size={13} /> Sign out</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function GoalsSettings() {
  const { user } = useAuth()
  const uid = user?.id
  const [metric, setMetric] = useState<GoalMetric>('topics_completed')
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('5')
  const [subjectId, setSubjectId] = useState('')
  const [busy, setBusy] = useState(false)

  const { data, reload } = useAsyncData(async () => {
    if (!uid) throw new Error('Not signed in')
    const [goals, logs, subjects] = await Promise.all([fetchGoals(uid), fetchGoalLogs(uid), fetchSubjects()])
    return { goals, logs, subjects }
  }, [uid])

  const { data: subjects } = useAsyncData(() => fetchSubjects(), [])
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }) , 'yyyy-MM-dd')

  const thisWeek = useMemo(() =>
    (data?.goals ?? []).filter((g: any) => g.week_start === weekStart)
      .map((g: any) => ({ ...g, ...goalProgress(g.target, (data?.logs ?? []).filter((l: any) => l.goal_id === g.id)) })),
    [data, weekStart])

  const create = async () => {
    if (!uid) return
    if (!title.trim()) { toast.error('Give the goal a title.'); return }
    const t = Number(target)
    if (!Number.isInteger(t) || t <= 0) { toast.error('Target must be a positive whole number.'); return }
    setBusy(true)
    try {
      await saveGoal({
        user_id: uid, week_start: weekStart, title: title.trim(),
        metric, target: t, subject_id: subjectId || null,
      })
      await reload()
      setTitle('')
      toast.success('Goal added')
    } catch (e: any) { toast.error(e?.message ?? 'Could not add (a goal with this title may already exist).') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="This week's goals" subtitle={'Week of ' + format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'd MMMM')} icon={<Target size={14} />} />
        <div className="space-y-3.5 p-4">
          {thisWeek.length === 0 && <p className="py-6 text-center text-[12px] text-faint">No goals set for this week yet.</p>}
          {thisWeek.map((g: any) => (
            <GoalRow key={g.id} goal={g} onLog={async (amount: number) => {
              await logGoal({ goal_id: g.id, user_id: uid!, amount })
              await reload()
            }} onDelete={async () => { await deleteGoal(g.id); await reload() }} />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Add a goal" icon={<Plus size={14} />} />
        <div className="grid gap-3.5 p-4 sm:grid-cols-2">
          <Field label="Title" className="sm:col-span-2">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Finish DSA practice set" />
          </Field>
          <Field label="Metric">
            <Select value={metric} onChange={(e) => setMetric(e.target.value as GoalMetric)}>
              {Object.entries(GOAL_METRIC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Target" hint="whole number">
            <Input type="number" min={1} value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Subject scope" hint="optional" className="sm:col-span-2">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">All subjects</option>
              {(data?.subjects ?? subjects ?? []).map((s: any) => <option key={s.id} value={s.id}>{s.code}</option>)}
            </Select>
          </Field>
          <Button variant="primary" loading={busy} onClick={create} className="sm:col-span-2"><Plus size={13} /> Add goal</Button>
        </div>
      </Card>
      <p className="text-[11px] text-faint">Goals reset every Monday. Log progress with the +1 / +5 buttons; completion is recomputed from the log.</p>
    </div>
  )
}

function GoalRow({ goal, onLog, onDelete }: { goal: any; onLog: (n: number) => Promise<void>; onDelete: () => Promise<void> }) {
  return (
    <div className="rounded-lg border border-line-soft p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-ink">{goal.title}</p>
          <p className="text-[11px] text-faint">{GOAL_METRIC_LABEL[goal.metric as GoalMetric]} · target {goal.target}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => onLog(1)}>+1</Button>
          <Button variant="ghost" size="sm" onClick={() => onLog(5)}>+5</Button>
          <Button variant="ghost" size="icon" aria-label="Delete goal" onClick={onDelete}><Trash2 size={13} /></Button>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-3">
        <Progress value={goal.percent} className="flex-1" tone={goal.reached ? 'accent' : 'info'} />
        <span className="w-14 text-right text-[12px] tabular-nums text-muted">{goal.total}/{goal.target}</span>
      </div>
      {goal.reached && <Badge tone="accent" className="mt-2">reached</Badge>}
    </div>
  )
}

function NotificationSettings() {
  const { permission, request, supported } = useBrowserNotifications()
  return (
    <Card>
      <CardHeader title="Notifications" icon={<Bell size={14} />} subtitle="How CampusOS reminds you in-app and on the desktop" />
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <BellRing size={15} className="mt-0.5 text-accent" />
            <div>
              <p className="text-[13px] text-ink">Browser notifications</p>
              <p className="text-[11.5px] leading-relaxed text-faint">
                Optional. When enabled, deadline reminders and study-session reminders also surface as desktop
                notifications. {supported ? `Current status: ${permission}.` : 'Not supported in this browser.'}
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" disabled={!supported || permission === 'granted'} onClick={() => void request()}>
            {permission === 'granted' ? 'Enabled' : 'Enable'}
          </Button>
        </div>
        <div className="flex items-start gap-2.5 border-t border-line-soft pt-4">
          <Volume2 size={15} className="mt-0.5 text-faint" />
          <div>
            <p className="text-[13px] text-ink">In-app reminders</p>
            <p className="text-[11.5px] leading-relaxed text-faint">
              Always on. Reminders fire in the notification bell for tasks with a reminder set and study sessions
              15 minutes before they start. Announcements appear automatically when admins publish them.
            </p>
          </div>
        </div>
      </div>
    </Card>
  )
}
