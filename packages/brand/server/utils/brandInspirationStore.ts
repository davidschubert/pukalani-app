import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { ID, Query } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { BRAND_INSPIRATION_AREAS } from '../../shared/brandDesignVocab'
import {
  type BrandInspirationEntry,
  brandInspirationSlotValue,
} from '../../shared/brandInspiration'
import { canEnterBrandStep, resolveBrandJourney } from '../../shared/brandJourney'
import { type BrandReadingEntry, parseBrandReading, serializeBrandReading } from '../../shared/brandReading'
import {
  BRAND_STEPS_TABLE,
  type BrandProfileRow,
  type BrandSlotRecord,
  type BrandStepRow,
  brandDb,
  isAppwriteNotFound,
  loadOwnedProfile,
  loadStepRows,
  parseSlotRecords,
  profileFacts,
  requireProfileIdParam,
  serializeSlotRecords,
  toStepFacts,
} from './brandStore'

/**
 * DIE VORBILDER — DER SPEICHER (Konzept docs/archiv/BRAND-DESIGN.md §2.2/§2.13,
 * Paket D2a).
 *
 * ── DIE DATEI IST DIE WAHRHEIT, DIE ZEILE BESCHREIBT SIE ──────────────────
 * Zeilen-Id = Datei-Id (Migration brand-024). Löschen ist damit `deleteRow` +
 * `deleteFile` auf dieselbe Id, Ausliefern ein `getFileView` ohne Nachschlagen,
 * und es gibt keinen Zustand, in dem die Zeile auf eine andere Datei zeigt als
 * die, die sie beschreibt.
 *
 * ── DREI SCHRANKEN, JEDE MIT EIGENER FRAGE ────────────────────────────────
 *  1. `requireBrandAccess` — darf dieses Konto überhaupt in den Wizard?
 *  2. `loadOwnedProfile` → `assertBrandOwnerAccess` — gehört ihm DIESE Marke?
 *  3. `canEnterBrandStep(journey, 'dna')` — ist das Kapitel für diese Marke
 *     überhaupt auf dem Weg? Ohne Freischaltung von Brand Design und ohne
 *     fertige Foundation ist es das nicht, und dann gibt es hier NICHTS —
 *     auch keine leere Liste.
 *
 * Alle drei antworten mit **404**, nicht mit 403: die Datentür-Regel dieses
 * Layers (Kopf von `brandAccess.ts`). Die Kapitel-ROUTEN antworten an dieser
 * Stelle bewusst 403 mit Grund (`design_locked`), weil die Werkstatt daraus
 * einen Satz macht — hier gibt es keine Seite, die etwas erklären würde, also
 * gibt es auch nichts zu verraten.
 *
 * ── SIE HÄNGEN AN DER MARKE, NICHT AM KAPITEL ─────────────────────────────
 * Eine eigene Tabelle statt eines JSON-Feldes in `brand_steps.slots`: die
 * Spalte ist gedeckelt, ein Bild hat einen eigenen Lebenszyklus (Datei,
 * Lesung, Löschung), und zwölf Lesungen (D2b) sprengen jedes Slot-Feld. Der
 * SLOT bekommt trotzdem einen Wert — die Auswahl in Worten (s.
 * `syncBrandInspirationSlot`).
 */

export const BRAND_INSPIRATION_TABLE = 'brand_inspiration'
export const BRAND_INSPIRATION_BUCKET = 'brand-inspiration'

/** Das Kapitel, zu dem die Vorbilder gehören (`g.inspiration`, §2.2). */
export const BRAND_INSPIRATION_STEP_KEY = 'dna'
export const BRAND_INSPIRATION_SLOT_ID = 'g.inspiration'

export type BrandInspirationRow = Models.Row & {
  profileId: string
  area: string
  note?: string | null
  number?: number | null
  filename?: string | null
  /** Die Lesung des Vision-Modells — geschrieben erst von D2b. */
  reading?: string | null
}

/** Der EINE 503 dieser Fläche — gleiche Sprache wie die Nachbar-Routen. */
export function brandInspirationUnavailable(error: unknown, data: Record<string, unknown> = {}) {
  logEvent('warn', 'brand.inspiration_unavailable', {
    ...data,
    message: error instanceof Error ? error.message : 'unknown',
  })
  return createError({
    status: 503,
    statusText: 'Brand inspiration storage unavailable',
    data: { code: 'inspiration_unavailable' },
  })
}

