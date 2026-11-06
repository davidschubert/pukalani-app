import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { resolveCommunitySeo } from '../../shared/communitySeo'

/**
 * DIE BESCHREIBUNG AUS DEM SUCHEINTRAG — für JEDE Startseite, Pool wie Silo.
 *
 * ANLASS (Nebenbefund aus NAV1, Davids Entscheidung 2026-09-09): den Sucheintrag
 * unter /dashboard/community/seo gibt es auf jeder Site, seine BESCHREIBUNG las
 * aber nur die Pool-Startseite (`apps/platform/app/pages/index.vue`). Auf
 * branding.supply und portfolio wirkte von den zwei Signalen nur `noindex` —
 * der Owner schrieb einen Text, und im Kopf seiner Startseite stand weiter der
 * fest verdrahtete i18n-Satz. Ein Feld, das man ausfüllen kann und das nichts
 * bewirkt, ist schlimmer als kein Feld: es sieht wie eine Zusage aus. Also gilt
 * die Owner-Beschreibung ab jetzt überall, mit dem bisherigen Text als
 * Rückfall.
 *
 * WARUM EIN COMPOSABLE UND NICHT DREI RECHNUNGEN: die Rechnung selbst ist eine
 * Zeile (`resolveCommunitySeo`), aber sie hat drei Leser, und drei Kopien
 * derselben Zeile sind der Anfang zweier verschiedener Antworten auf dieselbe
 * Frage — genau der Satz, mit dem die Pool-Startseite ihre Inline-Rechnung
 * schon 2026-08-13 begründet hat. Hier steht zusätzlich das Zusammenstecken
 * von State (`useCommunitySeoSettings`) und Regel an EINER Stelle; wer die
 * Beschreibung braucht, reicht nur noch seinen Rückfall herein.
 *
 * WARUM `noindex` NICHT HIER LIEGT: das ist der ZWEITE Wert derselben Zeile,
 * aber er gilt der ganzen Community und nicht dieser einen Seite. Er gehört
 * deshalb in den EINEN Kopf-Aufruf jeder App (`useLocaleSeoHead()`), neben das
 * C18-`noindex` — eine zweite Stelle, die auch robots schreibt, wäre der Anfang
 * vom Ende dieser Zusage (communitySeo.ts).
 *
 * `''` heisst „kein description-Tag" (S5: ein leeres ist schlechter als
 * keines) — die Aufrufer machen daraus `|| undefined`, wo ihr Kopf-Helfer das
 * Tag weglassen soll.
 */
export function useCommunitySeoDescription(
  fallback: MaybeRefOrGetter<string | null | undefined>,
): ComputedRef<string> {
  const settings = useCommunitySeoSettings()
  return computed<string>(() => resolveCommunitySeo(settings.value, toValue(fallback)).description)
}
