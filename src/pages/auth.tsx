import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { GraduationCap, KeyRound, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button, Field, Input, Toast } from '@/components/ui'

function Shell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen bg-bg-0 lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-bg-1 p-10 lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/[0.07] blur-3xl" />
        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent"><GraduationCap size={19} /></span>
          <span className="text-[15px] font-semibold tracking-tight text-ink">CampusOS</span>
        </div>
        <div className="relative max-w-sm">
          <h2 className="text-[22px] font-semibold leading-snug tracking-tight text-ink">
            One command center for your entire academic life.
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Assignments, quizzes, syllabus progress, notes, deadlines, placements and internships —
            official college information stays separate from your private workspace.
          </p>
          <ul className="mt-6 space-y-2.5">
            {[
              'Import official work into your personal tracker',
              'Syllabus completion across units and subjects',
              'Private notes, documents and career applications',
              'Permissions enforced by database row-level security',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-[12.5px] text-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />{f}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] text-faint">Private beta · CampusOS</p>
      </aside>

      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-7 lg:hidden">
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-accent/12 text-accent"><GraduationCap size={20} /></span>
          </div>
          <h1 className="text-[19px] font-semibold tracking-tight text-ink">{title}</h1>
          <p className="mt-1 text-[12.5px] text-faint">{subtitle}</p>
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-[12px] text-faint">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" className="shrink-0">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

export function LoginPage() {
  const { signIn, signInWithGoogle, user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const location = useLocation() as { state?: { from?: string } }

  if (loading) return null
  if (user) return <Navigate to={location.state?.from ?? '/'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await signIn(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally { setBusy(false) }
  }

  const handleGoogle = async () => {
    setGoogleBusy(true); setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
      setGoogleBusy(false)
    }
  }

  return (
    <Shell
      title="Welcome back"
      subtitle="Sign in to your CampusOS workspace."
      footer={<>Don't have an account? <Link to="/register" className="text-accent hover:underline">Create one</Link></>}
    >
      <div className="space-y-4">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          loading={googleBusy}
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-2 border-line bg-bg-1 hover:bg-bg-2"
        >
          <GoogleIcon />
          <span>Continue with Google</span>
        </Button>

        <div className="relative my-4 flex items-center justify-center">
          <div className="w-full border-t border-line-soft" />
          <span className="absolute bg-bg-0 px-2 text-[11px] uppercase tracking-wider text-faint">or continue with email</span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@college.edu" style={{ paddingLeft: 32 }} className="pl-8" />
            </div>
          </Field>
          <Field label="Password">
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" className="pl-8" />
            </div>
          </Field>
          {error && <Toast tone="error" message={error} />}
          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">Sign in</Button>
          <div className="flex items-center justify-between text-[11.5px]">
            <Link to="/forgot-password" className="text-accent hover:underline">Forgot password?</Link>
            <Link to="/register" className="text-faint hover:text-muted">Create an account</Link>
          </div>
        </form>
      </div>
    </Shell>
  )
}

export function RegisterPage() {
  const { signUp, signInWithGoogle, user, loading } = useAuth()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true); setError(null)
    try {
      const { needsConfirmation } = await signUp(email, password, fullName)
      setDone(true)
      if (!needsConfirmation) setTimeout(() => { window.location.assign('/') }, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.')
    } finally { setBusy(false) }
  }

  const handleGoogle = async () => {
    setGoogleBusy(true); setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.')
      setGoogleBusy(false)
    }
  }

  if (done) {
    return (
      <Shell title="Check your inbox" subtitle="Your account has been created.">
        <div className="rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
          <ShieldCheck size={18} className="mb-2 text-accent" />
          <p className="text-[13px] leading-relaxed text-muted">
            If your college requires email confirmation, open the link we sent to <span className="text-ink">{email}</span>,
            then sign in. New accounts start with the <span className="text-ink">student</span> role; an administrator must
            promote you before the admin portal becomes available.
          </p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell title="Create your workspace" subtitle="Track assignments, syllabus, notes and placements in one place."
      footer={<>Already registered? <Link to="/login" className="text-accent hover:underline">Sign in</Link></>}>
      <div className="space-y-4">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          loading={googleBusy}
          onClick={handleGoogle}
          className="flex w-full items-center justify-center gap-2 border-line bg-bg-1 hover:bg-bg-2"
        >
          <GoogleIcon />
          <span>Continue with Google</span>
        </Button>

        <div className="relative my-4 flex items-center justify-center">
          <div className="w-full border-t border-line-soft" />
          <span className="absolute bg-bg-0 px-2 text-[11px] uppercase tracking-wider text-faint">or continue with email</span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name">
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Aarav Sharma" autoComplete="name" />
          </Field>
          <Field label="College email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" autoComplete="email" />
          </Field>
          <Field label="Password" hint="min. 8 characters">
            <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          {error && <Toast tone="error" message={error} />}
          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">Create account</Button>
        </form>
      </div>
    </Shell>
  )
}

export function ForgotPasswordPage() {
  const { sendReset } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try { await sendReset(email); setSent(true) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send the reset email.') }
    finally { setBusy(false) }
  }

  return (
    <Shell title="Reset your password" subtitle="We'll email you a secure recovery link." footer={<Link to="/login" className="text-accent hover:underline">Back to sign in</Link>}>
      {sent ? (
        <div className="rounded-xl border border-accent/25 bg-accent/[0.06] p-4">
          <Sparkles size={18} className="mb-2 text-accent" />
          <p className="text-[13px] leading-relaxed text-muted">
            If an account exists for <span className="text-ink">{email}</span>, a reset link is on its way. The link opens
            CampusOS and lets you choose a new password.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@college.edu" />
          </Field>
          {error && <Toast tone="error" message={error} />}
          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">Send reset link</Button>
        </form>
      )}
    </Shell>
  )
}

export function ResetPasswordPage() {
  const { updatePassword, user, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!loading) setReady(true)
  }, [loading])

  if (!ready) return null
  if (!user) {
    return (
      <Shell title="Invalid recovery link" subtitle="This password reset link is invalid or has expired.">
        <Link to="/forgot-password"><Button variant="primary" className="w-full">Request a new link</Button></Link>
      </Shell>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setBusy(true); setError(null)
    try { await updatePassword(password); setDone(true); setTimeout(() => window.location.assign('/'), 1200) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update the password.') }
    finally { setBusy(false) }
  }

  return (
    <Shell title="Choose a new password" subtitle="You're signed in through the recovery link." footer={<Link to="/" className="text-accent hover:underline">Go to dashboard</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password" hint="min. 8 characters">
          <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <Toast tone="error" message={error} />}
        {done && <Toast tone="success" message="Password updated." />}
        <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full" disabled={done}>Update password</Button>
      </form>
    </Shell>
  )
}
