/**
 * EIGENE DOMAIN JE COMMUNITY — die puren Regeln (Davids Entscheidungen vom
 * 2026-08-07, DECISION-LOG).
 *
 * Was hier steht, rechnet und entscheidet, ohne irgendetwas zu tun: keine
 * Appwrite-Zeile, kein DNS, kein ploi, kein Nuxt. Genau deshalb steht es hier
 * und nicht in den Routen — dieselbe Rechnung wird an VIER Stellen gebraucht,
 * und vier Kopien wären vier Gelegenheiten, sich zu unterscheiden:
 *
 *   1. das Dashboard (Eingabe prüfen, DNS-Anleitung anzeigen),
 *   2. die Runtime-Route im onboarding-Layer (Vorprüfung),
 *   3. die Control-Plane-Route (die AUTORITÄT — sie glaubt dem Aufrufer nichts),
 *   4. der Tenant-Resolver (welche Hosts gehören zu dieser Community?).
 *
 * ── DIE VIER ENTSCHEIDUNGEN, DIE HIER HÄNGEN ──────────────────────────────
 *
 *  (1) **Ab Plan Pro.** `CUSTOM_DOMAIN_MIN_PLAN` ist die eine Zahl dazu.
 *  (2) **301.** Die Subdomain (`communities.host`) leitet auf die eigene
 *      Domain um, sobald sie aktiv ist; sie bleibt der Rückfall. Umgesetzt in
 *      `00.tenant.ts` anhand von `canonicalHostFor()`.
 *  (3) **Selbstbedienung.** Der Owner trägt ein, das System prüft und schaltet.
 *  (4) **www + Apex automatisch**, eine Form leitet auf die andere um — und
 *      zwar auf die EINGETRAGENE (`customDomainForms()` / `canonicalHostFor()`).
 *
 * ── WARUM DIE EINTRAGUNG NICHT REICHT (Eigentums-Nachweis) ────────────────
 * Eine Domain, die auf unsere IP zeigt, beweist NICHTS über ihren Eigentümer:
 * eine verwaiste Domain kann einen alten A-Record auf uns behalten, und dann
 * könnte eine fremde Community sie beanspruchen und die Adresse übernehmen.
 * Deshalb zwei unabhängige Prüfungen (`customDomainDns.ts`):
 *   - ein TXT-Record `_pukalani-verify.<basis>` mit einem Token, das an GENAU
 *     DIESE Community gebunden ist ⇒ „ich darf über diese Zone bestimmen",
 *   - ein A-/CNAME-Record, der auf uns zeigt ⇒ „ich will hierher".
 * Beides muss halten. Das Token steht in der `communities`-Row und ist nur für
 * den Owner dieser Community sichtbar — eine zweite Community bekommt ein
 * anderes und kann den fremden Record nicht benutzen.
 */

import { OPERATOR_APEX } from '../schemas/tenant'
import { isTrialActive } from './onboarding'
import { normalizeTenantPlan, type TenantPlan } from './types/tenantRecord'

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Die Stufen, die eine eigene Domain durchläuft. BEWUSST eine Kette und kein
 * Ja/Nein: der Owner soll sehen, WO es hängt, statt vor einem stummen
 * „funktioniert nicht" zu stehen.
 *
 *   none            — keine eigene Domain eingetragen (Normalfall)
 *   pending_dns     — eingetragen, aber TXT und/oder A/CNAME fehlen noch
 *   pending_cert    — DNS steht, das Zertifikat ist beantragt/unterwegs
 *   pending_platform— TLS steht, die Appwrite-Web-Platform fehlt noch (ohne
 *                     sie ist auf der Domain jede Realtime tot — F45)
 *   active          — die Domain ist die kanonische Adresse der Community
 *   error           — ein Schritt ist hart gescheitert, `customDomainError`
 *                     trägt den Text, den der Owner liest
 *   paused          — ABGESCHALTET (control-040, BE-014/SEC-022): nach dem
 *                     Ende der Frist oder durch den Betreiber. Domain, Token,
 *                     ploi-Tenant und Zertifikat BLEIBEN; die Domain ist
 *                     nicht kanonisch, Besucher werden vorübergehend auf die
 *                     Pukalani-Adresse umgeleitet. „Prüfen" schaltet sie
 *                     wieder ein, sofern `customDomainEntitlement` es erlaubt.
 *
 * `pending_platform` ist eine EIGENE Stufe, obwohl der Schritt automatisiert
 * ist (gemessen am 2026-08-07 gegen die selbst gehostete 1.9.6: eine
 * gewöhnliche Projekt-API-Key genügt für `POST /v1/projects/:id/platforms`).
 * Der Grund ist der Fail-soft-Fall: scheitert der Aufruf, bleibt die Domain
 * sichtbar in dieser Stufe stehen, statt „aktiv" zu behaupten und den Kunden
 * mit einer Seite ohne Live-Aktualisierung sitzen zu lassen.
 */
