import { createBrandPublicationSubmitSchema } from '../../../../../schemas/brandAccess'
import { normalizeBrandIndustry } from '../../../../../shared/brandIndustries'
import { brandPaletteId } from '../../../../../shared/brandPalette'
import {
  BRAND_PUBLICATION_NOT_READY,
  brandPublicationKeepsPublicStand,
  brandPublicationSlug,
  decideBrandPublication,
} from '../../../../../shared/brandPublication'
import type { BrandPublicationResponse } from '../../../../../shared/types/brand'
import { recordBrandEvent } from '../../../../utils/brandEvents'
import {
  BRAND_PUBLICATIONS_TABLE,
  type BrandPublicationRow,
  bookBrandPublicationQuota,
  brandPublicationStatusOf,
  findFreeBrandPublicationSlug,
  latestBrandCheckId,
  loadBrandPublication,
  readBrandPublicationFacts,
  setBrandProfilePublicationVisibility,
  toBrandPublicationState,
} from '../../../../utils/brandPublications'
import { buildBrandSnapshot } from '../../../../utils/brandSnapshot'
import {
  brandDb,
  isAppwriteNotFound,
  loadOwnedProfile,
  requireProfileIdParam,
} from '../../../../utils/brandStore'

/**
 * ZUR FREIGABE EINREICHEN (docs/plans/DISCOVER-BRANDS.md §4.3, Davids
 * Entscheidung §9.1: Freigabe VOR Veröffentlichung).
 *
 * ── ES WIRD NICHTS ÖFFENTLICH, WAS HIER PASSIERT ─────────────────────────
 * Diese Route erzeugt eine Veröffentlichung im Zustand `pending`. Sichtbar
 * wird sie erst, wenn der Betreiber sie freigibt (Paket D3). Der Name der
 * Route ist deshalb bewusst nicht „publish": sie reicht ein.
 *
 * ── DIE REIHENFOLGE IST DER SCHUTZ ───────────────────────────────────────
 *  1. Zugang + Besitz (fremdes Branding = 404, wie überall).
 *  2. Das HÄKCHEN im Rumpf — ohne Zustimmung gibt es nichts zu prüfen.
 *  3. Der TAGES-DECKEL je Konto (10, §6) — VOR jeder weiteren Abfrage. Ein
 *     Deckel, der erst nach der Arbeit greift, ist keiner.
 *  4. Die VORAUSSETZUNGEN (§3.3) — 409 mit ALLEN fehlenden Gründen.
 *  5. Der ZUSTAND (`decideBrandPublication`) — ausgeblendetes bleibt aus.
 *  6. Erst dann das Abbild bauen, die Adresse suchen und schreiben.
 *
 * ── ZWEI SNAPSHOT-SPALTEN, UND HIER WIRD NUR EINE BESCHRIEBEN ────────────
 * `pendingSnapshot` trägt IMMER den eingereichten Stand; `snapshot` ist der
 * freigegebene und wird ausschliesslich von der Freigabe gesetzt (sie kopiert
 * pending → snapshot). Wer eine bereits öffentliche Marke aktualisiert, ändert
 * damit nichts an dem, was gerade zu sehen ist — genau das verlangt §3.4 („bis
 * dahin bleibt der freigegebene alte Stand öffentlich"). Würde diese Route
 * `snapshot` überschreiben, wäre die Freigabe eine Formalität nach der
 * Veröffentlichung.
 *
 * ── DIE ADRESSE BLEIBT ───────────────────────────────────────────────────
 * Wer schon einen Slug hat, behält ihn (§4.2: „Slug … bleibt stabil"). Eine
 * neue Adresse bei jeder Titeländerung hiesse: jeder geteilte Link auf die
 * Anatomie stirbt beim nächsten Feinschliff des Markennamens. Die Umbenennung
 * mit 301 ist eine EIGENE Handlung und gehört nicht in ein „Stand
 * aktualisieren".
 *
 * ── LOG-REGEL §6 ────────────────────────────────────────────────────────
 * Slug, Zustand, Codes und Umfang — nie Inhalte.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)
  const body = await readValidatedBody(event, createBrandPublicationSubmitSchema().parse)

  const limited = await bookBrandPublicationQuota(event, userId)
  if (limited) {
    setHeader(event, 'Retry-After', limited.retryAfterSec)
    throw createError({
      status: 429,
      statusText: 'Too Many Requests',
      data: { code: limited.code },
    })
  }

  // (4) Die Voraussetzungen — dieselbe Lesung, die auch der GET benutzt
  // (`readBrandPublicationFacts`): der Dialog soll VOR dem Klick dasselbe
  // wissen, was hier durchgesetzt wird.
  const { stepRows, archetype, archetypeSecondary, readiness } = await readBrandPublicationFacts(event, profile)
  if (!readiness.allowed) {
    throw createError({
      status: 409,
      statusText: 'Publication not ready',
      data: { code: BRAND_PUBLICATION_NOT_READY, blockers: readiness.blockers },
    })
  }

  // (5) Der Zustand. `hidden` ist eine Sackgasse — der Weg zurück führt über
  // den Betreiber, nicht über die Selbstbedienung (Begründung in der Regel).
  const existing = await loadBrandPublication(event, profileId)
  const previous = brandPublicationStatusOf(existing)
  const transition = decideBrandPublication(previous, 'submit')
  if (transition.action === 'refuse') {
    throw createError({
      status: 409,
      statusText: 'Publication state does not allow this',
      data: { code: transition.code },
    })
  }

  const { payload } = buildBrandSnapshot(profile, stepRows, { betaAccount })

  const slug = existing?.slug || await findFreeBrandPublicationSlug(
    event,
    brandPublicationSlug(profile.title ?? '', profileId),
    profileId,
  )
  if (!slug) {
    throw createError({
      status: 409,
      statusText: 'No free address for this name',
      data: { code: 'slug_unavailable' },
    })
  }

  const now = new Date().toISOString()
  const keepsPublic = brandPublicationKeepsPublicStand(previous, 'submit')

  /**
   * NICHT als `Record<string, unknown>` getypt: `createRow<BrandPublicationRow>`
   * verlangt dann jede Pflichtspalte einzeln nachgewiesen — und genau das ist
   * hier die Sicherung. Ein vergessenes `slug` wäre sonst erst in Produktion
   * ein 400 von Appwrite.
   */
  const data = {
    slug,
    title: profile.title ?? '',
    pendingSnapshot: payload,
    submittedAt: now,
    updatedAt: now,
    status: transition.next,
    pathKind: profile.pathKind === 'relaunch' ? 'relaunch' : 'new',
    // Die Wahl aus dem Dialog (Katalog-Id, im Schema geprüft) schlägt den
    // Freitext der Startkarte; ohne Wahl: Freitext ⇒ Katalog-Id, sonst `unknown`
    // (§4.1). KEINE KI: die Normalisierung ist ein Nachschlagen, kein Urteil.
    industry: body.industry ?? normalizeBrandIndustry(profile.industry),
    archetype,
    archetypeSecondary,
    paletteId: brandPaletteId(profileId),
    locale: profile.contentLocale,
    checkId: await latestBrandCheckId(event, profileId, profile.websiteUrl ?? ''),
    // Die Begründung gehörte zum VORIGEN Stand. Sie neben „wartet auf Freigabe"
    // stehen zu lassen wäre eine Ablehnung, die es nicht mehr gibt. `decidedAt`
    // bleibt: es ist der Zeitpunkt der letzten Entscheidung, und den braucht
    // die Betreiber-Liste.
    decisionNote: '',
  }

  const { tablesDB, databaseId } = brandDb(event)
  let row: BrandPublicationRow
  try {
    row = await tablesDB.updateRow<BrandPublicationRow>({
      databaseId, tableId: BRAND_PUBLICATIONS_TABLE, rowId: profileId, data,
    })
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand publication could not be submitted')
    // 404 heisst hier „erste Einreichung". KEIN `upsertRow`: derselbe Grund wie
    // beim Branding-Spiegel (CLAUDE.md D6) — updateRow, bei 404 createRow.
    try {
      row = await tablesDB.createRow<BrandPublicationRow>({
        databaseId, tableId: BRAND_PUBLICATIONS_TABLE, rowId: profileId, data,
      })
    }
    catch (createFailure) {
      throw toH3Error(createFailure, 'Brand publication could not be submitted')
    }
  }

  // Das Opt-in am Profil (brand-020). Es ist NICHT dasselbe wie der Zustand der
  // Zeile: es sagt „dieser Mensch hat zugestimmt", die Zeile sagt „so weit ist
  // das Verfahren". Das Zurückziehen nimmt es wieder zurück.
  await setBrandProfilePublicationVisibility(event, profileId, 'public')

  await recordBrandEvent(event, {
    type: 'publication.submitted',
    profileId,
    userId,
    // Umfang und Zustand, nie Inhalt.
    payload: { bytes: payload.length, previous: previous ?? 'none', keepsPublic },
  })
  logEvent('info', 'brand.publication_submitted', {
    slug, status: transition.next, keepsPublic,
  })

  return { publication: toBrandPublicationState(row), readiness }
})
