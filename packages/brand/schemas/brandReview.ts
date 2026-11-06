import { z } from 'zod'
import {
  BRAND_FINDING_DECISIONS,
  BRAND_FINDING_REASON_MAX,
  BRAND_FINDING_REASON_MIN,
  BRAND_FINDING_STATUSES,
  BRAND_FINDING_TEXT_MAX,
  BRAND_REVIEW_FINDINGS_MAX,
  BRAND_REVIEW_FINDING_KINDS,
  BRAND_REVIEW_LIST_MAX,
  type BrandFinding,
  type BrandReviewMode,
  brandFindingKey,
} from '../shared/brandFindings'
import { slotById } from '../shared/slotRegistry'
import type { BrandSessionReview } from '../shared/types/brand'

/**
 * WAS DER SPEZIALIST ANTWORTEN DARF (BW2 Paket 4,
 * docs/archiv/BRAND-WIZARD-SESSIONS.md §7) — plus die zwei Rümpfe der neuen
 * Routen (der Kapitel-Blick hat keinen, s. seine Route).
 *
 * ── ZWEI VERSCHIEDENE STRENGEN IN EINEM SCHEMA ────────────────────────────
 * Die ANTWORT als Ganzes ist streng: passt ihre Form nicht (kein Objekt, kein
 * `goalReached`, `notes` keine Liste), scheitert der Parse und die Route wird
 * fail-soft — Wert geschrieben, `reviewed: false`, der Prüfblick holt es nach
 * (§7). Ein „reparierter" Umschlag wäre eine erfundene Antwort.
 *
 * Die einzelnen BEFUNDE dagegen werden EINZELN geprüft und einzeln VERWORFEN
 * (§7 wörtlich: „ungültige Befunde werden VERWORFEN, nicht repariert"). Grund:
 * ein Modell, das vier gute Befunde und einen mit erfundener Feld-Id liefert,
 * hat vier gute Befunde geliefert. Die ganze Antwort dafür wegzuwerfen wäre
 * teuer und falsch; den fünften zu „reparieren" (auf welches Feld?) wäre eine
 * Erfindung mit unserem Namen darunter.
 *
 * ── WARUM DIE SLOT-PRÜFUNG HIER STEHT UND NICHT IM PROMPT ─────────────────
 * Sie steht in BEIDEN. Der Prompt sagt es (ein Modell, das die Regel kennt,
 * hält sie meistens ein), das Schema erzwingt es. Ein `conflict` mit einer
 * erfundenen Feld-Id würde als Chip mit einem toten Link erscheinen — und
 * schlimmer: als Sperre der Finalen Abnahme (§5a Schritt 3), die kein Mensch
 * auflösen kann, weil das Feld nicht existiert.
 *
 * ── DIE ZAHL ZWEI IST NICHT VERHANDELBAR ──────────────────────────────────
 * `conflict` hat GENAU zwei Slot-Ids (§4: „damit die UI beide verlinkt"), und
 * beide müssen verschieden sein: ein Feld, das sich selbst widerspricht, ist
 * keine Aussage, sondern ein Modell, das das Format nicht verstanden hat.
 */

/** Ein einzelner Befund, bevor seine Feld-Ids geprüft sind. */
const rawFindingSchema = z.object({
  // NUR die drei Arten, die aus einem Schliess-Aufruf stammen KÖNNEN:
  // `market` gehört zwar zu den Befund-ARTEN, entsteht aber im Marktvergleich
  // (Begründung an `BRAND_REVIEW_FINDING_KINDS`).
  kind: z.enum(BRAND_REVIEW_FINDING_KINDS),
  slots: z.array(z.string()),
  why: z.string().trim().min(1).max(BRAND_FINDING_TEXT_MAX),
  suggestion: z.string().trim().max(BRAND_FINDING_TEXT_MAX).optional(),
})

/**
 * Ein Feld, das es GIBT und das noch gefragt wird. Ein deaktivierter Slot ist
 * weiter LESBAR (Migrationsvertrag), aber kein Ziel für einen neuen Befund:
 * ein Chip, der in eine abgeschaffte Session verlinkt, führt ins Leere.
 */
function knownSlot(slotId: string): boolean {
  const slot = slotById(slotId)
  return Boolean(slot && !slot.deactivated)
}

/**
 * IST DIESER BEFUND BRAUCHBAR? — pur, damit die Gegenprobe ohne Modell läuft.
 *
 * `known` ist überschreibbar, weil ein Test eine erfundene Registry vorlegen
 * können muss (dieselbe Begründung wie bei `sessionsAffectedBy`).
 */
export function brandFindingIsUsable(
  finding: Pick<BrandFinding, 'kind' | 'slots'>,
  known: (slotId: string) => boolean = knownSlot,
): boolean {
  const wanted = finding.kind === 'conflict' ? 2 : 1
  if (finding.slots.length !== wanted) return false
  if (new Set(finding.slots).size !== wanted) return false
  return finding.slots.every(slotId => known(slotId))
}

