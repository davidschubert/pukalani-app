/**
 * DIE BEFUNDE DES SPEZIALISTEN — die reinen Regeln (BW2 Paket 4,
 * docs/archiv/BRAND-WIZARD-SESSIONS.md §4, §7, §8).
 *
 * PUR: kein Appwrite, kein H3, kein i18n, kein Modell. Hier stehen die Werte
 * (Arten, Zustände, Deckel), die Antwort auf „ist das derselbe Befund noch
 * einmal?" und die eine Entscheidung, die den TEUREN zweiten Aufruf auslöst.
 * Alles drei wird an zwei Enden gebraucht — Server (schreiben, buchen) und
 * Browser (Chips, Paket 5) — und darf deshalb nirgends ein zweites Mal stehen.
 *
 * ── WARUM `needsStageTwo` HIER LIEGT UND NICHT IN `brandReview.ts` ────────
 * Sie ist die Entscheidung „kostet dieser Schliess-Aufruf drei weitere
 * Kontingent-Punkte?" (Davids zweistufige Entscheidung, §7). Eine Entscheidung
 * über Geld gehört an eine Stelle, die man ohne Anbieter-Schlüssel prüfen
 * kann — dieselbe Begründung, aus der `decideBrandAiQuota` neben den Zahlen
 * steht und nicht in der Route.
 */

/**
 * WAS EIN BEFUND SEIN KANN.
 *
 *  · `conflict`  — zwei bestätigte Felder widersprechen sich. Der EINZIGE, der
 *    Zwang ausübt: ein offener Konflikt sperrt die Finale Abnahme des Kapitels
 *    (§5a Schritt 3), sonst nichts.
 *  · `affected`  — eine Korrektur trifft dieses Feld inhaltlich (§9). Wird vom
 *    `correct`-Modus erzeugt; der ist Paket 6.
 *  · `gap`       — hier fehlt etwas (§10, Prüfblick). Rein beratend.
 *  · `market`    — der Marktvergleich hat an einem eigenen Feld etwas gesehen
 *    (MV1 M3, docs/archiv/BRAND-MARKTVERGLEICH.md §2.3 Nr. 4). Rein beratend
 *    wie `gap`: er sperrt NICHTS (`blockingFindingSlots` fragt nach
 *    `conflict`), und er löst auch keine zweite Stufe aus (`needsStageTwo`) —
 *    er entsteht gar nicht in einem Schliess-Aufruf.
 */
export const BRAND_FINDING_KINDS = ['conflict', 'affected', 'gap', 'market'] as const
export type BrandFindingKind = (typeof BRAND_FINDING_KINDS)[number]

/**
 * WAS DER SPEZIALIST SELBST MELDEN DARF — die drei Arten, die aus einem
 * `review`-Aufruf stammen KÖNNEN.
 *
 * ── WARUM DAS EINE ZWEITE LISTE IST UND KEINE DOPPELUNG ───────────────────
 * `market` ist eine Art von Befund, aber KEINE Antwort des Spezialisten: sie
 * entsteht im Marktvergleich aus einem ganz anderen Modell-Aufruf mit ganz
 * anderem Material. Stünde sie in der Menge, die das Antwort-Schema
 * (`schemas/brandReview.ts`) zulässt, könnte ein Modell im Schliess-Aufruf
 * einen „Markt-Befund" behaupten, ohne je einen Markt gesehen zu haben — und
 * er stünde ununterscheidbar neben den echten. Die ARTEN sind eine Menge, die
 * ERLAUBTE EINGABE ist eine andere; zwei Fragen, zwei Listen.
 */
export const BRAND_REVIEW_FINDING_KINDS = ['conflict', 'affected', 'gap'] as const
export type BrandReviewFindingKind = (typeof BRAND_REVIEW_FINDING_KINDS)[number]

/**
 * DER ZUSTAND EINES BEFUNDS (§8). `accepted` heisst „ich nehme ihn an" — und
 * zieht die Korrektur eines der Felder nach sich (Paket 6); `dismissed` heisst
 * „ich habe entschieden, dass es passt", und verlangt deshalb einen Grund, der
 * als Notiz an die QUELL-Session geht. Beide beenden die Sperre.
 */
export const BRAND_FINDING_STATUSES = ['open', 'accepted', 'dismissed'] as const
export type BrandFindingStatus = (typeof BRAND_FINDING_STATUSES)[number]

/** Die zwei Zustände, die ein MENSCH setzen kann — `open` entsteht nur beim Schreiben. */
export const BRAND_FINDING_DECISIONS = ['accepted', 'dismissed'] as const
export type BrandFindingDecision = (typeof BRAND_FINDING_DECISIONS)[number]

/**
 * DREI MODI, EIN VERTRAG (§7).
 *
 *  · `session` — der Standard: beim Bestätigen einer Session.
 *  · `correct` — nach einer Korrektur, mit `affected` (Paket 6 verdrahtet ihn;
 *    hier steht er, damit der Prompt-Bauer und das Schema ihn schon kennen und
 *    Paket 6 keine Vertragsänderung braucht).
 *  · `chapter` — beim Öffnen der Finalen Abnahme: nur `findings`.
 */
export const BRAND_REVIEW_MODES = ['session', 'correct', 'chapter'] as const
export type BrandReviewMode = (typeof BRAND_REVIEW_MODES)[number]

/** Wer geantwortet hat — `stage1` heisst: Stufe 2 lief nicht oder scheiterte (§7). */
export type BrandReviewStage = 'stage1' | 'stage2'

// ── Deckel ─────────────────────────────────────────────────────────────────

