import { deflateSync } from 'node:zlib'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { ID, Query } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'
import { brandNeutralSource, isBrandHex } from '../../shared/brandDesign'
import { brandColorDefaults, isBrandNeutralOption } from '../../shared/brandDesignColor'
import { brandDnaValuesOf, parseBrandDnaMixSlotValue } from '../../shared/brandDesignDna'
import {
  brandMarkInitial,
  brandMarkKindDefault,
  brandMarkSpec,
  isBrandMarkKind,
  parseBrandMarkBriefSlotValue,
} from '../../shared/brandDesignMark'
import { brandSceneColors } from '../../shared/brandDesignScene'
import { BRAND_DNA_DIMENSIONS, BRAND_MARK_KINDS, brandTermById, brandTermLabel } from '../../shared/brandDesignVocab'
import {
  BRAND_MARK_DRAFTS_MAX,
  BRAND_MARK_DRAFTS_PER_RUN,
  BRAND_MARK_DRAFTS_SLOT_ID,
  type BrandMarkDraftEntry,
  type BrandMarkDraftSlotLabels,
  brandMarkDraftTitle,
  brandMarkDraftsSlotValue,
  brandMarkPromptHash,
} from '../../shared/brandMarkDrafts'
import { BRAND_MARK_STEP_KEY } from './brandMarkBrief'
import { brandDevStubEnabled } from './brandGenerators'
import { BRAND_PROVIDER_ROUTING } from './brandProviderRouting'
import {
  BRAND_STEPS_TABLE,
  type BrandProfileRow,
  type BrandSlotRecord,
  type BrandStepRow,
  brandDb,
  brandSlotStoredValue,
  isAppwriteNotFound,
  mergeStepSlotRecords,
  parseSlotRecords,
  serializeSlotRecords,
} from './brandStore'
import { BRAND_MARK_DRAFT_ANGLES, brandMarkDraftPrompt } from './markPrompt'

/**
 * DIE KI-ENTWÜRFE DES ZEICHENS — DER SPEICHER UND DER LAUF (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.5 Stufe 3 / §2.13, Paket D5c).
 *
 * ── DIE DATEI IST DIE WAHRHEIT, DIE ZEILE BESCHREIBT SIE ──────────────────
 * Zeilen-Id = Datei-Id (Migration brand-023), wörtlich wie bei den Vorbildern.
 * Löschen ist `deleteRow` + `deleteFile` auf dieselbe Id, Ausliefern ein
 * `getFileView` ohne Nachschlagen, und es gibt keinen Zustand, in dem die
 * Zeile auf ein anderes Bild zeigt als das, das sie beschreibt.
 *
 * ── DIE SCHRANKEN STEHEN IN `brandMarkBrief.ts` ───────────────────────────
 * `requireBrandMarkContext` prüft Zugang, Besitz und ob `mark` für diese Marke
 * auf dem Weg ist — dieselbe Kette wie beim Briefing, und deshalb dort und
 * nicht ein zweites Mal hier.
 *
 * ── EIN LAUF SIND VIER AUFRUFE ────────────────────────────────────────────
 * Der Chat-Completions-Weg liefert je Aufruf ein Bild (Kopf von
 * `core/server/utils/aiImage.ts`); vier Entwürfe sind vier Aufrufe mit vier
 * BLICKWINKELN, parallel gefahren. TEILERFOLG IST ERFOLG: liefern drei von
 * vier, stehen drei Karten da. Der Mensch hat einmal geklickt und bekommt,
 * was da ist — ein Lauf, der wegen eines Ausreissers alles wegwirft, kostet
 * ihn einen von drei Tagesläufen für nichts.
 *
 * ── NICHTS DAVON REIST ────────────────────────────────────────────────────
 * Der Bucket hat `permissions: []`, der Slot wird nie `confirmed`, und der
 * Slot-Wert trägt Referenzen statt Bildern (§1.11 b). Snapshot, Share,
 * Beispiel und Dokument sehen von dieser Fläche nichts.
 */

