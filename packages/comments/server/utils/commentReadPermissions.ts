import type { H3Event } from 'h3'
import { isOperatorCommentTargetType, withOperatorCommentRead } from '../../shared/commentReadPermissions'

/**
 * Das Leserecht eines Kommentars aus der ART DES ZIELS (BE-020 — „interne
 * Kommentare bleiben intern"). EINE Funktion für Anlegen, Wiederherstellen
 * einzeln und Wiederherstellen in der Sammel-Aktion; Kern pur in
 * `shared/commentReadPermissions.ts`.
 *
 * Nicht hier, mit Absicht:
 *  - AUSBLENDEN (`hideCommentRow`) nimmt nur das Publikums-Leserecht weg; die
 *    Betreiber-Leserechte eines internen Kommentars bleiben stehen.
 *  - Der PUBLIKUMS-WECHSEL (core, `repermissionRow`) tauscht nur `read(any)`
 *    gegen das Mitglieder-Label und zurück — eine Zeile ohne beides fasst er
 *    nicht an, ein interner Kommentar bleibt also zu.
 *  - Der GRABSTEIN (`commentTombstonePermissions`) filtert nur die Rechte des
 *    Autors heraus.
 */

/** Die konfigurierten Betreiber-Ziele (`pukalani.comments.operatorTargets`). */
function operatorCommentTargets(): string[] {
  const appConfig = useAppConfig() as { pukalani?: { comments?: { operatorTargets?: string[] } } }
  return appConfig.pukalani?.comments?.operatorTargets ?? []
}

/** Ist dieser Ziel-Typ ein Betreiber-Ziel (interne Diskussion)? */
export function isOperatorCommentTarget(targetType: string): boolean {
  return isOperatorCommentTargetType(targetType, operatorCommentTargets())
}

/**
 * Die Leserechte, die ein Kommentar an diesem Ziel tragen soll — ausgehend
 * von den Rechten, die die Zeile schon hat (Anlegen: `[]`). Andere Rechte der
 * Zeile bleiben stehen.
 *  - Betreiber-Ziel ⇒ jedes Publikums-Leserecht raus, die zwei
 *    Betreiber-Leserechte sicher drin.
 *  - Sonst ⇒ das Publikum dieser Community (`withPublishedRead`, C18).
 */
export function commentReadPermissions(event: H3Event, targetType: string, current: readonly string[] = []): string[] {
  return isOperatorCommentTarget(targetType)
    ? withOperatorCommentRead(withoutPublishedRead(current, event))
    : withPublishedRead(current, event)
}
