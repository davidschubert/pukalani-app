import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import {
  BRAND_AI_DAY_WINDOW_MS,
  BRAND_AI_LIMITS,
  type BrandAiQuotaCounts,
  type BrandAiRejectionCode,
  type BrandCheckQuotaCounts,
  type BrandCheckRejectionCode,
  brandAiAccountDayKey,
  brandAiInstanceDayKey,
  brandAiReviewDayKey,
  brandAiSlotDayKey,
  brandAiTalkDayKey,
  brandCheckAccountDayKey,
  brandCheckInstanceDayKey,
  brandCheckIpDayKey,
  brandDesignDraftsDayKey,
  brandDesignReadingDayKey,
  decideBrandAiQuota,
  decideBrandCheckQuota,
  resolveBrandAiInstanceCap,
} from '../../shared/brandAiLimits'
import type { BRAND_CHECK_CORRECTION_LIMIT_CODE } from '../../shared/brandCheckCorrections'
import {
  BRAND_CHECK_CORRECTION_WINDOW_MS,
  brandCheckCorrectionIpHourKey,
  decideBrandCheckCorrectionQuota,
} from '../../shared/brandCheckCorrections'
import { countActiveBrandGenerations } from './brandGenerators'

/**
 * DIE BUCHUNG — vier Zähler, in der Reihenfolge eng vor weit, mit Abbruch beim
 * ersten Nein. Die Zahlen, die Schlüssel und die Entscheidung stehen pur in
 * `shared/brandAiLimits.ts`; hier steht nur, WANN gezählt wird.
 *
 * Der ENGE Zähler ist seit Brand Design D2b einer von VIEREN (`kind`): der
 * Slot-Eimer für einen Entwurf, der Gesprächs-Eimer für einen Berater-Zug, der
 * Review-Eimer für den Schliess-Aufruf, der Lesungs-Eimer für den Vision-Lauf
 * über die Vorbilder. Nie zwei davon.
 *
 * ── GEBUCHT WIRD BEIM START, NICHT BEIM ERFOLG ────────────────────────────
 * Ein Lauf, der beim Anbieter scheitert oder den der Mensch abbricht, ist
 * bezahlt: die Anfrage ist raus, die Tokens sind verbraucht. Vor allem aber
 * wäre die Gegenregel ein Geschenk an genau den Missbrauch, gegen den der
 * Deckel steht — wer jeden Lauf nach zwei Sekunden abbricht, hätte unbegrenzt
 * viele freie Läufe. Erfolg ist keine Bedingung fürs Bezahlen.
 *
 * ── WAS NICHT ZÄHLT (Plan §6, hier festgehalten für P3+) ──────────────────
 *  · CACHE-TREFFER. Heute ist das der Idempotenz-Fall (derselbe Knopfdruck,
 *    derselbe Schlüssel) — die Route prüft ihn VOR dieser Buchung. Der
 *    Entwurfs-Cache je Baustein-Stand kommt später und gehört an dieselbe
 *    Stelle: „was nichts kostet, kostet kein Kontingent".
 *  · AUTOMATISCHE SCHEMA-REPARATUR (gibt es noch nicht). Sie ist die zweite
 *    Hälfte EINES Laufs, den der Mensch einmal ausgelöst hat — sie ein zweites
 *    Mal zu berechnen hiesse, ihm unsere Reparatur in Rechnung zu stellen.
 *  · DER DEV-STUB. Er ruft keinen Anbieter; die Route bucht deshalb nur, wenn
 *    `resolveBrandSlotGenerator()` `chargesQuota` sagt.
 *
 * ── FAIL-OPEN, WIE ÜBERALL ────────────────────────────────────────────────
 * Der Rate-Limit-Store ist fail-open (toter Redis ⇒ In-Memory-Rückfall). Das
 * bleibt so: eine kaputte Drossel darf den Wizard nicht abschalten. Der harte
 * Riegel gegen Kosten ist `app_config.brandAiEnabled`, nicht dieser Zähler.
 */