export const BRAND_MARK_DRAFTS_TABLE = 'brand_mark_drafts'
export const BRAND_MARK_DRAFTS_BUCKET = 'brand-drafts'

export type BrandMarkDraftRow = Models.Row & {
  profileId: string
  model?: string | null
  promptHash?: string | null
  kept?: boolean | null
  title?: string | null
}

/** Der EINE 503 dieser Fläche — gleiche Sprache wie die Nachbar-Routen. */
export function brandMarkDraftsUnavailable(error: unknown, data: Record<string, unknown> = {}) {
  logEvent('warn', 'brand.mark_drafts_unavailable', {
    ...data,
    message: error instanceof Error ? error.message : 'unknown',
  })
  return createError({
    status: 503,
    statusText: 'Brand mark drafts storage unavailable',
    data: { code: 'image_unavailable' },
  })
}

export function toBrandMarkDraftEntry(row: BrandMarkDraftRow): BrandMarkDraftEntry {
  return {
    id: row.$id,
    title: row.title ?? '',
    model: row.model ?? '',
    promptHash: row.promptHash ?? '',
    kept: row.kept === true,
    createdAt: row.$createdAt,
  }
}

/**
 * LÄUFT DER ERSATZ? — der Entwicklungs-Ersatz ODER die Beweis-Variable.
 *
 * Dieselbe Bauform und dieselbe Begründung wie `brandMarkBriefStubEnabled`
 * (D5a): der Beweis läuft gegen einen Dev-Server, und ein Beweis, der je Lauf
 * vier Bilder bezahlt, wird nicht gefahren. `BRAND_DEV_STUB_IMAGE` bewusst
 * OHNE `NUXT_`-Präfix — keine Runtime-Config, kein Pflichtschlüssel für
 * `ops:site-env`, sondern ein Handgriff am Beweis.
 */
export function brandMarkDraftsStubEnabled(): boolean {
  return brandDevStubEnabled() || process.env.BRAND_DEV_STUB_IMAGE === '1'
}

// ── Der Speicher ───────────────────────────────────────────────────────────

/**
 * Alle Entwürfe EINER Marke, die jüngsten zuerst.
 *
 * SORTIERT WIRD IM CODE (wenige Zeilen, kein Sortier-Index — Kopf von
 * brand-023). Eine FEHLENDE Tabelle ist eine leere Liste: das ist der Zustand
 * VOR der Migration, und ein Kapitel, das sich deswegen gar nicht mehr öffnen
 * lässt, wäre die teurere Antwort. Jeder andere Lesefehler schlägt durch.
 */
export async function listBrandMarkDrafts(
  event: H3Event,
  profileId: string,
): Promise<BrandMarkDraftEntry[]> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const res = await tablesDB.listRows<BrandMarkDraftRow>({
      databaseId,
      tableId: BRAND_MARK_DRAFTS_TABLE,
      // Der Deckel steht ÜBER `BRAND_MARK_DRAFTS_MAX`: sähe die Liste nur
      // zwölf, bliebe eine dreizehnte Zeile aus einem Altbestand unsichtbar
      // liegen und die Zählung wäre für immer falsch.
      queries: [Query.equal('profileId', profileId), Query.limit(50)],
    })
    return res.rows
      .map(toBrandMarkDraftEntry)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw brandMarkDraftsUnavailable(error, { profileId, stage: 'list' })
  }
}

/**
 * Die Entwurfs-Zeile dieser Marke — 404, wenn sie zu einer anderen gehört.
 *
 * DIE ZUGEHÖRIGKEIT WIRD BELEGT, NICHT ANGENOMMEN (Datentür-Regel aus
 * CLAUDE.md): ohne diese Prüfung wäre eine geratene Zeilen-Id der Weg zu einem
 * fremden Entwurf — die Besitzprüfung darüber gilt der MARKE, nicht der Zeile.
 */
