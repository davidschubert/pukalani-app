/**
 * WAS VOR DEM LÖSCHEN DES EIGENEN KONTOS GESAGT WERDEN MUSS (2026-11-23).
 *
 * Die Löschung selbst bleibt das Recht der Person (Art. 17 DSGVO) — mit EINER
 * Ausnahme: der letzte aktive Admin der Instanz (`lastAdmin`), der zuerst
 * einem anderen Konto das Admin-Recht gibt (die Route antwortet sonst 409
 * `last_admin`, `core/server/utils/lastAdmin.ts`). Alles andere sind WARNUNGEN: sie verhindern nichts, sie
 * sagen, was nach dem Löschen ohne die Person dasteht — z. B. eine Community,
 * deren einziger Inhaber sie ist.
 *
 * Der core kennt die Produkte nicht (A14): eine Warnung bringt ihren
 * i18n-Schlüssel selbst mit, angemeldet vom Layer, der sie meldet
 * (`UserDataContributor.deletionWarnings`), und die Namen, die sie betrifft.
 */
export interface AccountDeletionWarning {
  /** i18n-Schlüssel der Überschrift (Layer-Locale), Mehrzahl über `{count}`. */
  key: string
  /** i18n-Schlüssel des Satzes darunter: was die Person vorher tun kann. */
  textKey: string
  /** Was betroffen ist, in Klartext (z. B. Community-Namen) — nur eigene Daten. */
  items: string[]
}

export interface AccountDeletionCheck {
  /** Einziges aktives Konto mit dem Label `admin` ⇒ die Löschung ist gesperrt. */
  lastAdmin: boolean
  warnings: AccountDeletionWarning[]
  /** Eine Frage blieb unbeantwortet (Störung) — die Liste ist vielleicht nicht vollständig. */
  incomplete: boolean
}
