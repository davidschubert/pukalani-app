import { computed, type ComputedRef } from 'vue'
import type { BwRailLayer, BwRailSession, BwRailStep, BwRailStepInfo } from '../components/BwProgressRail.vue'
import type { BwSidebarBrand } from '../components/BwWorkspaceSidebar.vue'
import { type BrandJourneyStep, brandStepCompletion } from '../../shared/brandJourney'
import {
  BRAND_ACCEPTANCE_VIEW,
  type BrandNavSession,
  chapterEffortMinutes,
  chapterRemainingMinutes,
  countChapterSessions,
  countOpenFindings,
} from '../../shared/brandWorkspaceNav'
import { brandDerivedDividerSlot } from '../../shared/brandSessionGroups'
import {
  type BrandSlot,
  type BrandSlotStateFacts,
  type BrandStepKey,
  isBrandDesignStep,
  isBrandKitStep,
  slotsForStep,
} from '../../shared/slotRegistry'
import type { BrandFindingView } from '../../shared/types/brand'
import { useBrandWorkspaceStore } from '../stores/brandWorkspace'
import { useBrandFoundationRailStep } from './useBrandFoundationRailStep'

/**
 * DIE LEISTE DER WERKSTATT UND DER GESAMTFORTSCHRITT — aus der Werkstatt-Seite
 * geschnitten (WS1, Kapitel g).
 *
 * Reine Anzeige: alles hier liest den Store und die Rechnungen der Seite, die
 * die Bühne mit der Leiste teilt (aktive Session, Abnahme-Ansicht, Kapitel-
 * Stand, Beschriftungen). Die Seite reicht diese Rechnungen herein, statt dass
 * sie hier ein zweites Mal entstehen — sonst sagten Leiste und Bühne
 * irgendwann Verschiedenes über dasselbe Feld. Navigieren bleibt Sache der
 * Seite (Autosave vor jedem Wechsel).
 */
export interface BrandWorkshopRailInput {
  profileId: ComputedRef<string>
  stepKey: ComputedRef<BrandStepKey | null>
  /** Die Slots des offenen Kapitels. */
  slots: ComputedRef<readonly BrandSlot[]>
  activeSessionKey: ComputedRef<string>
  acceptanceView: ComputedRef<boolean>
  /** Der Kapitel-Stand aus Server-Sicht (`brandStepCompletion`). */
  completion: ComputedRef<ReturnType<typeof brandStepCompletion> | null>
  navSessions: ComputedRef<Record<string, BrandNavSession>>
  serverSlotFacts: ComputedRef<Record<string, BrandSlotStateFacts>>
  slotLabel: (slot: BrandSlot) => string
  slotNote: (slot: BrandSlot) => string
  affectsLine: (sessionId: string) => string
  findingsForSlot: (slotId: string) => BrandFindingView[]
}

