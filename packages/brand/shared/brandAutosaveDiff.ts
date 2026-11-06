/**
 * DIE RECHNUNG HINTER DEM AUTOSAVE — was ist geändert, was ist ein No-op, und
 * wie bewegt sich der sichtbare Zustand (Plan §3e „Autosave-Client-Regel").
 *
 * PURE, ohne Nuxt und ohne `$fetch` — dasselbe Muster wie `brandJourney.ts`:
 * die Regel liegt in `shared/`, der Store und das Composable legen nur den
 * Transport darum. So ist sie ohne laufenden Server prüfbar, und die Fälle, die
 * im Browser Minuten kosten (zwei Tabs, Verbindungsabbruch, ein 409 mitten im
 * Tippen), sind hier drei Zeilen Test.
 *
 * ── NUR GEÄNDERTE SLOTS GEHEN RAUS ────────────────────────────────────────
 * §3e sagt es wörtlich. Der Grund ist nicht Sparsamkeit, sondern die
 * No-op-Regel der PATCH-Route: ein Rumpf, der jeden Slot mitschickt, sähe für
 * den Server nach Arbeit aus, erhöhte `revision` bei jedem Tick — und die
 * 409-Erkennung würde zum Zufallsgenerator, weil ein zweiter offener Tab dann
 * IMMER eine veraltete Fassung hätte. `diffBrandSlots` ist deshalb die Stelle,
 * an der „nichts getippt" auch wirklich „nichts gesendet" heisst.
 *
 * ── DER ANGEZEIGTE WERT IST NICHT `confirmed` ─────────────────────────────
 * Ein Slot trägt drei Fassungen (Versions-Vertrag, Schema-Anhang §2):
 * `firstDraft` (bleibt für immer stehen), `latestDraft` (jede Eingabe) und
 * `confirmed` (dem der Mensch zugestimmt hat). Der EDITOR zeigt den neuesten
 * Text, also `latestDraft`; `confirmed` ist ein Zustand daneben, kein anderer
 * Text. Wer hier `confirmed` bevorzugte, würde eine Bearbeitung NACH der
 * Bestätigung beim nächsten Laden stillschweigend zurücknehmen.
 *
 * ── EIN KONFLIKT IST KLEBRIG ──────────────────────────────────────────────
 * `nextBrandSyncState` verlässt `conflict` NUR über `resolve`. Das ist die
 * Durchsetzung von „bei 409 NIE automatisch überschreiben": eine verspätete
 * Antwort eines älteren Speicherversuchs (`ok`) darf den Konflikt nicht
 * wegwischen, sonst führe der nächste Tastendruck genau die Überschreibung
 * aus, die der 409 verhindert hat.
 */

import type { BrandSlotView } from './types/brand'

/** Was der Mensch im offenen Tab geändert hat, noch nicht gespeichert. */
export interface BrandLocalSlotEdit {
  /** Neuer Text. `''` ist eine echte Eingabe (leeren), nicht „nichts". */
  value?: string
  /** `true` bestätigen, `false` Bestätigung zurücknehmen. */
  confirmed?: boolean
}

/** Der Rumpf, den `PATCH /api/brand/profiles/:id/steps/:stepKey` erwartet. */
export interface BrandSlotPatch {
  value?: string
  confirmed?: boolean
}

/**
 * Der Text, den der Editor für diesen Slot zeigt. `latestDraft` führt (s. Kopf);
 * `confirmed` steht nur ein, solange es noch keinen Entwurf gab (ein Slot, der
 * ausschliesslich über die Bestätigungs-Route entstand).
 */
export function brandSlotDisplayValue(view: BrandSlotView | undefined): string {
  return view?.latestDraft ?? view?.firstDraft ?? view?.confirmed ?? ''
}

/** Hat der Mensch diesem Slot zugestimmt? (`confirmed` trägt den Text, nicht ein Flag.) */
export function brandSlotIsConfirmed(view: BrandSlotView | undefined): boolean {
  return (view?.confirmed ?? null) !== null
}

