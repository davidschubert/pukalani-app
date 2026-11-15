/**
 * Registriert den GDPR-Contributor des runner-Layers beim core-Vertrag
 * (UserDataContributor, CONCEPT A14) — läuft einmal beim Serverstart.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'runner',
    exportUserData: runnerExportUserData,
    deleteUserData: runnerDeleteUserData,
  })
})
