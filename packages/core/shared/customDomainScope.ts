/**
 * EIGENE DOMAIN: MITMACHEN JA, VERWALTEN NEIN (PK1, Etappe E1b-2; Plan
 * `docs/plans/PUKALANI-KONTO-E1.md`, § 3 und § 5 A).
 *
 * Gilt NUR im Modus `write` des Schalters `NUXT_SITE_CARD_MODE` und NUR auf
 * einer eigenen Domain einer Community (`isCustomDomainHost`). Dort darf man
 * lesen, schreiben und moderieren wie bisher; Kontoweites (Passwort, E-Mail,
 * Zwei-Faktor, Geräte, Export, Löschen) und Verwaltendes (Dashboard, Team,
 * Einstellungen, Plan, Branding, Community-Wechsel) gibt es dort nicht. Das
 * steht im Kundenbereich bzw. unter der Pukalani-Adresse der Community.
 *
 * ERLAUBNISLISTE STATT SPERRLISTE (§ 10 „Umgekehrt bauen"): unter einer
 * eigenen Domain antwortet JEDE `/api/**`-Route mit 404, außer
 *  - sie liegt unter den `apiPrefixes` eines Layers der Art `product`
 *    (aus den registrierten Manifesten — eine neue Produkt-Route ist damit
 *    von selbst dabei), und nicht unter `/api/admin`;
 *  - oder sie steht unten in `CUSTOM_DOMAIN_API_ALLOWED`, mit Grund. Eine neue
 *    Route des Core (oder eines Fundament-/Naht-Layers) ist dort also
 *    verboten, bis jemand sie mit Grund einträgt.
 * Wächter: `packages/core/tests/customDomainScope.test.ts` (über ALLE Routen).
 *
 * Die Middleware dazu: `core/server/middleware/01.custom-domain-scope.ts`;
 * die Ausnahmen bei der Umleitung: `core/server/middleware/00.tenant.ts`.
 */

/** Ein Eintrag der Erlaubnisliste. `prefix` gilt an der Segmentgrenze. */
export interface CustomDomainApiEntry {
  path: string
  match: 'exact' | 'prefix'
  /** Nur diese Methoden (groß geschrieben); ohne Angabe jede. */
  methods?: readonly string[]
  reason: string
}

/**
 * Routen außerhalb der Produkt-Präfixe, die eine Community-Seite zum
 * Mitmachen braucht. Gefunden über das, was die Seiten und ihre Bausteine im
 * Browser aufrufen (nicht das Dashboard, nicht der Kundenbereich).
 */