export async function loadBrandMarkDraftRow(
  event: H3Event,
  profileId: string,
  draftId: string,
): Promise<BrandMarkDraftRow> {
  const { tablesDB, databaseId } = brandDb(event)
  let row: BrandMarkDraftRow
  try {
    row = await tablesDB.getRow<BrandMarkDraftRow>({
      databaseId, tableId: BRAND_MARK_DRAFTS_TABLE, rowId: draftId,
    })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) throw createError({ status: 404, statusText: 'Not Found' })
    throw brandMarkDraftsUnavailable(error, { profileId, draftId, stage: 'get' })
  }
  if (row.profileId !== profileId) throw createError({ status: 404, statusText: 'Not Found' })
  return row
}

/**
 * EINEN ENTWURF ABLEGEN — Datei zuerst, Zeile danach.
 *
 * DIE REIHENFOLGE IST DIE AUFRÄUM-REGEL (wörtlich wie bei den Vorbildern):
 * scheitert die Zeile, wird die Datei wieder entfernt — sonst läge eine Waise
 * im Bucket, die keine Route mehr erreicht. Umgekehrt wäre die Zeile da und
 * zeigte auf nichts, und genau das sähe der Kunde als kaputtes Bild.
 */
export async function createBrandMarkDraft(
  event: H3Event,
  input: {
    profileId: string
    bytes: Buffer
    extension: string
    title: string
    model: string
    promptHash: string
  },
): Promise<BrandMarkDraftEntry> {
  const { tablesDB, databaseId } = brandDb(event)
  const admin = createAdminClient(event)
  const fileId = ID.unique()

  try {
    await admin.storage.createFile({
      bucketId: BRAND_MARK_DRAFTS_BUCKET,
      fileId,
      file: InputFile.fromBuffer(input.bytes, `${fileId}.${input.extension}`),
    })
  }
  catch (error) {
    throw brandMarkDraftsUnavailable(error, { profileId: input.profileId, stage: 'upload' })
  }

  try {
    const row = await tablesDB.createRow<BrandMarkDraftRow>({
      databaseId,
      tableId: BRAND_MARK_DRAFTS_TABLE,
      rowId: fileId,
      data: {
        profileId: input.profileId,
        title: input.title,
        model: input.model.slice(0, 64),
        promptHash: input.promptHash.slice(0, 16),
        kept: false,
      },
    })
    return toBrandMarkDraftEntry(row)
  }
  catch (error) {
    await admin.storage
      .deleteFile({ bucketId: BRAND_MARK_DRAFTS_BUCKET, fileId })
      .catch(() => {})
    throw brandMarkDraftsUnavailable(error, { profileId: input.profileId, stage: 'row' })
  }
}

/** `kept` umschalten oder umbenennen — die zwei Handlungen des Menschen. */
export async function updateBrandMarkDraft(
  event: H3Event,
  profileId: string,
  draftId: string,
  patch: { kept?: boolean, title?: string },
): Promise<BrandMarkDraftEntry> {
  const { tablesDB, databaseId } = brandDb(event)
  const data: Record<string, unknown> = {}
  if (patch.kept !== undefined) data.kept = patch.kept
  if (patch.title !== undefined) data.title = patch.title
  try {
    const row = await tablesDB.updateRow<BrandMarkDraftRow>({
      databaseId, tableId: BRAND_MARK_DRAFTS_TABLE, rowId: draftId, data,
    })
    return toBrandMarkDraftEntry(row)
  }
  catch (error) {
    if (isAppwriteNotFound(error)) throw createError({ status: 404, statusText: 'Not Found' })
    throw brandMarkDraftsUnavailable(error, { profileId, draftId, stage: 'update' })
  }
}

