import { z } from 'zod'
import type { MarketFrequency, MarketProfileField, MarketSourceOption } from './marketProfile'
import { MARKET_EVIDENCE_MAX, MARKET_FIELD_IDS } from './marketProfile'
import { MARKET_MAX_PAGES } from './marketCrawlRules'
import { MARKET_LIBRARY_ENTRIES, MARKET_LIBRARY_VERSION } from './library'
import { marketLibraryEntryIsStale } from './marketLibraryAge'

/**
 * DIE KURATIERTE BIBLIOTHEK (Plan §7.2 Nr. 3) — die MECHANIK, nicht der
 * Inhalt.
 *
 * ── WAS SIE IST ───────────────────────────────────────────────────────────
 * Fertige Marktprofile bekannter Marken, VON HAND geprüft und im Repo
 * versioniert. Ein Kandidat mit `sourceKind: 'library'` wird beim Lauf NICHT
 * abgerufen — es gibt nichts zu holen, das Profil steht schon da. Zweck (§7.2):
 * Beispiele und Kalibrierung, ohne dass jeder Kunde dieselben fünf grossen
 * Websites erneut liest.
 *
 * ── WARUM SIE IM REPO LIEGT UND NICHT IN DER DATENBANK ───────────────────
 * Anhang B sagt es ausdrücklich: `market_library` geht nie in die Datenbank.
 * Ein Bibliotheks-Eintrag ist eine REDAKTIONELLE Aussage über eine fremde
 * Marke — sie gehört in die Versionsgeschichte, in ein Diff und in ein Review,
 * nicht in eine Zeile, die jemand nachts in der Konsole ändert. Und weil sie
 * versioniert ist, kann `MARKET_LIBRARY_VERSION` in den Bericht-Schlüssel
 * eingehen: eine korrigierte Bibliothek macht bestehende Berichte `stale`,
 * genau wie eine korrigierte eigene Aussage.
 *
 * ── WARUM SIE ZITATE TRAGEN DARF (§7.2 Nr. 3 gegen §7.6) ─────────────────
 * Der Prototyp zeigte Bibliotheks-Einträge nur mit NAMEN, ohne Beleg. Der Plan
 * verlangt für sie aber „nur wörtliche Zitate" — und beides zusammen ergibt
 * die Regel, die hier durchgesetzt wird: ein Bibliotheks-Feld MUSS eine
 * Quell-Adresse haben und DARF ein Zitat tragen; ohne Zitat bleibt es eine
 * Zusammenfassung ohne Beleg und ist damit genau das, was §1.4 dem Produkt
 * verbietet. Der Unterschied zur Website-Quelle ist NICHT die Beweislast,
 * sondern WER geprüft hat: dort eine Maschine gegen den Rohtext (`evidence ⊂
 * rawText`), hier ein MENSCH mit Datum und Namenszeichen (`verifiedAt`,
 * `verifiedBy`). Deshalb steht der Beleg-Riegel der Extraktion hier nicht zur
 * Verfügung — es gibt keinen Rohtext mehr, gegen den er prüfen könnte —, und
 * deshalb ist die Handprüfung Pflichtfeld statt Kür.
 *
 * ── WAS HIER STEHT: NUR ECHTE, VON HAND GEPRÜFTE MARKEN (M6b) ────────────
 * Bis zum 2026-09-06 lagen in `shared/library/index.ts` zwei ERFUNDENE
 * Einträge (`.example`-Adressen) als Platzhalter der Mechanik. Seit dem
 * Gate-Flip läuft der Marktvergleich in Produktion — damit standen zwei
 * Marken im Quellen-Wähler zahlender Kunden, die es nicht gibt. Sie sind
 * herausgenommen und leben als Testvorlage weiter
 * (`tests/fixtures/marketLibraryFixture.ts`); die ausgelieferte Datei enthält
 * nur noch Einträge, deren Zitate ein Mensch am Original geprüft hat.
 * `tests/marketLibrary.test.ts` dreht die alte Sperre um und verlangt
 * ausdrücklich ECHTE Hosts.
 *
 * ── DER WEG DAHIN (seit M6 gebaut, seit M6b gegangen) ─────────────────────
 * `scripts/market-library-compute.mjs` rechnet Einträge vor (`--check`
 * Machbarkeit, `--compute` Rechnen, `--promote` Übernahme), das Runbook
 * `docs/runbooks/MARKTVERGLEICH-BIBLIOTHEK.md` führt die Handprüfung. Was das
 * Werkzeug erzeugt, ist ein ENTWURF (`marketLibraryDraftSchema`) und fällt
 * durch das Bibliotheks-Schema — `status: 'verified'` ist der eine Wert, den
 * kein Werkzeug setzt.
 */

