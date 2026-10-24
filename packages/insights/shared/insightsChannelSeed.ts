import type { InsightsTopicKey } from './insightsPost'

/**
 * DIE SAAT DER KANALLISTE (BI2 K3) — die elf Kanäle, mit denen der Radar seit
 * I4 läuft, als EINMALIGE Startbelegung der Tabelle `insights_channels`.
 *
 * ── SAAT, NICHT WAHRHEIT ────────────────────────────────────────────────
 * Diese Datei wird GENAU EINMAL je Instanz gelesen: beim Übernehmen in die
 * leere Tabelle (`POST /api/insights/channels/seed`). Danach ist die TABELLE
 * die Wahrheit, und eine Änderung hier bewirkt nichts mehr. Das ist der ganze
 * Sinn von Davids Entscheidung A vom 2026-09-09: EIN Ort, an dem steht, welche
 * Kanäle laufen — und nicht zwei, die man in der richtigen Reihenfolge lesen
 * muss.
 *
 * ── WARUM SIE TROTZDEM IM CODE BLEIBT UND NICHT IN DER MIGRATION ────────
 * Eine Migration, die Zeilen schreibt, ist ein Zustand, den man beim zweiten
 * Lauf nicht mehr versteht: hat der 409 geschluckt, weil der Kanal schon da
 * war, oder weil der Betreiber ihn gelöscht hatte? Die Übernahme ist deshalb
 * ein KNOPF, der nur auf eine LEERE Tabelle wirkt — ein Vorgang mit einem
 * sichtbaren Ergebnis statt einer stillen Nebenwirkung eines Schema-Laufs.
 *
 * ── DIE NOTIZEN SIND DER UMGEZOGENE CODE-KOMMENTAR ──────────────────────
 * Was in `apps/branding/app/app.config.ts` als Kommentar neben der Zeile
 * stand, steht hier als `note` — und landet damit an der Zeile im Dashboard,
 * wo der nächste Mensch sie sucht. Die ausgemusterten Kanäle (Ogilvy,
 * Pentagram, Marketing Examples) wandern NICHT mit: sie waren nie Teil der
 * laufenden Liste, ihre Begründung steht in der Versionsgeschichte der
 * App-Config und im Plan.
 *
 * ── ELF UND NICHT FÜNFZIG ───────────────────────────────────────────────
 * Quota wäre kein Argument (elf Kanäle kosten rund 18 der 10.000
 * Tageseinheiten, fünfzig wären 71). Das Argument ist die Redaktion: der Radar
 * soll eine Liste liefern, die ein Mensch am Morgen durchsieht. Zwei Cluster
 * (`brand-analysis`, `rebranding`) haben bewusst keinen eigenen Kanal — sie
 * werden über die Video-TITEL erreicht (`insightsRadarClassify`), nicht über
 * die Herkunft.
 */
export interface InsightsChannelSeedEntry {
  channelId: string
  topic: InsightsTopicKey
  /** Nur ein Lesehinweis für den Menschen — der echte Name kommt vom ersten Abruf. */
  title: string
  handle: string
  note: string
}

export const INSIGHTS_CHANNEL_SEED: readonly InsightsChannelSeedEntry[] = [
  // Marke & Strategie
  {
    channelId: 'UC-b3c7kxa5vU-bnmaROgvog',
    topic: 'brand-strategy',
    title: 'The Futur',
    handle: 'thefutur',
    note: 'Markenstrategie für Gestalter, hohe Taktung. Geprüft 2026-09-09.',
  },
  {
    channelId: 'UCBFWrMRo37OVLM2l1pWnH7w',
    topic: 'brand-strategy',
    title: 'Brand Master Academy',
    handle: 'BrandMasterAcademy',
    note: 'Markenstrategie als Handwerk, Positionierung und Prozess. Geprüft 2026-09-09.',
  },
  {
    channelId: 'UCBOzmOV9UHpTEYNr6NqOZ2g',
    topic: 'brand-psychology',
    title: 'Nudgestock',
    handle: 'Nudgestock',
    note: 'Ogilvys Behavioural-Science-Festival (Rory Sutherland). Ersetzt den stillgelegten Ogilvy-Kanal. Bewusst dünn und stossweise: rund drei Uploads je 180 Tage, der Schwung kommt nach dem Festival im Juni. Geprüft 2026-09-10 (Titel UND jüngster Upload).',
  },
  // Gestaltung & Identität
  {
    channelId: 'UCN7dywl5wDxTu1RM3eJ_h9Q',
    topic: 'visual-identity',
    title: 'Flux Academy',
    handle: 'FluxAcademy',
    note: 'Gestaltung und Markenauftritt für Selbstständige. Geprüft 2026-09-09.',
  },
  {
    channelId: 'UCoeJKtPJLoIBqWq4o8TDLpA',
    topic: 'visual-identity',
    title: 'Satori Graphics',
    handle: 'SatoriGraphics',
    note: 'Logo- und Typografie-Handwerk, hohe Taktung. Geprüft 2026-09-09.',
  },
  {
    channelId: 'UCIp9sEZiv36cDG7cEnrVU7Q',
    topic: 'visual-identity',
    title: 'Will Paterson',
    handle: 'WillPatersonDesign',
    note: 'Logo-Gestaltung am offenen Projekt, viel Prozess. Geprüft 2026-09-09.',
  },
  // Erlebnis & Sprache
  {
    channelId: 'UC2oCugzU6W8-h95W7eBTUEg',
    topic: 'brand-experience',
    title: 'Nielsen Norman Group',
    handle: 'NNgroup',
    note: 'Forschungsnahe Beiträge zu Nutzung und Erlebnis. Geprüft 2026-09-09.',
  },
  {
    channelId: 'UC_RirP9QR49zw2HOZ95dKrA',
    topic: 'brand-language',
    title: 'StoryBrand',
    handle: 'StoryBrand',
    note: 'Messaging, Elevator Pitch und Tonalität — der Kern von brand-language. Ersetzt Marketing Examples (seit 2024-07 ohne Upload). Geprüft 2026-09-10 (Titel UND jüngster Upload).',
  },
  // Sichtbarkeit
  {
    channelId: 'UCWquNQV8Y0_defMKnGKrFOQ',
    topic: 'seo-geo',
    title: 'Ahrefs',
    handle: 'AhrefsCom',
    note: 'SEO aus der Werkzeug-Ecke, mit Daten. Geprüft 2026-09-09.',
  },
  {
    channelId: 'UCWf2ZlNsCGDS89VBF_awNvA',
    topic: 'seo-geo',
    title: 'Google Search Central',
    handle: 'GoogleSearchCentral',
    note: 'Die Quelle selbst — Ankündigungen und Sprechstunden. Geprüft 2026-09-09.',
  },
  {
    channelId: 'UCj7v9UM1aGx6GR-nsY-9u8w',
    topic: 'seo-geo',
    title: 'Semrush',
    handle: 'Semrush',
    note: 'SEO und Sichtbarkeit, breiter als Ahrefs. Geprüft 2026-09-09.',
  },
]
