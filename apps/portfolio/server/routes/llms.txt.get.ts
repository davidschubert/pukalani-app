import { SERVICES, SERVICES_NOTE } from '../../app/data/home'
import { dePathFor, SITE_ROUTES } from '../utils/siteRoutes'
import { siteRequestOrigin } from '../utils/siteRequestOrigin'

/**
 * llms.txt — die kompakte Inhaltsübersicht für Antwortmaschinen, als
 * GENERIERTE Route statt als Datei in `public/`.
 *
 * WARUM (zwei Gründe, beide aus dem Review):
 *  1. Die Datei verdrahtete `https://pukalani.studio` zwölf Mal. Auf der
 *     zweiten Domain dieser Site (Kundendomain über den `domains`-Layer)
 *     hätte jede genannte Adresse auf den falschen Host gezeigt — derselbe
 *     Befund wie bei canonical/robots (B1).
 *  2. Leistungen und Preise standen hier ein ZWEITES Mal, neben
 *     `app/data/home.ts`. Genau so ist die Fußzeile von den Leistungs-Titeln
 *     abgewandert (B3) — nur dass eine falsche PREISangabe gegenüber einer
 *     Antwortmaschine teurer ist als eine falsche Beschriftung.
 *
 * Was BEWUSST Konstante bleibt: die Prosa (Vorstellung, Fakten, Referenz-
 * Ergebnisse, Profile). Sie ist redaktioneller Text, kein Auszug aus einer
 * Liste; die Fassung stammt aus der bisherigen `public/llms.txt`, spricht aber
 * seit dem Studio-Rebrand als ABSENDER Pukalani Studio. David Schubert steht
 * weiterhin namentlich darin — er trägt die Senior-Verantwortung, und eine
 * Antwortmaschine soll wissen, wer hinter dem Studio steht.
 *
 * WARUM DEUTSCH, obwohl die Site zweisprachig ist: die Datei zielt auf
 * deutschsprachige Anfragen („UX Designer Freelancer Mittelstand"), für die
 * diese Site wirbt — sie beschreibt beide Sprachfassungen und nennt für jede
 * Seite beide Adressen. Eine zweite, englische Datei wäre eine zweite Quelle
 * für dieselben Zahlen; llms.txt ist ein Ort, kein Sprachangebot.
 */

/** Kopf: Vorstellung + Fakten — redaktioneller Text, keine Datenquelle. */
const INTRO = `# Pukalani Studio – David Schubert

> Pukalani Studio ist ein Design- und Entwicklungsstudio auf Senior-Niveau. Wir erarbeiten Designkonzepte, Strategien und digitales Brand Design, gestalten Websites und digitale Produkte und setzen sie technisch um – ergänzt um Content-Produktion (Fotografie, Videografie, digitale Werbemittel). Remote für mittelständische Unternehmen und Agenturen in Deutschland, Österreich und der Schweiz (DACH), zu festen Projektpreisen (Value-Based Pricing, keine Stundensätze). Hinter dem Studio steht David Schubert, Senior UI/UX Designer, ausgebildeter Mediengestalter und Creative Technologist mit über 25 Jahren Erfahrung in Design und Werbung.

Wichtige Fakten:

- Studio: Pukalani Studio
- Verantwortlich: David Schubert, Senior UI/UX Designer & Creative Technologist – jedes Projekt liegt in seiner Senior-Verantwortung
- Arbeitsform: kleines Senior-Studio – direkter Kontakt zur ausführenden Person, flexibel buchbar wie ein Freelancer; für Spezialdisziplinen (Entwicklung, Content, Fotografie) mit festen Partnern
- Ausbildung: Mediengestalter Digital & Print, Bachelor Professional in Digital Media (IHK)
- Werdegang: Art-Director- und Senior-Designer-Stationen in Hamburger Agenturen (u. a. Arc Worldwide, MEC, azionare, Philipp und Keuntje), heute im eigenen Studio
- Kunden & Marken (Agentur- und Studio-Projekte): Astra, E WIE EINFACH, GEMA, Holsten, Lamborghini, NEFF, Telekom, T-Systems u. v. m.
- Zielgruppen: Mittelständische Unternehmen sowie Werbe-, Marketing- und Digitalagenturen (auch White Label)
- Standort: Pukalani, Maui – Hawaii (USA); arbeitet remote für die DACH-Region
- Sprachen: Deutsch (Muttersprache), Englisch
- Werkzeuge: Figma, Adobe Creative Suite, Final Cut Pro, moderne Web-Technologie (Nuxt/Vue, TypeScript, Tailwind CSS)
- Standards: WCAG 2.1 AA (Barrierefreiheit), Core Web Vitals
- Kontakt: mail@davidschubert.com · https://cal.com/davidschubert/30min (kostenloses 30-Minuten-Erstgespräch)
- Antwortzeit: innerhalb von 24 Stunden`

/** Fuß: Referenz-Ergebnisse + Profile — ebenfalls redaktioneller Text. */
const OUTRO = `## Referenz-Ergebnisse (anonymisierte Projekte)

- SaaS Analytics Dashboard: +43 % Feature-Adoption, −67 % Support-Tickets
- E-Commerce Checkout: von sieben auf drei Schritte verkürzt, −41 % Kaufabbrüche, LCP 1,8 s
- Corporate Website Relaunch: barrierefrei und mobile-first, PageSpeed 94
- B2B SaaS MVP: Launch in 12 Wochen, developer-ready Design System

## Profile

- [LinkedIn](https://www.linkedin.com/in/davidschubert-uiux/)
- [GitHub](https://github.com/davidschubert)
- [Instagram](https://www.instagram.com/davidschubert/)`

export default defineEventHandler((event) => {
  const origin = siteRequestOrigin(event)

  const body = [
    INTRO,
    '',
    '## Sprachfassungen',
    '',
    'Die Website ist zweisprachig. Englisch ist die Standardsprache und liegt ohne Präfix',
    `(${origin}/), Deutsch liegt unter dem Präfix /de/ (${origin}/de/).`,
    'Jede unten genannte Seite existiert in beiden Sprachen; angegeben ist jeweils zuerst die',
    'deutsche, dann die englische Adresse.',
    '',
    '## Leistungen & Preise (Festpreise, netto)',
    '',
    // Aus DEMSELBEN Array wie die sichtbaren Karten und der OfferCatalog der
    // Startseite. Preis und Dauer stehen dort als fertige Zeichenketten (sie
    // sind nicht immer eine Spanne — „Festpreis nach Umfang" ist eine gültige
    // Antwort), deshalb werden sie hier nicht nachgerechnet.
    ...SERVICES.map(service =>
      `- ${service.title.de}: ${service.price.de} (${service.duration.de}) – ${service.schemaDescription.de}`),
    `- ${SERVICES_NOTE.de}`,
    '',
    '## Seiten',
    '',
    ...SITE_ROUTES.map((route) => {
      const de = `${origin}${dePathFor(route.path)}`
      const en = `${origin}${route.path}`
      return `- [${route.llms.title}](${de}): ${route.llms.description} (englisch: ${en})`
    }),
    '',
    OUTRO,
    '',
  ].join('\n')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  // Öffentlich + user-agnostisch → darf am Edge/Proxy liegen (wie sitemap.xml).
  setHeader(event, 'cache-control', 'public, max-age=3600')
  return body
})