export const CUSTOM_DOMAIN_STATUSES = [
  'none',
  'pending_dns',
  'pending_cert',
  'pending_platform',
  'active',
  'error',
  'paused',
] as const
export type CustomDomainStatus = (typeof CUSTOM_DOMAIN_STATUSES)[number]

/**
 * PURE: den Spaltenwert lesen — FAIL-CLOSED auf 'none'.
 *
 * Dieselbe Bauart und dieselbe Begründung wie `resolveTenantAudience()`: an
 * dieser Spalte hängt, welcher HOST eine Community bedient. `null` (Rows von
 * vor control-035 — Appwrite backfillt Spalten-Defaults nicht), '' und jeder
 * Tippfehler bedeuten „keine eigene Domain". Ein `!== 'none'`-Vergleich hätte
 * jede Bestands-Row in einen halbaktiven Zustand gehoben.
 */
export function resolveCustomDomainStatus(value: string | null | undefined): CustomDomainStatus {
  return (CUSTOM_DOMAIN_STATUSES as readonly string[]).includes(value ?? '')
    ? value as CustomDomainStatus
    : 'none'
}

/** Zählt diese Domain als LIVE, also als kanonische Adresse der Community? */
export function customDomainIsLive(
  domain: string | null | undefined,
  status: string | null | undefined,
): boolean {
  return Boolean(domain) && resolveCustomDomainStatus(status) === 'active'
}

/**
 * Ist diese Domain ABGESCHALTET (`paused`)? Dann gehört sie der Community noch
 * (Nachweis, Zertifikat und ploi-Tenant bleiben), ist aber NICHT kanonisch:
 * der Resolver löst den Host trotzdem auf, damit `00.tenant.ts` den Besucher
 * VORÜBERGEHEND auf die Pukalani-Adresse umleitet statt 404 zu antworten.
 */
export function customDomainIsParked(
  domain: string | null | undefined,
  status: string | null | undefined,
): boolean {
  return Boolean(domain) && resolveCustomDomainStatus(status) === 'paused'
}

/**
 * Hat diese Community den EIGENTUMS-NACHWEIS schon einmal geführt? Ab
 * `pending_cert` hat das Control Plane den TXT-Record mit IHREM Token gesehen —
 * nur dann blockiert ihr Eintrag die Domain für andere
 * (`customDomainOwnership.ts`). `pending_dns` und `error` sind bloße Einträge.
 */
export function customDomainHasProof(status: string | null | undefined): boolean {
  const resolved = resolveCustomDomainStatus(status)
  return resolved === 'pending_cert' || resolved === 'pending_platform'
    || resolved === 'active' || resolved === 'paused'
}

// ── Plan-Grenze ─────────────────────────────────────────────────────────────

/**
 * Davids Entscheidung 1: eigene Domains gibt es ab **Pro**.
 *
 * ZWEI ORTE, EINE ZAHL — und das ist kein Versehen: `apps/platform` gatet über
 * `pukalani.tenancy.products.customDomain` (das ist die bestehende
 * Plan-Mechanik, die auch die UI-Sichtbarkeit trägt), das CONTROL PLANE kann
 * diese app.config aber nicht lesen (anderes Deployment, anderes Projekt) und
 * braucht seine eigene Wahrheit. Es ist die AUTORITÄT: die Runtime-Route darf
 * sich irren, die Control-Route nicht.
 *
 * Gegen das Auseinanderlaufen steht ein Test, der die app.config-Zeile von
 * `apps/platform` liest und mit dieser Konstante vergleicht
 * (`packages/control/tests/customDomain.test.ts`).
 */
export const CUSTOM_DOMAIN_MIN_PLAN: TenantPlan = 'pro'

