import type { Models } from 'node-appwrite'

export const PAGES_TABLE = 'pages'

export const PAGE_STATUSES = ['draft', 'published'] as const
export type PageStatus = (typeof PAGE_STATUSES)[number]

/**
 * Die Adresse der Community-Regeln (F1 Stufe 2).
 *
 * STEHT HIER UND NICHT IN `guidelinesTemplate.ts`, obwohl sie inhaltlich
 * dorthin gehörte: der Navigationspunkt im blueprint-Layer braucht sie, und ein
 * Wert-Import aus der Vorlagen-Datei zöge deren gesamten Text (beide Sprachen,
 * mehrere Kilobyte) in das CLIENT-Bundle jeder App — für eine Zeichenkette.
 * `page.ts` ist ohnehin das Wert-Modul dieses Layers (PAGES_TABLE,
 * PAGE_STATUSES) und in jedem Konsumenten schon drin.
 *
 * Die Vorlage importiert sie von hier, damit es genau EINE Quelle bleibt — ein
 * zweites `'guidelines'` als Zeichenkette wäre die Sorte Kopplung, die still
 * auseinanderläuft.
 */
export const GUIDELINES_SLUG = 'guidelines'

/**
 * ── FÜNF NAV-HELFER SIND AM 2026-09-08 NACH core GEZOGEN (U15 Teil 3) ──────
 *
 * `LEGAL_PAGE_SLUGS`, `isLegalPageSlug`, `PublicPageNavItem`, `cmsPageNavId`
 * und `CMS_PAGE_NAV_ORDER` leben jetzt in
 * `packages/core/shared/communityNavigation.ts` und werden hier
 * RE-EXPORTIERT — jeder bestehende Import bleibt damit gültig, und der
 * Auto-Import über `shared/types` ebenso.
 *
 * WARUM SIE GEHEN MUSSTEN, obwohl sie inhaltlich hierher gehören: seit
 * demselben Tag rendert auch `packages/brand` (branding.supply) das
 * Community-Menü, und ein Produkt-Layer darf einen anderen NICHT importieren
 * (A14). Hätte `brand` seine eigene Rechts-Slug-Liste bekommen, stünde genau
 * die Liste zum dritten Mal da, die es einmal schon dreifach gab — und ein
 * `terms` im Kopf statt im Fuß war der Schaden.
 *
 * WAS HIER GEBLIEBEN IST: alles, was die SEITEN betrifft (Tabelle, Status,
 * Zeilen-Typen, Slugs mit Bedeutung fürs Produkt). Der pages-Layer bleibt der
 * Eigentümer der Seiten; abgegeben ist nur die Frage „wie heisst so eine Seite
 * im MENÜ".
 */
export {
  CMS_PAGE_NAV_ORDER,
  LEGAL_PAGE_SLUGS,
  cmsPageNavId,
  isLegalPageSlug,
} from '../../../core/shared/communityNavigation'
export type { LegalPageSlug, PublicPageNavItem } from '../../../core/shared/communityNavigation'

/**
 * Die Adresse des Beschreibungs- und Kontakttextes der About-Seite (F1 Stufe 2).
 *
 * WARUM ÜBER DEN pages-LAYER und nicht über eine eigene Einstellung: der Text
 * gehört DER COMMUNITY und muss vom Owner editierbar sein. `app_config` ist EINE
 * Row pro Appwrite-PROJEKT — im Pool teilen sich alle Communities sie, ein
 * Schreiber überschriebe alle anderen (derselbe Grund, aus dem das Branding an
 * `communities.*` hängt und nicht dort). Eine neue Spalte im Control Plane wäre
 * eine Migration, eine Service-Route und ein Formularfeld für etwas, das der
 * pages-Layer seit pages-004 kann: mandantengebundene, owner-editierbare
 * Textseiten mit Markdown-Body und Dashboard-Verwaltung.
 *
 * BEWUSST NICHT GESEEDET, anders als die Regeln: für die Regeln gibt es einen
 * Text, der überall gilt; für „worum es hier geht" gibt es ihn nicht. Ein
 * erfundener Beschreibungstext im Namen der Community wäre genau die Sorte
 * Fülltext, die niemand entfernt. Fehlt die Seite, zeigt die About-Seite ihre
 * Zahlen und sagt dem, der sie schreiben darf, wo er das tut.
 */
