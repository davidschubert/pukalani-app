/**
 * FRAGEN UND ABLEITUNGEN — DIE ZWEI GRUPPEN EINES KAPITELS
 * (Davids Entscheidung 2026-09-09, aus dem Klick-Test als Testnutzer).
 *
 * ── WAS DER KLICK-TEST GEZEIGT HAT ────────────────────────────────────────
 * Im Kapitel `context` standen die vier ABLEITUNGEN (Elevator-Pitch,
 * Kategorie, Wettbewerber, Zielgruppen-Skizze) und die Ton-Analyse VOR den
 * sechs FRAGEN. George stellt aber nur, was eine Katalog-Frage IST
 * (`resolveNextSession` filtert auf `ask`/`collect`/`choose`) — er sprang also
 * an den ersten fünf Zeilen der Leiste vorbei zur sechsten. Für den Menschen
 * davor sah das aus, als überspränge die Werkstatt die halbe Liste. Entschieden
 * ist deshalb: erst wird gefragt, danach wird abgeleitet, und zwischen beidem
 * steht ein Trenner.
 *
 * ── DIESE DATEI IST DIE EINE REGEL DAZU ───────────────────────────────────
 * PUR (kein Nuxt, kein i18n, kein `$fetch`), wie `slotRegistry.ts` selbst. Sie
 * beantwortet drei Fragen, und alle Leser lesen dieselbe Antwort — die
 * Kapitel-Leiste der Werkstatt, die Finale Abnahme und der Wächter:
 *
 *  1. `brandSessionIsDerived` — ist DIESE Session eine Ableitung?
 *  2. `brandSessionGroups`    — die zwei Gruppen eines Kapitels, in
 *                               Registry-Reihenfolge.
 *  3. `brandDerivedDividerSlot` — VOR welcher Session steht der Trenner
 *                               „Daraus abgeleitet"? (`null` = keiner)
 *
 * Dazu der Wächter `validateSessionOrder` (s. u.).
 *
 * ── FRAGBAR IST EINE SACHE DES KATALOGS, NICHT DES GESCHMACKS ─────────────
 * Fragbar sind genau die Arbeitsformen, die `resolveNextSession` stellt:
 * `ask`, `collect`, `choose` — die Sessions vom `type` `question` und
 * `choice`. Alles andere ist Ableitung: `derivation`, `stage-edit` und die
 * Instrumente (`special`, heute `d.pairs`, `g.inspiration`, `j.drafts`). Die
 * Liste steht HIER und wird von `brandJourney.ts` gelesen, nicht umgekehrt:
 * `brandJourney` kennt diese Datei, diese Datei kennt nur die Registry — die
 * Gegenrichtung wäre ein Zyklus.
 */

import {
  type BrandSessionKind,
  type BrandSlot,
  type BrandStepKey,
  slotsForStep,
  BRAND_SLOTS,
  BRAND_STEP_KEYS,
  dependencyClosure,
} from './slotRegistry'

/**
 * DIE ARBEITSFORMEN, DIE GEORGE STELLT — die Menge, aus der
 * `resolveNextSession` seine nächste Frage nimmt.
 */
export const ASKABLE_SESSION_KINDS: readonly BrandSessionKind[] = ['ask', 'collect', 'choose']

/** Stellt diese Session eine Katalog-Frage? */
export function brandSessionIsAskable(session: Pick<BrandSlot, 'kind'>): boolean {
  return ASKABLE_SESSION_KINDS.includes(session.kind)
}

/**
 * IST DIESE SESSION EINE ABLEITUNG? — das Prädikat hinter dem Trenner.
 *
 * Es ist die GEGENFRAGE zu `brandSessionIsAskable` und kein zweites Kriterium:
 * zwei Listen, die sich ergänzen sollen, laufen auseinander, sobald jemand
 * eine dritte Arbeitsform erfindet.
 */
export function brandSessionIsDerived(session: Pick<BrandSlot, 'kind'>): boolean {
  return !brandSessionIsAskable(session)
}

export interface BrandSessionGroups {
  /** Die fragbaren Sessions des Kapitels, in Registry-Reihenfolge. */
  questions: readonly string[]
  /** Die Ableitungen und Bühnen-Entwürfe, in Registry-Reihenfolge. */
  derived: readonly string[]
}

/**
 * DIE ZWEI GRUPPEN EINES KAPITELS. Deaktivierte Sessions sind schon draussen
 * (`slotsForStep`) — sie stehen in keiner Liste, die ein Mensch sieht.
 *
 * Beide Listen können leer sein: `result` hat keine Ableitung, ein künftiges
 * Kapitel kann ohne Frage auskommen. Genau deshalb liefert die Funktion zwei
 * Listen und keine Grenze — eine Zahl „ab hier abgeleitet" wäre bei einer
 * leeren Gruppe zweideutig.
 */
export function brandSessionGroups(stepKey: BrandStepKey): BrandSessionGroups {
  const sessions = slotsForStep(stepKey)
  return {
    questions: sessions.filter(brandSessionIsAskable).map(session => session.id),
    derived: sessions.filter(brandSessionIsDerived).map(session => session.id),
  }
}