/** PURE: darf dieser Plan eine eigene Domain? (Alt-Werte über normalizeTenantPlan) */
export function customDomainAllowedForPlan(plan: string | null | undefined): boolean {
  return normalizeTenantPlan(plan) === CUSTOM_DOMAIN_MIN_PLAN
}

// ── Berechtigung: Plan + keine Testphase + Freigabe (control-040) ───────────

/**
 * Warum eine Community (gerade) keine eigene Domain betreiben darf. Die
 * Reihenfolge ist die der Prüfung und die der Antwort an den Owner: zuerst der
 * Plan (das Merkmal kostet), dann die Testphase, dann die Freigabe.
 */
export const CUSTOM_DOMAIN_DENIALS = ['plan_required', 'trial', 'approval_required'] as const
export type CustomDomainDenial = (typeof CUSTOM_DOMAIN_DENIALS)[number]

export type CustomDomainEntitlement =
  | { allowed: true }
  | { allowed: false, reason: CustomDomainDenial }

/** Der Ausschnitt einer `communities`-Zeile, den die Regel braucht. */
export interface CustomDomainEntitlementInput {
  plan?: string | null
  trialEndsAt?: string | null
  billingStatus?: string | null
  customDomainApproved?: boolean | null
}

/**
 * PURE (unit-getestet): DIE EINE REGEL, ob eine Community eine eigene Domain
 * betreiben darf — Davids Entscheidungen vom 2026-11-16 (SEC-022), gelesen von
 * der Tür der Domain-Routen, vom Zustand für die Seite und vom späteren
 * Fristen-Lauf.
 *
 *  1. Plan nicht Pro ⇒ `plan_required` (Entscheidung 1 vom 2026-08-07).
 *  2. Eine TESTPHASE läuft (Datum in der Zukunft) und es gibt KEIN bezahltes
 *     Abo ⇒ `trial`. Die Testphase setzt den Plan auf `pro` — ohne diese
 *     Zeile verschenkte sie das Merkmal. Ein Kauf während der Testphase
 *     (`billingStatus === 'active'`) zählt als bezahlt.
 *  3. Keine Freigabe des Betreibers (`customDomainApproved !== true`) ⇒
 *     `approval_required` — Übergang bis zum Vorhaben „Pukalani-Konto": wir
 *     schalten jede Community einzeln frei. ENTFÄLLT mit
 *     `approvalWaived: true` (PK1 E1c, Davids Entscheidung K6: die Pflicht
 *     fällt, wenn die Eintrittskarte live ist). Wann das gilt, entscheidet
 *     NUR `customDomainApprovalWaived()`
 *     (`control/server/utils/customDomainApprovalWaiver.ts`): eigener Schalter
 *     auf `write` mit Schlüssel UND die Platform bestätigt dasselbe — im
 *     Zweifel bleibt die Pflicht. Die Testphasen-Sperre (2.) bleibt immer.
 *
 * Ein vom Betreiber gesetzter Pro-Plan ohne Testphasen-Datum ist bezahlt im
 * Sinne dieser Regel (der Betreiber hat entschieden), braucht aber ebenso die
 * Freigabe.
 */
export function customDomainEntitlement(
  row: CustomDomainEntitlementInput,
  now: number,
  options: { approvalWaived?: boolean } = {},
): CustomDomainEntitlement {
  if (!customDomainAllowedForPlan(row.plan)) return { allowed: false, reason: 'plan_required' }
  if (isTrialActive(row.trialEndsAt, now) && row.billingStatus !== 'active') return { allowed: false, reason: 'trial' }
  if (options.approvalWaived !== true && row.customDomainApproved !== true) return { allowed: false, reason: 'approval_required' }
  return { allowed: true }
}

/**
 * PURE (PK1 E1c, K6): bestätigt diese Antwort von `/api/health` der Platform,
 * dass dort Karten geschrieben werden (`siteCard.mode === 'write'` UND
 * `siteCard.cards === true`)? Alles andere — kein JSON, fehlendes Feld (Stand
 * vor E1c), anderer Modus, kein brauchbarer Schlüssel — ist „nein": die
 * Freigabe-Pflicht bleibt.
 */
export function healthConfirmsSiteCardWrite(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const siteCard = (body as { siteCard?: unknown }).siteCard
  if (!siteCard || typeof siteCard !== 'object') return false
  const { mode, cards } = siteCard as { mode?: unknown, cards?: unknown }
  return mode === 'write' && cards === true
}

