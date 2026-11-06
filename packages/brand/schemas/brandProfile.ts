import { z } from 'zod'
import {
  BRAND_ABOUT_MAX,
  BRAND_AUDIENCE_MAX,
  BRAND_INDUSTRY_MAX,
  BRAND_WEBSITE_URL_MAX,
  isBrandWebsiteUrl,
} from '../shared/brandStartCard'

/**
 * WAS IN EIN BRAND-PROFIL HINEIN DARF — Anlage, Startkarte und die vier
 * Weichen.
 *
 * ── DIE DECKEL DER STARTKARTE STEHEN NEBENAN ──────────────────────────────
 * `shared/brandStartCard.ts` trägt die vier Zahlen und die Adress-Prüfung,
 * weil das FORMULAR sie ebenfalls braucht (maxlength, freigegebener Knopf) und
 * `zod` dafür nicht ins Browser-Bündel gehört. Hier steht nur, was daraus ein
 * Schema macht.
 *
 * ── DIE INHALTSSPRACHE KOMMT AUS DER CONFIG, NICHT AUS DIESER DATEI ───────
 * `createBrandProfileCreateSchema` nimmt die erlaubten Sprachen als ARGUMENT
 * (`pukalani.brand.contentLocales`, App-Config-Form §3e). Hartkodiert wäre sie
 * eine Pukalani-Annahme im Layer — genau das, was die White-Label-Regel
 * ausschliesst („Keine hartkodierten Pukalani-, George- oder
 * Erstgespräch-Annahmen im Layer"). Die Liste ist zugleich der Grund, warum das
 * hier eine FACTORY ist und keine Konstante.
 *
 * ── `contentLocale` IST PFLICHT UND WIRD NIE GEPATCHT ─────────────────────
 * Bei der Anlage FIXIERT (Plan §6): ein UI-Wechsel von `/` nach `/de` darf
 * bestehende Inhalte nicht plötzlich in anderer Sprache weiterschreiben. Das
 * PATCH-Schema kennt das Feld deshalb gar nicht — eine spätere Änderung ist ein
 * ausdrücklicher Übersetzungs-Vorgang, kein Nebeneffekt.
 *
 * ── `relaunchScope` NUR AUF DEM RELAUNCH-PFAD ─────────────────────────────
 * Die pure Regel (`brandNamingIncluded`) IGNORIERT einen `relaunchScope` auf
 * dem Gründer-Pfad bereits — fail-closed gegen widersprüchliche Tatsachen. Das
 * Schema lehnt ihn zusätzlich AB, statt ihn still zu schlucken: was gar nicht
 * erst gespeichert wird, kann später auch niemanden verwirren, der die Zeile
 * von Hand liest.
 */

export const BRAND_TITLE_MAX = 256

const websiteUrl = z.string().trim().max(BRAND_WEBSITE_URL_MAX).refine(isBrandWebsiteUrl, {
  message: 'brand.validation.websiteUrl',
})

const pathKind = z.enum(['new', 'relaunch'])
const relaunchScope = z.enum(['refine', 'recut'])
const team = z.enum(['solo', 'team'])
const subBrands = z.enum(['unknown', 'yes', 'no'])

export function createBrandProfileCreateSchema(contentLocales: readonly string[]) {
  // Leere Konfiguration ⇒ 'en'. Ein Schema ohne einzige gültige Sprache würde
  // JEDE Anlage mit 400 beantworten; die Hauptsprache des Layers ist Englisch
  // (Plan §6), und ein fehlender Config-Eintrag ist ein Betriebsfehler, kein
  // Grund, das Produkt abzuschalten.
  const locales = contentLocales.length ? [...contentLocales] : ['en']

  return z.object({
    // '' ist ausdrücklich erlaubt — „Neue Marke" darf namenlos starten.
    title: z.string().trim().max(BRAND_TITLE_MAX).default(''),
    contentLocale: z.string().refine(value => locales.includes(value), {
      message: 'brand.validation.contentLocale',
    }),
    pathKind,
    relaunchScope: relaunchScope.optional(),
    hasName: z.boolean(),
    team,
    subBrands: subBrands.default('unknown'),
    // Der Chip „Name auf den Prüfstand?" (Katalog §2.2, Default nein).
    namingOpted: z.boolean().default(false),

    // ── Die Startkarte (Content-Spec §2.1) ────────────────────────────────
    // DREI PFLICHTFELDER UND EINE FREIWILLIGE ADRESSE — und die Pflicht steht
    // HIER, nicht in der Spalte: die vier Spalten sind additiv mit Default ''
    // (brand-009), weil es Bestands-Zeilen von vor der Migration gibt. Nur die
    // ANLAGE verlangt Antworten, denn nur sie hat einen Menschen davor.
    //
    // Warum überhaupt Pflicht: aus diesen drei Feldern entsteht JEDER Entwurf
    // des Bausteins A (die Slots dort haben keine `dependencies`). Ein leer
    // angelegtes Branding hiesse, George beim ersten Zug nichts zu geben und
    // ihn dann um einen Elevator Pitch zu bitten — genau das Erfinden, das
    // Regel 8 verbietet.
    websiteUrl: websiteUrl.default(''),
    industry: z.string().trim().min(1).max(BRAND_INDUSTRY_MAX),
    about: z.string().trim().min(1).max(BRAND_ABOUT_MAX),
    audience: z.string().trim().min(1).max(BRAND_AUDIENCE_MAX),
  }).strict().superRefine((value, ctx) => {
    if (value.pathKind !== 'relaunch' && value.relaunchScope) {
      ctx.addIssue({
        code: 'custom',
        path: ['relaunchScope'],
        message: 'brand.validation.relaunchScopeOnlyOnRelaunch',
      })
    }
  })
}

