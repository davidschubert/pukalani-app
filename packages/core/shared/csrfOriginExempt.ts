/**
 * HERKUNFTSPRÜFUNG: AUSNAHMEN ALS LISTE, NICHT ALS SCHALTER (SEC-004).
 *
 * Die Herkunftsprüfung (server/middleware/03.csrf-origin.ts, Regel in
 * server/utils/csrfOrigin.ts) soll überall an sein. Wo eine Route sie nicht
 * verträgt, steht das HIER — als einzelne Route mit Grund — statt dass eine
 * ganze App den Schutz abschaltet.
 *
 * ── WANN EIN EINTRAG BERECHTIGT IST ───────────────────────────────────────
 * Nur wenn BEIDES zutrifft:
 *  1. Ein BROWSER auf einer FREMDEN Herkunft muss die Route schreibend rufen
 *     (eine fremde Seite, kein Server, kein Daemon — die tragen weder `Origin`
 *     noch `Sec-Fetch-Site` und passieren die Regel ohnehin, s. unten
 *     `CSRF_ORIGINLESS_CALLERS`), und
 *  2. die Route weist den Aufrufer NICHT per Cookie aus, sondern durch etwas,
 *     das eine fremde Seite nicht von selbst mitschickt (eine Signatur, ein
 *     Token im Rumpf, das nur der Berechtigte kennt).
 *
 * ── WANN NIE ──────────────────────────────────────────────────────────────
 * Eine Route, die eine Sitzung (Cookie) liest, bekommt NIE einen Eintrag —
 * genau sie schützt die Prüfung. „Der Aufruf kommt beim Server-Rendern ohne
 * Origin" ist ebenfalls KEIN Grund: ein Seitenaufruf soll beim Rendern nichts
 * Schreibendes auslösen (der Aufruf gehört in den Browser, nach dem Mounten).
 *
 * ── FORM DER EINTRÄGE ─────────────────────────────────────────────────────
 * Methode + EXAKTER Pfad. Platzhalter nur als ganzes Segment (`:id`), keine
 * Präfixe, keine Sternchen: ein Eintrag stellt genau eine Route frei und nie
 * still ihre Nachbarn. Alles Unklare (anderer Pfad-Aufbau, Schrägstrich am
 * Ende, leerer Grund) zählt als „keine Ausnahme" — fail-closed.
 *
 * Wächter: tests/csrfOriginExempt.test.ts (Abgleich), tests/csrf-origin-
 * routes.test.ts (Bestandsliste der origin-losen Aufrufer).
 */

export type CsrfUnsafeMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface CsrfOriginExemptRoute {
  method: CsrfUnsafeMethod
  /** Exakter Pfad ab `/api/`; Platzhalter je Segment als `:name`. */
  path: string
  /** Pflicht: warum ein fremder Browser hier schreiben darf und womit er sich ausweist. */
  reason: string
}

/**
 * HEUTE LEER — keine Route braucht eine Ausnahme. Alle schreibenden Aufrufe
 * ohne Browser-Herkunft (Webhooks, Dienst-Naht, Runner) passieren die Regel
 * schon, weil sie weder `Origin` noch `Sec-Fetch-Site` tragen.
 */
export const CSRF_ORIGIN_EXEMPT_ROUTES: readonly CsrfOriginExemptRoute[] = []

const UNSAFE = new Set<string>(['POST', 'PUT', 'PATCH', 'DELETE'])

function segmentMatches(pattern: string, actual: string): boolean {
  if (pattern.startsWith(':')) {
    // Ein Platzhalter steht für EIN echtes Segment — nie für nichts und nie
    // für einen Pfad-Sprung.
    return pattern.length > 1 && actual !== '' && actual !== '.' && actual !== '..'
  }
  return pattern === actual
}

function routeMatches(route: CsrfOriginExemptRoute, method: string, path: string): boolean {
  if (route.method !== method) return false
  if (!route.reason || route.reason.trim().length === 0) return false
  if (!route.path.startsWith('/api/')) return false
  const want = route.path.split('/')
  const have = path.split('/')
  if (want.length !== have.length) return false
  return want.every((segment, index) => segmentMatches(segment, have[index]!))
}

/**
 * PURE: ist diese Anfrage von der Herkunftsprüfung ausgenommen?
 * `path` ist der reine Pfad ohne Query (`getRequestURL(event).pathname`).
 * `routes` ist nur für Tests überschreibbar.
 */
