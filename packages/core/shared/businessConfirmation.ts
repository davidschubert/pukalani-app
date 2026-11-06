/**
 * HANDELT DIESES KONTO ALS UNTERNEHMEN? (BS1 R1c, Davids Entscheidung vom
 * 2026-09-08 — branding.supply richtet sich nur an Unternehmen und
 * Selbstständige, B2B)
 *
 * ── WARUM ES DIESE TATSACHE ÜBERHAUPT GEBEN MUSS ─────────────────────────
 * Ein VERBRAUCHER hat bei einem Fernabsatzvertrag ein Widerrufsrecht, ein
 * Unternehmer nicht. Wer sein Angebot ausschliesslich an Unternehmen und
 * Selbstständige richtet, muss das an der Anmeldung sagen UND festhalten — die
 * Zusage ist die Grundlage dafür, dass später kein Verbraucher-Widerruf im
 * Raum steht. Ein Häkchen, das nur das Formular durchlässt und danach
 * verschwindet, taugt dafür nicht: es wäre wieder eine Formularvalidierung und
 * keine Tatsache am Konto (genau der Befund, der BS1 R1 ausgelöst hat).
 *
 * Diese Datei ist deshalb die kleine Schwester von `shared/termsAcceptance.ts`
 * und folgt derselben Arbeitsteilung: PURE Regel hier, Appwrite-Schreiber in
 * `server/utils/businessConfirmation.ts`, Verdrahtung an allen drei
 * Anlagewegen (Passwort, Code, Google).
 *
 * ── DREI REGELN, die man nicht „vereinfachen" darf ───────────────────────
 *
 *  1. **Ohne `businessOnly` wird NICHTS geschrieben.** Der Schalter ist
 *     dieselbe Bedingung, unter der die Formulare überhaupt ein Häkchen
 *     zeigen. Eine App, die auch Verbraucher aufnimmt, hat hier nichts
 *     festzuhalten; ein Zeitstempel wäre eine erfundene Tatsache. Das ist
 *     zugleich die Gegenprobe des Beweises: Schalter aus ⇒ kein Häkchen UND
 *     keine Prefs.
 *  2. **Es gibt bewusst KEINE Fassungsnummer.** Bei den AGB trägt die Fassung
 *     die Frage „welchem Text?" — hier gibt es keinen Text, sondern eine
 *     Eigenschaft der Person („ich bin Unternehmer"). Die AGB-Fassung daneben
 *     sagt schon, unter welchen Bedingungen sie abgegeben wurde. Eine zweite
 *     Versionsspalte wäre ein Feld, das niemand fortschreibt.
 *  3. **Einmal bestätigt bleibt bestätigt.** Steht ein Zeitstempel, wird er
 *     nicht überschrieben — der ERSTE Zeitpunkt ist der richtige. Anders als
 *     bei den AGB (neue Fassung ⇒ neue Zustimmung) gibt es hier nichts, was
 *     eine erneute Bestätigung auslösen könnte.
 */

export interface BusinessConfirmationConfig {
  /** `pukalani.auth.businessOnly` — true = diese App nimmt nur Unternehmen auf. */
  businessOnly?: boolean
}

/** Das eine Feld, das im Prefs-Fach eines Kontos landet. */
export interface BusinessConfirmationPrefs {
  /** ISO-Zeitstempel der Unternehmer-Bestätigung. */
  businessConfirmedAt: string
}

function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Was in die Prefs geschrieben werden muss — oder `null`, wenn nichts zu tun
 * ist. `now` kommt vom Aufrufer, damit die Regel testbar bleibt.
 */
export function resolveBusinessConfirmation(
  config: BusinessConfirmationConfig | undefined,
  prefs: Record<string, unknown> | undefined,
  now: Date,
): BusinessConfirmationPrefs | null {
  if (config?.businessOnly !== true) return null
  if (trimmed(prefs?.businessConfirmedAt)) return null

  return { businessConfirmedAt: now.toISOString() }
}
