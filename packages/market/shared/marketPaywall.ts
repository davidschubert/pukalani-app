/**
 * DIE SCHRANKE (Plan §1.9, Davids Entscheidung 3 in §6) — PUR.
 *
 * ── WAS SIE IST ───────────────────────────────────────────────────────────
 * „Frei bauen, bezahlt anwenden": die Foundation ist der Trichter, der
 * Marktvergleich ist die ANWENDUNG und damit der bezahlte Teil. Die Seite
 * „Markt" existiert von Tag eins, zeigt was sie tut und nennt den Preis-Anker
 * („Preis im Erstgespräch"); gesperrt ist nur die HANDLUNG, die Geld kostet —
 * der Lauf.
 *
 * ── WARUM DIE RECHNUNG HIER STEHT UND NICHT IN DER SEITE ─────────────────
 * Weil sie beide Zustände haben muss und heute nur einer vorkommt. Der
 * einzige Weg auf die Seite führt über das Beta-Gate des Wizards
 * (`requireBrandAccess`, 404 ohne Zugang) — wer sie sieht, hat ein
 * Beta-Konto, und Beta-Konten sind freigeschaltet. Eine Seite, die das per
 * `true` fest verdrahtete, hätte den gesperrten Zweig als toten Code, und
 * toter Code ist nach dem dritten Umbau falscher Code. Diese Funktion macht
 * daraus eine TATSACHE mit zwei möglichen Antworten, die ein Test beide
 * stellen kann.
 *
 * ── DIE ZUTEILUNG JE BRANDING IST SEIT K1 DA ────────────────────────────
 * §1.9 sah sie vor („die Schranke ist eine Zuteilung — sie entscheidet je
 * Branding und nie je Deployment"), und BS1 §4.1 (b) hat sie bestellt. Gebaut
 * ist sie im brand-Layer als EIN Feld an der Marke
 * (`brand_profiles.derivationUnlockedAt`, Migration brand-025, Konzept
 * docs/plans/BRAND-BOOK-KIT.md §2.8): „die Ableitung" — dieselbe Schranke, die
 * Brand Book & Kit öffnet. Genau EIN Ja für zwei Produkte; zwei Schalter wären
 * zwei Wahrheiten über denselben Kauf gewesen.
 *
 * Diese Funktion hat dafür ihre EINGABE erweitert und nicht die Oberfläche —
 * so, wie es hier stand: die Seite fragt weiterhin nach `unlocked`, nicht nach
 * „Beta". Die REGEL dahinter (`resolveDerivationAccess`) lebt im brand-Layer,
 * weil ihr das Feld gehört; hier kommt sie als TATSACHE an (Vertrag
 * `server/contracts/brandContract.ts`).
 *
 * ── KEIN SCHALTER IM PRODUKT ──────────────────────────────────────────────
 * Der Prototyp hatte einen (`market.paywall.toggle`), um David beide Bilder
 * zu zeigen. Im Produkt gibt es ihn nicht: ein Kunde, der seine eigene
 * Schranke umlegen kann, hat keine.
 */

/**
 * Woher die Freischaltung kommt. `none` = keine — die Schranke steht.
 * `derivation` = dieses BRANDING hat die Ableitung (Betreiber-Zusage oder
 * Kauf); `beta` = das KONTO ist ein Beta-Konto und damit dauerhaft frei
 * (BS1 §9 Entscheidung 6).
 */
export type MarketPaywallGrant = 'beta' | 'derivation' | 'none'

export interface MarketPaywallState {
  readonly unlocked: boolean
  readonly grant: MarketPaywallGrant
}

export interface MarketPaywallInput {
  /** Hat das KONTO einen gültigen Beta-Zugang (`brand_access`)? */
  readonly betaAccess: boolean
  /**
   * Ist für DIESES Branding die Ableitung offen? — das Ergebnis von
   * `resolveDerivationAccess` im brand-Layer, nie eine seiner Zutaten.
   *
   * Die Regel dort rechnet die Beta-Zulassung bereits mit ein; hier steht
   * `betaAccess` trotzdem daneben, weil es eine andere Frage beantwortet
   * („wem gehört die Freistellung — dem Konto oder der Marke?"). Genau das
   * ist der Unterschied, den ein Widerruf des Beta-Zugangs sichtbar macht.
   */
  readonly derivationUnlocked: boolean
}

/**
 * ZWEI WEGE, EIN JA — und die Herkunft nennt den, der ALLEIN trägt.
 *
 * `beta` steht vorn, weil es die Erklärung ist, die heute jede offene Schranke
 * hat: ohne Beta-Konto kommt niemand auf diese Seite (das Gate des Wizards
 * steht davor). Erst wenn ein Konto OHNE Beta-Zugang eine Marke mit gekaufter
 * Ableitung hat — der Normalfall ab BS1 Z1 —, sagt die Antwort `derivation`.
 */
export function resolveMarketPaywall(input: MarketPaywallInput): MarketPaywallState {
  if (input.betaAccess) return { unlocked: true, grant: 'beta' }
  if (input.derivationUnlocked) return { unlocked: true, grant: 'derivation' }
  return { unlocked: false, grant: 'none' }
}