export const CUSTOM_DOMAIN_API_ALLOWED: readonly CustomDomainApiEntry[] = [
  // ── Betrieb und Rahmen der Seite ─────────────────────────────────────────
  { path: '/api/health', match: 'exact', reason: 'Betriebsprüfung, ohne Konto und ohne Mandanten-Daten.' },
  { path: '/api/_nuxt_icon', match: 'prefix', reason: 'Symbole der Seite (@nuxt/icon), statische SVG-Pfade ohne Konto.' },
  { path: '/api/config', match: 'exact', reason: 'Öffentliche Konfiguration, die jede Seite beim Start liest.' },
  { path: '/api/themes', match: 'exact', reason: 'Farbwelt der Seite (system-Layer), öffentlich lesbar.' },
  { path: '/api/fonts', match: 'exact', reason: 'Schriften der Seite (system-Layer), öffentlich lesbar.' },
  { path: '/api/telemetry', match: 'prefix', reason: 'Fehler- und CSP-Meldungen des Browsers (Fehler-Inbox), nimmt nur an.' },
  { path: '/api/stats-event', match: 'exact', reason: 'Seitenaufrufe der Community-Statistik (Analytics-Skript der Seite).' },
  { path: '/api/stats-script.js', match: 'exact', reason: 'Das Statistik-Skript der Seite selbst.' },
  // ── Anmelden, Registrieren, Abmelden ────────────────────────────────────
  { path: '/api/auth/login', match: 'exact', reason: 'Anmelden auf dieser Seite (ergibt eine Karte für diesen Host).' },
  { path: '/api/auth/signup', match: 'exact', reason: 'Registrieren auf dieser Seite.' },
  { path: '/api/auth/otp', match: 'prefix', reason: 'Anmelden und Registrieren per E-Mail-Code (anfordern und einlösen).' },
  { path: '/api/auth/mfa/challenge', match: 'exact', reason: 'Zweiter Schritt der Anmeldung bei Konten mit Zwei-Faktor (nur einlösen, nicht einrichten).' },
  { path: '/api/auth/oauth', match: 'prefix', reason: 'Anmelden über einen Anbieter (Start und Rückkehr auf diese Seite).' },
  { path: '/api/auth/verification', match: 'exact', reason: 'E-Mail-Adresse nach dem Registrieren bestätigen (ändert sie nicht).' },
  { path: '/api/auth/logout', match: 'exact', reason: 'Abmelden auf dieser Seite.' },
  { path: '/api/auth/me', match: 'exact', reason: 'Wer ist angemeldet? Der Auth-Store jeder Seite fragt das.' },
  { path: '/api/auth/consent', match: 'exact', reason: 'Verlangte Zustimmungen lesen und geben (AGB/Datenschutz dieser Seite).' },
  { path: '/api/auth/site-session', match: 'exact', reason: 'Einlösen des Siegels beim Wechsel aus dem Kundenbereich auf diese Seite.' },
  { path: '/api/auth/embed-session', match: 'exact', reason: 'Einlösen der Anmeldung im eingebetteten Fenster (Kommentare auf fremden Seiten).' },
  { path: '/api/auth/embed-handoff', match: 'exact', reason: 'Anmelde-Fenster der Einbettung: siegelt für DENSELBEN Host, verlässt ihn nicht.' },
  // ── Mitmachen in der Community ──────────────────────────────────────────
  { path: '/api/community/role', match: 'exact', reason: 'Eigene Rolle in dieser Community (welche Knöpfe die Seite zeigt).' },
  { path: '/api/community/team', match: 'exact', reason: 'Öffentliche Team-Liste der Über-uns-Seite (lesend).' },
  { path: '/api/community/members/accept', match: 'exact', reason: 'Beitritt: Einladung in diese Community annehmen.' },
  { path: '/api/community/invites/mine', match: 'exact', reason: 'Beitritt: eigene offene Einladungen in diese Community.' },
  { path: '/api/community/invites/preview', match: 'exact', reason: 'Beitritt: Einladungs-Seite ohne Anmeldung (der Code ist der Beweis).' },
  { path: '/api/community/removed-contact', match: 'exact', reason: 'Hinweisseite für ehemalige Mitglieder: Nachricht an das Team dieser Community.' },
  { path: '/api/notifications', match: 'exact', reason: 'Eigene Benachrichtigungen (Glocke), gefiltert auf diese Community.' },
  { path: '/api/notifications/read', match: 'exact', reason: 'Eigene Benachrichtigungen als gelesen markieren.' },
  { path: '/api/live/realtime', match: 'exact', methods: ['GET'], reason: 'Live-Verbindung über unseren Server (PK1 E1d): nur die Karte dieser Seite, nur Kanäle dieser Community.' },
  { path: '/api/presence', match: 'prefix', reason: 'Anwesenheit auf dieser Seite (Herzschlag, Verlassen, Zahl).' },
  { path: '/api/handles/search', match: 'exact', reason: 'Erwähnungen im Editor (Beiträge, Nachrichten).' },
  { path: '/api/storage', match: 'prefix', methods: ['GET', 'HEAD'], reason: 'Profilbilder ANZEIGEN (kontoweite Ablage der Avatare). Hochladen und Löschen sind Konto-Einstellungen und bleiben 404.' },
  { path: '/api/reports', match: 'prefix', reason: 'Melden und Moderieren (moderation-Layer, Art foundation) — „moderieren wie bisher".' },
  { path: '/api/abuse/report', match: 'exact', reason: 'Öffentliches Formular „Missbrauch melden", ohne Konto.' },
]

/**
 * Immer 404 auf einer eigenen Domain — auch wenn ein Produkt-Präfix sie deckt
 * (der comments-Layer führt Verwaltungs-Routen unter `/api/admin/…`).
 */
export const CUSTOM_DOMAIN_API_DENIED_PREFIXES: readonly string[] = ['/api/admin']

/** Präfix-Vergleich an der Segmentgrenze (wie `04.product-gate.ts`). */
export function matchesApiPrefix(path: string, prefix: string): boolean {
  const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  if (!base) return false
  return path === base || path.startsWith(`${base}/`) || path.startsWith(`${base}?`)
}

function stripQuery(path: string): string {
  return path.split('?')[0] ?? ''
}

/**
 * Steht dieser Pfad auf der Erlaubnisliste des Core? Liefert den Eintrag.
 * Ohne `method` zählt nur der Pfad (Wächter über die Routen-Dateien).
 */
export function customDomainAllowedEntry(path: string, method?: string): CustomDomainApiEntry | null {
  const clean = stripQuery(path)
  const verb = method?.toUpperCase()
  return CUSTOM_DOMAIN_API_ALLOWED.find(entry =>
    (entry.match === 'exact' ? clean === entry.path : matchesApiPrefix(clean, entry.path))
    && (!verb || !entry.methods || entry.methods.includes(verb)),
  ) ?? null
}

/**
 * PURE: darf dieser Pfad auf einer eigenen Domain antworten? Nicht-API-Pfade
 * prüft die Regel nicht (Seiten, `/_nuxt`, `/_i18n`). `productPrefixes` sind
 * die `apiPrefixes` aller registrierten Layer der Art `product`.
 */
export function isCustomDomainApiAllowed(path: string, productPrefixes: readonly string[], method?: string): boolean {
  const clean = stripQuery(path)
  if (!clean.startsWith('/api/')) return true
  if (CUSTOM_DOMAIN_API_DENIED_PREFIXES.some(prefix => matchesApiPrefix(clean, prefix))) return false
  if (productPrefixes.some(prefix => matchesApiPrefix(clean, prefix))) return true
  return customDomainAllowedEntry(clean, method) !== null
}

