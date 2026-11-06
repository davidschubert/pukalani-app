/**
 * DIE FARBWELT EINER BRAND-KACHEL — kuratiert statt errechnet.
 *
 * Jede Brand bekommt auf der Übersicht einen eigenen Farb-Dreiklang
 * (hell → mittel → tief, derselbe Farbton), deterministisch aus ihrer
 * Profil-Id gewählt. Bis zum Umbau trugen alle Kacheln das graue
 * Kachel-Default von `BwBrandCard` (Live-Audit-Notiz 2026-09-03, Davids
 * Auftrag danach).
 *
 * ── WARUM EINE TABELLE, KEIN LAUFZEIT-FARBRAUM ────────────────────────────
 * Ein Hash→OKLCH-Generator liefert unendlich viele Töne — und regelmäßig
 * hässliche (ausgewaschene Gelbgrüne, grelle Magentas). Die Vorlage sind die
 * DREI im Klickdummy ABGENOMMENEN Dreiklänge (Brot & Zeit, Kailua,
 * Hafenkontor): gedämpft, elegant, ähnliche Helligkeitsbänder (~L90 Tint,
 * ~L60 Mittelton, ~L27 Tiefe). Diese Tabelle führt sie fort — zwölf
 * handgestimmte Welten in genau diesem Geist. Zwölf reichen: Kollisionen
 * zwischen Brands EINES Kontos sind bei zwölf Welten selten und harmlos
 * (die Kachel trägt ohnehin die Wortmarke).
 *
 * ── STABILITÄT ────────────────────────────────────────────────────────────
 * Gehasht wird die PROFIL-ID, nicht der Titel: eine umbenannte Brand behält
 * ihre Farbwelt. Neue Welten IMMER HINTEN ANFÜGEN — jede Umsortierung
 * würfelt die Farben aller Bestands-Brands neu. Später kann eine echte
 * Farb-Phase des Wizards diese Zuweisung je Brand überschreiben; die
 * Funktion bleibt dann der Rückfall für Brands ohne eigene Wahl.
 */

export type BrandGradient = [light: string, mid: string, deep: string]

/**
 * DIE FARBWELT ALS KATALOG-EINTRAG (Discover-Entscheidung 8, 2026-09-08):
 * Id, Name in beiden Sprachen, Dreiklang.
 *
 * ── WARUM DER NAME HIER STEHT UND NICHT IN DEN LOCALE-DATEIEN ─────────────
 * Er ist eine FACETTE der öffentlichen Galerie („Farbwelt: Terrakotta") und
 * gehört damit zum Katalog wie die Farben selbst — wer eine dreizehnte Welt
 * anfügt, soll sie an EINER Stelle vollständig beschreiben und nicht an
 * dreien. Zwei Sprachen als Feld statt zwei i18n-Schlüssel: es sind
 * Eigennamen, sie unterscheiden sich in de/en nur dort, wo das Wort im
 * Englischen wirklich anders lautet, und ein fehlender Schlüssel wäre in der
 * Galerie eine rohe Zeichenkette („palette.moss").
 *
 * ── DIE ID IST STABIL UND STEHT IN ADRESSEN ──────────────────────────────
 * Sie wandert in `brand_publications.paletteId` und in Adresszeilen
 * (`?palette=terracotta`) — umbenennen hiesse: gespeicherte Zeilen umschreiben
 * UND geteilte Links brechen. Englisch, wie die Branchen-Ids.
 */
export interface BrandPalette {
  id: string
  name: { de: string, en: string }
  gradient: BrandGradient
}

/**
 * ZWÖLF WELTEN, REIHENFOLGE UNVERÄNDERLICH (s. Kopf: neue IMMER hinten
 * anfügen — jede Umsortierung würfelt die Farben aller Bestands-Brands neu).
 */