export function toBrandInspirationEntry(row: BrandInspirationRow): BrandInspirationEntry {
  return {
    id: row.$id,
    number: row.number ?? 1,
    area: row.area,
    note: row.note ?? '',
    filename: row.filename ?? '',
    createdAt: row.$createdAt,
    // FAIL-SOFT (s. `parseBrandReading`): eine unlesbare Lesung ist „noch
    // nicht gelesen" — der nächste Lauf schreibt sie neu.
    reading: parseBrandReading(row.reading),
  }
}

/**
 * DIE LESUNG EINER ZEILE SCHREIBEN (D2b). Sie steht in der Zeile des BILDES
 * und nicht im Slot-Wert: zwölf Lesungen mit je drei Belegungen, Anker,
 * Begründung und Vorschlag sprengen jedes Slot-Feld (Kopf dieser Datei), und
 * sie gehören dem Bild — wird es entfernt, ist auch seine Lesung weg, ohne
 * dass irgendwo aufgeräumt werden müsste.
 *
 * FAIL-SOFT je Zeile: scheitert eine, bleiben die anderen. Der Lauf meldet
 * hinterher, wie viele wirklich geschrieben wurden, und die Veraltet-Rechnung
 * (`brandReadingState`) sieht die Lücke von selbst.
 */
export async function writeBrandInspirationReading(
  event: H3Event,
  fileId: string,
  reading: BrandReadingEntry,
): Promise<boolean> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_INSPIRATION_TABLE,
      rowId: fileId,
      data: { reading: serializeBrandReading(reading) },
    })
    return true
  }
  catch (error) {
    logEvent('warn', 'brand.inspiration_reading_write_failed', {
      fileId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return false
  }
}

/**
 * DIE BYTES EINES VORBILDS — server-only, für den Vision-Lauf.
 *
 * Sie gehen NIE an einen Browser (dafür ist die Ausliefer-Route da, die Besitz
 * prüft und `private, no-store` setzt) und NIE in ein Log. Der Aufrufer prüft
 * VORHER die Zugehörigkeit der Marke; hier steht nur das Holen.
 */
export async function readBrandInspirationBytes(
  event: H3Event,
  fileId: string,
): Promise<Buffer> {
  const admin = createAdminClient(event)
  const bytes = await admin.storage.getFileView({
    bucketId: BRAND_INSPIRATION_BUCKET,
    fileId,
  })
  return Buffer.from(bytes as ArrayBuffer)
}

/**
 * Alle Vorbilder EINER Marke, nach ihrer Nummer sortiert.
 *
 * SORTIERT WIRD IM CODE und nicht über `Query.orderAsc('number')`: es sind
 * höchstens zwölf Zeilen, und ein Sortier-Index wäre ein Versprechen auf eine
 * Abfrage, die es nicht gibt (Kopf von brand-024).
 *
 * Eine FEHLENDE Tabelle ist hier eine leere Liste, kein Fehler: das ist der
 * Zustand VOR der Migration, und ein Kapitel, das sich deswegen gar nicht mehr
 * öffnen lässt, wäre die teurere Antwort. Jeder andere Lesefehler schlägt
 * durch — eine still verschwundene Liste wäre schlimmer als ein 503.
 */
export async function listBrandInspiration(
  event: H3Event,
  profileId: string,
): Promise<BrandInspirationEntry[]> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandInspirationRow>({
      databaseId,
      tableId: BRAND_INSPIRATION_TABLE,
      // Der Deckel steht ÜBER dem Limit aus `BRAND_INSPIRATION_MAX`: sähe die
      // Liste nur zwölf, könnte eine dreizehnte Zeile aus einem Altbestand
      // unsichtbar liegen bleiben und die Zählung wäre für immer falsch.
      queries: [Query.equal('profileId', profileId), Query.limit(50)],
    })
    return res.rows.map(toBrandInspirationEntry).sort((a, b) => a.number - b.number)
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw brandInspirationUnavailable(error, { profileId, stage: 'list' })
  }
}

export interface BrandInspirationContext {
  profile: BrandProfileRow
  stepRows: BrandStepRow[]
}

/**
 * DIE DREI SCHRANKEN AUF EINMAL (s. Kopf). Jede Route dieser Fläche ruft sie
 * als ERSTES; danach steht fest, dass es diese Marke gibt, dass sie diesem
 * Konto gehört und dass `dna` für sie offen ist.
 */