/** Antwort der Betreiber-Route `POST /api/control/tenants/[id]/custom-domain`
 *  (control-040) — Handler und Seite nennen denselben Typ. */
export interface CustomDomainApprovalResponse {
  id: string
  host: string
  customDomain: string
  customDomainStatus: CustomDomainStatus
  customDomainApproved: boolean
  customDomainApprovedAt: string | null
  customDomainGraceEndsAt: string | null
  customDomainPausedAt: string | null
}

// ── Fristen (control-040, BE-014) ───────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000

/** Wie lange eine aktive Domain nach dem Ende von Testphase oder Abo aktiv
 *  bleibt, bevor sie abgeschaltet wird (Davids Entscheidung, BE-014). */
export const CUSTOM_DOMAIN_GRACE_DAYS = 14
/** Wie lange ein Eintrag OHNE Nachweis gehalten wird (`pending_dns`/`error`). */
export const CUSTOM_DOMAIN_CLAIM_DAYS = 14

/** PURE: das Ende einer Frist, die JETZT beginnt (ISO). */
export function customDomainGraceEnd(now: number): string {
  return new Date(now + CUSTOM_DOMAIN_GRACE_DAYS * DAY_MS).toISOString()
}

/** PURE: bis wann ein Eintrag ohne Nachweis gehalten wird — `null`, wenn es
 *  keinen Eintrag gibt, er schon einen Nachweis hat oder kein Datum trägt. */
export function customDomainClaimExpiresAt(row: {
  customDomain?: string | null
  customDomainStatus?: string | null
  customDomainClaimedAt?: string | null
}): string | null {
  if (!row.customDomain || customDomainHasProof(row.customDomainStatus)) return null
  const status = resolveCustomDomainStatus(row.customDomainStatus)
  if (status !== 'pending_dns' && status !== 'error') return null
  const claimed = Date.parse(row.customDomainClaimedAt ?? '')
  if (!Number.isFinite(claimed)) return null
  return new Date(claimed + CUSTOM_DOMAIN_CLAIM_DAYS * DAY_MS).toISOString()
}

/**
 * PURE: ist dieser Eintrag ohne Nachweis VERFALLEN? Nur `pending_dns` und
 * `error` mit einem Eintragsdatum, das älter als 14 Tage ist. Ein FEHLENDES
 * Datum ist NICHT verfallen (Bestand vor control-040 — das Übernahme-Skript
 * stempelt ihn, die Frist zählt ab dann): lieber einen alten Eintrag einen
 * Lauf länger halten als einen frischen wegräumen.
 */
export function customDomainClaimExpired(row: {
  customDomain?: string | null
  customDomainStatus?: string | null
  customDomainClaimedAt?: string | null
}, now: number): boolean {
  const expiresAt = customDomainClaimExpiresAt(row)
  return expiresAt !== null && Date.parse(expiresAt) <= now
}

// ── Eingabe normalisieren + prüfen ──────────────────────────────────────────

/**
 * PURE: was der Owner tippt → kanonischer Hostname.
 *
 * Menschen tippen `https://www.Beispiel.de/`, gemeint ist `www.beispiel.de`.
 * Schema, Pfad, Query, Port, Benutzerteil und der abschließende Punkt fallen
 * weg; Kleinschreibung wie überall sonst (`normalizeHost` in core macht mit
 * dem REQUEST-Host genau dasselbe — sonst träfen sich die beiden Seiten nie).
 */
export function normalizeCustomDomain(raw: string | null | undefined): string {
  let value = (raw ?? '').trim().toLowerCase()
  if (!value) return ''
  // Schema abschneiden (auch das schema-lose `//host`)
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\/\//, '')
  // Benutzerteil (user:pass@) — kommt aus kopierten URLs
  const at = value.lastIndexOf('@')
  if (at !== -1) value = value.slice(at + 1)
  // Pfad / Query / Fragment
  value = value.split('/')[0] ?? ''
  value = value.split('?')[0] ?? ''
  value = value.split('#')[0] ?? ''
  // Port
  value = value.split(':')[0] ?? ''
  // Wurzel-Punkt (`beispiel.de.` ist DNS-korrekt, als Host-Header aber nie da)
  while (value.endsWith('.')) value = value.slice(0, -1)
  return value
}

/** Warum eine Eingabe abgelehnt wurde — der Schlüssel reist als `reason`
 *  ins Fehler-Envelope und wird im Dashboard übersetzt. */
