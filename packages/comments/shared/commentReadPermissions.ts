import { Permission, Role } from 'node-appwrite'

/**
 * WER DARF EINEN KOMMENTAR LESEN? — der pure Kern (BE-020).
 *
 * Die Antwort hängt an der ART DES ZIELS: Kommentare an Betreiber-Zielen
 * (`pukalani.comments.operatorTargets`, z. B. `ticket`) sind interne
 * Diskussionen und tragen NUR die Leserechte für Betreiber; alle anderen
 * tragen das Publikum der Community (`withPublishedRead`, core).
 *
 * Bis zum 2026-11-17 kannte nur das Anlegen diese Unterscheidung — das
 * Wiederherstellen setzte immer das Publikums-Leserecht. Deshalb gibt es sie
 * jetzt GENAU EINMAL (Server-Hülle: `server/utils/commentReadPermissions.ts`).
 */

/** Die Leserechte eines Kommentars an einem Betreiber-Ziel. */
export const OPERATOR_COMMENT_READ: readonly string[] = [
  Permission.read(Role.label('admin')),
  Permission.read(Role.label('moderator')),
]

/** Ist dieser Ziel-Typ ein Betreiber-Ziel? */
export function isOperatorCommentTargetType(targetType: string, operatorTargets: readonly string[]): boolean {
  return operatorTargets.includes(targetType)
}

/**
 * Betreiber-Leserechte SICHERSTELLEN, ohne andere Rechte der Zeile zu
 * verlieren. Das Publikums-Leserecht nimmt der Aufrufer vorher heraus
 * (`withoutPublishedRead`) — welche Schreibweisen das sind, weiß nur core.
 */
export function withOperatorCommentRead(permissions: readonly string[]): string[] {
  const next = [...permissions]
  for (const permission of OPERATOR_COMMENT_READ) {
    if (!next.includes(permission)) next.push(permission)
  }
  return next
}
