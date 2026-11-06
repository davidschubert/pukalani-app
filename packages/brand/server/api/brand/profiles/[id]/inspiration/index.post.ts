import {
  BRAND_INSPIRATION_MAX,
  BRAND_INSPIRATION_MAX_BYTES,
  BRAND_INSPIRATION_NOTE_MAX,
  detectBrandInspirationImage,
  isBrandInspirationArea,
  nextBrandInspirationNumber,
} from '../../../../../../shared/brandInspiration'
import type { BrandInspirationWriteResponse } from '../../../../../../shared/types/brand'
import { recordBrandEvent } from '../../../../../utils/brandEvents'
import {
  createBrandInspiration,
  listBrandInspiration,
  requireBrandInspirationContext,
  syncBrandInspirationSlot,
} from '../../../../../utils/brandInspirationStore'

/**
 * EIN VORBILD HOCHLADEN (Konzept docs/archiv/BRAND-DESIGN.md §2.2 Schritt 2,
 * Paket D2a) — multipart, EIN Bild je Aufruf.
 *
 * ── EIN BILD JE AUFRUF, OBWOHL DER WÄHLER MEHRERE NIMMT ───────────────────
 * Die Werkstatt schickt bei einer Mehrfach-Auswahl mehrere Aufrufe
 * nacheinander. Der Grund ist die ABLEHNUNG: bei einem Rumpf mit fünf Bildern,
 * von denen das dritte zu gross ist, gibt es nur schlechte Antworten — alles
 * verwerfen (der Mensch verliert vier gute Bilder) oder teilweise annehmen
 * (eine 201, die in Wahrheit ein Fehler ist). Ein Bild je Aufruf hat für jedes
 * Bild eine eigene, ehrliche Antwort.
 *
 * ── PRÜFREIHENFOLGE: VON BILLIG NACH TEUER, JEDE MIT EIGENEM STATUS ───────
 *  1. Bereich gültig?      → 400 `inspiration_area_invalid` (reines Lesen)
 *  2. Notiz ≤ 240?         → 400 `inspiration_note_too_long`
 *  3. Datei vorhanden?     → 400 `inspiration_missing_file`
 *  4. ≤ 5 MB?              → 413 (VOR dem Sniffing — spart die Arbeit)
 *  5. Magic-Bytes?         → 415 (der INHALT, nicht der behauptete Typ)
 *  6. noch Platz (< 12)?   → 409 `inspiration_limit_reached`
 * Die Zählung steht ABSICHTLICH ganz unten: sie kostet eine Abfrage, und wer
 * eine 20-MB-Datei schickt, soll dafür keine Datenbank beschäftigen.
 *
 * ── DIE MARKE KOMMT NIE AUS DEM RUMPF ─────────────────────────────────────
 * `profileId` steht in der Adresse und wird über `loadOwnedProfile` belegt
 * (`requireBrandInspirationContext`). Ein durchgereichtes Feld wäre der Weg,
 * ein Bild in eine fremde Marke zu legen — dieselbe Regel wie `stripTenantKey`
 * im Pool.
 *
 * ── DAS EREIGNIS TRÄGT KENNZAHLEN, KEINEN INHALT ──────────────────────────
 * `design.inspiration.added` mit Bereich, Grösse, Format und der neuen Anzahl.
 * NIE der Dateiname, nie die Notiz: der Funnel beantwortet „laden Menschen
 * Vorbilder hoch, und wofür?", nicht „was gefällt diesem Kunden" (Regel 1 im
 * Kopf von `brandEvents.ts`).
 */
export default defineEventHandler(async (event): Promise<BrandInspirationWriteResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile, stepRows } = await requireBrandInspirationContext(event, userId, betaAccount)

  const form = await readMultipartFormData(event)
  const field = (name: string): string => {
    const part = form?.find(entry => entry.name === name && !entry.filename)
    return part ? part.data.toString('utf8').trim() : ''
  }

  // (1) Der Bereich ist PFLICHT: ein Bild, das für alles steht, wird für nichts
  // gelesen (Vokabular-Kopf, §2.2 Schritt 2).
  const area = field('area')
  if (!isBrandInspirationArea(area)) {
    throw createError({
      status: 400,
      statusText: 'Unknown inspiration area',
      data: { code: 'inspiration_area_invalid' },
    })
  }

  // (2) Die Notiz ist optional — zu lang ist sie trotzdem eine Ablehnung und
  // keine stille Kürzung: gekürzt stünde im Kapitel ein halber Satz, den
  // niemand so geschrieben hat.
  const note = field('note')
  if (note.length > BRAND_INSPIRATION_NOTE_MAX) {
    throw createError({
      status: 400,
      statusText: 'Note is too long',
      data: { code: 'inspiration_note_too_long' },
    })
  }

  // (3) Die Datei.
  const filePart = form?.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename || filePart.data.length === 0) {
    throw createError({
      status: 400,
      statusText: 'Missing file field',
      data: { code: 'inspiration_missing_file' },
    })
  }

  // (4) Grösse zuerst — bevor wir überhaupt in die Bytes schauen.
  if (filePart.data.length > BRAND_INSPIRATION_MAX_BYTES) {
    throw createError({
      status: 413,
      statusText: 'File too large',
      data: { code: 'inspiration_too_large' },
    })
  }

  // (5) Der deklarierte MIME-Typ ist Client-Eingabe — der INHALT muss ein
  // PNG, JPEG oder WebP sein (Muster des Community-Favicons, CLAUDE.md).
  const kind = detectBrandInspirationImage(filePart.data)
  if (!kind) {
    throw createError({
      status: 415,
      statusText: 'Only PNG, JPEG and WebP images are supported',
      data: { code: 'inspiration_unsupported_type' },
    })
  }

  // (6) Der Deckel. 409, nicht 400: der Rumpf ist in Ordnung, der ZUSTAND
  // erlaubt ihn nicht — dieselbe Sprache wie `slot_confirmed` im Autosave.
  const before = await listBrandInspiration(event, profile.$id)
  if (before.length >= BRAND_INSPIRATION_MAX) {
    throw createError({
      status: 409,
      statusText: 'Too many inspiration images',
      data: { code: 'inspiration_limit_reached' },
    })
  }

  const item = await createBrandInspiration(event, {
    profileId: profile.$id,
    bytes: filePart.data,
    filename: filePart.filename,
    area,
    note,
    number: nextBrandInspirationNumber(before),
  })

  const items = [...before, item].sort((a, b) => a.number - b.number)
  await syncBrandInspirationSlot(event, profile, stepRows, items)

  await recordBrandEvent(event, {
    type: 'design.inspiration.added',
    profileId: profile.$id,
    userId,
    payload: {
      area,
      bytes: filePart.data.length,
      format: kind.extension,
      hasNote: note.length > 0,
      count: items.length,
    },
  })

  setResponseStatus(event, 201)
  return { ok: true, item, items, max: BRAND_INSPIRATION_MAX }
})
