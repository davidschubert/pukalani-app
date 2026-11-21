import type { CommunitySuspension } from '../communitySuspension'

/**
 * Horizont-3 (Pool+Silo) — Mandanten-Kontext pro Request.
 * Siehe CONCEPT.md A15 und docs/archiv/HORIZONT-3-POOL-SILO-BLUEPRINT.md (Naht 1).
 *
 * GESETZT wird er von `core/server/middleware/00.tenant.ts`, aufgelöst aus dem
 * HOST über den registrierten Resolver (`registerTenantResolver`; die Autorität
 * ist `packages/control/server/utils/tenantsResolver.ts`). Ob überhaupt aufgelöst
 * wird, entscheidet das Config-Gate `pukalani.tenancy.enabled` (Core-Default AUS).
 * Mit Gate: bekannter Host → Kontext, unbekannter Host → 404, Resolver-Fehler →
 * 500 (nie still aufs Default-Projekt fallen).
 *
 * `null` heißt „Single-Tenant" (Playground, help, marketing) — NICHT „Feature
 * noch nicht gebaut". Dieser Kontext trägt den gesamten Pool-Betrieb: an ihm
 * hängen die Datentür (`tenantDb`), die Row-Permissions, die Sperr-Stufen und
 * der Microcache-Schlüssel.
 */
/**
 * `communityId` (G1): die kanonische Kunden-Site = `communities.$id`
 * (G0-Entscheidung „der Tenant IST die Site"; die TABELLE hieß bis control-029
 * `tenants`). Additiv/optional, weil Bestands-Fixtures + Playground den Kontext
 * ohne bauen; der Resolver setzt ihn aus `row.$id`. requireCommunityPermission
 * verlangt ihn (fehlt er → fail-closed).
 *
 * NICHT ZU VERWECHSELN mit `tenantId` weiter unten: `communityId` trägt das
 * Lese-Publikum (`read(label:<communityId>)`), `tenantId` ist der Wert, den
 * `scopeRowFor()` in die SPALTE `communityId` stempelt (seit E8-3 heißt die
 * Spalte so, der Kontext-Wert blieb `tenantId`). Sieht falsch aus, ist es nicht.
 */
/**
 * Branding des Mandanten (O5): das im Onboarding gewählte Built-in-Theme-Paar.
 *
 * MUSS am Mandanten hängen und nicht im Projekt: `app_config.themeSettings` ist
 * EINE Row pro Appwrite-Projekt — im Pool teilen sich alle Communities sie, ein
 * Schreiber hätte also alle anderen mit umgefärbt. Leer/fehlend = die
 * Instanz-Einstellung gilt weiter (heutiges Verhalten).
 */
