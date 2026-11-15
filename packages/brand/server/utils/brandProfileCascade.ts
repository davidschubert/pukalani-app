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
 * ── EIN SCHEITERNDER MITLÄUFER HÄLT DAS PROFIL FEST (SEC-026, Teil 2) ────
 * Bis dahin war die Kaskade fail-soft: ein werfender Mitläufer wurde geloggt,
 * bekam `-1`, und Löschroute wie GDPR-Contributor löschten danach das PROFIL.
 * Die Begründung damals: „was liegenbleibt, findet der nächste Lauf". Das
 * stimmte nicht — die Zeilen des anderen Layers findet man NUR über das
 * Profil, und das war weg. Kein Lauf erreichte sie je wieder.
 *
 * Jetzt: ALLE Mitläufer laufen (jeder ist idempotent, ein gesunder soll seinen
 * Teil erledigen, auch wenn ein anderer scheitert), jeder Fehler wird mit dem
 * Namen des Mitläufers geloggt — und danach WIRFT `runBrandProfileCascades`
 * einen `BrandProfileCascadeError`. Die Aufrufer löschen das Profil dann
 * nicht; die Löschung lässt sich wiederholen, bis alle Mitläufer durch sind.
 * Der Preis — das Löschen eines Brandings hängt an der Verfügbarkeit eines
 * Zusatzprodukts — ist der richtige: ein sichtbar unfertiges Branding ist
 * heilbar, unsichtbarer Inhalt ohne Kopf nicht.
 *
 * Die alte `-1` in der Rückgabe gibt es nicht mehr: beide Aufrufer brauchten
 * sie nicht als Zahl, sondern als „abbrechen", und das sagt ein Fehler
 * deutlicher als eine Zahl, die man beim Summieren übersehen kann.
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

/**
 * Mindestens ein Mitläufer ist gescheitert — das Profil darf NICHT gelöscht
 * werden. Trägt nur die Namen der Mitläufer (stabile Kennungen wie `market`),
 * keine Profil-Id und keinen Fehlertext: die stehen schon in der Log-Zeile
 * `brand.profile_cascade_failed`.
 */
export class BrandProfileCascadeError extends Error {
  readonly failed: string[]

  constructor(failed: string[]) {
    super(`brand profile cascade incomplete: ${failed.join(', ')}`)
    this.name = 'BrandProfileCascadeError'
    this.failed = failed
  }
}

/** Registrierung ist idempotent (HMR/Doppel-Plugin überschreibt nur sich selbst). */
export function registerBrandProfileCascade(cascade: BrandProfileCascade): void {
  cascades.set(cascade.id, cascade)
}

/**
 * Alle eingetragenen Mitläufer laufen lassen. Rückgabe: je Mitläufer die Zahl
 * der entfernten Zeilen — für das Log der aufrufenden Stelle. Ist einer
 * gescheitert, laufen die übrigen trotzdem zu Ende, dann wirft die Funktion
 * `BrandProfileCascadeError` (s. Kopf) — das Profil bleibt stehen.
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
  const failed: string[] = []
  for (const cascade of cascades.values()) {
    try {
      removed[cascade.id] = await cascade.removeProfileData(event, profileId)
    }
    catch (error) {
      failed.push(cascade.id)
      logEvent('error', 'brand.profile_cascade_failed', {
        cascade: cascade.id,
        profileId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }
  if (failed.length > 0) throw new BrandProfileCascadeError(failed)
  return removed
}
