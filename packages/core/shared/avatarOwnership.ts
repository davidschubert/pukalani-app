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
