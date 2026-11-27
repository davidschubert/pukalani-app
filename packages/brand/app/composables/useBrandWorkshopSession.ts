import { computed, onMounted, ref, type Ref, watch } from 'vue'
import { type BrandNextSessionRef, resolveNextStop } from '../../shared/brandJourney'
import {
  BRAND_ACCEPTANCE_VIEW,
  decideAutoAdvance,
  needsOpeningTurn,
  openingAdvanceAllowed,
  resolveContinueTarget,
} from '../../shared/brandWorkspaceNav'
import { brandSessionIsAskable } from '../../shared/brandSessionGroups'
import { affectsView } from '../../shared/brandSessions'
import {
  type BrandSlot,
  type BrandSlotStateFacts,
  type BrandStepKey,
  partLabelKeyFor,
  slotById,
} from '../../shared/slotRegistry'
import type {
  BrandSessionAcceptResponse,
  BrandSessionCloseResponse,
  BrandSessionView,
} from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'
import type { useBrandConversation } from './useBrandConversation'
import type { useBrandGeneration } from './useBrandGeneration'
import type { BrandEditBaseline } from './useBrandSlotRevision'

/** Was `useAsyncData` des Verlaufs liefert: welche Session gemeint war und ob George dort sprach. */
export interface BrandSessionHistory {
  sessionKey: string
  spoke: boolean
}

export interface UseBrandWorkshopSessionOptions {
  profileId: Readonly<Ref<string>>
  routeStepKey: Readonly<Ref<string>>
  stepKey: Readonly<Ref<BrandStepKey | null>>
  slots: Readonly<Ref<readonly BrandSlot[]>>
  /** `?s=` aus der Adresse — die Session steht in der Adresse, nicht im Zustand (§11). */
  sessionQuery: Readonly<Ref<string>>
  activeSessionKey: Readonly<Ref<string>>
  activeSlot: Readonly<Ref<BrandSlot | null>>
  activeSession: Readonly<Ref<BrandSessionView | null>>
  acceptanceView: Readonly<Ref<boolean>>
  /** Die OPTIMISTISCHEN Slot-Tatsachen — der Rückfall-Wegweiser nach dem Bestätigen. */
  slotFacts: Readonly<Ref<Record<string, BrandSlotStateFacts>>>
  /** Gehören der Seite: `nextSlot` liest sie schon beim Anlegen (TDZ, s. dort). */
  closingFrom: Ref<string>
  closingNext: Ref<BrandNextSessionRef | null>
  /** Gehören der Seite: Bühne, Log und Karten lesen sie. */
  editingSlotId: Ref<string | null>
  editBaseline: Ref<BrandEditBaseline | null>
  /** Gehört der Seite: der Kapitel-Wechsel und „Nochmal von vorn" räumen ihn. */
  openedSessions: Ref<Set<string>>
  /** Der Verlauf der Session — das `await useAsyncData` bleibt in der Seite (SSR-Nutzlast). */
  sessionHistory: { data: Readonly<Ref<BrandSessionHistory | null | undefined>> }
  conversation: ReturnType<typeof useBrandConversation>
  generation: ReturnType<typeof useBrandGeneration>
  autosave: { flush: () => Promise<void> }
  slotLabel: (slot: BrandSlot) => string
}

/**
 * SESSION, VERLAUF UND ABSCHLUSS DER WERKSTATT (WS1 e, Rest, 2026-11-27) —
 * aus `pages/brand/[profileId]/[stepKey].vue` geschnitten, ohne
 * Verhaltensänderung.
 *
 * Hier wohnt: der Eröffnungszug samt seiner `onMounted`-Klammer, das Öffnen
 * einer Session (Adresse statt Zustand), der Feld-Link über die
 * Kapitel-Grenze, Dokument und Abnahme, Auto-Weiter, Vertagen, der
 * Zwischenstand einer Sammel-Session, der „Wofür brauchen wir das?"-Satz,
 * die Session-Ablehnungen, Bestätigen mit Schliess-Aufruf und der
 * Weiter-Knopf.
 *
 * WAS IN DER SEITE BLEIBT, UND WARUM: das `await useAsyncData` des Verlaufs
 * (ein `await` in einem Composable verlöre danach den Komponenten-Kontext —
 * `onMounted` und `watch` hingen an nichts mehr) und alle Refs, die die
 * Bühne schon beim Anlegen liest (`closingFrom`, `closingNext`,
 * `editingSlotId`, `editBaseline`). Dieser Baustein wird an DERSELBEN Stelle
 * im `setup` aufgerufen, an der der Abschnitt stand: die Reihenfolge von
 * `watch` und `onMounted` bleibt gleich.
 */
