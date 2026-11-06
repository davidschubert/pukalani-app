import type { MaybeRefOrGetter } from 'vue'
import { useBrandWorkspaceStore, brandErrorReason } from '../stores/brandWorkspace'
import type { BrandStepDetailResponse, BrandStepSaveResponse } from '../../shared/types/brand'

/**
 * DER AUTOSAVE-TAKT (Plan §3e „Autosave-Client-Regel", wörtlich):
 * ~750 ms nach der letzten Änderung, ZUSÄTZLICH bei Blur und VOR interner
 * Navigation · nur GEÄNDERTE Slots · der Request trägt die GELESENE
 * `revision` · die Antwort setzt neue `revision` + normalisierte Slots · bei
 * 409 wird NIE überschrieben · bei Verbindungsverlust bleibt die Eingabe im
 * offenen Tab und wird nach Wiederverbindung erneut gespeichert.
 *
 * Die RECHNUNG dahinter liegt in `shared/brandAutosaveDiff.ts` (pure,
 * getestet); hier steht nur die Zeitsteuerung und der Transport.
 *
 * ── DER 409 TRÄGT SEINE DATEN NICHT MIT (Befund P1c) ──────────────────────
 * Die PATCH-Route legt der Ablehnung `{ code, revision, slots }` bei, und
 * `BrandStepConflictData` beschreibt genau das. Beim CLIENT kommt davon nichts
 * an: der zentrale Fehler-Handler (`packages/core/server/error.ts`) hebt
 * AUSSCHLIESSLICH `data.code` als `reason` ins Envelope und lässt die restliche
 * `data` bewusst draußen (keine Appwrite-Details). Deshalb holt dieser Code die
 * Serverfassung mit EINEM zusätzlichen GET nach, statt sie aus dem Fehler zu
 * lesen. Das kostet einen Roundtrip im seltensten Fall und ist die einzige
 * Variante, die ohne Eingriff in den Core auskommt; die Alternative wäre, den
 * Konflikt als 200 mit Sonder-Rumpf zu beantworten — dann wäre eine Ablehnung
 * keine Ablehnung mehr.
 *
 * ── EIN LAUF ZUR ZEIT — UND `await flush()` HEISST „DRAUSSEN" ─────────────
 * Zwei gleichzeitige PATCH desselben Bausteins erzeugten einen 409 GEGEN SICH
 * SELBST (der zweite trägt die `revision` von vor dem ersten). Läuft schon
 * einer, wartet der nächste ihn AB und holt danach nach, was übrig ist.
 *
 * Bis zum Kailua-Lauf merkte er sich den zweiten nur (`rerun`) und kehrte
 * SOFORT um — `await autosave.flush()` war damit an allen zwölf Aufrufstellen
 * eine Lüge: „Bestätigen" (`setSlotConfirmed` + `flush`), „erst speichern, dann
 * reden" und jeder Kapitelwechsel liefen weiter, während die Eingabe noch im
 * Store lag. Der nachgeholte Lauf kam dann 750 ms später — mitten in einen
 * Gesprächszug hinein, der inzwischen die `revision` gedreht hatte.
 */

/** §3e: „Autosave ~750 ms nach letzter Änderung". */
export const BRAND_AUTOSAVE_DELAY_MS = 750

