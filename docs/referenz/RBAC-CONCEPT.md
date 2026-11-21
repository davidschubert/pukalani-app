# Rollen- & Rechte-Konzept (RBAC)

Konzept vom 2026-06-25, Katalog nachgezogen am 2026-11-21 (den Katalog hält
seitdem `pnpm check:doc-links` gegen `authz.ts`). Implementierungsreifes Konzept für ein dashboard-konfigurierbares
Rollen-/Rechtemanagement. Ergänzt [CONCEPT.md](../CONCEPT.md) (Architektur) und
[OPEN-ITEMS.md](../OPEN-ITEMS.md).

## Getroffene Entscheidungen

1. **Rollen-Umfang:** `admin` + `moderator` (Katalog ist erweiterbar, z. B. `editor` später).
2. **Konfigurierbarkeit:** statische Capability-Matrix **im Code** (versioniert, type-safe);
   **dynamisch im Dashboard ist nur die Zuweisung** Rolle→User.
3. **Geltungsbereich:** globale Rollen über **Appwrite-User-Labels** (keine Teams, kein Multi-Tenant).

## Modell

Drei Ebenen, klar getrennt:

- **Capability** — eine atomare Fähigkeit, gegen die Code gated wird (Code-Identifier, frei wählbar, darf Punkte enthalten). Beispiel `comments.moderate`.
- **Rolle** — ein benanntes Bündel von Capabilities. Wird als **Appwrite-Label** am User gespeichert (Label-Namen sind alphanumerisch: `admin`, `moderator`).
- **Zuweisung** — welcher User welche Rolle(n) hat. Das (und nur das) ist im Dashboard editierbar.

> Die Matrix Rolle→Capabilities ist **nicht** im Dashboard editierbar. Sie ist
> sicherheitskritisch und gehört ins Git-Review, nicht in eine DB-Tabelle.

### Capability-Katalog

**39 Capabilities in zwei Familien.** Quelle ist `packages/core/shared/types/authz.ts`
(`type Capability`) — dort steht zu jeder nicht offensichtlichen auch die Begründung,
warum sie eigen ist und wer sie hält. Die Trennung der Familien ist keine Kosmetik,
sondern entscheidet, WIE gegatet wird:

- **Instanz-Capabilities** kommen aus einer Appwrite-Label-Rolle (`admin`/`moderator`)
  und werden mit dem synchronen `requirePermission(event, cap)` geprüft.
- **Community-Capabilities** kommen aus der Rolle in **einer** Community und werden
  mit dem asynchronen `requireCommunityPermission(event, cap)` geprüft (Site-Rolle,
  dann protokollierter Operator-Break-Glass). Quelle der Zuordnung:
  `packages/core/shared/communityAuthz.ts` → `COMMUNITY_ROLE_CAPABILITIES`.

> `requirePermission` **niemals** um Community-Fälle erweitern: sie ist synchron und
> wird an vielen Stellen ohne `await` gerufen.

Die Aufteilung unten ist **kein Entweder-oder**. Die 11 der ersten Tabelle sind nur
über eine Instanz-Rolle erreichbar; die 28 der zweiten hält mindestens eine
Community-Rolle — davon sind `dashboard.access` und `comments.moderate` zusätzlich im
Instanz-`moderator`, und der Instanz-`admin` hält als Wildcard ohnehin alle 39.

#### Instanz-Capabilities (Betreiber)

| Capability | Bedeutung |
|---|---|
| `users.manage` | User lesen, Rollen/Status setzen, löschen, Sessions beenden, GDPR-Export Dritter |
| `changelog.manage` | Changelog CRUD |
| `system.manage` | System-Info, Self-Update, App-Config-Gates |
| `storage.manage` | Storage-Browser, Orphans löschen |
| `audit.read` | Audit-Log lesen |
| `sites.manage` | Control Plane: Communities/Websites anlegen, sperren, Pläne + Entitlements, Einladungs-Kontingente, Missbrauchs-Meldungen, Jobs |
| `feedback.manage` | Nutzer-Feedback sichten/erledigen/löschen |
| `billing.manage` | Abo-Übersicht im Dashboard einsehen (instanzweit — **nicht** der Abo-Kauf, das ist `community.billing`) |
| `tickets.manage` | Ticket-Board: Listen/Karten, Zuweisung, Anhänge, KI-Triage |
| `runner.manage` | Läufe des AI-Runners anlegen, abbrechen und lesen. **Nur Admin** — ein Auftrag ist Code-Ausführung auf einem fremden Rechner, das ist keine Moderations-Sache |
| `insights.manage` | Redaktion von Brand Insights: Beiträge und Markenprofile anlegen, freigeben, zurückziehen, Korrekturvorschläge entscheiden. **Nur Admin** — die Verantwortung für Aussagen über fremde Marken trägt der Betreiber |