/**
 * NIMMT DIESE EINGABE DIE BESTÄTIGUNG? (Testlauf-Befund F, 2026-09-09.)
 *
 * ── DER BEFUND ────────────────────────────────────────────────────────────
 * „Korrigieren" hob die Bestätigung SOFORT auf — beim ÖFFNEN des Editors, per
 * PATCH. Wer danach „Korrigieren beenden" drückte, ohne ein Zeichen zu ändern,
 * stand vor 3 von 10 statt 4 von 10, einer unbestätigten Karte und einer
 * Restzeit von „~2 Min", die es vorher nicht gab. Ein Blick in ein Feld ist
 * keine Änderung.
 *
 * ── DIE REGEL, UND WARUM SIE GENAU SO GESCHNITTEN IST ────────────────────
 * Aufgehoben wird, sobald der Text ein ANDERER ist — nicht früher. Verglichen
 * wird gegen `brandSlotDisplayValue` und NICHT gegen `confirmed`, und das ist
 * kein Detail: `diffBrandSlots` schickt einen `value` genau dann, wenn er von
 * der Anzeige-Fassung abweicht, und die Route weist eine WERT-Änderung an einem
 * bestätigten Slot mit 409 `slot_confirmed` ab, wenn nicht DERSELBE Patch die
 * Bestätigung aufhebt. Beide Rechnungen müssen deshalb dieselbe Schwelle haben
 * — auch bei einem Leerzeichen: sonst gibt es eine Eingabe, die gesendet wird,
 * ohne die Tür zu öffnen.
 */
export function brandEditReleasesConfirm(
  view: BrandSlotView | undefined,
  value: string,
): boolean {
  return brandSlotIsConfirmed(view) && value !== brandSlotDisplayValue(view)
}

/**
 * WAS „VERWERFEN" WIEDERHERSTELLT (Dritter Testlauf, Befund 3, 2026-09-10).
 *
 * ── DER BEFUND ────────────────────────────────────────────────────────────
 * Der Editor hatte genau EINEN Ausgang: „Korrigieren beenden". Der SPEICHERT —
 * jede Eingabe ist über den Autosave längst hinaus, spätestens beim `blur` auf
 * dem Weg zum Knopf. Wer ein bestätigtes Feld aufmachte, zwei Wörter probierte
 * und es sich anders überlegte, hatte keinen Weg zurück: der neue Text stand,
 * und die Bestätigung war mit ihm gefallen. Jetzt stehen zwei Knöpfe da —
 * „Übernehmen" (das bisherige Verhalten) und „Verwerfen".
 *
 * ── DIE REGEL IST EIN VERGLEICH, KEIN UNDO-STAPEL ────────────────────────
 * Verworfen wird gegen die Fassung, die beim ÖFFNEN des Editors galt: Text und
 * Bestätigung. Ein Verlauf einzelner Tastendrücke wäre eine zweite Wahrheit
 * neben dem Autosave — und der hat die Zwischenstände längst weggeschrieben.
 *
 * `changed: false` heisst „es gibt nichts zu tun": kein Schreibvorgang, kein
 * PATCH. Wer nur hineingesehen hat, löst mit dem Verwerfen also KEINE Runde
 * aus — dieselbe Zusage wie bei `brandEditReleasesConfirm` eine Ebene höher.
 *
 * DIE BESTÄTIGUNG KOMMT MIT ZURÜCK, und zwar in demselben Patch wie der Text:
 * `diffBrandSlots` schickt `value` und `confirmed` gemeinsam, und die Route
 * verlangt genau das (eine Wert-Änderung an einem bestätigten Slot ohne
 * begleitendes `confirmed` ist ein 409 `slot_confirmed`).
 */
export interface BrandEditSnapshot {
  value: string
  confirmed: boolean
}

export interface BrandEditRestore extends BrandEditSnapshot {
  /** Ist überhaupt etwas zu tun? `false` ⇒ kein Schreibvorgang, kein Request. */
  changed: boolean
}

export function brandDiscardEdit(
  baseline: BrandEditSnapshot,
  current: BrandEditSnapshot,
): BrandEditRestore {
  return {
    value: baseline.value,
    confirmed: baseline.confirmed,
    changed: baseline.value !== current.value || baseline.confirmed !== current.confirmed,
  }
}

