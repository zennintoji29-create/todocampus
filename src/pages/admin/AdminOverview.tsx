import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity, ArrowRight, FileText, GraduationCap, Megaphone, Plus, Sparkles, Target, TrendingUp, Users,
} from 'lucide-react'
import { formatDistanceToNowStrict } from 'date-fns'
import { useAsyncData } from '@/hooks/useAsyncData'
import { fetchAnnouncements, fetchAssignments, fetchAssessments, fetchOpportunities, fetchSubjects, listUsers } from '@/lib/api'
import { Badge, Card, CardHeader, EmptyState, ErrorState } from '@/components/ui'
import { StatTile, friendlyDate } from '@/components/shared'
import { titleCase } from '@/lib/utils'

export default function AdminOverview() {
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [assignments, assessments, announcements, opportunities, users, subjects] = await Promise.all([
      fetchAssignments({ includeArchived: true, limit: 500 }), fetchAssessments({ includeArchived: true, limit: 500 }),
      fetchAnnouncements({ includeUnpublished: true, limit: 100 }), fetchOpportunities({ includeArchived: true, limit: 200 }),
      listUsers(), fetchSubjects(),
    ])
    return { assignments, assessments, announcements, opportunities, users, subjects }
  }, [])

  const stats = useMemo(() => {
    if (!data) return null
    const now = new Date()
    const active = (a: any) => a.status === 'published'
    return {
      activeAssignments: data.assignments.filter((a: any) => active(a)).length,
      upcomingAssessments: data.assessments.filter((a: any) => active(a) && new Date(a.starts_at) > now).length,
      publishedAnnouncements: data.announcements.filter((a: any) => active(a)).length,
      draftAnnouncements: data.announcements.filter((a: any) => a.status === 'draft').length,
      activeOpportunities: data.opportunities.filter((a: any) => active(a)).length,
      students: data.users.filter((u: any) => u.role === 'student').length,
      admins: data.users.filter((u: any) => u.role === 'admin').length,
      subjects: data.subjects.length,
    }
  }, [data])

  if (loading) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-[70px]" />)}</div>
  if (error) return <ErrorState message={error} onRetry={() => void reload()} />
  if (!stats || !data) return null

  const recent = [
    ...data.assignments.map((a: any) => ({ at: a.updated_at, label: a.title, kind: 'Assignment', to: `/admin/assignments?edit=${a.id}` })),
    ...data.assessments.map((a: any) => ({ at: a.updated_at, label: a.title, kind: 'Assessment', to: `/admin/assessments?edit=${a.id}` })),
    ...data.announcements.map((a: any) => ({ at: a.updated_at, label: a.title, kind: 'Announcement', to: `/admin/announcements?edit=${a.id}` })),
    ...data.opportunities.map((a: any) => ({ at: a.updated_at, label: a.title, kind: 'Opportunity', to: `/admin/opportunities?edit=${a.id}` })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 9)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <StatTile label="Assignments" value={stats.activeAssignments} icon={<FileText size={16} />} hint="published" />
        <StatTile label="Assessments" value={stats.upcomingAssessments} icon={<Sparkles size={16} />} hint="upcoming" />
        <StatTile label="Notices" value={stats.publishedAnnouncements} icon={<Megaphone size={16} />} hint={`${stats.draftAnnouncements} drafts`} />
        <StatTile label="Opportunities" value={stats.activeOpportunities} icon={<Target size={16} />} hint="published" />
        <StatTile label="Subjects" value={stats.subjects} icon={<GraduationCap size={16} />} />
        <StatTile label="Students" value={stats.students} icon={<Users size={16} />} />
        <StatTile label="Admins" value={stats.admins} icon={<Users size={16} />} tone="info" />
        <StatTile label="Total users" value={data.users.length} icon={<Activity size={16} />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Recently updated content" subtitle="Latest changes across all official content" icon={<TrendingUp size={14} />} />
          <div className="divide-y divide-line-soft">
            {recent.length === 0 && <EmptyState title="No content yet" message="Start by creating a semester and subjects." />}
            {recent.map((r, i) => (
              <Link key={i} to={r.to} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-2/60">
                <Badge tone="neutral" className="w-[92px] justify-center">{r.kind}</Badge>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{r.label}</span>
                <span className="shrink-0 text-[10.5px] text-faint">{formatDistanceToNowStrict(new Date(r.at), { addSuffix: true })}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Quick actions" icon={<Plus size={14} />} />
          <div className="grid gap-2.5 p-4 sm:grid-cols-2">
            {[
              { to: '/admin/assignments', label: 'New assignment', icon: <FileText size={15} /> },
              { to: '/admin/assessments', label: 'New quiz / exam', icon: <Sparkles size={15} /> },
              { to: '/admin/announcements', label: 'New announcement', icon: <Megaphone size={15} /> },
              { to: '/admin/opportunities', label: 'New opportunity', icon: <Target size={15} /> },
              { to: '/admin/curriculum', label: 'Add subject', icon: <GraduationCap size={15} /> },
              { to: '/admin/users', label: 'Manage roles', icon: <Users size={15} /> },
            ].map((a) => (
              <Link key={a.to} to={a.to} className="flex items-center gap-2.5 rounded-lg border border-line bg-bg-2 p-3 text-[12.5px] text-ink transition-colors hover:border-accent/40">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-bg-0 text-accent">{a.icon}</span>
                <span className="flex-1">{a.label}</span>
                <ArrowRight size={13} className="text-faint" />
              </Link>
            ))}
          </div>
          <div className="border-t border-line-soft px-4 py-3">
            <p className="text-[11px] leading-relaxed text-faint">
              Counts are computed from live database rows. Announcements notify every targeted student the
              moment they are published.
            </p>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title="Next deadlines" icon={<FileText size={14} />} />
          <div className="divide-y divide-line-soft">
            {data.assignments.filter((a: any) => a.status === 'published').sort((a: any, b: any) => +new Date(a.deadline) - +new Date(b.deadline)).slice(0, 5).map((a: any) => (
              <Link key={a.id} to={`/admin/assignments?edit=${a.id}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-bg-2/60">
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{a.title}</span>
                <span className="shrink-0 text-[10.5px] text-faint">{friendlyDate(a.deadline)}</span>
              </Link>
            ))}
            {data.assignments.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-faint">None yet.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Next assessments" icon={<Sparkles size={14} />} />
          <div className="divide-y divide-line-soft">
            {data.assessments.filter((a: any) => a.status === 'published').sort((a: any, b: any) => +new Date(a.starts_at) - +new Date(b.starts_at)).slice(0, 5).map((a: any) => (
              <Link key={a.id} to={`/admin/assessments?edit=${a.id}`} className="flex items-center gap-2.5 px-4 py-2 hover:bg-bg-2/60">
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{a.title}</span>
                <span className="shrink-0 text-[10.5px] text-faint">{friendlyDate(a.starts_at)}</span>
              </Link>
            ))}
            {data.assessments.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-faint">None yet.</p>}
          </div>
        </Card>
        <Card>
          <CardHeader title="Newest users" icon={<Users size={14} />} />
          <div className="divide-y divide-line-soft">
            {data.users.slice(0, 5).map((u: any) => (
              <div key={u.id} className="flex items-center gap-2.5 px-4 py-2">
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{u.full_name ?? u.email}</span>
                <Badge tone={u.role === 'admin' ? 'accent' : 'neutral'}>{titleCase(u.role)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