/** Kurze Sätze, gedeckelt und ohne Leereinträge — `missing` wie `notes`. */
function cleanList(values: readonly string[]): string[] {
  return values
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
    .slice(0, BRAND_REVIEW_LIST_MAX)
    .map(entry => entry.slice(0, BRAND_FINDING_TEXT_MAX))
}

/**
 * DIE GEPRÜFTE ANTWORT. `mode` entscheidet nur über EIN Feld: `affected` gibt
 * es ausschliesslich im `correct`-Modus (§7), und ein durchgereichtes
 * `affected` aus einem `session`-Lauf wäre eine Liste, die niemand bestellt
 * hat und die Paket 6 später als echt lesen würde.
 */
export function createBrandSessionReviewSchema(mode: BrandReviewMode) {
  return z.object({
    goalReached: z.boolean(),
    missing: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
    // `unknown`, weil hier NOCH nicht abgewiesen werden soll: die Prüfung je
    // Eintrag steht im Transform, und ein einzelner kaputter Befund darf die
    // ganze Antwort nicht kosten (s. Kopf).
    findings: z.array(z.unknown()).default([]),
    nextSession: z.string().nullable().default(null),
    affected: z.array(z.string()).optional(),
  }).transform((answer): BrandSessionReview => {
    const findings: BrandFinding[] = []
    const seen = new Set<string>()
    for (const candidate of answer.findings) {
      if (findings.length >= BRAND_REVIEW_FINDINGS_MAX) break
      const parsed = rawFindingSchema.safeParse(candidate)
      if (!parsed.success) continue
      if (!brandFindingIsUsable(parsed.data)) continue
      const key = brandFindingKey(parsed.data)
      // Zwei Mal derselbe Befund in EINER Antwort ist einer — die Dedup gegen
      // die TABELLE macht der Schreibweg, diese hier gilt dem Umschlag.
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({
        kind: parsed.data.kind,
        slots: [...parsed.data.slots],
        why: parsed.data.why,
        ...(parsed.data.suggestion ? { suggestion: parsed.data.suggestion } : {}),
      })
    }

    const next = (answer.nextSession ?? '').trim()
    return {
      goalReached: answer.goalReached,
      missing: cleanList(answer.missing),
      notes: cleanList(answer.notes),
      findings,
      // Die REGISTRY-Prüfung des Vorschlags steht NICHT hier, sondern in
      // `pickNextSession`: dort sind auch die Session-ZUSTÄNDE bekannt, und
      // „gibt es das Feld" allein ist die halbe Frage.
      nextSession: next || null,
      ...(mode === 'correct'
        ? { affected: [...new Set((answer.affected ?? []).map(id => id.trim()).filter(Boolean))] }
        : {}),
    }
  })
}

/**
 * DER RUMPF DES SCHLIESS-AUFRUFS.
 *
 * `revision` ist Pflicht wie überall in diesem Layer: der Aufruf schreibt die
 * Kapitel-Zeile (Notizen, `reviewed`, `nextSession`), und ein zweiter Tab darf
 * ihn nicht still überholen.
 *
 * `force` ist die AUSNAHME von der Idempotenz: eine bereits geprüfte Session
 * antwortet mit dem gespeicherten Review, ohne einen zweiten Aufruf zu
 * bezahlen (§13 „was nichts kostet, kostet kein Kontingent" in seiner
 * Umkehrung). Wer wirklich neu prüfen lassen will, sagt es ausdrücklich — der
 * Client tut das heute nirgends, und das ist Absicht: der einzige Anlass ist
 * eine Hand am Beweis-Skript.
 */
export function createBrandSessionCloseSchema() {
  return z.object({
    revision: z.number().int().min(0),
    force: z.boolean().default(false),
  }).strict()
}

/**
 * DIE ENTSCHEIDUNG ÜBER EINEN BEFUND (§8): annehmen oder ablehnen.
 *
 * `dismissed` VERLANGT einen Grund, und zwar an dieser Stelle und nicht in der
 * Route: „ablehnen" ohne Begründung wäre ein Wegklicken, und der Grund ist
 * genau das, was als Notiz an der Quell-Session hängen bleibt (§8). Drei
 * Zeichen sind keine Qualitätsprüfung, sondern die Sicherung gegen den leeren
 * Klick.
 *
 * `accepted` nimmt KEINEN Grund entgegen: dort ist die Handlung die
 * Begründung — sie zieht die Korrektur eines der beiden Felder nach sich.
 */
export function createBrandFindingDecisionSchema() {
  return z.object({
    status: z.enum(BRAND_FINDING_DECISIONS),
    dismissReason: z.string().trim().max(BRAND_FINDING_REASON_MAX).optional(),
  }).strict().superRefine((body, ctx) => {
    if (body.status !== 'dismissed') return
    if ((body.dismissReason ?? '').length < BRAND_FINDING_REASON_MIN) {
      ctx.addIssue({ code: 'custom', path: ['dismissReason'], message: 'reason_required' })
    }
  })
}

/** Der `?status=`-Filter der Befund-Liste — fehlt er, gelten die offenen. */
export function createBrandFindingsQuerySchema() {
  return z.object({
    status: z.enum(BRAND_FINDING_STATUSES).default('open'),
  })
}
