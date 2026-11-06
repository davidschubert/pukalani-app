import { MARKET_FIELDS, type MarketFieldId } from '../../../shared/marketProfile'

/**
 * PROTOTYP (M0) — DIE BESCHRIFTUNG DER EIGENEN FELDER, AUS DEM brand-KATALOG.
 *
 * Die Marktprofil-Felder zeigen auf Slot-Ids der brand-Registry (§2.2). Ihre
 * Beschriftung gehört deshalb dorthin und wird hier nur NACHGESCHLAGEN — mit
 * derselben Rangfolge, die `useBrandFieldLabel` im brand-Layer benutzt:
 * ein kurzes `brand.labels.<id>`, sonst die Frage `brand.q.<id>`.
 *
 * ── WARUM DIE SEITE DAS TUT UND NICHT DIE KOMPONENTE ─────────────────────
 * `market` kennt `brand` nicht (CONCEPT A14, s. `nuxt.config.ts` des Layers).
 * Die Auflösung ist damit der sichtbar gemachte Vertrag: die SEITE reicht
 * `fieldLabels` als Prop herein. In der Umsetzung tritt an diese Stelle der
 * echte Vertrag zur Registry — die Komponenten ändern sich dabei nicht.
 *
 * Fehlt ein Schlüssel, bleibt es beim neutralen Namen des Marktprofil-Feldes
 * (`market.field.*`): eine rohe Slot-Id in einer Tabellenzeile sähe aus wie
 * ein Ladefehler.
 */
export function useBrandFieldLabels(): ComputedRef<Partial<Record<MarketFieldId, string>>> {
  const { t, te } = useI18n()

  return computed(() => {
    const labels: Partial<Record<MarketFieldId, string>> = {}
    for (const field of MARKET_FIELDS) {
      const slotId = field.slotIds[0]
      if (!slotId) continue
      const labelKey = `brand.labels.${slotId}`
      const questionKey = `brand.q.${slotId}`
      if (te(labelKey)) labels[field.id] = t(labelKey)
      else if (te(questionKey)) labels[field.id] = t(questionKey)
    }
    return labels
  })
}

/**
 * DAS BAND DES BRAND-CHECKS ALS WORT (§7.3).
 *
 * Dieselbe Naht wie oben, eine Ebene tiefer: die sieben Bänder sind
 * `brand.check.bands.*` und gehören dem brand-Layer — `market` schreibt keinen
 * `brand.*`-Schlüssel (CONCEPT A14). Die SEITE löst auf, die Komponenten
 * bekommen eine Funktion. Fehlt der Schlüssel, steht der rohe Wert da
 * (`strong`): sichtbar falsch ist besser als still falsch.
 */
export function useBrandBandLabel(): (band: string) => string {
  const { t, te } = useI18n()
  return (band: string): string => {
    const key = `brand.check.bands.${band}`
    return te(key) ? t(key) : band
  }
}

/** Dieselbe Rangfolge für EINE Slot-Id — für den Befund-Chip. */
export function useBrandSlotLabel(): (slotId: string) => string {
  const { t, te } = useI18n()
  return (slotId: string): string => {
    const labelKey = `brand.labels.${slotId}`
    const questionKey = `brand.q.${slotId}`
    if (te(labelKey)) return t(labelKey)
    if (te(questionKey)) return t(questionKey)
    return slotId
  }
}