/**
 * EINEN ENTWURF ENTFERNEN — Zeile zuerst, Datei danach.
 *
 * GENAU ANDERSHERUM ALS BEIM ANLEGEN, und aus demselben Grund: was am Ende
 * liegen bleiben DARF, ist der Rest, den niemand mehr sieht. 404 auf die Datei
 * ist kein Fehler — „entfernen, was nicht da ist" ist ein No-op.
 *
 * ── ZWEI HÄRTEN FÜR ZWEI AUFRUFER (`strictFile`) ──────────────────────────
 * BEIM KLICK („verwerfen") bleibt die Bucket-Löschung FAIL-SOFT: die Zeile ist
 * weg, die Karte verschwindet, und an einem zickenden Speicher soll das nicht
 * scheitern. DER GDPR-LAUF IST DER HARTE WEG (`strictFile: true`, s.
 * `purgeBrandMarkDrafts` unten) — dort ist die Datei der Gegenstand der
 * Zusage. Dieselbe Aufteilung wie bei den Vorbildern
 * (`brandInspirationStore.ts`).
 */
export async function deleteBrandMarkDraft(
  event: H3Event,
  profileId: string,
  draftId: string,
  options: { strictFile?: boolean } = {},
): Promise<void> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    await tablesDB.deleteRow({ databaseId, tableId: BRAND_MARK_DRAFTS_TABLE, rowId: draftId })
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) {
      throw brandMarkDraftsUnavailable(error, { profileId, draftId, stage: 'delete_row' })
    }
  }
  const admin = createAdminClient(event)
  await admin.storage
    .deleteFile({ bucketId: BRAND_MARK_DRAFTS_BUCKET, fileId: draftId })
    .catch((error) => {
      if (isAppwriteNotFound(error)) return
      logEvent('warn', 'brand.mark_draft_file_delete_failed', {
        profileId,
        draftId,
        message: error instanceof Error ? error.message : 'unknown',
      })
      if (options.strictFile) {
        throw brandMarkDraftsUnavailable(error, { profileId, draftId, stage: 'delete_file' })
      }
    })
}

/**
 * ALLE ENTWÜRFE EINER MARKE ENTFERNEN — für die Löschkaskade und den
 * GDPR-Lauf. Gibt zurück, wie viele Zeilen weg sind (die Zahl geht ins Log,
 * nie in eine Antwort an den Client).
 *
 * IDEMPOTENT wie die Kaskade selbst: eine fehlende Tabelle ist eine Null, kein
 * Abbruch (Vertrag des GDPR-Contributors).
 *
 * ── EIN FEHLER WIRD GEWORFEN, NICHT GEZÄHLT (Audit-Befund 2026-09-09) ─────
 * Hier stand `…catch(() => {}); removed += 1`: jeder Fehler war geschluckt und
 * wurde trotzdem als „entfernt" gezählt — eine Löschzusage, die sich selbst
 * bestätigt. Geschluckt wird nur noch das 404 (das erledigt
 * `deleteBrandMarkDraft` selbst), alles andere fliegt, und `removed` zählt
 * erst NACH dem Löschen. Dass `deleteUserCompletely` danach den Nutzer NICHT
 * löscht, ist gewollt: ein sichtbar unfertiger Lauf lässt sich wiederholen,
 * ein stiller Rest im Bucket nicht mehr finden. Wörtlich dieselbe Begründung
 * wie bei `purgeBrandInspiration`.
 */
export async function purgeBrandMarkDrafts(event: H3Event, profileId: string): Promise<number> {
  const entries = await listBrandMarkDrafts(event, profileId).catch(() => [])
  let removed = 0
  for (const entry of entries) {
    await deleteBrandMarkDraft(event, profileId, entry.id, { strictFile: true })
    removed += 1
  }
  return removed
}

// ── Der Slot-Wert ──────────────────────────────────────────────────────────

/**
 * Die Beschriftungen des Slot-Wertes in der Inhaltssprache der Marke. Kein
 * i18n: das hier läuft im Server (dasselbe Muster wie `areaLabelFor` bei den
 * Vorbildern).
 */
export function brandMarkDraftSlotLabels(locale: string): BrandMarkDraftSlotLabels {
  return locale === 'en'
    ? { kept: 'Kept', model: 'Model', prompt: 'Prompt' }
    : { kept: 'Behalten', model: 'Modell', prompt: 'Prompt' }
}