/** Spaltengrösse von `brand_findings.why` / `.suggestion` (brand-014). */
export const BRAND_FINDING_TEXT_MAX = 1_000
/** Spaltengrösse von `brand_findings.dismissReason`. */
export const BRAND_FINDING_REASON_MAX = 500
/**
 * „Ablehnen" verlangt einen Grund (§8). Drei Zeichen sind wenig — sie sind
 * nicht die Qualitätsprüfung, sondern die Sicherung gegen den leeren Klick:
 * der Grund wird als Notiz an die Quell-Session gehängt, und eine leere Notiz
 * behauptete eine Begründung, die nie gegeben wurde.
 */
export const BRAND_FINDING_REASON_MIN = 3

/**
 * Wie viele Befunde EIN Schliess-Aufruf höchstens hinterlässt. Der Deckel ist
 * die Bremse gegen ein Modell, das eine Liste schreibt statt einer Aussage —
 * und gegen 68 Sessions × N Zeilen in einer Tabelle ohne Aufräumroutine.
 */
export const BRAND_REVIEW_FINDINGS_MAX = 5
/** `missing` und `notes` je höchstens drei (§7, wörtlich). */
export const BRAND_REVIEW_LIST_MAX = 3

// ── Der Befund selbst ──────────────────────────────────────────────────────

/**
 * WAS DER SPEZIALIST MELDET (§4). Die gespeicherte Zeile trägt mehr
 * (`status`, `sourceSession`, Zeitstempel) — das hier ist der Teil, den das
 * Modell liefert und den Paket 5 rendert.
 */
export interface BrandFinding {
  readonly kind: BrandFindingKind
  /** Beteiligte Felder — bei `conflict` immer ZWEI, damit die UI beide verlinkt. */
  readonly slots: readonly string[]
  /** Warum (Chat-Sprache, ein Satz). */
  readonly why: string
  /** Vorschlag (optional, ein Satz). */
  readonly suggestion?: string
}

/**
 * Derselbe Trenner wie im Generations- und Quellen-Hash — ein Zeichen, das in
 * keiner Slot-Id vorkommen kann. Als ESCAPE geschrieben und nie als Byte: ein
 * rohes U+0000 in einer Quelldatei macht sie für git zu einer Binärdatei, und
 * ihr Diff ist danach nicht mehr lesbar.
 */
const SEPARATOR = '\u0000'

/**
 * DERSELBE BEFUND NOCH EINMAL? — der Dedup-Schlüssel (Paket-4-Regel).
 *
 * Gleiche ART und gleiche MENGE von Feldern heisst „schon gemeldet". Die
 * Reihenfolge der Slots zählt bewusst NICHT: ein Konflikt zwischen `b.purpose`
 * und `c.conflictRule` ist derselbe Konflikt wie zwischen `c.conflictRule` und
 * `b.purpose`, und ein Modell, das die zwei Ids in der anderen Folge nennt,
 * darf keine zweite Zeile erzeugen. Der TEXT (`why`) zählt ebenfalls nicht —
 * er ist bei jedem Lauf ein bisschen anders formuliert, und genau daran würde
 * eine Deduplizierung über den Text scheitern.
 *
 * Getrennt wird mit `SEPARATOR` (U+0000), wie im Generations- und
 * Quellen-Hash.
 */
export function brandFindingKey(finding: Pick<BrandFinding, 'kind' | 'slots'>): string {
  return [finding.kind, ...[...finding.slots].sort()].join(SEPARATOR)
}

/**
 * LÄUFT STUFE 2? (§7, Davids zweistufige Entscheidung.)
 *
 * Stufe 1 ist das günstige Modell und liefert die volle Antwort. Meldet sie
 * MINDESTENS einen `conflict` oder `affected`, läuft der teure Blick — und nur
 * dann. Grund: genau diese zwei Arten kosten den Kunden etwas. Ein falscher
 * `conflict` sperrt später die Finale Abnahme, ein falsches `affected` schickt
 * ihn in ein Gespräch, das er nicht führen müsste. Ein `gap` ist ein Hinweis
 * und kostet nichts als Aufmerksamkeit.
 *
 * Eine leere Liste läuft nie in Stufe 2 — das ist der Normalfall und der
 * ganze Sinn der Zweistufigkeit.
 */
export function needsStageTwo(findings: readonly Pick<BrandFinding, 'kind'>[]): boolean {
  return findings.some(finding => finding.kind === 'conflict' || finding.kind === 'affected')
}

/**
 * DIE BEFUNDE, DIE EIN KAPITEL SPERREN (§5a Schritt 3) — die Slot-Ids aus
 * OFFENEN `conflict`-Befunden, die ein Feld dieses Kapitels berühren.
 *
 * Sie ist pur und nimmt die Zeilen entgegen, statt sie zu holen: dieselbe
 * Rechnung läuft im Browser (Chips) und auf dem Server (`brandStepAcceptance`),
 * und zwei Fassungen davon wären zwei Antworten auf „darf abgenommen werden".
 *
 * GEFILTERT WIRD ÜBER DIE SLOTS, nicht über `stepKey`: der Stempel sagt, aus
 * welchem Kapitel der Befund STAMMT — gesperrt wird aber jedes Kapitel, dessen
 * Feld daran beteiligt ist. Ein Konflikt zwischen B und C sperrt beide, und
 * das ist der Punkt: wer weiterzieht, hat seinen Konflikt entschieden.
 */
export function blockingFindingSlots(
  findings: readonly { kind: BrandFindingKind, status: BrandFindingStatus, slots: readonly string[] }[],
  stepSlotIds: readonly string[],
): string[] {
  const inStep = new Set(stepSlotIds)
  const blocked = new Set<string>()
  for (const finding of findings) {
    if (finding.kind !== 'conflict' || finding.status !== 'open') continue
    for (const slotId of finding.slots) {
      if (inStep.has(slotId)) blocked.add(slotId)
    }
  }
  return [...blocked]
}
