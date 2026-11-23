import { type Ref, watch } from 'vue'
import { brandDiscardEdit } from '../../shared/brandAutosaveDiff'
import type { BrandInvariant } from '../../shared/slotRegistry'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'
import { useBrandImpactConsent } from './useBrandImpactConsent'

/** Worauf „Verwerfen" zurückstellt (Befund 3) — die Fassung von vor dem Öffnen. */
export interface BrandEditBaseline {
  slotId: string
  value: string
  confirmed: boolean
}

export interface UseBrandSlotRevisionOptions {
  profileId: Ref<string>
  /** Welches Feld gerade im Editor steht — gehört der Seite (Bühne, Log, Karten lesen es). */
  editingSlotId: Ref<string | null>
  /** Die Grundfassung für „Verwerfen" — gehört der Seite (sie räumt sie beim Session-Wechsel). */
  editBaseline: Ref<BrandEditBaseline | null>
  autosave: { flush: () => Promise<void> }
  /** Die Beschriftung eines Felds, wie der Log sie zeigt (`useBrandFieldLabel`). */
  fieldLabel: (slotId: string) => string
}

/**
 * DIE KORREKTUR-REGEL DER WERKSTATT (BW2 Paket 6, §9) — aus der Werkstatt-Seite
 * geschnitten (WS1, Kapitel f).
 *
 * Hier wohnt, was zwischen „Korrigieren" und dem Speichern liegt: der
 * Impact-Hinweis davor (`useBrandImpactConsent`), Editor auf, Übernehmen,
 * Verwerfen, der Sprung in ein bestätigtes Feld, und die vier Auskünfte, wenn
 * der Server eine Korrektur oder Bestätigung abweist.
 *
 * KEINE NEUE ZUSTANDS-QUELLE: `editingSlotId` und `editBaseline` bleiben Refs
 * der Seite — Bühne, Log, Karten-Rechnung und der Session-Wechsel lesen bzw.
 * räumen sie dort. Der Rest steht im Store; dieser Baustein liest und schreibt
 * nur. Die Impact-Refs reicht er unverändert durch: die Vorlage der Seite
 * bindet sie an die EINE `BwImpactLayer`-Instanz.
 */