/**
 * DER SLOT-WERT VON `j.drafts` ZIEHT MIT (§2.5 Stufe 3).
 *
 * ── ER WIRD NIE `confirmed` ───────────────────────────────────────────────
 * Wörtlich dieselbe Sicherung wie bei `g.inspiration` (D2a): geschrieben
 * werden `firstDraft` und `latestDraft`, nie `confirmed`. `confirmedSlotValues`
 * ist die Grundlage von Dokument, Veröffentlichung und jedem Snapshot — was
 * dort nie auftaucht, kann auch durch ein späteres Kapitel (D8) nicht
 * versehentlich hineingeraten. Das ist Leitplanke §1.11 b: **Entwürfe reisen
 * nicht.** `sensitivity: 'internal'` ist die zweite Sicherung, nicht die
 * einzige. Und es ist ehrlich: `j.drafts` ist `type: 'special'`, es gibt in
 * der Werkstatt gar keinen Bestätigen-Knopf dafür.
 *
 * ── NO-OP SCHREIBT NICHT, UND FAIL-SOFT ───────────────────────────────────
 * Ein Sync, der nichts ändert, erhöht `revision` nicht (sonst wäre die
 * Konflikt-Erkennung eines offenen zweiten Tabs ein Zufallsgenerator).
 * Scheitert er, ist der Entwurf trotzdem da: die Wahrheit steht in der
 * Tabelle, der Slot-Wert ist die ANZEIGE davon.
 */