export interface BrandAiQuotaRequest {
  userId: string
  profileId: string
  /**
   * WELCHER ENGE EIMER (P3.2): der Entwurf eines Feldes bucht auf seinen
   * Slot-Typ, ein Gesprächszug auf das Gespräch DIESES Brandings. Warum das
   * zwei Eimer sind und kein geteilter, steht im Kopf von `brandAiLimits.ts`.
   */
  kind: 'slot' | 'talk' | 'review' | 'reading' | 'drafts'
  /** Nur bei `kind: 'slot'` — der Slot-TYP, dessen Anläufe gezählt werden. */
  slotId?: string
  /**
   * WIE SCHWER dieser Aufruf wiegt (Paket 4, nur bei `kind: 'review'`): Stufe 1
   * zählt 1, Stufe 2 zählt 3, die Kapitel-Abnahme 2 (`BRAND_AI_REVIEW_WEIGHTS`).
   *
   * Umgesetzt als MEHRERE `hit`s auf denselben Schlüssel und nicht als ein
   * `hit` mit Faktor: der Rate-Limit-Store des Core kennt genau eine Zählart
   * („einen Versuch zählen"), und ein Gewichts-Parameter dort wäre eine
   * Änderung an einer Schnittstelle, die fünf andere Layer teilen — für eine
   * Zahl, die nur dieser Eimer kennt. Gebucht wird in EINER Schleife, und
   * entschieden wird nach dem LETZTEN Treffer: die Zwischenstände sind keine
   * eigenen Aufrufe, sondern Teile desselben.
   */
  weight?: number
}

/**
 * `null` = der Lauf darf laufen. Sonst der erste verletzte Deckel als Code, den
 * die Route als `data.code` in eine 429 legt.
 *
 * DER PLATZ IST SCHON BELEGT, WENN DIESE FUNKTION LÄUFT: die Route ruft
 * `retainBrandGeneration()` VOR der Buchung und gibt bei einem Nein wieder
 * frei. Die andere Reihenfolge („erst zählen, dann belegen") sähe richtiger
 * aus und wäre falsch — zwischen Zählung und Beleg liegen hier drei `await`,
 * und in dieser Lücke zählten drei gleichzeitige Anfragen alle dieselbe Null.
 * `countActiveBrandGenerations()` enthält deshalb den eigenen Lauf bereits.
 *
 * DIESER SATZ WAR EINE ZEIT LANG FALSCH (Audit-Befund 2026-09-09): er galt nur
 * für den Entwurf und das Gespräch, während die vier Läufe von Brand Design
 * (Vorbilder lesen, DNA vorschlagen, Zeichen-Briefing, Zeichen-Entwürfe)
 * daneben standen — ausgerechnet die teuersten. Jetzt halten ihn alle sechs;
 * eine neue Route, die hier bucht, gehört ebenfalls dazu.
 */
export interface BrandAiQuotaRejection {
  code: BrandAiRejectionCode
  /** Sekunden bis zur nächsten Chance — der Wert des `Retry-After`-Kopfes. */
  retryAfterSec: number
}

/**
 * DER ZÄHLERSTAND ALS NEBENPRODUKT — für Aufrufer, die dem Menschen sein
 * REST-KONTINGENT nennen (die Vorbilder-Lesung, D2b: „noch 2 von 3 Läufen").
 *
 * Als optionales Mitschreib-Objekt und nicht als Rückgabewert: die Rückgabe
 * ist heute `null` = „darf laufen", und daraus ein Objekt zu machen hiesse,
 * drei bestehende Aufrufer (Entwurf, Gespräch, Spezialist) für eine Zahl
 * umzubauen, die keiner von ihnen zeigt. Gefüllt wird das ENGE Fenster —
 * genau das, dessen Deckel der Mensch sieht.
 */
