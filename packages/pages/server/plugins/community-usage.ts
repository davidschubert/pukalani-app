import { PAGES_TABLE } from '../../shared/types/page'

/**
 * Verbrauchs-Posten des pages-Layers für den Reiter „Speicher"
 * (F51 Paket 2, core-Vertrag `registerCommunityUsageCounter`).
 *
 * Derselbe `kind` wie in der Quota-Bremse dieses Layers
 * (`assertPoolWriteQuota(event, { kind: 'pages', … })`,
 * server/api/pages/index.put.ts, seit BE-019). Gezählt werden ZEILEN: eine
 * Seite in zwei Sprachen sind zwei, und die Zeilen, die das Anlegen einer
 * Community sät (Startseite, Rechtstexte, Regeln), zählen mit.
 */
export default defineNitroPlugin(() => {
  registerCommunityUsageCounter({ kind: 'pages', tableId: PAGES_TABLE })
})
