import { pageCacheI18nFromConfig, pageCacheLookup } from '../utils/pageCache'

/**
 * SEITEN KURZ FERTIG HALTEN (Q22, R3) — Treffer ausliefern. Im Core AUS;
 * eine App schaltet es an genau einer Stelle ein (`pukalani.pageCache` in
 * ihrer `app.config.ts`), heute nur Landing, Hilfe und Studio. Steht bewusst
 * HINTER allen anderen Middlewares: Host-Prüfung, Weiterleitungen und
 * Schrägstrich-Regel laufen auch für einen Treffer. Regeln:
 * `shared/pageCache.ts`, Speicher: `server/utils/pageCache.ts`.
 */
export default defineEventHandler((event) => {
  const gate = useAppConfig(event).pukalani?.pageCache
  if (!gate?.enabled) return
  const i18n = (useRuntimeConfig(event).public as unknown as { i18n?: Parameters<typeof pageCacheI18nFromConfig>[0] }).i18n
  return pageCacheLookup(event, pageCacheI18nFromConfig(i18n))
})
