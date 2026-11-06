import type { H3Event } from 'h3'
import {
  confirmedSlotValues,
  isBrandProfileSharedForMarket,
  loadStepRows,
  slotById,
} from '../contracts/brandContract'
import type { MarketCandidateSource, MarketFieldId, MarketProfileField } from '../../shared/marketProfile'
import { MARKET_FIELDS } from '../../shared/marketProfile'
import { requireOwnedMarketProfile } from './marketStore'

/**
 * DAS EIGENE MARKTPROFIL AUS DER FOUNDATION (Plan §2.3 Nr. 4, §7.2 Nr. 2).
 *
 * ── EINE FUNKTION FÜR ZWEI FÄLLE ──────────────────────────────────────────
 * Dieselbe Rechnung beantwortet „wie sieht UNSERE Marke im Vergleich aus" und
 * „wie sieht die andere Marke DESSELBEN KONTOS aus" (der Relaunch-Fall:
 * `sourceKind: 'foundation'`, `sourceRef` = ein zweites Branding). Es gibt
 * keinen Unterschied zwischen beiden — ein Branding ist ein Branding —, und
 * zwei Fassungen davon liefen beim ersten neuen Feld auseinander.
 *
 * ── NUR BESTÄTIGTE WERTE, NIE ENTWÜRFE ────────────────────────────────────
 * `confirmedSlotValues` liest ausschliesslich `slots[<id>].confirmed`. Ein
 * `latestDraft` ist ein Vorschlag, über den niemand entschieden hat; er im
 * Vergleich neben den ZITATEN fremder Websites stünde als Aussage der Marke da
 * — und der Kunde bekäme einen Befund zu einem Satz, den er nie beschlossen
 * hat.
 *
 * ── OHNE BELEG, UND ZWAR ABSICHTLICH ──────────────────────────────────────
 * Eine Foundation ist BESCHLOSSEN, nicht zitiert. Ein `evidence` wäre eine
 * Quellenangabe auf sich selbst; das Ablage-Schema lässt für `source:
 * 'foundation'` deshalb ausdrücklich ein Feld ohne Beleg zu. Ebenso fehlt die
 * HÄUFIGKEIT: „auf wie vielen Seiten steht das" hat hier keine Antwort, und
 * eine erfundene `1 von 1` sähe aus wie eine Messung.
 *
 * ── FEHLENDE FELDER BLEIBEN STEHEN, LEER ──────────────────────────────────
 * Alle zehn Felder kommen zurück, auch die unbestätigten. Das ist die Zusage
 * aus §2.4: der Bericht nennt, was bei EUCH noch nicht steht („Tonwörter
 * stehen bei euch noch nicht — der Vergleich dort kommt nach Kapitel D"). Eine
 * gefilterte Liste könnte das nicht mehr sagen; sie sähe aus wie ein
 * vollständiges Profil mit weniger Feldern.
 */

export interface MarketOwnProfile {
  readonly fields: readonly MarketProfileField[]
  /**
   * WELCHER Slot je Marktprofil-Feld gilt — die Rückrichtung der Abbildung.
   *
   * Sie wird gebraucht, weil ein Markt-Befund an ein EIGENES Feld gehängt wird
   * (`brand_findings.slots`), das Modell aber nur die Marktprofil-Id kennt.
   * `categoryLanguage` bildet auf ZWEI Slots ab (`a.category`,
   * `b.positioningCategory`); genommen wird der, aus dem der Wert tatsächlich
   * stammt — ein Chip am anderen führte den Menschen an ein Feld, in dem der
   * beanstandete Satz gar nicht steht.
   */
  readonly slotByField: ReadonlyMap<MarketFieldId, string>
  /** Die Ids der Felder, die bei uns noch nicht bestätigt sind (§2.4). */
  readonly missingFieldIds: readonly MarketFieldId[]
}

