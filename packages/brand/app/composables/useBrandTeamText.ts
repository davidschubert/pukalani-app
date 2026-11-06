import { teamTextKeyFor } from '../../shared/brandTeamText'
import type { BrandTeamKind } from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * GESPROCHENE TEXTE IN DER ANREDE DER MARKE (BW1-Inhaltsrunde, 2026-09-09).
 *
 * Der dünne Wrapper um `teamTextKeyFor` (shared): er holt die Weiche aus dem
 * Profil und reicht `te` als `hasKey` durch. Die Rechnung selbst steht in
 * `shared/`, weil sie pur und testbar sein muss und weil der Server dieselbe
 * Frage stellt — die Begründung der Weiche steht dort im Kopf.
 *
 * `store.profile?.team ?? 'solo'` ist dieselbe Zeile wie auf der Bühne
 * (`[stepKey].vue`): ein Profil ohne gesetzte Weiche gilt als „Nur ich", weil
 * das die häufigere und die schonendere Annahme ist — eine Einzelperson mit
 * „ihr" anzureden fällt sofort auf, ein Team mit „du" liest sich höchstens
 * salopp.
 *
 * NUR FÜR TEXTE, DIE JEMAND SAGT. Beschriftungen, Hinweise und Fehlermeldungen
 * sind seit dieser Runde anredefrei formuliert und brauchen den Umweg nicht —
 * wer sie hier durchschiebt, baut eine Weiche für einen Text, der gar keine
 * Anrede mehr enthält.
 */
export function useBrandTeamText() {
  const { t, te } = useI18n()
  const store = useBrandWorkspaceStore()

  const team = computed<BrandTeamKind>(() => store.profile?.team ?? 'solo')
  const keyFor = (base: string) => teamTextKeyFor(base, team.value, key => te(key))

  return {
    team,
    /** Der Text in der Anrede der Marke — Basis-Schlüssel, wenn es keine Weiche gibt. */
    teamText: (base: string) => t(keyFor(base)),
    /** Gibt es diesen Text überhaupt? (Der Hilfe-Satz eines Zuges ist optional.) */
    hasTeamText: (base: string) => te(keyFor(base)),
  }
}