/**
 * DIE GEÄNDERTEN SLOTS — Server-Fassung gegen lokale Eingabe.
 *
 * Ein Slot fällt raus, wenn die lokale Eingabe dem Server entspricht; ein
 * leeres Ergebnis heisst „nicht speichern". Slot-Ids, die der Server (noch)
 * nicht kennt, sind erlaubt: ein neu befüllter Slot hat dort keine Zeile.
 */
export function diffBrandSlots(
  server: Readonly<Record<string, BrandSlotView>>,
  local: Readonly<Record<string, BrandLocalSlotEdit>>,
): Record<string, BrandSlotPatch> {
  const changed: Record<string, BrandSlotPatch> = {}

  for (const [slotId, edit] of Object.entries(local)) {
    const view = server[slotId]
    const patch: BrandSlotPatch = {}

    if (edit.value !== undefined && edit.value !== brandSlotDisplayValue(view)) {
      patch.value = edit.value
    }

    if (edit.confirmed === true) {
      // Bestätigt wird der Text, der nach diesem Speichern gilt — bestätigt der
      // Server bereits genau ihn, ist nichts zu tun. Ohne diesen Vergleich
      // schickte jeder Tick ein `confirmed: true` für längst bestätigte Slots.
      const effective = patch.value ?? brandSlotDisplayValue(view)
      if ((view?.confirmed ?? null) !== effective) patch.confirmed = true
    }
    else if (edit.confirmed === false && brandSlotIsConfirmed(view)) {
      patch.confirmed = false
    }

    // Die Route lehnt einen Patch ohne Feld ab (`emptySlotPatch`) — er darf
    // also gar nicht erst entstehen.
    if (patch.value !== undefined || patch.confirmed !== undefined) changed[slotId] = patch
  }

  return changed
}

/**
 * Lokale Eingaben, die der Server inzwischen so trägt — sie werden nach jeder
 * Antwort verworfen, damit der nächste Tick nicht dieselbe Änderung erneut
 * sendet und ein „gespeichert" nicht sofort wieder zu „ungespeichert" wird.
 */
export function pruneSettledEdits(
  server: Readonly<Record<string, BrandSlotView>>,
  local: Readonly<Record<string, BrandLocalSlotEdit>>,
): Record<string, BrandLocalSlotEdit> {
  const open = diffBrandSlots(server, local)
  const kept: Record<string, BrandLocalSlotEdit> = {}
  for (const slotId of Object.keys(open)) {
    const edit = local[slotId]
    if (edit) kept[slotId] = edit
  }
  return kept
}

