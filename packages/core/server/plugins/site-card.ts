import { configureSiteCard } from '../utils/siteCard'

/**
 * Eintrittskarte je Seite (PK1 E1a): übernimmt `runtimeConfig.siteCard` EINMAL
 * beim Start. Ein Env-Wert wirkt damit nach einem Neustart, ohne Ausliefern.
 * Fehlt der Schlüssel zu einem Modus oder ist er ungültig, gilt `off`, und
 * `configureSiteCard` schreibt genau eine Zeile ins Log.
 */
export default defineNitroPlugin(() => {
  const config = useRuntimeConfig() as { siteCard?: unknown }
  configureSiteCard(config.siteCard)
})