export async function requireBrandInspirationContext(
  event: H3Event,
  userId: string,
  betaAccount: boolean,
): Promise<BrandInspirationContext> {
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)
  const stepRows = await loadStepRows(event, profile.$id)
  const journey = resolveBrandJourney(profileFacts(profile, betaAccount), toStepFacts(stepRows))
  const decision = canEnterBrandStep(journey, BRAND_INSPIRATION_STEP_KEY)
  if (!decision.allowed) throw createError({ status: 404, statusText: 'Not Found' })
  return { profile, stepRows }
}

/** Die Vorbild-Zeile dieser Marke — 404, wenn sie zu einer anderen gehört. */
export async function loadBrandInspirationRow(
  event: H3Event,
  profileId: string,
  fileId: string,
): Promise<BrandInspirationRow> {
  const { tablesDB, databaseId } = brandDb(event)
  let row: BrandInspirationRow
  try {
    row = await tablesDB.getRow<BrandInspirationRow>({
      databaseId, tableId: BRAND_INSPIRATION_TABLE, rowId: fileId,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) throw createError({ status: 404, statusText: 'Not Found' })
    throw brandInspirationUnavailable(error, { profileId, fileId, stage: 'get' })
  }
  /**
   * DIE ZUGEHÖRIGKEIT WIRD BELEGT, NICHT ANGENOMMEN — die Regel der Datentür
   * (CLAUDE.md: „`get/update/remove` belegen die Zugehörigkeit VOR der
   * Aktion"). Ohne diese Zeile wäre eine geratene Zeilen-Id der Weg zu einem
   * fremden Bild: die Besitzprüfung darüber gilt der MARKE, nicht der Zeile.
   */
  if (row.profileId !== profileId) throw createError({ status: 404, statusText: 'Not Found' })
  return row
}

/**
 * Wie der Bereich in der Inhaltssprache dieser Marke heisst. Kein i18n: das
 * hier läuft im Server, und `BRAND_INSPIRATION_AREAS` trägt beide Sprachen
 * selbst (dasselbe Muster wie `advisorOpenersFor`).
 */
function areaLabelFor(locale: string): (areaId: string) => string {
  const en = locale === 'en'
  return (areaId: string) => {
    const area = BRAND_INSPIRATION_AREAS.find(entry => entry.id === areaId)
    if (!area) return areaId
    return en ? area.en : area.de
  }
}

/**
 * DER SLOT-WERT VON `g.inspiration` ZIEHT MIT (§2.2).
 *
 * ── ER WIRD NIE `confirmed` ───────────────────────────────────────────────
 * Geschrieben werden `firstDraft` und `latestDraft`, niemals `confirmed`, und
 * das ist eine Sicherung und keine Nachlässigkeit: `confirmedSlotValues` ist
 * die Grundlage des Dokuments, der Veröffentlichung und jedes Snapshots
 * (`brandStore.ts`) — was dort nie auftaucht, kann auch durch ein späteres
 * Kapitel (D8: Brand Design im Dokument) nicht versehentlich hineingeraten.
 * Das ist Leitplanke c aus §2.2: **Bilder sind Eingabe, nie Ausgabe.**
 * `brandShareableSlotValues` (`sensitivity: 'internal'`) ist die zweite
 * Sicherung, nicht die einzige.
 *
 * Und es ist ausserdem ehrlich: `g.inspiration` ist `type: 'special'`, also
 * `slotIsConfirmable() === false` — ein Server, der trotzdem `confirmed`
 * schriebe, behauptete eine Zustimmung, für die es in der Werkstatt gar keinen
 * Knopf gibt.
 *
 * ── NO-OP SCHREIBT NICHT ──────────────────────────────────────────────────
 * Dieselbe Regel wie im Autosave: ein PATCH, der nichts ändert, darf weder
 * `revision` erhöhen noch die Konflikt-Erkennung eines offenen zweiten Tabs
 * zum Zufallsgenerator machen.
 *
 * ── FAIL-SOFT ─────────────────────────────────────────────────────────────
 * Fehlt die `dna`-Zeile oder scheitert das Schreiben, ist das Bild trotzdem
 * hochgeladen. Die Wahrheit steht in der Tabelle; der Slot-Wert ist die
 * ANZEIGE davon, und eine misslungene Anzeige darf einen erfolgreichen Upload
 * nicht in einen Fehler verwandeln. Der nächste Schreibvorgang zieht ihn nach.
 */
export async function syncBrandInspirationSlot(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  entries: readonly BrandInspirationEntry[],
): Promise<void> {
  const stepRow = stepRows.find(row => row.stepKey === BRAND_INSPIRATION_STEP_KEY)
  if (!stepRow) {
    logEvent('warn', 'brand.inspiration_slot_row_missing', { profileId: profile.$id })
    return
  }

  const locale = profile.contentLocale === 'en' ? 'en' : 'de'
  const value = brandInspirationSlotValue(
    entries,
    areaLabelFor(locale),
    locale === 'en' ? 'No note.' : 'Ohne Notiz.',
  )

  const records = parseSlotRecords(stepRow.slots)
  const before = records[BRAND_INSPIRATION_SLOT_ID]
  let next: Record<string, BrandSlotRecord>

  if (!value) {
    // Kein Vorbild mehr ⇒ der Slot ist wieder WEG, nicht leer: „fehlt" heisst
    // in diesem Datensatz überall dasselbe wie „nichts drin" (`toSlotFacts`),
    // und ein leerer Text wäre ein zweiter Weg, dasselbe zu sagen.
    //
    // Gebaut wird die neue Ablage aus den Einträgen statt mit `delete` über
    // einen berechneten Schlüssel (das verbietet ESLint, und zu Recht: an der
    // Stelle stünde nicht, WELCHER Schlüssel verschwindet).
    if (!before) return
    next = Object.fromEntries(
      Object.entries(records).filter(([key]) => key !== BRAND_INSPIRATION_SLOT_ID),
    )
  }
  else {
    if (before?.latestDraft === value) return
    next = {
      ...records,
      [BRAND_INSPIRATION_SLOT_ID]: {
        ...before,
        firstDraft: before?.firstDraft ?? value,
        latestDraft: value,
        updatedAt: new Date().toISOString(),
      },
    }
  }

  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.updateRow({
      databaseId,
      tableId: BRAND_STEPS_TABLE,
      rowId: stepRow.$id,
      data: {
        slots: serializeSlotRecords(next),
        revision: (stepRow.revision ?? 0) + 1,
      },
    })
  }
  catch (error) {
    logEvent('warn', 'brand.inspiration_slot_write_failed', {
      profileId: profile.$id,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}

/**
 * EIN VORBILD ANLEGEN — Datei zuerst, Zeile danach.
 *
 * DIE REIHENFOLGE IST DIE AUFRÄUM-REGEL: scheitert die Zeile, wird die Datei
 * wieder entfernt (sonst läge eine Waise im Bucket, die keine Route mehr
 * erreicht). Umgekehrt wäre die Zeile da und zeigte auf nichts — und genau das
 * sähe der Kunde als kaputtes Bild.
 */
export async function createBrandInspiration(
  event: H3Event,
  input: {
    profileId: string
    bytes: Buffer
    filename: string
    area: string
    note: string
    number: number
  },
): Promise<BrandInspirationEntry> {
  const { tablesDB, databaseId } = brandDb(event)
  const admin = createAdminClient(event)
  const fileId = ID.unique()

  try {
    await admin.storage.createFile({
      bucketId: BRAND_INSPIRATION_BUCKET,
      fileId,
      file: InputFile.fromBuffer(input.bytes, input.filename || `${fileId}.png`),
    })
  }
  catch (error) {
    throw brandInspirationUnavailable(error, { profileId: input.profileId, stage: 'upload' })
  }

  try {
    const row = await tablesDB.createRow<BrandInspirationRow>({
      databaseId,
      tableId: BRAND_INSPIRATION_TABLE,
      rowId: fileId,
      data: {
        profileId: input.profileId,
        area: input.area,
        note: input.note,
        number: input.number,
        filename: input.filename.slice(0, 200),
      },
    })
    return toBrandInspirationEntry(row)
  }
  catch (error) {
    await admin.storage
      .deleteFile({ bucketId: BRAND_INSPIRATION_BUCKET, fileId })
      .catch(() => {})
    throw brandInspirationUnavailable(error, { profileId: input.profileId, stage: 'row' })
  }
}

/**
 * EIN VORBILD ENTFERNEN — Zeile zuerst, Datei danach.
 *
 * GENAU ANDERSHERUM ALS BEIM ANLEGEN, und aus demselben Grund: was am Ende
 * liegen bleiben DARF, ist der Rest, den niemand mehr sieht. Bleibt die Datei
 * (weil der zweite Schritt scheitert), erreicht sie keine Route mehr — es gibt
 * keine Zeile, die sie nennt. Bliebe die ZEILE, zeigte die Werkstatt eine
 * Karte mit kaputtem Bild.
 *
 * 404 auf die Datei ist kein Fehler: „entfernen, was nicht da ist" ist ein
 * No-op, und das Ziel des Klicks ist erreicht.
 *
 * ── ZWEI HÄRTEN FÜR ZWEI AUFRUFER (`strictFile`) ──────────────────────────
 * BEIM KLICK bleibt die Bucket-Löschung FAIL-SOFT: der Mensch hat „entfernen"
 * gedrückt, die Zeile ist weg, die Karte verschwindet — an einem Speicher, der
 * gerade zickt, soll das nicht scheitern. Der Rest ist unsichtbar und wird
 * beim nächsten Anlauf mitgenommen.
 *
 * DER GDPR-LAUF IST DER HARTE WEG (`strictFile: true`, s. `purgeBrandInspiration`
 * unten): dort ist die Datei selbst der Gegenstand der Zusage, und ein
 * geschluckter Fehler wäre eine gemeldete Löschung, die nicht stattgefunden
 * hat. Deshalb ist es ein ARGUMENT und keine zweite Funktion — es gibt genau
 * eine Löschreihenfolge, aber zwei Versprechen darüber.
 */
export async function deleteBrandInspiration(
  event: H3Event,
  profileId: string,
  fileId: string,
  options: { strictFile?: boolean } = {},
): Promise<void> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.deleteRow({ databaseId, tableId: BRAND_INSPIRATION_TABLE, rowId: fileId })
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      throw brandInspirationUnavailable(error, { profileId, fileId, stage: 'delete_row' })
    }
  }
  const admin = createAdminClient(event)
  await admin.storage
    .deleteFile({ bucketId: BRAND_INSPIRATION_BUCKET, fileId })
    .catch((error) => {
      if (isAppwriteNotFound(error)) return
      logEvent('warn', 'brand.inspiration_file_delete_failed', {
        profileId,
        fileId,
        message: error instanceof Error ? error.message : 'unknown',
      })
      if (options.strictFile) {
        throw brandInspirationUnavailable(error, { profileId, fileId, stage: 'delete_file' })
      }
    })
}

