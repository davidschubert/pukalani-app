import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import type { StripeSecretSource } from '../../shared/stripeKeys'
import { decryptSecretWithKeys, encryptSecret, parseSecretBoxKey } from '../../../core/server/utils/secretBox'

/**
 * WO KOMMEN DIE STRIPE-GEHEIMNISSE HER? (F55, Davids Entscheidung 2026-08-08)
 *
 * Zwei Quellen, feste Rangfolge: **DB schlägt Env**. Die DB-Zeile trägt der
 * Betreiber über /dashboard/stripe ein, die Env bleibt der Weg für alles, was
 * ohne Oberfläche auskommen muss (CI, lokale Entwicklung, Notfall-Rückfall
 * nach einem Fehleintrag).
 *
 * DIE RANGFOLGE IST HERUM, WEIL SIE SONST NICHTS BEWIRKTE: stünde die Env
 * vorn, hätte ein Eintrag über die Seite auf `control` (wo `NUXT_STRIPE_*`
 * gesetzt IST) keine Wirkung — der Betreiber klickt, die Karte meldet Erfolg,
 * und der Checkout benutzt weiter den alten Key. Genau die Sorte stiller
 * Wirkungslosigkeit, die F44 zum Wächter gemacht hat.
 *
 * VERHALTEN OHNE DB-WERT IST EXAKT WIE VORHER. Keine Zeile, keine Tabelle,
 * kein Verschlüsselungs-Schlüssel — jedes Mal fällt die Auflösung auf die Env
 * zurück, und wenn auch die leer ist, auf 'none'. Der Webhook antwortet dann
 * weiter 404, `useStripe` weiter 500. Das ist wichtig für den Silo
 * (`apps/comments`): dort läuft der billing-Layer mit, aber niemand wird je
 * eine `stripe_settings`-Zeile anlegen.
 *
 * FAIL-SOFT BEIM LESEN: eine fehlende Tabelle (Migration billing-002 noch
 * nicht gelaufen) oder ein Appwrite-Aussetzer darf den Geldweg nicht kappen,
 * solange die Env trägt. Ein NICHT ENTSCHLÜSSELBARER Wert ist dagegen ein
 * Vorfall und wird laut protokolliert — er sieht sonst aus wie „nichts
 * gespeichert" und niemand fragt nach.
 */

export const STRIPE_SETTINGS_TABLE = 'stripe_settings'

/**
 * EINE Zeile, feste Id. Es gibt genau eine Stripe-Konfiguration je Instanz —
 * eine `ID.unique()`-Zeile bräuchte eine Abfrage, einen Index und die Frage
 * „welche gilt, wenn zwei da sind". Die feste Id beantwortet sie nicht,
 * sondern lässt sie gar nicht erst entstehen.
 */
export const STRIPE_SETTINGS_ROW_ID = 'stripe'

export interface StripeSettingsRow extends Models.Row {
  stripeSecretKeyEncrypted: string
  stripeWebhookSecretEncrypted: string
  /**
   * HERKUNFTS-MARKE des Webhook-Secrets (MEDIUM 2, Migration billing-003):
   * die Id des Stripe-Endpunkts, den DIESE Instanz selbst angelegt hat und
   * dessen `secret` sie dabei abgelegt hat. Leer = unbekannte Herkunft.
   *
   * Sie beantwortet die einzige Frage, die die Statuskarte sonst nicht
   * beantworten KANN: ob das gespeicherte `whsec_` zu dem Endpunkt gehört, den
   * sie gerade anzeigt. Stripe gibt das Secret nur beim Anlegen heraus — ein
   * nachträglicher Abgleich ist prinzipiell unmöglich, also merken wir uns den
   * einen Moment, in dem wir es sicher wussten.
   */
  webhookEndpointId: string
  updatedAt: string
  updatedBy: string
}

/** Ergebnis einer Auflösung: der Wert und — für die Statuskarte — seine Herkunft. */
export interface ResolvedStripeSecret {
  value: string
  source: StripeSecretSource
}

/**
 * Verschlüsselungs-Schlüssel dieser Instanz (server-only Env) — der Schlüssel,
 * mit dem GESCHRIEBEN wird.
 *
 * Der rohe Wert geht ungeprüft an `parseSecretBoxKey`: der wirft bei jedem
 * Nicht-String (NOTE 10 — Nitro schickt Env-Werte durch `destr`, ein Schlüssel
 * aus lauter Ziffern käme als Number an und fiel vorher still auf „nicht
 * konfiguriert" zurück).
 */
