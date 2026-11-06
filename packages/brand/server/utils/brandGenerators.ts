import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import {
  type BrandGenerationLockEntry,
  type BrandGenerationOutcome,
  brandGenerationHashInput,
  brandGenerationLockHeld,
  brandGenerationLockKey,
} from '../../shared/brandGeneration'
import { formatBrandSlotList, formatBrandSlotStructured } from '../../shared/brandSlotFormat'
import {
  type BrandSlot,
  type BrandStepKey,
  type BrandTeamKind,
  dependencyClosure,
} from '../../shared/slotRegistry'
import type { BrandStartCard } from '../../shared/types/brand'
import { type BrandSlotRecord, brandSlotStoredValue } from './brandStore'

/**
 * WER GEORGES ENTWÜRFE SCHREIBT — die Registry, die Sperre, der inputHash und
 * der Entwicklungs-Ersatz.
 *
 * ── DER GENERATOR IST EINSTECKBAR, UND ZWAR AUS EINEM GRUND ───────────────
 * P1c baut das PROTOKOLL (§3e), nicht die Prompts. Ein Protokoll, das man nur
 * mit einem KI-Schlüssel ausprobieren kann, ist eines, das niemand ausprobiert:
 * jeder Beweis kostete dann Geld, einen Anbieter und eine Internetverbindung.
 * Deshalb entscheidet `resolveBrandSlotGenerator()`, WER schreibt, und die Route
 * kennt nur noch „es gibt einen" oder „es gibt keinen". P2 registriert die
 * echten Prompts über `registerBrandSlotGenerator()` — an derselben Naht, ohne
 * eine Zeile in der Route.
 *
 * ── DER DEV-STUB IST EIN RÜCKFALL, KEINE REGISTRIERUNG ────────────────────
 * Er hängt an `pukalani.brand.devStubGenerator` (Core-Default `false`, im
 * .playground `true`) und greift NUR, wenn nichts registriert ist. Als
 * Registrierung in einem Nitro-Plugin wäre er von der Plugin-REIHENFOLGE
 * abhängig: registrierte P2 ihre Prompts früher, gewönne der Stub, und in
 * Produktion stünde ein Entwicklungstext im Brand-Dokument. Als Rückfall kann
 * das nicht passieren — ein echter Generator schlägt ihn immer.
 *
 * ── DIE SPERRE LEBT IM PROZESS ────────────────────────────────────────────
 * Eine Map, mehr nicht. Das ist für Phase 1 richtig und die Grenze steht hier,
 * damit sie niemand später sucht: bei mehreren Node-Prozessen (pm2-Cluster)
 * sperrt sie nur INNERHALB eines Prozesses. Der Schaden bliebe klein — zwei
 * gleichzeitige Läufe schreiben nacheinander, der zweite gewinnt, und der
 * Autosave des Clients bemerkt den revision-Sprung. Eine prozessübergreifende
 * Sperre (Appwrite-Row mit 409-Idempotenz, wie `notify()`) ist der nächste
 * Schritt, wenn branding je im Cluster läuft.
 */

// ── Der Vertrag ────────────────────────────────────────────────────────────