export interface MarketOwnProfileOptions {
  /**
   * NUR ÖFFENTLICHE FELDER — die Regel für eine FREMDE Marke (§7.2 Nr. 4,
   * BF1-Vertraulichkeit).
   *
   * Die Slot-Registry führt je Session eine `sensitivity`
   * (`public | internal | private`); `internal` heisst „reist nicht per
   * Share-Link und nicht im Export" — vier Sessions tragen das heute
   * (Wettbewerber-Notizen, Beschwerden, Schmerzpunkt, Zahlen). Keine davon
   * liegt in den zehn Marktfeldern, und genau deshalb steht die Prüfung hier
   * und nicht als Kommentar: die Abbildung `MARKET_FIELDS` kann sich ändern,
   * die Zusage nicht. Ein unbekannter Slot fällt ebenfalls raus — was die
   * Registry nicht kennt, kann sie auch nicht als öffentlich zusagen.
   *
   * Für die EIGENE Marke bleibt der Schalter aus: dort ist nichts fremd.
   */
  readonly publicOnly?: boolean
  /** Die Herkunft, die an jedem Feld steht. Default `foundation`. */
  readonly source?: MarketCandidateSource
}

export async function loadMarketOwnProfile(
  event: H3Event,
  profileId: string,
  options: MarketOwnProfileOptions = {},
): Promise<MarketOwnProfile> {
  const source: MarketCandidateSource = options.source ?? 'foundation'
  const rows = await loadStepRows(event, profileId)
  const values = new Map<string, string>()
  for (const row of rows) {
    for (const entry of confirmedSlotValues(row)) {
      if (options.publicOnly && slotById(entry.slotId)?.sensitivity !== 'public') continue
      if (!values.has(entry.slotId)) values.set(entry.slotId, entry.value)
    }
  }

  const fields: MarketProfileField[] = []
  const slotByField = new Map<MarketFieldId, string>()
  const missingFieldIds: MarketFieldId[] = []

  for (const definition of MARKET_FIELDS) {
    // Der ERSTE bestätigte Slot in der Reihenfolge der Abbildung gewinnt — sie
    // ist im Produktvertrag festgelegt, und „der spätere überschreibt" wäre
    // eine zweite, ungeschriebene Regel.
    const hit = definition.slotIds
      .map(slotId => ({ slotId, value: (values.get(slotId) ?? '').trim() }))
      .find(entry => entry.value)

    if (!hit) {
      fields.push({ fieldId: definition.id, value: '', source })
      missingFieldIds.push(definition.id)
      continue
    }

    slotByField.set(definition.id, hit.slotId)
    // Der Rückfall auf den ERSTEN Slot der Abbildung gilt nur für die
    // Befund-Zuordnung leerer Felder — ein Befund an einem leeren Feld ist
    // möglich („hier steht bei euch nichts, im Feld aber überall etwas").
    if (definition.form !== 'list') {
      fields.push({ fieldId: definition.id, value: hit.value.slice(0, 2000), source })
      continue
    }
    // Listen-Felder liegen im Wizard als EINE Zeile („Handwerk, Nähe, Ruhe")
    // oder als Aufzählung — beides wird hier zu Einträgen.
    const items = hit.value
      .split(/[,\n]/)
      .map(part => part.replace(/^[-•*]\s*/, '').trim())
      .filter(Boolean)
      .slice(0, definition.maxItems ?? 5)
    fields.push({
      fieldId: definition.id,
      value: items.join(', '),
      items,
      source,
    })
  }

  return { fields, slotByField, missingFieldIds }
}

