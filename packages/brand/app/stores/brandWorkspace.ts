import { defineStore } from 'pinia'
import { swapBrandChoiceValueLine } from '../../shared/brandChoiceOptions'
import type {
  BrandConfidence,
  BrandJourneyStep,
} from '../../shared/brandJourney'
import { canEnterBrandStep } from '../../shared/brandJourney'
import { evaluateInvariants } from '../../shared/brandSessions'
import type {
  BrandInvariant,
  BrandSlotStateFacts,
  BrandStepKey,
  BrandStepProgress,
} from '../../shared/slotRegistry'
import { isBrandDesignStep, isBrandKitStep, slotById } from '../../shared/slotRegistry'
import {
  type BrandLocalSlotEdit,
  type BrandSlotPatch,
  type BrandSyncEvent,
  type BrandSyncState,
  brandAutosaveAllowed,
  brandConflictNeedsDecision,
  brandEditReleasesConfirm,
  brandSlotDisplayValue,
  brandSlotIsConfirmed,
  diffBrandSlots,
  nextBrandSyncState,
  pruneSettledEdits,
} from '../../shared/brandAutosaveDiff'
import type {
  BrandFindingDecisionResponse,
  BrandFindingView,
  BrandMessagesResponse,
  BrandProfileDetailResponse,
  BrandProfileListResponse,
  BrandProfileSummary,
  BrandSessionAcceptResponse,
  BrandSessionCloseResponse,
  BrandSessionView,
  BrandSlotView,
  BrandStepAcceptAllResponse,
  BrandStepCompleteResponse,
  BrandStepDetailResponse,
  BrandStepSaveResponse,
} from '../../shared/types/brand'

/**
 * DER ZUSTAND DER WERKSTATT IM BROWSER — Profil, Journey, offener Baustein,
 * Slots (Server-Fassung UND lokale Eingabe getrennt), `revision` und der
 * sichtbare Speicher-Zustand.
 *
 * ── ZWEI FASSUNGEN, NIE EINE ──────────────────────────────────────────────
 * `serverSlots` ist, was der Server zuletzt bestätigt hat; `localEdits` ist,
 * was der Mensch seitdem getippt hat. Sie werden NICHT zusammengelegt, und das
 * ist der ganze 409-Vertrag: kommt ein Konflikt, bleibt die lokale Eingabe
 * unangetastet stehen, während die Serverfassung daneben gezeigt wird. Ein
 * einziges gemeinsames Feld könnte diese Frage nicht mehr beantworten.
 *
 * ── DER STORE MACHT KEINE ZEITSTEUERUNG ───────────────────────────────────
 * Entprellen, Blur, Navigation und der Wiederholungsversuch nach
 * Verbindungsverlust leben in `useBrandAutosave()`. Hier steht nur, WAS gilt —
 * dieselbe Trennung wie zwischen `brandJourney.ts` und den Routen.
 *
 * ── 404 IST EINE ANTWORT, KEIN AUSFALL ────────────────────────────────────
 * Die `/api/brand/**`-Routen antworten mit 404, wo eine andere Antwort etwas
 * verraten würde (Datentür-Muster, `requireBrandAccess`): fehlender
 * Beta-Zugang und ein fremdes Branding klingen absichtlich gleich. Der Store
 * merkt sich beides GETRENNT — `denied` für die LISTE („dieses Konto hat
 * keinen Zugang"), `profileDenied` für EIN Branding („das gibt es hier
 * nicht") — und die Seiten antworten unterschiedlich darauf: die Übersicht
 * zeigt einen Leerzustand, Werkstatt und Dokument werfen eine 404-Seite,
 * weil ihre Adresse ohne dieses Branding nichts bedeutet.
 *
 * ── DIE LESE-AKTIONEN NEHMEN IHREN `fetch` ENTGEGEN ───────────────────────
 * Beim SSR MÜSSEN die Browser-Cookies mitgehen, sonst antwortet das Gate mit
 * der Gast-Sicht (404) und die Seite hydratisiert als „kein Zugang", obwohl das
 * Konto längst eines hat — derselbe Fehler wie bei den Gast-Votes im
 * comments-Store. `useRequestFetch()` gehört aber in eine SETUP-Funktion, nicht
 * in einen Store. Also reicht die Seite ihn herein; im Browser ist die
 * Voreinstellung `$fetch` genau dasselbe.
 */

/** Was ein 409 dem Client hinterlässt, damit die UI beide Fassungen zeigen kann. */
export interface BrandWorkspaceConflict {
  revision: number
  slots: Record<string, BrandSlotView>
}

/**
 * EINE ZEILE IM GEORGE-PANEL, DIE AUS DEM STROM ENTSTEHT. `pending` heisst: es
 * kommt noch etwas nach — die Oberfläche zeigt dann einen Schreib-Zustand statt
 * einer fertigen Antwort.
 *
 * Der TEXT bleibt hier roher Text und wird von Vue escaped gerendert. Markdown
 * im Chat (Plan §3e „gerendertes Chat-Markdown wird sanitisiert") kommt mit P2
 * — der Renderer dafür steht schon im Core (`core/shared/markdown.ts` +
 * `MarkdownContent.vue`, vnode-basiert, ohne jeden `v-html`-Pfad). Bis dahin ist
 * escaped Klartext die ehrliche Zwischenstufe: sie zeigt Sternchen, aber sie
 * zeigt niemals fremdes Markup.
 */
/**
 * EIN ZUG DIESES BESUCHS — vom Berater ODER vom Menschen.
 *
 * Seit der Konversations-Runde (P3.2) ist das eine EINZIGE, geordnete Liste
 * und keine zwei mehr. Vorher hielt die Seite die eigenen Antworten in einem
 * eigenen `answers`-Array und hängte sie hinter die Berater-Züge — was
 * funktionierte, solange der Berater nicht antwortete. Sobald er es tut, ist
 * die REIHENFOLGE die halbe Aussage: Antwort, Reaktion, Antwort. Zwei Listen
 * können sie nicht tragen, ohne eine dritte Zählung zu erfinden.
 */
export interface BrandStreamMessage {
  /** Die `generationId` des Zuges (§3e) bzw. eine lokale Id für eigene Antworten. */
  id: string
  role: 'george' | 'user'
  text: string
  pending: boolean
  /**
   * ANTWORT-MÖGLICHKEITEN zu der Frage, mit der dieser Zug endet (Davids
   * Anforderung 2026-09-04) — sie kommen aus dem Abschluss-Frame, nie aus dem
   * Text. FEHLEN sie, rendert die Bühne keine Chips; das ist der Normalfall.
   */
  options?: readonly string[]
  /**
   * BIETET DIESER ZUG DIE BESTÄTIGUNG AN? (Davids Entscheidung 2026-09-09.)
   *
   * Aus dem Abschluss-Frame (`confirm`), nie aus dem Text — genau wie
   * `options`. `true` heisst: unter der Blase stehen zwei Knöpfe, „Passt so,
   * bestätigen" und „Ich ergänze noch etwas". FEHLT es, ist der Zug eine
   * gewöhnliche Nachfrage; das ist der Normalfall.
   */
  confirm?: boolean
}

const EMPTY_PROGRESS: BrandStepProgress = { requiredTotal: 0, requiredFilled: 0, pct: 0 }

/**
 * Womit gelesen wird. Beim SSR reicht die Seite `useRequestFetch()` herein
 * (Cookies!), im Browser bleibt es `$fetch` (s. Kopf).
 */
export type BrandFetcher = ReturnType<typeof useRequestFetch> | typeof $fetch

