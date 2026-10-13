import { describe, expect, it } from 'vitest'
import { toMessage } from '@/lib/errors'
import { formatBytes, initials, safeExternalUrl, slugify, storageKey, uniqueBy, groupBy, clamp, titleCase } from '@/lib/utils'

describe('error normalisation', () => {
  it('maps known Postgres error codes to safe messages', () => {
    expect(toMessage({ code: '23505' })).toContain('already exists')
    expect(toMessage({ code: '42501' })).toContain('permission')
    expect(toMessage({ code: '23503' })).toContain('missing')
  })
  it('never leaks SQL internals', () => {
    const msg = toMessage({ message: 'select * from auth.users; syntax error at or near "FROM"' })
    expect(msg).not.toMatch(/auth\.users/)
  })
  it('handles plain strings and empty input', () => {
    expect(toMessage('nope')).toBe('nope')
    expect(toMessage(null)).toBe('Something went wrong.')
  })
})

describe('utils', () => {
  it('storageKey prefixes the uid folder and sanitises the name', () => {
    const k = storageKey('u123', '../../weird name!!.pdf')
    expect(k.startsWith('u123/')).toBe(true)
    expect(k).not.toContain('..')
    expect(k.endsWith('.pdf')).toBe(true)
  })
  it('formatBytes', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(999)).toBe('999 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
  })
  it('initials falls back to email', () => {
    expect(initials('Aarav Sharma')).toBe('AS')
    expect(initials(null, 'kr@college.edu')).toBe('KC')
  })
  it('safeExternalUrl rejects non-http', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBeNull()
    expect(safeExternalUrl('https://ok.example')).toBe('https://ok.example')
    expect(safeExternalUrl(null)).toBeNull()
  })
  it('uniqueBy and groupBy', () => {
    expect(uniqueBy([{ id: 1 }, { id: 1 }, { id: 2 }], (x) => String(x.id))).toHaveLength(2)
    expect(groupBy(['a1', 'b2', 'a3'], (s) => s[0]).a).toHaveLength(2)
  })
  it('clamp, slugify, titleCase', () => {
    expect(clamp(15, 0, 10)).toBe(10)
    expect(slugify('Hello World!')).toBe('hello-world')
    expect(titleCase('in_progress')).toBe('In Progress')
  })
})