export const CUSTOM_DOMAIN_REJECTIONS = [
  /** Leer. */
  'empty',
  /** Zu lang (DNS: 253 Zeichen, ein Label 63). */
  'too_long',
  /** Zeichen/Form nicht DNS-konform (Umlaute ⇒ Punycode, keine Unterstriche …). */
  'invalid',
  /** Nur ein Label (`localhost`) oder eine IP — kein registrierbarer Name. */
  'not_a_domain',
  /** Unsere eigene Domain — sonst liefe die Sperrliste RESERVED_SUBDOMAINS leer. */
  'operator_domain',
] as const
export type CustomDomainRejection = (typeof CUSTOM_DOMAIN_REJECTIONS)[number]

export type CustomDomainCheck =
  | { ok: true, domain: string }
  | { ok: false, reason: CustomDomainRejection }

/** DNS-Label-Regeln: a–z, 0–9, Bindestrich (nie am Rand), 1–63 Zeichen. */
const labelRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
/** Vier Zahlenblöcke = IPv4. Eine IP ist keine Domain, die man beglaubigen kann. */
const ipv4Re = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * PURE (unit-getestet): darf diese Eingabe eine Kunden-Domain werden?
 *
 * DIE WICHTIGSTE ZEILE IST `operator_domain`. Ohne sie könnte ein Kunde
 * `login.pukalani.app` als „eigene Domain" eintragen und damit die
 * Sperrliste `RESERVED_SUBDOMAINS` umgehen, die genau diesen Phishing-Fall
 * verhindert — der Wizard prüft nur das SLUG, hier kommt ein VOLLER Host
 * herein. Geprüft wird die gesamte Betreiber-Domain und nicht nur die
 * reservierten Namen: eine Kunden-Community soll unter `pukalani.app`
 * überhaupt keine zweite Adresse anmelden können, die Subdomain hat sie schon.
 */
export function validateCustomDomain(raw: string | null | undefined): CustomDomainCheck {
  const domain = normalizeCustomDomain(raw)
  if (!domain) return { ok: false, reason: 'empty' }
  if (domain.length > 253) return { ok: false, reason: 'too_long' }
  if (ipv4Re.test(domain)) return { ok: false, reason: 'not_a_domain' }
  const labels = domain.split('.')
  if (labels.length < 2) return { ok: false, reason: 'not_a_domain' }
  if (!labels.every(label => label.length <= 63 && labelRe.test(label))) {
    return { ok: false, reason: 'invalid' }
  }
  // Die letzte Ebene ist die TLD — rein numerisch gibt es sie nicht (und eine
  // IPv4 mit fünf Blöcken wäre oben durchgerutscht).
  if (/^\d+$/.test(labels.at(-1) ?? '')) return { ok: false, reason: 'not_a_domain' }
  if (isOperatorDomain(domain)) return { ok: false, reason: 'operator_domain' }
  return { ok: true, domain }
}

/** Gehört dieser Host uns? (Betreiber-Apex + alles darunter.) */
export function isOperatorDomain(domain: string): boolean {
  return domain === OPERATOR_APEX || domain.endsWith(`.${OPERATOR_APEX}`)
}

// ── www ↔ Apex ──────────────────────────────────────────────────────────────

/**
 * PURE: die Geschwister-Form einer Domain — `null`, wenn es keine gibt.
 *
 *   beispiel.de           → www.beispiel.de
 *   www.beispiel.de       → beispiel.de
 *   blog.beispiel.de      → null
 *   www.blog.beispiel.de  → blog.beispiel.de
 *
 * DIE `null`-ZEILE IST DER PUNKT. Naheliegend wäre, IMMER ein `www.`
 * voranzustellen — dann bekäme `blog.beispiel.de` die Form
 * `www.blog.beispiel.de`, für die niemand einen DNS-Eintrag angelegt hat. Wir
 * würden dafür ein Let's-Encrypt-Zertifikat beantragen, die HTTP-01-Prüfung
 * würde scheitern, und der Kunde bekäme einen Fehler für einen Namen, den er
 * nie wollte. Ein Paar bilden wir deshalb nur da, wo es eindeutig ist: bei
 * einer zweistelligen Domain (Apex) und bei einer, die schon `www.` trägt.
 *
 * BEKANNTE GRENZE, bewusst nicht „behoben": `beispiel.co.uk` hat drei Labels
 * und ist trotzdem ein Apex — ohne Public-Suffix-Liste kann diese Funktion das
 * nicht wissen und liefert `null`. Der Weg dorthin ist trotzdem offen und
 * steht in der Anleitung: wer `www.beispiel.co.uk` einträgt, bekommt
 * `beispiel.co.uk` als Geschwister dazu. Eine geratene Liste wäre schlechter
 * als eine ehrliche Grenze.
 */
