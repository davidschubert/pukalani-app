/**
 * DIE TÜR OHNE ZUSTIMMUNG (SEC-007, Davids Entscheidung 2026-11-16, „Tür zu
 * und einmal fragen"): wer in einer App, die AGB verlangt, keine
 * festgehaltene Zustimmung hat, kann lesen, aber nichts anlegen, kaufen oder
 * KI-Läufe starten. Die Tür selbst: `server/middleware/07.consent-required.ts`.
 *
 * Der pure Teil: WELCHE Anfragen sie prüft. Lesen (GET/HEAD/OPTIONS) nie;
 * schreibende API-Anfragen immer, außer auf der Erlaubnisliste unten.
 *
 * FAIL-CLOSED: Präfix-Vergleich an der Segmentgrenze (`/api/authx` ist nicht
 * `/api/auth/`), mehrdeutige Pfade (Punkt-Segmente, `//`, Rückstrich,
 * Prozent-Kodierung) stehen nie auf der Liste. Layer können die Liste in
 * dieser ersten Fassung NICHT erweitern.
 */

export interface ConsentGateAllowance {
  prefix: string
  reason: string
}

export const CONSENT_GATE_ALLOWED_API: readonly ConsentGateAllowance[] = [
  {
    prefix: '/api/auth/',
    reason: 'Konto und Sitzung: Anmelden, Abmelden, zweiter Faktor, Passwort, Profil — und die Nachfrage selbst '
      + '(`/api/auth/consent`). Dazu Auskunft (`GET /api/auth/export`) und Löschung (`DELETE /api/auth/account`) '
      + 'des eigenen Kontos: diese Rechte hängen nicht an einer Zustimmung.',
  },
  {
    prefix: '/api/telemetry/',
    reason: 'Fehlermeldungen des Browsers: Betrieb, legt nichts für das Konto an.',
  },
  {
    prefix: '/api/presence/',
    reason: 'Anwesenheit (Heartbeat/Verlassen): gehört zum Lesen, legt keine Inhalte an.',
  },
  {
    prefix: '/api/health',
    reason: 'Betriebsprüfung ohne Sitzungsdaten.',
  },
]

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function matchesPrefix(path: string, prefix: string): boolean {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  if (!base) return false
  return path === base || path.startsWith(`${base}/`)
}

function ambiguousPath(path: string): boolean {
  return /(^|\/)\.\.?(\/|$)|\/\/|\\|%/.test(path)
}

/** Steht dieser API-Pfad (ohne Query) auf der Erlaubnisliste? */
export function consentGateAllowed(path: string): boolean {
  if (ambiguousPath(path)) return false
  return CONSENT_GATE_ALLOWED_API.some(entry => matchesPrefix(path, entry.prefix))
}

/** Lesende Methode? Die Tür prüft sie nie. */
export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase())
}

/**
 * Muss die Tür für diese Anfrage eine festgehaltene Zustimmung sehen?
 * `path` ohne Query.
 */
export function consentGateApplies(method: string, path: string): boolean {
  if (path !== '/api' && !path.startsWith('/api/')) return false
  if (isSafeMethod(method)) return false
  return !consentGateAllowed(path)
}
