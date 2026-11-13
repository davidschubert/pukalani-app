import type { CurrentUser } from './appwrite'
import type { TenantContext } from './tenant'
import type { CommunityRole } from '../communityAuthz'
import type { CommunitySeoSettings } from '../communitySeo'
import type { TrustLevel } from '../trustLevel'

declare module 'h3' {
  interface H3EventContext {
    /** Eingeloggter Appwrite-User — gesetzt von server/middleware/02.auth.ts, undefined ohne Session */
    user?: CurrentUser
    /** Horizont-3 Mandant — gesetzt von server/middleware/00.tenant.ts (nur bei
     *  aktivem pukalani.tenancy-Gate + registriertem Resolver), sonst undefined. */
    tenant?: TenantContext
    /**
     * Site-Rolle des eingeloggten Users auf DIESEM Mandanten (N1) — gesetzt von
     * server/middleware/07.community-role.ts, NUR für Seiten-SSR (kein /api/-Pfad; API-
     * Routen autorisieren selbst über requireCommunityPermission).
     * undefined = nicht aufgelöst (Gast, kein Tenant, API-Pfad); null = aufgelöst,
     * aber keine Mitgliedschaft.
     */
    communityRole?: CommunityRole | null
    /**
     * Der eingeloggte User wurde aus der Community DIESES Hosts entfernt
     * (SEC-030 Teil 2, 2026-11-13) — gesetzt von
     * server/middleware/06.community-removed.ts, für Seiten UND API. Nur
     * `true` oder undefined: „nicht entfernt" ist kein eigener Zustand.
     * Leser: tenant-brand.server.ts (Spiegel in den Client) und die
     * Kontakt-Route des onboarding-Layers (NUR für Entfernte).
     */
    communityRemoved?: true
    /**
     * Vertrauensstufe des eingeloggten Users in DIESER Community (F1 Teilpaket
     * 3) — gesetzt von derselben Middleware wie `communityRole` und aus
     * demselben Grund: das Dashboard und die Themen-Menüs blenden Knöpfe nach
     * Capabilities aus, und drei davon kommen seit diesem Teilpaket aus der
     * Stufe. Ohne den Spiegel sähe eine Stufe 4 ihre Werkzeuge nicht.
     *
     * NUR Seiten-SSR (kein /api/-Pfad) — API-Routen fragen selbst
     * (`requireCommunityPermission`, das ist und bleibt die Autorität).
     * undefined = nicht aufgelöst; 0 = aufgelöst, keine Stufe.
     */
    communityTrustLevel?: TrustLevel
    /**
     * Sucheinstellung dieser Community (U15 Teil 2) — gesetzt von
     * server/middleware/09.community-seo.ts, NUR für Seiten-SSR (kein
     * /api/-Pfad; der Kopf entsteht nur dort).
     *
     * undefined = nicht aufgelöst (kein Mandant, API-Pfad); null = aufgelöst,
     * aber keine eigene Wahl. Beide Fälle bedeuten für den Kopf dasselbe —
     * der Unterschied bleibt sichtbar, weil er zwei verschiedene Gründe hat.
     */
    communitySeo?: CommunitySeoSettings | null
    /**
     * Hochgeladenes Favicon dieser Community (Community-Favicon-Upload) —
     * gesetzt von server/middleware/10.community-favicon.ts, NUR für Seiten-SSR
     * (kein /api/-Pfad; der Kopf entsteht nur dort).
     *
     * undefined = nicht aufgelöst (kein Mandant, API-Pfad); null = aufgelöst,
     * aber KEIN eigenes Favicon (der Normalfall — das generierte Icon gilt).
     * `updatedAt` ist der `$updatedAt` der Datei und zugleich der Cache-Brecher
     * für die immutable Icon-URL (`uploadedBrandIconKey`).
     */
    communityFavicon?: { updatedAt: string } | null
    /**
     * Der Request lief auf einem KONTROLL-Host (Kundenbereich, z. B.
     * app.pukalani.app) — gesetzt von server/middleware/00.tenant.ts.
     *
     * Solche Hosts sind bewusst KEIN Mandant: `tenant` bleibt undefined. Genau
     * deshalb ist das Flag sicherheitsrelevant — ohne Mandanten würden
     * tenant-gescopte Routen dort UNGESCOPT laufen. Die Middleware
     * 01.control-center.ts lässt darum nur eine ausdrückliche Liste von
     * API-Pfaden zu und antwortet auf alles andere mit 404.
     */
    controlCenter?: boolean
  }
}

export {}
