import { truncatedFromParts } from './brandGeneration'
import type { BrandGenerationMeta, BrandSlotView } from './types/brand'

/**
 * STEHT IM FELD EIN ABGESCHNITTENER ENTWURF? (KI1 d, Folge von P17/BE-007)
 *
 * Reisst ein Entwurfs-Zug die Token-Decke, trägt seine Nachricht
 * `parts.truncated: true`, und unter der Blase steht ein Hinweis. Der FELDWERT
 * selbst trug bisher nichts — wer nur aufs Feld sah, hielt einen mitten im
 * Satz endenden Text für fertig. Diese Regel ist eine reine ANZEIGE, keine
 * neue Spalte: sie leitet das Kennzeichen aus dem Verlauf und dem Feld ab.
 *
 * ── DIE REGEL ────────────────────────────────────────────────────────────
 * Ein Feld ist gekennzeichnet, wenn (1) der LETZTE Entwurfs-Zug zu ihm
 * abgeschnitten war und (2) das Feld noch GENAU den Text dieses Zuges trägt.
 * (1) fällt mit jedem späteren vollständigen Entwurf. (2) fällt, sobald der
 * Mensch das Feld selbst schreibt — tippen, eine ältere Fassung übernehmen,
 * bestätigen —, dann ist es sein Text, nicht mehr der abgeschnittene Entwurf.
 *
 * ── WORAN „NOCH GENAU DIESER TEXT" HÄNGT ─────────────────────────────────
 * Am Text selbst nicht: die Nachricht trägt den GERAHMTEN Zug, nicht den
 * Feldwert, und `latestDraft` zieht jede Eingabe des Menschen mit. Sauber ist
 * die Herkunft des letzten Schreibens: `generate.post.ts` schreibt den Slot
 * und den Historien-Eintrag im SELBEN Zug mit DERSELBEN Zeit
 * (`updatedAt === createdAt`, eine Uhr, ein String), und jedes spätere
 * Schreiben des Feldes (Speichern, Bestätigen, Gesprächs-Übernahme) bewegt
 * `updatedAt`. Steht `updatedAt` noch auf dem Eintrag eines Laufs, trägt das
 * Feld dessen Entwurf — auch nach einem Neuladen. Im laufenden Besuch sagt es
 * `georgeDrafts` (gesetzt beim `slot.ready`, gelöscht beim ersten Tastendruck
 * oder der Bestätigung), weil der Store die Serverfassung nach einem Lauf
 * nicht neu liest.
 *
 * Eine Rückfrage (auch die der NACHPRÜFUNG, die der Server schreibt) ist nie
 * ein Entwurfs-Zug: sie schreibt kein Feld, nimmt also kein Kennzeichen und
 * setzt keins.
 */

/** Was diese Regel von einem Zug des Verlaufs braucht. */
export interface BrandDraftTurnFacts {
  /** Das Feld, das dieser Zug ENTWORFEN hat — `null` für jeden anderen Zug. */
  draftSlotId: string | null
  /** Die Kennung des Laufs (dieselbe wie im Historien-Eintrag des Schrittes). */
  generationId: string | null
  /** Die Decke ist gerissen (`parts.truncated`). */
  truncated: boolean
}

/**
 * Das Feld eines ENTWURFS-Zuges aus seinen gespeicherten `parts`
 * (`{ kind: 'draft', slotId }`, nur aus `generate.post.ts`). Kaputte oder alte
 * `parts` ⇒ `null`: dann ist es eben kein Entwurfs-Zug, und nichts wird
 * gekennzeichnet.
 */
export function brandDraftSlotFromParts(parts: unknown): string | null {
  if (parts === null || typeof parts !== 'object') return null
  const { kind, slotId } = parts as { kind?: unknown, slotId?: unknown }
  if (kind !== 'draft') return null
  return typeof slotId === 'string' && slotId.length > 0 ? slotId : null
}

/** Eine gespeicherte Nachricht (`messages.get.ts`) als Fakten für diese Regel. */
export function brandDraftTurnFromStored(message: {
  role: string
  parts: unknown
  generationId: string | null
}): BrandDraftTurnFacts {
  const draftSlotId = message.role === 'george' ? brandDraftSlotFromParts(message.parts) : null
  return {
    draftSlotId,
    generationId: message.generationId || null,
    truncated: draftSlotId !== null && truncatedFromParts(message.parts),
  }
}

/**
 * WESSEN ENTWURF STEHT GERADE IM FELD? Die `generationId` des Laufs — oder
 * `null`, wenn das Feld seitdem anders geschrieben wurde oder es niemand weiss.
 * `null` heisst nie „gekennzeichnet": im Zweifel kein Kennzeichen.
 */
export function brandFieldDraftGeneration(input: {
  slotId: string
  /** Die Serverfassung des Feldes (`updatedAt` ist das letzte Schreiben). */
  slot: BrandSlotView | undefined
  /** Die Historie des Schrittes, ohne Text (`BrandStepDetailResponse.generations`). */
  generations: readonly BrandGenerationMeta[]
  /** `georgeDrafts[slotId]` — der Entwurf DIESES Besuchs, solange niemand getippt hat. */
  liveDraftGenerationId: string | null
  /** Eine offene, noch nicht gespeicherte Eingabe des Menschen. */
  locallyEdited: boolean
}): string | null {
  if (input.liveDraftGenerationId) return input.liveDraftGenerationId
  if (input.locallyEdited) return null
  const updatedAt = input.slot?.updatedAt
  if (!updatedAt) return null
  const entry = input.generations.find(item =>
    item.slotId === input.slotId
    && item.createdAt === updatedAt
    // Eine Rückfrage schreibt kein Feld — ihr Eintrag kann nicht der Urheber sein.
    && item.outcome !== 'question')
  return entry?.generationId ?? null
}

/** Ein Feld, wie die Regel es sieht. */
export interface BrandFieldDraftSource {
  value: string
  /** s. `brandFieldDraftGeneration` */
  generationId: string | null
}

/**
 * DIE MENGE DER FELDER, DEREN WERT EIN ABGESCHNITTENER ENTWURF IST.
 *
 * `turns` in der Reihenfolge des Verlaufs; der letzte Entwurfs-Zug je Feld
 * zählt. Ein leeres Feld trägt kein Kennzeichen.
 */
export function brandTruncatedDraftFields(
  turns: readonly BrandDraftTurnFacts[],
  fields: Readonly<Record<string, BrandFieldDraftSource>>,
): Set<string> {
  const lastDraft = new Map<string, BrandDraftTurnFacts>()
  for (const turn of turns) {
    if (turn.draftSlotId) lastDraft.set(turn.draftSlotId, turn)
  }

  const flagged = new Set<string>()
  for (const [slotId, turn] of lastDraft) {
    if (!turn.truncated || !turn.generationId) continue
    const field = fields[slotId]
    if (!field || field.value.trim().length === 0) continue
    if (field.generationId !== turn.generationId) continue
    flagged.add(slotId)
  }
  return flagged
}