export interface CommunitySettings {
  theme?: string
  variant?: string
  /**
   * Neutral-Palette der Community (`data-neutral`, control-020) — eigene Achse
   * neben Theme/Variante. Davids Entscheidung vom 2026-07-29 (Rest von B5): sie
   * folgt der Community, nicht dem Besucher. Fehlend/'' = keine eigene Wahl,
   * dann gilt die Voreinstellung der Instanz (heutiges Verhalten).
   */
  neutral?: string
  /**
   * Heimat-Zeitzone der Community (control-038, IANA-Name) — fehlend/'' heißt
   * „keine eigene Wahl".
   *
   * DIE EBENE ÜBER DEM GERÄT: sie sagt, in welcher Zone diese Community PLANT.
   * Ohne sie kam die Vorgabe im Termin-Formular aus dem Browser dessen, der es
   * ausfüllt — und ein Betreiber in Honolulu legte den Hamburger Stammtisch
   * damit auf 07:00 morgens (live erlebt am 2026-08-17). Dasselbe Modell wie
   * bei Meetup: der Organisator tippt „19:00" und meint Gruppen-Zeit.
   *
   * NICHT `prefs.timezone` (U15 Teil 5): das sagt, wie ein EINZELNER Mensch
   * Zeiten ANGEZEIGT bekommt. Zwei verschiedene Fragen, zwei Werte — wer sie
   * zusammenlegt, kann „ich lese in meiner Zone" und „wir planen in unserer"
   * nicht mehr auseinanderhalten.
   *
   * Der Resolver prüft gegen die Zonenliste der Laufzeit (fail-closed) — hier
   * kommt also nie ein Wert an, an dem `Intl` später werfen könnte.
   */
  timezone?: string
  /** Anzeigename des Mandanten (tenants.name) — trägt den öffentlichen
   *  Header der Community-Hosts („Morgenlicht" statt App-Brand). Reiner
   *  Text, wird NIE als Attribut/HTML interpoliert. */
  name?: string
  /**
   * Selbstbeschreibung der Community (U5) — die Wizard-Antwort aus
   * `communities.profile`, nicht eine zweite daneben.
   *
   * BEWUSST NICHT im SSR-Payload gespiegelt (tenant-brand.server.ts,
   * „Spiegel-Inventar"), obwohl `name` direkt darüber es ist: der Name steht
   * im Header jeder öffentlichen Seite und muss deshalb überall vorliegen,
   * die Beschreibung wird heute an GENAU EINER Stelle gebraucht — im
   * Formular, das sie ändert. Sie reiste sonst auf jeder Seite jedes
   * Mandanten mit, für einen Leser, den es nicht gibt. Herausgegeben wird sie
   * von `/api/community/profile` (onboarding), capability-gegated wie
   * `trialEndsAt` es vormacht. Der Resolver liest die Row ohnehin (30-s-Cache),
   * das Feld kostet also keinen zusätzlichen Zugriff.
   */
  description?: string
  /**
   * HAUPTSPRACHE der Community (Q10, Davids Entscheidung B1 vom 2026-11-21):
   * die Sprache, unter der ihre Beiträge für Suchmaschinen zählen. Ein Beitrag
   * von Nutzern hat EINEN Text, aber zwei Adressen (`/…` und `/de/…`) — die
   * Adresse dieser Sprache ist die maßgebliche (`canonical`), und nur sie steht
   * in der Sitemap. Quelle: `locale` im `profile`-JSON der Community (gesetzt
   * beim Anlegen aus der Sprache des Owners, änderbar im Dashboard).
   *
   * FEHLT bei Communities aus der Zeit davor — dann gilt die Vorgabe aus
   * `shared/primaryLocale.ts` (die Grundsprache der App, also die Adresse ohne
   * Vorsatz). Der Resolver lässt nur bekannte Codes durch.
   */
  primaryLocale?: string
  /**
   * KI-TRAINING ERLAUBT (KC1, Bahn 2): der Owner hat im Dashboard gewählt,
   * dass KI-Crawler die öffentlichen Inhalte zum TRAINIEREN nutzen dürfen.
   * Quelle: `aiTraining` im `profile`-JSON. Nur `true` reist mit; FEHLT heißt
   * die Vorgabe „nein" (`core/shared/aiCrawlers.ts`, Art `community`). Wirkt
   * nur auf die robots.txt — eine Bitte an Crawler, kein Schloss.
   */
  aiTraining?: true
}

/**
 * Produkt-Schalter des Mandanten (S1, Davids Entscheidung 4 vom 2026-07-27).
 *
 * Getrennt von CommunitySettings, weil hier keine Optik hängt, sondern eine
 * Zugangsregel: die Autorität ist der Server (assertTenantRegistrationOpen an
 * den Auth-Routen), das UI spiegelt sie nur.
 *
 * `openRegistration` ist OPTIONAL und `undefined` heißt „offen" — Silo-Apps,
 * Playground und Bestands-Fixtures bauen den Kontext ohne das Feld, und die
 * dürfen sich nicht plötzlich zumachen. Der reale Resolver setzt es explizit.
 */
