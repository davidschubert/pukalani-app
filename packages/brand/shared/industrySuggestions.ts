/**
 * VORSCHLÄGE FÜR DAS FELD „BRANCHE" DER STARTKARTE (Content-Spec §2.1:
 * „Eingabe mit Vorschlägen").
 *
 * ── SIE FOLGEN DER INHALTSSPRACHE, NICHT DER OBERFLÄCHE ───────────────────
 * Was hier gewählt wird, ist INHALT: es landet in `brand_profiles.industry`
 * und von dort in Georges Prompt, aus dem der Kategorie-Slot (`a.category`)
 * entsteht. Eine deutsche Marke bekäme mit englischen Vorschlägen einen
 * englischen Begriff in ihr eigenes Dokument, nur weil jemand die Oberfläche
 * auf Englisch gestellt hat. Deshalb entscheidet `contentLocale` —
 * dieselbe Trennung, die Georges Regel 9 zwischen Reden und Schreiben zieht.
 *
 * ── VORSCHLAG, NICHT AUSWAHL ──────────────────────────────────────────────
 * Die Liste hängt an einer `<datalist>`: jeder Text ist erlaubt, die
 * Vorschläge nehmen nur die leere Seite weg. Eine geschlossene Auswahl wäre
 * hier falsch — die interessanten Marken stehen selten in zehn Kästchen.
 *
 * Kein API, keine Tabelle, kein i18n-Schlüssel: zehn Zeichenketten je Sprache,
 * bewusst breit gestreut statt vollständig.
 */

const SUGGESTIONS: Record<string, readonly string[]> = {
  en: [
    'Software & SaaS',
    'Agency & consulting',
    'Craft & trades',
    'Retail & e-commerce',
    'Food & hospitality',
    'Health & care',
    'Education & training',
    'Finance & insurance',
    'Real estate & construction',
    'Arts & culture',
  ],
  de: [
    'Software & SaaS',
    'Agentur & Beratung',
    'Handwerk',
    'Handel & Onlineshop',
    'Gastronomie & Hotellerie',
    'Gesundheit & Pflege',
    'Bildung & Weiterbildung',
    'Finanzen & Versicherung',
    'Immobilien & Bau',
    'Kunst & Kultur',
  ],
}

/**
 * Die Vorschläge für eine Inhaltssprache. Eine unbekannte Sprache bekommt die
 * englische Liste — die Hauptsprache des Layers (Plan §6). Ein leeres Ergebnis
 * wäre schlechter: dann verschwände die Bedienhilfe wortlos, und niemand
 * bemerkte die fehlende Übersetzung.
 */
export function brandIndustrySuggestions(contentLocale: string): readonly string[] {
  return SUGGESTIONS[contentLocale] ?? SUGGESTIONS.en!
}
