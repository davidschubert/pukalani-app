import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { createAdminClient } from '../lib/appwrite'
import { logEvent } from './logEvent'
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE_S,
  adoptedConsentAt,
  consentWayFromPath,
  formatConsentCookie,
  parseConsentCookie,
  requiredConsents,
  type ConsentConfig,
} from '../../shared/consent'
import type { ConsentKind, ConsentRecordData, ConsentWay, RequiredConsent } from '../../shared/types/consent'

/**
 * DER NACHWEIS DER ZUSTIMMUNG (SEC-008) — Schreiber und Leser der Tabelle
 * `consent_records` (system-041). Regeln und Begründung: `shared/consent.ts`.
 *
 * ── EINE ZEILE JE (KONTO, ART, FASSUNG) ──────────────────────────────────
 * Die Zeilen-Id ist aus genau diesen drei Werten gebildet (`consentRowId`).
 * Ein zweiter Versuch endet im 409 — das ist ein Erfolg: der Nachweis steht,
 * und der ERSTE Zeitpunkt bleibt. Es wird nie überschrieben.
 *
 * ── NUR DER ADMIN-CLIENT ─────────────────────────────────────────────────
 * Die Tabelle trägt keine Rechte für Konten. Ein Konto kann seine Zeile
 * weder lesen noch anlegen noch ändern — genau deshalb liegt der Nachweis
 * hier und nicht in den Prefs.
 *
 * ── FEHLT DIE TABELLE ─────────────────────────────────────────────────────
 * (Migration auf einer Instanz noch nicht gefahren, Appwrite 404
 * `table_not_found`): keine Anmeldung und keine Registrierung darf daran
 * scheitern. Festhalten ist dann „nicht möglich", die Prüfung meldet nichts
 * als fehlend (sonst sperrte die Tür jedes Konto, ohne dass eine Nachfrage
 * es ändern könnte). Ein Eintrag `auth.consent_table_missing` je Prozess.
 *
 * ── ZWISCHENSPEICHER ──────────────────────────────────────────────────────
 * Nur POSITIVE Antworten (eine Zustimmung verschwindet nicht von selbst; die
 * Löschung des Kontos entfernt die Zeilen und das Konto zugleich). Negative
 * werden nicht gemerkt, damit eine eben nachgeholte Zustimmung sofort gilt.
 */

export const CONSENT_RECORDS_TABLE = 'consent_records'

/** Obergrenze des Zwischenspeichers; beim Überlauf fällt der älteste Eintrag. */
const CACHE_MAX = 5000
const present = new Map<string, true>()
let tableMissingLogged = false

function cacheKey(userId: string, kind: ConsentKind, version: string): string {
  return `${userId}|${kind}|${version}`
}

function remember(key: string): void {
  if (present.has(key)) return
  if (present.size >= CACHE_MAX) {
    const oldest = present.keys().next().value
    if (oldest !== undefined) present.delete(oldest)
  }
  present.set(key, true)
}

/** Nur für Tests. */
export function __resetConsentRecords(): void {
  present.clear()
  tableMissingLogged = false
}

/**
 * Feste Zeilen-Id: `c` + 31 Hex-Zeichen aus sha256(userId|kind|version) —
 * 32 Zeichen, gültige Appwrite-Id (höchstens 36, Buchstabe/Ziffer vorn).
 */
export function consentRowId(userId: string, kind: ConsentKind, version: string): string {
  return `c${createHash('sha256').update(`${userId}|${kind}|${version}`).digest('hex').slice(0, 31)}`
}

/** Welche Zustimmungen DIESE App verlangt (aus `pukalani.auth`). */
export function appRequiredConsents(): RequiredConsent[] {
  const appConfig = useAppConfig() as { pukalani?: { auth?: ConsentConfig } }
  return requiredConsents(appConfig.pukalani?.auth)
}

function errorCode(error: unknown): number | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number'
    ? error.code
    : undefined
}

function errorType(error: unknown): string {
  return typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
    ? error.type
    : ''
}

function isTableMissing(error: unknown): boolean {
  const type = errorType(error)
  return errorCode(error) === 404 && (type === 'table_not_found' || type === 'database_not_found')
}