export interface BrandGeneratorContext {
  event: H3Event
  stepKey: BrandStepKey
  slot: BrandSlot
  /** Inhaltssprache des Brandings (`brand_profiles.contentLocale`) — nie die UI-Sprache. */
  locale: string
  /**
   * DIE SPRACHE DER SEITE, auf der der Mensch gerade steht — Georges ANSPRACHE
   * (Chat-Zug, Rahmung, Rückfrage), nie der Slot-Inhalt.
   *
   * Sie steht NEBEN `locale` und nicht darin, weil beide auseinanderfallen
   * DÜRFEN: eine deutschsprachige Marke, besprochen auf einer englischen
   * Oberfläche, ist ein gültiger Fall. Sie kommt aus dem Rumpf (der Browser
   * kennt seine Route, der Server nicht) und ist bereits geprüft; ist sie
   * unbekannt oder fehlt sie, steht hier die Inhaltssprache — ein Generator
   * muss also nie selbst zurückfallen.
   */
  uiLocale: string
  /** Die Weiche W1, für pfadabhängige Prompts. */
  pathKind: 'new' | 'relaunch'
  /**
   * DIE WEICHE W3 (a-14, Davids Entscheidung 2026-09-09) — sie entscheidet, WER
   * im Markentext spricht: `solo` ⇒ Ich-Form, `team` ⇒ Wir-Form.
   *
   * Sie steht NEBEN `pathKind`, weil sie dieselbe Sorte Tatsache ist: eine
   * Angabe aus dem Profil, die den Auftrag ändert und nicht die Eingaben. Sie
   * geht deshalb auch NICHT in den `inputHash` — der beschreibt den Stand der
   * Quell-Slots, genau wie bei Startkarte und Website-Text.
   *
   * OPTIONAL, damit ein Aufrufer ohne Profil (Beweise, Werkzeuge) weiterläuft:
   * ohne sie sagt der Auftrag zur Person das, was er vor a-14 sagte.
   */
  team?: BrandTeamKind
  /**
   * DIE STARTKARTE DES PROFILS (Content-Spec §2.1) — die primäre Quelle des
   * Bausteins A, dessen Slots gerade DESHALB keine `dependencies` haben.
   *
   * Sie steht NEBEN `dependencies` und nicht darin: Abhängigkeiten sind
   * Slot-Werte (sie bilden den inputHash und stammen aus `brand_steps.slots`),
   * die Startkarte steht am PROFIL. Zusammengelegt müsste man ihr vier
   * Slot-Ids erfinden, die es in der Registry nicht gibt.
   *
   * Leere Felder sind der Normalfall (Bestands-Profile von vor brand-009) —
   * jeder Generator muss mit einer vollständig leeren Karte umgehen können.
   */
  startCard: BrandStartCard
  /**
   * DER TEXT VON IHRER WEBSITE (P2.3) — leer, solange niemand „Website lesen"
   * gedrückt hat, und das ist der Normalfall.
   *
   * Er steht NEBEN der Startkarte und nicht darin: die Karte sind ANTWORTEN
   * eines Menschen, das hier ist FREMDER Text, den wir eingesammelt haben.
   * Georges Prompt behandelt beides verschieden — die Karte ist Quelle, dieser
   * Block ist Material, aus dem NIE eine Anweisung wird
   * (Prompt-Injection-Grenze, Plan §9b).
   *
   * Er geht ebenfalls NICHT in den `inputHash`: der beschreibt den Stand der
   * Quell-SLOTS. Ein neu gelesener Website-Text macht einen bestehenden Entwurf
   * heute also nicht „veraltet" — dieselbe bewusste Grenze wie bei der
   * Startkarte.
   */
  siteAnalysis: string
  /** Freier Hinweis des Menschen („wärmer", „kürzer") — bereits auf 500 Zeichen geklemmt. */
  hint: string
  /** Werte der (transitiven) Quell-Slots in Katalog-Reihenfolge. */
  dependencies: readonly BrandSlotDependency[]
  /**
   * DIE LETZTEN ZÜGE DIESES BAUSTEINS (a-9), älteste zuerst. Leer = kein
   * Verlauf, und das ist beim ersten Entwurf der Normalfall.
   *
   * Es steht NEBEN `dependencies` und nicht darin: das hier sind GESPRÄCHS-Züge,
   * keine Slot-Werte. Ein Feldwert ist ein festgehaltenes Ergebnis mit einer Id
   * aus der Registry; ein Zug ist Gesagtes — von George so gut wie vom Menschen.
   * Zusammengelegt müsste man jedem Zug eine Slot-Id erfinden, und Georges
   * eigene Rückfrage stünde als Feldinhalt da.
   *
   * WOZU: bis a-9 las der Entwurf nur gespeicherte Werte. Antwortete jemand auf
   * eine Rückfrage IM CHAT, kam das nie beim Generator an — er fragte dasselbe
   * ein zweites Mal, und bei einem Slot ohne eigenes Eingabefeld gab es gar
   * keinen Weg mehr nach vorn.
   *
   * Es geht wie Startkarte und Website-Text NICHT in den `inputHash`: der
   * beschreibt den Stand der Quell-SLOTS. Eine neue Chat-Antwort macht einen
   * bestehenden Entwurf also nicht still „veraltet" — die Neuerzeugung stösst
   * der Mensch selbst an.
   */
  conversation: readonly { role: 'george' | 'user' | 'system', body: string }[]
  /** Abbruch durch den Menschen ODER durch eine geschlossene Verbindung. */
  signal: AbortSignal
  /** Jedes Text-Delta genau einmal — hier hängt `message.delta` dran. */
  onDelta: (text: string) => Promise<void> | void
}