export interface BrandAiQuotaMeasurement {
  /** Stand des engen Eimers NACH dieser Buchung (0, wenn nicht gebucht wurde). */
  narrowCount: number
  /** Sekunden bis zum Ende seines Fensters. */
  narrowResetSec: number
}

export async function bookBrandAiQuota(
  event: H3Event,
  request: BrandAiQuotaRequest,
  measurement?: BrandAiQuotaMeasurement,
): Promise<BrandAiQuotaRejection | null> {
  const limits = {
    ...BRAND_AI_LIMITS,
    instanceDay: resolveBrandAiInstanceCap(brandAiInstanceCapFromConfig()),
  }

  // Noch nicht gemessene Zähler bleiben 0 — 0 verletzt nie einen Deckel.
  const counts: BrandAiQuotaCounts = {
    parallel: countActiveBrandGenerations(request.userId),
    slotDay: 0,
    talkDay: 0,
    reviewDay: 0,
    readingDay: 0,
    draftsDay: 0,
    accountDay: 0,
    instanceDay: 0,
  }
  const busy = decideBrandAiQuota(counts, limits)
  // Der Burst ist in Sekunden vorbei — er wartet auf einen laufenden Entwurf,
  // nicht auf ein Fenster. Eine ehrliche Schätzung ist besser als das
  // Tagesfenster der drei anderen Deckel.
  if (busy) return { code: busy, retryAfterSec: BRAND_AI_BUSY_RETRY_SEC }

  const { store, prefix } = useRateLimitStore(event)

  /**
   * DER ENGE EIMER — genau EINER, nie beide. Ein Gesprächszug, der zusätzlich
   * den Slot-Eimer anfasste, nähme dem Menschen die Entwürfe für das Feld, für
   * das er gerade geantwortet hat (und eine freie Frage hätte gar keinen Slot).
   */
  const narrowKey = request.kind === 'talk'
    ? brandAiTalkDayKey(request.profileId)
    : request.kind === 'review'
      ? brandAiReviewDayKey(request.profileId)
      : request.kind === 'reading'
        ? brandDesignReadingDayKey(request.profileId)
        : request.kind === 'drafts'
          ? brandDesignDraftsDayKey(request.profileId)
          : brandAiSlotDayKey(request.profileId, request.slotId ?? '')
  // Das GEWICHT (s. `weight`): mehrere Treffer auf denselben Schlüssel, aber
  // EIN Aufruf — entschieden wird nach dem letzten Stand, nicht nach jedem.
  const weight = Math.max(1, Math.trunc(request.weight ?? 1))
  let narrowState = await store.hit(`${prefix}${narrowKey}`, BRAND_AI_DAY_WINDOW_MS)
  for (let extra = 1; extra < weight; extra++) {
    narrowState = await store.hit(`${prefix}${narrowKey}`, BRAND_AI_DAY_WINDOW_MS)
  }
  if (measurement) {
    measurement.narrowCount = narrowState.count
    measurement.narrowResetSec = retryAfter(narrowState.resetInMs)
  }
  if (request.kind === 'talk') counts.talkDay = narrowState.count
  else if (request.kind === 'review') counts.reviewDay = narrowState.count
  else if (request.kind === 'reading') counts.readingDay = narrowState.count
  else if (request.kind === 'drafts') counts.draftsDay = narrowState.count
  else counts.slotDay = narrowState.count
  const narrow = decideBrandAiQuota(counts, limits)
  if (narrow) return { code: narrow, retryAfterSec: retryAfter(narrowState.resetInMs) }

  const accountState = await store.hit(
    `${prefix}${brandAiAccountDayKey(request.userId)}`,
    BRAND_AI_DAY_WINDOW_MS,
  )
  counts.accountDay = accountState.count
  const account = decideBrandAiQuota(counts, limits)
  if (account) return { code: account, retryAfterSec: retryAfter(accountState.resetInMs) }

  const instanceState = await store.hit(
    `${prefix}${brandAiInstanceDayKey()}`,
    BRAND_AI_DAY_WINDOW_MS,
  )
  counts.instanceDay = instanceState.count
  const instance = decideBrandAiQuota(counts, limits)
  return instance ? { code: instance, retryAfterSec: retryAfter(instanceState.resetInMs) } : null
}

