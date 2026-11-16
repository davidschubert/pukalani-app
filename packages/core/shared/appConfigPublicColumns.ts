/**
 * JEDE SPALTE VON `app_config` IST ÖFFENTLICH (BE-003, GA1 P13).
 *
 * Die Tabelle trägt seit system-005 das Tabellenrecht `read("any")` ohne
 * Zeilen-Rechte — der Browser abonniert die Zeile `global` per Realtime.
 * Appwrite ist unter eigener Adresse für jeden erreichbar: die ganze Zeile
 * lässt sich dort ohne Anmeldung lesen, nicht nur die Felder, die
 * `toPublicAppConfig` an `/api/config` herausgibt. Die Auswahl dort hält den
 * Seiten-Payload klein; eine Grenze ist sie nicht.
 *
 * Deshalb steht hier JEDE Spalte mit dem Satz, warum sie öffentlich sein
 * darf. Der Wächter `core/tests/appConfigPublicColumns.test.ts` liest die
 * Spalten aus den Migrationen und wird rot, wenn eine dazukommt, die hier
 * fehlt (oder eine hier steht, die es nicht mehr gibt).
 *
 * NEUE SPALTE MIT SCHUTZBEDARF (Schlüssel, Preise, interne Notizen, alles
 * über einzelne Menschen) gehört NICHT hierher, sondern in eine Tabelle ohne
 * Rechte: `app_secrets` oder `instance_secrets`.
 */
export const APP_CONFIG_PUBLIC_COLUMNS: Readonly<Record<string, string>> = {
  registrationEnabled: 'Schalter „Registrierung offen" — die Seite zeigt ihn ohnehin (Formular da oder nicht).',
  commentsEnabled: 'Schalter „neue Kommentare erlaubt" — an der Oberfläche sichtbar.',
  maintenanceMode: 'Wartungsmodus — an der Oberfläche sichtbar.',
  onboardingInviteOnly: 'Ob das Gründen einer Community einen Einladungs-Code braucht — die Gründungs-Seite zeigt es.',
  products: 'Welche Produkte an oder aus sind — an Navigation und Seiten ablesbar.',
  themeSettings: 'Farben und Schriften der Seite — stehen in jedem ausgelieferten Stylesheet.',
  aiModel: 'Name des gewählten Sprachmodells (kein Schlüssel) — die Datenschutzerklärung nennt die Anbieter.',
  ticketsAiModel: 'Name des Sprachmodells für Tickets (kein Schlüssel).',
  brandAdmissionMode: 'Aufnahme-Modus von branding.supply — `/api/brand/admission` gibt ihn bewusst öffentlich aus.',
  brandAiEnabled: 'Ob die KI-Läufe von branding.supply gerade angehalten sind — die Seite zeigt den Hinweis.',
}
