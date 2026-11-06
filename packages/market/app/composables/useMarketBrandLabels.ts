import type { ComputedRef } from 'vue'
import { MARKET_FIELDS, type MarketFieldId } from '../../shared/marketProfile'

/**
 * DIE BESCHRIFTUNG DER EIGENEN FELDER, AUS DEM brand-KATALOG (MV1 M4).
 *
 * Die Marktprofil-Felder zeigen auf Slot-Ids der brand-Registry (§2.2). Ihre
 * Beschriftung gehört deshalb dorthin und wird hier nur NACHGESCHLAGEN — mit
 * derselben Rangfolge, die `useBrandFieldLabel` im brand-Layer benutzt: ein
 * kurzes `brand.labels.<id>`, sonst die Frage `brand.q.<id>`.
 *
 * ── WARUM DIE SEITE DAS TUT UND NICHT DIE KOMPONENTE ─────────────────────
 * `market` kennt `brand` nicht (CONCEPT A14). Die Auflösung ist der sichtbar
 * gemachte Vertrag: die SEITE reicht `fieldLabels` als Prop in die
 * Mk-Komponenten. Keine `Mk*`-Datei enthält deshalb einen `brand.*`-Schlüssel
 * — sie bekommen Wörter, keine Zugriffe.
 *
 * ── WARUM SIE NICHT `useBrandFieldLabels` HEISST ─────────────────────────
 * So heisst die gleichnamige Fassung im `.playground` des Layers (der
 * abgenommene Prototyp M0/M0b). Beide werden im Playground auto-importiert;
 * zwei Composables mit demselben Namen wären eine „Duplicated imports"-Meldung
 * und eine stille Schattierung. Der Prototyp bleibt unangetastet — er ist das
 * Abnahme-Dokument, DIESE Fassung ist die, die mit echten Daten läuft.
 *
 * Fehlt ein Schlüssel, bleibt es beim neutralen Namen des Marktprofil-Feldes
 * (`market.field.*`): eine rohe Slot-Id in einer Tabellenzeile sähe aus wie
 * ein Ladefehler.
 */
export function useMarketFieldLabels(): ComputedRef<Partial<Record<MarketFieldId, string>>> {
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
 * Dieselbe Naht, eine Ebene tiefer: die sieben Bänder sind
 * `brand.check.bands.*` und gehören dem brand-Layer. Fehlt der Schlüssel,
 * steht der rohe Wert da (`strong`) — sichtbar falsch ist besser als still
 * falsch.
 */
export function useMarketBandLabel(): (band: string) => string {
  const { t, te } = useI18n()
  return (band: string): string => {
    const key = `brand.check.bands.${band}`
    return te(key) ? t(key) : band
  }
}
