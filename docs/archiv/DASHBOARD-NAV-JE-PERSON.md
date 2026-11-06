# Dashboard-Navigation je Person (NAV1 Paket 3)

**Stand:** AUSGEFÜHRT — Konzept, Prototyp und Freigabe „wie gebaut" (E1–E3 nach Empfehlung) am 2026-09-08; Unit 57/57, Klick-Beweis 18/18 lokal. Erledigt-Eintrag mit Gelernt: OPEN-ITEMS-COMPLETE.md. Ursprünglich: Konzept 2026-09-08 · Entscheidung 3 aus DECISION-LOG „Navigation anpassen"
(2026-09-08): die Reihenfolge der Dashboard-Navigation ist die Wahl JEDER PERSON, gespeichert
in den Prefs des Kontos, gültig auf jeder Site desselben Konten-Stamms — nicht je Community,
weil die Nav rollen-gefiltert ist und eine Owner-Reihenfolge für einen Moderator nicht aufginge.

## 1. Was heute gilt

- `packages/admin/app/layouts/dashboard.vue` rendert `links`: „Übersicht", dann Module ohne
  Gruppe, dann neun Gruppen in FESTER Reihenfolge (platform · studio · management · account ·
  website · products · moderation · branding · settings), innerhalb nach `order` der Registry
  `pukalani.admin.modules`. Die Filter (Ort × Rolle × drei Produkt-Gates) sind pur in
  `packages/core/shared/dashboardNav.ts`. Es gibt keine Laufzeit-Überschreibung.
- `bottomLinks` (Website-/Community-Einstellungen, Nutzer, Admin, Speicher, System, Startseite)
  ist der Unterbau des Betreibers — davon spricht dieses Paket NICHT.
- Prefs-Muster: `packages/core/server/api/auth/timezone.put.ts` — Session-Client,
  `account.updatePrefs` MIT Merge, keine Tabelle; der Client zieht danach `auth.refresh()`.
- Vorbild der Bedienung: der Editor der Site-Navigation
  (`packages/pages/app/pages/dashboard/community/navigation.vue`): Zeilen mit Griff, Ziehen,
  Pfeile hoch/runter, Auge zum Ausblenden, „Zurücksetzen".
- Nebenbefund: `PukalaniAdminModule.group` (core/shared/types/admin-module.ts) kennt nur sieben
  Gruppen, das Layout rendert neun (`account`, `moderation` fehlen im Typ). Die Registry wird
  nicht gegen den Typ geprüft, deshalb fiel es nie auf — dieses Paket zieht die Gruppen-Liste an
  EINE Stelle.

## 2. Verträge

### 2.1 Datenmodell — `prefs.dashboardNav` (Konto-Prefs, kein Table)

```ts
/** core/shared/dashboardNav.ts — nur additiv erweiterbar, kein version-Feld. */
export interface DashboardNavPrefs {
  /** Reihenfolge der GRUPPEN (Gruppen-Ids). Nicht Erwähntes hängt hinten an, in Standardreihenfolge. */
  groups?: string[]
  /** Reihenfolge der EINTRÄGE (Modul-Ids) — gilt innerhalb ihrer Gruppe. Nicht Erwähntes hängt hinten an, nach `order`. */
  items?: string[]
  /** Ausgeblendete Modul-Ids. Ausblenden ist kein Löschen: der Eintrag bleibt in der ⌘K-Suche erreichbar. */
  hidden?: string[]
}
```

- EINE Liste `items` für alle Gruppen: die Reihenfolge innerhalb einer Gruppe ist die
  Reihenfolge ihrer Mitglieder in dieser Liste. Ein Eintrag kann die Gruppe NICHT wechseln
  (Gruppen sind Ebenen: Betreiber/Konto/Community — kein Sortierspielraum).
- Grenzen (Schema UND Regel lesen dieselben Zahlen): je Liste ≤ 100 Ids, Id ≤ 64 Zeichen,
  Muster `^[a-z0-9-]+$`. Prefs sind ein JSON-Dokument am Konto; ein Menü mit ~30 Ids liegt
  weit unter jeder Appwrite-Grenze.
- „Übersicht" (hart verdrahtet, oberster Eintrag) und der Unterbau bleiben fest — beides sind
  keine Registry-Module.

### 2.2 Die pure Regel — `applyDashboardNavPrefs` (core/shared/dashboardNav.ts)

Angewendet NACH `filterDashboardModules` (Ort × Rolle × Produkt-Gates). Die Nav bleibt UX,
Autorität sind die Routen — die Prefs können nichts sichtbar machen, was der Filter wegnimmt.

Zusagen (unit-getestet):
1. Ohne Prefs (fehlend/leer) ist das Ergebnis exakt die heutige Nav — Gruppen in
   Standardreihenfolge (`DASHBOARD_NAV_GROUPS`), Einträge nach `order`.