export function stripeSettingsKey(event?: H3Event): Buffer | null {
  return parseSecretBoxKey(useRuntimeConfig(event).billingSettingsKey)
}

/**
 * ZWEITSCHLÜSSEL FÜR DIE ROTATION (LOW 7, 2026-08-08): wird NUR gelesen, nie
 * geschrieben. Ablauf einer Rotation (Runbook „Schlüssel tauschen"):
 * OLD=alt + NEU=neu deployen → jedes Geheimnis einmal über die Seite neu
 * speichern (schreibt mit NEU) → OLD entfernen.
 */
export function stripeSettingsOldKey(event?: H3Event): Buffer | null {
  return parseSecretBoxKey(useRuntimeConfig(event).billingSettingsKeyOld, 'NUXT_BILLING_SETTINGS_KEY_OLD')
}

/**
 * DREI ZUSTÄNDE, NICHT ZWEI (Session-Audit 2026-08-09).
 *
 * `unconfigured` ist ein gültiger Betriebszustand (Silo, lokale Entwicklung —
 * die Env-Keys tragen). `invalid` ist es NICHT: da hat jemand einen Schlüssel
 * gesetzt und sich vertippt. Beides als „nicht konfiguriert" zu melden, schickt
 * ihn zum Anlegen eines Schlüssels, den er längst hat — die Meldung nennt dann
 * genau die Variable, die schon dasteht.
 */
export type StripeSettingsStorageState = 'available' | 'unconfigured' | 'invalid'

export function stripeSettingsStorageState(event?: H3Event): StripeSettingsStorageState {
  try {
    return stripeSettingsKey(event) !== null ? 'available' : 'unconfigured'
  }
  catch {
    // Gesetzt, aber falsch geformt (`parseSecretBoxKey` wirft) — der genaue
    // Wortlaut bleibt im Server, nach draußen geht nur die Unterscheidung.
    return 'invalid'
  }
}

/**
 * Kann diese Instanz überhaupt Geheimnisse ablegen? Wenn nicht, zeigt die
 * Oberfläche den Env-Namen statt der Eingabefelder — statt ein Formular
 * anzubieten, dessen Absenden nur scheitern kann. Für die Statuskarte reicht
 * das Ja/Nein; WARUM nicht, sagt `stripeSettingsStorageState`.
 */
export function stripeSettingsStorageAvailable(event?: H3Event): boolean {
  return stripeSettingsStorageState(event) === 'available'
}

/**
 * 30 s Gedächtnis: der Geldweg fragt sonst je Checkout eine Zeile nach.
 *
 * EINZELPROZESS-ANNAHME, ausdrücklich (Session-Audit 2026-08-09): Cache und
 * Leerung leben im Speicher DIESES Node-Prozesses. `control` läuft als
 * pm2-Einzelinstanz, deshalb trägt das. Liefe es je als Cluster mit mehr als
 * einem Worker, sähe nur der schreibende Worker den neuen Schlüssel sofort —
 * die anderen bis zu 30 s den alten, und ein gerade rotierter Stripe-Key wäre
 * für sie eine halbe Minute lang der abgelaufene. Dann bräuchte es eine
 * Leerung über Redis (dasselbe gilt für den Reihenfolge-Riegel in
 * apps/control/server/api/control/stripe/webhook.post.ts).
 */
const CACHE_TTL_MS = 30_000
let cache: { at: number, row: StripeSettingsRow | null } | null = null

/** Nach jedem Schreiben: der nächste Leser holt frisch (sonst 30 s Blindflug). */
export function invalidateStripeSettingsCache(): void {
  cache = null
}

async function loadStripeSettings(event: H3Event): Promise<StripeSettingsRow | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.row

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  if (!databaseId) {
    cache = { at: Date.now(), row: null }
    return null
  }

  const row = await createAdminClient(event).tablesDB.getRow<StripeSettingsRow>({
    databaseId,
    tableId: STRIPE_SETTINGS_TABLE,
    rowId: STRIPE_SETTINGS_ROW_ID,
  }).catch((error: unknown) => {
    // 404 = Zeile (oder Tabelle) gibt es nicht — der Normalzustand jeder
    // Instanz, die ihre Keys über die Env fährt. Alles andere ist ein
    // Aussetzer; auch dann tragen wir die Env weiter, melden es aber einmal.
    if (!hasAppwriteCode(error, 404)) {
      warnMisconfiguredOnce('stripeSettingsRead', `[billing] ${STRIPE_SETTINGS_TABLE} nicht lesbar — Stripe-Geheimnisse kommen bis auf Weiteres aus der Env.`)
    }
    return null
  })

  cache = { at: Date.now(), row }
  return row
}

function hasAppwriteCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

/**
 * Einen verschlüsselten Wert öffnen. Leerer Umschlag = „nichts gespeichert".
 * Ein Fehler beim Öffnen wird laut protokolliert und wie „nichts gespeichert"
 * behandelt — der Env-Rückfall greift dann.
 */
function openEnvelope(envelope: string, keys: readonly Buffer[], label: string): string {
  if (!envelope) return ''
  if (keys.length === 0) {
    warnMisconfiguredOnce(`stripeSettingsNoKey:${label}`, `[billing] ${label} liegt verschlüsselt in der DB, aber NUXT_BILLING_SETTINGS_KEY fehlt — der Wert ist unbenutzbar.`)
    return ''
  }
  try {
    return decryptSecretWithKeys(envelope, keys)
  }
  catch {
    warnMisconfiguredOnce(`stripeSettingsBroken:${label}`, `[billing] ${label} in ${STRIPE_SETTINGS_TABLE} lässt sich nicht entschlüsseln (falscher NUXT_BILLING_SETTINGS_KEY oder veränderte Zeile).`)
    return ''
  }
}

/**
 * LESE-Schlüssel in fester Reihenfolge: aktueller zuerst, Alt-Schlüssel
 * dahinter. Beide werden einzeln abgesichert — ein Tippfehler in der Env darf
 * den Geldweg nicht kappen: eine falsch geformte Variable macht die ABLAGE
 * unbenutzbar (`saveStripeSettings` wirft dort weiter), nicht das LESEN, und
 * ein kaputter ALT-Schlüssel darf den gültigen aktuellen nicht mitreißen.
 */
function settingsReadKeys(event: H3Event): Buffer[] {
  const keys: Buffer[] = []
  for (const read of [stripeSettingsKey, stripeSettingsOldKey]) {
    try {
      const key = read(event)
      if (key) keys.push(key)
    }
    catch {
      // Ursache steht im Fehler der Speichern-Route bzw. im Runbook.
    }
  }
  return keys
}

/** Secret-Key zur Laufzeit: DB (entschlüsselt) vor Env. */
export async function resolveStripeSecretKey(event: H3Event): Promise<ResolvedStripeSecret> {
  const keys = settingsReadKeys(event)
  const row = await loadStripeSettings(event)
  const fromDb = openEnvelope(row?.stripeSecretKeyEncrypted ?? '', keys, 'Stripe-Secret-Key')
  if (fromDb) return { value: fromDb, source: 'db' }

  const fromEnv = useRuntimeConfig(event).stripeSecretKey
  if (fromEnv) return { value: fromEnv, source: 'env' }
  return { value: '', source: 'none' }
}

/** Webhook-Signatur-Secret zur Laufzeit: DB (entschlüsselt) vor Env. */
export async function resolveStripeWebhookSecret(event: H3Event): Promise<ResolvedStripeSecret> {
  const keys = settingsReadKeys(event)
  const row = await loadStripeSettings(event)
  const fromDb = openEnvelope(row?.stripeWebhookSecretEncrypted ?? '', keys, 'Stripe-Webhook-Secret')
  if (fromDb) return { value: fromDb, source: 'db' }

  const fromEnv = useRuntimeConfig(event).stripeWebhookSecret
  if (fromEnv) return { value: fromEnv, source: 'env' }
  return { value: '', source: 'none' }
}

/**
 * Zu WELCHEM Stripe-Endpunkt gehört das gespeicherte Webhook-Secret? (MEDIUM 2)
 *
 * Leer heißt „unbekannt" — und zwar in DREI Fällen, die alle dieselbe ehrliche
 * Antwort verdienen: das Secret kam aus der Env, es wurde von Hand eingetragen,
 * oder es liegt aus der Zeit vor dieser Marke in der Zeile. Der Aufrufer sagt
 * dann „Herkunft unbestätigt", nie „falsch".
 */
export async function resolveStripeWebhookEndpointId(event: H3Event): Promise<string> {
  const row = await loadStripeSettings(event)
  return row?.webhookEndpointId ?? ''
}

/**
 * Die Herkunfts-Marke setzen (oder mit '' löschen) — FAIL-SOFT und bewusst
 * getrennt von `saveStripeSettings`.
 *
 * WARUM GETRENNT: die Spalte kommt aus Migration billing-003. Läuft der Code
 * auf einer Instanz, auf der die Migration noch nicht gefahren ist, lehnt
 * Appwrite das unbekannte Feld ab — und läge es im selben Aufruf, risse es das
 * SPEICHERN DES SECRETS mit. Ein Endpunkt ohne Secret ist genau der Schaden,
 * den MEDIUM 1 beseitigt; die Marke ist dagegen nur Diagnose. Sie fehlt dann,
 * die Karte sagt „Herkunft unbestätigt", und das ist die konservative Seite.
 */