export function useBrandAutosave(profileId: MaybeRefOrGetter<string>) {
  const store = useBrandWorkspaceStore()

  let timer: ReturnType<typeof setTimeout> | undefined
  /** Der LAUFENDE Speichervorgang — `flush()` wartet ihn ab (s. Kopf). */
  let inflight: Promise<void> | null = null
  /**
   * WIE OFT EIN 409 SCHON STILL AUFGELÖST WURDE (Kailua-Befund 2).
   *
   * Ein stiller Konflikt endet mit „nochmal senden". Dreht die `revision` auf
   * dem Server jedes Mal aufs Neue (zwei Tabs, ein hängender Gesprächszug),
   * liefe das für immer — also gilt ab dem vierten Anlauf wieder der Dialog.
   * Der Zähler fällt bei jedem geglückten Speichern.
   */
  let silentConflicts = 0
  /**
   * WIE OFT DER LETZTE VERSUCH SCHEITERTE (2026-09-03, Davids Live-Fund):
   * der `error`-Zustand SAGTE „wir versuchen es erneut", aber nichts
   * versuchte es — nur das `online`-Ereignis und weiteres Tippen. Ein PATCH,
   * der in einen Deploy-Reload läuft (502 von nginx, während pm2 die App
   * neu lädt), blieb damit für immer als „Nicht gespeichert" stehen, obwohl
   * der Server zwei Sekunden später wieder da war. Jetzt gilt der Text:
   * Wiederholung mit Backoff (4 s verdoppelnd, Deckel 60 s) — die Eingabe
   * liegt ja weiter in `pendingSlots`, ein Versuch kostet einen Request.
   */
  let errorRetries = 0

  function cancel(): void {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  /** Nach dem Tippen: entprellt. */
  function schedule(): void {
    if (import.meta.server) return
    cancel()
    timer = setTimeout(() => { void flush() }, BRAND_AUTOSAVE_DELAY_MS)
  }

  /**
   * @returns `true`, wenn der Konflikt still aufgelöst wurde und die eigene
   * Eingabe erneut gesendet werden darf (s. `store.applyConflict`).
   */
  async function loadConflictVersion(id: string): Promise<boolean> {
    if (!store.stepKey) return false
    silentConflicts += 1
    const force = silentConflicts > 3
    try {
      const detail = await $fetch<BrandStepDetailResponse>(
        `/api/brand/profiles/${id}/steps/${store.stepKey}`,
      )
      return store.applyConflict({ revision: detail.revision, slots: detail.slots }, force)
    }
    catch {
      // Die Serverfassung ist nicht lesbar — der Konflikt gilt trotzdem, und
      // zwar mit dem, was wir haben. Alles andere hiesse: nach einem
      // gescheiterten Nachschlag doch überschreiben. Und weil wir hier nichts
      // Neues wissen, ist ein stilles Wiedersenden ausgeschlossen: es liefe mit
      // derselben `revision` in denselben 409.
      store.applyConflict({ revision: store.revision, slots: store.serverSlots }, true)
      return false
    }
  }

  function isOffline(): boolean {
    return typeof navigator !== 'undefined' && navigator.onLine === false
  }

  /**
   * Sofort speichern (Blur, Navigation, Bestätigen) — und ZURÜCKKEHREN, wenn
   * wirklich nichts mehr offen ist (s. Kopf „ein Lauf zur Zeit").
   */
  async function flush(): Promise<void> {
    cancel()
    if (import.meta.server) return

    // Läuft schon einer: abwarten. Danach kann alles erledigt sein (der Lauf
    // hat unsere Änderung mitgenommen) — sonst wird nachgelegt. Der Deckel
    // schützt vor einem Ping-Pong zweier Aufrufer; was dann noch offen ist,
    // holt der nächste Tick.
    for (let waited = 0; inflight && waited < 3; waited += 1) {
      await inflight.catch(() => {})
      if (!store.hasPendingWork) return
    }
    if (inflight) return
    if (!store.stepKey || !store.autosaveAllowed || !store.hasPendingWork) return

    const run = save()
    inflight = run
    try {
      await run
    }
    finally {
      if (inflight === run) inflight = null
    }
  }

  async function save(): Promise<void> {
    const id = toValue(profileId)
    // Der ABGESCHICKTE Wert wird festgehalten: die Antwort trägt keine
    // Konfidenz, und nur wer weiss, was er gesendet hat, kann sie hinterher
    // als gespeichert verbuchen (s. `applySaveResponse`).
    const sentConfidence = store.pendingConfidence
    const body = {
      // Die GELESENE Fassung — nicht die, die gerade entsteht.
      revision: store.revision,
      slots: store.pendingSlots,
      ...(sentConfidence ? { confidence: sentConfidence } : {}),
      // DIE ANGENOMMENE HÜLLE EINER KORREKTUR (§9, Paket 6). Sie reist nur
      // mit, wenn der Mensch sie eben angenommen hat; ohne sie weist der
      // Server das Aufheben einer Bestätigung mit bestätigten Abhängigen ab.
      ...(store.pendingImpactAck ? { impactAck: store.pendingImpactAck } : {}),
    }

    store.mark('start')
    try {
      const response = await $fetch<BrandStepSaveResponse>(
        `/api/brand/profiles/${id}/steps/${store.stepKey}`,
        { method: 'PATCH', body },
      )
      store.applySaveResponse(response, sentConfidence)
      errorRetries = 0
      silentConflicts = 0
      /**
       * EINE BESTÄTIGUNG BEWEGT DIE SESSION-ZUSTÄNDE (Davids Klick-Test
       * 2026-09-09): die PATCH-Antwort trägt Slots und `revision`, aber nicht,
       * welche Session damit `done` wurde und welche abhängige sich geöffnet
       * hat — das rechnet der Server (`resolveSessionStates`) und liefert es
       * nur im vollen Abruf. Ohne diesen Nachzug blieb der Gründungsimpuls in
       * der Leiste links „offen", während er rechts längst den Haken trug.
       * Nachgeladen wird nur, wenn der Rumpf eine Bestätigung enthielt — ein
       * Tastendruck im Text löst keinen zweiten Abruf aus. `refreshStep` lässt
       * das Gespräch und die offene Eingabe stehen (Kopf im Store).
       */
      if (store.stepKey && Object.values(body.slots).some(patch => patch.confirmed !== undefined)) {
        void store.refreshStep(id, store.stepKey)
      }
    }
    catch (error) {
      const status = (error as { status?: number, statusCode?: number }).status
        ?? (error as { statusCode?: number }).statusCode
        ?? null
      const reason = brandErrorReason(error)
      if (reason === 'slot_confirmed') {
        // BACKSTOP, kein Konflikt: die Werkstatt lässt an einem bestätigten
        // Slot gar nicht erst tippen (`brandSlotControls`). Kommt es doch dazu
        // — ein zweiter Tab hat inzwischen bestätigt —, wäre ein
        // Wiederholungsversuch ewig: der Server sagt endgültig Nein, und der
        // 409-Dialog fragte nach einer Entscheidung, die es nicht gibt. Also
        // die Serverfassung holen; sie IST die bestätigte Wahrheit, und der
        // Slot steht danach sichtbar im bestätigten Zustand.
        if (store.stepKey) await store.loadStep(id, store.stepKey)
      }
      else if (reason === 'impact_unacknowledged') {
        /**
         * DIE KORREKTUR BRAUCHT EINE ZUSTIMMUNG (§9) — oder die alte passt
         * nicht mehr.
         *
         * Der Fall tritt in zwei Formen auf: die Oberfläche hat die Hülle nie
         * gezeigt (alter Client, zweiter Tab), oder sie hat sich seit dem
         * Zeigen bewegt. Beide Male ist die Antwort dieselbe: die lokale
         * Aufhebung fällt (sonst hämmerte der nächste Tick denselben 409),
         * und die SEITE zeigt den Layer erneut — sie sieht es an
         * `correctionRejected` und holt die neue Hülle mit einem GET nach. Die
         * `data` des 409 trägt sie nicht mit (nur `data.code` wird zu
         * `reason`), s. Kopf.
         */
        store.setImpactAck('')
        store.rejectCorrection()
        // Nichts mehr offen heisst gespeichert — sonst bliebe „Speichert…"
        // stehen, während in Wahrheit gerade ein Dialog auf eine Antwort
        // wartet.
        if (!store.hasPendingWork) store.mark('ok')
      }
      else if (reason === 'invariant_violated') {
        /**
         * EINE DETERMINISTISCHE REGEL DES FELDES IST GERISSEN (§3a Nr. 6).
         *
         * Der Text bleibt stehen, die BESTÄTIGUNG fällt — und weil damit ein
         * anderer Rumpf entsteht (ohne `confirmed: true`), darf sofort noch
         * einmal gespeichert werden: der Mensch soll seine Eingabe nicht
         * verlieren, nur weil sie noch nicht bestätigungsreif ist. Ein
         * Wiederholungsversuch mit UNVERÄNDERTEM Rumpf wäre dagegen eine
         * Endlosschleife (s. der 400-Zweig unten).
         */
        store.rejectInvariantConfirmations()
        if (store.hasPendingWork) schedule()
        else store.mark('ok')
      }
      else if (reason === 'slot_empty') {
        /**
         * BESTÄTIGEN OHNE WERT (Befund 9) — dieselbe Bewegung wie bei
         * `invariant_violated`: die ABSICHT fällt, der Text bleibt.
         *
         * Die Bühne lässt diesen Klick gar nicht erst zu (`confirmEnabled`);
         * hierher kommt nur, wer den Stand aus einem zweiten Tab überholt hat
         * oder ein Feld leer räumt, während die Bestätigung noch unterwegs ist.
         * OHNE diesen Zweig fiele der 400 in den Sammel-Ausgang unten: dort
         * wird nicht wiederholt (richtig — der Rumpf ist derselbe), der
         * Zustand bliebe aber auf „Nicht gespeichert" stehen, und niemand
         * erführe, woran es lag. Die SEITE sagt es als Toast (s. dort).
         */
        store.rejectEmptyConfirmations()
        if (store.hasPendingWork) schedule()
        else store.mark('ok')
      }
      else if (status === 409 || reason === 'revision_conflict') {
        // STILL AUFGELÖST heisst: die neue Fassung ist übernommen, die eigene
        // Eingabe steht noch — sie muss jetzt raus. Ohne dieses Nachlegen
        // bliebe sie liegen, bis jemand wieder tippt (Kailua-Befund 2/3).
        if (await loadConflictVersion(id)) schedule()
      }
      else if (status === null || isOffline()) {
        // Kein HTTP-Status heisst: die Anfrage hat den Server nie erreicht.
        // Die Eingabe bleibt stehen, der `online`-Horcher holt sie nach.
        store.mark('offline')
      }
      else {
        store.mark('error')
        // s. `errorRetries` — der Zustandstext verspricht die Wiederholung.
        // ABER: nur, was vorbeigehen KANN, wird wiederholt (5xx, 429). Ein
        // 400 ist ein endgültiges Nein zur GLEICHEN Eingabe — die Schleife
        // hämmerte sonst für immer denselben Fehler (live erwischt beim
        // step_locked-Befund, Davids Durchspiel-Audit 2026-09-03); dort
        // bleibt der Fehlerzustand stehen, bis Tippen oder `online` einen
        // NEUEN Versuch mit neuem Inhalt auslösen.
        if (status === 429 || (status !== null && status >= 500)) {
          errorRetries += 1
          cancel()
          timer = setTimeout(() => { void flush() }, Math.min(4_000 * 2 ** (errorRetries - 1), 60_000))
        }
        else {
          /**
           * ENDGÜLTIG VERWORFEN (Kailua-Befund 3) — und deshalb wird es GESAGT.
           *
           * Hier landet jedes Nein, das nicht wiederkommt: ein 400 mit
           * unbekanntem Grund, ein 403 (`step_locked`), ein 413. Bis hierher
           * blieb die Bestätigungs-ABSICHT im Store stehen — der Zähler zeigte
           * sie weiter als bestätigt, obwohl der Server nichts davon hatte
           * (10/10 auf dem Schirm, 1/10 in der Datenbank). Jetzt fällt sie, und
           * die SEITE macht aus dem Grund einen Satz.
           */
          store.rejectSave(reason ?? `http_${status}`)
        }
      }
    }
  }

  function onOnline(): void {
    if (store.syncState === 'offline' || store.syncState === 'error') void flush()
  }

  if (import.meta.client) {
    onMounted(() => window.addEventListener('online', onOnline))
    onBeforeUnmount(() => {
      window.removeEventListener('online', onOnline)
      cancel()
    })
    // §3e „vor interner Navigation": der Wechsel des Bausteins passiert im
    // selben Tab und würde die offene Eingabe sonst mitnehmen.
    onBeforeRouteLeave(async () => {
      await flush()
    })
  }

  return { schedule, flush, cancel }
}