/** Der laufende Entwurf ist in Sekunden fertig — so lange, nicht länger. */
const BRAND_AI_BUSY_RETRY_SEC = 10

function retryAfter(resetInMs: number): number {
  return Math.max(1, Math.ceil(resetInMs / 1000))
}

/** `pukalani.brand.aiDailyInstanceCap` — ungeprüft; die Prüfung ist pur. */
function brandAiInstanceCapFromConfig(): unknown {
  const config = useAppConfig() as { pukalani?: { brand?: { aiDailyInstanceCap?: unknown } } }
  return config.pukalani?.brand?.aiDailyInstanceCap
}

// ── Der Brand-Check ────────────────────────────────────────────────────────

/**
 * DER TAGES-STEMPEL EINES ANSCHLUSSES — sha256 aus IP und einem Salz, das
 * täglich wechselt. Die ROHE IP verlässt diese Funktion nie und steht weder in
 * einer Zeile noch in einem Log.
 *
 * ── WOHER DAS SALZ KOMMT ──────────────────────────────────────────────────
 * Aus `runtimeConfig.appwriteKey` — demselben server-only Geheimnis, aus dem
 * der Core schon den Handoff-Schlüssel ableitet (`deriveHandoffKey`). Kein
 * neuer Env-Eintrag: eine Pflicht-Variable mehr wäre eine Variable mehr, die
 * auf einer Instanz fehlen kann, und `pnpm ops:site-env` müsste sie ab dann
 * bewachen. Fehlt der Schlüssel (nur in Tests denkbar), bleibt der Hash
 * trotzdem stabil — er ist dann nur nicht mehr geheim, und der Deckel wirkt
 * unverändert.
 *
 * ── WARUM DAS SALZ TÄGLICH WECHSELT ───────────────────────────────────────
 * Der Stempel soll GENAU SO LANGE zuordenbar sein wie das Fenster, das er
 * deckelt. Mit einem festen Salz wäre er ein dauerhaftes Pseudonym: zwei
 * Zeilen aus verschiedenen Monaten liessen sich derselben Leitung zuordnen,
 * und aus einem Kostendeckel würde eine Besucher-Historie. Der Preis ist
 * bekannt und gewollt — um Mitternacht (UTC) beginnt jeder Anschluss von vorn.
 * Das rollierende 24-Stunden-Fenster des Eimers bleibt davon unberührt, es ist
 * nur nach dem Salz-Wechsel ein neuer Eimer.
 */
export function brandCheckIpHash(event: H3Event, now: Date = new Date()): string {
  const ip = trustedClientIp(event) ?? ''
  const salt = useRuntimeConfig(event).appwriteKey || 'brand-check'
  const day = now.toISOString().slice(0, 10)
  return createHash('sha256').update(`${salt}|brand-check|${day}|${ip}`).digest('hex')
}

/**
 * DIE BUCHUNG DES CHECKS — zwei Zähler, eng vor weit, Abbruch beim ersten Nein.
 *
 * GEBUCHT WIRD NUR, WAS AUCH ETWAS KOSTET: der Aufrufer ruft diese Funktion
 * NACH dem Blick in den Zwischenspeicher. Ein Cache-Treffer holt weder eine
 * fremde Seite noch ein Modell-Urteil — „was nichts kostet, kostet kein
 * Kontingent" (dieselbe Regel wie oben, und derselbe Grund: sonst sperrt sich
 * jemand mit drei Klicks auf dasselbe Ergebnis selbst aus).
 *
 * Der Instanz-Deckel ist eine KONSTANTE und kein Config-Feld: anders als beim
 * Wizard gibt es hier keine Oberfläche, an der ihn jemand heben könnte, und
 * ein Feld ohne Oberfläche ist eine Einstellung, die niemand findet. Wer ihn
 * ändern will, ändert `BRAND_CHECK_INSTANCE_DAILY_DEFAULT`.
 */