/**
 * WAS SICH SPÄTER NOCH ÄNDERN DARF: der Titel und die Weichen — mehr nicht.
 *
 * Fortschritt, Konfidenz, Story und Preset stehen bewusst NICHT hier: sie sind
 * ERGEBNISSE der Arbeit und werden von ihren eigenen Routen geschrieben. Ein
 * PATCH, der `progressPct` entgegennähme, wäre genau die „Manipulation von
 * Fortschritt/Konfidenz über den Client", die §3e ausschliesst.
 *
 * ALLE Felder sind OPTIONAL, und ein fehlendes Feld heisst „nicht angefasst" —
 * nie „zurücksetzen". Dieselbe Begründung wie beim `neutral`-Feld des
 * Branding-PATCH (CLAUDE.md): die Oberfläche legt EINE Weiche um, nicht alle.
 *
 * ── DIE STARTKARTE DARF SICH ÄNDERN, ABER NICHT VERSCHWINDEN ──────────────
 * Sie gehört hierher und nicht zu den Ergebnissen: sie ist ERHOBEN wie der
 * Titel, nicht erarbeitet wie ein Slot. Wer merkt, dass „für wen" daneben lag,
 * korrigiert es — und Georges nächster Entwurf steht auf der besseren Auskunft.
 *
 * Die drei Pflichtfelder nehmen deshalb kein '' entgegen (`min(1)`): weglassen
 * heisst „nicht angefasst", leeren wäre „ich nehme meine Antwort zurück" — und
 * ein Branding ohne Startkarte kann Baustein A nicht mehr entwerfen. Die URL
 * darf sehr wohl geleert werden; sie war nie eine Antwort, sondern ein Angebot.
 */
/**
 * WAS DIE URL-ANALYSE ENTGEGENNIMMT (P2.3): nichts — oder eine Adresse.
 *
 * Der Normalfall ist der LEERE Rumpf: gelesen wird die `websiteUrl` der
 * Startkarte, und die steht schon am Profil. `url` gibt es trotzdem, weil der
 * Mensch eine andere Seite meinen kann als die, die er beim Anlegen genannt
 * hat (Landingpage statt Shop) — und dann wäre der Umweg „Startkarte ändern,
 * dann lesen" eine Änderung an seinen Daten, die er gar nicht wollte.
 *
 * Geprüft wird mit DERSELBEN Regel wie die Startkarte (`isBrandWebsiteUrl`);
 * ob die Adresse auch ABGERUFEN werden darf, entscheidet danach der
 * SSRF-Vertrag (`analyzableUrl` in `shared/brandSiteAnalysis.ts`) — das Schema
 * kennt Schemata, nicht Adressbereiche.
 */
export function createBrandAnalyzeSchema() {
  return z.object({
    url: websiteUrl.optional(),
  }).strict()
}

export function createBrandProfilePatchSchema() {
  return z.object({
    title: z.string().trim().max(BRAND_TITLE_MAX).optional(),
    hasName: z.boolean().optional(),
    team: team.optional(),
    subBrands: subBrands.optional(),
    relaunchScope: relaunchScope.optional(),
    namingOpted: z.boolean().optional(),
    websiteUrl: websiteUrl.optional(),
    industry: z.string().trim().min(1).max(BRAND_INDUSTRY_MAX).optional(),
    about: z.string().trim().min(1).max(BRAND_ABOUT_MAX).optional(),
    audience: z.string().trim().min(1).max(BRAND_AUDIENCE_MAX).optional(),
  }).strict().refine(
    value => Object.keys(value).length > 0,
    { message: 'brand.validation.emptyPatch' },
  )
}
