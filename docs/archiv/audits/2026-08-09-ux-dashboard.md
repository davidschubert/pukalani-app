# UX-, IA- und Struktur-Review: Dashboard

**Datum:** 2026-08-10 · **Umfang:** alle 57 Dashboard-Seiten aller Layer + Apps,
die vier Navigations-Registries (`admin.modules`, `admin.settingsTabs`,
`admin.communityTabs`, `chrome.*`), die drei Hüllen (`settings.vue`,
`community.vue`, `admin.vue`), die Sidebar (`layouts/dashboard.vue`) und die
i18n-Strings beider Sprachen.
**Nur gelesen — nichts geändert.**

**Nicht prüfbar ohne Session:** tatsächliche Reihenfolge der gemergten
Registry-Arrays zur Laufzeit (Layer-Merge), Überlauf-Verhalten der
Reiter-Zeile auf schmalen Fenstern, Ladezeiten. Alles andere ist am Code belegt.

**Befunde:** 2 KRITISCH · 8 GROSS · 16 MITTEL · 10 KLEIN = **36**

---

## 1. IST-Karte der Navigation

Es gibt **eine** Nav-Regel (`packages/core/shared/dashboardNav.ts`) mit drei
Ebenen (`operator` / `community` / `account`) und drei Orten
(`community` / `control` / `single-tenant`). Daraus ergeben sich drei reale
Menü-Gestalten.

### 1.1 Betreiber-Konsole — `control.pukalani.app` (`apps/control`, Ort `single-tenant`)

```
[Kopf]  DashboardBrand „Pukalani"
        Suche (⌘K) + Glocke (accountBell: true)

Übersicht                                   /dashboard
── Plattform ─────────────────────────────  admin.nav.groups.platform
  Tenants                          (1)      /dashboard/tenants          sites.manage
  Anfragen                         (2)      /dashboard/requests         sites.manage
  Missbrauchsmeldungen             (3)      /dashboard/abuse            sites.manage
  Einladungen                      (4)      /dashboard/invites          sites.manage
  Gesperrte Namen                  (5)      /dashboard/reserved-names   sites.manage
── Studio ────────────────────────────────
  Websites                         (1)      /dashboard/websites         sites.manage
── Management ────────────────────────────
  Customer Feedback                (1)  ▼   /dashboard/feedback         dashboard.access
      Feedback                              /dashboard/feedback
      Roadmap                               /dashboard/roadmap
      Changelog                             /dashboard/admin/changelog  changelog.manage
  Board                            (2)      /dashboard/tickets          tickets.manage
[unten]
  Doku                             (1)      /docs                       dashboard.access
  Stripe                           (2)      /dashboard/stripe           system.manage
  Admin                                     /dashboard/admin            audit.read
  Speicher                                  /dashboard/storage          storage.manage
  System                                    /dashboard/system           system.manage
  Zur Website                               /
[Konto-Menü]
  Abos                                      /dashboard/billing          billing.manage
  Einstellungen                             /dashboard/settings
  Theme · Grundton · Erscheinungsbild · Seitenleiste · Sprache · Abmelden
```

**Kein** Menüpunkt „Community-Einstellungen" (`apps/control` bringt keinen
Layer mit, der `communityTabs` registriert — `packages/admin/app/layouts/dashboard.vue:214-217`).

Hülle **Admin** (`packages/admin/app/pages/dashboard/admin.vue:19-33`), 5 Reiter:
`Aktivitätsprotokoll` · `Changelog` · `Konfiguration` · `Produkte` · `GDPR-Exporte`

**Summe:** 9 Sidebar-Einträge oben, 6 unten, 2 im Konto-Menü, 5 Reiter in „Admin",
4 Reiter in „Einstellungen".

### 1.2 Kunden-Community — `<name>.pukalani.app` (`apps/platform`, Ort `community`)

Rollen-Matrix aus `packages/core/shared/communityAuthz.ts:33-181`. „✓" = im Menü sichtbar.

| Eintrag | Gruppe | Capability | owner | admin | moderator | editor | viewer |
|---|---|---|---|---|---|---|---|
| Übersicht | — | `dashboard.access` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Seiten `/dashboard/pages` | Website | `pages.manage` | ✓ | ✓ | — | ✓ | — |
| **Feed** `/dashboard/posts` | Produkte (1) | `posts.moderate` | ✓ | ✓ | ✓ | — | — |
| Meine Beiträge `/dashboard/my-posts` | Produkte (2) | `posts.write` | ✓ | ✓ | — | ✓ | — |
| **Kategorien** `/dashboard/discussions` | Produkte (3) | `posts.manage` | ✓ | ✓ | — | — | — |
| Events `/dashboard/events` | Produkte (3) | `events.manage` | ✓ | ✓ | — | ✓ | — |
| **Vertrauensstufen** `/dashboard/discussion-leaders` | Produkte (4) | `posts.appoint` | ✓ | — | — | — | — |
| Events moderieren `/dashboard/events-moderation` | Produkte (4) | `events.moderate` | ✓ | ✓ | ✓ | — | — |
| Kurse `/dashboard/courses` | Produkte (4) | `courses.manage` | ✓ | ✓ | — | — | — |
| Medien `/dashboard/media` | Produkte (5) | `media.manage` | ✓ | ✓ | — | ✓ | — |
| Nachrichten `/dashboard/messages` | Produkte (5) | `dashboard.access` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Kommentare `/dashboard/comments` | Einstellungen (2) | `comments.moderate` | ✓ | ✓ | ✓ | — | — |
| Embed-Sites `/dashboard/embed` | Einstellungen (3) | `community.embed` | ✓ | — | — | — | — |
| Gemeldete Nachrichten `/dashboard/message-reports` | Einstellungen (25) | `reports.moderate` | ✓ | ✓ | ✓ | — | — |
| **Customer Feedback** `/dashboard/feedback` ▼ | Management (1) | `dashboard.access` | ✓ | ✓ | ✓ | ✓ | ✓ |
| Community-Einstellungen (unten) | — | erster sichtbarer Reiter | ✓ | ✓ | — | — | — |
| Zur Website (unten) | — | — | ✓ | ✓ | ✓ | ✓ | ✓ |

Die Gruppe **Branding** bleibt hier immer leer: ihr einziger Eintrag
(`themes`) ist `scope: 'operator'` (`packages/themes/app/app.config.ts:1176`).
Ebenso fehlen `Plattform`, `Studio`, die Instanz-Links `Personen`/`Admin`/
`Speicher`/`System` (alle `operatorHere`, `layouts/dashboard.vue:218-230`).

**Reiter-Hülle „Community-Einstellungen"** (`/dashboard/community`, 10 Reiter):

| # | Reiter | Pfad | Capability | owner | admin | mod/editor |
|---|---|---|---|---|---|---|
| 10 | Allgemein | `/dashboard/community` | `team.manage` | ✓ | ✓ | — |
| 20 | Erscheinungsbild | `…/branding` | `branding.manage` | ✓ | ✓ | — |
| 30 | Mitglieder | `…/members` | `team.manage` | ✓ | ✓ | — |
| 40 | Eigene Domain | `…/domain` | `community.domain` | ✓ | — | — |
| 50 | Plan | `…/plan` | `community.billing` | ✓ | — | — |
| 60 | Private Nachrichten | `…/messages` | `messages.manage` | ✓ | — | — |
| 70 | Aktivität | `…/activity` | `activity.manage` | ✓ | ✓ | — |
| 80 | Analytics | `…/analytics` | `community.analytics` | ✓ | — | — |
| 90 | Produkte | `…/products` | `team.manage` | ✓ | ✓ | — |
| 100 | Speicher | `…/storage` | `team.manage` | ✓ | ✓ | — |