2. Unbekannte Ids (Gruppe wie Eintrag) werden still ignoriert — ein Layer, der verschwunden ist,
   bricht nichts.
3. Nicht Erwähntes hängt hinten an: Gruppen in Standardreihenfolge, Einträge nach `order`.
4. Eine Gruppe ohne sichtbare Einträge erscheint nicht (wie heute).
5. Ausgeblendete Ids fehlen in der Seitenleiste, NICHT in der ⌘K-Suche (die Suche liest die
   ungefilterte Liste). Ein Eintrag mit Unterpunkten wird als Ganzes ausgeblendet; Unterpunkte
   einzeln sind bewusst NICHT Teil dieses Pakets.
6. Module ohne Gruppe bleiben vor den Gruppen, ihre Reihenfolge folgt ebenfalls `items`.

### 2.3 API — `PUT /api/auth/dashboard-nav` (core, wie timezone)

- Body: `DashboardNavPrefs` (Zod, Grenzen aus 2.1); `null` ODER ein leeres Dokument `{}` =
  Zurücksetzen (Schlüssel wird aus den Prefs ENTFERNT, nie `{}` gespeichert). Der Editor schickt
  `{}`, weil ofetch einen `null`-Body weglässt; ein fehlender Body bleibt 400.
- 401 ohne Session; 400 bei Verstoß; Antwort `{ ok: true, dashboardNav }`.
- Merge über `...event.context.user.prefs` — `updatePrefs` ersetzt sonst bio/avatar & Co.
- `/api/auth/` steht in `controlApiPrefixes`, die Route antwortet also auch auf Kontroll-Hosts.
- Ids werden serverseitig NICHT gegen die Registry geprüft: der Server kennt die effektive
  Registry der App nicht je Ort, und Zusage 2 macht unbekannte Ids harmlos.

### 2.4 Bedienung — Konto-Reiter „Navigation" (`/dashboard/settings/navigation`, admin-Layer)

- Sechster Reiter in `ACCOUNT_SETTINGS_TABS` (damit findet ihn auch die ⌘K-Suche).
- Zeigt genau die Gruppen und Einträge, die DIESE Person auf DIESER Site sieht (dieselbe
  gefilterte Liste wie die Seitenleiste; eine Karte je Gruppe). Was auf einer anderen Site
  dazukommt, hängt dort hinten an (Zusage 3) und kann dort sortiert werden.
- Je Gruppe: Griff/Ziehen + Pfeile für die Einträge, Auge zum Ausblenden; Gruppen-Karten
  selbst per Pfeile verschiebbar. Kopf: „Speichern"; Fuß: „Zurücksetzen".
- Nach dem Speichern `auth.refresh()` — die Seitenleiste zieht sofort mit.
- Warum eine Konto-Seite statt eines „Anpassen"-Modus in der Seitenleiste: die Leiste ist
  einklappbar, auf Mobil ein Slideover und trägt Tooltips/Popover — ein Bearbeitungsmodus dort
  müsste drei Darstellungen beherrschen. Die Konto-Seite ist EINE Fläche, und sie ist das
  Muster, das die Site-Navigation schon hat.

## 3. Entscheidungen (David, am Prototyp 2026-09-08: alle drei nach Empfehlung)

| # | Frage | Empfehlung |
|---|---|---|
| E1 | Reihenfolge: nur Gruppen, nur Einträge oder beides? | **Beides** — die Regel kostet dasselbe, und wer „Moderation" oben will, braucht beides. |
| E2 | Ausblenden ja/nein? | **Ja**, mit Suche als Rückweg (Zusage 5) und „Zurücksetzen". |
| E3 | Ort der Bedienung: Konto-Reiter oder Seitenleiste? | **Konto-Reiter „Navigation"** (2.4). |

## 4. Beweise

- Unit: `packages/core/tests/dashboardNav.test.ts` — alle sechs Zusagen, je mit Gegenprobe.
- Klick lokal (branding, Port 3010, Dev-Projekt `portfolio-g4ml`): Reiter öffnen, „Brand-Check"
  ausblenden, Gruppe verschieben, speichern ⇒ Seitenleiste zeigt die Wahl ohne Reload; ⌘K
  findet den ausgeblendeten Eintrag weiter; „Zurücksetzen" stellt den Stand von heute her.
- Live nach dem Deploy: derselbe Klick auf branding.supply.
- Gates vor dem Merge: `pnpm -r test`, `pnpm -r lint`, `pnpm lint:scripts`, `pnpm -r typecheck`,
  `pnpm check:i18n-keys`, `pnpm check:single-copy`, `pnpm check:bilanz`, `pnpm check:manifests`.

## 5. Bewusst nicht

- Kein Umbenennen (die Nav ist übersetzt; ein eigener Text je Person wäre eine zweite Sprache).
- Keine Reihenfolge je Community (Entscheidung 3), kein Verschieben zwischen Gruppen.
- Kein Anfassen des Unterbaus (`bottomLinks`) und der „Übersicht".
