import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import type { BwRailStep } from '../components/BwProgressRail.vue'

/**
 * DER EINSTIEG IN DIE BRAND FOUNDATION IN DER WERKSTATT-LEISTE (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.6 und Entscheidung §6 d,
 * Paket G2).
 *
 * ── „BRAND FOUNDATION" STEHT NEBEN „ERGEBNIS", NICHT AN SEINER STELLE ────
 * Der letzte Kapitel-Eintrag der Leiste (`result`) war eine gesperrte Kachel,
 * die auf ein Kapitel zeigte, das niemand betreten konnte — die Ergebnis-
 * Ansicht gab es nie. Sie IST jetzt diese Seite: eigener Punkt, mit Ziel und
 * ohne Sperre. Seit Testlauf-Befund 8 (2026-09-09) ERSETZT sie das Kapitel
 * aber nicht mehr: `result` hat echte Sessions (`result.direction`, Paket G4,
 * plus die optionale Bewertung), und ein Kapitel, das Notizblock und Balken
 * mitzählen, muss in der Leiste anklickbar sein (s. `BRAND_FOUNDATION_RAIL_ENTRY`).
 *
 * ── IMMER KLICKBAR, UND DAS IST DER PUNKT ────────────────────────────────
 * Die Leseansicht zeigt auch ZWISCHENSTÄNDE (§2.6: nicht abgenommene Kapitel
 * tragen ihren Vermerk). Ein Einstieg, der erst am Ende aufginge, verschwiege
 * genau das Dokument, dessen Wachsen den Fortschritt beweist — dieselbe
 * Begründung wie beim Eintrag „Euer Branding". `BwWorkspaceSidebar` gibt einen
 * `result`-Punkt frei, sobald er ein eigenes Ziel (`to`) trägt; der Zustand
 * bleibt deshalb EHRLICH (`open`, bzw. `active` auf der Seite selbst) statt
 * ein `done` zu behaupten, das die Abnahme meint.
 *
 * ── WARUM EIN COMPOSABLE ─────────────────────────────────────────────────
 * Drei Seiten bauen dieselbe Leiste (Werkstatt, Dokument, Foundation) und
 * jede mappt `store.railSteps` selbst, weil sie über die KAPITEL
 * Verschiedenes weiss. Über DIESEN Eintrag weiss keine etwas Eigenes — genau
 * das Muster von `useBrandWorkspaceNavExtras`: drei Kopien wären drei Orte,
 * an denen der Einstieg beim nächsten Umbau nur zweimal mitwandert.
 */

/**
 * DIE ID DES LESEANSICHT-EINTRAGS — und warum sie KEIN Kapitel-Schlüssel ist
 * (Testlauf-Befund 8, 2026-09-09).
 *
 * Bis hierher trug dieser Eintrag die Id `result` und ERSETZTE damit das
 * Kapitel „Ergebnis" in der Leiste: die vier Seiten, die eine Leiste bauen,
 * filterten es heraus. `result` ist aber ein echtes Kapitel mit echten
 * Sessions — `result.direction` (Pflicht, bestätigbar) und `result.rating`
 * (optional). Der Notizblock zählte es („Ergebnis 0/1 + 1 optional"), der
 * grosse Balken rechnete es in seinen Nenner, und in der Leiste stand es
 * nirgends: wer es verlassen hatte, kam nicht mehr hin.
 *
 * Jetzt stehen BEIDE da — das Kapitel an seiner Registry-Stelle, die
 * Leseansicht als eigener Punkt hinter dem Dokument (§2.6). Dafür braucht der
 * Punkt eine eigene Id: zwei Leisten-Zeilen mit demselben `:key` wären ein
 * doppelter Schlüssel im `v-for`, und ein `select` auf `result` führte in das
 * Kapitel statt in die Ansicht (die ihr Ziel ohnehin in `to` trägt).
 */
export const BRAND_FOUNDATION_RAIL_ENTRY = 'foundation-view'

export interface BrandFoundationRailStepInput {
  profileId: MaybeRefOrGetter<string>
  /** Steht der Mensch GERADE auf der Leseansicht? */
  active?: MaybeRefOrGetter<boolean>
}

export function useBrandFoundationRailStep(
  input: BrandFoundationRailStepInput,
): ComputedRef<BwRailStep> {
  const { t } = useI18n()
  const localePath = useLocalePath()

  return computed<BwRailStep>(() => ({
    id: BRAND_FOUNDATION_RAIL_ENTRY,
    label: t('brand.nav.foundation'),
    icon: '',
    state: toValue(input.active) === true ? 'active' : 'open',
    kind: 'result',
    to: localePath(`/brand/${toValue(input.profileId)}/foundation`),
  }))
}