export interface BrandSlotDependency {
  slotId: string
  value: string
  /**
   * Menschliche Beschriftung für PROMPTS (Frage/Label aus dem Locale-Katalog,
   * `brandSlotPromptLabel`) — ohne sie druckt der Formatter die Id, und das
   * Modell spricht `a.customerPraise` im Chat nach (Davids Live-Fund
   * 2026-09-03). Optional, weil der inputHash sie nicht kennt und Bestands-
   * Aufrufer ohne Label weiterlaufen.
   */
  label?: string
}

export interface BrandGeneratorResult {
  /** Der SLOT-Wert. Bei `outcome: 'question'` leer — dann wird kein Feld angefasst. */
  draft: string
  /**
   * DER CHAT-ZUG (george-a-4, Audit-Befund B2) — gerahmter Entwurf („worauf es
   * sich stützt · der Entwurf · eine Frage") bzw. die Rückfrage selbst.
   *
   * OPTIONAL, und das ist der ganze Rückwärts-Vertrag: fehlt das Feld, nimmt
   * die Route `draft` — also exakt das Verhalten vor a-4. Ein Generator, der
   * die Rahmung nicht kann, verhält sich damit wie bisher statt gar nicht.
   */
  message?: string
  /**
   * Entwurf (Default) oder Rückfrage. Fehlt das Feld, gilt `'draft'` — ein
   * Generator muss den neuen Zweig nicht kennen, um zu funktionieren.
   */
  outcome?: BrandGenerationOutcome
  model: string
  provider: string
  /** Steigt, sobald sich der Prompt ändert — sie steht im Generations-Eintrag. */
  promptVersion: string
  /** Der Lauf wurde abgebrochen; `draft` ist unvollständig und wird VERWORFEN. */
  aborted: boolean
}

export type BrandSlotGenerator = (context: BrandGeneratorContext) => Promise<BrandGeneratorResult>

/** `'*'` gilt für jeden Baustein, der keinen eigenen Generator hat. */
export type BrandGeneratorScope = BrandStepKey | '*'

/**
 * WER SCHREIBT — und ob dieser Lauf Kontingent kostet.
 *
 * `chargesQuota` ist die eine Auskunft, die die Route braucht und die sie sich
 * nicht selbst zusammenreimen soll: der Dev-Stub rechnet eine Zeichenkette
 * zusammen und schläft fünfmal 60 ms — er kostet nichts, also darf er auch
 * nichts vom Tageskontingent nehmen. Ein `generator === brandDevStubGenerator`
 * an der Aufrufstelle wäre dieselbe Aussage, nur als Identitätsvergleich, den
 * der erste registrierte Wrapper (Logging, Retry) still falsch beantwortet.
 */
export interface BrandGeneratorChoice {
  generator: BrandSlotGenerator
  /** `false` NUR für den Entwicklungs-Ersatz. */
  chargesQuota: boolean
}

const GENERATORS = new Map<BrandGeneratorScope, BrandSlotGenerator>()

export function registerBrandSlotGenerator(scope: BrandGeneratorScope, generator: BrandSlotGenerator): void {
  GENERATORS.set(scope, generator)
}

/** Nur für Beweise/Tests: die Registry leeren. */
export function clearBrandSlotGenerators(): void {
  GENERATORS.clear()
}

