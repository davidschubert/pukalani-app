import { type BrandSlot, slotById, slotLabelKeyFor } from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'

/**
 * DIE BESCHRIFTUNG EINES FELDES — EINE REGEL, MEHRERE ORTE (BW2 Paket 5).
 *
 * Kurz-Label vor Frage (Nacht 2026-09-03, Davids „Log-Karten wie ein
 * Dokument"): `brand.labels.<id>` trägt für die Frage-Slots dokumentartige
 * Substantive; wo die Frage schon kurz ist, gibt es bewusst KEINEN
 * Label-Schlüssel und der Rückfall greift. Gefragt wird pfad- und
 * team-abhängig (Weichen W1/W3) — das Label nicht.
 *
 * WELCHER Fragetext der Rückfall nimmt, rechnet `slotLabelKeyFor` (shared):
 * dieselbe Rechnung wie auf der Bühne und im Prompt-Aufbau des Servers. Die
 * Typ-Aufzählung, die hier bis 2026-09-09 stand, war eine Kopie davon — und
 * eine Kopie, die `d.pairs` verpasste, als der Slot eine Solo-Fassung bekam.
 *
 * ── WARUM SIE HIER STEHT UND NICHT IN `shared/` ──────────────────────────
 * Sie braucht `t`/`te` und den Pfad des Brandings, ist also keine reine
 * Rechnung. Sie steht als COMPOSABLE da, weil ein Befund-Chip (§8) auf ein
 * Feld eines FREMDEN Kapitels zeigt: die Werkstatt-Seite kennt für ihr eigenes
 * Kapitel `slotLabel(slot)`, ein Chip in der Abnahme oder im Log bekommt aber
 * nur eine Slot-Id in die Hand. Ohne diesen einen Ort stünde dieselbe Regel
 * ein drittes Mal in einer Komponente — und ein zweiter Wortlaut hiesse, dass
 * der Mensch das Feld nicht wiedererkennt, das er gerade besprochen hat.
 *
 * UNBEKANNTE IDS geben die Id zurück, nie einen leeren Text: eine Zeile ohne
 * Beschriftung sähe aus wie ein Ladefehler, und die rohe Id ist wenigstens
 * eine Spur.
 */
export function useBrandFieldLabel(): (slotId: string) => string {
  const { t, te } = useI18n()
  const store = useBrandWorkspaceStore()

  function label(slot: BrandSlot): string {
    const labelKey = `brand.labels.${slot.id}`
    if (te(labelKey)) return t(labelKey)
    return t(slotLabelKeyFor(slot, store.profile?.pathKind ?? 'new', store.profile?.team ?? 'solo'))
  }

  return (slotId: string): string => {
    const slot = slotById(slotId)
    return slot ? label(slot) : slotId
  }
}