export async function syncBrandMarkDraftsSlot(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  entries: readonly BrandMarkDraftEntry[],
): Promise<void> {
  const stepRow = stepRows.find(row => row.stepKey === BRAND_MARK_STEP_KEY)
  if (!stepRow) {
    logEvent('warn', 'brand.mark_drafts_slot_row_missing', { profileId: profile.$id })
    return
  }

  const locale = profile.contentLocale === 'en' ? 'en' : 'de'
  const value = brandMarkDraftsSlotValue(entries, brandMarkDraftSlotLabels(locale))

  const records = parseSlotRecords(stepRow.slots)
  const before = records[BRAND_MARK_DRAFTS_SLOT_ID]
  let next: Record<string, BrandSlotRecord>

  if (!value) {
    // Kein behaltener Entwurf mehr ⇒ der Slot ist wieder WEG, nicht leer:
    // „fehlt" heisst in diesem Datensatz überall dasselbe wie „nichts drin"
    // (`toSlotFacts`). Gebaut wird die neue Ablage aus den Einträgen statt mit
    // `delete` über einen berechneten Schlüssel (das verbietet ESLint).
    if (!before) return
    next = Object.fromEntries(
      Object.entries(records).filter(([key]) => key !== BRAND_MARK_DRAFTS_SLOT_ID),
    )
  }
  else {
    if (before?.latestDraft === value) return
    next = {
      ...records,
      [BRAND_MARK_DRAFTS_SLOT_ID]: {
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
    logEvent('warn', 'brand.mark_drafts_slot_write_failed', {
      profileId: profile.$id,
      message: error instanceof Error ? error.message : 'unknown',
    })
  }
}

// ── Der Ersatz: vier ECHTE, deterministische PNGs ──────────────────────────

/**
 * EIN PNG AUS BYTES SCHREIBEN — ohne Bild-Bibliothek.
 *
 * ── WARUM ECHTE PNG-BYTES UND KEIN PLATZHALTER ────────────────────────────
 * Der Ersatz läuft im Beweis UND im eigenen Klick. Ein Platzhalter-Text käme
 * durch die Klemmung des Transports nicht durch, würde vom Bucket abgewiesen
 * (`allowedFileExtensions`) und zeigte in der Werkstatt ein kaputtes Bild —
 * geprüft wäre dann alles ausser der Sache selbst. Vier echte Dateien beweisen
 * die ganze Kette: Klemmung, Bucket, Zeile, Ausliefer-Route, Karte.
 *
 * ── ES IST DIE FARBWELT, NICHT IRGENDEIN GRAU ─────────────────────────────
 * Jedes Bild ist der Papierton der Marke mit einem Block in ihrer Tinte, je
 * Blickwinkel an einer anderen Stelle. Ein Ersatz, der eine sechste Farbe
 * einführte, wäre im Klick eine Falschaussage (dieselbe Regel wie im
 * Prototyp).
 *
 * 64 x 64 Pixel, RGB, Filter 0 je Zeile — das kleinste, was noch wie ein Bild
 * aussieht. `deflateSync` ist die zlib des Knotens; die CRC-32-Tabelle steht
 * darunter, weil PNG je Chunk eine Prüfsumme verlangt.
 */
const CRC_TABLE: number[] = (() => {
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xFFFFFFFF
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, checksum])
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map(char => char + char).join('') : value
  return [
    Number.parseInt(full.slice(0, 2), 16) || 0,
    Number.parseInt(full.slice(2, 4), 16) || 0,
    Number.parseInt(full.slice(4, 6), 16) || 0,
  ]
}

/** Ein 64x64-PNG: Papier, darauf ein Block in der Tinte an Position `index`. */
export function brandMarkDraftStubPng(paper: string, ink: string, index: number): Buffer {
  const size = 64
  const [paperR, paperG, paperB] = hexToRgb(paper)
  const [inkR, inkG, inkB] = hexToRgb(ink)
  const left = 8 + (index % 2) * 20
  const top = 8 + Math.floor(index / 2) * 20
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let cursor = 0
  for (let y = 0; y < size; y++) {
    raw[cursor++] = 0 // Filter „None" je Zeile
    for (let x = 0; x < size; x++) {
      const inside = x >= left && x < left + 28 && y >= top && y < top + 28
      raw[cursor++] = inside ? inkR : paperR
      raw[cursor++] = inside ? inkG : paperG
      raw[cursor++] = inside ? inkB : paperB
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // Bittiefe
  ihdr[9] = 2 // Farbtyp RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Der Lauf ───────────────────────────────────────────────────────────────

export type BrandMarkDraftsFailure =
  /** Kein Briefing im Kapitel — es gibt nichts, woraus zu entwerfen wäre. */
  | 'no_brief'
  /** Alle vier Aufrufe scheiterten oder lieferten kein brauchbares Bild. */
  | 'no_images'

export interface BrandMarkDraftsRunResult {
  readonly failure?: BrandMarkDraftsFailure
  readonly images?: readonly { mime: string, extension: string, bytes: Buffer }[]
  readonly promptHash?: string
  /** Modell-Kennung ohne Schlüssel — für Zeile, Antwort und Ereignis. */
  readonly model?: string
  readonly ms?: number
}

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/**
 * DIE QUELLEN DES BILD-PROMPTS — Briefing, Richtung, DNA, Farbwelt, Schrift.
 *
 * ── ZWEI SLOTS ZÄHLEN AUCH UNBESTÄTIGT ────────────────────────────────────
 * `j.brief` und `j.kind` stehen im EIGENEN Kapitel, zwei Abschnitte über dem
 * Knopf. Wer gerade das Briefing erzeugt und dann Entwürfe bestellt, bekäme
 * sonst Entwürfe zu einem älteren oder gar keinem Briefing — dieselbe
 * Begründung wie in `brandMarkBriefSources` (dort für `j.kind`, hier für
 * beide). Alles aus FREMDEN Kapiteln (Farbwelt, Schrift, DNA) zählt weiter nur
 * BESTÄTIGT: ein Entwurf, der sich auf eine unbestätigte Farbe beruft, wäre
 * beim nächsten Öffnen falsch.
 *
 * ── DIE VORBILDER STEHEN HIER NICHT ───────────────────────────────────────
 * §2.13: sie reisen nie in einen Prompt. Was das Modell von ihnen mitbekommt,
 * ist der Umweg über die DNA — geprüft, benannt und vom Menschen bestätigt.
 */
export interface BrandMarkDraftSources {
  readonly locale: string
  readonly brandName: string
  readonly initial: string
  readonly kindLabel: string
  readonly character: string
  readonly formLanguage: string
  readonly formDna: string
  readonly ink: string
  readonly paper: string
  readonly accent: string
  readonly headingFamily: string
}

function confirmedOf(
  records: Readonly<Record<string, BrandSlotRecord>>,
  slotId: string,
): string {
  const value = records[slotId]?.confirmed
  return typeof value === 'string' ? value.trim() : ''
}

export function brandMarkDraftSources(
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
): BrandMarkDraftSources | null {
  const records = mergeStepSlotRecords(stepRows)
  const locale = profile.contentLocale === 'en' ? 'en' : 'de'
  const brandName = (profile.title ?? '').trim()

  const brief = parseBrandMarkBriefSlotValue(brandSlotStoredValue(records['j.brief']))
  if (!brief) return null

  const mixEntries = parseBrandDnaMixSlotValue(confirmedOf(records, 'g.mix'))
  const dna = mixEntries ? brandDnaValuesOf(mixEntries) : undefined

  const storedKind = brandSlotStoredValue(records['j.kind'])
  const kindId = isBrandMarkKind(storedKind) ? storedKind : brandMarkKindDefault(dna)
  const kindTerm = brandTermById(BRAND_MARK_KINDS, kindId)

  const formDimension = BRAND_DNA_DIMENSIONS.find(dimension => dimension.id === 'form')
  const formValue = formDimension?.values.find(value => value.id === (dna?.form ?? ''))

  /**
   * DIESELBE RÜCKFALL-RECHNUNG WIE AUF DER BÜHNE (`useBrandMarkWorld`): fehlt
   * eine bestätigte Farbwelt, rechnet `brandColorDefaults` den Vorschlag aus
   * D3. Ein Prompt mit einer grauen Notfarbe sagte über diese Marke nichts.
   */
  const fallback = brandColorDefaults(dna, confirmedOf(records, 'result.direction'), profile.$id)
  const confirmedHex = (slotId: string, alternative: string): string => {
    const value = confirmedOf(records, slotId)
    return isBrandHex(value) ? value.toLowerCase() : alternative
  }
  const base = confirmedHex('h.base', fallback.base)
  const accent = confirmedHex('h.accent', fallback.accent)
  const neutralStored = confirmedOf(records, 'h.neutral')
  const neutral = isBrandNeutralOption(neutralStored) ? neutralStored : fallback.neutral
  const colors = brandSceneColors(base, accent, brandNeutralSource(neutral, base))

  const spec = brandMarkSpec({
    title: brandName || (locale === 'en' ? 'the brand' : 'die Marke'),
    pairId: confirmedOf(records, 'i.pair'),
    kind: kindId,
    dna,
    colors,
  })

  return {
    locale,
    brandName: spec.wordmark,
    initial: spec.initial || brandMarkInitial(brandName),
    kindLabel: kindTerm ? `${kindTerm.id} (${brandTermLabel(kindTerm, locale)})` : kindId,
    character: brief.character,
    formLanguage: brief.formLanguage,
    formDna: formValue ? brandTermLabel(formValue, locale) : '',
    ink: spec.variants[0]?.ink ?? colors.rampLight[900],
    paper: colors.paper,
    accent: colors.accent,
    headingFamily: spec.headingFamily,
  }
}

/**
 * EINEN LAUF AUSFÜHREN.
 *
 * DIE ZUGEHÖRIGKEIT IST VORHER BELEGT (`requireBrandMarkContext`); hier wird
 * nichts mehr autorisiert. Der Lauf WIRFT NICHT — jeder Ausgang ist eine Liste
 * von Bildern oder ein Grund; die Route macht daraus ihren Status (dieselbe
 * Arbeitsteilung wie bei `runBrandMarkBrief`).
 */
export async function runBrandMarkDrafts(
  event: H3Event,
  profile: BrandProfileRow,
  stepRows: readonly BrandStepRow[],
  model: string,
): Promise<BrandMarkDraftsRunResult> {
  const sources = brandMarkDraftSources(profile, stepRows)
  if (!sources) return { failure: 'no_brief' }

  const prompts = BRAND_MARK_DRAFT_ANGLES.slice(0, BRAND_MARK_DRAFTS_PER_RUN).map(angle =>
    brandMarkDraftPrompt({
      brandName: sources.brandName,
      initial: sources.initial,
      kind: sources.kindLabel,
      character: sources.character,
      formLanguage: sources.formLanguage,
      formDna: sources.formDna,
      ink: sources.ink,
      paper: sources.paper,
      accent: sources.accent,
      headingFamily: sources.headingFamily,
      angle,
    }))

  /**
   * DER HASH GILT DEM LAUF, NICHT DEM EINZELNEN AUFRUF: die vier Blickwinkel
   * sind vier Fassungen DERSELBEN Bestellung, und die Karte soll sagen können,
   * dass vier Entwürfe zusammengehören. Gehasht wird deshalb der gemeinsame
   * Kern OHNE den Blickwinkel-Satz — sonst trüge jede Karte einen anderen Wert
   * und die Auskunft „aus demselben Lauf" wäre keine.
   */
  const promptHash = brandMarkPromptHash([
    sources.brandName, sources.kindLabel, sources.character, sources.formLanguage,
    sources.formDna, sources.ink, sources.paper, sources.accent, sources.headingFamily,
  ].join(' '))

  const started = Date.now()

  if (brandMarkDraftsStubEnabled()) {
    return {
      images: prompts.map((_, index) => ({
        mime: 'image/png',
        extension: 'png',
        bytes: brandMarkDraftStubPng(sources.paper, sources.ink, index),
      })),
      promptHash,
      model: 'dev-stub',
      ms: Date.now() - started,
    }
  }

  /**
   * VIER AUFRUFE, PARALLEL — und TEILERFOLG IST ERFOLG (s. Kopf). Ein
   * gescheiterter Aufruf schreibt eine Warnung mit der MELDUNG des Anbieters,
   * nie mit dem Prompt (er trägt Foundation-Inhalte).
   */
  const results = await Promise.all(prompts.map(prompt =>
    aiImage(event, prompt, {
      model,
      label: 'brand-mark-drafts',
      // Die ZDR-Bedingungen dieses Layers, wie bei jedem anderen Aufruf. Der
      // Transport klemmt `data_collection: 'deny'` ohnehin selbst.
      providerRouting: { ...BRAND_PROVIDER_ROUTING },
    }).catch((error: unknown) => {
      logEvent('warn', 'brand.mark_drafts_provider_error', {
        profileId: profile.$id,
        message: error instanceof Error ? error.message : 'unknown',
      })
      return []
    })))

  const images: { mime: string, extension: string, bytes: Buffer }[] = []
  for (const batch of results) {
    /**
     * JE AUFRUF NUR DAS ERSTE Bild: bestellt war eines je Blickwinkel. Ein
     * Modell, das drei schickt, dürfte sonst den Zwölfer-Deckel dieser Marke
     * mit einem einzigen Lauf füllen.
     */
    const first = batch[0]
    if (!first) continue
    const extension = EXTENSION_BY_MIME[first.mime]
    if (!extension) continue
    images.push({ mime: first.mime, extension, bytes: Buffer.from(first.bytes) })
  }

  if (images.length === 0) {
    return { failure: 'no_images', promptHash, model, ms: Date.now() - started }
  }
  return { images, promptHash, model, ms: Date.now() - started }
}

/** Wie viele Entwürfe noch Platz haben — der Deckel je Marke (§2.5 Stufe 3). */
export function brandMarkDraftsFree(entries: readonly BrandMarkDraftEntry[]): number {
  return Math.max(0, BRAND_MARK_DRAFTS_MAX - entries.length)
}

/** Der Vorgabe-Name des nächsten Entwurfs dieser Marke — „Entwurf 5". */
export function brandMarkDraftTitleFor(
  entries: readonly BrandMarkDraftEntry[],
  offset: number,
  locale: string,
): string {
  return brandMarkDraftTitle(entries.length + offset + 1, locale)
}