/**
 * LÄUFT DER ENTWICKLUNGS-ERSATZ? — `pukalani.brand.devStubGenerator`, EINMAL
 * gelesen.
 *
 * EXPORTIERT seit Paket 4: der Schliess-Aufruf (`brandReview.ts`) braucht
 * dieselbe Auskunft, und zwei Abfragen desselben Schlüssels wären zwei
 * Stellen, an denen jemand später einen Schalter vergisst — eine Marke mit
 * echten Entwürfen und einem Ersatz-Spezialisten (oder umgekehrt) wäre in
 * ihrem Ergebnis von einer echten nicht zu unterscheiden.
 */
export function brandDevStubEnabled(): boolean {
  const config = useAppConfig() as { pukalani?: { brand?: { devStubGenerator?: boolean } } }
  return config.pukalani?.brand?.devStubGenerator === true
}

/**
 * Der zuständige Generator: eigener Baustein, sonst `'*'`, sonst der Dev-Stub
 * (wenn erlaubt). `null` heisst „niemand schreibt hier" — die Route meldet
 * `generation.failed` mit `no_generator`, und der Stand bleibt bearbeitbar.
 */
export function resolveBrandSlotGenerator(stepKey: BrandStepKey): BrandGeneratorChoice | null {
  const registered = GENERATORS.get(stepKey) ?? GENERATORS.get('*')
  if (registered) return { generator: registered, chargesQuota: true }
  return brandDevStubEnabled() ? { generator: brandDevStubGenerator, chargesQuota: false } : null
}

// ── Der KI-Kill-Switch der Laufzeit ────────────────────────────────────────

/**
 * `app_config.brandAiEnabled` (system-038, Default `false`). Gelesen wird die
 * Zeile DIREKT, nicht über `getAppConfig()` — dieselbe Begründung wie bei
 * `readBrandAdmissionMode`: ein `brand`-Feld in der Core-Form hiesse, dass der
 * Core den Layer kennt.
 *
 * FAIL-CLOSED: fehlende Spalte (Deploy vor der Migration), fehlende Zeile oder
 * Lesefehler ⇒ `false`. Ein nicht lesbarer Kill-Switch darf die KI nicht
 * einschalten. Der Preis ist gering und ausdrücklich vorgesehen (§9b.5): ohne
 * KI bleibt der Stand VOLL bearbeitbar, es kommen nur keine neuen Entwürfe.
 */
export async function readBrandAiEnabled(event: H3Event): Promise<boolean> {
  try {
    const config = useRuntimeConfig(event)
    const { tablesDB } = createAdminClient(event)
    const row = await tablesDB.getRow<Models.Row & { brandAiEnabled?: unknown }>({
      databaseId: config.public.appwriteDatabaseId,
      tableId: 'app_config',
      rowId: 'global',
    })
    return row.brandAiEnabled === true
  }
  catch {
    return false
  }
}

// ── inputHash ──────────────────────────────────────────────────────────────

/**
 * Die Quell-Werte eines Slots, in Katalog-Reihenfolge. Genommen wird der
 * GELTENDE Wert (bestätigt vor Entwurf) — der Hash soll sagen, woraus der
 * Entwurf entstand, und das ist der Stand, den der Prompt gesehen hat.
 * Abhängigkeiten OHNE Wert bleiben mit leerem Wert drin: sonst hätten „Slot
 * fehlt" und „Slot ist leer" denselben Hash, und ein nachgetragener Wert
 * bewegte ihn nicht.
 */
export function collectSlotDependencies(
  slotId: string,
  records: Readonly<Record<string, BrandSlotRecord>>,
): BrandSlotDependency[] {
  return dependencyClosure(slotId).map(dependencyId => ({
    slotId: dependencyId,
    value: brandSlotStoredValue(records[dependencyId]),
  }))
}

/** sha256 über die kanonische Zeichenkette aus `shared/brandGeneration.ts`. */
export function brandGenerationInputHash(
  slotId: string,
  locale: string,
  dependencies: readonly BrandSlotDependency[],
): string {
  return createHash('sha256')
    .update(brandGenerationHashInput(slotId, locale, dependencies))
    .digest('hex')
}

