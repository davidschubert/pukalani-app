/**
 * Registriert den GDPR-Contributor der Erstgespräch-Anfragen dieser Site beim
 * core-Vertrag (UserDataContributor, CONCEPT A14) — app-lokal wie die Tabelle
 * selbst (Begründung im Kopf von `scripts/ensure-intro-requests.mjs`).
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: 'portfolio-intro',
    exportUserData: introRequestsExportUserData,
    deleteUserData: introRequestsDeleteUserData,
  })
})
