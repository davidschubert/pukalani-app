import type { Ref } from 'vue'
import { slotById } from '../../shared/slotRegistry'
import type { BrandSessionImpactResponse } from '../../shared/types/brand'

/**
 * DER IMPACT-HINWEIS VOR EINER KORREKTUR (BW2 Paket 6/7, Plan §9 Schritt 1–3)
 * — EINE Stelle, inzwischen VIER Eingänge.
 *
 * „Korrigieren" gibt es an der Log-Karte der Werkstatt, als „Bearbeiten" auf
 * der Finalen Abnahme, am Feld-Link eines Befund-Chips — und seit Paket 7 im
 * DOKUMENT (§10: „Korrektur aus dem Dokument heraus geht über §9"). Alle
 * stellen dieselbe Frage: Hülle holen, bei leerer Hülle sofort weiter, sonst
 * den Layer zeigen und auf Annehmen oder Abbrechen warten.
 *
 * Bis Paket 6 stand das inline in der Werkstatt-Seite. Mit dem Dokument gäbe es
 * das ein zweites Mal — und ein zweiter `$fetch` mit demselben Modal wäre
 * zweimal dieselbe Pflege, von der eine irgendwann höflicher oder strenger
 * wäre als die andere. Der SERVER erzwingt den Hash ohnehin (409
 * `impact_unacknowledged`); diese Rechnung entscheidet nur, ob und was ein
 * Mensch vorher zu sehen bekommt.
 *
 * ── DIE ZUSTIMMUNG GILT FÜR DIESEN BESUCH ────────────────────────────────
 * Wer auf der Abnahme-Seite „Bearbeiten" annimmt, landet in der Session und
 * korrigiert dort — der Layer darf ihn nicht ein zweites Mal fragen. Die
 * angenommene Hülle liegt deshalb je Feld hier (`acknowledged`), und der PATCH
 * trägt sie als `impactAck`. Bewegt sie sich zwischendurch, weist der Server
 * ab, und `reopen()` zeigt sie neu — mit dem Hinweis, dass sich etwas geändert
 * hat.
 *
 * ── FAIL-OPEN BEIM LADEN ─────────────────────────────────────────────────
 * Kommt die Hülle nicht (Netz, 5xx), wird korrigiert. Ein Ausfall darf einen
 * Menschen nicht von seinem eigenen Feld aussperren, und die Durchsetzung
 * hängt nicht an dieser Anzeige: der Server verlangt den Hash trotzdem, und
 * genau dann zeigt der Layer sich eben nachträglich.
 */
export interface BrandImpactConsent {
  /** Steuert `BwImpactLayer` — NIE per `v-if` unmounten (Reka-Falle). */
  open: Ref<boolean>
  impact: Ref<BrandSessionImpactResponse | null>
  loading: Ref<boolean>
  /** Die Hülle hat sich seit dem letzten Zeigen bewegt (409). */
  changed: Ref<boolean>
  /** Feld-Id → angenommener Hüllen-Hash (dieser Besuch). */
  acknowledged: Ref<Record<string, string>>
  /** Der Hash, den der PATCH als `impactAck` tragen muss — '' heisst „keiner nötig". */
  ackOf: (slotId: string) => string
  /** `true` = weitermachen (Hülle leer, schon zugestimmt oder gerade angenommen). */
  request: (slotId: string) => Promise<boolean>
  /** Nach einem 409: die NEUE Hülle zeigen und erneut fragen. */
  reopen: (slotId: string) => Promise<boolean>
  accept: () => void
  cancel: () => void
}

export function useBrandImpactConsent(profileId: Ref<string>): BrandImpactConsent {
  const open = ref(false)
  const impact = ref<BrandSessionImpactResponse | null>(null)
  const loading = ref(false)
  const changed = ref(false)
  const acknowledged = ref<Record<string, string>>({})
  /** Die offene Frage des Layers — sie wird mit Annehmen/Abbrechen beantwortet. */
  let answer: ((accepted: boolean) => void) | null = null

  async function load(slotId: string): Promise<BrandSessionImpactResponse | null> {
    // Das Feld sagt selbst, in welchem Kapitel seine Zeile liegt — ein
    // Feld-Link darf ausdrücklich über die Kapitel-Grenze zeigen (§8).
    const target = slotById(slotId)?.stepId
    if (!target) return null
    loading.value = true
    try {
      return await $fetch<BrandSessionImpactResponse>(
        `/api/brand/profiles/${profileId.value}/steps/${target}/sessions/${slotId}/impact`,
      )
    }
    catch {
      return null
    }
    finally {
      loading.value = false
    }
  }

  function ask(): Promise<boolean> {
    open.value = true
    return new Promise<boolean>((resolve) => { answer = resolve })
  }

  async function request(slotId: string): Promise<boolean> {
    if (acknowledged.value[slotId]) return true
    changed.value = false
    const loaded = await load(slotId)
    // Leere Hülle heisst: hier hängt nichts dran — es gibt nichts anzukündigen.
    if (!loaded || loaded.count === 0) return true
    impact.value = loaded
    return ask()
  }

  async function reopen(slotId: string): Promise<boolean> {
    // Die Zustimmung von vorhin galt einer anderen Zahl und verfällt deshalb.
    const { [slotId]: _stale, ...rest } = acknowledged.value
    acknowledged.value = rest
    const loaded = await load(slotId)
    if (!loaded || loaded.count === 0) return false
    impact.value = loaded
    changed.value = true
    return ask()
  }

  function accept(): void {
    const current = impact.value
    if (current) acknowledged.value = { ...acknowledged.value, [current.slotId]: current.ack }
    open.value = false
    answer?.(true)
    answer = null
  }

  function cancel(): void {
    open.value = false
    answer?.(false)
    answer = null
  }

  return {
    open,
    impact,
    loading,
    changed,
    acknowledged,
    ackOf: (slotId: string) => acknowledged.value[slotId] ?? '',
    request,
    reopen,
    accept,
    cancel,
  }
}
