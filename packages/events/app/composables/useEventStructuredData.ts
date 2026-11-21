import { eventStructuredData } from '../../shared/eventStructuredData'
import type { EventDetailResponse } from '../../shared/types/event'

/**
 * Strukturierte Daten der Termin-Seite (SU1, SEO-003). Ein Aufruf für BEIDE
 * Fassungen der Seite (events-Layer und blueprint) — sonst zeigten Pool und
 * Silo verschiedene Daten. Regeln: shared/eventStructuredData.ts.
 */
export function useEventStructuredData(source: () => EventDetailResponse | null | undefined): void {
  const primaryLocale = usePrimaryLocale()
  const pageUrl = useCommunityContentUrl(() => `/events/${source()?.$id ?? ''}`)
  useCommunityStructuredData(() => {
    const row = source()
    return row ? eventStructuredData({ ...row, pageUrl: pageUrl.value, inLanguage: primaryLocale.value }) : null
  })
}
