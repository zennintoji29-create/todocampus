import { useEffect, useRef, useState } from 'react'

export type Permission = 'default' | 'granted' | 'denied' | 'unsupported'

/** Browser notifications are strictly opt-in and degrade silently. */
export function useBrowserNotifications() {
  const [permission, setPermission] = useState<Permission>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : (Notification.permission as Permission))

  const request = async () => {
    if (typeof Notification === 'undefined') { setPermission('unsupported'); return 'unsupported' as const }
    const res = await Notification.requestPermission()
    setPermission(res as Permission)
    return res as Permission
  }

  return { permission, request, supported: typeof Notification !== 'undefined' }
}

interface Reminder { id: string; title: string; at: number; body?: string; url?: string }

/**
 * Fires in-app (always) and browser (only if granted) reminders.
 * `seen` is persisted to localStorage so a refresh does not re-notify.
 */
export function useReminders(reminders: Reminder[], enabled = true) {
  const fired = useRef<Set<string>>(new Set(
    typeof localStorage !== 'undefined'
      ? new Set(JSON.parse(localStorage.getItem('campusos.fired-reminders') ?? '[]') as string[])
      : [],
  ))
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setTick((t) => t + 1), 30_000)
    return () => clearInterval(id)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const now = Date.now()
    const newly: string[] = []
    for (const r of reminders) {
      if (fired.current.has(r.id)) continue
      if (r.at <= now && r.at > now - 24 * 3600_000) {
        fired.current.add(r.id)
        newly.push(r.id)
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try { new Notification(r.title, { body: r.body, icon: '/favicon.svg' }) } catch { /* ignore */ }
        }
        window.dispatchEvent(new CustomEvent('campusos:reminder', { detail: r }))
      }
    }
    if (newly.length) {
      localStorage.setItem('campusos.fired-reminders', JSON.stringify([...fired.current].slice(-500)))
    }
  }, [reminders, enabled, tick])
}
