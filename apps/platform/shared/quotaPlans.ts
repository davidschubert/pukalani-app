/**
 * KONTINGENT-VORGABE DER POOL-COMMUNITIES (KK1 c, Davids Antworten 6b/6c vom
 * 2026-11-22): die EINE Stelle im Code, an der die Zahlen je Plan und Art
 * stehen. Bis zum 2026-11-22 standen sie direkt in `app/app.config.ts`; sie
 * sind unverändert hierher gezogen (Beweis:
 * `apps/platform/tests/quotaPlans.test.ts`).
 *
 * WER LIEST:
 * - `app/app.config.ts` (`pukalani.tenancy.quota.plans`) — der RÜCKFALL der
 *   Bremse `tenantLimitsFor` (core/server/utils/tenantQuota.ts), solange im
 *   Katalog für Plan und Art nichts steht.
 * - Migration control-042 (packages/control/scripts/migrations) — sie trägt
 *   genau diese Zahlen einmal in den Katalog `community_plans` ein, nur wo
 *   dort eine Art fehlt (nie überschreibend).
 *
 * DIE QUELLE IM BETRIEB IST DER KATALOG: Bremse, Speicher-Anzeige der
 * Community und Konsole lesen `community_plans`; der Betreiber ändert die
 * Zahlen dort ohne Ausliefern (Konsole, Kasten „Pläne & Limits"). Eine
 * Änderung HIER wirkt nur noch, wo der Katalog die Art nicht nennt.
 *
 * Herkunft der Zahlen: H3-4.3 (Blueprint S4, David-Freigabe 2026-07-23),
 * Plan-Rename 2026-07-26 (free/pro/business → basic/personal/pro, Zahlen
 * unverändert), events/media bestätigt 2026-08-03 (F39), Seiten BE-019
 * (2026-11-17). REIHENFOLGE IST VERTRAG: der erste Key ist der Rückfall für
 * einen unbekannten Plan (`limitsForPlan`).
 *
 * WAS GEZÄHLT WIRD, SIND ZEILEN — NICHT BYTES. Für `comments` und `events`
 * ist das dasselbe. Für `media` ist es ein STELLVERTRETER: die Kosten sind die
 * Datei auf der Platte; die Umrechnung steht bei der media-Zeile.
 *
 * NUR DATEN, KEIN IMPORT: die Datei läuft auch in einem Migrations-Skript
 * ohne Nuxt.
 */
export interface PlatformQuotaLimits {
  perDay: number
  total: number
}

export const PLATFORM_QUOTA_PLANS = {
  basic: {
    comments: { perDay: 200, total: 5_000 },
    // SEITEN (BE-019, Davids Entscheidung 2026-11-17): in ALLEN drei
    // Plänen dieselbe Zahl. Die Grenze stoppt Ausreißer (ein Skript,
    // das Seiten in Schleife anlegt), keinen normalen Kunden — eine
    // Vereins-Website hat ein, zwei Dutzend Seiten. Gezählt werden
    // ZEILEN: eine Seite in zwei Sprachen sind zwei, und die Zeilen,
    // die das Anlegen einer Community sät (Startseite, Rechtstexte,
    // Regeln), zählen mit. Gebremst wird nur das ANLEGEN einer neuen
    // Fassung, nie das Bearbeiten (server/api/pages/index.put.ts).
    pages: { perDay: 50, total: 300 },
    // events/media stehen hier BEWUSST NICHT: `tenancy.products` in
    // app/app.config.ts gibt Basic weder Termine noch Mediathek, die Route
    // antwortet schon vorher 404 (requirePlanProduct). Basic ist
    // zugleich der Rückfall für einen UNBEKANNTEN Plan (limitsForPlan
    // nimmt den ersten Katalog-Key) — und genau dort greift dieselbe
    // Produkt-Sperre, weil planAllowsProduct einen unbekannten Plan
    // ebenfalls auf Rang 0 setzt. Ein Loch entsteht dadurch also nicht.
  },
  personal: {
    comments: { perDay: 1000, total: 50_000 },
    // Seiten: gleiche Zahl in allen Plänen, Begründung bei `basic`.
    pages: { perDay: 50, total: 300 },
    // TERMINE. Eine Termin-Zeile kostet nur eine DB-Zeile; die Bremse ist gegen Weglauf (Skript, Endlos-Serie),
    // nicht gegen den Kunden. Deshalb großzügig.
    // `perDay: 50` liegt bewusst ÜBER SERIES_MAX_PER_RUN (26,
    // eventSeries.ts): eine Serien-Ausdehnung legt bis zu 26 Termine
    // in EINEM Lauf an — eine kleinere Tagesgrenze würde eine
    // legitime tägliche Serie schon beim ersten Speichern zerhacken
    // (die Expansion bricht dann sauber ab und protokolliert, aber
    // der Kunde hätte eine halbe Serie).
    // `total: 1_000`: eine wöchentliche Serie kostet 52 Termine im
    // Jahr — das ist Platz für rund zwanzig Serien-Jahre. Termine
    // werden nicht aufgeräumt, der Bestand wächst also monoton.
    // ANMERKUNG: Termine sind heute ein Pro-Produkt (s. `products`),
    // ein Personal-Kunde kommt gar nicht bis hierher. Die Zeile ist
    // die Absicherung für den Tag, an dem das Produkt herunterzieht.
    events: { perDay: 50, total: 1_000 },
    // MEDIATHEK — der einzige Posten mit ECHTEN laufenden Kosten: als einziger Layer legt sie Binärdateien auf
    // die geteilte Platte. Gemessen 2026-08-02 (OPEN-ITEMS E3): 38 GB
    // Platte, 11 GB belegt — rund 27 GB frei, und davon gehört das
    // meiste NICHT der Mediathek (Appwrite, MariaDB, Release-Slots).
    // Umrechnung: MAX_MEDIA_BYTES = 15 MB ist die HARTGRENZE je Bild,
    // nicht der Alltag; ein Handy-Foto nach Export liegt bei ~4 MB.
    //   300 × 4 MB  ≈ 1,2 GB  (Planung)
    //   300 × 15 MB ≈ 4,5 GB  (böswilliges Extrem)
    // Zielgruppe: eine Vereins-Galerie mit Vereinsfest und
    // Jahresrückblick ist bei 100–300 Bildern schon üppig, ein Coach
    // kommt mit 50 aus. `perDay: 50` bremst den Massen-Import (ein
    // Ordner Urlaubsbilder auf einmal), nicht das tägliche Arbeiten.
    media: { perDay: 50, total: 300 },
  },
  pro: {
    comments: { perDay: 5000, total: 250_000 },
    // Seiten: gleiche Zahl in allen Plänen, Begründung bei `basic`.
    pages: { perDay: 50, total: 300 },
    // Gleiche Herleitung, eine Größenordnung darüber:
    // `total: 10_000` Termine sind für eine Community praktisch
    // unerreichbar und fangen trotzdem eine Endlos-Serie ab.
    events: { perDay: 200, total: 10_000 },
    // 1.000 × 4 MB ≈ 4 GB Planung (Extrem 15 GB). Bewusst
    // NICHT höher: eine einzelne Community darf die geteilte Platte
    // auch im Extremfall nicht allein füllen. Wer mehr braucht, ist
    // ein Studio-/Silo-Fall mit eigener Instanz.
    media: { perDay: 200, total: 1_000 },
  },
} satisfies Record<string, Record<string, PlatformQuotaLimits>>