#### Community-Capabilities (5 Rollen je Community)

| Capability | Bedeutung |
|---|---|
| `dashboard.access` | Dashboard öffnen, Overview/Stats lesen |
| `members.invite` | Jemanden herholen — die entstehende Rolle ist immer `viewer`. Bewusst **neben** `team.manage`: „darf einladen" ≠ „darf über die Besetzung bestimmen" |
| `posts.write` | Beiträge verfassen (Autor) |
| `pages.manage` | Inhaltsseiten anlegen/bearbeiten, Navigation, SEO, Weiterleitungen |
| `media.manage` | Medien-Galerie: Upload, Bildunterschriften, Sortierung, Publish |
| `events.manage` | Termine anlegen/bearbeiten/absagen (eigene — Autor-Seite) |
| `messages.write` | Private Konversation eröffnen. Hauptquelle ist **Vertrauensstufe 1**, nicht eine Rolle; der `viewer` bekommt sie ausdrücklich nicht (Spam-Schutz, s. u.) |
| `comments.moderate` | Kommentare ein-/ausblenden, Reports sehen/bearbeiten |
| `reports.moderate` | Melde-Queue (generisch, inkl. private Nachrichten) |
| `posts.moderate` | Fremde Beiträge ausblenden/wiederherstellen |
| `events.moderate` | Fremde Termine ausblenden/wiederherstellen + Melde-Queue. Getrennt von `events.manage`: verfassen ≠ über Fremdes urteilen |
| `posts.curate` | Fremde Themen umbenennen/umkategorisieren — ordnet ein, urteilt nicht (Vertrauensstufe 3) |
| `posts.arrange` | Zustände fremder Themen: anheften, schließen, gelöst (Vertrauensstufe 4) |
| `posts.manage` | Die **Struktur** der Discussions: Kategorien anlegen, umbenennen, sortieren, stilllegen |
| `posts.revise` | Fremde Beiträge inhaltlich bearbeiten. Der Moderator bekommt sie bewusst **nicht** — urteilen ≠ umschreiben |
| `courses.manage` | Kurse/Lektionen anlegen, bearbeiten, publizieren |
| `activity.manage` | Activity-Feed moderieren (Einträge löschen) |
| `branding.manage` | Themes/Schriften der Community |
| `team.manage` | Mitglieder + Rollen, offene Einladungen sehen/zurückziehen |
| `posts.appoint` | Vertrauensstufe 4 von Hand ernennen/entziehen |
| `messages.manage` | Den privaten Kanal der Community auf-/zumachen (Default aus) |
| `community.transfer` | Besitz übergeben |
| `community.delete` | Community stilllegen (Inhalte bleiben) |
| `community.billing` | Abo der Community: Kauf + Stripe-Portal |
| `community.domain` | Eigene Domain eintragen, prüfen, abgeben |
| `community.embed` | Einbetter-Register des Kommentar-Widgets |
| `community.analytics` | Plausible-Script-Id der Community |
| `community.export` | Das Community-Bündel herunterladen (Inhalte + Team, inkl. Entwürfen) |

> **Warum die sieben `community.*` nur der Owner hat:** sie binden die Community nach
> **außen** oder geben sie aus der Hand — Adresse, Abo, fremde Domains im Rahmen,
> Besuchsdaten an Dritte, das gesamte Archiv als Datei, der Besitz selbst. Ein Admin
> verwaltet, was **innen** passiert. Dieselbe Begründung steht an jeder einzelnen in
> `authz.ts`; sie ist der Grund, warum sie nicht in `team.manage` aufgehen.

### Rollen → Capabilities

**Instanz-Rollen** (`type Role` in `authz.ts`, als Appwrite-Label am User):

| Rolle | Capabilities |
|---|---|
| `admin` | **alle** (Wildcard) |
| `moderator` | `dashboard.access`, `comments.moderate` |

**Community-Rollen** (`COMMUNITY_ROLES` in `communityAuthz.ts`, je Community). Jede
Stufe enthält die darunter — außer beim Moderator, der bewusst **kein** Autor ist:

| Rolle | Capabilities (zusätzlich zur Stufe darunter) |
|---|---|
| `viewer` | `dashboard.access`, `members.invite` |
| `editor` | + `posts.write`, `pages.manage`, `media.manage`, `events.manage`, `courses.manage`, `messages.write` |
| `moderator` | (auf `viewer`, **nicht** auf `editor`) + `comments.moderate`, `reports.moderate`, `posts.moderate`, `events.moderate`, `posts.curate`, `posts.arrange`, `messages.write` |
| `admin` | `editor` ∪ `moderator` + `posts.manage`, `posts.revise`, `activity.manage`, `branding.manage`, `team.manage` |
| `owner` | + `community.transfer`, `community.delete`, `community.billing`, `community.domain`, `community.embed`, `community.analytics`, `community.export`, `posts.appoint`, `messages.manage` |

> Der `moderator` erbt vom `viewer`, nicht vom `editor` — er urteilt über fremde
> Inhalte, ohne selbst Autor zu sein. Erst der `admin` vereinigt beide Zweige.
> `messages.write` steht bei beiden Zweigen, weil sie sich sonst nicht schreiben
> könnten; der `viewer` hat sie nicht, weil genau diese Rolle der automatische
> Beitritt (A5) vergibt.

Ein neu Beigetretener ist `viewer`. Die Vertrauensstufen (TL1–TL4) laufen **neben**
den Rollen und können einzelne Capabilities hinzugeben (`messages.write` ab TL1,
`posts.curate` ab TL3, `posts.arrange` ab TL4) — TL1–TL3 rechnet sich jeder selbst
zusammen, TL4 ernennt der Owner (`posts.appoint`).

Ein Moderator kann also: Dashboard + Overview öffnen, gemeldete Kommentare sehen,
aus-/einblenden. Er kann **nicht**: User verwalten, System/Storage/Changelog,
Audit-Log. (Widgets ohne Capability liefern leer/403 — das ist ok, da die Pages
das bereits per `lazy`/`catch` abfangen; capability-abhängiges Ausblenden ist Phase 3.)

## Capability ↔ Endpoint-Mapping

Ersetzt die 23 heutigen `requireAdmin`-Aufrufe. `requireAdmin` bleibt als dünner
Alias `requirePermission(event, 'dashboard.access')` für Kompatibilität, wird aber
pro Route durch die spezifische Capability ersetzt:

| Capability | Routen (`packages/admin/server/api/admin/…` sofern nicht anders) |
|---|---|
| `dashboard.access` | `stats.get`, `analytics.get`, `search.get` |
| `comments.moderate` | `comments/index.get`, `comments/[id]/status.patch` |
| `users.manage` | `users/index.get`, `users/[id]/index.get`, `…/role.patch`, `…/status.patch`, `…/index.delete`, `…/sessions.delete`, `…/export.get` |
| `changelog.manage` | `changelog/index.{get,post}`, `changelog/[id].{patch,delete}` |
| `system.manage` | `system.get`, `system/update.post`, `config.{get,patch}` |
| `storage.manage` | `storage.get`, `storage/[fileId].delete` |
| `audit.read` | `audit.get` |
| `activity.manage` | `packages/activity`: `activity/[id].delete` |
| `posts.moderate` | `packages/posts`: `posts/[id]/hide.post`, `posts/[id]/restore.post` |
| `events.manage` | `packages/events`: `events/index.post`, `events/[id].patch`, `events/[id].delete`, `events/manage.get` |
| `feedback.manage` | `packages/feedback`: `feedback/index.get`, `feedback/[id].patch`, `feedback/[id].delete` |
| `billing.manage` | `packages/billing`: `billing/admin/subscriptions.get` |
| `courses.manage` | `packages/courses`: Builder-Routen (`courses`/`lessons` POST/PATCH/DELETE, Reorder, manage.get) |
| `reports.moderate` | `packages/moderation`: `reports/index.get`, `reports/resolve.post` · `packages/messages`: `messages/moderation/{index,[id]}.get` |
| `media.manage` | `packages/media`: `media/index.{get,post}`, `media/[id].{patch,delete}`, `media/[id]/file.get` |
| `sites.manage` | `packages/control`: das ganze `control/`-Register (Communities/Websites, Pläne, Entitlements, Einladungen + Kontingente, Missbrauchs-Meldungen, Jobs, reservierte Namen, Sweeps) — ~36 Routen, hier nicht einzeln geführt |
| `events.moderate` | `packages/events`: `events/moderation.get`, `events/[id]/{hide,restore,redact}.post` |
| `tickets.manage` | `packages/tickets`: das ganze `tickets/`-Register (Board, Listen, Karten, Anhänge, Watch, Triage) — ~21 Routen |
| `pages.manage` | `packages/pages`: `pages/index.{get,put}`, `pages/[slug].{get,delete}` |
| `posts.write` | `packages/posts`: `posts/mine.get` (das Verfassen selbst läuft über die Datentür, nicht über eine eigene Route) |
| `posts.manage` | `packages/posts`: `posts/categories/index.post`, `…/manage.get`, `…/[id].{patch,delete}` |
| `posts.curate` / `posts.revise` | `packages/posts`: **dieselbe** Route `posts/[id].patch` — beide via `decideCommunityAccess()` im Handler, nicht als Route-Gate (die Route lässt sonst nur den Autor durch) |
| `posts.arrange` | `packages/posts`: `posts/[id]/state.patch` |
| `posts.appoint` | `packages/posts`: `posts/trust-levels/index.get`, `posts/trust-levels/[userId].patch` |
| `branding.manage` | `packages/onboarding`: `community/branding.patch` · `packages/pages`: `pages/{navigation,seo,redirects}.patch`, `pages/redirects.get` |
| `team.manage` | `packages/onboarding`: `community/{profile.get,profile.patch,registration.patch,audience.patch,member-invites.patch,usage.get,products.get,getting-started.get}` |
| `members.invite` | `packages/onboarding`: `community/members/index.post`, `community/invites/quota.get` — geprüft über `requireCommunityTeam*`, nicht über den Standard-Aufruf |
| `messages.write` | `packages/messages`: **kein** Route-Gate — zentral in `server/utils/messageGate.ts`, weil dieselbe Prüfung an mehreren Einstiegen hängt |
| `messages.manage` | `packages/messages`: `messages/settings.patch` |
| `community.transfer` | `packages/onboarding`: `community/members/[id]/transfer.post` |
| `community.delete` | `packages/onboarding`: `community/delete.post` |
| `community.billing` | `packages/onboarding`: `community/billing/trial.get`, `community/suspension.get` |
| `community.domain` | `packages/onboarding`: `community/domain/{index.get,index.put,index.delete,verify.post}` · `packages/domains`: `site/domain/*` |
| `community.export` | `packages/onboarding`: `community/export.get` |
| `community.embed` | `packages/comments`: `admin/embed-sites/index.{get,post}`, `admin/embed-sites/[id].{patch,delete}` |
| `community.analytics` | `packages/analytics`: `analytics/settings.patch`, `analytics/stats.get` |

> `search.get` liefert auch User-Namen — bleibt `dashboard.access` (keine E-Mails/PII
> in der Antwort prüfen; sonst auf `users.manage` heben).

> **Die Community-Routen sind nur die halbe Strecke.** Was Mitglieder, Rollen, Besitz,
> Abo, Domain oder Stilllegung betrifft, liegt als Datum im **Control Plane** — die
> `packages/onboarding`-Route autorisiert und reicht dann über die Service-Naht an
> `packages/control/server/api/control/community/*` weiter, das die Schutzregeln aus
> `packages/control/shared/communityTeam.ts` durchsetzt (kein Selbst-Degradieren, nie
> der letzte Owner). Die Oberfläche kennt dieselben Regeln, verlässt sich aber nicht
> auf sie.

## Struktur (Layer-Zuordnung)

Dependency-Richtung bleibt strikt **App → Feature-Layer → core**; core hängt nie von admin ab.

### core (Fundament — neu)
- `shared/types/authz.ts` — `Capability`-Union, `Role`-Union (type-safe, server+client sichtbar).
- `shared/authz.ts` — **die Matrix**: `ROLE_CAPABILITIES`, `ALL_CAPABILITIES`, plus Helfer
  `capabilitiesFor(labels: string[]): Set<Capability>` und `hasCapability(labels, cap): boolean`.
  In `shared/`, damit Server **und** Client (UI-Hiding) dieselbe Quelle nutzen.
- `server/utils/requirePermission.ts` — Auto-Import:
  ```ts
  requirePermission(event, cap): CurrentUser   // 401 ohne User, 403 ohne Capability
  ```
  liest `event.context.user.labels`, löst via `capabilitiesFor` auf. `admin` ⇒ Wildcard.

### admin (Feature-Layer — geändert)
- Alle `requireAdmin`-Aufrufe → `requirePermission(event, '<cap>')` gemäß Tabelle.
- `server/utils/admin.ts` → `requireAdmin` wird Alias auf `requirePermission(event, 'dashboard.access')` (Deprecation-Kommentar).
- `users/[id]/role.patch.ts` → Rollen-Zuweisung (s. u.).
- `app/middleware/admin.ts` → gated auf `hasCapability(auth.user?.labels, 'dashboard.access')` statt `isAdminUser`.
- Dashboard-UI: Rollen-Auswahl (Mehrfach) statt Admin-Toggle; read-only Matrix-Ansicht optional (Phase 3).