/** Sprach-Präfix der Seiten (`prefix_except_default`, de + en). */
const LOCALE_PREFIX = /^\/(?:de|en)(?=\/|$)/

/**
 * Klein geschrieben (der Vue-Router vergleicht Pfade ohne Groß/klein — `/Dashboard`
 * öffnet dieselbe Seite) und ohne Sprach-Präfix.
 */
function withoutLocale(path: string): string {
  return stripQuery(path).toLowerCase().replace(LOCALE_PREFIX, '') || '/'
}

function matchesPagePrefix(clean: string, page: string): boolean {
  return clean === page || clean.startsWith(`${page}/`)
}

/**
 * PURE: ist das eine VERWALTUNGS-Seite der Community? Heute heißen sie alle
 * `/dashboard/**` (admin-, onboarding-, themes-Layer und die Produkt-Layer),
 * mit oder ohne Sprach-Präfix.
 */
export function isManagementPagePath(path: string): boolean {
  return matchesPagePrefix(withoutLocale(path), '/dashboard')
}

/**
 * Konto-Seiten des Kundenbereichs (dieselben vier wie `CONTROL_ONLY_PATHS` im
 * onboarding-Layer; der Core kennt den Layer nicht, darum hier benannt):
 * Profil, Einstellungen mit Sicherheit, Geräten, Export und Löschen, „Meine
 * Communities" und das Anlegen. Auf einem Community-Host gibt es sie nicht
 * (404); auf einer eigenen Domain im Modus `write` führt ein Aufruf per 302
 * in den Kundenbereich.
 */
export const ACCOUNT_AREA_PAGES = ['/profile', '/settings', '/communities', '/start'] as const

/** PURE: gehört diese Seite in den Kundenbereich (s. `ACCOUNT_AREA_PAGES`)? */
export function isAccountAreaPagePath(path: string): boolean {
  const clean = withoutLocale(path)
  return ACCOUNT_AREA_PAGES.some(page => matchesPagePrefix(clean, page))
}

/** Anmelde-Seiten, über die man unter der Pukalani-Adresse ins Dashboard kommt. */
const SIGN_IN_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify'] as const

/**
 * PURE: bleibt diese Anfrage auf der Pukalani-Adresse einer Community, deren
 * kanonische Adresse eine eigene Domain ist (statt umgeleitet zu werden)?
 * Verwaltungs-Seiten, die Anmelde-Seiten davor, alle `/api/**`-Anfragen dieser
 * Seiten und Nuxts interne Pfade (`/_nuxt`, `/__nuxt_error`, …).
 */
export function staysOnPukalaniAddress(path: string): boolean {
  const raw = stripQuery(path)
  if (raw.startsWith('/api/') || raw.startsWith('/_')) return true
  if (isManagementPagePath(raw)) return true
  const clean = withoutLocale(raw)
  return SIGN_IN_PAGES.some(page => matchesPagePrefix(clean, page))
}

/**
 * Adresse des Kundenbereichs (erster Kontroll-Host), für Hinweise auf einer
 * eigenen Domain. Lokal (`*.localhost`) trägt der Link den Port der laufenden
 * Seite. Leer, wenn kein Kontroll-Host eingestellt ist.
 */
export function accountAreaUrl(controlHosts: readonly string[], currentPort = ''): string {
  const host = controlHosts.map(entry => entry.trim().toLowerCase()).find(entry => entry !== '')
  if (!host) return ''
  const local = host === 'localhost' || host.startsWith('localhost:') || host.endsWith('.localhost') || /\.localhost:\d+$/.test(host)
  const origin = `${local ? 'http' : 'https'}://${host}`
  return local && currentPort && !host.includes(':') ? `${origin}:${currentPort}` : origin
}

/** Was das Konto-Menü einer Community-Seite zeigt (UserMenu). */
export interface AccountMenuLinks {
  /** „Verwalten": das Dashboard dieser Seite, der Kundenbereich oder nichts. */
  manage: { kind: 'dashboard' } | { kind: 'external', href: string } | null
  /** Hinweis „Konto und Sicherheit" mit Link in den Kundenbereich. */
  accountHref: string | null
}

/**
 * PURE (UserMenu): Auf einer eigenen Domain im Modus `write` führt
 * „Verwalten" in den Kundenbereich (das Dashboard liegt unter der
 * Pukalani-Adresse, Owner kommen über „Meine Communities" dorthin), und ein
 * Hinweis zeigt, wo Konto, Geräte, Export und Löschen liegen. Überall sonst
 * bleibt das Menü wie vorher. Ohne eingestellten Kundenbereich lieber kein
 * Link als einer ins Leere.
 */
export function accountMenuLinks(input: { scope: boolean, canDashboard: boolean, accountUrl: string }): AccountMenuLinks {
  if (!input.scope) {
    return { manage: input.canDashboard ? { kind: 'dashboard' } : null, accountHref: null }
  }
  const href = input.accountUrl || null
  return {
    manage: input.canDashboard && href ? { kind: 'external', href: `${href}/communities` } : null,
    accountHref: href,
  }
}