export const DISCUSSIONS_ABOUT_SLUG = 'discussions-about'

/**
 * Eine Inhaltsseite in EINER Sprache. Ein logisches „Dokument" (slug) hat je
 * Sprache eine Row — so sind beliebige Sprachen möglich (EN Standard + weitere).
 * `body` ist Markdown (UEditor content-type="markdown"), gerendert über core
 * MarkdownContent (kein v-html).
 */
export interface PageRow extends Models.Row {
  slug: string
  locale: string
  /** H3-Pool-Datenpfad (pages-003); '' = Silo/Einzelbetrieb. */
  /** E8-3: Scope-Spalte (pages-005); tenantId ist mit pages-006 gefallen. */
  communityId?: string
  title: string
  body: string
  status: PageStatus
  sortOrder: number
}

/**
 * Was der Editor im Dashboard von einer Sprachversion braucht — bewusst KEIN
 * `Models.Row`.
 *
 * WARUM EIN EIGENES DTO (F1, kleines Paket 2026-08-04): seit die Regeln-Seite
 * für Bestands-Communities als VORLAGE ausgeliefert wird, hat die Antwort von
 * `/api/pages/:slug` einen Fall ohne Row dahinter. Eine Vorlage in ein
 * `PageRow` zu pressen hieße, `$id`, `$createdAt`, `$permissions` &c. zu
 * erfinden — Felder, die aussehen wie Wahrheit über eine gespeicherte Zeile,
 * es aber nicht sind. Der Editor hat sie nie gelesen; er braucht genau diese
 * fünf.
 */
export interface PageEditorRow {
  locale: string
  title: string
  body: string
  status: PageStatus
  sortOrder: number
}

/** Öffentliches DTO (nur was die public-Route rausgibt). */
export interface PublicPage {
  slug: string
  locale: string
  title: string
  body: string
  updatedAt: string
  /**
   * In welchen Sprachen es diese Seite VERÖFFENTLICHT gibt (F60).
   *
   * Zwei Leser, ein Feld: die Seite sagt damit „du liest gerade eine
   * Ersatzsprache" (Vergleich mit `locale`), und sie meldet dem EINEN SEO-Kopf,
   * welche `hreflang`-Alternates überhaupt wahr sind
   * (`usePageLocaleAlternates()` im core). Kostet keine zweite Abfrage — die
   * Route hat die Zeilen aller Sprachen ohnehin geladen, um die passende
   * auszuwählen.
   */
  availableLocales: string[]
}

/** Antwort des KI-Übersetzungsvorschlags (F60) — die Route SPEICHERT NICHTS. */
export interface PageTranslateResponse {
  /** Zielsprache, wie angefragt. */
  locale: string
  /** Leer = kein Vorschlag; die Oberfläche lässt das Feld dann in Ruhe. */
  title: string
  body: string
  /** Welches Modell geantwortet hat — für die Nachvollziehbarkeit im Log. */
  model: string
}

/** Antwort von `GET /api/pages` (Liste im Dashboard). */
export interface PagesListResponse {
  groups: PageGroup[]
  /**
   * Ist ein KI-Schlüssel hinterlegt? Der Übersetzen-Knopf erscheint nur dann
   * (und nur mit dem Produkt `ai` im Tarif) — ein Knopf, der beim Drücken 503
   * antwortet, wäre ein Versprechen, das die Seite nicht halten kann. Die
   * Route prüft es trotzdem selbst; sie ist die Grenze, dies die Höflichkeit.
   */
  aiTranslate: boolean
}

/** Antwort von `GET /api/pages/:slug` (alle Sprachfassungen zum Bearbeiten). */
export interface PageDetailResponse {
  rows: PageEditorRow[]
  isTemplate: boolean
}

/** Admin-Gruppierung: ein slug mit allen seinen Sprachversionen. */
export interface PageGroup {
  slug: string
  sortOrder: number
  locales: Array<Pick<PageRow, '$id' | 'locale' | 'title' | 'status'>>
  /**
   * Es gibt zu diesem slug noch KEINE Zeile — was hier steht, ist unsere
   * Vorlage (heute nur `guidelines`). `$id` ist deshalb leer, und die Liste
   * darf das sichtbar machen: „Vorlage" statt einer Seite, die es gäbe.
   */
  isTemplate?: true
}
