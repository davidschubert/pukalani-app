import { formatBrandSlotStructured } from './brandSlotFormat'

/**
 * DIE KI-ENTWÜRFE DES ZEICHENS — die REGELN, pur (Konzept
 * docs/archiv/BRAND-DESIGN.md §2.5 Stufe 3, Davids Entscheidung §1.11 b,
 * Paket D5c).
 *
 * ── WAS EIN ENTWURF IST UND WAS NICHT ─────────────────────────────────────
 * Ein Entwurf ist eine IDEE für die Designer-Arbeit. Er ist kein Logo, er ist
 * nicht geprüft, und er sagt nichts über Schutzfähigkeit. Das ist keine
 * Zurückhaltung aus Höflichkeit, sondern §1.4 und §1.11 b: das Produkt
 * verspricht kein Logo, und der Satz dazu steht auf dem Bildschirm, nicht in
 * einer Hilfeseite. Deshalb tragen die zwei Sätze hier eigene i18n-Schlüssel
 * und sind nicht in einer Karte versteckt.
 *
 * ── DIE HERKUNFT GEHÖRT ZUM ENTWURF ───────────────────────────────────────
 * Modell, Datum und Prompt-Hash sind Teil der Karte (Leitplanke aus §1.11 b),
 * nicht Diagnose. Der HASH und nicht der Prompt: der Prompt trägt Foundation-
 * Inhalte, und was hier stehen soll, ist nur „diese vier stammen aus demselben
 * Lauf" und „das war ein anderer Prompt als vorhin".
 *
 * ── ER REIST NICHT ────────────────────────────────────────────────────────
 * `j.drafts` ist `type: 'special'` und `sensitivity: 'internal'` (Registry) —
 * er wird NIE `confirmed` (dieselbe härtere Fassung wie bei `g.inspiration`,
 * D2a), und der Slot-Wert trägt REFERENZEN, nie ein Bild und nie eine Adresse.
 * Snapshot, Share, Beispiel und Dokument sehen davon nichts.
 *
 * PURE: kein Vue, kein i18n, kein H3, kein Appwrite, kein node:crypto.
 */

/** Die Session, deren Wert die behaltenen Entwürfe beschreibt. */
export const BRAND_MARK_DRAFTS_SLOT_ID = 'j.drafts'

/**
 * WIE VIELE ENTWÜRFE EIN LAUF ERZEUGT (§2.5 Stufe 3: „4 Entwürfe").
 *
 * Vier, weil vier auf einen Blick vergleichbar sind und weil jeder einzelne
 * Geld kostet. Dieselbe Zahl klemmt der Core-Transport (`AI_IMAGE_MAX_IMAGES`)
 * — läge sie dort tiefer, käme ein bestellter Entwurf nicht an.
 */
export const BRAND_MARK_DRAFTS_PER_RUN = 4

/**
 * WIE VIELE ENTWÜRFE EINE MARKE INSGESAMT HÄLT.
 *
 * Drei Läufe am Tag à vier Entwürfe, und die Läufe von gestern liegen noch da:
 * ohne Deckel wüchse der Bucket einer einzigen Marke unbegrenzt. Zwölf ist
 * dieselbe Zahl wie bei den Vorbildern und aus demselben Grund — mehr als
 * zwölf Karten sieht sich niemand an. Erreicht ist er ein 409, kein stilles
 * Wegwerfen der ältesten: was der Mensch behalten hat, entfernt der Mensch.
 */
export const BRAND_MARK_DRAFTS_MAX = 12

/** Der Name auf der Karte — er ist Anzeige und darf keinen Roman tragen. */
export const BRAND_MARK_DRAFT_TITLE_MAX = 120

/**
 * EIN ENTWURF, wie ihn die Werkstatt sieht. KEIN Bild-Inhalt: das Bild holt
 * die Ausliefer-Route einzeln, und zwar nur für den Besitzer (§2.13).
 */
export interface BrandMarkDraftEntry {
  /** = `fileId` = Zeilen-Id (Migration brand-023). Eine Wahrheit, ein Name. */
  readonly id: string
  readonly title: string
  /** Modell-Kennung ohne Schlüssel — sie steht auf der Karte. */
  readonly model: string
  /** 16 Zeichen; zwei Entwürfe desselben Laufs tragen denselben Wert. */
  readonly promptHash: string
  readonly kept: boolean
  readonly createdAt: string
}

/**
 * DER PROMPT-HASH — 16 Hex-Zeichen, deterministisch, ohne `node:crypto`.
 *
 * ── WARUM KEIN SHA-256 ────────────────────────────────────────────────────
 * Die Datei ist pur und wird auch im Browser gelesen (die Karte zeigt den
 * Wert); `node:crypto` wäre dort nicht da, und `crypto.subtle` ist async — ein
 * `await` für eine Anzeige-Zeile. Und die Frage, die dieser Wert beantwortet,
 * ist keine Sicherheitsfrage, sondern „stammen diese zwei Karten aus demselben
 * Prompt?". Dafür reicht eine Streuung, die zufällige Kollisionen
 * ausschliesst.
 *
 * Zwei unabhängige FNV-1a-Läufe (verschiedene Startwerte) ergeben zusammen
 * 64 Bit. `>>> 0` nach jeder Runde, weil JavaScript sonst in Fliesskommazahlen
 * rechnet und der Wert plattformabhängig würde.
 */