// ── Die Sperre ─────────────────────────────────────────────────────────────

const LOCKS = new Map<string, BrandGenerationLockEntry>()

export interface BrandGenerationLockHandle {
  release: () => void
}

/**
 * `null` = jemand generiert hier gerade (die Route antwortet
 * `generation_active`). Sonst die Freigabe, die im `finally` gerufen gehört.
 */
export function acquireBrandGenerationLock(
  profileId: string,
  stepKey: string,
  generationId: string,
): BrandGenerationLockHandle | null {
  const key = brandGenerationLockKey(profileId, stepKey)
  if (brandGenerationLockHeld(LOCKS.get(key), Date.now())) return null
  LOCKS.set(key, { generationId, startedAt: Date.now() })
  return {
    release: () => {
      // Nur die EIGENE Sperre freigeben: hat ein verwaister Eintrag inzwischen
      // einem neuen Lauf Platz gemacht, dürfte dessen Sperre hier nicht fallen.
      if (LOCKS.get(key)?.generationId === generationId) LOCKS.delete(key)
    },
  }
}

// ── Der Burst-Zähler (max. 2 parallele Läufe je Konto) ─────────────────────

const ACTIVE = new Map<string, number>()

/**
 * Wie viele echte Generierungen dieses Kontos laufen GERADE — die Zahl, die
 * `decideBrandAiQuota()` gegen `BRAND_AI_PARALLEL_LIMIT` hält.
 *
 * DIESELBE BEWUSSTE GRENZE WIE DIE SPERRE OBEN: eine Map im Prozess. Bei
 * mehreren Node-Prozessen zählt jeder für sich, aus 2 würden 2×Worker — und das
 * ist hier vertretbar, weil die drei TAGES-Deckel im geteilten Rate-Limit-Store
 * liegen und die Rechnung ohnehin begrenzen. Der Burst-Deckel schützt das
 * TEMPO, nicht die Summe.
 *
 * ZÄHLEN UND BELEGEN SIND ZWEI SCHRITTE, und dazwischen darf kein `await`
 * stehen: Node ist einfädig, also ist die Folge `count → entscheiden → retain`
 * atomar. Ein `await` dazwischen machte aus zwei Läufen drei.
 */
export function countActiveBrandGenerations(userId: string): number {
  return ACTIVE.get(userId) ?? 0
}

export interface BrandGenerationSlotHandle {
  release: () => void
}

/**
 * Einen Platz belegen. Die Freigabe gehört in ein `finally` — und sie ist
 * ABSICHTLICH mehrfach aufrufbar: die Route gibt an mehreren Ausgängen frei,
 * und ein zweimal gezähltes Minus liesse den Zähler ins Negative laufen und
 * damit den Deckel verschwinden.
 */
export function retainBrandGeneration(userId: string): BrandGenerationSlotHandle {
  ACTIVE.set(userId, countActiveBrandGenerations(userId) + 1)
  let released = false
  return {
    release: () => {
      if (released) return
      released = true
      const next = countActiveBrandGenerations(userId) - 1
      if (next > 0) ACTIVE.set(userId, next)
      else ACTIVE.delete(userId)
    },
  }
}

/** Nur für Beweise/Tests: den Burst-Zähler leeren. */
export function clearActiveBrandGenerations(): void {
  ACTIVE.clear()
}

// ── Der Entwicklungs-Ersatz ────────────────────────────────────────────────

function stubSleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const STUB_ORIGIN = 'Dieser Text stammt vom Entwicklungs-Ersatz, nicht von einem Sprachmodell.'
const STUB_OUTLOOK = 'Die echten Prompts kommen mit Phase 2 über dieselbe Generator-Registry.'

interface StubParts {
  head: string
  basis: string
  hint: string
}

/**
 * Die Deltas des Ersatzes — in der FORM, die die Slot-Art verlangt. Gebaut
 * werden Liste und Blöcke von den Schreibern aus `shared/brandSlotFormat.ts`,
 * nicht von Hand: eine zweite Stelle, die „- " voranstellt, ist eine Stelle,
 * die es irgendwann anders macht.
 *
 * Die Stückelung bleibt die Sache des Ersatzes (mehrere Deltas beweisen das
 * Streaming); die FORM bleibt die Sache des Vertrags.
 */
