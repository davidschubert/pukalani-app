/**
 * Gehört eine Storage-Datei diesem Konto? (BE-001)
 *
 * Der Upload-Endpunkt vergibt je Datei `update("user:<id>")` und
 * `delete("user:<id>")` (dazu `read("any")`). Ein Recht, das auf genau dieses
 * Konto zeigt — optional mit Status-Suffix wie `user:<id>/verified` — macht die
 * Datei zu „seiner". Die Id wird EXAKT verglichen: Konto `abc` passt nicht auf
 * `user:abcdef`. `any`, `users`, `label:…` und `team:…` zählen nicht.
 */
export function fileBelongsToUser(permissions: readonly string[] | undefined, userId: string): boolean {
  if (!userId || !permissions) return false
  for (const permission of permissions) {
    const match = permission.match(/^[a-z]+\("user:([^"/]+)(?:\/[^"]*)?"\)$/)
    if (match && match[1] === userId) return true
  }
  return false
}

/**
 * Die Konten, denen eine Avatar-Datei laut ihren Rechten GEHÖRT (KE3): die
 * Konto-Ids aus `update("user:<id>")` und `delete("user:<id>")` — genau die
 * zwei Rechte, die der Upload-Endpunkt seinem Besitzer gibt. Ein Lese-Recht
 * macht niemanden zum Besitzer. Ohne Doppel, in der Reihenfolge des ersten
 * Auftretens. Leer oder mehr als ein Eintrag heißt: kein eindeutiger
 * Besitzer (Altbestand, Handarbeit in der Konsole).
 */
export function avatarFileOwnerIds(permissions: readonly string[] | undefined): string[] {
  const owners: string[] = []
  for (const permission of permissions ?? []) {
    const match = permission.match(/^(?:update|delete)\("user:([^"/]+)(?:\/[^"]*)?"\)$/)
    if (match && !owners.includes(match[1]!)) owners.push(match[1]!)
  }
  return owners
}

/**
 * fileId aus einer Storage-Avatar-URL (`/api/storage/<bucket>/<id>?…`), sonst
 * null. Pur, damit auch die Regel in `avatarOrphan.ts` sie nutzt; die
 * Server-Seite reicht sie als `avatarFileId` (`server/utils/avatarFile.ts`)
 * weiter — EINE Lesart der URL für Profil, Kontolöschung und Aufräum-Lauf.
 */
export function avatarFileIdFromUrl(url: unknown, bucketId: string): string | null {
  if (typeof url !== 'string' || !bucketId) return null
  const match = url.match(/^\/api\/storage\/([^/]+)\/([^/?]+)/)
  return match && match[1] === bucketId ? match[2]! : null
}