export function brandMarkPromptHash(prompt: string): string {
  const round = (seed: number): string => {
    let hash = seed
    for (let index = 0; index < prompt.length; index++) {
      hash ^= prompt.charCodeAt(index)
      // FNV-Primzahl 16777619, als Summe von Schiebungen (Math.imul wäre auch
      // richtig; so bleibt die Rechnung in 32 Bit sichtbar).
      hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
  }
  return `${round(0x811C9DC5)}${round(0x01000193)}`
}

/** Der Vorgabe-Name eines Entwurfs — „Entwurf 3" / „Draft 3". */
export function brandMarkDraftTitle(index: number, locale: string): string {
  return locale === 'en' ? `Draft ${index}` : `Entwurf ${index}`
}

/**
 * DEN NAMEN KLEMMEN. Leerzeilen weg, auf eine Zeile zusammengezogen, auf die
 * Länge geschnitten — ein Name ist eine Zeile, und ein PATCH ist Client-Eingabe.
 */
export function clampBrandMarkDraftTitle(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, BRAND_MARK_DRAFT_TITLE_MAX)
}

/** Die Beschriftungen der Herkunfts-Zeile — der Server hat kein i18n. */
export interface BrandMarkDraftSlotLabels {
  /** „Behalten" bzw. „Kept" — die Überschrift je Block. */
  readonly kept: string
  /** „Modell" bzw. „Model". */
  readonly model: string
  /** „Prompt" — in beiden Sprachen dasselbe Wort, trotzdem übergeben. */
  readonly prompt: string
}

/**
 * DER SLOT-WERT VON `j.drafts` — die BEHALTENEN Entwürfe als Referenzen.
 *
 * ── WAS DRINSTEHT UND WAS NICHT ───────────────────────────────────────────
 * Je behaltenem Entwurf sein Name und seine HERKUNFT (Modell, Prompt-Hash).
 * KEIN Bild, KEINE Adresse, KEINE Bucket-Id als Pfad — dieselbe Regel wie bei
 * `g.inspiration` (D2a, Leitplanke „Bilder sind Eingabe, nie Ausgabe", hier:
 * Entwürfe sind Zwischenergebnis, nie Ausgabe). Die Zeilen-Id steht als
 * REFERENZ dabei, damit die Werkstatt den Slot-Wert einer Karte zuordnen kann;
 * sie ist ohne Session und Besitzprüfung wertlos, weil der Bucket
 * `permissions: []` hat.
 *
 * ── VERWORFEN IST NICHT „NICHT BEHALTEN" ──────────────────────────────────
 * Ein Entwurf, den niemand behalten hat, steht hier nicht — auch nicht als
 * „nicht behalten". Der Slot beschreibt die ENTSCHEIDUNG des Menschen, und
 * eine Liste von Nicht-Entscheidungen wäre keine.
 *
 * Ohne behaltenen Entwurf ist der Wert LEER, und der Slot verschwindet dann
 * ganz (s. `syncBrandMarkDraftsSlot`): „fehlt" heisst in diesem Datensatz
 * überall dasselbe wie „nichts drin".
 */
export function brandMarkDraftsSlotValue(
  entries: readonly BrandMarkDraftEntry[],
  labels: BrandMarkDraftSlotLabels,
): string {
  const kept = entries.filter(entry => entry.kept)
  if (kept.length === 0) return ''
  return formatBrandSlotStructured(kept.map((entry, index) => ({
    label: `${labels.kept} ${index + 1} · ${entry.title}`,
    /**
     * EINE Zeile, getrennt durch `·` und nicht durch Zeilenumbrüche: die Form
     * `structured` zieht den Rumpf ohnehin auf eine Zeile zusammen
     * (`formatBrandSlotStructured` → `oneLine`), und drei mit Leerzeichen
     * aneinandergeklebte Sätze lasen sich im eigenen Klick wie ein Tippfehler.
     */
    body: [
      `${labels.model}: ${entry.model || '—'}`,
      `${labels.prompt}: ${entry.promptHash || '—'}`,
      `Id: ${entry.id}`,
    ].join(' · '),
  })))
}

/** Die Ablehnungsgründe, die als `data.code` reisen (createError-Regel). */
export type BrandMarkDraftsRejection =
  /** Kein Bild-Modell oder KI dieser Instanz aus — das Kapitel läuft weiter. */
  | 'image_unavailable'
  /** Der Lauf lief, das Modell lieferte kein brauchbares Bild. */
  | 'drafts_failed'
  /** Zwölf Entwürfe liegen schon da (s. `BRAND_MARK_DRAFTS_MAX`). */
  | 'drafts_limit_reached'
  /** Kein bestätigtes Briefing — es gibt nichts, woraus zu entwerfen wäre. */
  | 'drafts_no_brief'