const fieldIdSchema = z.enum(MARKET_FIELD_IDS)

/**
 * DIE HÄUFIGKEIT — dieselbe Form wie im Marktprofil.
 *
 * Sie steht hier als eigenes kleines Schema und nicht als Import aus
 * `shared/types/market.ts`: jene Datei ist der ABLAGE-Vertrag und zieht
 * `node-appwrite` herein, diese hier ist reiner Produkt-Inhalt. Damit daraus
 * trotzdem keine zweite Wahrheit wird, ist das Schema an den Produkt-Typ
 * `MarketFrequency` GENAGELT — laufen die beiden auseinander, bricht der
 * Typecheck, nicht erst ein Test.
 */
const frequencySchema: z.ZodType<MarketFrequency> = z.object({
  pages: z.number().int().min(0),
  of: z.number().int().min(0),
})

/**
 * EIN FELD EINES BIBLIOTHEKS-EINTRAGS.
 *
 * `sourceUrl` ist PFLICHT, auch ohne Zitat: „woher wisst ihr das" muss immer
 * beantwortbar sein. `quote` ist optional, weil nicht jedes der zehn Felder
 * wörtlich auf einer Seite steht (Tonwörter sind eine Beobachtung), und
 * unterliegt derselben Zitatschranke wie überall (≤ 200 Zeichen).
 */
export const marketLibraryFieldSchema = z.object({
  fieldId: fieldIdSchema,
  value: z.string().trim().min(1).max(2000),
  items: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  sourceUrl: z.url().max(512),
  quote: z.string().trim().min(1).max(MARKET_EVIDENCE_MAX).optional(),
  confidence: z.enum(['stated', 'implied']).optional(),
  /**
   * AUF WIE VIELEN DER GELESENEN SEITEN DIE AUSSAGE STAND (§7.6, seit M6b).
   *
   * OPTIONAL, und zwar mit derselben Bedeutung wie überall im Marktprofil:
   * fehlt sie, wurde NICHT gezählt. Beides kommt hier vor — ein Eintrag aus
   * `--compute` trägt die Zahl aus dem Lauf, ein von Hand geschriebener
   * Eintrag hat nichts gezählt. Was es NICHT geben darf, ist eine Zahl ohne
   * Messung: sie sähe in der Oberfläche aus wie eine (`MkCellMeta` zeigt
   * „auf 2 von 3 Seiten"), und eine erfundene Messung ist genau die
   * Behauptung, die §1.4 dem Produkt verbietet. Deshalb reicht das Werkzeug
   * sie durch, statt sie zu setzen.
   */
  frequency: frequencySchema.optional(),
})

export const marketLibraryEntrySchema = z.object({
  /** Der stabile Schlüssel — er steht in `market_competitors.sourceRef`. */
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  /**
   * DER ZUSTAND — und er kennt hier genau EINEN erlaubten Wert (MV1 M6).
   *
   * Das Werkzeug `scripts/market-library-compute.mjs` rechnet Einträge
   * MASCHINELL vor und legt sie als ENTWURF unter `shared/library/drafts/`
   * ab (`status: 'draft'`, `verifiedAt`/`verifiedBy` null). Ein Entwurf ist
   * eine Behauptung über einen Dritten, die noch niemand am Original geprüft
   * hat — er darf die Bibliothek deshalb nicht erreichen, auch nicht durch
   * ein versehentliches Kopieren der Datei in `index.ts`.
   *
   * Vor M6 hing genau das an der Disziplin: `verifiedAt`/`verifiedBy` waren
   * Pflicht, aber ein Werkzeug, das sie mit dem heutigen Datum und seinem
   * eigenen Namen füllt, hätte das Schema bestanden. Ein Wert, den nur ein
   * MENSCH setzen darf, macht aus der Zusage eine Prüfung: `--promote`
   * verweigert die Übernahme, solange er auf `draft` steht.
   */
  status: z.literal('verified'),
  name: z.string().trim().min(1).max(200),
  /** Die Adresse der Marke — Herkunft der Belege, kein Abruf-Ziel. */
  homepage: z.url().max(512),
  /** Grobe Einordnung für den Quellen-Wähler (M4). */
  category: z.string().trim().max(120).default(''),
  /** WANN ein Mensch das geprüft hat — ohne Datum ist es keine Handprüfung. */
  verifiedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** WER — ein Kürzel genügt, aber niemand darf es leer lassen. */
  verifiedBy: z.string().trim().min(2).max(80),
  fields: z.array(marketLibraryFieldSchema).min(1).max(MARKET_FIELD_IDS.length),
})

