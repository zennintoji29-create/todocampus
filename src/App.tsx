import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import AppShell from '@/components/layout/AppShell'
import { RequireAdmin, RequireAuth } from '@/components/layout/guards'
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from '@/pages/auth'

/* Student pages — code-split so the dashboard shell paints fast. */
const Dashboard = lazy(() => import('@/pages/student/Dashboard'))
const Tasks = lazy(() => import('@/pages/student/Tasks'))
const Calendar = lazy(() => import('@/pages/student/Calendar'))
const Syllabus = lazy(() => import('@/pages/student/Syllabus'))
const Notes = lazy(() => import('@/pages/student/Notes'))
const Career = lazy(() => import('@/pages/student/Career'))
const Settings = lazy(() => import('@/pages/student/Settings'))
const SubjectsPage = lazy(() => import('@/pages/student/Subjects').then((m) => ({ default: m.SubjectsPage })))
const SubjectDetail = lazy(() => import('@/pages/student/Subjects').then((m) => ({ default: m.SubjectDetail })))
const AssignmentsFeed = lazy(() => import('@/pages/student/OfficialFeed').then((m) => ({ default: m.AssignmentsFeed })))
const AssessmentsFeed = lazy(() => import('@/pages/student/OfficialFeed').then((m) => ({ default: m.AssessmentsFeed })))
const AssignmentDetail = lazy(() => import('@/pages/student/OfficialFeed').then((m) => ({ default: m.AssignmentDetail })))
const AssessmentDetail = lazy(() => import('@/pages/student/OfficialFeed').then((m) => ({ default: m.AssessmentDetail })))
const AnnouncementsPage = lazy(() => import('@/pages/student/OfficialFeed').then((m) => ({ default: m.AnnouncementsPage })))
const AnnouncementDetail = lazy(() => import('@/pages/student/OfficialFeed').then((m) => ({ default: m.AnnouncementDetail })))
const OpportunitiesPage = lazy(() => import('@/pages/student/OfficialFeed').then((m) => ({ default: m.OpportunitiesPage })))
const OpportunityDetail = lazy(() => import('@/pages/student/OfficialFeed').then((m) => ({ default: m.OpportunityDetail })))

/* Admin pages */
const AdminOverview = lazy(() => import('@/pages/admin/AdminOverview'))
const AdminAssignments = lazy(() => import('@/pages/admin/AdminContent').then((m) => ({ default: m.AdminAssignments })))
const AdminAssessments = lazy(() => import('@/pages/admin/AdminContent').then((m) => ({ default: m.AdminAssessments })))
const AdminAnnouncements = lazy(() => import('@/pages/admin/AdminContent').then((m) => ({ default: m.AdminAnnouncements })))
const AdminOpportunities = lazy(() => import('@/pages/admin/AdminContent').then((m) => ({ default: m.AdminOpportunities })))
const AdminCurriculum = lazy(() => import('@/pages/admin/Curriculum'))
const AdminSyllabus = lazy(() => import('@/pages/admin/Curriculum').then((m) => ({ default: m.AdminSyllabus })))
const AdminResources = lazy(() => import('@/pages/admin/AdminResources'))
const AdminUsers = lazy(() => import('@/pages/admin/AdminResources').then((m) => ({ default: m.AdminUsers })))

function Page({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="space-y-4"><div className="skeleton h-24" /><div className="skeleton h-64" /></div>}>{children}</Suspense>
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Student workspace */}
        <Route element={<RequireAuth><AppShell variant="student" /></RequireAuth>}>
          <Route path="/" element={<Page><Dashboard /></Page>} />
          <Route path="/tasks" element={<Page><Tasks /></Page>} />
          <Route path="/calendar" element={<Page><Calendar /></Page>} />
          <Route path="/syllabus" element={<Page><Syllabus /></Page>} />
          <Route path="/subjects" element={<Page><SubjectsPage /></Page>} />
          <Route path="/subjects/:id" element={<Page><SubjectDetail /></Page>} />
          <Route path="/assignments" element={<Page><AssignmentsFeed /></Page>} />
          <Route path="/assignments/:id" element={<Page><AssignmentDetail /></Page>} />
          <Route path="/assessments" element={<Page><AssessmentsFeed /></Page>} />
          <Route path="/assessments/:id" element={<Page><AssessmentDetail /></Page>} />
          <Route path="/notes" element={<Page><Notes /></Page>} />
          <Route path="/announcements" element={<Page><AnnouncementsPage /></Page>} />
          <Route path="/announcements/:id" element={<Page><AnnouncementDetail /></Page>} />
          <Route path="/opportunities" element={<Page><OpportunitiesPage /></Page>} />
          <Route path="/opportunities/:id" element={<Page><OpportunityDetail /></Page>} />
          <Route path="/career" element={<Page><Career /></Page>} />
          <Route path="/career/:id" element={<Page><Career /></Page>} />
          <Route path="/settings" element={<Page><Settings /></Page>} />
        </Route>

        {/* Admin portal */}
        <Route path="/admin" element={<RequireAdmin><AppShell variant="admin" /></RequireAdmin>}>
          <Route index element={<Page><AdminOverview /></Page>} />
          <Route path="assignments" element={<Page><AdminAssignments /></Page>} />
          <Route path="assessments" element={<Page><AdminAssessments /></Page>} />
          <Route path="curriculum" element={<Page><AdminCurriculum /></Page>} />
          <Route path="syllabus" element={<Page><AdminSyllabus /></Page>} />
          <Route path="announcements" element={<Page><AdminAnnouncements /></Page>} />
          <Route path="opportunities" element={<Page><AdminOpportunities /></Page>} />
          <Route path="resources" element={<Page><AdminResources /></Page>} />
          <Route path="users" element={<Page><AdminUsers /></Page>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
