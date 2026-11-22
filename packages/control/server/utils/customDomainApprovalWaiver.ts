import { siteCardSettings } from '../../../core/server/utils/siteCard'
import { healthConfirmsSiteCardWrite } from '../../shared/customDomain'

/**
 * ENTFÄLLT DIE FREIGABE-PFLICHT FÜR EIGENE DOMAINS? (PK1 E1c, K6 — Davids
 * Entscheidung: „fällt weg, wenn E1 live ist; solange der Schalter auf
 * Production AUS ist, bleibt die Pflicht dort bestehen; beides hängt am
 * selben Schalter".)
 *
 * Die Pflicht prüft die KONSOLE (diese App, Control Plane). Die Karten, die
 * eine eigene Domain erst sicher machen, gelten aber in der PLATFORM (Pool,
 * Kundendomains). Darum zwei Bedingungen, beide müssen ja sein:
 *  1. der EIGENE Schalter steht auf `write` und hat einen brauchbaren
 *     Schlüssel (`siteCardSettings()`) — sonst wird die Platform gar nicht
 *     erst gefragt;
 *  2. die PLATFORM bestätigt dasselbe über ihr öffentliches `/api/health`
 *     (`siteCard.mode === 'write'`, `cards === true`; nur lesend, ohne
 *     Geheimnis; Adresse `runtimeConfig.customDomainPlatformHealthUrl`).
 *
 * FAIL-CLOSED: keine Adresse, keine Antwort, Frist, kein JSON, fehlendes Feld
 * ⇒ die Pflicht BLEIBT. Eine Konsole, die zu früh auf `write` steht, öffnet
 * also nichts, solange die Platform nicht bestätigt — Reihenfolge im Runbook
 * `docs/runbooks/PK1-EINSCHALTEN.md` (Platform zuerst, Konsole zuletzt).
 *
 * ZWISCHENSPEICHER je Prozess: ein „ja" gilt 60 s, ein „nein" 30 s; ein
 * Wechsel schreibt EINE Log-Zeile `community.custom_domain_approval_waiver`.
 * Die Testphasen-Sperre berührt das nicht (`customDomainEntitlement`).
 */

const YES_TTL_MS = 60_000
const NO_TTL_MS = 30_000
const FETCH_TIMEOUT_MS = 3_000

let cached: { waived: boolean, expiresAt: number } | null = null
let lastLogged: boolean | null = null

/** Für Tests: Zwischenspeicher leeren. */
export function resetCustomDomainApprovalWaiver(): void {
  cached = null
  lastLogged = null
}

function remember(waived: boolean, reason: string, now: number): boolean {
  cached = { waived, expiresAt: now + (waived ? YES_TTL_MS : NO_TTL_MS) }
  if (lastLogged !== waived) {
    lastLogged = waived
    logEvent(waived ? 'info' : 'warn', 'community.custom_domain_approval_waiver', { waived, reason })
  }
  return waived
}

async function platformConfirms(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      redirect: 'error',
      headers: { accept: 'application/json', 'user-agent': 'pukalani-console/1 (site-card-check)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) return false
    return healthConfirmsSiteCardWrite(await response.json())
  }
  catch {
    // Ausfall, Frist, kein JSON: keine Bestätigung ⇒ die Pflicht bleibt.
    // Bewusst ohne `softFail`-Zeile: der Wechsel steht in `remember`.
    return false
  }
}

export async function customDomainApprovalWaived(now: number = Date.now()): Promise<boolean> {
  if (cached && now < cached.expiresAt) return cached.waived

  const own = siteCardSettings()
  if (own.mode !== 'write' || own.keys.length === 0) return remember(false, 'console_not_write', now)

  const url = String((useRuntimeConfig() as { customDomainPlatformHealthUrl?: unknown }).customDomainPlatformHealthUrl ?? '').trim()
  if (!url) return remember(false, 'platform_url_missing', now)

  return await platformConfirms(url)
    ? remember(true, 'platform_confirms_write', now)
    : remember(false, 'platform_not_confirmed', now)
}
