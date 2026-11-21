import en from '../../i18n/locales/en.json'
import { brandingLlmsTxt, type BrandingLlmsMessages } from '../utils/brandingLlms'
import { brandingBaseUrl } from '../utils/brandingSitemap'

/** llms.txt von branding.supply — Inhalt und Regeln bei `brandingLlmsTxt()` (Q11). */
export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return brandingLlmsTxt(brandingBaseUrl(event), en as unknown as BrandingLlmsMessages)
})