/**
 * ALLE VORBILDER EINER MARKE ENTFERNEN — für die Löschkaskade und den
 * GDPR-Lauf. Gibt zurück, wie viele Zeilen weg sind (die Zahl geht ins Log,
 * nie in eine Antwort an den Client).
 *
 * IDEMPOTENT wie die Kaskade selbst: eine fehlende Tabelle ist eine Null, kein
 * Abbruch (Vertrag des GDPR-Contributors: „ein Re-Run nach Teilfehler findet
 * Rest-Daten oder nichts und terminiert erfolgreich").
 *
 * ── EIN FEHLER WIRD GEWORFEN, NICHT GEZÄHLT (Audit-Befund 2026-09-09) ─────
 * Hier stand `…catch(() => {}); removed += 1`: JEDER Fehler war geschluckt und
 * wurde trotzdem als „entfernt" gezählt. Das ist bei einer Löschzusage die
 * teuerste denkbare Zeile — der GDPR-Lauf hätte einen vollen Bucket als
 * vollständige Löschung gemeldet, und die Zahl im Log hätte es bestätigt.
 *
 * Geschluckt wird deshalb nur noch das 404 („war schon weg" ist das Ziel),
 * alles andere fliegt. `deleteUserCompletely` löscht den Nutzer NUR bei
 * Voll-Erfolg — dass ein Fehler hier den ganzen Lauf anhält, ist genau das
 * gewollte Verhalten: lieber ein sichtbar unfertiger Lauf, der sich
 * wiederholen lässt, als ein stiller Rest ohne Eigentümer. `removed` zählt
 * erst NACH dem erfolgreichen Löschen.
 *
 * Die Bilder-LISTE bleibt fail-soft: eine (noch) nicht angelegte Tabelle ist
 * eine Null, kein Abbruch — das ist der Idempotenz-Vertrag oben und keine
 * verschwiegene Datei.
 */
export async function purgeBrandInspiration(event: H3Event, profileId: string): Promise<number> {
  const entries = await listBrandInspiration(event, profileId).catch(() => [])
  let removed = 0
  for (const entry of entries) {
    // Kein `catch` mehr: `deleteBrandInspiration` schluckt das 404 schon
    // selbst (Zeile wie Datei), und alles andere GEHÖRT nach oben.
    await deleteBrandInspiration(event, profileId, entry.id, { strictFile: true })
    removed += 1
  }
  return removed
}