/**
 * DAS PROFIL EINES KANDIDATEN MIT `sourceKind: 'foundation'`.
 *
 * ── DIE BESITZ-PRÜFUNG IST NICHT VERHANDELBAR ─────────────────────────────
 * `sourceRef` kommt aus einer Zeile, die der Kunde angelegt hat — und der Lauf
 * liest daraus BESTÄTIGTE Werte eines Brandings. Ohne die Prüfung wäre das ein
 * Leseweg in fremde Foundation-Interna, und zwar der bequemste denkbare: eine
 * Id in einem Formularfeld. `requireOwnedMarketProfile` wirft 404 (nicht 403)
 * — ein 403 bestätigte die Existenz.
 *
 * Die POST-Route prüft dasselbe beim ANLEGEN. Beides ist richtig: dort ist es
 * die schnelle Rückmeldung, hier die Grenze — ein Besitz kann zwischen Anlegen
 * und Lauf wechseln (übertragenes, gelöschtes Branding), und der Lauf ist die
 * Stelle, an der wirklich gelesen wird.
 */
export async function loadMarketFoundationCandidate(
  event: H3Event,
  userId: string,
  sourceRef: string,
  fallbackProfileId: string,
): Promise<MarketOwnProfile> {
  const reference = sourceRef.trim() || fallbackProfileId
  await requireOwnedMarketProfile(event, userId, reference)
  return await loadMarketOwnProfile(event, reference)
}

/**
 * Die Slot-Id für ein Marktprofil-Feld — mit Rückfall auf den ersten Slot der
 * Abbildung. Ein Befund braucht IMMER ein Feld, an dem er hängen kann; ohne
 * Rückfall fielen genau die Befunde weg, die auf ein noch leeres eigenes Feld
 * zeigen, und das sind die interessanten.
 */
export function marketOwnSlotId(own: MarketOwnProfile, fieldId: MarketFieldId): string {
  const confirmed = own.slotByField.get(fieldId)
  if (confirmed) return confirmed
  return MARKET_FIELDS.find(definition => definition.id === fieldId)?.slotIds[0] ?? ''
}

/**
 * DAS MARKTPROFIL EINER FREIGEGEBENEN FREMDEN MARKE (§7.2 Nr. 4, MV1 M4).
 *
 * ── DERSELBE MOTOR, ZWEI ZUSÄTZLICHE RIEGEL ──────────────────────────────
 * Gerechnet wird wie bei jeder Foundation (`loadMarketOwnProfile`) — „ein
 * Motor, drei Ansichten" (§7.1). Davor stehen zwei Prüfungen, die es bei der
 * eigenen Marke nicht gibt:
 *
 *  1. **Die Freigabe gilt JETZT** (`isBrandProfileSharedForMarket`). Sie wird
 *     bei JEDEM Lauf neu gestellt und nicht beim Anlegen des Kandidaten
 *     beantwortet: eine Zustimmung ist jederzeit widerrufbar, und ein Lauf,
 *     der einen alten Ja-Stand benutzte, machte den Widerruf wirkungslos.
 *  2. **Nur öffentliche Felder** (`publicOnly`). Interne Sessions
 *     (Wettbewerber-Notizen, Beschwerden, Schmerzpunkt, Zahlen) reisen weder
 *     per Share-Link noch im Export — und schon gar nicht in das Werkzeug
 *     eines fremden Kunden.
 *
 * ── WARUM „WIDERRUFEN" EINE ANTWORT IST UND KEIN FEHLER ──────────────────
 * `null` heisst: die Marke steht nicht mehr zur Verfügung. Der Lauf macht
 * daraus einen Ausschluss mit dem GRUND `withdrawn` (§2.3: der Kunde soll
 * ehrliche Worte lesen, kein leeres Feld) — und ein SCHON geschriebener
 * Bericht bleibt, was er war: ein Schnappschuss.
 */
export async function loadMarketSharedCandidate(
  event: H3Event,
  sourceRef: string,
  requiredStepKey: string,
): Promise<MarketOwnProfile | null> {
  const reference = sourceRef.trim()
  if (!reference) return null
  if (!await isBrandProfileSharedForMarket(event, reference, requiredStepKey)) return null
  return await loadMarketOwnProfile(event, reference, { publicOnly: true, source: 'shared' })
}