export function useBrandWorkshopRail(input: BrandWorkshopRailInput) {
  const { profileId, stepKey, slots, activeSessionKey, acceptanceView, completion, navSessions, serverSlotFacts } = input
  const { slotLabel, slotNote, affectsLine, findingsForSlot } = input
  const { t } = useI18n()
  const localePath = useLocalePath()
  const store = useBrandWorkspaceStore()

  // ── Leiste, Balken, Fortschritt ───────────────────────────────────────────

  /**
   * Der Journey-Zustand in der Sprache der Leiste. `locked` wurde bis zum
   * Audit-Befund A9 auf `open` abgebildet — das Schloss des Plans erschien in
   * der Leiste damit NIE, obwohl der Log daneben es an derselben Stelle zeigt.
   * `skipped` kommt hier nicht an (`store.railSteps` filtert es heraus).
   */
  function railState(state: string): BwRailStep['state'] {
    if (state === 'done') return 'done'
    if (state === 'active') return 'active'
    if (state === 'locked') return 'locked'
    return 'open'
  }

  /**
   * DAS INFO-PAKET EINES BAUSTEINS kommt aus der Slot-Registry: die
   * Entscheidungen sind seine Pflicht-Slots, „erledigt" ist bestätigt. Für den
   * OFFENEN Baustein steht der Live-Stand darin, für die anderen der Stand aus
   * der Journey (`missingRequired`) — mehr weiss der Browser über sie nicht,
   * und mehr behauptet der Layer auch nicht.
   */
  function railInfo(entry: BrandJourneyStep): BwRailStepInfo {
    const done = new Set(
      entry.stepKey === stepKey.value
        ? slots.value.filter(slot => store.slotConfirmed(slot.id)).map(slot => slot.id)
        : slotsForStep(entry.stepKey).filter(slot => slot.required && !entry.missingRequired.includes(slot.id)).map(slot => slot.id),
    )
    return {
      // Der Erklär-Absatz je Baustein (Nacht 2026-09-03): die sieben im Dummy
      // ABGENOMMENEN Texte, wörtlich übernommen, plus architecture/result im
      // selben Stil — der Layer fiel vorher ehrlich auf „kein Absatz" zurück.
      description: t(`brand.stepInfo.${entry.stepKey}`),
      bausteine: slotsForStep(entry.stepKey)
        .filter(slot => slot.required)
        // „Wofür brauchen wir das?" (§3a) steht am FELD, nicht am Kapitel: der
        // Mensch fragt es, während er antwortet.
        .map(slot => ({
          label: slotLabel(slot),
          note: slotNote(slot),
          done: done.has(slot.id),
          affects: affectsLine(slot.id),
        })),
    }
  }

  /**
   * DIE UNTERPUNKTE EINES KAPITELS (§11) — nur für das OFFENE, denn „nur das
   * aktive Kapitel aufgeklappt" ist eine Aussage über die DATEN und keine
   * zweite Regel in der Leiste.
   *
   * Der ZUSTAND einer Zeile hat drei Quellen, in dieser Rangfolge: die Session,
   * in der der Mensch gerade steht (`active`), das Merkzeichen „vertagt" und
   * erst dann der abgeleitete Server-Zustand. Vertagt schlägt `open`, weil es
   * genau die Auskunft ist, die jemand sucht, der die Zeile wiederfindet.
   *
   * GESPERRT heisst NICHT ANKLICKBAR (3a-Befund 3): der Server wiese den Zug mit
   * 409 `session_locked` ab, und ein Knopf, der garantiert in eine Absage läuft,
   * ist kein Angebot.
   */
  function railSessions(entry: BrandJourneyStep): BwRailSession[] {
    /**
     * DER TRENNER „Daraus abgeleitet" (Davids Klick-Test 2026-09-09) — die
     * Grenze zwischen den Fragen des Kapitels und dem, was George daraus macht.
     * WELCHE Zeile ihn trägt, rechnet die pure Regel; hier steht nur, wie er
     * heisst. Kapitel ohne Ableitung, ohne Frage oder mit gemischter Ordnung
     * bekommen `null` und damit keinen — eine Überschrift, unter der wieder
     * gefragt wird, wäre eine falsche Zusage.
     */
    const divider = brandDerivedDividerSlot(entry.stepKey)
    const list: BwRailSession[] = slotsForStep(entry.stepKey).map((slot) => {
      const view = store.sessions[slot.id]
      const state = view?.state ?? 'locked'
      return {
        id: slot.id,
        label: slotLabel(slot),
        ...(slot.id === divider ? { groupLabel: t('brand.nav.derivedGroup') } : {}),
        // Die Minuten sind eine VORSCHAU auf Arbeit — eine bestätigte Session hat
        // keine mehr (Davids Klick-Test 2026-09-09: „die Zeit verschwindet dann
        // auch hinten dran"). `stale` behält sie: dort steht Arbeit wieder an.
        effort: state === 'done' ? '' : t('brand.session.minutes', { minutes: slot.effort.minutes }),
        state: slot.id === activeSessionKey.value
          ? 'active'
          : view?.deferred ? 'deferred' : state,
        disabled: state === 'locked',
        // Das bernsteinfarbene Merkzeichen (§8): an dieser Session hängt ein
        // offener Befund. Es ersetzt die Glyphe NICHT — der Zustand der Session
        // („bestätigt", „veraltet") bleibt die Hauptauskunft der Zeile.
        ...(findingsForSlot(slot.id).length ? { finding: true } : {}),
        ...(state === 'locked' ? { title: t('brand.nav.sessionLocked') } : {}),
      }
    })
    /**
     * DIE FINALE ABNAHME ist der letzte Eintrag jedes Kapitels (§11) — seit
     * Paket 3c-ii mit Ziel.
     *
     * FREI, SOBALD JEDER PFLICHT-WERT BESTÄTIGT IST (`completion.slotsReady`):
     * dieselbe Bedingung, die auch `resolveNextStop` auf die Abnahme zeigen
     * lässt. Vorher steht sie gesperrt mit ihrem Grund im `title` — die Seite
     * fände sonst eine Liste ohne einen einzigen abnehmbaren Block.
     *
     * DREI ZUSTÄNDE, DREI AUSSAGEN: `done` heisst „abgenommen" (das Kapitel ist
     * abgeschlossen), `active` heisst „diese Ansicht ist gerade offen", `open`
     * heisst „frei". Die Id trägt das Kapitel mit (`<stepKey>:acceptance`),
     * damit die Leiste sie nie mit einer Slot-Id verwechselt; in die ADRESSE
     * geht `?s=acceptance` (s. `selectSession`).
     */
    /**
     * DER GRUND STEHT SICHTBAR DARUNTER (Testlauf-Befund M, 2026-09-09).
     *
     * Er stand als `title` im Markup — ein Hover-Tooltip, den auf einem
     * Touchgerät niemand sieht und den eine Tastatur nie erreicht. Der Eintrag
     * ist der letzte jedes Kapitels und der einzige dauerhaft gesperrte; ein
     * abgeschalteter Knopf ohne sichtbare Begründung ist genau die Sackgasse, die
     * Befund J am Anlage-Modal gefunden hat. `note` rendert die Leiste als kleine
     * Zeile und hängt sie per `aria-describedby` an den Knopf.
     */
    const ready = completion.value?.slotsReady === true
    const done = entry.state === 'done'
    list.push({
      id: `${entry.stepKey}:${BRAND_ACCEPTANCE_VIEW}`,
      label: t('brand.nav.acceptance'),
      state: done ? 'done' : acceptanceView.value ? 'active' : ready ? 'open' : 'locked',
      kind: 'acceptance',
      disabled: !ready && !done,
      highlight: ready && !acceptanceView.value && !done,
      ...(ready || done ? {} : { note: t('brand.nav.acceptancePending') }),
    })
    return list
  }

  /**
   * DER ZÄHLER EINES KAPITELS („7 von 11 bestätigt · 2 neu besprechen", §11).
   *
   * ── ZWEI QUELLEN, WEIL DER BROWSER ZWEI WISSENSSTÄNDE HAT ────────────────
   * Für das OFFENE Kapitel liegt die `sessions`-Karte vor: dort steht jeder
   * Zustand, also auch „veraltet". Über die anderen weiss der Browser nur, was
   * die Journey sagt — die Zahl der noch offenen PFLICHT-Felder. Der Nenner
   * bleibt in beiden Fällen die Zahl der Sessions; „neu besprechen" gibt es nur
   * dort, wo es auch bekannt ist.
   *
   * Die Ungenauigkeit ist damit einseitig: ein bestätigtes OPTIONALES Feld eines
   * fremden Kapitels zählt nicht mit. Zu wenig zu zeigen ist die richtige
   * Richtung — ein Zähler, der zu viel behauptet, schickt niemanden mehr hin.
   * Neun Abrufe beim Betreten der Werkstatt, nur damit die Leiste vollständig
   * ist, wären der falsche Preis (dieselbe Regel wie im Log: fremde Kapitel
   * werden beim AUFKLAPPEN gelesen).
   */
  /**
   * DER BEFUND-ZÄHLER DER LEISTE (§8) — er hängt sich HINTEN an die zweite Zeile
   * eines Kapitels, und nur wenn es etwas zu zählen gibt: „7 von 11 bestätigt ·
   * 1 Befund offen".
   *
   * An BEIDE Fassungen der Zeile, denn die Leiste tauscht sie: das aufgeklappte
   * (aktive) Kapitel zeigt den UMFANG, die eingeklappten den ZÄHLER
   * (`stepSubline`). Hinge er nur am Zähler, verschwände er ausgerechnet dort,
   * wo der Mensch gerade arbeitet.
   *
   * Er ersetzt nichts — „bestätigt" und „offener Befund" sind zwei Aussagen über
   * zwei Mengen, genau wie „neu besprechen" daneben.
   */
  function railFindingSuffix(stepKey: BrandStepKey): string {
    const findings = countOpenFindings(store.findings, stepKey)
    return findings > 0 ? ` · ${t('brand.finding.openCount', { count: findings }, findings)}` : ''
  }

  /**
   * DIE RESTZEIT DES OFFENEN KAPITELS (Testlauf-Befund 7, 2026-09-09) — sie
   * hängt hinten an den Zähler, statt ihn zu ERSETZEN.
   *
   * Vorher stand im Kopf des aktiven Kapitels der Registry-Umfang („11 Sessions,
   * ~14 Min"), und der bleibt nach vier Bestätigungen buchstäblich derselbe: die
   * einzige Zahl der Leiste, die vom Fortschritt nichts weiss. Der Umfang steht
   * weiterhin im Info-Layer — dort fragt man ihn, BEVOR man anfängt.
   *
   * Der Befund-Zusatz fehlt hier bewusst: er hängt schon am Zähler
   * (`railCounter`), und der steht seit dieser Runde auch am offenen Kapitel.
   */
  function railRemaining(stepKey: BrandStepKey): string {
    return t('brand.session.minutes', {
      minutes: chapterRemainingMinutes(stepKey, navSessions.value),
    })
  }

  /**
   * DIE ZÄHL-ZEILE EINES KAPITELS — bestätigte PFLICHT-Sessions, optionale
   * getrennt (Testlauf-Befund L, 2026-09-09).
   *
   * Vorher stand hier der Nenner „alle Sessions" (`slotsForStep(...).length`) und
   * im Notizblock daneben der Nenner „bestätigbare Pflicht-Sessions": „Werte 0
   * von 9 bestätigt" gegen „0/8 + 1 optional". Beide Zeilen lesen jetzt dieselbe
   * Rechnung (`countChapterSessions` bzw. `brandStepCompletion`) und hängen die
   * optionalen als Anhängsel an — mit demselben Wortlaut wie der Notizblock.
   */
  function railCounter(entry: BrandJourneyStep, current: boolean): string {
    const suffix = railFindingSuffix(entry.stepKey)
    const optional = slotsForStep(entry.stepKey).filter(slot => !slot.required).length
    if (current) {
      const counts = countChapterSessions(entry.stepKey, navSessions.value)
      // Als LITERAL und nicht als Objekt weitergereicht: `t()` verlangt einen
      // Index-Signatur-Typ, ein Interface hat keine.
      const values = {
        confirmed: counts.confirmed,
        total: counts.total,
        stale: counts.stale,
        optional: counts.optional,
      }
      if (counts.stale > 0) return t('brand.nav.chapterCountStale', values) + suffix
      return t(
        counts.optional > 0 ? 'brand.nav.chapterCountOptional' : 'brand.nav.chapterCount',
        values,
      ) + suffix
    }
    const values = {
      confirmed: entry.progress.requiredTotal - entry.missingRequired.length,
      total: entry.progress.requiredTotal,
      optional,
    }
    return t(
      optional > 0 ? 'brand.nav.chapterCountOptional' : 'brand.nav.chapterCount',
      values,
    ) + suffix
  }

  /**
   * „EUER BRANDING" — DER LETZTE EINTRAG DER LEISTE (BW2 Paket 7, §10/§11).
   *
   * Er steht UNTER den Kapiteln, hinter `result`, und ist IMMER klickbar: Lesen
   * ist immer erlaubt, und ein Dokument, das erst am Ende aufginge, sähe niemand
   * wachsen. Er trägt seine eigene ADRESSE (`to`) statt eines `select` — die
   * Sidebar navigiert dann selbst, und der Autosave spült trotzdem aus, weil der
   * Sprung den Route-Record wechselt (`onBeforeRouteLeave`, s. `useBrandAutosave`).
   *
   * Sein Zähler nennt nur, was es zu zählen gibt: offene Befunde über ALLE
   * Kapitel. Eine Zeile „0 Befunde offen" wäre eine Beruhigung, nach der niemand
   * gefragt hat.
   */
  const openFindingsTotal = computed(
    () => store.findings.filter(finding => finding.status === 'open').length,
  )

  function railDocumentStep(): BwRailStep {
    return {
      id: 'document',
      label: t('brand.nav.document'),
      icon: '',
      state: 'open',
      kind: 'document',
      to: localePath(`/brand/${profileId.value}/document`),
      ...(openFindingsTotal.value > 0
        ? {
            counter: t(
              'brand.finding.openCount',
              { count: openFindingsTotal.value },
              openFindingsTotal.value,
            ),
          }
        : {}),
    }
  }

  /**
   * DIE ZUSATZ-EINTRÄGE (MV1 M4) — angemeldet von fremden Layern über
   * `pukalani.brand.workspaceNavExtras`, gerechnet an EINER Stelle. Ohne einen
   * solchen Layer ist die Liste leer und die Leiste sieht aus wie vorher.
   */
  const navExtras = useBrandWorkspaceNavExtras({
    profileId,
    findings: () => store.findings,
  })

  /** Der Einstieg in die Brand Foundation — s. Composable (Paket G2). */
  const foundationStep = useBrandFoundationRailStep({ profileId })

  const railLayers = computed<BwRailLayer[]>(() => [{
    id: 'foundation',
    label: t('brand.workspace.railLayer'),
    steps: [
      // ALLE Kapitel, „Ergebnis" eingeschlossen (Testlauf-Befund 8, 2026-09-09):
      // es hat echte Sessions (`result.direction` als Pflicht, `result.rating`
      // optional), Notizblock und Balken zählen es — eine Leiste ohne seine Zeile
      // machte es unerreichbar. Die LESEANSICHT steht weiterhin unten als „Brand
      // Foundation" (Konzept §6 d), nach dem Dokument (§2.6), mit eigener Id.
      ...store.railSteps.map((entry): BwRailStep => {
        const current = entry.stepKey === stepKey.value
        return {
          id: entry.stepKey,
          label: t(`brand.steps.${entry.stepKey}`),
          icon: '',
          state: current && entry.state !== 'done' ? 'active' : railState(entry.state),
          info: railInfo(entry),
          counter: railCounter(entry, current),
          // Die Unterpunkte und der Umfang gehören dem OFFENEN Kapitel: „nur das
          // aktive aufgeklappt" (§11) ist damit eine Aussage über die Daten und
          // keine zweite Regel in der Leiste.
          ...(current
            ? {
                sessions: railSessions(entry),
                effort: railRemaining(entry.stepKey),
              }
            : {}),
        }
      }),
      railDocumentStep(),
      // Die Leseansicht desselben Dokuments (Paket G2) — gebaut an EINER Stelle,
      // damit sie hier, im Dokument und in ihr selbst dieselbe bleibt.
      foundationStep.value,
      // Zusatz-Einträge fremder Layer (MV1 M4) — heute „Markt". Sie stehen
      // NACH dem Dokument: das Dokument ist der Abschluss der Foundation, ein
      // Zusatzprodukt kommt danach.
      ...navExtras.value,
    ],
  }, designRailLayer.value, kitRailLayer.value])

  /**
   * DER ZWEITE LAYER: BRAND DESIGN (Konzept §2.1/§2.10, Paket D1, Prototyp
   * `demoRail.ts` + `demoRailWithDesign`).
   *
   * ── ER STEHT BEI JEDER MARKE DA ──────────────────────────────────────────
   * Auch bei einer, die ihn nicht hat. Gesperrt ist er dann mit Erklär-Text und
   * Info-Layer — genau das abgenommene Verhalten des Prototyps: eine Schicht,
   * die nicht existiert, kann man nicht wollen, und die Auskunft „das gibt es,
   * so kommt ihr dran" ist die halbe Produktseite. `store.designOpen` fragt die
   * JOURNEY (Freischaltung UND `result` fertig), nicht das Profil-Feld allein.
   *
   * ── ZWEI FORTSCHRITTE, WEIL ES ZWEI PRODUKTE SIND ────────────────────────
   * `note` trägt „N von 6 Kapiteln" — der eigene Stand der Schicht. Der grosse
   * Balken unten rechts (`overallProgress`) bleibt die FOUNDATION; die
   * Begründung steht bei `resolveProfileProgress` und im Store.
   *
   * ── DER ERGEBNIS-PUNKT HAT SEINE EIGENE ANSICHT (D8) ─────────────────────
   * „Visuelle Identität" führt auf `/brand/:id/design` — das Ergebnis-Board als
   * eigene Seite (§2.8). Die Adresse steht IMMER da, auch solange die sechs
   * Kapitel nicht fertig sind: die Seite zeigt dann den Stand („x von 6") statt
   * eines 404. Der Punkt selbst wird trotzdem erst bei `done` freigegeben
   * (`BwProgressRail` rendert ihn als Knopf) — die Seite ist der Weg dorthin,
   * nicht die Belohnung dafür.
   */
  const designRailLayer = computed<BwRailLayer>(() => {
    const doneCount = store.designSteps.filter(entry => entry.state === 'done').length
    const info: BwRailStepInfo = {
      description: t('brand.designLayer.info'),
      minutes: t('brand.session.minutes', {
        minutes: store.designSteps.reduce((sum, entry) => sum + chapterEffortMinutes(entry.stepKey), 0),
      }),
      bausteine: store.designSteps.map(entry => ({
        label: t(`brand.steps.${entry.stepKey}`),
        note: t(`brand.stepInfo.${entry.stepKey}`),
      })),
    }

    if (!store.designOpen) {
      return {
        id: 'design',
        label: t('brand.designLayer.label'),
        locked: true,
        lockedNote: t('brand.designLayer.lockedNote'),
        info,
        // Die Punkte stehen auch gesperrt komplett da (Runde 85, David): mit
        // Schloss im Status-Kreis statt versteckter Liste.
        steps: store.designSteps.map((entry): BwRailStep => ({
          id: entry.stepKey,
          label: t(`brand.steps.${entry.stepKey}`),
          icon: '',
          state: 'locked',
          info: railInfo(entry),
        })),
      }
    }

    return {
      id: 'design',
      label: t('brand.designLayer.label'),
      note: t('brand.designLayer.progress', { done: doneCount, total: store.designSteps.length }),
      info,
      steps: [
        ...store.designSteps.map((entry): BwRailStep => {
          const current = entry.stepKey === stepKey.value
          return {
            id: entry.stepKey,
            label: t(`brand.steps.${entry.stepKey}`),
            icon: '',
            state: current && entry.state !== 'done' ? 'active' : railState(entry.state),
            info: railInfo(entry),
            counter: railCounter(entry, current),
            ...(canEnterStep(entry) ? { to: localePath(`/brand/${profileId.value}/${entry.stepKey}`) } : {}),
            // Dieselbe Regel wie in der Foundation: die Unterpunkte gehören dem
            // OFFENEN Kapitel.
            ...(current
              ? {
                  sessions: railSessions(entry),
                  effort: railRemaining(entry.stepKey),
                }
              : {}),
          }
        }),
        {
          id: 'design-result',
          kind: 'result',
          label: t('brand.designLayer.result'),
          icon: '',
          state: doneCount === store.designSteps.length ? 'done' : 'open',
          to: localePath(`/brand/${profileId.value}/design`),
        },
      ],
    }
  })

  /**
   * WELCHE SCHICHT STEHT ÜBER DEM KAPITEL-NAMEN? — drei Produkte, drei Namen
   * (K0; bis dahin waren es zwei).
   *
   * Sie steht als Rechnung und nicht als verschachtelter Ausdruck im Markup: mit
   * der dritten Schicht wäre das dort ein zweifach geschachtelter Bedingungs-
   * Ausdruck in einer Zeile, die ohnehin schon 200 Zeichen lang ist.
   */
  const currentLayerLabelKey = computed(() => {
    if (stepKey.value && isBrandKitStep(stepKey.value)) return 'brand.kitLayer.label'
    if (stepKey.value && isBrandDesignStep(stepKey.value)) return 'brand.designLayer.label'
    return 'brand.workspace.railLayer'
  })

  /**
   * DER DRITTE LAYER: BRAND BOOK & KIT (Konzept docs/plans/BRAND-BOOK-KIT.md
   * §2.7, Paket K0, Prototyp `demoRail.ts` Layer `book` + `demoRailWithKit`).
   *
   * ── K0 BAUT NUR DIE SCHRANKE ─────────────────────────────────────────────
   * Er steht bei jeder Marke da, und heute steht er bei JEDER Marke GESPERRT:
   * die Freischaltung („Ableitung") gibt es erst mit K1, die drei Kapitel
   * bekommen ihre Seiten mit K5 und die Lieferseite „Kit" mit K6. Der gesperrte
   * Zustand ist trotzdem schon der richtige — eine Schicht, die man nicht sieht,
   * kann man nicht wollen, und die Auskunft „das gibt es, so kommt ihr dran" ist
   * die halbe Produktseite (dieselbe Begründung wie bei Brand Design D1).
   *
   * Der offene Zweig ist deshalb bewusst NICHT vorweggenommen: er hätte heute
   * keine Adresse, auf die er zeigen könnte, und ein Punkt ohne Ziel ist die
   * Sorte Vorschuss, die niemand einlöst.
   *
   * ── DIE COPY IST DIE DES PROTOTYPS ───────────────────────────────────────
   * Kein „Templates", kein „Strategy Playbook" (die gehören zu Produkt 04,
   * §2.16): Brand Book · Kit & Brand Context · Pressekit. Der Sperrsatz ist
   * „Teil der Ableitung" (§2.7) und nicht „baut auf eurer Foundation auf" — das
   * ist der Satz von Schicht 2 und hier schlicht falsch.
   */
  const kitRailLayer = computed<BwRailLayer>(() => {
    /**
     * ÜBERSPRUNGENE KAPITEL ZÄHLEN NICHT MIT (K1): `nomenclature` läuft nur auf
     * dem B2-Weg (§2.20 Nr. 4). Auf einer Solo-Marke stünde sonst dauerhaft „0
     * von 3" mit einem Punkt, den niemand öffnen kann. Der Filter fragt den
     * ZUSTAND und nicht die Weiche selbst — die Rechnung dazu steht in der
     * Journey, hier steht nur ihr Ergebnis (dieselbe Regel wie bei `railSteps`).
     */
    const onPath = store.kitSteps.filter(entry => entry.state !== 'skipped')
    const doneCount = onPath.filter(entry => entry.state === 'done').length
    const info: BwRailStepInfo = {
      description: t('brand.kitLayer.info'),
      minutes: t('brand.session.minutes', {
        minutes: store.kitSteps.reduce((sum, entry) => sum + chapterEffortMinutes(entry.stepKey), 0),
      }),
      bausteine: store.kitSteps.map(entry => ({
        label: t(`brand.steps.${entry.stepKey}`),
        note: t(`brand.stepInfo.${entry.stepKey}`),
      })),
    }

    if (!store.kitOpen) {
      return {
        id: 'kit',
        label: t('brand.kitLayer.label'),
        locked: true,
        lockedNote: t('brand.kitLayer.lockedNote'),
        info,
        // Die Punkte stehen auch gesperrt komplett da (Runde 85, David) — mit
        // Schloss im Status-Kreis statt versteckter Liste. Hier ALLE drei: was
        // es gibt, soll man sehen, auch das Kapitel, das die eigene Weiche
        // später überspringt.
        steps: store.kitSteps.map((entry): BwRailStep => ({
          id: entry.stepKey,
          label: t(`brand.steps.${entry.stepKey}`),
          icon: '',
          state: 'locked',
          info: railInfo(entry),
        })),
      }
    }

    return {
      id: 'kit',
      label: t('brand.kitLayer.label'),
      note: t('brand.kitLayer.progress', { done: doneCount, total: onPath.length }),
      info,
      steps: onPath.map((entry): BwRailStep => {
        const current = entry.stepKey === stepKey.value
        return {
          id: entry.stepKey,
          label: t(`brand.steps.${entry.stepKey}`),
          icon: '',
          state: current && entry.state !== 'done' ? 'active' : railState(entry.state),
          info: railInfo(entry),
          counter: railCounter(entry, current),
          ...(canEnterStep(entry) ? { to: localePath(`/brand/${profileId.value}/${entry.stepKey}`) } : {}),
          // Dieselbe Regel wie in Foundation und Schicht 2: die Unterpunkte
          // gehören dem OFFENEN Kapitel.
          ...(current
            ? {
                sessions: railSessions(entry),
                effort: railRemaining(entry.stepKey),
              }
            : {}),
        }
      }).concat([
        /*
         * DER ERGEBNIS-PUNKT „KIT" (K6) — die Lieferseite `/brand/:id/kit`.
         *
         * Er ist KEIN Baustein der Registry: er steht in keiner Journey, in
         * keinem Fortschritts-Nenner und in keiner Abnahme. Er ist ein LINK am
         * Ende der Schicht, genau wie `design-result` am Ende von Schicht 2 —
         * deshalb liest ihn auch keiner der vier Registry-Leser (Rail, Dokument,
         * Leseansicht, Fortschritts-Cache) als Kapitel.
         *
         * `done`, sobald alle Kapitel DIESES Weges stehen: dann ist das Kit
         * vollständig, was es zu holen gibt. Vorher `open` — die Dateien gibt es
         * trotzdem schon, nur eben mit weniger darin.
         */
        {
          id: 'kit-result',
          kind: 'result',
          label: t('brand.kitLayer.result'),
          icon: '',
          state: doneCount === onPath.length && onPath.length > 0 ? 'done' : 'open',
          to: localePath(`/brand/${profileId.value}/kit`),
        },
      ]),
    }
  })

  /** Ein Kapitel ist anklickbar, sobald die pure Regel den Eintritt erlaubt. */
  function canEnterStep(entry: BrandJourneyStep): boolean {
    return store.canEnter(entry.stepKey)
  }

  /** Die Marken des Kontos für den Wähler oben in der Sidebar. */
  const LOCALE_FLAGS: Record<string, string> = { en: 'i-circle-flags-us', de: 'i-circle-flags-de' }

  const sidebarBrands = computed<BwSidebarBrand[]>(() => store.profiles.map(profile => ({
    id: profile.id,
    title: profile.title || t('brand.brands.card.untitled'),
    path: t(`brand.brands.card.path.${profile.pathKind}`),
    flag: LOCALE_FLAGS[profile.contentLocale],
    to: localePath(`/brand/${profile.id}/${profile.currentStepKey}`),
    current: profile.id === profileId.value,
  })))

  /**
   * DER GESAMT-FORTSCHRITT unten rechts. Er zählt über ALLE Bausteine auf dem
   * Weg; für den OFFENEN nimmt er den LIVE-Stand (aus denselben Slot-Tatsachen
   * wie die Bühne), für die anderen den der Journey. Der Server-Cache
   * `profile.progressPct` bewegt sich erst beim Speichern — hier soll sich der
   * Balken mit der Arbeit bewegen.
   *
   * ── EINE ZÄHLWEISE: BESTÄTIGTE PFLICHTFELDER (Testlauf-Befund L) ─────────
   * Bis hierher zählte der Fuss BEFÜLLTE Felder (`stepProgress` — Entwurf ODER
   * Bestätigung), Leiste und Notizblock daneben BESTÄTIGTE. Im Live-Test stand
   * unten „10 % · 6/59" über einem Notizblock mit „3/10 bestätigt": drei Zahlen
   * über denselben Stand, von denen zwei etwas anderes meinten. Gezählt wird
   * jetzt überall dasselbe — bestätigte Pflichtfelder, optionale getrennt
   * daneben (`optional`, s. `brand.workspace.log.confirmedOfOptional`).
   */
  const overallProgress = computed(() => {
    let total = 0
    let confirmed = 0
    let optional = 0
    for (const entry of store.railSteps) {
      optional += slotsForStep(entry.stepKey).filter(slot => !slot.required).length
      if (entry.stepKey === stepKey.value) {
        const live = brandStepCompletion(entry.stepKey, serverSlotFacts.value)
        total += live.total
        confirmed += live.confirmed
        continue
      }
      total += entry.progress.requiredTotal
      // `missingRequired` ist genau die Gegenmenge (bestätigbare Pflicht-Slots
      // ohne Bestätigung) — dieselbe Rechnung wie `brandStepCompletion`.
      confirmed += entry.progress.requiredTotal - entry.missingRequired.length
    }
    return {
      total,
      confirmed,
      optional,
      pct: total === 0 ? 100 : Math.round((confirmed / total) * 100),
    }
  })

  /** „6/59 bestätigt" — und, wo es welche gibt, „+ 12 optional" (Befund L). */
  const overallProgressCount = computed(() => t(
    overallProgress.value.optional > 0
      ? 'brand.workspace.log.confirmedOfOptional'
      : 'brand.workspace.log.confirmedOf',
    {
      confirmed: overallProgress.value.confirmed,
      total: overallProgress.value.total,
      optional: overallProgress.value.optional,
    },
  ))

  /** Grobe Restzeit — dieselbe Zahl wie auf der Übersicht (Interaktionsbilanz). */
  const TOTAL_MINUTES = 45
  const remainingTime = computed(() => t('brand.brands.card.remaining', {
    minutes: Math.max(1, Math.round(((100 - overallProgress.value.pct) / 100) * TOTAL_MINUTES)),
  }))

  /** `BwWorkspace` zeigt nur ABWEICHUNGEN — Stille heisst gespeichert (§3e). */
  const workspaceSync = computed<'saving' | 'offline' | 'conflict' | 'error' | null>(
    () => (store.syncState === 'saved' ? null : store.syncState),
  )
  const workspaceSyncLabel = computed(() =>
    (store.syncState === 'saved' ? undefined : t(`brand.workspace.sync.${store.syncState}`)))

  return {
    railLayers,
    currentLayerLabelKey,
    sidebarBrands,
    overallProgress,
    overallProgressCount,
    remainingTime,
    workspaceSync,
    workspaceSyncLabel,
  }
}
