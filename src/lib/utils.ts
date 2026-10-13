import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function initials(name?: string | null, email?: string | null) {
  const src = (name || email || '?').trim()
  const parts = src.split(/[\s@._-]+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '') || ['?']).join('')
}

/** Stable, collision-resistant storage key inside a private bucket folder. */
export function storageKey(userId: string, filename: string) {
  const safe = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.\./g, '__')        // kill any traversal even mid-name
    .slice(-80)
    .replace(/^[._-]+/, '')
  const rand = Math.random().toString(36).slice(2, 10)
  return `${userId}/${Date.now()}-${rand}-${safe || 'file'}`
}

export function formatBytes(bytes?: number | null) {
  if (!bytes || bytes < 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function safeExternalUrl(url?: string | null) {
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : null
}

export function uniqueBy<T>(arr: T[], key: (item: T) => string) {
  const seen = new Set<string>()
  return arr.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function groupBy<T>(arr: T[], key: (item: T) => string) {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const k = key(item)
    ;(acc[k] ||= []).push(item)
    return acc
  }, {})
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function titleCase(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
