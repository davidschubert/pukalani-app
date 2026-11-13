import { Redis } from 'ioredis'
import type { H3Event } from 'h3'

/**
 * Geteilter Rate-Limit-Store (OPEN-ITEMS #8, Beschluss 2026-07-22: Redis auf
 * app-prod). Zwei Backends hinter EINEM Interface:
 *  - NUXT_REDIS_URL gesetzt → Redis (Fixed-Window: INCR + PEXPIRE, wenn noch
 *    kein Ablauf steht, als EIN Lua-Skript) — alle pm2-Instanzen/Cluster-
 *    Worker EINER App teilen die Zählung.
 *  - leer → In-Memory pro Instanz (Dev/Single-Instanz, bisheriges Verhalten
 *    in Fixed-Window-Semantik).
 *
 * Semantik-Wechsel ggü. der alten Timestamp-Liste: FIXED window statt sliding
 * (Standard-Muster; am Fensterrand ist kurz das Doppelte möglich — für
 * Brute-Force-/Spam-Budgets unerheblich, dafür O(1) und Redis-tauglich).
 *
 * Fail-open: stirbt Redis, drosselt der In-Memory-Fallback weiter pro Instanz
 * (lautes Log, max. 1×/min) — ein toter Redis darf NIE alle Requests 500en
 * oder die App ungeschützt lassen.
 *
 * Key-Scoping: mehrere Apps teilen EINE Redis-Instanz auf dem Server — der
 * Store prefixt deshalb mit der Appwrite-Projekt-ID (rl:<projekt>:<key>).
 */

export interface RateLimitState {
  /** Zählerstand im aktuellen Fenster. */
  count: number
  /** Restlaufzeit des Fensters (für Retry-After). */
  resetInMs: number
}

export interface RateLimitStore {
  /** Stand lesen, ohne zu zählen. */
  peek: (key: string, windowMs: number) => Promise<RateLimitState>
  /** Einen Versuch zählen und den neuen Stand liefern. */
  hit: (key: string, windowMs: number) => Promise<RateLimitState>
  /**
   * EINEN Versuch zurückbuchen (SEC-003: Erfolg kostet nichts). Nie unter 0,
   * legt nie einen Schlüssel an und verändert das Fenster nicht — ein
   * abgelaufener Zähler bleibt abgelaufen.
   */
  refund: (key: string, windowMs: number) => Promise<void>
  /** Den Zähler löschen (z. B. nach einem Passwort-Reset). */
  clear: (key: string) => Promise<void>
}

// ── In-Memory (Fixed-Window) ────────────────────────────────────────────────

const PRUNE_THRESHOLD = 1_000

export function createMemoryRateLimitStore(): RateLimitStore {
  const windows = new Map<string, { count: number, resetAt: number }>()

  function current(key: string, windowMs: number, now: number) {
    const entry = windows.get(key)
    if (entry && entry.resetAt > now) return entry
    if (windows.size >= PRUNE_THRESHOLD) {
      for (const [k, w] of windows) {
        if (w.resetAt <= now) windows.delete(k)
      }
    }
    const fresh = { count: 0, resetAt: now + windowMs }
    windows.set(key, fresh)
    return fresh
  }

  return {
    async peek(key, windowMs) {
      const now = Date.now()
      const entry = current(key, windowMs, now)
      return { count: entry.count, resetInMs: entry.resetAt - now }
    },
    async hit(key, windowMs) {
      const now = Date.now()
      const entry = current(key, windowMs, now)
      entry.count += 1
      return { count: entry.count, resetInMs: entry.resetAt - now }
    },
    async refund(key) {
      // Bewusst NICHT über `current()`: das legte einen frischen Eintrag an.
      const entry = windows.get(key)
      if (entry && entry.resetAt > Date.now() && entry.count > 0) entry.count -= 1
    },
    async clear(key) {
      windows.delete(key)
    },
  }
}

// ── Redis (Fixed-Window, atomar per Lua) ────────────────────────────────────

/**
 * Zählen als EIN Skript (SEC-003): früher waren INCR, PEXPIRE (nur bei
 * `count === 1`) und PTTL drei getrennte Befehle. Scheiterte der zweite, blieb
 * ein Schlüssel OHNE Ablauf stehen und sperrte für immer. Hier wird der Ablauf
 * gesetzt, wann immer keiner steht — das heilt auch einen solchen Altschlüssel.
 */
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { count, ttl }
`

/** Zurückbuchen: nur einen bestehenden, positiven Zähler senken (kein Anlegen). */
const REFUND_SCRIPT = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
if current > 0 then
  redis.call('DECR', KEYS[1])
end
return 0
`

export function createRedisRateLimitStore(url: string): RateLimitStore {
  const redis = new Redis(url, {
    // Requests dürfen nie auf einen hängenden Redis warten — schnell scheitern,
    // der Aufrufer fällt auf den Memory-Store zurück.
    connectTimeout: 2_000,
    commandTimeout: 1_000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  })
  // ioredis wirft Verbindungsfehler auch als 'error'-Events — ohne Handler
  // wäre das ein unhandled 'error' (Prozess-Crash)
  redis.on('error', () => {})

  const fallback = createMemoryRateLimitStore()
  let lastWarn = 0
  function warnFailOpen(error: unknown) {
    const now = Date.now()
    if (now - lastWarn > 60_000) {
      lastWarn = now
      console.warn(`[rate-limit] Redis nicht erreichbar — In-Memory-Fallback aktiv (${(error as Error)?.message ?? error})`)
    }
  }
  function failOpen(action: 'peek' | 'hit', key: string, windowMs: number, error: unknown) {
    warnFailOpen(error)
    return fallback[action](key, windowMs)
  }

  return {
    async peek(key, windowMs) {
      try {
        const [count, pttl] = await Promise.all([redis.get(key), redis.pttl(key)])
        return { count: Number(count ?? 0), resetInMs: pttl > 0 ? pttl : windowMs }
      }
      catch (error) {
        return failOpen('peek', key, windowMs, error)
      }
    },
    async hit(key, windowMs) {
      try {
        const [count, pttl] = await redis.eval(HIT_SCRIPT, 1, key, windowMs) as [number, number]
        return { count: Number(count), resetInMs: pttl > 0 ? Number(pttl) : windowMs }
      }
      catch (error) {
        return failOpen('hit', key, windowMs, error)
      }
    },
    async refund(key, windowMs) {
      try {
        await redis.eval(REFUND_SCRIPT, 1, key)
      }
      catch (error) {
        warnFailOpen(error)
        await fallback.refund(key, windowMs)
      }
    },
    async clear(key) {
      try {
        await redis.del(key)
      }
      catch (error) {
        warnFailOpen(error)
        await fallback.clear(key)
      }
    },
  }
}

// ── Auflösung (einmal pro Prozess) ──────────────────────────────────────────

let resolved: RateLimitStore | null = null
let resolvedPrefix = ''

export function useRateLimitStore(event: H3Event): { store: RateLimitStore, prefix: string } {
  if (!resolved) {
    const config = useRuntimeConfig(event)
    const url = config.redisUrl
    // Mehrere Apps auf EINEM Redis: Projekt-ID trennt die Namensräume
    resolvedPrefix = `rl:${config.public.appwriteProjectId || 'app'}:`
    resolved = url ? createRedisRateLimitStore(url) : createMemoryRateLimitStore()
    if (url) console.info('[rate-limit] geteilter Redis-Store aktiv')
  }
  return { store: resolved, prefix: resolvedPrefix }
}