export function useBrandSlotRevision(options: UseBrandSlotRevisionOptions) {
  const { profileId, editingSlotId, editBaseline, autosave, fieldLabel } = options
  const store = useBrandWorkspaceStore()
  const { t } = useI18n()
  const toast = useToast()

  /**
   * DER IMPACT-HINWEIS VOR EINER KORREKTUR — EINE Stelle, drei Eingänge auf
   * der Seite (Log-Karte, „Bearbeiten" der Abnahme, Feld-Link eines Chips).
   *
   * Die MECHANIK wohnt seit Paket 7 in `useBrandImpactConsent` — das Dokument
   * (§10) hat denselben Hinweis, und ein zweiter `$fetch` mit demselben Modal
   * wäre zweimal dieselbe Pflege. Die KOMPONENTEN lösen weiterhin nur ihr
   * Ereignis aus (`edit()`/`jumpTo()`); die SEITE ist die Stelle, die spült,
   * navigiert und speichert.
   */
  const consent = useBrandImpactConsent(profileId)

  /**
   * „KORRIGIEREN" — die EINZIGE Tür zurück (Davids Entscheidung 2026-09-02).
   * Ein bestätigter Slot ist zu; Aufheben ist eine Änderung wie jede andere
   * (dieselbe `revision`-Rechnung, derselbe 409-Weg). Deshalb `flush()` und
   * nicht `schedule()`: erst wenn der Server es bestätigt, ist der Slot offen.
   *
   * SEIT PAKET 6 steht der Impact-Hinweis davor (§9) — und der angenommene Hash
   * reist mit dem PATCH, sonst weist die Route ihn ab.
   *
   * ── ÖFFNEN IST NOCH KEINE KORREKTUR (Testlauf-Befund F, 2026-09-09) ──────
   * Hier stand `setSlotConfirmed(slotId, false)` samt `flush()`: der Klick auf
   * „Korrigieren" hob die Bestätigung auf, bevor irgendetwas geändert war. Wer
   * hineinsah und „Korrigieren beenden" drückte, verlor sie — Zähler 4/10 → 3/10
   * für einen Blick. Jetzt öffnet dieser Aufruf nur den Editor; AUFGEHOBEN wird
   * die Bestätigung von der Eingabe selbst (`setSlotValue` im Store), und zwar im
   * selben Patch wie der neue Text.
   *
   * Der Ack wird trotzdem JETZT geholt und gemerkt: der Mensch hat die Hülle
   * gerade gesehen, und die Zustimmung gilt ihr. Bewegt sie sich, bis er wirklich
   * tippt, antwortet die Route `impact_unacknowledged` — und der Layer kommt mit
   * `brand.impact.changed` zurück (s. `store.correctionRejected`).
   *
   * `flush()` bleibt: hängt aus einem früheren Anlauf noch eine Änderung, geht sie
   * jetzt mit dem frischen Ack hinaus; ohne Änderung ist es ein No-op (§3e).
   */
  async function reviseSlot(slotId: string): Promise<void> {
    if (!await consent.request(slotId)) return
    const ack = consent.ackOf(slotId)
    if (ack) store.setImpactAck(ack)
    openEditor(slotId)
    await autosave.flush()
  }

  /**
   * DER EDITOR GEHT AUF — und merkt sich, worauf „Verwerfen" zurückstellt
   * (Befund 3, 2026-09-10). Er SCHREIBT nichts: „Öffnen ist noch keine
   * Korrektur" (Befund F) bleibt unverändert gültig.
   *
   * Ein zweites Öffnen desselben Feldes erneuert die Grundfassung NICHT — sonst
   * wäre der Bezugspunkt nach jedem Zwischenklick ein anderer, und „Verwerfen"
   * hiesse „verwirf ab hier".
   */
  function openEditor(slotId: string): void {
    if (editBaseline.value?.slotId !== slotId) {
      editBaseline.value = {
        slotId,
        value: store.slotValue(slotId),
        confirmed: store.slotConfirmed(slotId),
      }
    }
    editingSlotId.value = slotId
  }

  /** „Übernehmen" — das bisherige Verhalten: der Autosave hat es längst gespeichert. */
  function applyEdit(): void {
    editingSlotId.value = null
    editBaseline.value = null
  }

  /**
   * „VERWERFEN" — zurück auf die Fassung von vor dem Öffnen (Befund 3).
   *
   * Die Rechnung steht pur nebenan (`brandDiscardEdit`); hier wird sie
   * ausgeführt. `changed: false` heisst: nichts schreiben, nichts senden — wer
   * nur hineingesehen hat, löst keine Speicherrunde aus. Sonst gehen Text und
   * Bestätigung in EINEM Patch hinaus, wie die Route es verlangt.
   */
  async function discardEdit(slotId: string): Promise<void> {
    const baseline = editBaseline.value
    editingSlotId.value = null
    editBaseline.value = null
    if (!baseline || baseline.slotId !== slotId) return

    const restore = brandDiscardEdit(baseline, {
      value: store.slotValue(slotId),
      confirmed: store.slotConfirmed(slotId),
    })
    if (!restore.changed) return

    store.setSlotValue(slotId, restore.value)
    if (restore.confirmed) store.setSlotConfirmed(slotId, true)
    await autosave.flush()
  }

  /**
   * DER SPRUNG IN EIN BESTÄTIGTES FELD (Abnahme-Seite „Bearbeiten", Feld-Link
   * eines Befund-Chips) — mit demselben Hinweis davor.
   *
   * Er korrigiert NICHT selbst: er holt die Zustimmung und geht dann dorthin, wo
   * korrigiert wird. Zwei Gründe, und beide sind Betrieb, nicht Geschmack. Die
   * Abnahme-Seite führt ihre eigene `revision` (sie lädt sich selbst neu), ein
   * PATCH von hier liefe ihr mit der Fassung der Werkstatt in einen Konflikt.
   * Und ein Feld-Link darf über die KAPITEL-Grenze gehen — dessen Zeile liegt
   * gar nicht im Store dieser Seite. Die Zustimmung bleibt gemerkt, also fragt
   * „Korrigieren" drüben nicht ein zweites Mal.
   */
  async function correctThenGo(slotId: string, go: () => Promise<void>): Promise<void> {
    // Nur ein BESTÄTIGTES Feld wird korrigiert; alles andere ist Navigation.
    // Für ein fremdes Kapitel weiss diese Seite es nicht — dort fragt die
    // Log-Karte drüben.
    if (store.slotConfirmed(slotId) && !await consent.request(slotId)) return
    await go()
  }

  /**
   * DER SERVER HAT DIE KORREKTUR ABGEWIESEN (409 `impact_unacknowledged`) — die
   * Hülle hat sich bewegt, seit der Mensch sie gesehen hat.
   *
   * Die Zustimmung von vorhin galt einer anderen Zahl und verfällt deshalb; der
   * Layer kommt mit dem Hinweis `brand.impact.changed` zurück, und wer erneut
   * annimmt, korrigiert danach ohne einen weiteren Klick. Die neue Hülle wird
   * GEHOLT und nicht geraten (der 409 trägt sie nicht mit — nur `data.code`
   * wird zu `reason`).
   */
  watch(() => store.correctionRejected, async (slotId) => {
    if (!slotId) return
    store.dismissCorrectionRejection()
    if (await consent.reopen(slotId)) await reviseSlot(slotId)
  })

  /**
   * EINE DETERMINISTISCHE REGEL DES FELDES HAT DAS BESTÄTIGEN ABGEWIESEN
   * (§3a Nr. 6) — ein Satz, der sagt, WAS zu tun ist.
   *
   * Der Server schickt nur `invariant_violated`; welche Regel es war, hat der
   * Store mit derselben puren Funktion nachgerechnet. Der Satz nennt das Feld
   * und, wo es eine Quelle gibt, deren Beschriftung — „drei bis fünf Werte" ist
   * eine Ansage, „ungültig" wäre eine Sackgasse.
   */
  watch(() => store.invariantRejection, (rejection) => {
    if (!rejection) return
    store.dismissInvariantRejection()
    toast.add({
      color: 'warning',
      title: t('brand.invariant.title'),
      description: invariantMessage(rejection.slotId, rejection.invariant),
    })
  })

  /**
   * DER SERVER HAT EINE BESTÄTIGUNG OHNE WERT ABGEWIESEN (400 `slot_empty`,
   * Befund 9) — ein Satz statt eines stillen „Nicht gespeichert".
   *
   * Der Weg dorthin ist eng (die Bühne schaltet den Knopf ab), aber er ist da:
   * zweiter Tab, geleertes Feld, überholter Stand. Dieselbe Form wie beim
   * Invarianten-Verstoss — der Store hat die Absicht schon zurückgenommen, hier
   * steht nur noch die Auskunft.
   */
  watch(() => store.emptyConfirmRejection, (slotId) => {
    if (!slotId) return
    store.dismissEmptyConfirmRejection()
    toast.add({
      color: 'warning',
      title: t('brand.workspace.confirmEmpty'),
      description: t('brand.workspace.confirmNeedsValue'),
    })
  })

  /**
   * EIN SCHREIBVORGANG IST VERWORFEN WORDEN (Kailua-Befund 3) — der Sammel-Fall.
   *
   * Die drei benannten Ablehnungen darüber haben je einen eigenen Satz. Hier
   * steht der Rest: ein 403 auf einem inzwischen gesperrten Baustein, ein 413,
   * ein 400 mit einem Grund, den diese Oberfläche nicht kennt. Bis heute
   * verschwand er lautlos — der Store hat die Bestätigungs-Absicht schon
   * zurückgenommen, hier steht nur noch die Auskunft, WELCHES Feld es traf.
   * Der Grund selbst bleibt beim Server (createError-Regel); gesagt wird, was
   * der Mensch tun kann: es noch einmal versuchen.
   */
  watch(() => store.saveRejection, (rejection) => {
    if (!rejection) return
    store.dismissSaveRejection()
    toast.add({
      color: 'warning',
      title: t('brand.workspace.save.rejected'),
      description: rejection.slotId
        ? t('brand.workspace.save.rejectedField', { field: fieldLabel(rejection.slotId) })
        : t('brand.workspace.save.rejectedRetry'),
    })
  })

  function invariantMessage(slotId: string, invariant: BrandInvariant | null): string {
    const field = fieldLabel(slotId)
    if (!invariant) return t('brand.invariant.generic', { field })
    return t(`brand.invariant.${invariant.kind}`, {
      field,
      source: invariant.of ? fieldLabel(invariant.of) : '',
      min: invariant.min ?? 0,
      max: invariant.max ?? 0,
    })
  }

  return {
    impactOpen: consent.open,
    impactData: consent.impact,
    impactLoading: consent.loading,
    impactChanged: consent.changed,
    acceptImpact: consent.accept,
    cancelImpact: consent.cancel,
    reviseSlot,
    openEditor,
    applyEdit,
    discardEdit,
    correctThenGo,
  }
}