export const BRAND_PALETTES: readonly BrandPalette[] = [
  { id: 'bread', name: { de: 'Brotbraun', en: 'Bread Brown' }, gradient: ['#e8d3b8', '#b98a5e', '#4a3123'] }, // Dummy: Brot & Zeit
  { id: 'bluegrey', name: { de: 'Blaugrau', en: 'Blue Grey' }, gradient: ['#e2e4ea', '#8a93ad', '#2b3148'] }, // Dummy: Kailua Coffee Co.
  { id: 'fir', name: { de: 'Tannengrün', en: 'Fir Green' }, gradient: ['#dfe8e4', '#6f9184', '#22392f'] }, // Dummy: Hafenkontor
  { id: 'terracotta', name: { de: 'Terrakotta', en: 'Terracotta' }, gradient: ['#eed9cf', '#c68a6f', '#552e1e'] },
  { id: 'olive', name: { de: 'Oliv', en: 'Olive' }, gradient: ['#e7e6d2', '#9d9c66', '#3c3b1f'] },
  { id: 'petrol', name: { de: 'Petrol', en: 'Teal' }, gradient: ['#d8e6e7', '#5e9299', '#1d3a3e'] },
  { id: 'plum', name: { de: 'Pflaume', en: 'Plum' }, gradient: ['#e8dde8', '#9a7fa0', '#3d2a42'] },
  { id: 'rosewood', name: { de: 'Rosenholz', en: 'Rosewood' }, gradient: ['#eddbdc', '#bb7f85', '#4e2a2e'] },
  { id: 'slate', name: { de: 'Schiefer', en: 'Slate' }, gradient: ['#e3e4e6', '#82878f', '#2a2d33'] },
  { id: 'brass', name: { de: 'Messing', en: 'Brass' }, gradient: ['#ece2cb', '#b3a06b', '#4a3d1f'] },
  { id: 'dove', name: { de: 'Taubenblau', en: 'Dove Blue' }, gradient: ['#dce3ee', '#7189b0', '#253552'] },
  { id: 'moss', name: { de: 'Moos', en: 'Moss' }, gradient: ['#e2e8d8', '#8ba06e', '#313f22'] },
]

/**
 * Die Dreiklänge allein — AUS dem Katalog gebaut, nicht daneben gepflegt. Eine
 * zweite, abgeschriebene Tabelle wäre beim ersten neuen Eintrag genau die
 * Stelle, an der sich Farbe und Name auseinanderleben.
 */
export const BRAND_GRADIENTS: readonly BrandGradient[] = BRAND_PALETTES.map(entry => entry.gradient)

/**
 * FNV-1a (32 Bit) — bewusst dieser und kein „einfacherer" Hash: eine
 * Zeichensummen-Rechnung landet für Appwrite-Row-Ids (gleiches Alphabet,
 * gleiche Länge) gehäuft in denselben Resten und färbt halbe Konten gleich.
 */
function fnv1a(seed: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Die Farbwelt zu einer Profil-Id — deterministisch, für immer stabil. */
export function brandGradientFor(seed: string): BrandGradient {
  const entry = BRAND_PALETTES[paletteIndex(seed)]!
  return [...entry.gradient]
}

function paletteIndex(seed: string): number {
  return fnv1a(seed) % BRAND_PALETTES.length
}

/**
 * DIE ID DER FARBWELT ZU EINER PROFIL-ID — dieselbe Rechnung wie oben, nur
 * das andere Feld.
 *
 * Sie wird beim Veröffentlichen in `brand_publications.paletteId` eingefroren
 * (Discover §5): die Facette „Farbwelt" der Galerie filtert über die Spalte,
 * nicht über eine Rechnung — sonst müsste die Galerie für jeden Filterklick
 * alle Zeilen laden und selbst hashen. Eingefroren heisst zugleich: eine
 * spätere eigene Farbwahl des Wizards ändert die Facette einer bestehenden
 * Veröffentlichung nicht rückwirkend.
 */
export function brandPaletteId(seed: string): string {
  return BRAND_PALETTES[paletteIndex(seed)]!.id
}

/** Der Anzeigename einer Farbwelt. Unbekannte Id ⇒ '' (nie die Id als Text). */
export function brandPaletteName(paletteId: string, locale: string): string {
  const entry = BRAND_PALETTES.find(palette => palette.id === paletteId)
  if (!entry) return ''
  return locale.startsWith('de') ? entry.name.de : entry.name.en
}
