/**
 * DIE FREISCHALTUNG DER ABLEITUNG — DIE PURE ENTSCHEIDUNG (Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.8, Paket K1).
 *
 * ── EINE SCHRANKE, ZWEI PRODUKTE ──────────────────────────────────────────
 * „Die Ableitung" ist der bezahlte Teil (§1.11 d, BS1 §3): Brand Book & Kit
 * (Schicht 3) UND der Marktvergleich hängen an DEMSELBEN Ja. Ein Schalter je
 * Produkt hätte zwei Wahrheiten über denselben Zustand erzeugt — und die zweite
 * wäre beim ersten Verkauf falsch gewesen.
 *
 * ── DREI SCHREIBER, EINE REGEL ────────────────────────────────────────────
 *   (1) BETA-KONTO — schreibt NICHTS. Die Zusage aus BS1 Entscheidung 6
 *       („Beta-Konten dauerhaft frei") gilt je KONTO (`brand_access`), nicht je
 *       Marke; ein Backfill in die Zeilen wäre die Zusage an der falschen
 *       Stelle und stünde nach einem Widerruf immer noch da.
 *   (2) BETREIBER-KNOPF — `derivationUnlockedAt` + `via: 'operator'`.
 *   (3) STRIPE-WEBHOOK (BS1 Z1, später) — dieselben Spalten, `via: 'purchase'`.
 *
 * ── `betaAccount` WIRD ÜBERGEBEN, NIE HIER ERMITTELT (§2.17) ──────────────
 * Diese Datei liest keine Tabelle und kennt kein Appwrite. Der Grund steht im
 * Konzept: „ein zweiter Leser der Beta-Wahrheit wäre ein Leck". Die Wahrheit
 * darüber, ob ein KONTO in der Beta ist, steht an EINER Stelle
 * (`decideBrandAccess`/`brandAccountIsBeta` in `brandAccess.ts`, gelesen im
 * Zugangs-Gate jeder privaten Route); hier kommt sie als TATSACHE herein. Wer
 * sie hier nachschlüge, hätte eine zweite Fassung des Beta-Begriffs — und die
 * eine davon würde beim nächsten Widerruf nicht mitziehen.
 *
 * ── DER GRUND REIST MIT ───────────────────────────────────────────────────
 * `grant` sagt nicht nur DASS, sondern WARUM: die Betreiber-Liste zeigt „Frei
 * seit … · via …", und ab Z1 stehen Zusage und Kauf nebeneinander. Ein blosses
 * Ja/Nein hätte im Streitfall keine Auskunft.
 *
 * PUR wie `resolveBrandJourney` und `resolveMarketPaywall`: dieselbe Rechnung
 * läuft im Browser (Anzeige) und auf dem Server (Durchsetzung), und sie ist
 * ohne laufende Instanz prüfbar.
 */

/** Die Herkunft, die in der Spalte `derivationUnlockedVia` stehen darf. */
export const BRAND_DERIVATION_VIAS = ['operator', 'purchase'] as const
export type BrandDerivationVia = (typeof BRAND_DERIVATION_VIAS)[number]

/**
 * Woher die Freischaltung kommt. `none` = keine — die Schranke steht.
 * `beta` hat KEINE Spalte (s. Kopf) und ist deshalb kein `BrandDerivationVia`.
 */
export type BrandDerivationGrant = 'beta' | BrandDerivationVia | 'none'

export interface BrandDerivationInput {
  /**
   * Hat das KONTO einen gültigen Beta-Zugang (`brand_access`, nicht
   * widerrufen)? Wird übergeben, nie hier ermittelt (s. Kopf).
   */
  readonly betaAccount: boolean
  /** `brand_profiles.derivationUnlockedAt` — `null`/`''` heisst „nicht freigeschaltet". */
  readonly unlockedAt?: string | null
  /** `brand_profiles.derivationUnlockedVia` — unbekannte Werte s. `normalizeBrandDerivationVia`. */
  readonly via?: string | null
}

export interface BrandDerivationAccess {
  readonly unlocked: boolean
  readonly grant: BrandDerivationGrant
}

/**
 * DIE HERKUNFT AUS DER SPALTE — mit einer bewussten Fail-Richtung.
 *
 * Unbekannt, leer oder fehlend ⇒ `'operator'`. Das ist die ZURÜCKHALTENDE
 * Auskunft: ein `'purchase'` ohne Beleg wäre die Behauptung einer Zahlung, die
 * niemand sehen kann. Der Fall tritt genau einmal auf — bei einer Zeile aus der
 * Zeit vor brand-025, in der ein Datum, aber noch keine Herkunft steht (heute
 * gibt es keine solche Zeile; die Spalten kommen zusammen).
 */
export function normalizeBrandDerivationVia(value: unknown): BrandDerivationVia {
  return value === 'purchase' ? 'purchase' : 'operator'
}

/**
 * IST DIE ABLEITUNG FÜR DIESE MARKE OFFEN? — und wenn ja, warum.
 *
 * ── DAS FELD SCHLÄGT DIE BETA, WENN BEIDES GILT ──────────────────────────
 * Nicht weil es „mehr" wäre, sondern weil es die SPEZIFISCHERE Auskunft ist:
 * ein Kauf oder eine Betreiber-Zusage steht für DIESE Marke, mit Datum und
 * Urheber, und ist widerrufbar; die Beta ist die allgemeine Zusage an das
 * Konto. Stünde es umgekehrt, verschwände die Herkunft „purchase" aus der
 * Betreiber-Liste, sobald der Käufer zufällig auch Beta-Konto ist — und genau
 * das ist heute jeder Käufer.
 *
 * Am `unlocked` ändert die Reihenfolge nichts: beide Wege sagen Ja.
 */
export function resolveDerivationAccess(input: BrandDerivationInput): BrandDerivationAccess {
  const unlockedAt = typeof input.unlockedAt === 'string' ? input.unlockedAt.trim() : ''
  if (unlockedAt.length > 0) {
    return { unlocked: true, grant: normalizeBrandDerivationVia(input.via) }
  }
  if (input.betaAccount) return { unlocked: true, grant: 'beta' }
  return { unlocked: false, grant: 'none' }
}
