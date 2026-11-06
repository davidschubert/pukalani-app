import { MARKET_USER_DATA_ID, marketDeleteUserData, marketExportUserData } from '../utils/marketUserData'

/**
 * Registriert den GDPR-Contributor des market-Layers beim core-Vertrag
 * (`UserDataContributor`, CONCEPT A14) — läuft einmal beim Serverstart.
 *
 * PFLICHT für jeden Layer mit User-Daten (CLAUDE.md). Die Registry ist
 * automatisch richtig besetzt: eine App ohne `market` im `extends` lädt dieses
 * Plugin nicht, und dann gibt es auch keine market-Daten zu exportieren.
 */
export default defineNitroPlugin(() => {
  registerUserDataContributor({
    id: MARKET_USER_DATA_ID,
    exportUserData: marketExportUserData,
    deleteUserData: marketDeleteUserData,
  })
})