export function customDomainSibling(domain: string): string | null {
  if (!domain) return null
  if (domain.startsWith('www.')) {
    const rest = domain.slice(4)
    return rest.includes('.') ? rest : null
  }
  return domain.split('.').length === 2 ? `www.${domain}` : null
}

/** Beide Formen — die EINGETRAGENE zuerst (sie ist die kanonische). */
export function customDomainForms(domain: string): string[] {
  const sibling = customDomainSibling(domain)
  return sibling ? [domain, sibling] : [domain]
}

/**
 * PURE: die Basis des Paares — die Form OHNE `www.`. Dort liegt der
 * TXT-Record, damit EIN Eintrag für beide Formen genügt.
 */
export function customDomainBase(domain: string): string {
  return domain.startsWith('www.') && domain.slice(4).includes('.') ? domain.slice(4) : domain
}

/**
 * PURE: welche eingetragenen Domains könnten zu DIESEM Request-Host gehören?
 *
 * Der Resolver fragt die `communities`-Tabelle mit genau dieser Liste ab
 * (`Query.equal('customDomain', candidates)` — ein ODER über eine indizierte
 * Spalte, kein zweiter Index und keine zweite Abfrage). Trifft die Zeile über
 * die Geschwister-Form, ist der Request-Host NICHT kanonisch und bekommt die
 * Umleitung.
 */
export function customDomainCandidates(host: string): string[] {
  const domain = normalizeCustomDomain(host)
  if (!domain) return []
  const sibling = customDomainSibling(domain)
  return sibling ? [domain, sibling] : [domain]
}

// ── Kanonischer Host + Umleitung ────────────────────────────────────────────

export interface CanonicalHostInput {
  /** Die Pukalani-Subdomain der Community (`communities.host`) — immer da. */
  host: string
  /** Die eingetragene eigene Domain ('' = keine). */
  customDomain?: string | null
  /** Roher Spaltenwert des Status. */
  customDomainStatus?: string | null
}

/**
 * PURE: unter welcher Adresse ist diese Community zu Hause?
 *
 * Aktive eigene Domain ⇒ die; sonst die Subdomain. Das ist die eine Rechnung
 * hinter Davids Entscheidung 2 — und sie steht bewusst NICHT in der
 * Middleware: derselbe Wert entscheidet auch, wohin eine Benachrichtigungs-Mail
 * verlinkt (D5, `communityHostResolver`).
 */
export function canonicalHostFor(row: CanonicalHostInput): string {
  return customDomainIsLive(row.customDomain, row.customDomainStatus)
    ? (row.customDomain as string)
    : row.host
}

/*
 * DIE UMLEITUNG SELBST steht bewusst NICHT hier, sondern in
 * `packages/core/shared/canonicalHost.ts` (`canonicalRedirectTarget` /
 * `canonicalRedirectStatus`): sie wird von `00.tenant.ts` gebraucht, und ein
 * Fundament-Layer darf nicht an einem Naht-Layer hängen (CONCEPT.md A14).
 * Zwei Fragen, zwei Orte — „was ist zu Hause?" gehört zu den Daten (hier),
 * „bin ich dort?" zum Request (core).
 */

// ── Eigentums-Nachweis: der TXT-Record ──────────────────────────────────────

/** Das Label, unter dem der Nachweis liegt. Ein Unterstrich am Anfang ist die
 *  Konvention für Nicht-Host-Records (wie `_dmarc`) — er kollidiert nie mit
 *  einem echten Hostnamen des Kunden. */
export const CUSTOM_DOMAIN_VERIFY_LABEL = '_pukalani-verify'
/** Präfix im TXT-Wert: eine Zone trägt viele Nachweise verschiedener Anbieter. */
export const CUSTOM_DOMAIN_VERIFY_PREFIX = 'pukalani-domain-verify='

/** PURE: wo der Kunde den TXT-Record anlegt (an der BASIS, also ohne `www.`
 *  — ein Record deckt damit beide Formen ab). */
