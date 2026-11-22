import { siteCardSettings } from '../../../core/server/utils/siteCard'
import { healthConfirmsApprovalWaiver, platformHealthUrlAllowed } from '../../shared/customDomain'

/**
 * ENTFÄLLT DIE FREIGABE-PFLICHT FÜR EIGENE DOMAINS? (PK1 E1c, K6 — Davids
 * Entscheidung: „fällt weg, wenn E1 live ist; solange der Schalter auf
 * Production AUS ist, bleibt die Pflicht dort bestehen; beides hängt am
 * selben Schalter".)
 *
 * „E1 live" heißt ALLES aus E1, auch E1d (Live-Verbindung unter eigenen
 * Domains über unseren Server, Davids K4, Plan § 13.3 Weg 3) — bis dahin hat
 * eine eigene Domain keine Live-Verbindung mit Konto. Darum verlangt die
 * Aufhebung von der Platform zusätzlich `siteCard.liveRelay === true`; dieses
 * Merkmal meldet die Platform erst mit E1d. HEUTE BLEIBT DIE PFLICHT ALSO
 * IMMER (Gegenlesen E1c, Fund 1).
 *
 * Die Pflicht prüft die KONSOLE (diese App, Control Plane). Die Karten gelten
 * aber in der PLATFORM. Darum zwei Bedingungen, beide müssen ja sein:
 *  1. der EIGENE Schalter steht auf `write` und hat einen brauchbaren
 *     Schlüssel (`siteCardSettings()`) — sonst wird die Platform gar nicht
 *     erst gefragt;
 *  2. die PLATFORM bestätigt über ihr öffentliches `/api/health`
 *     `siteCard.mode === 'write'`, `cards === true` UND `liveRelay === true`
 *     (nur lesend, ohne Geheimnis; Adresse
 *     `runtimeConfig.customDomainPlatformHealthUrl`, Vorgabe LEER, nur
 *     `https:` oder ein lokaler Host).
 *
 * FAIL-CLOSED: keine Adresse, keine Antwort, Frist, kein JSON, fehlendes Feld
 * ⇒ die Pflicht BLEIBT. Für den Fristen-Lauf unterscheidet `answered`
 * zusätzlich „die Platform hat geantwortet und bestätigt nicht" (Pflicht gilt
 * wie heute) von „die Frage kam nicht zustande" (dann startet der Lauf für
 * fehlende Freigaben keine Schonfrist, `decideCustomDomainSweep`).
 *
 * ZWISCHENSPEICHER je Prozess: ein „ja" gilt 60 s, ein „nein" 30 s; ein
 * Wechsel schreibt EINE Log-Zeile `community.custom_domain_approval_waiver`
 * (beim ersten Aufruf einer Domain-Route bzw. des Fristen-Laufs). Die
 * Testphasen-Sperre berührt das nicht (`customDomainEntitlement`).
 */

const YES_TTL_MS = 60_000
const NO_TTL_MS = 30_000
const FETCH_TIMEOUT_MS = 3_000

export interface CustomDomainApprovalWaiverState {
  /** Die Pflicht entfällt. */
  waived: boolean
  /** Die Frage ist beantwortet (eigener Schalter sagt nein, oder die Platform hat geantwortet). */
  answered: boolean
}

let cached: { state: CustomDomainApprovalWaiverState, expiresAt: number } | null = null
let lastLogged: string | null = null

/** Für Tests: Zwischenspeicher leeren. */
export function resetCustomDomainApprovalWaiver(): void {
  cached = null
  lastLogged = null
}

function remember(state: CustomDomainApprovalWaiverState, reason: string, now: number): CustomDomainApprovalWaiverState {
  cached = { state, expiresAt: now + (state.waived ? YES_TTL_MS : NO_TTL_MS) }
  const key = `${state.waived}:${state.answered}`
  if (lastLogged !== key) {
    lastLogged = key
    logEvent(state.waived ? 'info' : 'warn', 'community.custom_domain_approval_waiver', { waived: state.waived, answered: state.answered, reason })
  }
  return state
}

/** `null` = keine Antwort (Ausfall, Frist, Fehlerstatus, kein JSON). */
async function askPlatform(url: string): Promise<boolean | null> {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      headers: { accept: 'application/json', 'user-agent': 'pukalani-console/1 (site-card-check)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return null
    return healthConfirmsApprovalWaiver(await response.json())
  }
  catch {
    // Ausfall, Frist, kein JSON: keine Antwort ⇒ die Pflicht bleibt.
    // Bewusst ohne `softFail`-Zeile: der Wechsel steht in `remember`.
    return null
  }
}

export async function customDomainApprovalWaiverState(now: number = Date.now()): Promise<CustomDomainApprovalWaiverState> {
  if (cached && now < cached.expiresAt) return cached.state

  const own = siteCardSettings()
  if (own.mode !== 'write' || own.keys.length === 0) return remember({ waived: false, answered: true }, 'console_not_write', now)

  const url = String((useRuntimeConfig() as { customDomainPlatformHealthUrl?: unknown }).customDomainPlatformHealthUrl ?? '').trim()
  if (!platformHealthUrlAllowed(url)) return remember({ waived: false, answered: false }, url ? 'platform_url_rejected' : 'platform_url_missing', now)

  const confirmed = await askPlatform(url)
  if (confirmed === null) return remember({ waived: false, answered: false }, 'platform_unanswered', now)
  return confirmed
    ? remember({ waived: true, answered: true }, 'platform_confirms', now)
    : remember({ waived: false, answered: true }, 'platform_not_confirmed', now)
}

/** Kurzform für die Tür und die Seite: entfällt die Pflicht? */
export async function customDomainApprovalWaived(now: number = Date.now()): Promise<boolean> {
  return (await customDomainApprovalWaiverState(now)).waived
}