/** Die vier Formen, in denen ein HTTP-Fehler bei ofetch ankommt. */
interface FetchLikeError {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

function errorStatus(error: unknown): number | null {
  const e = error as FetchLikeError | null
  return e?.status ?? e?.statusCode ?? e?.response?.status ?? null
}

export function brandErrorReason(error: unknown): string | null {
  return (error as FetchLikeError | null)?.data?.reason ?? null
}

const setup = () => {
  const profile = ref<BrandProfileSummary | null>(null)
  const journey = ref<BrandJourneyStep[]>([])

  const stepKey = ref<BrandStepKey | null>(null)
  const serverSlots = ref<Record<string, BrandSlotView>>({})
  const localEdits = ref<Record<string, BrandLocalSlotEdit>>({})
  const revision = ref(0)
  const serverConfidence = ref<BrandConfidence | null>(null)
  const localConfidence = ref<BrandConfidence | null>(null)
  const progress = ref<BrandStepProgress>({ ...EMPTY_PROGRESS })
  const missingRequired = ref<string[]>([])
  /**
   * BESTÄTIGTE WERTE AUS FREMDEN KAPITELN, die die Bühne dieses Kapitels
   * braucht (Paket G4) — heute die zwei Archetypen für die drei
   * Richtungs-Vorschläge. Sie fallen mit dem Kapitel, wie `serverSlots`: sie
   * gehören zu DIESEM Abruf und nicht zum Branding.
   */
  const sourceValues = ref<Record<string, string>>({})

  /**
   * DER STAND JE SESSION dieses Kapitels (BW2 §5) — abgeleitet vom Server,
   * nie hier gerechnet. `slots` sagt, WAS in einem Feld steht; das hier sagt,
   * wie es um die Arbeitseinheit dahinter steht (gesperrt · offen · fertig ·
   * veraltet) und was der Mensch vorher darüber erfahren soll (Umfang,
   * „fliesst später in", vertagt).
   */
  const sessions = ref<Record<string, BrandSessionView>>({})

  /**
   * DIE OFFENEN BEFUNDE DIESES KAPITELS (BW2 Paket 4, §8) — die Daten, aus
   * denen Paket 5 seine Chips baut.
   *
   * Sie stehen NEBEN `sessions` und nicht darin, obwohl die Abnahme-Seite sie
   * je Block filtert: ein Konflikt gehört ZWEI Feldern, und in beide Karten
   * kopiert wären es zwei Zeilen über einen Zustand, den ein Klick auf einer
   * von beiden verändert. Gefiltert wird beim Rendern über `slots`.
   */
  const findings = ref<BrandFindingView[]>([])

  /**
   * WELCHE SESSION DER MENSCH GERADE OFFEN HAT (`?s=` in der Adresse).
   *
   * `active` steht bewusst NICHT in `resolveSessionStates` (dort ist es im
   * Kopf begründet): es ist ein Zustand aus Route und Verlauf, keine Rechnung
   * über gespeicherten Fakten. Die SEITE setzt ihn aus der Adresse — der Store
   * hält ihn nur, damit Verlauf, Bühne und Leiste dieselbe Antwort lesen.
   */
  const activeSessionKey = ref<string>('')

  const syncState = ref<BrandSyncState>('saved')
  const conflict = ref<BrandWorkspaceConflict | null>(null)

  /** Georges Züge dieses Bausteins, live aus dem Strom (§3e `message.delta`). */
  const streamMessages = ref<BrandStreamMessage[]>([])
  /**
   * Slot-Id → `generationId` des Entwurfs, der dort steht und dem der Mensch
   * noch NICHT zugestimmt hat (§3b.3: „bis zur Bestätigung sichtbar als
   * Entwurf"). Die Markierung fällt, sobald er tippt oder bestätigt — und zwar
   * in `setSlotValue`/`setSlotConfirmed`, also an der Stelle, die es merkt.
   * Eine Markierung, die nach dem Überschreiben stehen bliebe, behauptete
   * fremde Urheberschaft für eigenen Text.
   */
  const georgeDrafts = ref<Record<string, string>>({})

  /**
   * DER BETA-ZUGANG FEHLT — die Antwort der Datentür auf die LISTE (404).
   * Kein Fehler, ein Zustand: `/dashboard/brands` zeigt dafür einen
   * Leerzustand mit dem Weg zur Einladung, keine Fehlerseite.
   */
  const denied = ref(false)
  /**
   * DIESES EINE BRANDING GIBT ES FÜR DIESES KONTO NICHT — die Antwort der
   * Datentür auf das PROFIL (404). Sie sagt „fremd", „gelöscht", „erfunden"
   * und „kein Zugang" bewusst mit DERSELBEN Antwort; der Client kann die
   * Fälle deshalb gar nicht auseinanderhalten und soll es auch nicht.
   *
   * ── ZWEI FRAGEN, ZWEI FELDER (Paket 9, 2026-09-05) ──────────────────────
   * Bis hierher schrieben BEIDE Abrufe in `denied` — und die Werkstatt holt
   * erst das Profil und danach die Liste für den Marken-Wähler. Für einen
   * fremden Schlüssel hiess das bei einem eingeloggten Menschen: `loadProfile`
   * setzt `denied`, `loadProfiles` nimmt es eine Zeile später wieder weg (er
   * hat ja eigene Brandings) — übrig blieb eine Hülle mit HTTP 200. Paket 8
   * ist dem auf dem Dokument nur AUSGEWICHEN (die Seite liest den
   * RÜCKGABEWERT von `loadProfile`, nicht den Store). Hier ist das Rennen
   * geschlossen: die Liste spricht nur über die Liste, das Profil nur über
   * das Profil, und keiner der beiden kann die Antwort des anderen
   * zurücknehmen. Ein gemeinsames Feld könnte diese zwei Fragen nie wieder
   * auseinanderhalten.
   */
  const profileDenied = ref(false)
  /**
   * Der Baustein liegt nicht (mehr) auf dem Weg: `locked` (Vorgänger offen)
   * oder `skipped` (Weiche abgewählt). Die Route antwortet darauf mit 403 und
   * legt den Grund als `data.code` bei — anders als beim ZUGANG darf sie das,
   * denn die Existenz des Bausteins ist hier keine Auskunft.
   */
  const blocked = ref<string | null>(null)
  const loading = ref(false)

  const profiles = ref<BrandProfileSummary[]>([])

  // ── Lesen ───────────────────────────────────────────────────────────────

  /** Der Text, den der Editor für einen Slot zeigt: lokale Eingabe schlägt Server. */
  function slotValue(slotId: string): string {
    const edit = localEdits.value[slotId]
    if (edit?.value !== undefined) return edit.value
    return brandSlotDisplayValue(serverSlots.value[slotId])
  }

  function slotConfirmed(slotId: string): boolean {
    const edit = localEdits.value[slotId]
    if (edit?.confirmed !== undefined) return edit.confirmed
    return brandSlotIsConfirmed(serverSlots.value[slotId])
  }

  const pendingSlots = computed<Record<string, BrandSlotPatch>>(
    () => diffBrandSlots(serverSlots.value, localEdits.value),
  )

  const pendingConfidence = computed<BrandConfidence | undefined>(
    () => (localConfidence.value && localConfidence.value !== serverConfidence.value
      ? localConfidence.value
      : undefined),
  )

  const hasPendingWork = computed(
    () => Object.keys(pendingSlots.value).length > 0 || pendingConfidence.value !== undefined,
  )

  /**
   * DIE ANGENOMMENE HÜLLE EINER KORREKTUR (BW2 Paket 6, §9) — sie wartet hier
   * auf den nächsten Autosave.
   *
   * Der Layer fragt, der Mensch nimmt an, der PATCH trägt den Hash. Zwischen
   * diesen drei Schritten liegt der entprellte Autosave-Takt, also muss der
   * Wert irgendwo liegen — und zwar dort, wo auch die Eingabe liegt, die er
   * begleitet. Er gilt für GENAU EINE Speicherung: die Route verbraucht ihn,
   * und ein liegen gebliebener Hash würde beim nächsten Mal eine Zustimmung
   * behaupten, die niemand gegeben hat.
   */
  const pendingImpactAck = ref<string>('')

  /**
   * EINE INVARIANTE HAT DAS BESTÄTIGEN ABGEWIESEN (§3a Nr. 6) — welche, und
   * für welches Feld.
   *
   * Der Server schickt nur `invariant_violated` (der Envelope trägt
   * ausschliesslich `data.code` als `reason`). WELCHE Regel gerissen ist,
   * rechnet der Browser mit derselben puren Funktion nach — sie liegt im
   * Bündel, und alle heute registrierten Invarianten lesen Quellen aus dem
   * EIGENEN Kapitel (`c.final` zählt sich selbst, `f.decision` liest
   * `f.shortlist`, `e.anchorLine` liest `e.manifesto`). Findet die
   * Nachrechnung nichts, bleibt `invariant: null` und die Seite sagt den
   * allgemeinen Satz — lieber unscharf als falsch.
   */
  const invariantRejection = ref<{ slotId: string, invariant: BrandInvariant | null } | null>(null)

  const confidence = computed<BrandConfidence | null>(
    () => localConfidence.value ?? serverConfidence.value,
  )

  const currentJourneyStep = computed<BrandJourneyStep | null>(
    () => journey.value.find(entry => entry.stepKey === stepKey.value) ?? null,
  )

  /**
   * ZWEI WEGE, ZWEI LISTEN (Brand Design D1) — und das ist keine Klemme mehr,
   * sondern der Zuschnitt.
   *
   * `railSteps` = die BRAND FOUNDATION (`skipped` gehört nicht in die Leiste).
   * Sie ist die Menge, über die der Gesamt-Fortschritt, der Impact-Hinweis
   * („fließt in N Felder ein"), das Dokument und die Leseansicht rechnen —
   * alles Aussagen über Schicht 1. Zählte Schicht 2 dort mit, fiele der
   * Prozentwert jedes fertigen Brandings im Deploy-Moment von 100 auf rund 70
   * (dieselbe Begründung wie in `resolveProfileProgress`).
   *
   * `designSteps` = die sechs Kapitel von BRAND DESIGN. Sie stehen in der
   * Leiste als EIGENER Layer mit eigenem Fortschritt, weil sie ein eigenes,
   * extra freigeschaltetes Produkt sind (Davids Leitplanke „Produkte sind
   * eigenständig"). Sie sind IMMER da — ohne Freischaltung als gesperrte
   * Schicht mit Erklär-Text, denn auch die nicht freigeschaltete Marke soll
   * die Auskunft bekommen, was dort auf sie wartet.
   */
  const railSteps = computed<BrandJourneyStep[]>(
    () => journey.value.filter(entry =>
      entry.state !== 'skipped' && !isBrandDesignStep(entry.stepKey) && !isBrandKitStep(entry.stepKey)),
  )

  const designSteps = computed<BrandJourneyStep[]>(
    () => journey.value.filter(entry => isBrandDesignStep(entry.stepKey)),
  )

  /**
   * `kitSteps` = die drei Kapitel von BRAND BOOK & KIT (K0, Konzept §2.7).
   * Derselbe Zuschnitt wie `designSteps` und aus demselben Grund: ein eigenes,
   * extra freigeschaltetes Produkt bekommt einen eigenen Layer mit eigenem
   * Fortschritt. Sie stehen IMMER in der Liste — ohne Freischaltung als
   * gesperrte Schicht mit Erklär-Text.
   *
   * ACHTUNG, DER ZUSTAND IST EIN ANDERER ALS BEI SCHICHT 2: ein nicht
   * freigeschaltetes Kit-Kapitel ist `skipped`, kein `locked` (D0-Lehre, s.
   * `derivation_locked` in `brandJourney.ts`). Der Filter fragt deshalb NICHT
   * nach `state`, sondern nur nach der Schicht — sonst wäre die gesperrte
   * Schicht leer statt gesperrt.
   */
  const kitSteps = computed<BrandJourneyStep[]>(
    () => journey.value.filter(entry => isBrandKitStep(entry.stepKey)),
  )

  /**
   * IST BRAND DESIGN FÜR DIESE MARKE OFFEN? — gefragt wird die JOURNEY, nicht
   * `profile.designUnlockedAt`. Die Freischaltung ist nur die HÄLFTE der
   * Bedingung (§2.1: zusätzlich muss `result` abgeschlossen sein), und die
   * ganze Rechnung steht genau einmal, in der puren Regel.
   */
  const designOpen = computed(
    () => designSteps.value.some(entry => entry.reason !== 'design_locked'),
  )

  /**
   * IST BRAND BOOK & KIT FÜR DIESE MARKE OFFEN? — dieselbe Frage an dieselbe
   * Quelle (die Journey, nicht ein Profil-Feld): die pure Regel legt
   * Freischaltung und Weichen zusammen, hier steht nur ihr Ergebnis.
   */
  const kitOpen = computed(
    () => kitSteps.value.some(entry => entry.reason !== 'derivation_locked'),
  )

  function canEnter(candidate: string): boolean {
    return canEnterBrandStep(journey.value, candidate).allowed
  }

  /**
   * Nachbar-Baustein in Weg-Reihenfolge, sofern betretbar — INNERHALB DER
   * EIGENEN SCHICHT (D1). Wer in „Farbwelt" steht, geht vor nach „Typografie"
   * und zurück nach „Moodboard"; „zurück" aus dem ersten Design-Kapitel führt
   * NICHT in die Foundation. Beides sind eigene Produkte, und ein „weiter",
   * das aus dem Ergebnis der Foundation in ein anderes Produkt fällt, wäre ein
   * Übergang, den niemand angeboten hat (der Einstieg steht im Rail und in
   * Kapitel 10).
   */
  function neighbourStep(direction: -1 | 1): BrandStepKey | null {
    // DREI SCHICHTEN, DREI WEGE (K0): „weiter"/„zurück" bleiben INNERHALB der
    // eigenen Schicht — jede ist ein eigenes Produkt, und ein Übergang, den
    // niemand angeboten hat, wäre ein Sprung zwischen Produkten.
    const path = stepKey.value && isBrandKitStep(stepKey.value)
      ? kitSteps.value
      : stepKey.value && isBrandDesignStep(stepKey.value)
        ? designSteps.value
        : railSteps.value
    const index = path.findIndex(entry => entry.stepKey === stepKey.value)
    if (index < 0) return null
    const target = path[index + direction]
    if (!target) return null
    return canEnter(target.stepKey) ? target.stepKey : null
  }

  // ── Schreiben (lokal) ───────────────────────────────────────────────────

  /**
   * DIE KORREKTUR HEBT DIE BESTÄTIGUNG AUF — ABER ERST DIE ÄNDERUNG
   * (Testlauf-Befund F, 2026-09-09).
   *
   * Bis hierher nahm „Korrigieren" die Bestätigung schon beim ÖFFNEN des
   * Editors; ein Blick ins Feld kostete den Haken. Jetzt hängt sie am TEXT: die
   * pure Regel (`brandEditReleasesConfirm`) sagt, ob dieser Wert ein anderer
   * ist, und nur dann reist `confirmed: false` mit — im SELBEN Patch wie der
   * Wert, denn die Route lässt eine Wert-Änderung an einem bestätigten Slot nur
   * durch diese eine Tür.
   *
   * Und die Kehrseite: wer zurücktippt, bis wieder der bestätigte Wortlaut
   * dasteht, bekommt seinen Haken zurück — die lokale Absicht wird GELÖSCHT,
   * nicht auf `true` gesetzt. Ein `confirmed: true` wäre hier eine neue
   * Bestätigung für einen Slot, der schon eine hat.
   */
  function setSlotValue(slotId: string, value: string): void {
    const edit: BrandLocalSlotEdit = { ...localEdits.value[slotId], value }
    if (brandEditReleasesConfirm(serverSlots.value[slotId], value)) edit.confirmed = false
    else if (edit.confirmed === false) delete edit.confirmed
    localEdits.value = { ...localEdits.value, [slotId]: edit }
    // Wer tippt, ist der Urheber — die Entwurfs-Markierung fällt (s. `georgeDrafts`).
    clearGeorgeDraft(slotId)
  }

  function setSlotConfirmed(slotId: string, value: boolean): void {
    localEdits.value = { ...localEdits.value, [slotId]: { ...localEdits.value[slotId], confirmed: value } }
    if (value) clearGeorgeDraft(slotId)
  }

  /** Die angenommene Hülle für den nächsten PATCH (s. `pendingImpactAck`). */
  function setImpactAck(ack: string): void {
    pendingImpactAck.value = ack
  }

  /**
   * DIE BESTÄTIGUNG ZURÜCKNEHMEN, DIE DER SERVER ABGEWIESEN HAT (§3a Nr. 6).
   *
   * Der Text bleibt stehen, nur die ABSICHT „bestätigen" fällt: der Mensch
   * hat etwas geschrieben, das die Regel dieses Feldes verletzt — sein Text
   * ist deswegen nicht wertlos, er ist nur noch nicht bestätigungsreif. Würde
   * die Absicht stehen bleiben, schickte der nächste Autosave-Tick dieselbe
   * Bestätigung erneut und der Toast käme im Takt von 750 ms wieder.
   *
   * Die zurückgegebene Auskunft ist die Nachrechnung: WELCHE Regel es war
   * (s. `invariantRejection`).
   */
  function rejectInvariantConfirmations(): void {
    /**
     * DIESELBE RANGFOLGE WIE AUF DEM SERVER (`brandSlotStoredValue`:
     * bestätigt schlägt Entwurf) — nicht die ANZEIGE-Rangfolge daneben. Wer
     * hier `latestDraft` zuerst läse, prüfte gegen einen Text, den der Server
     * für diese Frage gar nicht ansieht, und die Nachrechnung fiele anders
     * aus als das 409, das sie erklären soll.
     */
    const storedValue = (slotId: string): string => {
      const view = serverSlots.value[slotId]
      return view?.confirmed || view?.latestDraft || view?.firstDraft || ''
    }

    const facts: Record<string, BrandSlotStateFacts> = {}
    for (const slotId of Object.keys(serverSlots.value)) {
      facts[slotId] = {
        hasValue: brandSlotDisplayValue(serverSlots.value[slotId]).length > 0,
        confirmed: brandSlotIsConfirmed(serverSlots.value[slotId]),
        value: storedValue(slotId),
      }
    }

    let rejection: { slotId: string, invariant: BrandInvariant | null } | null = null
    const edits = { ...localEdits.value }
    for (const [slotId, patch] of Object.entries(pendingSlots.value)) {
      if (patch.confirmed !== true) continue
      const edit = edits[slotId]
      if (edit) {
        const { confirmed: _dropped, ...rest } = edit
        edits[slotId] = rest
      }
      // Der ERSTE Verstoss gewinnt — wie auf dem Server: der Mensch soll eine
      // Sache reparieren, nicht eine Liste.
      if (rejection) continue
      const config = slotById(slotId)
      if (!config) continue
      const value = slotValue(slotId)
      const verdict = evaluateInvariants(config, value, {
        ...facts,
        [slotId]: { hasValue: value.length > 0, confirmed: false, value },
      })
      rejection = { slotId, invariant: verdict.ok ? null : verdict.invariant }
    }

    localEdits.value = edits
    invariantRejection.value = rejection
  }

  /** Der Toast ist gezeigt — die Auskunft hat ihren Zweck erfüllt. */
  function dismissInvariantRejection(): void {
    invariantRejection.value = null
  }

  /**
   * DER SERVER HAT DIE KORREKTUR ABGEWIESEN (§9, 409 `impact_unacknowledged`)
   * — welches Feld es war, damit die Seite den Layer erneut zeigen kann.
   *
   * Die lokale Aufhebung fällt dabei zurück: ohne sie wiederholte der nächste
   * Autosave-Tick denselben abgewiesenen Rumpf, und das Feld sähe im Browser
   * offen aus, während es auf dem Server bestätigt bleibt — genau die
   * Divergenz, gegen die die Bestätigungs-Sperre gebaut wurde.
   */
  const correctionRejected = ref<string>('')

  function rejectCorrection(): void {
    const edits = { ...localEdits.value }
    let first = ''
    for (const [slotId, patch] of Object.entries(pendingSlots.value)) {
      if (patch.confirmed !== false) continue
      if (!first) first = slotId
      const edit = edits[slotId]
      if (edit) {
        const { confirmed: _dropped, ...rest } = edit
        edits[slotId] = rest
      }
    }
    localEdits.value = edits
    correctionRejected.value = first
  }

  /** Der Layer ist wieder offen — die Meldung hat ihren Zweck erfüllt. */
  function dismissCorrectionRejection(): void {
    correctionRejected.value = ''
  }

  /**
   * DER SERVER HAT EINE BESTÄTIGUNG OHNE WERT ABGEWIESEN (400 `slot_empty`,
   * Befund 9) — welches Feld es war, damit die Seite es SAGEN kann.
   *
   * Die Bühne lässt diesen Fall gar nicht erst zu (`confirmEnabled`), aber ein
   * abgewiesener Rumpf, der stehen bleibt, wäre hier besonders teuer: `400` ist
   * ein endgültiges Nein zur GLEICHEN Eingabe, der Autosave wiederholt ihn
   * bewusst nicht — die Werkstatt stünde also auf „Nicht gespeichert", ohne dass
   * jemand erführe, woran es liegt. Deshalb fällt die ABSICHT „bestätigen"
   * (dieselbe Bewegung wie bei `invariant_violated`), der Text bleibt stehen.
   */
  const emptyConfirmRejection = ref<string>('')

  function rejectEmptyConfirmations(): void {
    const edits = { ...localEdits.value }
    let first = ''
    for (const [slotId, patch] of Object.entries(pendingSlots.value)) {
      if (patch.confirmed !== true) continue
      // Nur die WIRKLICH leeren: in einem Rumpf mit mehreren Feldern hat der
      // Server beim ersten leeren abgebrochen, die anderen sind unschuldig und
      // dürfen ihre Bestätigung im nächsten Versuch behalten.
      if (slotValue(slotId).trim().length > 0) continue
      if (!first) first = slotId
      const edit = edits[slotId]
      if (edit) {
        const { confirmed: _dropped, ...rest } = edit
        edits[slotId] = rest
      }
    }
    localEdits.value = edits
    emptyConfirmRejection.value = first
  }

  /** Der Toast steht — die Auskunft hat ihren Zweck erfüllt. */
  function dismissEmptyConfirmRejection(): void {
    emptyConfirmRejection.value = ''
  }

  /**
   * DER SCHREIBVORGANG IST ENDGÜLTIG VERWORFEN (Kailua-Befund 3) — mit Grund,
   * damit die Seite ihn SAGEN kann.
   *
   * ── WARUM ES DIESEN VIERTEN AUSGANG BRAUCHT ─────────────────────────────
   * Für die drei benannten Ablehnungen (`invariant_violated`, `slot_empty`,
   * `impact_unacknowledged`) gibt es je einen Zweig, der die ABSICHT
   * zurücknimmt und die Auskunft weiterreicht. Alles andere fiel bis hierher
   * in den Sammel-Ausgang `mark('error')`: die Bestätigungs-Absicht blieb im
   * Store stehen, der Zähler zeigte sie weiter als „bestätigt", und niemand
   * erfuhr etwas. Im Kailua-Lauf stand deshalb 10/10 auf dem Schirm und 1/10
   * in der Datenbank.
   *
   * ── ER GILT NUR FÜR DAS, WAS NICHT WIEDERKOMMT ──────────────────────────
   * Der Autosave ruft ihn ausschliesslich dort, wo er NICHT wiederholt (4xx
   * ausser 429, und ein 5xx erst nach dem letzten Versuch). Ein Netzfehler
   * oder ein 502 mitten im Deploy bleibt `offline`/`error` mit Wiederholung —
   * dort ist die Eingabe nicht verworfen, sie ist unterwegs.
   *
   * Die Bewegung ist dieselbe wie bei `rejectEmptyConfirmations`: der TEXT
   * bleibt stehen (er ist nicht wertlos, er ist nur nicht angekommen), die
   * Bestätigungs-ABSICHT fällt — sonst behauptete der nächste Tick sie erneut,
   * und der Zähler bliebe für immer optimistisch.
   */
  const saveRejection = ref<{ slotId: string, code: string } | null>(null)

  function rejectSave(code: string): void {
    const edits = { ...localEdits.value }
    let first = ''
    for (const [slotId, patch] of Object.entries(pendingSlots.value)) {
      if (patch.confirmed === undefined) continue
      if (!first) first = slotId
      const edit = edits[slotId]
      if (edit) {
        const { confirmed: _dropped, ...rest } = edit
        edits[slotId] = rest
      }
    }
    localEdits.value = edits
    saveRejection.value = { slotId: first, code }
  }

  /** Der Toast steht — die Auskunft hat ihren Zweck erfüllt. */
  function dismissSaveRejection(): void {
    saveRejection.value = null
  }

  function clearGeorgeDraft(slotId: string): void {
    if (!(slotId in georgeDrafts.value)) return
    const { [slotId]: _removed, ...rest } = georgeDrafts.value
    georgeDrafts.value = rest
  }

  /**
   * Georges Entwurf landet im Editor — als LOKALE Eingabe, nicht als
   * Serverfassung. Das ist Absicht: gespeichert wird er über den normalen
   * Autosave, mit derselben `revision`-Rechnung wie jede Eingabe des Menschen.
   * Die Route hat ihn zwar schon geschrieben (Persistenz vor `completed`,
   * Plan §6) und schickt die neue `revision` mit — `applyGenerationRevision()`
   * übernimmt sie, damit der nächste Autosave keinen 409 kassiert.
   */
  function applyGeorgeDraft(slotId: string, value: string, generationId: string): void {
    setSlotValue(slotId, value)
    georgeDrafts.value = { ...georgeDrafts.value, [slotId]: generationId }
  }

  function slotIsGeorgeDraft(slotId: string): boolean {
    return slotId in georgeDrafts.value
  }

  /** Die neue Fassung aus `generation.completed` — s. `applyGeorgeDraft`. */
  function applyGenerationRevision(value: number): void {
    if (value > revision.value) revision.value = value
  }

  // ── Die Züge dieses Besuchs ─────────────────────────────────────────────

  /**
   * DIE EIGENE ANTWORT, SICHTBAR (Audit-Befund B5a) — an ihrem Platz in der
   * Reihenfolge, nicht in einer zweiten Liste.
   *
   * Sie wird hier SOFORT gezeigt und erst danach vom Server als
   * `brand_messages`-Zeile geschrieben (die Konversations-Route tut das). Eine
   * Antwort, die erst nach dem Roundtrip erschiene, machte aus dem Tippen eine
   * Wartezeit — und wenn der Zug ausbleibt (KI aus), ist die Zeile trotzdem
   * richtig: gesagt wurde es.
   */
  function addUserMessage(id: string, text: string): void {
    streamMessages.value = [...streamMessages.value, { id, role: 'user', text, pending: false }]
  }

  function beginGeorgeMessage(generationId: string): void {
    streamMessages.value = [
      ...streamMessages.value.filter(message => message.id !== generationId),
      { id: generationId, role: 'george', text: '', pending: true },
    ]
  }

  function appendGeorgeDelta(generationId: string, text: string): void {
    streamMessages.value = streamMessages.value.map(message => (message.id === generationId
      ? { ...message, text: message.text + text }
      : message))
  }

  /**
   * DIE ANTWORT-MÖGLICHKEITEN AN IHREN ZUG HÄNGEN (Davids Anforderung
   * 2026-09-04) — eine eigene Aktion NEBEN `endGeorgeMessage`, nicht ein
   * Argument darin: „der Zug ist zu Ende" wird an fünf Stellen gerufen
   * (Abbruch, Fehler, abgerissener Strom), und vier davon haben zu Optionen
   * nichts zu sagen. Ein optionales Argument hiesse dort jedes Mal „keine" —
   * und ein Fehler-Frame nach dem Abschluss-Frame löschte die Chips wieder.
   */
  function setGeorgeMessageOptions(generationId: string, options: readonly string[]): void {
    if (!options.length) return
    streamMessages.value = streamMessages.value.map(message => (message.id === generationId
      ? { ...message, options: [...options] }
      : message))
  }

  /**
   * DAS BESTÄTIGUNGS-ANGEBOT AN SEINEN ZUG HÄNGEN (Davids Entscheidung
   * 2026-09-09) — dieselbe Bauart und dieselbe Begründung wie
   * `setGeorgeMessageOptions`: eine eigene Aktion, VOR dem Abschluss gerufen,
   * damit der Zug in EINEM Schritt fertig und beknopft wird.
   */
  function setGeorgeMessageConfirm(generationId: string): void {
    streamMessages.value = streamMessages.value.map(message => (message.id === generationId
      ? { ...message, confirm: true }
      : message))
  }

  /**
   * DIE GESTREAMTE BLASE SPRICHT DIE SPRACHE DER SEITE (Live-Fund 2026-09-04):
   * bei einem Choice-Slot streamt das Modell die Wert-Zeile mit — die rohe Id
   * (`sage`) stand wörtlich im Chat. Der Server tauscht sie nur in der
   * PERSISTIERTEN Nachricht; die gemalten Deltas ersetzt niemand nachträglich.
   * Gerufen beim `slot.ready`-Frame (der Strom ist dort fertig); die Regel
   * selbst ist die GETEILTE aus `shared/brandChoiceOptions.ts` — ohne Vertrag
   * für den Slot ist der Aufruf ein No-op.
   */
  function localizeGeorgeChoiceMessage(generationId: string, slotId: string, locale: string): void {
    streamMessages.value = streamMessages.value.map(message => (message.id === generationId
      ? { ...message, text: swapBrandChoiceValueLine(slotId, message.text, locale) }
      : message))
  }

  function endGeorgeMessage(generationId: string): void {
    streamMessages.value = streamMessages.value
      .map(message => (message.id === generationId ? { ...message, pending: false } : message))
      // Ein Zug ohne Text ist kein Zug: ein sofort gescheiterter Lauf soll keine
      // leere Sprechblase hinterlassen. Eigene Antworten haben immer Text —
      // der Composer lässt Leeres gar nicht erst abschicken.
      .filter(message => message.text.length > 0)
  }

  /**
   * DIE ANTWORT-MÖGLICHKEITEN EINES GESPEICHERTEN ZUGES (BW2 3c-i).
   *
   * Sie liegen ADDITIV in `parts` (`{ kind: 'reply', options: [...] }`) und
   * NICHT im Text — genau deshalb kann ein nachgeladener Verlauf sie wieder
   * als Knöpfe zeigen, statt sie als rohe Zeilen in der Blase zu haben. Alles
   * andere in `parts` geht diese Rechnung nichts an, kaputtes JSON hat die
   * Leseroute schon zu `null` gemacht.
   */
  function optionsFromParts(parts: unknown): readonly string[] | undefined {
    if (parts === null || typeof parts !== 'object') return undefined
    const raw = (parts as { options?: unknown }).options
    if (!Array.isArray(raw)) return undefined
    const options = raw.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    return options.length ? options : undefined
  }

  /** Dasselbe für das Bestätigungs-Angebot (`{ kind: 'reply', confirm: true }`). */
  function confirmFromParts(parts: unknown): boolean {
    if (parts === null || typeof parts !== 'object') return false
    return (parts as { confirm?: unknown }).confirm === true
  }

  /**
   * DER VERLAUF EINER SESSION (BW2 §6, brand-011) — beim Umschalten geladen,
   * nicht auf Vorrat.
   *
   * Er ERSETZT die Züge im Store, er hängt nicht an: eine andere Session ist
   * ein anderes Gespräch, und zwei Fäden untereinander wären ein Protokoll,
   * das niemand mehr zuordnen kann. Die `system`-Zeilen bleiben draussen — die
   * Bühne kennt zwei Sprecher, und ein dritter hätte weder Avatar noch Platz.
   *
   * FAIL-SOFT: bleibt der Abruf aus, ist die Bühne eben leer und George
   * eröffnet neu. Ein Fehlerbanner über einen ungeladenen Verlauf wäre lauter
   * als der Verlust.
   */
  async function loadSessionMessages(
    profileId: string,
    key: string,
    sessionKey: string,
    fetcher: BrandFetcher = $fetch,
  ): Promise<boolean> {
    try {
      const response = await fetcher<BrandMessagesResponse>(
        `/api/brand/profiles/${profileId}/messages`,
        { query: { stepKey: key, session: sessionKey } },
      )
      streamMessages.value = response.messages
        .filter(message => message.role === 'george' || message.role === 'user')
        .map(message => ({
          id: message.id,
          role: message.role === 'user' ? 'user' as const : 'george' as const,
          text: message.body,
          pending: false,
          ...(message.role === 'george' && optionsFromParts(message.parts)
            ? { options: optionsFromParts(message.parts) }
            : {}),
          ...(message.role === 'george' && confirmFromParts(message.parts)
            ? { confirm: true }
            : {}),
        }))
      return response.messages.some(message => message.role === 'george')
    }
    catch {
      streamMessages.value = []
      return false
    }
  }

  /** Die Session, die der Mensch gerade offen hat (`?s=`) — s. `activeSessionKey`. */
  function setActiveSession(sessionKey: string): void {
    activeSessionKey.value = sessionKey
  }

  /**
   * WAS „ABNEHMEN"/„VERTAGEN" HINTERLÄSST (Paket 3b-Antwort, hier gelesen).
   *
   * Die `revision` MUSS übernommen werden: die Route hat die Baustein-Zeile
   * geschrieben, und ein Autosave mit der alten Fassung liefe danach in einen
   * 409 — dieselbe Regel wie bei `applyGenerationRevision`. Die zwei Flags
   * ziehen lokal nach, damit Leiste und Bühne sofort stimmen; der nächste
   * vollständige Abruf bestätigt sie.
   */
  function applySessionAcceptance(response: BrandSessionAcceptResponse): void {
    if (response.revision > revision.value) revision.value = response.revision
    const current = sessions.value[response.sessionKey]
    if (!current) return
    sessions.value = {
      ...sessions.value,
      [response.sessionKey]: {
        ...current,
        accepted: response.accepted,
        deferred: response.deferred,
      },
    }
  }

  /**
   * WAS „GILT WEITER" HINTERLÄSST (Paket 6, §9) — dieselbe Antwort wie beim
   * Abnehmen, plus die eine Sache, die sie nicht trägt: der neue ZUSTAND.
   *
   * `BrandSessionAcceptResponse` sagt nichts über `stale`/`done` — sie ist die
   * Antwort auf eine Handlung, nicht eine Zustandsauskunft. Der Zustand ist
   * hier trotzdem bekannt, und zwar sicher: der Server hat den Quell-Hash auf
   * den heutigen Stand gesetzt, also IST diese Session wieder aktuell. Ihn
   * lokal nachzuziehen erspart der Bühne einen vollständigen Neu-Abruf für
   * eine Zeile, die gerade grün geworden ist; der nächste Abruf bestätigt ihn
   * ohnehin.
   */
  /**
   * „ALLE ABNEHMEN" (Befund 10) — dieselbe Buchung, nur für mehrere Zeilen.
   *
   * Sie fasst NUR an, was die Antwort als abgenommen meldet: was in `failed`
   * steht, bleibt genau so stehen, wie es war — eine Oberfläche, die den ganzen
   * Stapel grün färbte und danach vom nächsten Abruf korrigiert würde, wäre
   * schlimmer als eine, die zwei Zeilen offen zeigt.
   */
  function applySessionAcceptances(response: BrandStepAcceptAllResponse): void {
    if (response.revision > revision.value) revision.value = response.revision
    const next = { ...sessions.value }
    for (const slotId of response.accepted) {
      const current = next[slotId]
      if (!current) continue
      next[slotId] = { ...current, accepted: true, deferred: false }
    }
    sessions.value = next
  }

  function applySessionRestamp(response: BrandSessionAcceptResponse): void {
    applySessionAcceptance(response)
    const current = sessions.value[response.sessionKey]
    if (!current || current.state !== 'stale') return
    sessions.value = {
      ...sessions.value,
      [response.sessionKey]: { ...current, state: 'done' },
    }
  }

  /**
   * WAS DER SCHLIESS-AUFRUF HINTERLÄSST (Paket 4, §7) — die Antwort, hier
   * gelesen.
   *
   * Die `revision` MUSS übernommen werden (dieselbe Regel wie bei
   * `applySessionAcceptance`): die Route hat die Kapitel-Zeile geschrieben, und
   * ein Autosave mit der alten Fassung liefe danach in einen 409. Alles andere
   * ist ANZEIGE und wird beim nächsten vollständigen Abruf ohnehin bestätigt.
   *
   * FAIL-SOFT-Antworten (`reviewed: false`) ändern nur die Befund-Liste — es
   * gibt kein Urteil, und ein erfundenes `reviewed: false` an der Session wäre
   * eine Auskunft, die die Route bewusst nicht gespeichert hat.
   */
  function applySessionClose(response: BrandSessionCloseResponse): void {
    if (response.revision > revision.value) revision.value = response.revision
    findings.value = response.findings
    const current = sessions.value[response.sessionKey]
    if (!current || !response.reviewed) return
    sessions.value = {
      ...sessions.value,
      [response.sessionKey]: {
        ...current,
        reviewed: true,
        ...(response.review.notes.length ? { notes: response.review.notes.join('\n') } : {}),
        ...(response.review.missing.length ? { missing: [...response.review.missing] } : {}),
      },
    }
  }

  /**
   * EIN BEFUND IST ENTSCHIEDEN (Paket 5, §8) — er verschwindet aus der Liste.
   *
   * `findings` trägt ausdrücklich nur OFFENE Befunde (s. dort), also ist
   * „annehmen" wie „ablehnen" dasselbe Ergebnis für diese Liste: weg. Der
   * ZUSTAND der Zeile lebt weiter auf dem Server und im Chip, der ihn gerade
   * gesetzt hat.
   *
   * DIE `revision` MUSS MIT (dieselbe Regel wie bei `applySessionAcceptance`):
   * eine Ablehnung hängt ihren Grund als Notiz an die Quell-Session und
   * schreibt damit die Kapitel-Zeile — ein Autosave mit der alten Fassung
   * liefe danach in einen 409. Die NOTIZ selbst erscheint erst beim nächsten
   * vollständigen Abruf; sie hier zu erraten hiesse, den Text des Servers
   * nachzubauen.
   */
  function applyFindingDecision(decision: BrandFindingDecisionResponse): void {
    if (decision.revision > revision.value) revision.value = decision.revision
    dropFinding(decision.finding.id)
  }

  /**
   * EIN BEFUND IST WEG, OHNE DASS WIR IHN ENTSCHIEDEN HÄTTEN — die Antwort auf
   * 409 `already_decided`. Der Server sagt, dass er entschieden ist; ein Chip,
   * der danach stehen bliebe, böte einen Klick an, der garantiert wieder
   * abgewiesen wird.
   */
  function dropFinding(findingId: string): void {
    findings.value = findings.value.filter(entry => entry.id !== findingId)
  }

  function setConfidence(value: BrandConfidence): void {
    localConfidence.value = value
  }

  function mark(event: BrandSyncEvent): void {
    syncState.value = nextBrandSyncState(syncState.value, event)
  }

  const autosaveAllowed = computed(() => brandAutosaveAllowed(syncState.value))

  // ── Antworten übernehmen ────────────────────────────────────────────────

  function applyStepDetail(detail: BrandStepDetailResponse): void {
    stepKey.value = detail.stepKey
    serverSlots.value = detail.slots
    // Fehlt das Feld (alter Server während eines Deploys), ist die Karte leer
    // — die Bühne fällt dann auf ihren Rückfall zurück, statt zu brechen.
    sourceValues.value = detail.sourceValues ?? {}
    revision.value = detail.revision
    serverConfidence.value = detail.confidence
    localConfidence.value = null
    localEdits.value = {}
    progress.value = detail.progress
    missingRequired.value = [...detail.missingRequired]
    sessions.value = detail.sessions
    findings.value = detail.findings
    conflict.value = null
    syncState.value = 'saved'
    blocked.value = null
    // Der Verlauf hängt am BAUSTEIN (Schema-Anhang §3) — ein Wechsel beginnt
    // ein neues Gespräch, kein fortgesetztes.
    streamMessages.value = []
    georgeDrafts.value = {}
  }

  /**
   * `sentConfidence` ist das, was DIESER Request mitgeschickt hat — und der
   * einzige Weg, die Konfidenz sauber als gespeichert zu verbuchen.
   *
   * ── WARUM NICHT AUS DER ANTWORT ───────────────────────────────────────────
   * `BrandStepSaveResponse` trägt `revision` und `slots`, keine Konfidenz. Ohne
   * diesen Parameter blieb `serverConfidence` für immer auf dem alten Stand,
   * `pendingConfidence` damit für immer gesetzt und `hasPendingWork` für immer
   * wahr: JEDER Blur schickte dieselbe Konfidenz erneut, und der sichtbare
   * Zustand pendelte endlos „Speichert…" → still.
   *
   * ── WARUM NICHT EINFACH `localConfidence` ÜBERNEHMEN ──────────────────────
   * Weil sie sich WÄHREND des Fluges geändert haben kann (Klick auf eine
   * andere Antwort). Sie dann als gespeichert zu verbuchen, hiesse: der
   * Nachhol-Lauf findet nichts mehr zu tun und die neue Wahl geht verloren.
   * Verbucht wird deshalb genau der Wert, der auch abgeschickt wurde.
   */
  function applySaveResponse(
    response: BrandStepSaveResponse,
    sentConfidence?: BrandConfidence,
  ): void {
    serverSlots.value = response.slots
    revision.value = response.revision
    if (sentConfidence !== undefined) serverConfidence.value = sentConfidence
    // Was der Server jetzt so trägt, ist keine offene Änderung mehr — sonst
    // sendete der nächste Tick dieselbe Eingabe erneut.
    localEdits.value = pruneSettledEdits(response.slots, localEdits.value)
    if (pendingConfidence.value === undefined) localConfidence.value = null
    // Die angenommene Hülle gilt für GENAU DIESE Speicherung (§9): sie ist
    // verbraucht, sobald der Server sie angenommen hat. Ein liegen gebliebener
    // Hash behauptete beim nächsten Mal eine Zustimmung, die niemand gegeben
    // hat — und der Server prüfte ihn gegen eine andere Hülle.
    pendingImpactAck.value = ''
    mark('ok')
  }

  /**
   * @returns `true`, wenn der Konflikt STILL aufgelöst wurde — dann darf (und
   * muss) der Autosave die eigene Eingabe mit der neuen `revision` erneut
   * senden. `false` heisst: der Dialog steht, es wird nichts mehr geschickt.
   */
  function applyConflict(current: BrandWorkspaceConflict, force = false): boolean {
    /**
     * SCHEIN-KONFLIKT STILL AUFLÖSEN (Davids Fund, 2026-09-02): die Revision
     * bewegt sich auch OHNE Textänderung — Bestätigen/Korrigieren in einem
     * anderen Tab genügt. Der Dialog bot dann die Wahl zwischen zwei
     * identischen Texten an („same same"). Trägt der Server jede offene
     * Eingabe bereits wortgleich, gibt es nichts zu entscheiden: Serverstand
     * übernehmen (inklusive Bestätigungs-Flags), weiter wie nach einem
     * normalen Speichern. Der Dialog bleibt echten Text-Abweichungen
     * vorbehalten.
     */
    const stillOpen = pruneSettledEdits(current.slots, localEdits.value)
    if (Object.keys(stillOpen).length === 0) {
      serverSlots.value = current.slots
      revision.value = current.revision
      localEdits.value = {}
      mark('ok')
      return false
    }
    /**
     * LEER IST KEINE ZWEITE FASSUNG (Kailua-Befund 2, 2026-09-08).
     *
     * Ist an keinem offenen Feld ein FREMDER, nicht-leerer Text entstanden,
     * gibt es nichts zu entscheiden — nur eine `revision`, die uns davongelaufen
     * ist (ein Gesprächszug, eine Sammel-Session, ein Stempel). Die neue
     * Fassung wird übernommen, die eigene Eingabe bleibt STEHEN, und der
     * Aufrufer speichert sie gleich erneut. `force` ist der Notausgang des
     * Autosave: wiederholt sich das Rennen, steht doch der Dialog — lieber eine
     * Frage zu viel als eine Schleife.
     */
    if (!force && !brandConflictNeedsDecision(serverSlots.value, current.slots, localEdits.value)) {
      serverSlots.value = current.slots
      revision.value = current.revision
      localEdits.value = stillOpen
      mark('ok')
      return true
    }
    conflict.value = current
    mark('conflict')
    return false
  }

  /** „Serverfassung laden" — die einzige Auflösung, die etwas überschreibt. */
  function resolveWithServer(): void {
    if (!conflict.value) return
    serverSlots.value = conflict.value.slots
    revision.value = conflict.value.revision
    localEdits.value = {}
    localConfidence.value = null
    conflict.value = null
    mark('resolve')
  }

  // ── Routen ──────────────────────────────────────────────────────────────

  async function loadProfiles(fetcher: BrandFetcher = $fetch): Promise<void> {
    loading.value = true
    try {
      const response = await fetcher<BrandProfileListResponse>('/api/brand/profiles')
      profiles.value = response.profiles
      denied.value = false
    }
    catch (error) {
      profiles.value = []
      // Nur ein 404 ist eine ANTWORT („kein Zugang"). Alles andere ist ein
      // Ausfall und gehört dem Aufrufer — und `denied` bleibt dann, wie es
      // war, statt einen Transportfehler als „Zugang vorhanden" zu verbuchen.
      if (errorStatus(error) !== 404) throw error
      denied.value = true
    }
    finally {
      loading.value = false
    }
  }

  function applyDetail(detail: BrandProfileDetailResponse): void {
    profile.value = detail.profile
    journey.value = detail.journey
    profileDenied.value = false
  }

  async function loadProfile(profileId: string, fetcher: BrandFetcher = $fetch): Promise<boolean> {
    try {
      const detail = await fetcher<BrandProfileDetailResponse>(`/api/brand/profiles/${profileId}`)
      applyDetail(detail)
      return true
    }
    catch (error) {
      if (errorStatus(error) === 404) {
        profileDenied.value = true
        profile.value = null
        journey.value = []
        return false
      }
      throw error
    }
  }

  async function loadStep(profileId: string, key: string, fetcher: BrandFetcher = $fetch): Promise<boolean> {
    try {
      const detail = await fetcher<BrandStepDetailResponse>(
        `/api/brand/profiles/${profileId}/steps/${key}`,
      )
      applyStepDetail(detail)
      return true
    }
    catch (error) {
      const status = errorStatus(error)
      // Der Baustein-Schlüssel steht im Katalog (die Seite prüft ihn ohne
      // Request) — ein 404 hier spricht also über das PROFIL, nicht über den
      // Baustein: es gibt dieses Branding für dieses Konto nicht (mehr).
      if (status === 404) {
        profileDenied.value = true
        return false
      }
      if (status === 403) {
        blocked.value = brandErrorReason(error) ?? 'locked'
        return false
      }
      throw error
    }
  }

  /**
   * DIE FAKTEN DES BAUSTEINS NACHLADEN, OHNE DAS GESPRÄCH ANZUFASSEN
   * (Kailua-Befund 4, 2026-09-08).
   *
   * `loadStep` ist dafür das falsche Werkzeug: `applyStepDetail` LEERT
   * `streamMessages` (ein Baustein-Wechsel beginnt ein neues Gespräch) — nach
   * einem Zug gerufen, wischte es genau den Zug weg, der gerade eingetroffen
   * ist. Hier wird deshalb alles übernommen, was der Server über den STAND
   * sagt, und nichts, was über das GESPRÄCH gesagt wurde.
   *
   * Die lokale Eingabe bleibt stehen und wird nur um das gekürzt, was der
   * Server inzwischen so trägt (`pruneSettledEdits`, dieselbe Regel wie nach
   * einem Speichern) — ein Nachladen darf niemandem seinen offenen Satz nehmen.
   *
   * FAIL-SOFT: geht der Abruf schief, bleibt der Stand, wie er war. Ein
   * Fehlerbanner für eine Auffrischung wäre lauter als ihr Ausbleiben.
   */
  async function refreshStep(profileId: string, key: string, fetcher: BrandFetcher = $fetch): Promise<boolean> {
    try {
      const detail = await fetcher<BrandStepDetailResponse>(
        `/api/brand/profiles/${profileId}/steps/${key}`,
      )
      // Inzwischen woanders: eine Antwort auf einen anderen Baustein wäre hier
      // eine Vermischung zweier Kapitel.
      if (detail.stepKey !== stepKey.value) return false
      serverSlots.value = detail.slots
      sourceValues.value = detail.sourceValues ?? {}
      revision.value = detail.revision
      serverConfidence.value = detail.confidence
      localEdits.value = pruneSettledEdits(detail.slots, localEdits.value)
      progress.value = detail.progress
      missingRequired.value = [...detail.missingRequired]
      sessions.value = detail.sessions
      findings.value = detail.findings
      return true
    }
    catch {
      return false
    }
  }

  /**
   * HIER STAND `reopenStep()` — ENTFERNT (Paket 8, 2026-09-05).
   *
   * Die pure Transition `reopen` BLEIBT (`shared/brandJourney.ts`, das
   * optionale `reopen` im Autosave-PATCH und seine Tests): sie ist die LEISE
   * Vertiefungsrunde des Plans (§5a Schluss, „Session öffnen, Wert ändern") —
   * `done → active`, Slots und Konfidenz bleiben stehen.
   *
   * Nur die CLIENT-Aktion war tot. Ihr Aufrufer, der Konfidenz-Chip, ist mit
   * Paket 3c-ii auf die Abnahme-Seite gezogen, und „Nochmal von vorn" heisst
   * dort die LÖSCHENDE Handlung `restart` — eine andere Sache. Die Korrektur
   * (Paket 6) ist es ebenfalls nicht: sie öffnet das Kapitel bewusst nicht
   * wieder. Eine Aktion, die niemand ruft, ist kein Vorrat, sondern eine
   * Behauptung über einen Weg, den es in der Oberfläche nicht gibt — und sie
   * hielte eine `journey`-Nachführung am Leben, die niemand mehr gegenprüft.
   * Der Server-Vertrag steht; wer die Runde wieder braucht, schreibt drei
   * Zeilen an genau der Stelle, an der sie dann gedrückt wird.
   */

  async function completeStep(profileId: string): Promise<void> {
    if (!stepKey.value) return
    const response = await $fetch<BrandStepCompleteResponse>(
      `/api/brand/profiles/${profileId}/steps/${stepKey.value}/complete`,
      {
        method: 'POST',
        body: { ...(confidence.value ? { confidence: confidence.value } : {}) },
      },
    )
    journey.value = response.journey
    serverConfidence.value = confidence.value
    localConfidence.value = null
    if (profile.value) {
      profile.value = {
        ...profile.value,
        progressPct: response.progressPct,
        currentStepKey: response.currentStepKey,
      }
    }
  }

  function reset(): void {
    profile.value = null
    journey.value = []
    stepKey.value = null
    serverSlots.value = {}
    localEdits.value = {}
    revision.value = 0
    serverConfidence.value = null
    localConfidence.value = null
    progress.value = { ...EMPTY_PROGRESS }
    missingRequired.value = []
    sourceValues.value = {}
    sessions.value = {}
    findings.value = []
    activeSessionKey.value = ''
    syncState.value = 'saved'
    conflict.value = null
    denied.value = false
    profileDenied.value = false
    blocked.value = null
    streamMessages.value = []
    georgeDrafts.value = {}
    pendingImpactAck.value = ''
    invariantRejection.value = null
    correctionRejected.value = ''
    emptyConfirmRejection.value = ''
    saveRejection.value = null
  }

  return {
    profile,
    profiles,
    journey,
    stepKey,
    serverSlots,
    localEdits,
    revision,
    // Beide Konfidenz-Refs MÜSSEN im Return stehen, obwohl die Seite nur das
    // computed `confidence` liest: Pinia serialisiert in den SSR-Payload nur
    // zurückgegebene Refs. Als private Refs starteten sie im Browser wieder
    // bei null — SSR malte den gewählten Chip, die Hydration nahm ihn weg
    // (live erwischt 2026-09-03: PATCH 200, GET trägt die Konfidenz, Chip
    // nach Reload trotzdem leer).
    serverConfidence,
    localConfidence,
    progress,
    missingRequired,
    sourceValues,
    sessions,
    findings,
    activeSessionKey,
    syncState,
    conflict,
    denied,
    profileDenied,
    blocked,
    loading,
    streamMessages,
    georgeDrafts,
    confidence,
    pendingSlots,
    pendingConfidence,
    pendingImpactAck,
    invariantRejection,
    correctionRejected,
    emptyConfirmRejection,
    saveRejection,
    hasPendingWork,
    autosaveAllowed,
    currentJourneyStep,
    railSteps,
    designSteps,
    designOpen,
    kitSteps,
    kitOpen,
    slotValue,
    slotConfirmed,
    canEnter,
    neighbourStep,
    setSlotValue,
    setSlotConfirmed,
    setImpactAck,
    rejectInvariantConfirmations,
    dismissInvariantRejection,
    rejectCorrection,
    dismissCorrectionRejection,
    rejectEmptyConfirmations,
    dismissEmptyConfirmRejection,
    rejectSave,
    dismissSaveRejection,
    setActiveSession,
    setConfidence,
    applyGeorgeDraft,
    slotIsGeorgeDraft,
    clearGeorgeDraft,
    applyGenerationRevision,
    addUserMessage,
    beginGeorgeMessage,
    appendGeorgeDelta,
    setGeorgeMessageOptions,
    setGeorgeMessageConfirm,
    localizeGeorgeChoiceMessage,
    endGeorgeMessage,
    mark,
    applyStepDetail,
    applySaveResponse,
    applySessionAcceptance,
    applySessionAcceptances,
    applySessionRestamp,
    applySessionClose,
    applyFindingDecision,
    dropFinding,
    applyConflict,
    resolveWithServer,
    loadProfiles,
    loadProfile,
    loadStep,
    refreshStep,
    loadSessionMessages,
    completeStep,
    reset,
  }
}

export const useBrandWorkspaceStore = defineStore('brandWorkspace', setup)
