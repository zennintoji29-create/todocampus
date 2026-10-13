/* CampusOS design system — buttons, inputs, badges, cards, dialogs, tables. */
import {
  useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, ChevronDown, Inbox, Loader2, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* -------------------------------- Button -------------------------------- */
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-bg-0 hover:bg-accent/90 font-semibold shadow-[0_1px_0_0_rgba(255,255,255,.15)_inset]',
  secondary: 'bg-bg-2 text-ink border border-line hover:border-accent/40 hover:bg-[#111722]',
  ghost: 'text-muted hover:text-ink hover:bg-bg-2',
  danger: 'bg-danger/12 text-danger border border-danger/35 hover:bg-danger/20',
  outline: 'border border-line text-ink hover:border-accent/50 hover:bg-bg-2',
}
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-xs gap-1.5 rounded-md',
  md: 'h-9 px-3.5 text-[13px] gap-2 rounded-lg',
  lg: 'h-11 px-5 text-sm gap-2 rounded-lg',
  icon: 'h-9 w-9 rounded-lg',
}

export function Button({
  variant = 'secondary', size = 'md', loading, className, children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors duration-150',
        'disabled:opacity-45 disabled:pointer-events-none select-none',
        VARIANT[variant], SIZE[size], className,
      )}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  )
}

/* --------------------------------- Card --------------------------------- */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('rounded-xl border border-line bg-bg-1', className)}>
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line-soft px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="grid h-7 w-7 place-items-center rounded-md bg-accent/10 text-accent">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-semibold tracking-tight text-ink">{title}</h3>
          {subtitle && <p className="truncate text-[11px] text-faint">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

/* -------------------------------- Badge --------------------------------- */
type Tone = 'neutral' | 'accent' | 'warn' | 'danger' | 'info'
const TONE: Record<Tone, string> = {
  neutral: 'bg-bg-2 text-muted border-line',
  accent: 'bg-accent/10 text-accent border-accent/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  danger: 'bg-danger/10 text-danger border-danger/25',
  info: 'bg-info/10 text-info border-info/25',
}
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide', TONE[tone], className)}>
      {children}
    </span>
  )
}

/* ------------------------------ Progress -------------------------------- */
export function Progress({ value, tone = 'accent', className, label }: { value: number; tone?: 'accent' | 'warn' | 'danger' | 'info'; className?: string; label?: string }) {
  const colors = { accent: 'bg-accent', warn: 'bg-warn', danger: 'bg-danger', info: 'bg-info' }
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className={cn('w-full', className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'progress'}>
        <div className={cn('bar-fill h-full rounded-full', colors[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/* ------------------------------ Ring stat ------------------------------- */
export function ProgressRing({ value, size = 84, stroke = 7, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const pct = Math.max(0, Math.min(100, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#131A26" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#22D3A5" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100}
          style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.22,.61,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children ?? <span className="text-sm font-semibold text-ink">{pct}%</span>}</div>
    </div>
  )
}

/* ------------------------------- Inputs --------------------------------- */
const fieldBase =
  'w-full rounded-lg border border-line bg-bg-2 px-3 text-[13px] text-ink placeholder:text-faint ' +
  'transition-colors focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15 disabled:opacity-50'

export function Label({ children, hint, error, htmlFor }: { children: ReactNode; hint?: string; error?: string | null; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-faint">
      {children}
      {error ? <span className="ml-2 normal-case text-danger">{error}</span> : hint ? <span className="ml-2 normal-case tracking-normal">{hint}</span> : null}
    </label>
  )
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(fieldBase, 'h-9', className)} />
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(fieldBase, 'min-h-[86px] py-2 leading-relaxed', className)} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...rest} className={cn(fieldBase, 'h-9 appearance-none pr-8', className)}>
        {children}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint" />
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  return (
    <div className={cn('relative', className)}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(fieldBase, 'h-9 pl-8.5')}
        style={{ paddingLeft: 32 }}
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink" aria-label="Clear search">
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string | null; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label error={error} hint={hint}>{label}</Label>
      {children}
    </div>
  )
}

/* -------------------------------- Dialog -------------------------------- */
export function Dialog({ open, onClose, title, description, children, footer, width = 'md' }: {
  open: boolean; onClose: () => void; title: string; description?: string
  children?: ReactNode; footer?: ReactNode; width?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  const id = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="anim-fade absolute inset-0 bg-black/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog" aria-modal="true" aria-labelledby={id}
        className={cn('anim-modal relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-bg-1 sm:rounded-xl', widths[width])}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-3.5">
          <div>
            <h2 id={id} className="text-sm font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[12px] text-faint">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={15} /></Button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------- Confirm destructive -------------------------- */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading }: {
  open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>
  title: string; message: string; confirmLabel?: string; loading?: boolean
}) {
  return (
    <Dialog
      open={open} onClose={onClose} title={title} width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-danger/12 text-danger"><AlertTriangle size={16} /></span>
        <p className="text-[13px] leading-relaxed text-muted">{message}</p>
      </div>
    </Dialog>
  )
}

/* --------------------------- States & feedback -------------------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }).map((__, c) => (
            <Skeleton key={c} className={cn('h-7 flex-1', c === 0 && 'max-w-[38%]')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function EmptyState({ title, message, action, icon }: { title: string; message?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-line bg-bg-2 text-faint">
        {icon ?? <Inbox size={18} />}
      </span>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-faint">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-3 grid h-11 w-11 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger"><AlertTriangle size={18} /></span>
      <p className="text-[13px] font-medium text-ink">Something went wrong</p>
      <p className="mt-1 max-w-sm text-[12px] text-faint">{message}</p>
      {onRetry && <Button className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={cn('animate-spin text-accent', className)} />
}

/* -------------------------------- Tabs ---------------------------------- */
export function Tabs({ tabs, value, onChange }: {
  tabs: { value: string; label: string; count?: number }[]; value: string; onChange: (v: string) => void
}) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cn(
            'relative shrink-0 px-3 py-2 text-[12.5px] font-medium transition-colors',
            value === t.value ? 'text-accent' : 'text-faint hover:text-muted',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 text-[10.5px] opacity-70">{t.count}</span>}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------- Toast ---------------------------------- */
export function Toast({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  return (
    <div className={cn('anim-fade flex items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px]',
      tone === 'success' ? 'border-accent/30 bg-accent/10 text-accent' : 'border-danger/30 bg-danger/10 text-danger')}>
      {tone === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}
      {message}
    </div>
  )
}

/* ------------------------------ Select menu ----------------------------- */
export interface MenuItem { label: string; onSelect: () => void; icon?: ReactNode; tone?: 'default' | 'danger' }
export function Menu({ trigger, items, align = 'right' }: { trigger: ReactNode; items: MenuItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && (
        <div className={cn('anim-modal absolute z-40 mt-1 min-w-[170px] overflow-hidden rounded-lg border border-line bg-bg-2 py-1 shadow-xl shadow-black/50',
          align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) => (
            <button
              key={i} onClick={() => { it.onSelect(); setOpen(false) }}
              className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-bg-0',
                it.tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'text-muted hover:text-ink')}
            >
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* -------------------------------- Switch -------------------------------- */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex items-center gap-2.5 text-[12.5px] text-muted', disabled && 'opacity-50')}>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label ?? 'toggle'} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 rounded-full border transition-colors', checked ? 'border-accent/50 bg-accent/25' : 'border-line bg-bg-2')}
      >
        <span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full transition-transform', checked ? 'translate-x-4 bg-accent' : 'translate-x-0.5 bg-faint')} />
      </button>
      {label}
    </label>
  )
}