export interface TenantPolicy {
  /** false = neue Mitglieder nur auf Einladung (Register-Seite zeigt Hinweis,
   *  Auth-Routen antworten 403). undefined/true = offen wie bisher. */
  openRegistration?: boolean
  /**
   * Dürfen MITGLIEDER einladen? (F57 Mechanik 2, control-037.) false = nur
   * Owner/Admin, wie vor dem 2026-08-14.
   *
   * OPTIONAL und `undefined` heißt „ja" — dieselbe Bauart und dieselbe
   * Begründung wie bei `openRegistration`: Silo-Apps, Kontroll-Hosts,
   * Playground und Bestands-Fixtures bauen den Kontext ohne das Feld.
   *
   * Er sagt NUR, ob die Community die Mechanik anhat. Ob ICH gerade einladen
   * darf, beantwortet `/api/community/invites/quota` — dort kommen Rolle,
   * Config-Kontingent und Verbrauch dazu. Dieses Feld ist für die
   * EINSTELLUNGS-KARTE des Owners da, nicht als Gate für den Knopf; ein Gate
   * daraus zu bauen hieße, die halbe Regel zweimal zu schreiben.
   */
  memberInvitesEnabled?: boolean
  /**
   * Lese-Publikum der Community (C18, Davids Entscheidung vom 2026-07-30:
   * WÄHLBAR, Default öffentlich). 'members' = Inhalte nur für Mitglieder
   * (Row-Permissions `read(label:<communityId>)`, noindex, leere sitemap,
   * kein og:image); 'public' = wie bisher öffentlich lesbar.
   *
   * OPTIONAL, und `undefined` heißt 'public' — dieselbe Bauart wie
   * `openRegistration`: Silo-Apps, Kontroll-Hosts, Playground und
   * Bestands-Fixtures bauen den Kontext ohne das Feld, und die haben gar keine
   * Community-Grenze. Sie stillschweigend zuzumachen wäre der Schaden (die
   * comments-Silo-App wäre über Nacht noindex).
   *
   * ACHTUNG, ZWEI VERSCHIEDENE FRAGEN: das FAIL-CLOSED-Lesen der DB-Spalte
   * (`resolveTenantAudience`, control) passiert im Resolver — der setzt das
   * Feld für jeden echten Mandanten IMMER explizit. Hier geht es nur um
   * „es gibt gar keinen Mandanten".
   */
  audience?: CommunityAudience
  /**
   * Sperre der Community (M13, control-034 — s. shared/communitySuspension.ts).
   *
   * PRAKTISCH KANN HIER NUR `''` ODER `'billing'` STEHEN: eine abuse-Sperre
   * lässt `mapTenantRowToContext()` gar keinen Kontext bauen (der Resolver
   * liefert `null`, der Host 404et wie ein unbekannter). Der Typ trägt trotzdem
   * alle drei Werte, weil es derselbe Spaltenwert ist — ihn hier zu verengen
   * hieße, an zwei Stellen zwei verschiedene Wahrheiten zu pflegen.
   *
   * OPTIONAL, und `undefined` heißt „nicht gesperrt" — dieselbe Bauart wie
   * `openRegistration`/`audience`: Silo-Apps, Kontroll-Hosts, Playground und
   * Bestands-Fixtures bauen den Kontext ohne das Feld, und die haben keinen
   * Vertrag, den man sperren könnte.
   */
  suspension?: CommunitySuspension
}

/**
 * Das Lese-Publikum einer Community (C18). Bewusst hier in core und nicht nur
 * im control-Layer: core zieht daraus die Row-Permissions und die SEO-Regel,
 * und ein Fundament-Layer darf nicht von einem Feature-Layer abhängen (A14).
 * `resolveTenantAudience()` (control) ist der fail-closed LESER der Spalte und
 * liefert genau diese zwei Werte.
 */
export type CommunityAudience = 'members' | 'public'

/**
 * DIE ADRESSE, UNTER DER DIESE COMMUNITY ZU HAUSE IST (eigene Domains,
 * 2026-08-07 — Davids Entscheidung 2).
 *
 * Eine Community kann seit control-035 unter MEHREREN Hosts auflösen: ihrer
 * Pukalani-Subdomain, ihrer eigenen Domain und deren www-/Apex-Geschwister.
 * Genau EINER davon ist die kanonische Adresse; alle anderen antworten 301
 * (`00.tenant.ts`). Der Resolver rechnet den Wert aus (`canonicalHostFor()`,
 * control), die Middleware vergleicht ihn nur noch mit dem Request-Host.
 *
 * OPTIONAL, und `undefined` heißt „keine Umleitung" — dieselbe Bauart wie
 * `openRegistration`/`audience`/`suspension`: Silo-Apps, Kontroll-Hosts,
 * Playground und Bestands-Fixtures bauen den Kontext ohne das Feld. Sie
 * plötzlich umzuleiten wäre der Schaden.
 */
export interface TenantAddress {
  /** Kanonischer Host dieser Community (ohne Schema/Port). */
  canonicalHost?: string
  /**
   * Wie dauerhaft die Umleitung auf `canonicalHost` ist (control-040).
   * Fehlt das Feld, gilt die Regel von Davids Entscheidung 2: DAUERHAFT
   * (301/308). `'temporary'` setzt der Resolver für eine ABGESCHALTETE eigene
   * Domain (`paused`): ihre Besucher landen auf der Pukalani-Adresse, aber nur
   * vorübergehend (302/307) — die Domain kann wieder eingeschaltet werden, und
   * ein gemerkter 301 bände den Browser an die Pukalani-Adresse.
   */
  canonicalRedirect?: 'temporary'
}

