import type { BrandTeamKind } from './slotRegistry'

/**
 * DIE SOLO-WEICHE FÜR GESPROCHENE TEXTE (BW1-Inhaltsrunde, 2026-09-09).
 *
 * Die Katalog-FRAGEN tragen ihre Weiche über die Registry: ein Slot mit
 * `teamVariant` bekommt von `questionKeyFor()` den Schlüssel `….solo` bzw.
 * `….team`, ein Slot ohne behält den Basis-Schlüssel. Diese Funktion ist
 * dasselbe für Texte, die zu KEINEM Slot gehören — Georges Kapitel-Einstiege
 * (`brand.kit.moves.*`) und die Phasen-Intros der Berater
 * (`brand.advisors.*.intro`). Sie sprechen die Person direkt an; anredefrei
 * umschreiben würde ihnen die Stimme nehmen, und genau dort steht die
 * Ausnahme von „neutral wo möglich" (Davids Zuschnitt, 2026-09-09).
 *
 * ── DIE WEICHE IST OPTIONAL, UND DAS IST DER PUNKT ────────────────────────
 * `hasKey` entscheidet je Schlüssel, nicht ein Flag an einer zentralen
 * Tabelle: liegt unter dem Basis-Schlüssel ein Paar `{solo, team}`, wird die
 * passende Fassung genommen, sonst bleibt es beim Basis-Schlüssel. Ein neuer
 * Kapitel-Zug funktioniert damit ohne Weiche weiter (er spricht dann eben in
 * beiden Fällen gleich), und ein bestehender bekommt sie durch das blosse
 * Anlegen der zwei Kinder im Katalog — ohne Code-Änderung.
 *
 * ── ENGLISCH TRÄGT DIE WEICHE MIT, MIT ZWEIMAL DEMSELBEN SATZ ─────────────
 * `you` ist im Englischen beide Anreden, die zwei Kinder in `en.json` sind
 * also Wort für Wort gleich. Das sieht nach Verschwendung aus und ist trotzdem
 * richtig: `i18nCatalog.test.ts` verlangt für BEIDE Sprachen denselben
 * Schlüsselvorrat („kennt beide Sprachen mit demselben Schlüsselvorrat"), und
 * dieselbe Regel gilt seit `1ba268db` schon für die Katalog-Fragen. Ein
 * einseitig deutscher Baum wäre die Ausnahme, die man beim nächsten Mal
 * übersieht — der erste Anlauf dieser Runde ist genau daran gescheitert.
 */
export function teamTextKeyFor(
  base: string,
  team: BrandTeamKind,
  hasKey: (key: string) => boolean,
): string {
  const candidate = `${base}.${team === 'team' ? 'team' : 'solo'}`
  return hasKey(candidate) ? candidate : base
}