function isRowMissing(error: unknown): boolean {
  return errorCode(error) === 404 && !isTableMissing(error)
}

function noteTableMissing(): void {
  if (tableMissingLogged) return
  tableMissingLogged = true
  logEvent('warn', 'auth.consent_table_missing', { table: CONSENT_RECORDS_TABLE })
}

function databaseId(event: H3Event): string {
  return String(useRuntimeConfig(event).public.appwriteDatabaseId ?? '')
}

/** Host der Anfrage — nie eine IP-Adresse des Menschen. */
function requestSource(event: H3Event): string {
  try {
    return String(getRequestHost(event) ?? '').slice(0, 255)
  }
  catch {
    return ''
  }
}

export type ConsentWriteResult = 'recorded' | 'exists' | 'unavailable'

export interface ConsentWrite {
  userId: string
  kind: ConsentKind
  version: string
  way: ConsentWay
  /** Standard: jetzt. Bei `adopted` der alte Zeitpunkt aus den Prefs. */
  acceptedAt?: string
}

/**
 * Hält EINE Zustimmung fest. `exists` (409) ist ein Erfolg. `unavailable` =
 * Tabelle fehlt. Andere Fehler wirft die Funktion — der Aufrufer entscheidet,
 * ob er sie schluckt (Anlage) oder meldet (Nachfrage).
 */
export async function writeConsentRecord(event: H3Event, input: ConsentWrite): Promise<ConsentWriteResult> {
  const data: ConsentRecordData = {
    userId: input.userId,
    kind: input.kind,
    version: input.version,
    acceptedAt: input.acceptedAt ?? new Date().toISOString(),
    way: input.way,
    source: requestSource(event),
  }
  const key = cacheKey(input.userId, input.kind, input.version)
  try {
    await createAdminClient(event).tablesDB.createRow({
      databaseId: databaseId(event),
      tableId: CONSENT_RECORDS_TABLE,
      rowId: consentRowId(input.userId, input.kind, input.version),
      data: { ...data },
    })
    remember(key)
    return 'recorded'
  }
  catch (error) {
    if (errorCode(error) === 409) {
      remember(key)
      return 'exists'
    }
    if (isTableMissing(error)) {
      noteTableMissing()
      return 'unavailable'
    }
    throw error
  }
}

/**
 * Hält mehrere Zustimmungen auf einem Weg fest — BEST-EFFORT: ein Fehler
 * landet im Log und kippt nie die Anmeldung, an der er hängt.
 */
