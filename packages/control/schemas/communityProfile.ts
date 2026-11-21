import { z } from 'zod'
import { PRIMARY_LOCALES } from '../../core/shared/primaryLocale'
import { SITE_DESCRIPTION_MAX } from '../shared/onboarding'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

/**
 * NAME UND BESCHREIBUNG EINER BESTEHENDEN COMMUNITY (U5 / Dashboard-K1).
 *
 * EINE Definition für drei Stellen: das Formular im Dashboard, die
 * onboarding-Route und die Route des Control Plane. Getrennte Kopien wären
 * hier besonders teuer — die Grenzen stehen sonst an der Klinke anders als
 * an der Tür, und der Kunde bekommt ein grünes Formular und ein rotes 400.
 *
 * ── WARUM DIESELBEN GRENZEN WIE DER WIZARD ──────────────────────────────
 * `createOnboardingSiteSchema` (schemas/onboarding.ts) verlangt beim ANLEGEN
 * `min(2).max(120)`. Ein Umbenennen, das darunter darf, könnte einen Zustand
 * herstellen, den der Wizard verweigert — und zwar für dieselbe Community.
 * (Der Betreiber-Pfad `createTenantCreateSchema` steht auf `min(1)`; das ist
 * eine ANDERE Tür, sie legt Communities auch ohne Wizard an.)
 *
 * ── DIE BESCHREIBUNG IST DIESELBE WIE IM WIZARD, KEIN ZWEITES FELD ──────
 * Sie lebt in `communities.profile` (JSON, `SiteProfile.description`) und ist
 * dort als „die ANTWORT aus dem Onboarding" beschrieben. Ein zweites Feld
 * daneben hiesse: zwei Beschreibungen, von denen niemand sagen kann, welche
 * gilt. Also dieselbe Quelle — und damit auch dieselbe Obergrenze
 * (`SITE_DESCRIPTION_MAX`, hart, weil die Spalte ein 2000-Zeichen-Varchar ist).
 *
 * LEER IST ERLAUBT und heisst „keine Beschreibung": das Feld war im Wizard
 * optional, es muss auch wieder leerbar sein. Der NAME dagegen ist Pflicht —
 * eine Community ohne Namen fiele im Menükopf und im Browser-Titel auf den
 * App-Namen zurück, und das sähe aus wie ein Fehler, nicht wie eine Wahl.
 */
export function createCommunityProfileSchema(t: TranslateFn = identity) {
  return z.object({
    name: z.string().trim()
      .min(2, t('onboarding.validation.nameRequired'))
      .max(120),
    description: z.string().trim().max(SITE_DESCRIPTION_MAX).optional(),
    /**
     * Hauptsprache (Q10). OPTIONAL, und das ist Betrieb statt Geschmack:
     * platform und control sind zwei Deployments — fehlt das Feld, heißt das
     * „nicht angefasst", nie „zurück auf die Vorgabe".
     */
    locale: z.enum(PRIMARY_LOCALES).optional(),
  }).strict()
}

export const communityProfileSchema = createCommunityProfileSchema()
export type CommunityProfileInput = z.infer<typeof communityProfileSchema>

/** Was beide Routen zurückgeben — der Client übernimmt aus der ANTWORT. */
export interface CommunityProfileResult {
  communityId: string
  name: string
  description: string
  /** Die gewählte Hauptsprache; '' = keine eigene Wahl (es gilt die Vorgabe). */
  locale?: string
}
