/**
 * Registriert den GDPR-Contributor des control-Layers für Betreiber-Konten
 * beim core-Vertrag (UserDataContributor, CONCEPT A14) — läuft einmal beim
 * Serverstart, nur wo der control-Layer läuft (apps/control).
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'control',
    exportUserData: controlOperatorExportUserData,
    deleteUserData: controlOperatorDeleteUserData,
  })
})