/**
 * IST DAS KAPITEL SAUBER GETEILT? — steht jede Ableitung hinter jeder Frage?
 *
 * Sieben Kapitel sind es NICHT, und das mit Grund (s. `validateSessionOrder`):
 * dort schöpft eine Frage aus einer Ableitung desselben Kapitels.
 */
export function brandChapterIsSplit(stepKey: BrandStepKey): boolean {
  const sessions = slotsForStep(stepKey)
  const firstDerived = sessions.findIndex(brandSessionIsDerived)
  if (firstDerived < 0) return true
  return !sessions.slice(firstDerived).some(brandSessionIsAskable)
}

/**
 * VOR WELCHER SESSION STEHT DER TRENNER „Daraus abgeleitet"?
 *
 * `null` heisst „keiner" — und zwar in DREI Fällen, die alle dasselbe meinen:
 * das Kapitel hat keine Ableitung (`result`), es hat keine Frage, oder es ist
 * gemischt. Der Trenner ist eine ZUSAGE („alles hierunter hat George
 * abgeleitet"); in einem gemischten Kapitel wäre sie falsch, und eine falsche
 * Überschrift ist schlimmer als keine.
 */
export function brandDerivedDividerSlot(stepKey: BrandStepKey): string | null {
  const { questions, derived } = brandSessionGroups(stepKey)
  if (questions.length === 0 || derived.length === 0) return null
  if (!brandChapterIsSplit(stepKey)) return null
  return derived[0] ?? null
}

/**
 * DER WÄCHTER (Davids Entscheidung 2026-09-09) — er prüft JEDEN künftigen
 * Registry-Eintrag, nicht den heutigen Stand.
 *
 * ── DIE REGEL IN EINEM SATZ ───────────────────────────────────────────────
 * Ein Kapitel ist entweder sauber geteilt (erst alle Fragen, dann alle
 * Ableitungen) ODER es weist nach, dass es nicht anders geht: mindestens eine
 * seiner Fragen schöpft (transitiv) aus einer Ableitung DESSELBEN Kapitels.
 *
 * ── WARUM DER NACHWEIS UND NICHT EINE AUSNAHMELISTE ───────────────────────
 * Eine Liste von Kapitelnamen wäre in dem Augenblick still falsch, in dem
 * jemand die Abhängigkeit auflöst — das Kapitel dürfte dann für immer gemischt
 * bleiben, ohne dass es jemandem auffällt. Der Nachweis ist die Bedingung
 * selbst: fällt die Abhängigkeit weg, wird der Wächter rot und verlangt die
 * Teilung.
 *
 * Die sieben Kapitel, die den Nachweis heute führen, und ihr Grund:
 *   values     `c.final`     wählt aus `c.candidates`
 *   archetype  `d.toneWords` u. a. schöpfen aus `d.primary`
 *   manifesto  `e.anchorLine` wählt eine Zeile aus `e.manifesto`
 *   naming     `f.shortlist` wählt aus `f.candidates`
 *   dna        `g.board`     wählt aus `g.boards`
 *   color      `h.neutral`/`h.accent` rechnen auf `h.base`
 *   mark       `j.pick`      wählt aus `j.examples`
 *
 * Sie nimmt eine BELIEBIGE Slot-Liste, damit ein Beweis mutierte Fassungen
 * vorlegen kann — eine Prüfung, die nur die richtige Registry kennt, ist immer
 * grün und beweist nichts (dieselbe Regel wie `validateSlotRegistry`).
 *
 * Gibt die Befunde als Zeilen zurück, leeres Array = in Ordnung.
 */
export function validateSessionOrder(slots: readonly BrandSlot[] = BRAND_SLOTS): readonly string[] {
  const problems: string[] = []
  for (const stepKey of BRAND_STEP_KEYS) {
    const sessions = slots.filter(slot => slot.stepId === stepKey && !slot.deactivated)
    if (sessions.length === 0) continue

    const misplaced: string[] = []
    let seenDerived = false
    for (const session of sessions) {
      if (brandSessionIsDerived(session)) seenDerived = true
      else if (seenDerived) misplaced.push(session.id)
    }
    if (misplaced.length === 0) continue

    // DER NACHWEIS: schöpft eine der nachstehenden Fragen aus einer Ableitung
    // DIESES Kapitels? Transitiv, denn `f.criteria` hängt an `f.checks` nur
    // über `f.shortlist` — eine Prüfung auf die direkten Eingaben liesse
    // genau die Ketten durchfallen, um die es geht.
    const derivedHere = new Set(sessions.filter(brandSessionIsDerived).map(session => session.id))
    const forced = misplaced.some(id =>
      dependencyClosure(id, slots).some(sourceId => derivedHere.has(sourceId)))
    if (!forced) {
      problems.push(
        `Baustein "${stepKey}": ${misplaced.join(', ')} steht/stehen hinter einer Ableitung, `
        + 'ohne aus einer zu schöpfen — Fragen gehören vor die Ableitungen',
      )
    }
  }
  return problems
}