export async function rememberStripeWebhookEndpointId(event: H3Event, endpointId: string, updatedBy: string): Promise<boolean> {
  try {
    const config = useRuntimeConfig(event)
    await createAdminClient(event).tablesDB.updateRow({
      databaseId: config.public.appwriteDatabaseId,
      tableId: STRIPE_SETTINGS_TABLE,
      rowId: STRIPE_SETTINGS_ROW_ID,
      data: { webhookEndpointId: endpointId, updatedAt: new Date().toISOString(), updatedBy },
    })
    invalidateStripeSettingsCache()
    return true
  }
  catch (error) {
    console.error(`[billing] Herkunfts-Marke des Webhook-Secrets nicht gespeichert (Migration billing-003 gefahren?):`, (error as { code?: number })?.code ?? 'unknown')
    return false
  }
}

/**
 * Geheimnisse ablegen. Nur die ÜBERGEBENEN Felder werden angefasst — ein
 * fehlendes Feld heißt „nicht angefasst", nie „leeren". (Dieselbe Regel wie
 * beim `neutral`-Feld des Branding-PATCH, B5: ein Pflichtfeld hier hieße,
 * dass das Speichern eines neuen Secret-Keys das Webhook-Secret mitlöscht.)
 *
 * Die Zeile trägt KEINE Row-Permissions: sie ist damit ausschließlich über
 * den Admin-Client erreichbar. Kein Session-Client, keine Rolle, kein Label
 * kommt an sie heran — auch nicht der Betreiber selbst über eine generische
 * Row-Route. Der einzige Weg zurück ist die Entschlüsselung im Server.
 */
export async function saveStripeSettings(
  event: H3Event,
  patch: { secretKey?: string, webhookSecret?: string },
  updatedBy: string,
): Promise<void> {
  const key = stripeSettingsKey(event)
  if (!key) {
    throw createError({
      status: 503,
      statusText: 'Secret storage not configured',
      data: { code: 'encryption_unconfigured' },
    })
  }

  const config = useRuntimeConfig(event)
  const databaseId = config.public.appwriteDatabaseId
  const admin = createAdminClient(event)

  const data: Record<string, string> = { updatedAt: new Date().toISOString(), updatedBy }
  if (patch.secretKey !== undefined) data.stripeSecretKeyEncrypted = encryptSecret(patch.secretKey, key)
  if (patch.webhookSecret !== undefined) data.stripeWebhookSecretEncrypted = encryptSecret(patch.webhookSecret, key)

  try {
    await admin.tablesDB.updateRow({
      databaseId,
      tableId: STRIPE_SETTINGS_TABLE,
      rowId: STRIPE_SETTINGS_ROW_ID,
      data,
    })
  }
  catch (error) {
    if (!hasAppwriteCode(error, 404)) throw error
    // Erste Ablage: die Zeile entsteht hier, nicht in der Migration — eine
    // leere Zeile mit Pflichtfeldern wäre nur ein Platzhalter, den man beim
    // Aufräumen für Müll hält.
    await admin.tablesDB.createRow({
      databaseId,
      tableId: STRIPE_SETTINGS_TABLE,
      rowId: STRIPE_SETTINGS_ROW_ID,
      data: {
        stripeSecretKeyEncrypted: '',
        stripeWebhookSecretEncrypted: '',
        ...data,
      },
      permissions: [],
    }).catch(async (createError_) => {
      // DER DOPPELKLICK AUF DIE ERSTE ABLAGE (Session-Audit 2026-08-09): zwei
      // gleichzeitige Speichern-Klicks laufen BEIDE in den 404 und legen beide
      // an — der zweite bekommt 409 und wäre bis heute als „Speichern
      // fehlgeschlagen" beim Betreiber gelandet, obwohl die Zeile existiert.
      // Einmal als `update` wiederholen: derselbe Patch, dasselbe Ergebnis.
      if (!hasAppwriteCode(createError_, 409)) throw createError_
      await admin.tablesDB.updateRow({
        databaseId,
        tableId: STRIPE_SETTINGS_TABLE,
        rowId: STRIPE_SETTINGS_ROW_ID,
        data,
      })
    })
  }

  invalidateStripeSettingsCache()
}
