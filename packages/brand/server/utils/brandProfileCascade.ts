import type { H3Event } from 'h3'

/**
 * WER HÄNGT NOCH AN EINEM BRANDING? — die Registry der Profil-Kaskade.
 *
 * ── WOFÜR SIE DA IST ──────────────────────────────────────────────────────
 * Ein Branding zu löschen heisst bis heute: `steps → messages → shares →
 * events → findings → profile` (Löschroute und GDPR-Contributor, beide im
 * brand-Layer). Seit dem market-Layer (MV1 M1, Plan
 * docs/archiv/BRAND-MARKTVERGLEICH.md §2.6 „Retention") hängen an derselben
 * `profileId` auch Zeilen, die brand NICHT kennen darf: `market_competitors`,
 * `market_profiles`, `market_reports`. Ohne diese Registry gäbe es genau zwei
 * Auswege, und beide sind falsch — brand die market-Tabellennamen beibringen
 * (ein Fundament-Layer, der sein Produkt kennt) oder die market-Zeilen
 * liegenlassen (unsichtbarer Inhalt, den keine Route mehr erreicht; genau die
 * Fehlerklasse, gegen die der Kopf der Löschroute geschrieben ist).
 *
 * ── DIE RICHTUNG IST DIE POINTE ───────────────────────────────────────────
 * brand kennt die Registry, nicht ihre Einträge. Wer sich einträgt, ist ein
 * Nitro-Plugin des ANDEREN Layers — läuft dieser Layer in einer App gar nicht
 * mit (`apps/branding` ohne `market`), registriert sich niemand und die
 * Kaskade ist automatisch richtig kurz. Dasselbe Muster wie
 * `registerUserDataContributor` (core, CONCEPT A14) und
 * `registerReportEscalationHandler` (moderation).
 *
 * ── FAIL-SOFT, UND ZWAR MIT ANSAGE ────────────────────────────────────────
 * Ein Mitläufer, der wirft, darf die Löschung des Brandings nicht verhindern:
 * sonst hinge das Löschen eines Kunden-Brandings an der Verfügbarkeit eines
 * Zusatzprodukts. Der Fehler wird geloggt und die Kaskade läuft weiter — was
 * liegenbleibt, findet der nächste Lauf (jeder Mitläufer ist idempotent, wie
 * die Kaskade selbst). Ein STILLES Verschlucken wäre das Gegenteil davon:
 * deshalb `logEvent('error', …)` mit dem Namen des Mitläufers.
 */

export interface BrandProfileCascade {
  /** Stabil + eindeutig, z. B. 'market'. Er steht im Log, wenn etwas schiefgeht. */
  id: string
  /**
   * Löscht alles, was der eigene Layer an diesem Branding hängen hat.
   * MUSS idempotent sein (ein zweiter Lauf findet Reste oder nichts) und gibt
   * zurück, wie viele Zeilen er entfernt hat — die Zahl landet im Log der
   * Löschroute, nicht in der Antwort an den Client.
   */
  removeProfileData(event: H3Event, profileId: string): Promise<number>
}

const cascades = new Map<string, BrandProfileCascade>()

/** Registrierung ist idempotent (HMR/Doppel-Plugin überschreibt nur sich selbst). */
export function registerBrandProfileCascade(cascade: BrandProfileCascade): void {
  cascades.set(cascade.id, cascade)
}

/**
 * Alle eingetragenen Mitläufer laufen lassen. Rückgabe: je Mitläufer die Zahl
 * der entfernten Zeilen — für das Log der aufrufenden Stelle.
 *
 * WIRD NACH DEN EIGENEN KINDERN UND VOR DEM PROFIL AUFGERUFEN: dieselbe
 * Reihenfolge-Begründung wie dort (Kopf zuletzt, damit ein Abbruch sichtbaren
 * Rest hinterlässt, keinen unsichtbaren).
 */
export async function runBrandProfileCascades(
  event: H3Event,
  profileId: string,
): Promise<Record<string, number>> {
  const removed: Record<string, number> = {}
  for (const cascade of cascades.values()) {
    try {
      removed[cascade.id] = await cascade.removeProfileData(event, profileId)
    }
    catch (error) {
      removed[cascade.id] = -1
      logEvent('error', 'brand.profile_cascade_failed', {
        cascade: cascade.id,
        profileId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return removed
}
