import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * EIN- UND AUSKLAPPEN DER ZWEI SPALTEN DER WERKSTATT — aus der Werkstatt-Seite
 * geschnitten (WS1, Kapitel g). Lokaler Zustand der Ansicht, nichts davon
 * gehört in den Store: er gilt nur für dieses Fenster und diese Breite.
 */
export function useBrandWorkshopLayout() {
  /* Runde 20/33 (David): beide Spalten sind über den Bühnen-Balken einklappbar. */
  const railCollapsed = ref(false)
  const logCollapsed = ref(false)

  /**
   * DERSELBE KNOPF, ZWEI GESTALTEN (Audit A7, Davids Entscheidung 2026-09-02).
   *
   * Ab 768 px klappt der Nav-Toggle im Bühnen-Balken die SPALTE ein — daran
   * ändert sich nichts. Darunter gab es die Spalte gar nicht (`.bw-rail
   * { display: none }`), der Knopf war ein Blindgänger und die Werkstatt ohne
   * jede Baustein-Navigation. Mobil öffnet er die Sidebar jetzt als Overlay.
   *
   * ZWEI Zustände statt eines: die Vorgaben sind entgegengesetzt (die Spalte
   * ist offen, bis man sie einklappt — das Overlay ist zu, bis man es öffnet),
   * ein gemeinsames Flag stünde beim Laden auf einer der beiden Seiten falsch.
   * Wer beim Verkleinern aus dem Overlay-Bereich herausfährt, verliert es
   * (`onNarrow`) — sonst hinge ein `role="dialog"` an einer normalen Spalte.
   */
  const navOverlayOpen = ref(false)
  const isNarrow = ref(false)
  let narrowMq: MediaQueryList | null = null
  const onNarrow = (event: MediaQueryListEvent | MediaQueryList): void => {
    isNarrow.value = event.matches
    if (!event.matches) navOverlayOpen.value = false
  }
  onMounted(() => {
    narrowMq = window.matchMedia('(max-width: 767px)')
    onNarrow(narrowMq)
    narrowMq.addEventListener('change', onNarrow)
  })
  onBeforeUnmount(() => narrowMq?.removeEventListener('change', onNarrow))

  /** Ist die Navigation gerade sichtbar? (Für Beschriftung + aria-expanded.) */
  const navVisible = computed(() => (isNarrow.value ? navOverlayOpen.value : !railCollapsed.value))

  function toggleNav(): void {
    if (isNarrow.value) navOverlayOpen.value = !navOverlayOpen.value
    else railCollapsed.value = !railCollapsed.value
  }

  return { railCollapsed, logCollapsed, navOverlayOpen, navVisible, toggleNav }
}