export function customDomainVerifyRecordName(domain: string): string {
  return `${CUSTOM_DOMAIN_VERIFY_LABEL}.${customDomainBase(domain)}`
}

/** PURE: was drinsteht. */
export function customDomainVerifyRecordValue(token: string): string {
  return `${CUSTOM_DOMAIN_VERIFY_PREFIX}${token}`
}

/**
 * PURE: steht unser Token in dieser TXT-Antwort?
 *
 * DNS liefert TXT als Liste von Strings je Record, und lange Werte werden in
 * 255-Zeichen-Häppchen zerlegt (`resolveTxt` gibt deshalb `string[][]`). Ein
 * Vergleich, der nur `chunks[0]` ansieht, wäre bei einer Zone mit mehreren
 * Nachweisen still falsch. Zusammengesetzt wird deshalb je Record, verglichen
 * über alle Records; Anführungszeichen und Leerraum werden geduldet, weil
 * manche DNS-Oberflächen sie mitspeichern.
 */
export function customDomainTokenPresent(records: string[][], token: string): boolean {
  if (!token) return false
  const wanted = customDomainVerifyRecordValue(token)
  return records.some((chunks) => {
    const value = chunks.join('').trim().replace(/^"|"$/g, '')
    return value === wanted
  })
}

/** Ein Token ist 32 Hex-Zeichen. (Erzeugt wird es server-seitig mit
 *  `randomBytes` — hier steht nur, was als eines durchgeht.) */
export function isCustomDomainToken(value: string | null | undefined): boolean {
  return /^[a-f0-9]{32}$/.test(value ?? '')
}

// ── Zeige-Prüfung: A / CNAME ────────────────────────────────────────────────

export interface DomainPointingInput {
  /** A-Records der Domain (leer = keine). */
  a: string[]
  /** CNAME-Ziel der Domain ('' = keines). */
  cname: string
  /** Unsere Server-IP(s). */
  serverIps: string[]
  /** Unser CNAME-Ziel (z. B. `platform.pukalani.app`). */
  cnameTarget: string
}

/**
 * PURE (unit-getestet): zeigt diese Domain auf uns?
 *
 * ZWEI Wege, weil DNS zwei erlaubt: ein Apex kann (bei den meisten Anbietern)
 * kein CNAME tragen und braucht einen A-Record, eine `www.`-Form nimmt am
 * besten ein CNAME. Beide Wege gelten — es genügt EINER.
 *
 * FAIL-CLOSED: ohne konfigurierte IP und ohne konfiguriertes CNAME-Ziel ist
 * die Antwort `false`, nicht `true`. Sonst wäre eine vergessene Konfiguration
 * ein „alles zeigt auf uns" und jede Domain sofort aktivierbar.
 */
export function domainPointsToUs(input: DomainPointingInput): boolean {
  const target = normalizeCustomDomain(input.cnameTarget)
  const cname = normalizeCustomDomain(input.cname)
  if (target && cname && cname === target) return true
  const ips = input.serverIps.map(ip => ip.trim()).filter(Boolean)
  if (!ips.length) return false
  return input.a.some(record => ips.includes(record.trim()))
}

// ── CAA: darf Let's Encrypt für diese Zone überhaupt ausstellen? ────────────

/**
 * DIE HÄUFIGSTE URSACHE EINES FEHLGESCHLAGENEN ZERTIFIKATS (U16, Wettbewerb
 * E6 — Circle erkennt es selbst und fordert den Eintrag gezielt nach).
 *
 * Ein CAA-Eintrag sagt, WELCHE Zertifizierungsstelle für eine Zone ausstellen
 * darf. Steht dort `issue "sectigo.com"` und sonst nichts, lehnt Let's
 * Encrypt jede Anforderung ab — und zwar SPÄT, nämlich erst in der
 * Bestellung. Der Kunde sieht bei uns „Zertifikat noch nicht aktiv", wartet,
 * drückt wieder, und nichts an dieser Meldung sagt ihm, dass die Ursache in
 * seiner eigenen Zone liegt und dort in zehn Sekunden behoben wäre.
 *
 * KEINE FREMD-API: gefragt wird über denselben eigenen Resolver wie A/CNAME/
 * TXT (`checkDomainCaa` in server/utils/customDomainDns.ts), die REGELN
 * stehen pur hier.
 */

