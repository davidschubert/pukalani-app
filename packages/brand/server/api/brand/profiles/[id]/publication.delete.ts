import { decideBrandPublication } from '../../../../../shared/brandPublication'
import type { BrandPublicationResponse } from '../../../../../shared/types/brand'
import { recordBrandEvent } from '../../../../utils/brandEvents'
import {
  BRAND_PUBLICATIONS_TABLE,
  type BrandPublicationRow,
  brandPublicationStatusOf,
  loadBrandPublication,
  readBrandPublicationFacts,
  setBrandProfilePublicationVisibility,
  toBrandPublicationState,
} from '../../../../utils/brandPublications'
import { brandDb, loadOwnedProfile, requireProfileIdParam } from '../../../../utils/brandStore'

/**
 * ZURÜCKZIEHEN (docs/plans/DISCOVER-BRANDS.md §3.2: „Zurückziehen ⇒ Seite 404,
 * kein 410, kein Rest").
 *
 * ── DER ÖFFENTLICHE STAND WIRD GELÖSCHT, NICHT NUR UMGESCHALTET ──────────
 * `snapshot` (der freigegebene, öffentlich ausgelieferte Stand) wird geleert.
 * Ihn stehen zu lassen und nur den Zustand umzuschalten hiesse: der Text, den
 * dieser Mensch gerade aus dem Netz nehmen wollte, bleibt in einer Zeile
 * liegen, die eine falsch gesetzte Abfrage wieder ausliefert. Dieselbe
 * Entscheidung wie beim Löschen eines Brandings, wo die Share-Zeilen mitgehen,
 * statt nur widerrufen zu werden.
 *
 * Die ZEILE bleibt — mit ihrem `slug`. Zwei Gründe: die Adresse soll bei einer
 * späteren Rückkehr dieselbe sein (§4.2 „bleibt stabil"), und der Betreiber
 * soll sehen, dass es hier einmal etwas gab. Eine gelöschte Zeile gäbe die
 * Adresse für eine fremde Marke frei.
 *
 * ── DAS OPT-IN GEHT MIT ──────────────────────────────────────────────────
 * `brand_profiles.publicationVisibility` fällt zurück auf `private`. Der
 * Widerruf einer Zustimmung muss dort ankommen, wo die Zustimmung steht — sonst
 * bliebe eine Marke „freigegeben" ohne Veröffentlichung.
 *
 * ── ES IST KEINE LÖSCHUNG DES BRANDINGS ──────────────────────────────────
 * Inhalte, Kapitel und Gespräche bleiben unangetastet; das hier betrifft
 * ausschliesslich die Öffentlichkeit. Wer sein Branding ganz löschen will,
 * nimmt `DELETE …/profiles/:id` — die räumt diese Zeile mit.
 */
export default defineEventHandler(async (event): Promise<BrandPublicationResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  const existing = await loadBrandPublication(event, profileId)
  const previous = brandPublicationStatusOf(existing)
  const transition = decideBrandPublication(previous, 'withdraw')
  if (transition.action === 'refuse' || !existing) {
    // Auch „es gibt nichts zurückzuziehen" ist ein Zustandsfehler und kein 404:
    // das Branding gibt es, der Aufrufer besitzt es — verborgen bleibt hier
    // nichts mehr.
    throw createError({
      status: 409,
      statusText: 'Publication state does not allow this',
      data: { code: 'publication_state' },
    })
  }

  const now = new Date().toISOString()
  const { tablesDB, databaseId } = brandDb(event)
  let row: BrandPublicationRow
  try {
    row = await tablesDB.updateRow<BrandPublicationRow>({
      databaseId,
      tableId: BRAND_PUBLICATIONS_TABLE,
      rowId: profileId,
      data: {
        status: transition.next,
        snapshot: '',
        pendingSnapshot: '',
        updatedAt: now,
      },
    })
  }
  catch (error) {
    throw toH3Error(error, 'Brand publication could not be withdrawn')
  }

  await setBrandProfilePublicationVisibility(event, profileId, 'private')

  await recordBrandEvent(event, {
    type: 'publication.withdrawn',
    profileId,
    userId,
    payload: { previous: previous ?? 'none' },
  })
  logEvent('info', 'brand.publication_withdrawn', {
    slug: existing.slug, previous: previous ?? 'none',
  })

  // Die Bereitschaft reist mit, damit der Dialog nach dem Zurückziehen sofort
  // sagen kann, ob ein erneutes Einreichen möglich wäre — ohne zweite Rundreise.
  const { readiness } = await readBrandPublicationFacts(event, profile)
  return { publication: toBrandPublicationState(row), readiness }
})