/**
 * IST DAS EIN ECHTER ZUSAMMENSTOSS? (Kailua-Befund 2, 2026-09-08)
 *
 * ── DER DIALOG IST TEUER, ALSO MUSS ER RECHT HABEN ────────────────────────
 * „Dieses Kapitel wurde woanders geändert" verlangt eine Entscheidung, und
 * eine der beiden Antworten („Serverfassung laden") WIRFT die eigene Eingabe
 * WEG. Im ersten Kailua-Lauf stand er in einem einzigen offenen Tab über einer
 * Serverfassung, die für das getippte Feld schlicht LEER war: der Mensch hat
 * eine Entscheidung zwischen seinem Satz und nichts getroffen — und die
 * falsche getroffen, weil der Dialog behauptete, es gäbe da draussen etwas.
 *
 * ── DIE FRAGE IST NICHT „HAT SICH DIE REVISION BEWEGT" ────────────────────
 * Die Revision bewegt sich aus vielen Gründen, die mit dem getippten Feld
 * nichts zu tun haben (ein Gesprächszug stempelt „hat mitgelesen", eine
 * Sammel-Session schreibt ihren Zwischenstand, ein zweiter Tab bestätigt
 * daneben). Zu entscheiden gibt es nur dort etwas, wo ZWEI TEXTE für DASSELBE
 * Feld stehen. Deshalb rechnet diese Regel je Slot:
 *
 *  - die Serverfassung des Feldes ist LEER ⇒ nichts zu verlieren;
 *  - mein Text und ihrer sind gleich ⇒ nichts zu entscheiden;
 *  - ich habe gar keinen Text getippt (nur bestätigt oder aufgehoben) und der
 *    Wortlaut des Feldes hat sich NICHT bewegt ⇒ meine Bestätigung meint
 *    genau den Text, der dort steht.
 *
 * Bleibt irgendwo ein Feld übrig, an dem zwei VERSCHIEDENE, nicht-leere Texte
 * stehen, ist es ein echter Zusammenstoss und der Dialog gehört hin.
 *
 * ── WARUM `previous` MITKOMMT ─────────────────────────────────────────────
 * Eine Bestätigung heisst „ich stimme dem zu, was ich gelesen habe". Ob das
 * noch dasteht, kann nur beantworten, wer BEIDE Serverfassungen kennt: die
 * gelesene und die neue. Ohne `previous` bliebe nur die Wahl zwischen „jede
 * Bestätigung ist harmlos" (dann bestätigte man fremden Text ungefragt) und
 * „jede Bestätigung ist ein Konflikt" (dann stünde der Dialog wieder bei jedem
 * Klick — der Kailua-Befund 3).
 *
 * ── SIE IST DIE ZWEITE STUFE, NICHT DIE ERSTE ─────────────────────────────
 * `pruneSettledEdits` beantwortet schon „der Server trägt meine Eingabe
 * bereits" (der Schein-Konflikt aus 2026-09-02). Diese hier beantwortet die
 * nächste Frage: „er trägt sie nicht, aber er trägt auch nichts anderes."
 * Beide Male ist die Auflösung dieselbe Bewegung — Serverfassung samt neuer
 * `revision` übernehmen, die eigene Eingabe stehen lassen, erneut speichern —,
 * nur bleibt hier etwas zu speichern übrig.
 */
export function brandConflictNeedsDecision(
  previous: Readonly<Record<string, BrandSlotView>>,
  current: Readonly<Record<string, BrandSlotView>>,
  local: Readonly<Record<string, BrandLocalSlotEdit>>,
): boolean {
  for (const slotId of Object.keys(diffBrandSlots(current, local))) {
    const theirs = brandSlotDisplayValue(current[slotId])
    // Leer ist keine zweite Fassung.
    if (theirs.trim().length === 0) continue
    const mine = local[slotId]?.value
    if (mine === undefined) {
      // Nur bestätigt/aufgehoben: der Wortlaut ist ihrer. Konflikt ist es
      // genau dann, wenn er sich seit dem Lesen bewegt hat.
      if (brandSlotDisplayValue(previous[slotId]) !== theirs) return true
      continue
    }
    if (theirs === mine) continue
    return true
  }
  return false
}

/** Die fünf sichtbaren Zustände (§3e). */
export type BrandSyncState = 'saving' | 'saved' | 'offline' | 'error' | 'conflict'

/**
 * Was dem Speichern zustösst. `resolve` ist der EINZIGE Ausgang aus `conflict`
 * und kommt ausschliesslich aus einer MENSCHLICHEN Entscheidung im 409-Dialog.
 */
export type BrandSyncEvent = 'start' | 'ok' | 'offline' | 'error' | 'conflict' | 'resolve'

export function nextBrandSyncState(current: BrandSyncState, event: BrandSyncEvent): BrandSyncState {
  if (event === 'resolve') return 'saved'
  if (event === 'conflict') return 'conflict'
  // Klebrig (s. Kopf): eine verspätete Antwort darf den Konflikt nicht lösen.
  if (current === 'conflict') return 'conflict'
  switch (event) {
    case 'start': return 'saving'
    case 'ok': return 'saved'
    case 'offline': return 'offline'
    case 'error': return 'error'
  }
}

/**
 * Darf jetzt gespeichert werden? Ein Konflikt hält den Autosave an — er wird
 * nicht „später nochmal versucht", sondern wartet auf die Entscheidung.
 */
export function brandAutosaveAllowed(state: BrandSyncState): boolean {
  return state !== 'conflict'
}