export function isCsrfOriginExempt(
  method: string,
  path: string,
  routes: readonly CsrfOriginExemptRoute[] = CSRF_ORIGIN_EXEMPT_ROUTES,
): boolean {
  const upper = (method || '').toUpperCase()
  if (!UNSAFE.has(upper)) return false
  if (typeof path !== 'string' || !path.startsWith('/api/') || path.includes('?') || path.includes('#')) return false
  return routes.some(route => routeMatches(route, upper, path))
}

/**
 * KEINE AUSNAHME, SONDERN DIE BEGRÜNDUNG: schreibende Routen, die zu Recht
 * ohne Browser-Herkunft gerufen werden. Ihre Aufrufer sind Server oder
 * Daemons; sie schicken weder `Origin` noch `Sec-Fetch-Site`, also lässt die
 * Regel sie durch („kein Browser im Spiel"). Das ist nur deshalb harmlos,
 * weil keine dieser Routen sich auf ein Cookie verlässt — jede verlangt
 * einen eigenen Ausweis.
 *
 * `markers`: Zeichenketten, die ALLE im Quelltext der Route (ohne
 * Kommentare) stehen müssen. Der Wächter tests/csrf-origin-routes.test.ts
 * ordnet damit jede schreibende Route einer Klasse zu und hält die Anzahl
 * fest; eine neue Route mit eigenem Ausweis, die hier nicht passt, wird rot.
 */
export interface CsrfOriginlessCaller {
  id: string
  /** Wer ruft. */
  caller: string
  /** Womit er sich ausweist (statt eines Cookies). */
  credential: string
  /** Erkennungsmerkmale im Quelltext — alle müssen vorkommen. */
  markers: readonly string[]
  /** Warum diese Routen ohne Browser-Kopfzeilen kommen und das in Ordnung ist. */
  reason: string
}

export const CSRF_ORIGINLESS_CALLERS: readonly CsrfOriginlessCaller[] = [
  {
    id: 'onboarding-seam',
    caller: 'Dienst-Naht: Community-Hosts (platform) und Betreiber-Konsole rufen das Control Plane',
    credential: 'Naht-Geheimnis im Kopf `x-pukalani-onboarding-secret`, konstant-zeitig geprüft',
    markers: ['requireOnboardingCaller('],
    reason: 'Server-zu-Server über `callControlPlane`; kein Browser, kein Cookie.',
  },
  {
    id: 'control-seam',
    caller: 'Dienst-Naht: das Control Plane ruft eine Site (Domain-Abschluss)',
    credential: 'Naht-Geheimnis, geprüft durch `requireControlCaller`',
    markers: ['requireControlCaller('],
    reason: 'Server-zu-Server; kein Browser, kein Cookie.',
  },
  {
    id: 'runner-bearer',
    caller: 'AI-Runner-Daemon auf einem Rechner des Betreibers',
    credential: 'Bearer-Token im Kopf `authorization`, gehasht gespeichert (`requireRunner`)',
    markers: ['requireRunner('],
    reason: 'Daemon-Prozess, kein Browser; der Token ist sein einziger Ausweis.',
  },
  {
    id: 'stripe-webhook',
    caller: 'Stripe (Webhook)',
    credential: 'Signatur im Kopf `stripe-signature`, geprüft mit `constructEvent`',
    markers: ['stripe-signature', 'constructEvent('],
    reason: 'Server-zu-Server; die Signatur über den Rohtext ist der Ausweis.',
  },
  {
    id: 'resend-webhook',
    caller: 'Resend (Webhook, svix)',
    credential: 'Signatur in `svix-signature`/`svix-timestamp`, geprüft mit `checkResendSignature`',
    markers: ['svix-signature', 'checkResendSignature('],
    reason: 'Server-zu-Server; die Signatur über den Rohtext ist der Ausweis.',
  },
  {
    id: 'events-sweep',
    caller: 'Zeitgesteuerter Erinnerungs-Lauf (Cron je Community-Host)',
    credential: 'Naht-Geheimnis im Kopf `x-sweep-key`, konstant-zeitig geprüft',
    markers: ['x-sweep-key', 'seamSecretMatches('],
    reason: 'Server-zu-Server; kein Browser, kein Cookie.',
  },
]
