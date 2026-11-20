import { CASES } from '../../app/data/cases'

/**
 * Die kanonische Routen-Liste dieser Site — EINE Quelle für sitemap.xml UND
 * llms.txt (Muster `apps/marketing/server/utils/marketingRoutes.ts`).
 *
 * WARUM GEMEINSAM: bis heute war die Seitenliste zweimal da — als `ROUTES` in
 * der Sitemap-Route und als handgeschriebene Aufzählung in `public/llms.txt`.
 * Zwei Listen derselben Sache laufen auseinander, sobald eine Seite dazukommt,
 * und man merkt es nicht: eine fehlende Sitemap-Zeile ist unsichtbar, eine
 * fehlende llms-Zeile erst recht. Jetzt kann eine Seite nur noch in BEIDEN
 * Dateien fehlen oder in keiner.
 *
 * Bewusst handgeführt statt aus dem Router geraten (dieselbe Begründung wie in
 * marketing): eine Liste, die man liest, ist ehrlicher als eine Heuristik, die
 * bei einer neuen Seite still das Falsche ausliefert. Die Cases kommen aus
 * ihrer typisierten Datei — ein neuer Case erscheint automatisch.
 *
 * Sprachstruktur: Englisch ohne Präfix (Default), Deutsch unter `/de/*`.
 * `/en/**` steht NICHT drin: das sind 301-Weiterleitungen aus der alten
 * Struktur, und weder Sitemap noch llms.txt dürfen Weiterleitungen anbieten.
 */

export interface SiteRoute {
  /** Pfad in der EN-Default-Locale (ohne Präfix). */
  path: string
  /** Relative Priorität für die Sitemap (0.0–1.0). */
  priority: number
  /**
   * Der Eintrag in llms.txt — bewusst PFLICHT und bewusst DEUTSCH.
   *
   * Pflicht, weil eine Route ohne Beschreibung sonst still aus der Datei
   * fiele; deutsch, weil llms.txt die deutschsprachigen Anfragen bedient, für
   * die diese Site wirbt (Begründung in `server/routes/llms.txt.get.ts`).
   */
  llms: { title: string, description: string }
}

export const SITE_ROUTES: SiteRoute[] = [
  {
    path: '/',
    priority: 1.0,
    llms: {
      title: 'Pukalani Studio – Senior UI/UX Design für Mittelstand & Agenturen',
      description: 'Haupt-Portfolio mit Leistungen, Preisen, Referenzen, Prozess und FAQ',
    },
  },
  {
    path: '/ux-audit',
    priority: 0.9,
    llms: {
      title: 'UX-Audit zum Festpreis',
      description: 'Drei Festpreis-Pakete (€2.500 / €3.900 / €5.000), Ergebnisse in 1–2 Wochen',
    },
  },
  // Das Erstgespräch ist das EINE Ziel, auf das die ganze Site hinführt — und
  // fehlte hier bis zum 2026-11-20 (die Seite kam nach der Liste). Seitdem
  // vergleicht `tests/siteRoutes.test.ts` die Liste mit dem Seiten-Ordner.
  {
    path: '/erstgespraech',
    priority: 0.9,
    llms: {
      title: 'Kostenloses Erstgespräch',
      description: 'In drei Minuten die Eckdaten des Projekts schildern, danach Termin direkt buchen oder Rückmeldung innerhalb von 24 Stunden',
    },
  },
  {
    path: '/nuxt-entwickler-freelancer',
    priority: 0.8,
    llms: {
      title: 'Nuxt Entwickler Freelancer',
      description: 'Technische Umsetzung für Digitalagenturen und Entwicklungsteams',
    },
  },
  {
    path: '/wissen/was-kostet-ux-design',
    priority: 0.8,
    llms: {
      title: 'Was kostet UX/UI Design? Preise 2026',
      description: 'Kosten-Guide mit belegten Marktdaten (Freelancer-Kompass, German UPA, Malt)',
    },
  },
  {
    path: '/wissen/freelancer-oder-agentur',
    priority: 0.8,
    llms: {
      title: 'Freelancer oder Agentur?',
      description: 'Ehrlicher Vergleich mit Kosten-Tabelle und Entscheidungshilfe',
    },
  },
  // Eigene Projekte: Titel und Kurzzeile kommen aus derselben Datei, die auch
  // die Case-Seiten rendert — eine erfundene zweite Kurzbeschreibung wäre die
  // Sorte Text, die niemand nachpflegt.
  ...CASES.map(entry => ({
    path: `/cases/${entry.slug}`,
    priority: 0.6,
    llms: { title: `Case: ${entry.title}`, description: entry.teaser.de },
  })),
]

/**
 * EN-Pfad → DE-Pfad (i18n-Strategie 'prefix_except_default'). Die Startseite
 * ist `/de`, nicht `/de/` — mit dem Schrägstrich wäre es eine zweite Adresse
 * für dieselbe Seite.
 */
export function dePathFor(enPath: string): string {
  return enPath === '/' ? '/de' : `/de${enPath}`
}
