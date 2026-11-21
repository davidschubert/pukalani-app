import en from '../../i18n/locales/en.json'
import { marketingLlmsTxt, type MarketingLlmsMessages } from '../utils/marketingLlms'
import { marketingBaseUrl } from '../utils/marketingRoutes'

/** llms.txt von pukalani.app — Inhalt und Regeln bei `marketingLlmsTxt()` (Q11). */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return marketingLlmsTxt(marketingBaseUrl(event), en as MarketingLlmsMessages)
})
