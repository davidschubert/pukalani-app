/**
 * WELCHER FASSUNG HAT JEMAND ZUGESTIMMT? (BS1 R1, Davids Entscheidung 7 vom
 * 2026-09-07 — Plan docs/plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md §9)
 *
 * ── DER BEFUND, DER DIESE DATEI AUSGELÖST HAT ────────────────────────────
 * `pukalani.auth.termsUrl` schaltet bis heute NUR die Checkbox und den Link
 * frei. Das Formularfeld `terms` ist ausdrücklich ein „reiner UI-Belang"
 * (`schemas/auth.ts`) — es erreicht weder die Route noch das Konto. Es gab
 * also nirgends ein `termsAcceptedAt` und nirgends eine Fassungsnummer: dass
 * jemand zugestimmt hat, war eine Formularvalidierung und keine Tatsache.
 *
 * Solange die AGB fertig sind, fällt das kaum auf. Auf branding.supply setzt
 * das Häkchen aber auf einen ENTWURF, der nach der anwaltlichen Prüfung durch
 * eine zweite Fassung ersetzt wird — und ab dann ist „hat zugestimmt" ohne die
 * Fassung wertlos: man kann nicht mehr sagen, WELCHEM Text.
 *
 * ── WAS HIER ENTSCHIEDEN WIRD, UND WAS NICHT ─────────────────────────────
 * Diese Regel ist PUR und beantwortet genau eine Frage: was gehört jetzt in
 * die Prefs dieses Kontos? Sie kennt weder Appwrite noch einen Request. Der
 * Aufrufer (`server/utils/termsAcceptance.ts`) schreibt das Ergebnis MIT MERGE
 * in die Account-Prefs.
 *
 * DREI REGELN, die man nicht „vereinfachen" darf:
 *
 *  1. **Ohne `termsUrl` wird NICHTS geschrieben.** Der Schalter ist dieselbe
 *     Bedingung, unter der das Formular überhaupt ein Häkchen zeigt (siehe
 *     `RegisterForm.vue`). Eine App ohne AGB-Seite hat auch keine Zustimmung
 *     einzuholen; ein Zeitstempel dort wäre eine erfundene Tatsache. Das ist
 *     zugleich die Gegenprobe des Beweises: `termsUrl` entfernen ⇒ kein
 *     Häkchen UND keine Prefs.
 *  2. **Die Fassung darf leer sein.** Eine App kann `termsUrl` setzen, ohne
 *     eine Fassung zu benennen (so stand `apps/control` jahrelang da). Dann
 *     wird der ZEITPUNKT festgehalten und die Fassung bleibt `''` — „wir
 *     wissen wann, nicht welcher Text". Das ist ehrlicher als gar nichts und
 *     ehrlicher als eine geratene Nummer.
 *  3. **Idempotent.** Steht dieselbe Fassung schon mit einem Zeitstempel da,
 *     wird nichts überschrieben — der ERSTE Zeitpunkt ist der richtige. Heute
 *     ruft nur die Konto-ANLAGE, aber die Nachfrage für Bestandskonten
 *     (Fassung 2, Paket R3) wird dieselbe Funktion benutzen, und dort ist der
 *     Unterschied zwischen „schon zugestimmt" und „erneut zugestimmt" der
 *     ganze Punkt.
 */

export interface TermsAcceptanceConfig {
  /** `pukalani.auth.termsUrl` — gesetzt = diese App holt eine Zustimmung ein. */
  termsUrl?: string
  /** `pukalani.auth.termsVersion` — z. B. '2026-09-draft-1'. Leer erlaubt. */
  termsVersion?: string
}

/** Die zwei Felder, die im Prefs-Fach eines Kontos landen. */
export interface TermsAcceptancePrefs {
  /** ISO-Zeitstempel der Zustimmung. */
  termsAcceptedAt: string
  /** Die Fassung, der zugestimmt wurde — `''` = die App hat keine benannt. */
  termsVersion: string
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Was in die Prefs geschrieben werden muss — oder `null`, wenn nichts zu tun
 * ist. `now` kommt vom Aufrufer, damit die Regel testbar bleibt.
 */
export function resolveTermsAcceptance(
  config: TermsAcceptanceConfig | undefined,
  prefs: Record<string, unknown> | undefined,
  now: Date,
): TermsAcceptancePrefs | null {
  if (!trimmed(config?.termsUrl)) return null

  const version = trimmed(config?.termsVersion)
  const storedAt = trimmed(prefs?.termsAcceptedAt)
  const storedVersion = trimmed(prefs?.termsVersion)
  if (storedAt && storedVersion === version) return null

  return { termsAcceptedAt: now.toISOString(), termsVersion: version }
}