### comments (Feature-Layer)
- **Keine Route-Änderung** — die Moderation läuft über den admin-Endpoint
  `comments/[id]/status.patch`. Durch den Wechsel auf `comments.moderate` können
  Moderatoren ihn nutzen, ohne dass comments etwas ändert.

## Rollen-Zuweisung (Endpoint-Redesign)

`PATCH /api/admin/users/[id]/role` — Body wechselt von `{ admin: boolean }` zu
`{ roles: Role[] }` (validiert: Teilmenge der bekannten Rollen).

Labels-Update: `neueLabels = (bestehende Labels − alle Rollen-Labels) ∪ ausgewählte Rollen`
(nicht-Rollen-Labels bleiben erhalten; Set-basiert wie heute).

**Sicherheits-Invarianten** (alle server-seitig erzwungen):
1. **Keine Eskalation:** der Handelnde darf nur Rollen vergeben, deren Capability-Menge
   ⊆ seiner eigenen ist. (Ein Moderator könnte ohnehin nicht hierher — `users.manage`
   ist admin-only — aber die Regel ist zukunftssicher.)
2. **Last-Admin-Garantie:** Entzug von `admin` beim letzten Admin → 400 `last_admin`
   ([assertNotLastAdmin](../../packages/admin/server/utils/admins.ts) bleibt, prüft weiter das `admin`-Label).
3. **Kein Selbst-Lockout:** eigene `admin`-Rolle nicht entziehbar (wie heute).

## Audit & i18n

- **Audit:** neue Aktion `user.roles_updated` mit `metadata: { before, after }` (Rollen-Diff).
  Bestehende `user.role_granted/revoked` bleiben für Alt-Logs gültig.
- **i18n:** Keys für Rollennamen (`admin.roles.admin`, `admin.roles.moderator`) und
  Capability-Beschreibungen (Matrix-Ansicht) in core- bzw. admin-Locales, DE+EN.

## Migration

**Keine Daten-Migration.** Das bestehende `admin`-Label ist exakt die `admin`-Rolle.
Reiner Code-Change. Kein Migrations-Script nötig.

## Phasen

1. ✅ **Refactor (erledigt):** core-`requirePermission` + Matrix; `requireAdmin`
   @deprecated; alle 23 admin-Gates auf spezifische Capabilities; Client-Middleware
   auf `dashboard.access`. Verhalten identisch (nur `admin` existierte).
2. ✅ **Moderator (erledigt):** Rolle in der Matrix; Moderations-Gates
   (`comments.moderate`); `role.patch` → Mehrfachrollen (`{ roles: Role[] }`) mit
   Eskalations-/Last-Admin-/Selbst-Schutz; Dashboard-Rollen-Editor (Detailseite);
   UserMenu + Middleware auf `dashboard.access`; Audit `roles_updated`; i18n DE+EN.
3. ✅ **Sidebar-Gating (erledigt):** Sidebar-Links (oben + unten) und die Admin-
   Bereich-Tabs sind capability-gefiltert; Dashboard-Pages tragen
   `requiredCapability` und werden zusätzlich zur `dashboard.access`-Hürde von der
   `admin`-Middleware geprüft (Direkt-URL → 403). Ein Moderator sieht nur
   Overview + Kommentare und kommt nirgends sonst hin.
4. **Offen/optional:** Rolle `editor` (`changelog.manage`) — braucht noch eine
   capability-bewusste Landeseite für den „Admin"-Bereich (der Nav-Link zeigt
   aktuell auf den audit-gegateten Index, ein reiner Editor käme so nicht zum
   Changelog); read-only Matrix-Ansicht im Dashboard; Verallgemeinerung von
   „letzter Träger" auf weitere kritische Capabilities.

## Bewusst ausgeklammert

- **Runtime-editierbare Rechte-Matrix** (DB-Tabelle + UI) — Eskalations-/Audit-/Caching-Risiken,
  Rechte-Stand außerhalb des Git-Reviews. Statische Matrix bleibt.
- **Appwrite Teams / Multi-Tenant** — erst bei org-/workspace-scoped Anforderungen.
- **Per-User-Overrides** (einzelne Capability zusätzlich zur Rolle) — Rollen reichen vorerst.