export async function recordConsents(
  event: H3Event,
  userId: string,
  consents: readonly RequiredConsent[],
  way: ConsentWay,
): Promise<void> {
  for (const consent of consents) {
    try {
      await writeConsentRecord(event, { userId, kind: consent.kind, version: consent.version, way })
    }
    catch (error) {
      logEvent('warn', 'auth.consent_record_failed', {
        userId,
        kind: consent.kind,
        way,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

export interface ConsentRecordOptions {
  /** Standard: aus dem Pfad (`consentWayFromPath`). */
  way?: ConsentWay
  /**
   * Hat der Server die Bestätigung in DIESER Anfrage gesehen? Ohne Angabe
   * gilt auf dem Google-Weg das Merkzeichen `pk_consent`, auf jedem anderen
   * Weg „nein".
   */
  affirmed?: boolean
}

const KIND_ORDER: readonly ConsentKind[] = ['terms', 'business']

/**
 * Das Merkzeichen des Google-Wegs nach dem Lesen einer Art kürzen: übrig
 * bleibt, was die App noch verlangt und erst nach dieser Art gelesen wird;
 * ist nichts übrig, wird es gelöscht. (Die Rückkehr ruft erst die AGB, dann
 * die Unternehmer-Bestätigung — beide lesen das Cookie der Anfrage.)
 */
function consumeConsentCookie(event: H3Event, kind: ConsentKind, affirmedKinds: readonly ConsentKind[]): void {
  const required = appRequiredConsents().map(consent => consent.kind)
  const after = KIND_ORDER.slice(KIND_ORDER.indexOf(kind) + 1)
  const remaining = affirmedKinds.filter(k => after.includes(k) && required.includes(k))
  if (!remaining.length) {
    deleteCookie(event, CONSENT_COOKIE, { path: '/' })
    return
  }
  setCookie(event, CONSENT_COOKIE, formatConsentCookie(remaining), {
    path: '/', sameSite: 'lax', maxAge: CONSENT_COOKIE_MAX_AGE_S, secure: getRequestProtocol(event) === 'https',
  })
}

/**
 * Hält EINE Art fest, wenn die App sie verlangt UND der Server die
 * Bestätigung in dieser Anfrage gesehen hat. Best-effort, wirft nie.
 * Gemeinsamer Kern von `recordTermsAcceptance` und
 * `recordBusinessConfirmation`.
 */
export async function recordAffirmedConsent(
  event: H3Event,
  userId: string,
  kind: ConsentKind,
  options: ConsentRecordOptions = {},
): Promise<void> {
  const consent = appRequiredConsents().find(entry => entry.kind === kind)
  if (!consent || !userId) return

  const way = options.way ?? consentWayFromPath(event.path ?? '')
  if (!way) return

  let affirmed = options.affirmed
  if (affirmed === undefined && way === 'oauth') {
    const cookieKinds = parseConsentCookie(getCookie(event, CONSENT_COOKIE))
    affirmed = cookieKinds.includes(kind)
    if (cookieKinds.length) consumeConsentCookie(event, kind, cookieKinds)
  }
  if (affirmed !== true) return

  await recordConsents(event, userId, [consent], way)
}

type AccountSnapshot =Pick<Models.User<Models.Preferences>, '$id' | '$createdAt' | 'prefs'>

/**
 * Welche verlangten Zustimmungen fehlen diesem Konto für die AKTUELLE
 * Fassung? Leer, wenn die App nichts verlangt — dann ohne jeden Netzaufruf.
 *
 * Fehlt eine Zeile, wird einmal versucht, den alten Vermerk aus den Prefs zu
 * übernehmen (`adoptedConsentAt`). Das Konto kommt aus `event.context.user`
 * (02.auth.ts), sonst aus `users.get`.
 *
 * Ein Lesefehler WIRD GEWORFEN — die Tür entscheidet, was dann gilt.
 */
export async function missingConsents(event: H3Event, userId: string): Promise<ConsentKind[]> {
  const required = appRequiredConsents()
  if (!required.length || !userId) return []

  const unknown = required.filter(consent => !present.has(cacheKey(userId, consent.kind, consent.version)))
  if (!unknown.length) return []

  const { tablesDB } = createAdminClient(event)
  const missing: RequiredConsent[] = []
  for (const consent of unknown) {
    try {
      await tablesDB.getRow({
        databaseId: databaseId(event),
        tableId: CONSENT_RECORDS_TABLE,
        rowId: consentRowId(userId, consent.kind, consent.version),
      })
      remember(cacheKey(userId, consent.kind, consent.version))
    }
    catch (error) {
      if (isTableMissing(error)) {
        noteTableMissing()
        return []
      }
      if (!isRowMissing(error)) throw error
      missing.push(consent)
    }
  }
  if (!missing.length) return []

  // Übernahme aus dem Bestand — nur für Konten von vor dem Stichtag.
  const contextUser = event.context.user
  let account: AccountSnapshot | null = contextUser?.$id === userId ? contextUser : null
  if (!account) {
    account = await createAdminClient(event).users.get({ userId }).catch(() => null)
  }

  const stillMissing: ConsentKind[] = []
  for (const consent of missing) {
    const acceptedAt = account
      ? adoptedConsentAt({
          kind: consent.kind,
          version: consent.version,
          prefs: account.prefs as Record<string, unknown> | undefined,
          accountCreatedAt: account.$createdAt,
        })
      : null
    if (!acceptedAt) {
      stillMissing.push(consent.kind)
      continue
    }
    const result = await writeConsentRecord(event, {
      userId, kind: consent.kind, version: consent.version, way: 'adopted', acceptedAt,
    })
    if (result === 'unavailable') return []
  }
  return stillMissing
}