function stubPieces(kind: BrandSlot['schema']['kind'], parts: StubParts): string[] {
  if (kind === 'list') {
    return [parts.head, parts.basis, parts.hint, STUB_ORIGIN]
      .filter(entry => entry.length > 0)
      .map((entry, index, all) => formatBrandSlotList([entry]) + (index < all.length - 1 ? '\n' : ''))
  }

  if (kind === 'structured') {
    const blocks = [
      { label: 'Entwurf', body: parts.head },
      { label: 'Grundlage', body: parts.basis },
      ...(parts.hint ? [{ label: 'Hinweis', body: parts.hint }] : []),
      { label: 'Herkunft', body: STUB_ORIGIN },
    ]
    return blocks.map((block, index) => (
      formatBrandSlotStructured([block]) + (index < blocks.length - 1 ? '\n\n' : '')
    ))
  }

  return [
    `${parts.head} `,
    `${parts.basis} `,
    parts.hint ? `${parts.hint} ` : '',
    `${STUB_ORIGIN} `,
    STUB_OUTLOOK,
  ]
}

/**
 * DETERMINISTISCHER ERSATZ-ENTWURF aus Slot-Id und Abhängigkeits-Werten, in
 * fünf Deltas mit kleinen Pausen. Er macht das Protokoll OHNE KI end-to-end
 * beweisbar: Start, Deltas, Slot, Abschluss, Abbruch — alles echt, nur der Text
 * nicht.
 *
 * Er sagt in seinem eigenen Text, dass er ein Ersatz ist. Ein Stub, der wie ein
 * Ergebnis aussieht, landet irgendwann in einem Screenshot.
 *
 * ── ER HÄLT DIE FORM SEINER SLOT-ART EIN (P2.2) ───────────────────────────
 * Ein Slot der Art `list` oder `structured` ist im Speicher trotzdem Text, und
 * WIE dieser Text aussieht, steht seit P2.2 an EINER Stelle
 * (`shared/brandSlotFormat.ts`): Georges Instruktion verpflichtet das Modell
 * wörtlich darauf, und der Ersatz hier hält sich daran. Vorher war er
 * formblind — die Werkstatt hätte für den Ersatz etwas anderes gezeigt als für
 * den echten Entwurf, und ein Beweis am Stub hätte über den echten Weg nichts
 * mehr ausgesagt.
 */
export const brandDevStubGenerator: BrandSlotGenerator = async (context) => {
  const filled = context.dependencies.filter(dependency => dependency.value.trim().length > 0)
  const basis = filled.length
    ? `Gestützt auf ${filled.length} Vorentscheidung${filled.length === 1 ? '' : 'en'}: `
      + `${filled.slice(0, 3).map(dependency => dependency.value.slice(0, 60)).join(' · ')}.`
    : 'Noch ohne Vorentscheidungen — gestützt allein auf die Startkarte.'

  const pieces = stubPieces(context.slot.schema.kind, {
    head: `Entwurf für ${context.slot.id} (${context.locale}, Pfad ${context.pathKind}).`,
    basis,
    hint: context.hint ? `Hinweis aufgenommen: ${context.hint}.` : '',
  }).filter(piece => piece.length > 0)

  let draft = ''
  for (const piece of pieces) {
    if (context.signal.aborted) break
    draft += piece
    await context.onDelta(piece)
    await stubSleep(60)
  }

  return {
    draft,
    // Der Ersatz entwirft IMMER. Eine Rückfrage zu würfeln hiesse, das
    // §3e-Protokoll mit einem Zufall zu beweisen — und der Zweig hat mit
    // `georgeTurn.ts` seinen eigenen, deterministischen Beweis.
    outcome: 'draft',
    model: 'dev-stub',
    provider: 'local',
    promptVersion: 'stub-1',
    aborted: context.signal.aborted,
  }
}