export function useBrandWorkshopSession(options: UseBrandWorkshopSessionOptions) {
  const {
    profileId,
    routeStepKey,
    stepKey,
    slots,
    sessionQuery,
    activeSessionKey,
    activeSlot,
    activeSession,
    acceptanceView,
    slotFacts,
    closingFrom,
    closingNext,
    editingSlotId,
    editBaseline,
    openedSessions,
    sessionHistory,
    conversation,
    generation,
    autosave,
    slotLabel,
  } = options
  const store = useBrandWorkspaceStore()
  const route = useRoute()
  const { t } = useI18n()
  const localePath = useLocalePath()
  const toast = useToast()

  /**
   * DER ERÖFFNUNGSZUG (§6) — George spricht zuerst, wenn die Session noch stumm
   * ist. Er läuft NUR im Browser: die Route streamt, und ein Strom im SSR wäre
   * eine Antwort, die niemand liest.
   */
  async function ensureOpeningTurn(sessionKey: string): Promise<void> {
    const spoke = sessionHistory.data.value?.spoke === true
    if (!needsOpeningTurn({
      sessionKey,
      opened: openedSessions.value,
      hasAdvisorTurn: spoke,
      streaming: conversation.pending.value,
    })) {
      // „Hier hat er schon gesprochen" ist ebenfalls eine Antwort — merken, damit
      // der Rückweg auf diese Session nicht erneut nachschlägt.
      if (spoke) openedSessions.value.add(sessionKey)
      return
    }
    openedSessions.value.add(sessionKey)
    await conversation.converse({ opening: true, sessionKey })
    /**
     * WEITER NUR VON EINER ENTWURFS-SESSION, DIE NIEMAND ANGEKLICKT HAT
     * (Testlauf-Befund B, 2026-09-09) — die Regel steht pur nebenan
     * (`openingAdvanceAllowed`), hier stehen die zwei Tatsachen.
     *
     * Vorher lief der Sprung nach JEDEM Eröffnungszug: ein Klick auf „Das Eine"
     * eröffnete dort und landete auf „Größtes Hindernis", zwei KI-Züge je Klick.
     */
    const opened = slots.value.find(slot => slot.id === sessionKey) ?? slotById(sessionKey)
    if (!openingAdvanceAllowed({
      askable: opened ? brandSessionIsAskable(opened) : true,
      requested: sessionQuery.value === sessionKey,
    })) return
    await autoAdvance(sessionKey, conversation.nextStop.value)
  }

  /**
   * ERÖFFNET WIRD ERST, WENN DER VERLAUF DA IST — und nur für die Session, zu
   * der er gehört. Am `activeSessionKey` allein zu hängen hiesse, mit dem Stand
   * der VORIGEN Session zu entscheiden: ein überflüssiger Aufruf, den die Route
   * zwar abweist (`skipped: true`), der aber trotzdem eine Anfrage kostet.
   *
   * ── UND ERST NACH DEM MOUNT, NICHT SCHON IM SETUP (Paket 8, 2026-09-05) ───
   * Der Wächter stand hier als `watch(…, { immediate: true })` — und damit lief
   * `converse()` schon WÄHREND der Hydration los. Sein erstes `await` (der
   * Autosave-Ausspüler) fällt in einen Microtask, also nach dem Setup und VOR
   * dem ersten Rendern: `conversation.pending` war beim ersten Client-Paint
   * `true`, `turns` gab deshalb nur die (leeren) Live-Züge zurück, und der
   * Server hatte an derselben Stelle die Katalog-Frage gemalt. Ergebnis: fünf
   * „Hydration node mismatch" und ein „children mismatch" an <BwWorkspace> —
   * genau der SSR/Client-Zweigtausch, den CLAUDE.md verbietet, nur nicht im
   * Markup, sondern in einer Nebenwirkung.
   *
   * `onMounted` ist die kleinste ehrliche Klammer: die Hydration sieht denselben
   * Baum wie der Server, und der Eröffnungszug startet unmittelbar danach — für
   * den Menschen ist das derselbe Moment, für Vue sind es zwei. Der Wächter
   * bleibt für die ganze Lebensdauer bestehen (Session-Wechsel), weil ein in
   * einem Lifecycle-Hook angelegter `watch` am Scope der Komponente hängt.
   * `import.meta.client` entfällt: `onMounted` läuft server-seitig nie.
   */
  onMounted(() => {
    watch(() => sessionHistory.data.value, (data) => {
      if (!data?.sessionKey || data.sessionKey !== activeSessionKey.value) return
      void ensureOpeningTurn(data.sessionKey)
    }, { immediate: true })
  })

  /**
   * EINE SESSION ÖFFNEN — dieselbe Adresse, andere Query (§11).
   *
   * `navigateTo` mit `query` statt `path`: der Route-Record bleibt, die
   * Komponente auch, und der Browser bekommt einen echten Eintrag in seiner
   * Geschichte. Der AUSSPÜLER davor ist derselbe wie beim Baustein- und
   * Marken-Wechsel (Audit A3): `onBeforeRouteLeave` feuert auf demselben Record
   * nicht, und eine offene Eingabe wäre sonst weg.
   */
  async function goToSession(sessionId: string): Promise<void> {
    if (!sessionId || sessionId === activeSessionKey.value) return
    await autosave.flush()
    await navigateTo({ query: { ...route.query, s: sessionId } })
  }

  /**
   * DIE OFFENE SESSION IN DIE ADRESSE SCHREIBEN — ohne zu wechseln.
   *
   * ── WARUM ES DAS BRAUCHT (und zwar seit dem Session-Abschluss) ───────────
   * Ohne `?s=` rechnet `resolveActiveSession` die aktive Session aus den
   * ZUSTÄNDEN: die erste OFFENE des Kapitels. Beim ersten Betreten steht deshalb
   * nichts in der Adresse — und in dem Augenblick, in dem der Mensch bestätigt,
   * ist seine Session nicht mehr offen und die Rechnung nennt lautlos die
   * nächste. Bis heute fiel das nicht auf: der Auto-Weiter navigierte ohnehin
   * sofort dorthin. Jetzt bliebe der Mensch stehen, während die Bühne unter ihm
   * die Session tauschte — und der Weiter-Knopf verschwände, noch bevor er ihn
   * sieht (`closingFrom !== activeSessionKey`).
   *
   * Kein `autosave.flush()` davor, anders als bei `goToSession`: hier wird nichts
   * gewechselt und nichts neu geladen — es wird nur festgehalten, wo man ohnehin
   * schon steht.
   */
  async function pinSession(sessionId: string): Promise<void> {
    if (!sessionId || sessionQuery.value === sessionId) return
    await navigateTo({ query: { ...route.query, s: sessionId } })
  }

  /**
   * DER FELD-LINK EINES BEFUND-CHIPS (§8) — er darf die KAPITEL-GRENZE
   * überschreiten.
   *
   * Ein Konflikt verbindet ausdrücklich zwei Kapitel (`b.purpose` ↔
   * `c.conflictRule`), und der Chip steht an beiden Enden. `goToSession` kann das
   * nicht: es tauscht nur die Query auf DEMSELBEN Route-Record. Hier steht
   * deshalb die eine Übersetzung „Feld ⇒ Adresse": gleiches Kapitel ⇒ nur `?s=`,
   * fremdes Kapitel ⇒ neue Adresse MIT `?s=`, damit der Sprung auf dem Feld
   * landet und nicht auf der ersten offenen Session.
   *
   * Ein gesperrtes Kapitel wird nicht betreten (`canEnter`, wie `goToStep`) — der
   * Fall ist theoretisch, weil ein Befund nur BESTÄTIGTE Werte vergleicht, aber
   * ein Sprung in ein 403 wäre die schlechtere Antwort als gar keiner.
   */
  async function goToField(slotId: string): Promise<void> {
    const target = slotById(slotId)?.stepId
    if (!target) return
    if (target === routeStepKey.value) { await goToSession(slotId); return }
    if (!store.canEnter(target)) return
    await autosave.flush()
    await navigateTo({ path: localePath(`/brand/${profileId.value}/${target}`), query: { s: slotId } })
  }

  /**
   * „EUER BRANDING" (§10) — eine EIGENE Adresse, kein `?s=`.
   *
   * Das Dokument gehört keinem Kapitel: es steht über allen neun. Es als dritte
   * Ansicht in `brand/[profileId]/[stepKey]` zu legen hiesse, einen Kapitel-
   * Schlüssel in die Adresse zu schreiben, der dort nichts bedeutet — und die
   * Leiste müsste sich für einen aussuchen.
   */
  async function goToDocument(): Promise<void> {
    await autosave.flush()
    await navigateTo(localePath(`/brand/${profileId.value}/document`))
  }

  /** Dieselbe Adresse, die Abnahme-Ansicht statt einer Session (§5a). */
  async function goToAcceptance(): Promise<void> {
    if (acceptanceView.value) return
    await autosave.flush()
    await navigateTo({ query: { ...route.query, s: BRAND_ACCEPTANCE_VIEW } })
  }

  /**
   * AUTO-WEITER (§5, Entscheidung 2) — die ENTSCHEIDUNG liegt pur nebenan
   * (`decideAutoAdvance`), hier steht nur, was daraus folgt.
   *
   * Das Kapitelende (`acceptance`) springt seit Paket 3c-ii MIT: die Seite gibt
   * es jetzt. Alle vier Sperren gelten unverändert (Strom, offene Speicherung,
   * Konflikt, überstimmter Mensch): sie stehen in der puren Regel.
   *
   * ── SEIT DEM 2026-09-09 BLEIBEN ZWEI AUFRUFER, UND NUR ZWEI ──────────────
   * Davids Entscheidung („kein automatischer Sprung mehr mitten im Gespräch")
   * hat die zwei anderen entfernt: die ANTWORT (sie sprang, sobald ein Wert im
   * Feld stand — mitten in Georges Rückfrage hinein) und die BESTÄTIGUNG (dort
   * steht jetzt der Abschlusszug mit seinem Weiter-Knopf, s. `confirmSlot`).
   *
   * Geblieben sind: der ERÖFFNUNGSZUG einer Entwurfs-Session — er springt zur
   * ersten Katalog-Frage, und das ist ausdrücklich gewollt (Davids Entscheidung
   * (8) vom 2026-09-08: „Georges Interview läuft zuerst durch die echten
   * Fragen") — und das VERTAGEN, das genau dafür da ist, hier wegzukommen.
   */
  async function autoAdvance(from: string, next: BrandNextSessionRef | null): Promise<void> {
    const decision = decideAutoAdvance({
      from,
      active: activeSessionKey.value,
      next,
      streaming: conversation.pending.value || generation.streaming.value,
      savePending: store.hasPendingWork,
      conflict: store.conflict !== null,
    })
    if (decision.kind === 'stay') return
    if (decision.stepKey !== stepKey.value) return
    if (decision.kind === 'acceptance') {
      await goToAcceptance()
      return
    }
    await goToSession(decision.sessionKey)
  }

  /**
   * VERTAGEN (§3a) — „darauf komme ich zurück", der vierte Ausgang neben
   * Antwort, „weiss nicht" und Bestätigen.
   *
   * Er gilt nur, wo die Registry ihn kennt (`answers.allowDefer`, Davids
   * Inhalts-Gate). Der Zwischenstand einer Sammel-Session bleibt stehen — die
   * Route sagt es im Kopf, die Bühne zeigt ihn.
   */
  const activeAllowsDefer = computed(() => activeSlot.value?.answers.allowDefer === true)
  const deferring = ref(false)

  async function setDeferred(deferred: boolean): Promise<void> {
    const slot = activeSlot.value
    if (!slot || !stepKey.value || deferring.value) return
    deferring.value = true
    try {
      await autosave.flush()
      const response = await $fetch<BrandSessionAcceptResponse>(
        `/api/brand/profiles/${profileId.value}/steps/${stepKey.value}/sessions/${slot.id}/defer`,
        { method: 'POST', body: { revision: store.revision, deferred } },
      )
      store.applySessionAcceptance(response)
      // WEITER GEHT ES NUR BEIM VERTAGEN: wer eine Session wieder aufnimmt, will
      // genau hier bleiben.
      if (deferred) await autoAdvance(slot.id, response.next)
    }
    catch (error) {
      const reason = (error as { data?: { reason?: string } }).data?.reason
      toast.add({
        color: 'warning',
        title: t(deferred ? 'brand.session.deferFailed' : 'brand.session.resumeFailed'),
        description: reason === 'already_confirmed' ? t('brand.session.deferConfirmed') : undefined,
      })
    }
    finally {
      deferring.value = false
    }
  }

  /** Der Zwischenstand einer vertagten Sammel-Session — ANZEIGE, nie Eingabe. */
  const activeCollected = computed<{ label: string, value: string }[]>(() => {
    const slot = activeSlot.value
    const collected = activeSession.value?.collected
    if (!slot || !collected) return []
    return slot.parts
      .filter(part => (collected[part] ?? '').trim().length > 0)
      .map(part => ({ label: t(partLabelKeyFor(slot, part)), value: collected[part] ?? '' }))
  })

  /**
   * „WOFÜR BRAUCHEN WIR DAS?" (§3a) — der Satz kommt aus einer RECHNUNG über der
   * Registry, nie aus einer gepflegten Liste.
   *
   * Für das OFFENE Kapitel steht die Antwort schon in der `sessions`-Karte (der
   * Server hat sie mit derselben Funktion gerechnet); für jedes andere rechnet
   * der Browser sie selbst — `affectsView` ist pur und liegt im Bündel.
   * Zwei Quellen, EIN Ergebnis: die Karte ist die Abkürzung, nicht eine zweite
   * Wahrheit.
   */
  function affectsLine(sessionId: string): string {
    // Dieselbe pure Regel wie der Server (`affectsView`): nur ERREICHBARE
    // Kapitel — gesperrtes Brand Design steht nicht im Hinweis.
    const { count, steps } = store.sessions[sessionId]?.affects ?? affectsView(sessionId, store.railSteps)
    if (count === 0) return t('brand.session.affectsNone')
    return t('brand.session.affects', {
      count,
      steps: steps.map(key => t(`brand.steps.${key}`)).join(' · '),
    })
  }

  /**
   * DIE ZWEI SESSION-ABLEHNUNGEN BEKOMMEN EINEN SATZ (3a-Befund 3): ein 409 ist
   * eine Auskunft an ein Programm. Gesperrte Zeilen sind in der Leiste zwar gar
   * nicht anklickbar — über die Adresszeile kommt man trotzdem hin.
   */
  watch(() => conversation.sessionFailure.value, (failure) => {
    if (!failure) return
    toast.add({ color: 'warning', title: t(`brand.session.error.${failure}`) })
    conversation.dismissSessionFailure()
  })

  /**
   * DER SCHLIESS-AUFRUF (BW2 Paket 4, §7) — der Spezialist liest mit, NACHDEM
   * bestätigt wurde.
   *
   * ── ER DARF NICHTS AUFHALTEN ─────────────────────────────────────────────
   * Die Bestätigung ist bereits gespeichert (`autosave.flush()` davor). Was hier
   * schiefgeht — Netz, 409, ausgeschaltete KI —, kostet das Urteil und nichts
   * sonst: kein Toast, kein Blocker, nur der Wegweiser fällt auf die
   * Grundfassung zurück. Ein Fehlerhinweis für eine Zugabe, die der Mensch nie
   * angefordert hat, wäre Lärm.
   *
   * ── DER WEGWEISER KOMMT JETZT VOM SERVER ─────────────────────────────────
   * Bis Paket 3 rechnete diese Stelle `resolveNextStop` selbst. Der Server kennt
   * mehr: den Vorschlag des Spezialisten, geprüft gegen Registry UND
   * Session-Zustände (`pickNextSession`). Sein `next` ist damit dieselbe Antwort
   * oder eine bessere — und die lokale Rechnung bleibt als Rückfall stehen, für
   * genau die Fälle oben.
   */
  async function closeSession(slotId: string): Promise<BrandNextSessionRef | null> {
    if (!stepKey.value) return null
    try {
      const response = await $fetch<BrandSessionCloseResponse>(
        `/api/brand/profiles/${profileId.value}/steps/${stepKey.value}/sessions/${slotId}/close`,
        { method: 'POST', body: { revision: store.revision } },
      )
      store.applySessionClose(response)
      return response.next
    }
    catch {
      return null
    }
  }

  /**
   * BESTÄTIGEN — UND DANACH FÜHRT GEORGE (Davids Entscheidung 2026-09-09,
   * DECISION-LOG Punkt 10).
   *
   * ── WAS SICH GEDREHT HAT ─────────────────────────────────────────────────
   * Hier stand `autoAdvance(slotId, next)`: die Bestätigung sprang wortlos in die
   * nächste Session. Jetzt bleibt die Seite stehen, George spricht EINEN
   * Abschlusszug („Gründungsimpuls steht …"), und darunter erscheint ein Knopf
   * „Weiter zu <Session>". Der Mensch geht weiter, nicht die Seite.
   *
   * ── DER KNOPF KOMMT AUCH OHNE GEORGE ─────────────────────────────────────
   * `closingFrom`/`closingNext` werden VOR dem Zug gesetzt und nicht aus ihm.
   * Ist die KI aus, die Drossel voll oder der Anbieter kaputt, gibt es keinen
   * Abschlusszug — aber der Weg muss trotzdem weitergehen. Ohne diese
   * Reihenfolge wäre jede ausgefallene Zugabe eine Sackgasse (und mit dem
   * gefallenen Auto-Weiter gäbe es keinen zweiten Ausgang mehr).
   *
   * ── NUR DIE OFFENE SESSION BEKOMMT EINEN ABSCHLUSS ───────────────────────
   * Wer rechts im Notizblock die Karte eines ANDEREN Feldes bestätigt, hat kein
   * Gespräch darüber geführt — ein Abschlusszug in einem fremden Faden wäre ein
   * Kommentar zu etwas, das nebenan passiert ist. Das war auch vorher so: der
   * Auto-Weiter blieb bei `from !== active` stehen.
   */
  async function confirmSlot(slotId: string): Promise<void> {
    editingSlotId.value = null
    editBaseline.value = null
    // ZUERST FESTHALTEN, WO WIR STEHEN (s. `pinSession`): die Bestätigung nimmt
    // der Session ihren Zustand `open`, und ohne `?s=` würde die Rechnung danach
    // lautlos die nächste nennen.
    if (slotId === activeSessionKey.value) await pinSession(slotId)
    store.setSlotConfirmed(slotId, true)
    await autosave.flush()
    if (!stepKey.value) return
    // Die lokale Grundfassung ist der RÜCKFALL, nicht die Regel (s. oben).
    const next = await closeSession(slotId) ?? resolveNextStop(stepKey.value, slotFacts.value)
    if (slotId !== activeSessionKey.value) return

    closingFrom.value = slotId
    closingNext.value = next
    await conversation.converse({ closing: true, sessionKey: slotId })
    // Der Wegweiser des ABSCHLUSSZUGES ist der jüngere: er ist auf dem
    // Server-Stand NACH der Bestätigung gerechnet. Kam kein Zug (KI aus,
    // Drossel), bleibt der von `closeSession` stehen.
    if (conversation.nextStop.value) closingNext.value = conversation.nextStop.value
  }

  /**
   * WOHIN FÜHRT DER WEITER-KNOPF — die Regel steht pur nebenan
   * (`resolveContinueTarget`), hier stehen nur die vier Tatsachen.
   */
  const continueTarget = computed(() => (stepKey.value
    ? resolveContinueTarget({
        stepKey: stepKey.value,
        from: closingFrom.value,
        active: activeSessionKey.value,
        next: closingNext.value,
        streaming: conversation.pending.value,
      })
    : { kind: 'none' as const }))

  /** Die Beschriftung des Ziels — dieselbe wie in der Leiste und im Notizblock. */
  const continueLabel = computed<string>(() => {
    const target = continueTarget.value
    if (target.kind !== 'session') return ''
    const slot = slots.value.find(entry => entry.id === target.sessionKey)
      ?? slotById(target.sessionKey)
    return slot ? slotLabel(slot) : target.sessionKey
  })

  async function continueToNext(): Promise<void> {
    const target = continueTarget.value
    if (target.kind === 'none') return
    closingFrom.value = ''
    closingNext.value = null
    if (target.kind === 'acceptance') { await goToAcceptance(); return }
    await goToSession(target.sessionKey)
  }

  return {
    goToSession,
    goToField,
    goToDocument,
    goToAcceptance,
    activeAllowsDefer,
    deferring,
    setDeferred,
    activeCollected,
    affectsLine,
    confirmSlot,
    continueTarget,
    continueLabel,
    continueToNext,
  }
}