Ein **Admin** sieht 6 der 10, ein **Moderator/Editor/Viewer** keinen einzigen —
der Menüpunkt verschwindet für sie ganz (`layouts/dashboard.vue:202-217`). Richtig.

**Reiter-Hülle „Einstellungen"** (`/dashboard/settings`, 4 Reiter, für jeden):
`Allgemein` · `Benachrichtigungen` · `Sitzungen` · `Sicherheit`.
Die Registry `settingsTabs` steuert **null** weitere bei (s. M11).

### 1.3 Silo — `comments.pukalani.app` (`apps/comments`, Ort `single-tenant`)

Wie 1.2, aber ohne `pages`/`onboarding`/`feedback`/`tickets`/`control`, dafür
**mit** der Gruppe `Branding` (Theme-Galerie · Schriften) und den harten
Instanz-Links unten. Der Hub „Community-Einstellungen" hat hier 8 Reiter:

```
Eigene Domain (40) · Private Nachrichten (60) · Aktivität (70) · Analytics (80)
│ ab hier verlässt der Klick die Hülle (packages/admin/app/app.config.ts:32-43):
Produkte (90) → /dashboard/admin/products
Speicher (100) → /dashboard/storage        ← steht zusätzlich in der Sidebar
Konfiguration (110) → /dashboard/admin/config
System (120) → /dashboard/system           ← steht zusätzlich in der Sidebar
```

### 1.4 Kundenbereich — `my.pukalani.app` (`apps/platform`, Ort `control`)

Alle `community`-Einträge fallen weg, alle `operator`-Einträge auch (ein Kunde
hat kein Instanz-Label). Übrig: `Übersicht` · `Customer Feedback` ▼ ·
`Zur Website` + Konto-Menü. Dazu die eigenständigen Seiten `/communities`,
`/start/*`, `/join`, `/request-access`, `/report-abuse` außerhalb von `/dashboard`.

---

## 2. Befunde

### KRITISCH

---

**K1 · Eine Community lässt sich nach dem Anlegen nicht mehr umbenennen.**

*Ort:* `packages/onboarding/app/pages/dashboard/community/index.vue:243-300`
(Reiter „Allgemein" — enthält nur `openRegistration`, `audience` und die
Gefahrenzone) · `packages/onboarding/server/api/community/` (26 Routen, keine
für Name/Beschreibung) · `packages/control/server/api/control/tenants/[id].patch.ts:11-22`
(nimmt ausschließlich `status`, `wave`, `plan`).

*Was stört:* Der Name wird einmal im Wizard gesetzt (`/start/community`) und ist
danach für **niemanden** änderbar — nicht für den Owner, nicht für den Betreiber.
Er trägt aber die halbe Oberfläche: Sidebar-Kopf (`useBrandName()`), Browser-Titel,
Favicon-Initial, `og:image` (`/og/<key>.png`), Absendername der Benachrichtigungs-Mails,
Switcher-Eintrag. Ein Tippfehler beim Anlegen ist dauerhaft. Für einen zahlenden
Owner ist das der einzige wirklich unumkehrbare Fehler im Produkt — und der
Reiter, auf dem er ihn suchen würde, heißt „Allgemein" und ist leer bis auf zwei
Schalter.

