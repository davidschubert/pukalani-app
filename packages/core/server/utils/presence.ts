import { Query } from 'node-appwrite'
import type { H3Event } from 'h3'
import { logEvent } from './logEvent'
import { toOnlinePresences, PRESENCE_FRESH_MS, type OnlinePresence, type RawServerPresence } from './presenceFilter'

let presenceScopeWarned = false

/**
 * „Appwrite kurz weg" und „Runtime-Key falsch angelegt" sehen in den
 * best-effort-catches der Presence identisch aus — nämlich nach NICHTS
 * (F44-Regel: die Warnung gehört dorthin, wo etwas verworfen wird). Genau so
 * stand nach dem AH-1-Cutover (2026-08-11) eine Woche lang auf JEDER
 * Pool-Community „0 online", ohne eine einzige Logzeile: der neue
 * account-Runtime-Key war ohne `presences.read`/`presences.write` angelegt
 * (die Runbook-Kurzform „sessions/users/rows/health" — DEPLOYMENT.md verlangt
 * 10 Scopes), und Heartbeat wie Zähler liefen in ein verschlucktes 401.
 *
 * Gewarnt wird NUR beim Scope-Fehler (`general_unauthorized_scope`) — der ist
 * sicher ein Konfigurationsfehler und heilt nie von selbst. Transiente Fehler
 * bleiben bewusst still (Presence ist Zusatzschicht, kein Kernpfad). Einmal
 * pro Prozess: eine Zeile je Heartbeat wäre Lärm, den man wegfiltert.
 */
export function warnPresenceScopeMissingOnce(error: unknown, context: string): void {
  if (presenceScopeWarned) return
  if ((error as { type?: string } | null)?.type !== 'general_unauthorized_scope') return
  presenceScopeWarned = true
  logEvent('warn', 'presence.scope_missing', {
    context,
    message: error instanceof Error ? error.message : String(error),
    hint: 'Dem Appwrite-Runtime-Key fehlen presences.read/presences.write (Soll: docs/runbooks/DEPLOYMENT.md) — Online-Zähler und Anwesenheit bleiben leer, bis die Scopes ergänzt sind.',
  })
}

/** Nur für Tests: Merker leeren. */
export function __resetPresenceScopeWarning(): void {
  presenceScopeWarned = false
}

/**
 * Alle aktuell anwesenden User über die Appwrite **Presences API** (self-hostbar
 * seit 1.9.5). Recency-Filter, Mandanten-Filter + metadata-Mapping stecken in
 * der reinen (getesteten) `toOnlinePresences`. Degradiert auf []. Explizites
 * Limit statt Default 25.
 *
 * Die Presences-API kennt kein tenantId-Prädikat (die metadata ist ein
 * JSON-Blob) — es wird also pool-weit gelesen und HIER auf den Mandanten des
 * Requests eingeengt. Restrisiko: s. Kommentar in api/presence/heartbeat.post.ts.
 */
export async function listOnlinePresences(event: H3Event): Promise<OnlinePresence[]> {
  const tenant = useTenant(event)
  const expectedTenantId = tenant?.mode === 'pool' ? tenant.tenantId : undefined
  try {
    const { presences } = createAdminClient(event)
    // Seitenweise bis zur Erschöpfung (Cap 1000 als Notanker) — ein einzelnes
    // 200er-Fenster würde bei vielen gleichzeitigen Usern Anwesende verschlucken.
    // total wird nicht genutzt → nicht berechnen lassen (Mikro-Optimierung).
    const PAGE = 200
    const all: RawServerPresence[] = []
    for (let offset = 0; offset < 1000; offset += PAGE) {
      const res = await presences.list({ queries: [Query.limit(PAGE), Query.offset(offset)], total: false })
      const batch = (res.presences ?? []) as unknown as RawServerPresence[]
      all.push(...batch)
      if (batch.length < PAGE) break
    }
    return toOnlinePresences(all, Date.now(), PRESENCE_FRESH_MS, expectedTenantId)
  }
  catch (error) {
    warnPresenceScopeMissingOnce(error, 'presence.list')
    return []
  }
}