/**
 * DER ENTWURF — dieselbe Form, aber ausdrücklich UNGEPRÜFT (MV1 M6).
 *
 * Er ist das, was `scripts/market-library-compute.mjs --compute` schreibt: die
 * Felder stehen schon in Bibliotheks-Form, die Handprüfung fehlt. Die drei
 * Unterschiede sind ABSICHTLICH keine Auslassungen, sondern gesetzte Werte —
 * `null` sagt „hier war noch niemand", ein fehlendes Feld sagt nur „unbekannt",
 * und im Entwurf ist der Unterschied das Wesentliche.
 *
 * `computed` trägt die Herkunft der Rechnung (wann, womit, aus welchen
 * Seiten). Sie ist für die HANDPRÜFUNG da — wer ein Zitat gegen die Quelle
 * hält, will wissen, welcher Lauf es geholt hat — und wird beim Übernehmen
 * verworfen: in der Bibliothek steht, wer GEPRÜFT hat, nicht wer gerechnet hat.
 */
export const marketLibraryDraftSchema = marketLibraryEntrySchema.extend({
  status: z.literal('draft'),
  verifiedAt: z.null(),
  verifiedBy: z.null(),
  computed: z.object({
    at: z.string().min(1).max(40),
    /** `stub` = ohne bezahlten Aufruf gerechnet, `paid` = echter Modell-Lauf. */
    mode: z.enum(['stub', 'paid']),
    tool: z.string().min(1).max(120),
    /** Die Seiten, aus denen die Belege stammen — der Prüfpfad des Menschen. */
    pages: z.array(z.url().max(512)).max(MARKET_MAX_PAGES),
  }),
})

export const marketLibrarySchema = z.object({
  /**
   * Die Fassung der Bibliothek. Sie geht in den Bericht-Schlüssel ein —
   * wer einen Eintrag ändert, hebt sie, sonst behält ein gespeicherter Bericht
   * seine alten Sätze und hält sich für aktuell.
   */
  version: z.string().trim().min(1).max(40),
  entries: z.array(marketLibraryEntrySchema).max(200),
})

export type MarketLibraryField = z.infer<typeof marketLibraryFieldSchema>
export type MarketLibraryEntry = z.infer<typeof marketLibraryEntrySchema>
export type MarketLibraryDraft = z.infer<typeof marketLibraryDraftSchema>
export type MarketLibrary = z.infer<typeof marketLibrarySchema>

/**
 * DIE GEPRÜFTE BIBLIOTHEK — EINMAL beim ersten Zugriff gegen das Schema
 * gehalten, danach gemerkt.
 *
 * FAIL-CLOSED: eine kaputte Bibliothek ist LEER, nicht „so gut wie möglich".
 * Ein halb gelesener Eintrag wäre ein Marktprofil ohne die Felder, die der
 * Redakteur für die wichtigsten hielt — und niemand sähe, dass etwas fehlt.
 * Der Unit-Test hält die ausgelieferte Datei gegen dasselbe Schema; sie kann
 * also nur kaputt sein, wenn jemand am Wächter vorbei committet.
 */
let cached: MarketLibrary | null = null

export function marketLibrary(): MarketLibrary {
  if (cached) return cached
  const parsed = marketLibrarySchema.safeParse({
    version: MARKET_LIBRARY_VERSION,
    entries: MARKET_LIBRARY_ENTRIES,
  })
  cached = parsed.success ? parsed.data : { version: MARKET_LIBRARY_VERSION, entries: [] }
  return cached
}

export function marketLibraryVersion(): string {
  return marketLibrary().version
}

export function marketLibraryEntry(key: string): MarketLibraryEntry | undefined {
  return marketLibrary().entries.find(entry => entry.key === key)
}

/**
 * ALLE EINTRÄGE — für den Quellen-Wähler (MV1 M4).
 *
 * Er braucht die LISTE, nicht einen Schlüssel; sie ist dieselbe geprüfte
 * Menge wie überall (`marketLibrary()` ist fail-closed: fällt die Datei durch
 * das Schema, ist die Bibliothek leer, und der Wähler zeigt dann eben
 * nichts). Eine zweite Leseroutine daneben wäre der zweite Ort, an dem eine
 * kaputte Datei anders behandelt wird.
 */