*Vorschlag:* Eine Karte „Name und Beschreibung" ganz oben auf `…/community`
(`team.manage`), Route `PATCH /api/community/profile` → Service-Naht →
`control/community/profile.post.ts`. Der Host bleibt unberührt (der wird über
„Eigene Domain" verwaltet), es geht nur um `communities.name`. Der Realtime-
Spiegel `community_branding` (D6) ist der bereits gebaute Weg, den neuen Namen
live in offene Fenster zu bringen.

*Aufwand:* **M**

---

**K2 · Die Übersicht zeigt einem Owner genau eine Zahl — und die ist über Kommentare.**

*Ort:* `packages/admin/app/pages/dashboard/index.vue:84-92` ·
`packages/admin/shared/types/admin.ts:99-107`.

*Was stört:* `AdminStats` hat drei Felder: `usersTotal`, `commentsTotal`,
`commentsReported`. Im Pool ist `usersTotal` **bewusst `null`** (Audit-Befund B2 —
Projekt-Nutzer ≠ Mitglieder dieser Community), `commentsReported` erscheint nur
mit `comments.moderate`. Für den Owner einer Community, deren Produkt Beiträge,
Events oder Kurse sind, bleibt auf seiner Landeseite: eine Kachel „Kommentare",
die Anwesenheits-Karte, ein Chart mit den Achsen *Nutzer* und *Kommentare*, und
eine Moderations-Vorschau. **Keine** Mitgliederzahl, **kein** Beitragszähler,
**keine** Speicher-Auslastung, **kein** Plan-/Testphasen-Zustand als Zahl.

Für `pukalani.admin.notices` gibt es eine Layer-Registry (`index.vue:69-70`) —
für die Kennzahlen gibt es keine. Jede Zahl in dieser Ansicht stammt aus der
Silo-Vergangenheit von `apps/comments`.

*Vorschlag:* Kennzahlen-Registry nach dem Muster von `notices`
(`registerDashboardStat`), Erstbefüllung durch `posts`, `onboarding`
(Mitglieder + Speicher) und `events`. Die Zähl-Infrastruktur existiert bereits:
`registerCommunityUsageCounter` (F51 Paket 2) zählt genau diese Objekte für den
Speicher-Reiter.

*Aufwand:* **M**

---

### GROSS

---

**G1 · Im Silo heißt der Menüpunkt „Community-Einstellungen" und enthält „System".**

*Ort:* `packages/admin/app/app.config.ts:60-110` (vier Instanz-Reiter) ·
`packages/admin/app/layouts/dashboard.vue:214-217` (Menüpunkt) ·
`apps/comments/app/app.config.ts:46` (`instanceTabs: true`).

*Was stört:* In `apps/comments` gibt es keine Community — trotzdem heißt die
Hülle „Community-Einstellungen", und darin stehen `Produkte`, `Speicher`,
`Konfiguration`, `System`. Vier davon verlassen beim Klick die Hülle (die
Reiter-Zeile verschwindet), zwei (`Speicher`, `System`) stehen gleichzeitig
hart in der Seitenleiste. Der Kommentar an Ort und Stelle nennt beides als
bewussten Preis — der Preis ist aber nicht die *Struktur*, sondern das *Wort*:
„Community-Einstellungen" für ein Verzeichnis der Instanz-Verwaltung ist eine
falsche Auskunft.

*Vorschlag:* Der Schalter `admin.instanceTabs` ist schon da. Wo er `true` ist,
den Label-Key des Menüpunkts und den Hüllen-Titel auf `admin.nav.instanceSettings`
(„Instanz-Einstellungen" / „Instance settings") umschalten — eine `computed` im
Layout, zwei neue i18n-Keys. Struktur unangetastet.

*Aufwand:* **S**

---

**G2 · Der erste Menüpunkt des Betreibers heißt „Tenants" — auf Deutsch und auf Englisch.**

*Ort:* `packages/control/i18n/locales/de.json` + `en.json` → `admin.nav.tenants`
= „Tenants" · `control.tenants.title` = „Tenants" ·
`packages/control/app/app.config.ts:872-880` (`to: '/dashboard/tenants'`).

*Was stört:* E8 hat `tenants` → `communities` umbenannt (Daten, Code, Routen);
`docs/archiv/DASHBOARD-IA.md:45` schreibt den Menüpunkt als „Communities · Overview"
fest. Die Oberfläche hat es nicht mitgemacht. Schlimmer: **auf demselben Bildschirm
stehen beide Wörter** — `control.tenants.new` = „Neuer Tenant",
`control.tenants.emptyTitle` = „Noch keine Mandanten",
`control.tenants.rowActions` = „Aktionen für diesen Mandanten". Drei Wörter
(Tenant · Mandant · Community) für dasselbe Objekt in einer Tabelle.

*Vorschlag:* `admin.nav.tenants` → „Communities", die ~12 `control.tenants.*`-Werte
auf „Community" ziehen, Pfad `/dashboard/tenants` → `/dashboard/communities` +
301 in beiden Locales. Der Schlüssel-Name darf bleiben (Protokoll).

*Aufwand:* **S**

---

**G3 · Das Beitrags-Produkt heißt an drei Stellen anders, und ein Wort ist doppelt belegt.**

*Ort:* `packages/posts/app/app.config.ts:969-981` (`to: '/dashboard/posts'`,
`labelKey: 'admin.nav.posts'`) · `packages/posts/i18n/locales/de.json`
→ `admin.nav.posts` = **„Feed"**, `posts.moderation.title` = **„Feed-Beiträge"** ·
`packages/blueprint/app/app.config.ts:610` (öffentlicher Nav-Eintrag **„Feed"**
→ `/feed`).

*Was stört:* Der Menüpunkt heißt „Feed", der Pfad `posts`, die Seite
„Feed-Beiträge". Daneben steht „Meine Beiträge" (`/dashboard/my-posts`) — dasselbe
Objekt, anderes Wort. Und „Feed" bezeichnet in derselben Anwendung bereits die
öffentliche Beitragsliste. Wer im Dashboard „Feed" klickt, landet in einer
Moderations-Warteschlange; wer „Beiträge" sucht, findet nur „meine".

*Vorschlag:* `admin.nav.posts` → „Beiträge" / „Posts". „Feed" bleibt reserviert
für die öffentliche Ansicht. Seitentitel auf „Beiträge moderieren" — analog zum
schon vorhandenen „Events moderieren".

*Aufwand:* **S**

---

**G4 · Pfad und Menüname beschreiben verschiedene Dinge (`discussions`, `discussion-leaders`).**

*Ort:* `packages/posts/app/app.config.ts:1018-1020` (`posts.nav.categories` =
„Kategorien" → `/dashboard/discussions`) · `:1040-1042`
(`posts.nav.trustLevels` = „Vertrauensstufen" → `/dashboard/discussion-leaders`).

*Was stört:* Zwei Adressen, deren Segmente in keiner Oberfläche vorkommen.
`discussion-leaders` ist überdies eine Wortneuschöpfung — die Seite heißt
„Vertrauensstufen", die Sache heißt in `communityAuthz.ts` `posts.appoint`.
Wer die URL im Browser liest oder ein Lesezeichen benennt, hat drei Vokabeln
zur Auswahl und keine trifft.

*Vorschlag:* `/dashboard/discussions` → `/dashboard/categories`,
`/dashboard/discussion-leaders` → `/dashboard/trust-levels`, je 301 in beiden
Locales (das Muster steht in `packages/onboarding/nuxt.config.ts:39-48`).

*Aufwand:* **S**

---

**G5 · Die Arbeit eines Moderators liegt in zwei Gruppen — und keine davon heißt „Moderation".**

*Ort:* Gruppen-Reihenfolge `packages/admin/app/layouts/dashboard.vue:163`
(`platform, studio, management, website, products, branding, settings`).
Zuordnungen: `posts.moderate` und `events.moderate` → Gruppe **`products`**
(`posts/app.config.ts:980`, `events/app.config.ts:72`), `comments.moderate` und
`reports.moderate` → Gruppe **`settings`** (`comments/app.config.ts:1076`,
`messages/app.config.ts:1440`).

*Was stört:* Das vollständige Menü eines Moderators lautet:
`Übersicht` — `Produkte`: *Feed, Events moderieren, Nachrichten* — `Einstellungen`:
*Kommentare, Gemeldete Nachrichten* — `Management`: *Customer Feedback*.
Vier seiner fünf Arbeitsflächen sind Moderation, verteilt auf zwei Gruppen, von
denen eine „Einstellungen" heißt (er darf dort nichts einstellen) und die andere
„Produkte" (er verwaltet keine). Dazu eine Gruppe „Management" mit dem
Produkt-Feedback des Betreibers. Für die Rolle, deren einziger Zweck Moderation
ist, gibt es keinen Ort, der so heißt.

*Vorschlag:* Achte Gruppe `moderation` in die Reihenfolge aufnehmen (zwischen
`products` und `branding`), die vier Einträge umhängen, zwei i18n-Keys
(`admin.nav.groups.moderation`). Kein Pfad ändert sich.

*Aufwand:* **S–M**

---

**G6 · „Branding" bedeutet drei Dinge, „Erscheinungsbild" zwei.**

| Wort | Bedeutet | Fundstelle |
|---|---|---|
| Branding (Gruppenlabel) | Sammelname der Gruppe | `admin.nav.groups.branding` |
| Branding (Menüpunkt) | Theme-**Katalog** der Instanz, `system.manage`, Betreiber-only | `themes.customize.navLabel` → `/dashboard/themes` |
| Theme anpassen (Seitentitel derselben Seite) | dasselbe | `themes.customize.title` |
| Erscheinungsbild (Reiter) | Farb**wahl** der Community, `branding.manage` | `branding.navLabel` → `/dashboard/community/branding` |
| Erscheinungsbild (Konto-Menü) | Hell/Dunkel-Umschalter | `themes.modeLabel` |

*Was stört:* Der F5-Schnitt (Wahl ≠ Katalog) ist inhaltlich richtig und gut
begründet — aber die **Wörter** machen ihn unsichtbar. Ein Owner, der sein
Branding sucht, findet im Menü eine Gruppe „Branding", die für ihn leer ist
(operator-only), und muss stattdessen „Community-Einstellungen → Erscheinungsbild"
raten. Gleichzeitig heißt der Hell/Dunkel-Schalter in seinem Konto-Menü ebenfalls
„Erscheinungsbild".

*Vorschlag:* Drei Wörter, drei Sachen:
`themes.customize.navLabel` → „Theme-Katalog" / „Theme catalog" (Betreiber),
`branding.navLabel` bleibt „Erscheinungsbild",
`themes.modeLabel` → „Hell &amp; dunkel" / „Light &amp; dark".
Gruppenlabel `branding` → „Gestaltung" / „Design", damit Gruppe und Eintrag
nicht denselben Namen tragen.

*Aufwand:* **S**

---

**G7 · Community-Seiten liegen auf zwei URL-Ebenen ohne erkennbare Regel — inklusive einer echten Falle.**

*Ort:* 13 Seiten flach unter `/dashboard/<x>` mit `scope: 'community'`
(`posts`, `my-posts`, `discussions`, `discussion-leaders`, `events`,
`events-moderation`, `courses`, `media`, `messages`, `comments`, `embed`,
`message-reports`, `pages`) — 10 Seiten unter `/dashboard/community/<x>`.

*Was stört:* Beide Gruppen sind dieselbe Ebene. Die Trennung ist „Arbeitsfläche
vs. Einstellung", steht aber nirgends in der Adresse, und die Zuordnung ist
angreifbar: `/dashboard/embed` ist eine reine Owner-**Einstellung**
(`community.embed`) und liegt flach; `/dashboard/community/activity` ist eine
Moderations-**Fläche** und liegt im Hub.

Die konkrete Falle:

```
/dashboard/messages            → Posteingang           (dashboard.access, jedes Mitglied)
/dashboard/community/messages  → Schalter „gibt es PN?" (messages.manage, nur Owner)
```

Zwei Adressen, ein Segment Unterschied, völlig verschiedene Dinge und
verschiedene Publika. Dasselbe Muster droht bei `storage` (`/dashboard/storage`
Instanz-Buckets vs. `/dashboard/community/storage` Kontingent) und `products`
(`/dashboard/admin/products` vs. `/dashboard/community/products`) — dort ist es
schon Realität, nur in verschiedenen Apps.

*Vorschlag:* Die Regel benennen und durchziehen: **alles unter
`/dashboard/community/*`, was der Community-Hub zeigt; alles andere flach.**
Konkret `/dashboard/embed` → `/dashboard/community/embed` (Reiter statt
Sidebar-Eintrag — er passt zu „Publikum/Zugang"), und
`/dashboard/community/messages` → `/dashboard/community/private-messages`,
damit die beiden Adressen nicht mehr nur um ein Segment auseinanderliegen.

*Aufwand:* **M**

---

**G8 · „Customer Feedback" steht im Dashboard jedes Mitglieds jeder Kunden-Community — auf Englisch.**

*Ort:* `packages/feedback/app/app.config.ts:44-56` (`scope: 'account'`,
`requiredCapability: 'dashboard.access'`, `group: 'management'`) ·
`packages/feedback/i18n/locales/de.json` → `feedback.nav.section` =
**„Customer Feedback"** (identisch mit dem englischen Wert).

*Was stört:* `scope: 'account'` heißt „überall" (`dashboardNav.ts:77`), und
`dashboard.access` trägt jede der fünf Community-Rollen. Ein normales Mitglied
einer Kundencommunity sieht damit in seinem Dashboard eine Gruppe **„Management"**
mit dem Eintrag **„Customer Feedback"** und darunter die **„Roadmap"** — den
Produktkanal des Betreibers. Das ist Davids E10-Entscheidung („der
Feedback-Bereich ist Bestandteil ALLER Dashboards"), also **Entscheidung, nicht
Fehler** — der Preis sind aber zwei Dinge, die man ohne die Entscheidung
anzutasten beheben kann: die Gruppe heißt für ein Mitglied sinnlos „Management",
und das Label ist der einzige unübersetzte Nav-Eintrag im gesamten deutschen
Menü.

*Vorschlag:* `feedback.nav.section` de → „Wünsche &amp; Ideen", en → „Feedback".
Für `scope: 'account'`-Einträge eine eigene Gruppe `account` („Dein Konto" /
„Your account") statt `management` — dann steht der Punkt bei einem Mitglied dort,
wo er hingehört, und beim Betreiber immer noch am selben Fleck.

*Aufwand:* **S**

---

### MITTEL

**M1 · `order`-Kollisionen in der Gruppe „Produkte" über Layer-Grenzen.**
`posts` vergibt 1–4, `events` 3–4, `courses` 4, `media` 5, `messages` 5.
Sortiert wird stabil nach `order` (`layouts/dashboard.vue:166`), bei Gleichstand
entscheidet die Merge-Reihenfolge der Registry-Arrays — also die Reihenfolge in
`extends`. Drei Gleichstände (3/3, 4/4/4, 5/5) bei neun Einträgen. Die Reihenfolge
ist damit nicht entworfen, sondern zufällig stabil.
*Vorschlag:* Vergabe in Zehnerschritten je Layer dokumentieren (posts 10–40,
events 50–60, courses 70, media 80, messages 90) — wie es die `communityTabs`
schon machen. *Aufwand:* **S**

**M2 · Zehn horizontale Reiter im Community-Hub, acht im Silo.**
`packages/admin/app/pages/dashboard/community.vue:132-134` rendert sie als eine
`UNavigationMenu` in einer `UDashboardToolbar`. Der `order`-Kommentar in
`packages/onboarding/app/app.config.ts:766-768` erkennt das Problem bereits
(„was man nachschlägt statt einzustellen, kommt hinten"), löst es aber nur
durch Sortierung. *Vorschlag:* Fünf Zuständigkeiten (Allgemein, Erscheinungsbild,
Mitglieder, Domain, Plan) als Reiter behalten; Produkte · Speicher · Aktivität ·
Analytics als Karten auf den Reiter „Allgemein" oder in die Übersicht (K2) ziehen.
*Aufwand:* **M**

**M3 · Domain: gleiche deutsche Bezeichnung, zwei englische — und ein komplett duplizierter Wortschatz.**
`onboarding.domain.navLabel` de „Eigene Domain" / en **„Custom domain"** vs.
`siteDomain.navLabel` de „Eigene Domain" / en **„Own domain"**. Beide zeigen auf
`/dashboard/community/domain`, beide Layer liefern einen byte-nahezu identischen
Satz `*.savedTitle/removedTitle/steps.*`. Keine App zieht beide, also kein Bruch —
aber jede Textänderung muss zweimal gemacht werden. *Vorschlag:* EN vereinheitlichen
auf „Custom domain"; die geteilten Strings in `core` heben. *Aufwand:* **S**

**M4 · Fünf Namen für Geld.**
„Plan" (Reiter, `onboarding.communityTabs.plan`) → Seitentitel „Abo &amp; Rechnung"
(`onboarding.subscription.title`) → Pfad `/dashboard/community/plan` →
Betreiber-Eintrag „Abos" (`admin.nav.billing` → `/dashboard/billing`) →
öffentlich „Preise" (`billing.pricing.title`). Dazu
`onboarding.subscription.noPlanLabel` de = „Kein Abo – **Free Plan**", obwohl
`basic` seit F49 kein Angebot mehr ist und der Plan-Katalog „Basic" heißt.
*Vorschlag:* Reiter und Seitentitel angleichen („Abo"), „Free Plan" → „Kein Abo".
*Aufwand:* **S**

**M5 · Der Bereich „Admin" heißt „Admin".**
`packages/admin/app/pages/dashboard/admin.vue:11,39`. Fünf Reiter
(Aktivitätsprotokoll, Changelog, Konfiguration, Produkte, GDPR-Exporte), die nichts
verbindet außer der Rolle des Betrachters — in einer Anwendung, die insgesamt
ein Admin-Dashboard ist. *Vorschlag:* „Instanz" / „Instance" oder Auflösung:
Changelog gehört schon zu Customer Feedback, Konfiguration + Produkte zur
Instanz-Sicht, GDPR-Exporte zu „Personen". *Aufwand:* **S**

**M6 · Zwei Konto-Seiten haben keinen Browser-Titel.**
`packages/admin/app/pages/dashboard/settings/index.vue:8` und
`…/notifications.vue:8`: `useHead({ title: … })` steht **nach** `</script>` und
vor `<template>` — außerhalb jedes SFC-Blocks, also toter Text. Die Geschwister
`security.vue` und `sessions.vue` haben es korrekt im Script.
*Aufwand:* **S**

**M7 · Keine einzige Seite nutzt `UDashboardNavbar :description`.**
0 von 35 Navbars. Mehrere Seiten bauen sich stattdessen einen Untertitel in den
Body (`comments/embed.vue:149`, `control/tenants.vue:349`,
`activity/community/activity.vue:25`) — drei verschiedene Erscheinungsbilder für
dieselbe Aussage. *Vorschlag:* `description` als Teil des Seiten-Musters festlegen.
*Aufwand:* **M** (35 Seiten, je eine Zeile)

**M8 · Zehn Seiten mit Datenfläche ohne `CoreEmptyState`.**
`apps/control/…/stripe.vue` (gar keiner) · `admin/admin/index.vue:93` (nacktes `<p>`) ·
`admin/dashboard/index.vue:309,334` (`<p>`) · `admin/system.vue:277` (nur „—") ·
`admin/admin/config.vue` · `domains/community/domain.vue` ·
`onboarding/community/{branding,domain,plan}.vue` · `themes/themes/index.vue`
(UTable ohne `#empty`) · `tickets/tickets.vue` (kein Board-Leerzustand).
Teilweise: `feedback/roadmap.vue:128`, `analytics/…/analytics.vue:406,417`,
`messages/messages.vue` (CoreEmptyState deckt nur „Produkt aus", nicht „Postfach leer").
*Aufwand:* **M**

**M9 · Elf handgebaute Listen ohne die von B6 verlangte Begründung.**
Dokumentiert (Kommentar vorhanden): `activity.vue`, `admin/config.vue:81`,
`dashboard/index.vue:288`, `tickets.vue:202`. **Undokumentiert:**
`stripe.vue:443` · `admin/products.vue:70` · `analytics.vue:389,408,419` ·
`domains/community/domain.vue:259` · `feedback/roadmap.vue:121` ·
`onboarding/community/branding.vue:208`, `domain.vue:280`, `plan.vue:294`,
`products.vue:100,127`, `storage.vue:112` · `messages/messages.vue:153`.
Mehrere davon sind legitim (Kanban, Farbfelder, DNS-Schritte) — genau deshalb
verlangt B6 den Satz an der Stelle. *Aufwand:* **S** (Kommentare) bis **L** (Umbau)

**M10 · „Daten exportieren" liegt unter „Sicherheit".**
`packages/admin/app/pages/dashboard/settings/security.vue:11-13` rendert
`AuthPasswordChangeForm` + `AuthAccountDataExport` + `AuthAccountDeleteCard`.
`DASHBOARD-IA.md:83-84` trennt „Anmeldung" von „Konto (Daten exportieren ·
Konto löschen)". Ein Nutzer, der seine Daten sucht, klickt „Sicherheit" nicht.
*Aufwand:* **S**

**M11 · Die Registry `settingsTabs` hat null Produzenten.**
Deklariert in `packages/core/app/app.config.ts:172`, gelesen in
`packages/admin/app/pages/dashboard/settings.vue:42-45` — kein einziger Layer
registriert mehr etwas (F51 hat `messages` und `domains` nach `communityTabs`
gezogen). Die Konto-Hülle hat damit vier fest verdrahtete Reiter und eine tote
Naht daneben. Nicht schädlich, aber die nächste Konto-Einstellung wirft die
Frage „welche Hülle?" neu auf, ohne dass ein Beispiel dasteht.
*Aufwand:* **S** (Kommentar, der den Zustand benennt)

**M12 · Zwei Quellen für denselben Sidebar-Titel.**
`DashboardCommunityMenu.vue:52` nutzt `useBrandName()` (Community-Name vor
App-Brand), `DashboardBrand.vue:10` liest `appConfig.pukalani.brand.name` direkt.
Solange `chrome.communitySwitcher` in `apps/platform` an ist, fällt es nicht auf —
wäre er aus, stünde auf jedem Kunden-Host „Pukalani". Der `OFFEN`-Kommentar in
`packages/core/app/app.config.ts:129-133` beschreibt genau diese Lücke.
*Vorschlag:* `DashboardBrand` auf `useBrandName()` ziehen. *Aufwand:* **S**

**M13 · Kein 301 für `/dashboard/sites` → `/dashboard/websites`.**
Die Umbenennung ist committed (`f1fcf5ce`), `packages/control/nuxt.config.ts`
hat keine `routeRules` — während `onboarding`, `domains`, `activity`, `analytics`
und `messages` für ihre F51-Umzüge jeweils beide Locales umleiten. Betreiber-Bereich,
also geringe Reichweite, aber ein gebrochenes Lesezeichen für David selbst.
*Aufwand:* **S**

**M14 · „Aktivität" bezeichnet drei Dinge.**
`admin.nav.activity` = „Aktivität" (Community-Aktivitätsfeed) ·
`activity.moderation.title` = „**Activity-Feed**" (dieselbe Seite, deutsch mit
Anglizismus) · `admin.audit.title` = „Aktivitätsprotokoll" (Audit-Trail, anderer
Bereich) · `admin.analytics.title` (Kennzahlen der letzten N Tage).
*Vorschlag:* Feed → „Aktivität", Audit → „Protokoll" / „Audit log".
*Aufwand:* **S**

**M15 · „Board" steht neben „Roadmap" im selben Betreiber-Menü.**
`admin.nav.tickets` = „Board" (de+en) → `/dashboard/tickets`, Seitentitel
„Ticket-Board"; direkt darüber `feedback.nav.roadmap` = „Roadmap".
`docs/plans/VOKABULAR-AUFRAEUMEN.md:28` hält fest, dass „Board" zu „Roadmap"
werden sollte (E10) — passiert ist das Gegenteil: beide existieren.
*Vorschlag:* „Board" → „Aufgaben" / „Tasks". *Aufwand:* **S**

**M16 · Deutsche Großschreibung in englischen Strings.**
`packages/control/i18n/locales/en.json`: `admin.nav.websites` und elf
`control.websites.*`-Werte — „No **W**ebsites registered yet.",
„Register **W**ebsite", „Actions for this **W**ebsite". Ebenso
`admin.nav.groups.website` = „Website" als Gruppenlabel. Sonst ist das
englische Korpus durchgehend Satzschreibung. *Aufwand:* **S**

---

### KLEIN

**S1** Tote i18n-Schlüssel: `admin.nav.users` („Benutzer"/„Users") und
`admin.nav.audit` („Aktivitätsprotokoll"/„Activity log") in
`packages/admin/i18n/locales/*.json` — null Konsumenten. Der Menüpunkt auf
`/dashboard/users` nutzt `admin.nav.people`, der Reiter `admin.audit.title`.

**S2** Reiter „Allgemein" → Browser-Titel „Community"
(`onboarding/…/community/index.vue:78`, Key `dashboard.settings.community`) →
Seitenüberschrift „Community" (`dashboard.community.title`). Drei Namen für
einen Reiter.

**S3** `admin.nav.embedSites` de = „Embed-Sites" — Anglizismus plus die von E8
zurückgezogene Vokabel „Sites"; acht weitere `comments.embedAdmin.*`-Werte
tragen sie mit („Neue Site", „Site registriert").

**S4** Zwei Title-Case-Ausreißer unter 35 Sentence-Case-Nav-Labels:
`themes.customize.gallery` en = „Theme **G**allery",
`feedback.nav.section` en = „Customer **F**eedback".

**S5** `themes.fonts.navLabel` en = „Typefaces" — gehobenes Fachwort in einem
sonst alltagssprachlichen Menü („Fonts" wäre der Hausgebrauch, und die
deutschen Strings sagen „Schriften").

**S6** Alle Dashboard-Pfade sind englisch, auch unter `/de/`
(`/de/dashboard/community/branding`). Der `onboarding`-Layer nutzt für seine
öffentlichen Seiten `defineI18nRoute` mit deutschen Pfaden
(`anfragen.vue:13`, `missbrauch-melden.vue:29`) — die Konvention endet an der
Dashboard-Grenze, ohne dass irgendwo steht, dass sie das soll.

**S7** `packages/courses/app/pages/dashboard/courses/[id].vue:198` ist die
einzige Seite mit nicht-i18n-Navbar-Titel (`course?.title ?? '…'`).

**S8** `admin.nav.homepage` = „Zur Website" / „View site" — auf einem
Mandanten-Host führt der Link in die Community, nicht auf eine „Website".

**S9** `dashboard.community.appearance.pickerTitle` en = „Community **colours**"
(en-GB) in einem sonst durchgehend en-US-Korpus (`themes.customize.sectionColors`
= „Colors").

**S10** `admin.gdprExports.title` de = „GDPR-Exporte" — die deutsche Fassung
sagt sonst DSGVO (`billing.compare.account.export` = „Datenexport (DSGVO)").

---

## 3. Naming-Matrix

Zahl in Klammern = Anzahl unterschiedlicher Oberflächen-Wörter je Sprache.

| Begriff | Deutsche Varianten (Fundstelle) | Englische Varianten | Empfehlung |
|---|---|---|---|
| **Kundenraum** (6 de / 6 en) | **Community** (`dashboard.community.title`) · **Tenant** (`admin.nav.tenants`, `control.tenants.new`) · **Mandant** (`control.tenants.emptyTitle,rowActions`) · **Website** (`admin.nav.websites`, `admin.nav.groups.website`) · **Site** (`control.jobs.newSite`, `control.tenants.col.site`, `admin.config.description`, `siteDomain.activeDesc`) · **Instanz** (`dashboard.system.appwrite.description`) | Community · Tenant · Website · Site · Instance · Host | **Community** für den Kundenraum · **Website** nur für das Studio-Angebot · **Instanz** nur für ein Deployment. „Tenant"/„Mandant"/„Site" aus jeder Oberfläche entfernen. |
| **Produkte** (2 de) | **Produkte** (`admin.nav.products`, `onboarding.communityTabs.products`, `control.entitlements.*`) · **Funktionen** (`billing.compare.support.early`, `billing.pricing.freeProducts`) | Products · features | **Produkte** überall (E11 ist entschieden) — die zwei `billing.compare.*`-Reste angleichen |
| **Mensch** (5 de / 4 en) | **Personen** (`admin.nav.people`) · **Benutzer** (`admin.nav.users` *tot*, `admin.users.add.title`) · **Nutzer** (`billing.admin.col.user`) · **Mitglieder** (`admin.nav.members`, `members.title`) · **Person** (`posts.trustLevels.col.person`, `messages.block.title`) | People · Users · Members · User | **Mitglieder** in der Community-Ebene, **Personen** in der Instanz-Ebene, sonst nichts. „Benutzer"/„Nutzer" streichen |
| **Beitrag** (5 de) | **Feed** (`admin.nav.posts`, `posts.feed.title`) · **Feed-Beiträge** (`posts.moderation.title`) · **Beitrag** (`posts.moderation.col.post`) · **Meine Beiträge** (`admin.nav.myPosts`) · **Thema/Themen** (`posts.discussions.col.topic`, `posts.categories.col.topics`) · dazu `badges.name.nice-topic` rendert „Guter **Beitrag**" | Feed · Feed posts · Post · My posts · Topic | **Beitrag** für das Objekt, **Feed** nur für die öffentliche Ansicht, **Thema** nur wenn Discussions ein eigenes Objekt bekommen |
| **Geld** (5 de) | **Plan** (`onboarding.communityTabs.plan`) · **Abo &amp; Rechnung** (`onboarding.subscription.title`) · **Abo &amp; Zahlung** (`billing.account.title`) · **Abos** (`admin.nav.billing`) · **Preise** (`billing.pricing.title`, `control.prices.title`) · „Kein Abo – **Free Plan**" (`onboarding.subscription.noPlanLabel`) | Plan · Subscription · Subscription &amp; billing · Subscriptions · Pricing | **Abo** (Kunde) · **Abos** (Betreiber-Liste) · **Preise** (öffentlich). „Plan" nur als Wert (Basic/Personal/Pro), „Free Plan" streichen (F49) |
| **Einstellungen** (4 de) | **Einstellungen** (`dashboard.settings.title`, Gruppe `settings`) · **Community-Einstellungen** (`admin.nav.communitySettings`) · **Konfiguration** (`admin.nav.config`) · **Management** (Gruppe) · **Verwaltung** (`billing.compare.platform.title`) | Settings · Community settings · Configuration · Management | **Einstellungen** (Konto) · **Community-Einstellungen** · **Instanz-Einstellungen** (statt „Konfiguration" und statt „Community-Einstellungen" im Silo, s. G1) |
| **Gestaltung** (3 de / 3 en) | **Branding** (Gruppe + `themes.customize.navLabel`) · **Erscheinungsbild** (`branding.navLabel` *und* `themes.modeLabel`) · **Theme** (`themes.label`, `themes.customize.title` „Theme anpassen") | Branding · Appearance (×2) · Theme | Gruppe **Gestaltung** · Betreiber-Eintrag **Theme-Katalog** · Community-Reiter **Erscheinungsbild** · Konto-Menü **Hell &amp; dunkel** |
| **Moderation** (4 de) | **Melden/Meldung** (`moderation.report.*`) · **Missbrauchsmeldungen** (`admin.nav.abuseReports`) · **Gemeldete Nachrichten** (`messages.nav.reports`) · **… moderieren** (`admin.nav.eventsModeration`) · **Kommentare** (`admin.nav.comments`, ist die Moderations-Queue) | Report · Abuse reports · Reported messages · Moderate … | Muster „**X moderieren**" durchziehen: „Beiträge moderieren", „Kommentare moderieren", „Nachrichten moderieren" · „Missbrauchsmeldungen" bleibt (andere Sache: von außen, betrifft ganze Communities) |
| **Speicher** (3 de) | **Speicher** (Instanz-Buckets, `admin.nav.storage`) · **Speicher** (Community-Kontingent, `onboarding.communityTabs.storage`) · **Kontingent** (`onboarding.communityStorage.emptyTitle`, `media.admin.quotaTitle`) · **Limits** (`control.plans.title`) | Storage (×2) · Quota · Limits | Instanz: **Dateien** · Community: **Speicherplatz** · Grenze durchgehend **Kontingent** (nie „Limit") |
| **Domain** (4 de) | **Eigene Domain** (`onboarding.domain.navLabel` *und* `siteDomain.navLabel`) · **Domain** (`control.websites.col.domain`) · **Host** (`control.tenants.host`) · **Adresse** (`onboarding.done.addressLabel`, `pages.admin.col.address`, `error.unknownHost`) · **Slug** (`control.websites.fieldSlug`, `posts.categories.col.slug`) | Custom domain · **Own domain** · Domain · Address | **Eigene Domain** / **Custom domain** (EN vereinheitlichen) · **Adresse** für Slugs · „Host"/„Slug" nur in der Betreiber-Konsole |

**Deutsche Strings mit vermeidbaren Anglizismen im Menü:** „Tenants", „Board",
„Embed-Sites", „Feed", „Analytics", „Customer Feedback", „Studio", „Branding",
„GDPR-Exporte", „Activity-Feed", „Free Plan". Davon sind „Analytics" und
„Studio" etabliert genug, um zu bleiben; die übrigen neun nicht.

---

## 4. URL-Inventar

Legende: ✅ stimmig · ⚠️ Pfad/Name weichen ab · ❌ Wort zurückgezogen oder Falle

### Betreiber

| Pfad | Menüname | Bewertung |
|---|---|---|
| `/dashboard` | Übersicht | ✅ |
| `/dashboard/tenants` | **Tenants** | ❌ E8-Vokabel; → `/dashboard/communities` + 301 (G2) |
| `/dashboard/requests` | Anfragen | ✅ |
| `/dashboard/abuse` | Missbrauchsmeldungen | ✅ |
| `/dashboard/invites` | Einladungen | ✅ |
| `/dashboard/reserved-names` | Gesperrte Namen | ✅ |
| `/dashboard/websites` | Websites | ✅ — aber **kein 301** von `/dashboard/sites` (M13) |
| `/dashboard/feedback` · `/dashboard/roadmap` | Customer Feedback ▼ Feedback · Roadmap | ⚠️ zwei Geschwister-Seiten auf zwei Wurzelpfaden statt `/dashboard/feedback/roadmap` |
| `/dashboard/tickets` | **Board** | ⚠️ Pfad `tickets`, Name „Board", Titel „Ticket-Board" (M15) |
| `/dashboard/admin` | Admin (Hülle) | ⚠️ inhaltsleerer Name (M5) |
| `/dashboard/admin/changelog` · `/config` · `/products` · `/gdpr-exports` | Changelog · Konfiguration · Produkte · GDPR-Exporte | ✅ |
| `/dashboard/storage` · `/dashboard/system` | Speicher · System | ✅ |
| `/dashboard/users` · `/users/[id]` | **Personen** | ⚠️ Pfad `users`, Label „Personen", toter Key „Benutzer" (S1) |
| `/dashboard/billing` | Abos | ⚠️ nur im Konto-Menü erreichbar (`placement: 'userMenu'`) — kein Sidebar-Weg |
| `/dashboard/stripe` | Stripe | ✅ |
| `/docs` | Doku | ⚠️ einziger Nav-Eintrag ohne `/dashboard`-Präfix |

### Community — flach

| Pfad | Menüname | Bewertung |
|---|---|---|
| `/dashboard/pages` | Seiten | ✅ |
| `/dashboard/posts` | **Feed** | ❌ Pfad/Name/Titel dreifach uneinig (G3) |
| `/dashboard/my-posts` | Meine Beiträge | ⚠️ einziger Pfad in der 1. Person |
| `/dashboard/discussions` | **Kategorien** | ❌ (G4) |
| `/dashboard/discussion-leaders` | **Vertrauensstufen** | ❌ (G4) |
| `/dashboard/events` | Events | ✅ |
| `/dashboard/events-moderation` | Events moderieren | ✅ (Muster `X-moderation`) |
| `/dashboard/courses` · `/courses/[id]` | Kurse | ✅ |
| `/dashboard/media` | Medien | ✅ |
| `/dashboard/messages` | Nachrichten | ❌ kollidiert mit `/dashboard/community/messages` (G7) |
| `/dashboard/message-reports` | Gemeldete Nachrichten | ⚠️ Muster `X-reports` neben `X-moderation` — zwei Konventionen für dieselbe Sache |
| `/dashboard/comments` | Kommentare | ⚠️ ist die Moderations-Queue, heißt aber wie das Produkt |
| `/dashboard/embed` | Embed-Sites | ❌ Owner-Einstellung außerhalb des Hubs (G7); „Sites" zurückgezogen (S3) |

### Community — Hub

| Pfad | Reitername | Bewertung |
|---|---|---|
| `/dashboard/community` | Allgemein | ⚠️ Titel „Community", Überschrift „Community" (S2) |
| `…/branding` | Erscheinungsbild | ⚠️ Pfad `branding`, Label „Erscheinungsbild" (G6) |
| `…/members` | Mitglieder | ✅ |
| `…/domain` | Eigene Domain | ✅ (zwei Layer, ein Pfad — EN uneinig, M3) |
| `…/plan` | Plan | ⚠️ Seitentitel „Abo &amp; Rechnung" (M4). **Pfad ist Stripe-Rückkehrziel — nur mit Weiterleitung ändern** |
| `…/messages` | Private Nachrichten | ❌ (G7) |
| `…/activity` | Aktivität | ⚠️ Seitentitel „Activity-Feed" (M14) |
| `…/analytics` | Analytics | ✅ |
| `…/products` | Produkte | ⚠️ gleichnamig mit `/dashboard/admin/products` |
| `…/storage` | Speicher | ⚠️ gleichnamig mit `/dashboard/storage` |

### Gestaltung + Konto

| Pfad | Name | Bewertung |
|---|---|---|
| `/dashboard/themes` | **Branding** | ❌ Pfad `themes`, Label „Branding", Titel „Theme anpassen" (G6) |
| `/dashboard/themes/fonts` · `/new` · `/[id]` | Schriften · — | ✅ |
| `/dashboard/settings` | Allgemein | ⚠️ kein Titel (M6) |
| `/dashboard/settings/notifications` | Benachrichtigungen | ⚠️ kein Titel (M6) |
| `/dashboard/settings/sessions` | Sitzungen | ✅ |
| `/dashboard/settings/security` | Sicherheit | ⚠️ enthält den Datenexport (M10) |

**301-Bilanz:** 12 Alt-Pfade sind sauber umgeleitet (`onboarding/nuxt.config.ts:39-48`,
`domains:73-74`, `activity:44-45`, `analytics:55-56`, `messages:31-32`) — je
beide Locales. Genau **eine** Umbenennung hat keine: `sites` → `websites`.

---

## 5. Was aus `DASHBOARD-IA.md` offen ist

Der Plan nennt Schritt 3 (Menü-Umbau) erledigt und Schritt 4 („die neuen
Seiten") offen. Gemessen am Code:

### Betreiber-Ebene — vollständig gebaut, ein Wort fehlt

| Soll (`DASHBOARD-IA.md:42-54`) | Ist |
|---|---|
| Communities · Overview | ✅ `/dashboard/tenants` — **heißt aber „Tenants"** (G2) |
| Communities · Pläne und Limits | ⚠️ keine eigene Seite; steckt in `tenants.vue` (`control.plans.title` existiert) — im Plan selbst als bewusst weggelassen vermerkt (`:130`) |
| Early-Access-Anfragen · Einladungs-Codes | ✅ |
| Studio · Websites | ✅ |
| Nutzer · Dokumentation · Changelog · System-Infos | ✅ (Nutzer heißt „Personen") |

**Zugewachsen seit dem Plan:** Missbrauchsmeldungen, Gesperrte Namen, Stripe,
Board, Customer Feedback.

### Community-Ebene — 8 von 26 Zielen gebaut

| Soll (`:61-72`) | Ist |
|---|---|
| Website · Seiten | ✅ `/dashboard/pages` |
| Website · **Navigation** | ❌ existiert nicht — im Plan als eine der zwei ersten Prioritäten genannt (`:161`) |
| Branding · Themes / Schriften | ✅ — aber operator-only (F5-Schnitt), für die Community steht stattdessen „Erscheinungsbild" |
| Settings · Subscription · Plans | ✅ `/dashboard/community/plan` |
| Settings · Audience | ✅ auf dem Reiter „Allgemein" |
| Settings · Onboarding | ❌ |
| Settings · Activity logs | ✅ `/dashboard/community/activity` |
| Settings · Community · Moderation | ✅ verteilt (G5) |
| Settings · Community · Bulk logs | ❌ |
| Settings · Community · Community AI | ⚠️ nur betreiberseitig (`/dashboard/admin/config`) |
| Settings · Community · Embed | ✅ `/dashboard/embed` (außerhalb des Hubs, G7) |
| Settings · Community · Single sign-on | ❌ — im Plan bewusst zurückgestellt (`:116-118`) |
| Settings · Payments · Taxes / Payment logs | ❌ / ⚠️ nur betreiberseitig (`/dashboard/billing`) |
| Settings · Website · General | ✅ Reiter „Allgemein" |
| Settings · Website · **Custom domain** | ✅ **gebaut** (control-035/036) — der Plan hält sie noch für ein eigenes Projekt (`:109-114`); das ist der größte Nachtrag |
| Settings · Website · **SEO** | ❌ — zweite der beiden im Plan genannten Erst-Prioritäten |
| Settings · Website · Redirects / Defaults | ❌ |
| Settings · Website · Legal | ⚠️ über `pages.vue` |
| Settings · Marketing · Email settings | ❌ |
| Settings · Developers · Tokens | ❌ |

**Zugewachsen und nicht im Plan:** Mitglieder · Produkte · Speicher · Analytics ·
Private Nachrichten · Vertrauensstufen · Kategorien · Gemeldete Nachrichten ·
Events-Moderation.

### Konto-Ebene — 3 von 5 Gruppen

| Soll (`:79-85`) | Ist |
|---|---|
| Profil ansehen (About · Beiträge · Kommentare · Communities) | ❌ — es gibt keine öffentlichen Profile (bewusst, CLAUDE.md) |
| Profil bearbeiten (Bild, Name, Zeitzone, Sprache / Bio, Ort, Links) | ⚠️ Bild + Name + `@handle` (`settings/index.vue`); Zeitzone, Bio, Ort, Links fehlen |
| Benachrichtigungen | ✅ |
| Anmeldung (E-Mail &amp; Passwort · **Zwei-Faktor** · Sitzungen · **Verknüpfte Konten**) | ⚠️ aufgeteilt auf „Sicherheit" + „Sitzungen"; 2FA und verknüpfte Konten fehlen |
| Konto (Daten exportieren · Konto löschen) | ⚠️ beides unter „Sicherheit" statt in einer eigenen Gruppe (M10) |

### Governance-Befund zum Plan selbst

`DASHBOARD-IA.md` steht in `docs/plans/`, weil Schritt 4 offen ist. In
`docs/OPEN-ITEMS.md` — laut CLAUDE.md **die eine** Liste offener Punkte — steht
davon **nichts**: dort sind drei Punkte offen (F54, A1, A2), keiner betrifft die
Dashboard-IA. Damit lebt offene Arbeit ausschließlich in einem Plan-Dokument,
genau das, was die Regel „Offene Punkte gehören AUSSCHLIESSLICH in OPEN-ITEMS.md,
NIE in ein Plan-Dokument" verhindern soll. Die zwei im Plan als Erst-Prioritäten
markierten Seiten (**Navigation**, **SEO**) sind seit dem 2026-07-31 unsichtbar.

---

## 6. Die fünf Änderungen mit dem besten Verhältnis Wirkung/Aufwand

1. **Community umbenennbar machen (K1).** *Aufwand M.* Ein Feld, eine Route, eine
   Karte auf dem Reiter, der ohnehin „Allgemein" heißt. Behebt den einzigen
   unumkehrbaren Fehler, den ein zahlender Kunde machen kann — und der Name ist
   das Einzige aus dem Wizard, das er später überall wiedersieht.

2. **Ein Wörter-Paket: „Tenants" → „Communities", „Feed" → „Beiträge",
   `discussions`/`discussion-leaders` → `categories`/`trust-levels` (G2+G3+G4).**
   *Aufwand S.* Rund 20 i18n-Werte, zwei Routen-Umbenennungen, vier 301-Zeilen
   nach vorhandenem Muster. Räumt die drei Stellen ab, an denen Menü, Adresse
   und Seitentitel heute drei verschiedene Wörter sagen — und beendet die
   E8-Umbenennung, die auf dem letzten Bildschirm hängen geblieben ist.

3. **Kennzahlen-Registry für die Übersicht (K2).** *Aufwand M.* Dasselbe Muster
   wie `pukalani.admin.notices`, und die Zählung existiert schon
   (`registerCommunityUsageCounter`). Macht aus der Landeseite jedes Owners
   — heute eine Kommentar-Statistik aus der Silo-Vergangenheit — eine Auskunft
   über seine Community.

4. **Den Silo-Hub umbenennen, sobald `instanceTabs` an ist (G1).** *Aufwand S.*
   Eine `computed` im Layout, zwei i18n-Keys. Der Menüpunkt hört auf, „Community-
   Einstellungen" zu einer Instanz-Verwaltung zu sagen; die bewusst gewählte
   Struktur bleibt unangetastet.

5. **Nav-Gruppe `moderation` (G5).** *Aufwand S–M.* Vier Registry-Zeilen, zwei
   i18n-Keys, ein Eintrag in der Gruppen-Reihenfolge. Kein Pfad ändert sich.
   Gibt der einzigen Rolle, deren gesamte Arbeit heute über zwei fremde Gruppen
   verstreut liegt, ein Menü, das ihre Aufgabe benennt.
