/**
 * Produkt-/Site-Manifeste (Plattform-Strategie F1) — Single Source of Truth,
 * WELCHE Produkt-Layer existieren und WELCHE eine Site nutzt. Layer
 * deklarieren `packages/<key>/product.manifest.ts`, Apps
 * `apps/<app>/site.manifest.ts`; `pnpm check:manifests` hält `extends` und
 * `package.json` dagegen konsistent (CI).
 *
 * WICHTIG: Manifeste werden auch OHNE Nuxt geladen (Node
 * --experimental-strip-types, wie scripts/migrate.mjs) — Manifest-Dateien dürfen
 * aus diesem Modul daher ausschließlich per `import type` importieren.
 */

/** Anzeigetexte in allen Plattform-Sprachen (EN = Default, DE = optional). */
export interface ManifestText {
  en: string
  de: string
}

export interface ProductManifest {
  /** Produkt-Key — MUSS dem Ordnernamen unter packages/ entsprechen. */
  key: string
  /**
   * foundation = Grundgerüst (bei Platform-Sites immer aktiv);
   * optional = zubuchbares Produkt. Baupflicht in Apps haben nur core+system.
   */
  tier: 'foundation' | 'optional'
  /** Harte Layer-Abhängigkeiten (Build bricht ohne sie) — Produkt-Keys. */
  requires?: string[]
  /** Hat der Layer eigene Appwrite-Migrationen (scripts/migrations/)? */
  hasMigrations: boolean
  /**
   * Stand des Schemas (OPS-008) — PFLICHT, sobald `hasMigrations` true ist.
   * Daraus liest `/api/health`, ob die Datenbank zum ausgerollten Programm
   * passt: je Layer EINE Probe am wirklichen Schema (gibt es die Tabelle bzw.
   * Spalte?), kein Register und kein Zeiger. Ein Zeiger hätte gelogen, sobald
   * eine Migration einzeln von Hand läuft — die Probe liest, was da ist.
   *
   * Neue Migration ⇒ `latest` nachziehen; legt sie eine Tabelle oder Spalte
   * an, wandert auch `probe` dorthin. Der Wächter
   * `packages/core/tests/schemaProbeManifests.test.ts` wird sonst rot.
   */
  schema?: ProductSchemaState
  /** Abrechnungs-Schlüssel fürs Control Plane (Default = key). */
  entitlementKey?: string
  /** Katalog-Texte (F7) — bewusst im Manifest, nicht in Layer-Locales:
   *  das Control Plane liest Manifeste später ohne Nuxt-/i18n-Kontext. */
  title: ManifestText
  description: ManifestText
  /** Icon für den Produkt-Katalog, z. B. 'i-ph-chat-circle'. */
  icon?: string
  /**
   * API-Pfad-Präfixe des Produkts (z. B. ['/api/comments']) — Grundlage
   * fürs zentrale Laufzeit-Enforcement (core product-gate-Middleware):
   * Produkt aus ⇒ 404 für alle Routen darunter. Nur für optional-Tier
   * relevant (foundation ist nicht schaltbar).
   */
  apiPrefixes?: string[]
}

export interface ProductSchemaState {
  /** Nummer der höchsten Migration des Layers (Dateipräfix, z. B. '026'). */
  latest: string
  /**
   * Die jüngste Migration, deren Ergebnis sich am Schema ABLESEN lässt: eine
   * Tabelle oder Spalte, die danach existiert und bleibt. Migrationen, die
   * nur Indizes, Rechte, Ablagen oder Daten ändern, sind nicht ablesbar —
   * dann bleibt die Probe auf der letzten ablesbaren stehen.
   */
  probe: {
    /** Nummer der Migration, die das Geprüfte anlegt (≤ `latest`). */
    migration: string
    /** Tabellen-Id, die danach existieren muss. */
    table: string
    /** Spalten-Schlüssel in dieser Tabelle; ohne Angabe zählt nur die Tabelle. */
    column?: string
  }
}

export interface SiteManifest {
  /** Site-Kennung — App-Ordnername unter apps/ (ohne führenden Unterstrich). */
  siteId: string
  /**
   * Gewählte Produkte (Produkt-Keys). core + system sind IMMER dabei und
   * werden nicht gelistet.
   */
  products: string[]
  /**
   * Appwrite-Projekte, gegen die Skripte im Namen dieser App schreiben dürfen
   * (OPS-002). Der Migrations-Runner vergleicht die Projekt-Id aus der
   * Env-Datei damit und bricht bei Abweichung ab — ein vertauschter Dateiname
   * legt so keine Tabellen mehr im falschen Projekt an (Vorfall 2026-08-31:
   * 18 fremde Tabellen in `branding`). Leere Liste = die App hat keine eigene
   * Appwrite-Instanz und wird nie migriert (help, marketing).
   *
   * Projekt-Ids sind öffentliche Kennungen (sie stehen in `NUXT_PUBLIC_*`).
   * Schlüssel gehören NIE hierher.
   */
  appwriteProjects: string[]
}