/**
 * DIE DREI MARKT-ANTWORTEN einer Community (U19) — Größe, Zweck, Ziel, so wie
 * sie in `communities.profile` stehen.
 *
 * WARUM STRINGS UND KEINE ENUMS: die Kataloge (`SITE_PURPOSES`,
 * `SITE_MEMBER_RANGES`, `SITE_GOALS`) gehören dem control-Layer, und ein
 * Fundament-Layer hängt NIE von einem Produkt ab (A14). Der Resolver füllt das
 * Feld aus `parseSiteProfile()`, das bereits gegen die Kataloge geprüft hat —
 * hier kommt also nie ein Fremdwert an, und die Route validiert beim SCHREIBEN
 * ohnehin noch einmal gegen dieselben Kataloge.
 *
 * BEWUSST NICHT im SSR-Payload gespiegelt — dieselbe Begründung wie bei
 * `description` und `trialEndsAt` direkt daneben: die Antworten haben genau
 * EINEN Leser (die Karte, die fragt, ob sie überhaupt noch fragen muss), und
 * sie gingen sonst auf jeder öffentlichen Seite jedes Mandanten an jeden Gast.
 * Herausgegeben werden sie von `/api/community/profile-signal` (onboarding),
 * capability-gegated auf `team.manage`.
 *
 * Der Resolver liest die Row ohnehin (30-s-Cache) und parst das Profil schon
 * für `description` — das Feld kostet also keinen zusätzlichen Zugriff.
 */
export interface TenantProfileSignal {
  purpose?: string
  memberRange?: string
  goal?: string
}

export type TenantContext =
  /** Eigenes Appwrite-Projekt (Isolation am Projekt) — Spezial-/Enterprise-Kunde. */
  | ({ mode: 'silo', projectId: string, communityId?: string } & CommunitySettings & TenantPolicy & TenantAddress)
  /**
   * Geteiltes Projekt, Zeilen-Scope über tenantId — Standard-SaaS-Kunde.
   * `plan` (free/pro/business, Default free) staffelt die Quota — core bleibt
   * plan-name-agnostisch (nur ein String-Key in den quota.plans-Katalog).
   * `limits` (optional): vom Resolver bereits AUFGELÖSTE Quota-Limits je
   * kind (z. B. aus dem editierbaren tenant_plans-Katalog des Control Plane)
   * — hat Vorrang vor dem statischen app.config-Katalog (Fallback-Kette in
   * assertPoolWriteQuota).
   */
  /**
   * `trialEndsAt` (M13): Ende der Testphase als ISO-String, wie es in der
   * `communities`-Row steht — `null`/fehlend = keine Testphase (gekauft oder
   * vom Betreiber angelegt). NUR im Pool: eine Silo-Community ist ein
   * Enterprise-Vertrag, die hat keine.
   *
   * BEWUSST NICHT im SSR-Payload gespiegelt (tenant-brand.ts, „Spiegel-
   * Inventar"): der Wert reiste sonst auf JEDER öffentlichen Seite mit und
   * verriete jedem Gast, dass diese Community gerade testet oder ausgelaufen
   * ist. Er wird stattdessen von der Route `/api/community/billing/trial`
   * herausgegeben — capability-gegated an den EINEN, der etwas tun kann.
   *
   * `billingStatus` (U4, 2026-08-12) steht DANEBEN und aus demselben Grund:
   * roh durchgereicht, nirgends ausgewertet, NICHT im SSR-Payload. Der Wert ist
   * der Stripe-Statusraum aus `communities.billingStatus`
   * ('' | 'active' | 'past_due' | 'canceled'); die einzige Frage, die er hier
   * beantwortet, ist „zahlt diese Community?" — und zwar AUTORITATIV statt
   * hergeleitet. Aus `plan` + `trialEndsAt` allein ließe sich das nicht
   * rechnen: eine Testphase setzt `plan: 'pro'`, und `trialEndsAt` wird beim
   * Kauf NICHT geräumt — wer während der Testphase kauft, sähe sonst weiter
   * „Abo abschließen". Der Resolver liest die Row ohnehin (30-s-Cache), das
   * Feld kostet also keinen zusätzlichen Zugriff.
   */
  /**
   * `profileSignal` (U19): die drei Markt-Antworten aus `communities.profile`.
   * NUR im Pool — die Karte, die sie erhebt, hängt an der Willkommens-Welt
   * einer Pool-Community; ein Silo-Kunde ist ein Enterprise-Vertrag, dessen
   * Markt David persönlich kennt. Fehlend = keine einzige Antwort gegeben.
   */
  | ({ mode: 'pool', projectId: string, tenantId: string, plan?: string, limits?: Record<string, { perDay?: number, total?: number }>, communityId?: string, trialEndsAt?: string | null, billingStatus?: string, profileSignal?: TenantProfileSignal } & CommunitySettings & TenantPolicy & TenantAddress)