/** Die Ausstellerkennung von Let's Encrypt. Exakt dieser Name muss im
 *  `issue`-Feld stehen — ein `subdomain.letsencrypt.org` gilt NICHT
 *  (die Kennung ist ein fester Bezeichner, kein Hostname-Muster). */
export const LETSENCRYPT_CAA_ISSUER = 'letsencrypt.org'

/**
 * `ok`      = ausstellen erlaubt (kein CAA-Satz, oder einer der uns nennt)
 * `blocked` = es gibt einen CAA-Satz, und Let's Encrypt steht nicht drin
 * `unknown` = die Abfrage ist nicht durchgekommen (SERVFAIL, Zeitüberschreitung)
 *
 * `unknown` ist BEWUSST kein `blocked`: ein hakendes DNS darf keine Warnung
 * erzeugen, die den Kunden in seiner Zone nach einem Fehler suchen lässt, den
 * es nicht gibt.
 */
export type DomainCaaVerdict = 'ok' | 'blocked' | 'unknown'

/**
 * PURE: die Namen, unter denen ein CAA-Satz gelten kann — vom Namen selbst
 * aufwärts. CAA ERBT: gefunden wird der Satz des NÄCHSTEN Vorfahren, der einen
 * hat (RFC 8659 § 3), deshalb wird die Kette von unten nach oben abgeklappert
 * und der erste nicht-leere Satz entscheidet.
 *
 * Die TLD selbst bleibt AUSSEN VOR (`www.a.de` ⇒ `www.a.de`, `a.de` — nicht
 * `de`). Formal erlaubt RFC 8659 auch dort einen Satz; praktisch trägt keine
 * Registry einen, und die Abfrage kostet nur eine weitere Runde mit
 * Zeitbudget an einem Prüf-Klick, der an einem Request hängt.
 */
export function caaChain(domain: string): string[] {
  const labels = normalizeCustomDomain(domain).split('.').filter(Boolean)
  const names: string[] = []
  for (let i = 0; i + 1 < labels.length; i++) names.push(labels.slice(i).join('.'))
  return names
}

/** Was `dns.resolveCaa` je Record liefert (Node `CaaRecord`, hier nur das,
 *  was uns interessiert). */
export interface DomainCaaRecord {
  issue?: string
  issuewild?: string
  iodef?: string
  critical?: number
}

/**
 * PURE: entscheidet EIN gefundener CAA-Satz gegen uns?
 *
 * DREI REGELN, jede mit Grund:
 *  1. **Ein Satz ohne `issue`-Feld beschränkt nichts.** Ein `iodef`-Eintrag
 *     (Meldeadresse) allein ist kein Verbot — wer ihn als solches läse,
 *     warnte einen Kunden grundlos.
 *  2. **`issue ";"` ist das ausdrückliche Verbot für ALLE** (RFC 8659 § 4.2)
 *     und damit auch für uns. Gezählt wird deshalb, ob ein `issue`-FELD DA
 *     ist — nicht, ob ein Name darin steht. Wer stattdessen die leeren Namen
 *     wegwirft, liest die HÄRTESTE Policy des Feldes als „keine
 *     Beschränkung" (beim Bau am eigenen Test aufgefallen).
 *  3. **Verglichen wird nur `issue`, nicht `issuewild`.** Für eine
 *     Kundendomain wird nie ein Wildcard-Zertifikat bestellt (`kunde.de` und
 *     `www.kunde.de` einzeln) — ein fehlendes `issuewild` ist also kein
 *     Hindernis, und es als eines zu melden wäre ein Fehlalarm.
 *
 * Parameter hinter dem Namen (`letsencrypt.org; validationmethods=dns-01`)
 * werden abgeschnitten: sie schränken das WIE ein, nicht das WER.
 */
export function caaVerdictFromRecords(records: readonly DomainCaaRecord[]): DomainCaaVerdict {
  const issueRecords = records.filter(record => typeof record.issue === 'string')
  // Regel 1: kein `issue`-Feld im Satz ⇒ keine Beschränkung.
  if (!issueRecords.length) return 'ok'
  const issuers = issueRecords.map(record =>
    (record.issue ?? '').split(';')[0]?.trim().toLowerCase().replace(/\.$/, '') ?? '')
  return issuers.includes(LETSENCRYPT_CAA_ISSUER) ? 'ok' : 'blocked'
}