export interface BrandCheckQuotaRejection {
  /**
   * Der erste verletzte Deckel. Der Korrektur-Code steht mit in der Union,
   * weil `bookBrandCorrectionQuota` dieselbe Form zurückgibt und die Route
   * damit dasselbe tut (Retry-After setzen, 429 mit `data.code`) — zwei
   * Formen für eine Handlung wären zwei Stellen zum Vergessen.
   */
  code: BrandCheckRejectionCode | typeof BRAND_CHECK_CORRECTION_LIMIT_CODE
  /** Sekunden bis zur nächsten Chance — der Wert des `Retry-After`-Kopfes. */
  retryAfterSec: number
}

export interface BrandCheckQuotaRequest {
  ipHash: string
  /**
   * WELCHER ENGE EIMER — die Entscheidung stammt aus `decideBrandCheckMode`
   * und wird hier NICHT noch einmal getroffen. Genau EINER wird gebucht: ein
   * „neu ermitteln", das zusätzlich den Anschluss-Eimer anfasste, nähme dem
   * Menschen die drei gewöhnlichen Checks des Tages für etwas, das er bereits
   * aus seinem eigenen Kontingent bezahlt.
   */
  quota: 'ip' | 'account'
  /** Nur bei `quota: 'account'` — sonst leer. */
  userId?: string
}

export async function bookBrandCheckQuota(
  event: H3Event,
  request: BrandCheckQuotaRequest,
): Promise<BrandCheckQuotaRejection | null> {
  const { store, prefix } = useRateLimitStore(event)
  const counts: BrandCheckQuotaCounts = { ipDay: 0, accountDay: 0, instanceDay: 0 }

  const narrowKey = request.quota === 'account'
    ? brandCheckAccountDayKey(request.userId ?? '')
    : brandCheckIpDayKey(request.ipHash)
  const narrowState = await store.hit(`${prefix}${narrowKey}`, BRAND_AI_DAY_WINDOW_MS)
  if (request.quota === 'account') counts.accountDay = narrowState.count
  else counts.ipDay = narrowState.count

  const narrow = decideBrandCheckQuota(counts)
  if (narrow) return { code: narrow, retryAfterSec: retryAfter(narrowState.resetInMs) }

  const instanceState = await store.hit(
    `${prefix}${brandCheckInstanceDayKey()}`,
    BRAND_AI_DAY_WINDOW_MS,
  )
  counts.instanceDay = instanceState.count
  const perInstance = decideBrandCheckQuota(counts)
  return perInstance
    ? { code: perInstance, retryAfterSec: retryAfter(instanceState.resetInMs) }
    : null
}

/**
 * DIE STÜNDLICHE DROSSEL DER KORREKTURVORSCHLÄGE (§3b) — je Anschluss, auf
 * demselben Tages-Stempel wie der Check.
 *
 * Sie steht NEBEN dem Minuten-Eimer aus `05.rate-limit.ts` und meint etwas
 * anderes: die Minute schützt den Server vor dem Sekundentakt, die Stunde die
 * Arbeitsliste des Betreibers vor der Flut über den Tag. Gebucht wird VOR
 * jedem Appwrite-Ruf — ein Deckel, der erst nach der Arbeit greift, ist keiner.
 */
export async function bookBrandCorrectionQuota(
  event: H3Event,
  ipHash: string,
): Promise<BrandCheckQuotaRejection | null> {
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(
    `${prefix}${brandCheckCorrectionIpHourKey(ipHash)}`,
    BRAND_CHECK_CORRECTION_WINDOW_MS,
  )
  const rejected = decideBrandCheckCorrectionQuota(state.count)
  return rejected ? { code: rejected, retryAfterSec: retryAfter(state.resetInMs) } : null
}
