import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

export const supabaseConfigured = Boolean(
  url && anonKey && !url.includes('YOUR-PROJECT-REF') && !anonKey.includes('YOUR_SUPABASE'),
)

/**
 * Single browser client using the PUBLIC anon key only.
 * All authorization is enforced server-side by Postgres RLS; the anon key
 * intentionally grants nothing on its own.
 */
export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: {
        headers: { 'x-application-name': 'campusos' },
      },
    })
  : (createClient('http://127.0.0.1:54321', 'public-anon-placeholder', {
      auth: { persistSession: false },
    }) as SupabaseClient)

/** Buckets (see supabase/migrations/0001_init.sql §8). */
export const BUCKETS = { official: 'official', personal: 'documents' } as const

/** Hard upload ceiling (10 MB) — validated on both client and server. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const ALLOWED_UPLOAD_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/markdown',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'application/zip',
] as const
