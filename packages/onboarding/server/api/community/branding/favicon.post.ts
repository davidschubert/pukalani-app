import {
  MAX_FAVICON_BYTES,
  MAX_FAVICON_DIM,
  MIN_FAVICON_DIM,
  isPngMagic,
  pngDimensions,
} from '../../../../../core/shared/communityFavicon'
import type { CommunityFaviconResponse } from '../../../../shared/types/communityFavicon'

/**
 * Das eigene Favicon EINER Community hochladen (Community-Favicon-Upload, Davids
 * Zuschnitt vom 2026-08-18). Aufrufer ist die Karte „Favicon & App-Icon" im
 * Kunden-Dashboard unter /dashboard/community/branding.
 *
 * ── WARUM IM ONBOARDING-LAYER (A14) ────────────────────────────────────────
 * Dieselbe Begründung wie beim Branding-PATCH nebenan: eine Seite kann nur so
 * weit reichen wie ihre Routen, und `/api/community/*` lebt in diesem Layer.
 * Eine Silo-App ohne onboarding bekommt so keinen Menüpunkt ins Leere.
 *
 * ── AUTORISIERUNG ──────────────────────────────────────────────────────────
 * `requireCommunityPermission(event, 'branding.manage')` — dieselbe Capability
 * wie der Branding-PATCH (owner + admin). NIE `requirePermission`: die ist
 * synchron und für Betreiber-Routen.
 *
 * ── PRÜFREIHENFOLGE (von billig nach teuer, jede mit eigenem Status) ────────
 *  0. Angegebene Länge zu groß?   → 413 (vor dem Einlesen, `rejectOversizedUpload`)
 *  1. Datei vorhanden?            → 400 (kein Feld ist ein Bedienfehler)
 *  2. ≤ 1 MB?                     → 413 (vor dem Sniffing, spart Arbeit)
 *  3. PNG-Magic-Bytes?            → 415 (der Inhalt, nicht der deklarierte Typ)
 *  4. 32 ≤ Kante ≤ 512?          → 400 mit `code: 'favicon_dimensions'`
 * QUADRATISCH wird NICHT erzwungen — die Auslieferung schneidet mittig
 * (`gravity: Center`). Danach `writeCommunityFavicon`; fehlender Bucket ⇒ die
 * klare 500-Meldung „run migrations" (wie fonts/upload).
 */
export default defineEventHandler(async (event): Promise<CommunityFaviconResponse> => {
  await requireCommunityPermission(event, 'branding.manage')

  // Ohne Mandanten-Kontext gibt es keine Community, deren Favicon man setzen
  // könnte (Silo-App, Kontroll-Host, Single-Tenant). 404 wie eine fehlende
  // Route — genau wie beim Branding-PATCH.
  const tenant = useTenant(event)
  if (!tenant?.communityId) {
    throw createError({ status: 404, statusText: 'Not found' })
  }

  // Angegebene Länge vor dem Einlesen prüfen (core/server/utils/uploadSize.ts);
  // die Prüfung der echten Größe unter (2) bleibt die Wahrheit.
  rejectOversizedUpload(event, MAX_FAVICON_BYTES)

  const form = await readMultipartFormData(event)
  const filePart = form?.find(part => part.name === 'file' && part.filename)
  if (!filePart?.filename) {
    throw createError({ status: 400, statusText: 'Missing file field' })
  }

  // (2) Größe zuerst — bevor wir überhaupt in die Bytes schauen.
  if (filePart.data.length > MAX_FAVICON_BYTES) {
    throw createError({ status: 413, statusText: 'File too large' })
  }

  // (3) Der deklarierte MIME-Typ ist Client-Input — der INHALT muss ein PNG sein.
  if (!isPngMagic(filePart.data)) {
    throw createError({ status: 415, statusText: 'Only PNG files are supported' })
  }

  // (4) Kantenlänge aus dem IHDR-Kopf. `null` = kein lesbares IHDR trotz
  // Signatur ⇒ als ungültig behandeln (dieselbe Ablehnung wie ein falsches Maß).
  const dims = pngDimensions(filePart.data)
  if (
    !dims
    || dims.width < MIN_FAVICON_DIM || dims.width > MAX_FAVICON_DIM
    || dims.height < MIN_FAVICON_DIM || dims.height > MAX_FAVICON_DIM
  ) {
    throw createError({
      status: 400,
      statusText: 'Favicon must be between 32 and 512 pixels per side',
      // Fachlicher Grund fürs Envelope (core/server/error.ts hebt ihn als
      // `reason` heraus) — die Karte zeigt daraufhin den passenden Hinweis.
      data: { code: 'favicon_dimensions' },
    })
  }

  // communityId kommt aus dem SERVER-Kontext (Host-Auflösung), nie aus dem
  // Body/Formular — sonst könnte ein durchgereichter Wert ein fremdes Favicon
  // überschreiben. `writeCommunityFavicon` übersetzt einen fehlenden Bucket in
  // ein 500 mit klarer Meldung (nicht fail-soft, s. Store-Kopf).
  const { updatedAt } = await writeCommunityFavicon(event, tenant.communityId, filePart.data)
    .catch((error) => { throw toH3Error(error, 'Favicons bucket missing — run migrations') })

  setResponseStatus(event, 201)
  return { ok: true, updatedAt }
})
