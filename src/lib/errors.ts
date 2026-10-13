/** Normalises anything thrown by Supabase/JS into a safe, user-facing message. */
export function toMessage(error: unknown): string {
  if (!error) return 'Something went wrong.'
  if (typeof error === 'string') return error
  const anyErr = error as { message?: string; code?: string; details?: string }
  if (anyErr.code === '23505') return 'That record already exists.'
  if (anyErr.code === '23503') return 'A related record is missing or still referenced.'
  if (anyErr.code === '23514') return 'Some values failed validation.'
  if (anyErr.code === '42501' || /row-level security/i.test(anyErr.message ?? '')) {
    return 'You do not have permission to do that.'
  }
  if (anyErr.code === 'PGRST116') return 'That record no longer exists.'
  const msg = anyErr.message ?? 'Unexpected error.'
  // Never surface raw SQL / internal identifiers to the UI.
  return msg.replace(/^select \*\ from.*$/i, 'Not authorised.').slice(0, 220)
}

export function isPermissionError(error: unknown) {
  const anyErr = error as { code?: string; message?: string }
  return anyErr?.code === '42501' || /row-level security|permission denied/i.test(anyErr?.message ?? '')
}
