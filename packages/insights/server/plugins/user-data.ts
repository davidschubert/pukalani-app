import { INSIGHTS_USER_DATA_ID, insightsDeleteUserData, insightsExportUserData } from '../utils/insightsUserData'

/**
 * Registriert den GDPR-Contributor des insights-Layers beim core-Vertrag
 * (`UserDataContributor`, CONCEPT A14) — läuft einmal beim Serverstart.
 *
 * PFLICHT für jeden Layer mit User-Daten (CLAUDE.md). Die Registry ist
 * automatisch richtig besetzt: eine App ohne `insights` im `extends` lädt
 * dieses Plugin nicht, und dann gibt es auch keine insights-Daten zu
 * exportieren.
 *
 * Der Layer trägt genau EIN personenbezogenes Feld — die freiwillige
 * Kontakt-Adresse eines Korrekturvorschlags (§9.3) — plus zwei
 * Betreiber-Stempel (`reviewedBy`, `claimedBy`). Was damit im Export und in
 * der Löschung geschieht, steht im Kopf von `insightsUserData.ts`.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: INSIGHTS_USER_DATA_ID,
    exportUserData: insightsExportUserData,
    deleteUserData: insightsDeleteUserData,
  })
})