export function marketLibraryEntries(): readonly MarketLibraryEntry[] {
  return marketLibrary().entries
}

/**
 * DIE 90-TAGE-REGEL (seit 2026-09-06) — hier ist ihre TÜR, ihr Zuhause ist
 * `marketLibraryAge.ts`.
 *
 * Sie liegt in einer eigenen, IMPORTFREIEN Datei, weil
 * `scripts/market-library-compute.mjs` sie direkt als `.ts` lädt und Nodes
 * ESM-Auflösung die erweiterungslosen Pfade dieses Baums nicht kennt (die
 * Begründung steht dort ausführlich). Alles im Nuxt-Baum importiert sie von
 * HIER — eine zweite Adresse für dieselbe Regel wäre der Anfang zweier
 * Antworten auf die Frage, ob ein Eintrag noch gilt.
 */
export {
  MARKET_LIBRARY_MAX_AGE_DAYS,
  marketLibraryEntryAge,
  marketLibraryEntryIsStale,
} from './marketLibraryAge'

/** Die überfälligen Einträge der ausgelieferten Bibliothek — für den Wächter. */
export function staleMarketLibraryEntries(
  library: MarketLibrary,
  now: Date,
): readonly MarketLibraryEntry[] {
  return library.entries.filter(entry => marketLibraryEntryIsStale(entry, now))
}

/**
 * EIN EINTRAG ALS WÄHLBARE ZEILE DES QUELLEN-WÄHLERS (M4) — MIT Alter.
 *
 * Sie steht hier und nicht in der Route, aus zwei Gründen. Erstens ist sie
 * PRÜFBAR, ohne einen Nitro-Kontext zu bauen; zweitens beantwortet sie die
 * Frage „was zeigen wir von einer fremden Marke?" an EINER Stelle — Wortname,
 * Kategorie, Adresse und seit heute das Prüfdatum. Kein Logo, keine Bildmarke
 * (Anhang G a).
 *
 * `stale` WIRD HIER GERECHNET und nicht im Browser: SSR und Client stünden
 * sonst an der Tagesgrenze auf zwei verschiedenen Antworten, und der Kunde
 * bekäme einen Hydration-Fehler für eine Frage, die der Server längst
 * beantwortet hat. Der Client formatiert nur noch das Datum.
 */
export function marketLibrarySourceOption(entry: MarketLibraryEntry, now: Date): MarketSourceOption {
  return {
    id: entry.key,
    label: entry.name,
    ...(entry.category ? { hint: entry.category } : {}),
    url: entry.homepage,
    verifiedAt: entry.verifiedAt,
    ...(marketLibraryEntryIsStale(entry, now) ? { stale: true } : {}),
  }
}

/**
 * EIN BIBLIOTHEKS-EINTRAG ALS MARKTPROFIL — dieselbe Form wie jede andere
 * Quelle (Plan §7.1: „ein Motor, drei Ansichten"; die gemeinsame Währung ist
 * das Marktprofil).
 *
 * `frequency` REICHT DURCH, WENN SIE DASTEHT (M6b): sie ist eine MESSUNG des
 * Laufs, der den Eintrag vorgerechnet hat (§7.6), und ein Eintrag, der sie
 * mitbringt, hat sie gezählt. Fehlt sie, wird KEINE erfunden — eine Zahl ohne
 * Messung sähe in der Zelle aus wie eine (dieselbe Begründung wie bei der
 * Foundation-Quelle, die nichts wiederholt, sondern beschliesst).
 *
 * `fetchedAt` ist das PRÜFDATUM. Es ist kein Abrufdatum, aber es beantwortet
 * dieselbe Frage — „wie alt ist diese Aussage" —, und ein leeres Feld an der
 * Stelle liesse die Oberfläche behaupten, der Beleg sei von heute.
 */
export function marketLibraryFields(entry: MarketLibraryEntry): MarketProfileField[] {
  return entry.fields.map((field) => {
    const base: MarketProfileField = {
      fieldId: field.fieldId,
      value: field.value,
      ...(field.items?.length ? { items: field.items } : {}),
      source: 'library',
      ...(field.frequency ? { frequency: field.frequency } : {}),
    }
    if (!field.quote) return base
    return {
      ...base,
      evidence: {
        quote: field.quote,
        sourceUrl: field.sourceUrl,
        fetchedAt: entry.verifiedAt,
        confidence: field.confidence ?? 'stated',
      },
    }
  })
}
