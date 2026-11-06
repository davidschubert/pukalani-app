# Website-Navigation mit Unterpunkten (U15 Teil 3) — Konzept

Stand 2026-09-08 · Phase Konzeption → Prototyp (Davids Workflow, docs/referenz/WORKFLOW.md).
Entscheidungen: DECISION-LOG 2026-09-08 „Navigation anpassen". Wird nach dem Bau
nach `docs/archiv/` verschoben; Offenes wandert nach OPEN-ITEMS.md.

## 1. Befund (warum der Editor auf branding.supply leer war)

- Der Editor (`packages/pages/app/pages/dashboard/community/navigation.vue`) bietet
  genau zwei Quellen an: die Registry `pukalani.chrome.nav` und die veröffentlichten
  CMS-Seiten ohne Startseite und Rechtsseiten. Auf branding.supply sind beide leer:
  der brand-Layer registriert nichts, und die einzigen CMS-Seiten sind Impressum,
  Datenschutz, AGB (bewusst im Fuß).
- Der EINZIGE Leser der gespeicherten Wahl ist das blueprint-Layout. branding.supply
  rendert seinen Kopf in `packages/brand/app/components/BwSiteNav.vue` mit einer festen
  Liste — der Reiter war dort ein Schalter ohne Draht.
- Im Silo antwortet `PATCH /api/pages/navigation` 404 („ohne Mandanten-Kontext keine
  Community") — auch auf comments.pukalani.app konnte man nie speichern.
- Der Vertrag `core/shared/communityNavigation.ts` kennt nur eine Ebene.
- Die CMS-Kandidaten-Rechnung existiert DREIMAL (blueprint-Layout, Editor, und
  künftig BwSiteNav) — genau die Drift, die U15 mit `filterChromeNavEntries` schon
  einmal beseitigt hat.

## 2. Ziel

Ein Owner (Pool) bzw. der Betreiber (Silo) stellt das öffentliche Menü zusammen:
ausblenden · umordnen · umbenennen · eigene Links (wie bisher) **plus**
Hauptpunkte mit Unterpunkten (EINE Ebene). Dieselbe Regel, derselbe Editor und
dasselbe Verhalten auf Pool-Hosts (blueprint) und auf branding.supply (BwSiteNav) —
PRODUKT-BILANZ: Pool und Silo zeigen identisches Produktverhalten.

## 3. Vertrag (core/shared/communityNavigation.ts) — NUR ADDITIV

```ts
interface CommunityNavOverrideEntry {
  id: string            // Registry-Id | page-<slug> | link-<n> | NEU group-<n>
  hidden?: boolean
  label?: string
  to?: string           // nur link-
  external?: boolean    // nur link-
  parent?: string       // NEU: Id des Hauptpunkts (eine Ebene)
}
```

- **Neue Id-Art `group-<n>`** (`GROUP_NAV_PREFIX = 'group-'`, `isGroupNavId`): ein
  Hauptpunkt OHNE eigenes Ziel, nur zum Aufklappen. `label` Pflicht, kein `to`, kein
  `external`. Vergabe wie `link-<n>` über das Maximum (`nextCustomNavLinkId` wird zu
  einer Funktion mit Präfix-Argument; der alte Name bleibt als Wrapper).
- **`parent`** darf auf JEDE Id zeigen, die im selben Dokument als Hauptpunkt steht
  (Registry, Seite, eigener Link, Gruppe). Eine Ebene: ein Eintrag mit `parent` kann
  selbst kein `parent` sein.
- **`CommunityNavItem`** bekommt `children?: CommunityNavItem[]`; `to` bleibt `string`
  und ist `''` GENAU bei Gruppen (dokumentiert). Neue pure Helfer:
  - `navItemHasTarget(item)` (`to !== ''`).
  - `navMenuChildren(item)`: die Einträge, die ein Renderer im Aufklapper zeigt — hat
    der Hauptpunkt ein eigenes Ziel UND Kinder, steht er SELBST als erster Eintrag
    (eigener Text, eigenes Ziel), dann seine Kinder. So bleibt sein Ziel erreichbar,
    ohne dass zwei Renderer das je anders lösen.
- **CMS-Helfer ziehen nach core**: `PublicPageNavItem`, `cmsPageNavId`,
  `CMS_PAGE_NAV_ORDER`, `LEGAL_PAGE_SLUGS`, `isLegalPageSlug` wandern in
  `core/shared/communityNavigation.ts`; `packages/pages/shared/types/page.ts`
  RE-EXPORTIERT sie (bestehende Importe bleiben gültig). Grund: der brand-Layer darf
  den pages-Layer nicht importieren (A14), und die Rechnung soll EINMAL existieren.

## 4. Die Regel `resolveCommunityNav` — vier neue Zusagen (5–8)

Die vier alten Zusagen (candidates autoritativ · unbekannte Ids still ignoriert ·
Unerwähntes hängt hinten an · ohne Wahl ändert sich nichts) gelten unverändert.

5. **Ein Kind folgt seinem Hauptpunkt.** Ein Eintrag mit `parent` erscheint als Kind
   des Hauptpunkts, wenn dieser als SICHTBARER HAUPTPUNKT gerendert wird —
   Kinder-Reihenfolge = Array-Reihenfolge unter Geschwistern, unabhängig davon, wo
   das Kind im Array steht.
6. **Nichts verschwindet durch einen fehlenden Hauptpunkt (fail-soft).** Ist der
   Hauptpunkt ausgeblendet, unbekannt, selbst ein Kind oder gar nicht im Dokument,
   erscheint das Kind an seiner eigenen Array-Position als HAUPTPUNKT (mit seinem
   eigenen `hidden`). Eine Wand ist schlimmer als ein Eintrag zu viel.
7. **Eine Gruppe ohne sichtbare Kinder wird NICHT gerendert.** Ein Aufklapper ohne
   Inhalt ist ein toter Klick. (Ein Hauptpunkt MIT Ziel ohne Kinder bleibt ein
   gewöhnlicher Link.)
8. **Der Überlauf zählt nur Hauptpunkte** („Mehr"-Menü ab dem sechsten Hauptpunkt;
   Kinder zählen nicht).

9. **Der Bauplan darf Gruppen VORGEBEN** (Nachtrag, Davids Korrektur am Prototyp vom
   2026-09-08: „das Standard-Menü lautet Products ▾ (Brand Score) · Discover Brands ·
   About · Team"). Bis dahin entstanden Unterpunkte AUSSCHLIESSLICH über die
   gespeicherte Owner-Wahl — eine frische Instanz sah also anders aus als die
   beworbene. Deshalb trägt jetzt auch die Registry ein optionales `parent`
   (`PukalaniChromeNavEntry.parent` ⇒ `CommunityNavCandidate.parent`, `to: ''` = ein
   Aufklapper ohne eigene Seite):
   - **ohne** gespeicherte Wahl gilt die Hierarchie der KANDIDATEN (danach wie gehabt
     `nestCommunityNav`) — für einen Layer ohne Vorgaben bleibt Zusage 4 wörtlich wahr;
   - **mit** gespeicherter Wahl ist das Dokument für GENANNTE Einträge die ganze
     Wahrheit (`parent` aus dem Override-Eintrag; fehlt es, ist der Eintrag ein
     Hauptpunkt — der Editor schreibt immer das ganze Dokument, ein fehlendes `parent`
     ist dort eine Entscheidung und kein Schweigen);
   - **Nachzügler** (Zusage 3) bringen ihren Bauplan-Platz mit. Die Anhänge-Regel ist
     darum asymmetrisch: ein GENANNTES Kind hängt nur an einen GENANNTEN Hauptpunkt
     (sonst spränge es ans Listenende), ein NACHZÜGLER-Kind an jeden gerenderten.
   - Die Gates (`productKey`/`requiresAuth`/`planProduct`) gelten für den
     Gruppen-Eintrag selbst; fällt die Gruppe weg, rücken die Kinder nach Zusage 6
     auf die oberste Ebene, und eine Gruppe ohne sichtbare Kinder verschwindet nach
     Zusage 7.
   - Editor: `buildRows()` gibt einem unerwähnten Kandidaten `parent:
     candidate.parent ?? null` (ungültige Elternschaft löst `normalize()` auf).

`parseCommunityNavOverride` übernimmt `parent` (string) und Gruppen-Einträge in
derselben defensiven Form wie eigene Links. Unit-Tests in
`packages/core/tests/communityNavigation.test.ts` — je Zusage mindestens eine
GEGENPROBE (Muster der bestehenden Datei).

## 5. Ablage im Silo: `instance`

Neue pure Funktion `communityNavRowId(tenant)` (core shared, unit-getestet):
- Pool-Mandant ⇒ `communityId` (wie heute).
- `tenant === null` (Single-Tenant/Silo: branding, portfolio, comments, photos) ⇒
  `'instance'` — kollisionsfrei, weil Community-Zeilen nur im Pool-Projekt liegen
  und `unique()`-Ids 20 Hex-Zeichen sind. (Erst `_instance` nach dem Muster
  `_account` geplant — das ist dort ein Spalten-WERT; als Row-Id lehnt Appwrite
  einen führenden Unterstrich ab, Klickbeweis 2026-09-08: Speichern 500.)
- Kontroll-Host der Pool-App (kein Mandant, aber Tenancy an) ⇒ `null` — dort gibt es
  keine Community, deren Menü jemand wählen dürfte; GET liefert leer, PATCH 404 (wie
  heute). Wie der Kontroll-Host im `event.context.tenant` aussieht, steht in
  `packages/core/server/middleware/00.tenant.ts` — dort nachlesen, nicht raten.

`navigation.get.ts` und `navigation.patch.ts` nutzen diese Funktion statt
`useTenant(event)?.communityId`; `communityNavigationStore.ts` bekommt die rowId
gereicht (Signatur bleibt: zweiter Parameter ist die rowId). Die Reiter
„Sucheintrag" und „Weiterleitungen" haben dieselbe Silo-404 — NICHT in diesem Paket
(OPEN-ITEMS-Eintrag).

## 6. Schema (`packages/pages/schemas/navigation.ts`)

- `parent`: optional, `navIdRe`.
- Gruppen (`group-`): `label` Pflicht; `to`/`external` verboten (eigene Meldung
  `pages.navigation.validation.groupNoTarget`).
- Dokument-Prüfung: `parent` muss auf eine Id IM DOKUMENT zeigen, die selbst kein
  `parent` trägt und nicht die eigene Id ist (`pages.navigation.validation.parentInvalid`).
- Grenzen unverändert (40 Einträge, 8192 Zeichen).

## 7. EINE Kandidaten-Rechnung: `useCommunityNav()` (core/app/composables)

Liefert `{ candidates, override, items, pages }` und ersetzt die dreifache Rechnung:
- Registry über `filterChromeNavEntries` mit den Gates `isLoggedIn`, `productOn`
  (`useRuntimeFlags` + `isProductStateEnabled`), `planAllows` (`useTenantPlan`).
- CMS-Seiten NUR, wenn `pukalani.chrome.pagesNav === true` (der pages-Layer
  registriert das Flag — das ist der explizite Vertrag, kein String-Coupling);
  Abruf `/api/pages/public` per `useRequestFetch` + `useAsyncData` (Schlüssel
  `chrome-nav-pages-<locale>`), gefiltert ohne `home` und ohne Rechtsseiten.
- Gespeicherte Wahl NUR, wenn `pukalani.chrome.navOverride === true`
  (Schlüssel `chrome-nav-override`).
- `items = resolveCommunityNav(candidates, override)`; Pfade über `localePath()`.
- Konsumenten: blueprint-Layout (Kopf), BwSiteNav (brand), der Editor (nur
  `candidates` + `override`, mit `rawPath`-Kandidaten ohne Locale-Präfix für die
  Anzeige — der Editor zeigt Pfade, das Layout rendert Links; der Kandidat trägt
  deshalb beides: `to` (lokalisiert) und `path` (roh)).
- `useRequestFetch` ist Pflicht (SSR-Host im Pool; Wächter
  `packages/core/tests/ssrTenantFetch.test.ts` — dort nachsehen, ob er das
  Composable erfassen muss).

## 8. Renderer

- **blueprint `layouts/default.vue`**: Hauptpunkt mit Kindern ⇒ `UDropdownMenu`
  (dasselbe Muster wie das „Mehr"-Menü), Auslöser = `UButton` mit Text + Caret,
  Einträge = `navMenuChildren(item)`; externe Kinder mit `target: '_blank'`,
  `rel: 'noopener'`. `data-testid="chrome-nav"` und `chrome-nav-more` bleiben, neuer
  Haken `data-nav-group="<id>"` am Auslöser. MAX_INLINE zählt Hauptpunkte.
- **brand `BwSiteNav.vue`**: `menuItems` kommt aus `useCommunityNav().items`;
  Kinder ⇒ `children` von `UNavigationMenu` (Text + Ziel), gilt für die horizontale
  Reihe UND das mobile `#body`-Menü. Ob ein Hauptpunkt MIT `to` und `children` in
  Nuxt UI 4.10 noch als Link klickbar ist, in `node_modules/@nuxt/ui` NACHLESEN
  (`NavigationMenu.vue`); wenn nicht, steht sein Ziel ohnehin über
  `navMenuChildren` als erstes Kind. Die feste Liste (Discover · About · Team)
  verschwindet aus der Komponente.
- **brand `app.config.ts`** registriert `pukalani.chrome.nav` — seit Davids Korrektur
  vom 2026-09-08 MIT Gruppe (Zusage 9):
  `products` (`to: ''`, `brand.nav.products`, order 10) als Aufklapper ohne eigene
  Seite, darunter `brand-score` (`/brand-check`, `brand.nav.brandScore`,
  `parent: 'products'`, order 11), dann `discover` (`/discover`, order 20),
  `about` (`/about`, order 30), `team` (`/team`, order 40). Die Eigennamen-Regel
  („englisch in beiden Sprachen") bleibt in den i18n-Dateien — `brand.nav.brandScore`
  steht in de UND en als „Brand Score". Kein `productKey` (der Layer hat kein
  Laufzeit-Produkt-Gate für diese Seiten). Eine Produkt-Übersichtsseite gibt es
  BEWUSST nicht: `to: ''` statt eines Menüpunkts in einen 404.
- `pukalani.chrome.pagesNav`/`navOverride` setzt weiterhin NUR der pages-Layer.

## 9. Editor (`navigation.vue`)

- Zeilen tragen `parent: string | null`. Anzeige GRUPPIERT: jeder Hauptpunkt, direkt
  darunter seine Kinder (eingerückt, Icon `i-ph-arrow-elbow-down-right`). Nach jeder
  Änderung `normalize()`: Hauptpunkte in Reihenfolge, Kinder direkt hinter ihrem
  Hauptpunkt in Geschwister-Reihenfolge — so wird auch gespeichert.
- Je Zeile zusätzlich: **Einrücken** (wird Kind des NÄCHSTEN Hauptpunkts darüber;
  deaktiviert, wenn kein Hauptpunkt darüber steht oder die Zeile selbst Kinder hat)
  und **Ausrücken** (nur bei Kindern; die Zeile wird Hauptpunkt direkt hinter der
  Gruppe ihres bisherigen Hauptpunkts).
- Ziehen: **die Ebene folgt dem Nachbarn** — wer auf eine Zeile fällt, übernimmt deren
  `parent`; ein Hauptpunkt nimmt seine Kinder mit (sie hängen an der Id, nicht an
  der Position). Eine Zeile mit Kindern kann nicht auf ein Kind fallen (bleibt an
  Ort und Stelle).
- Hinweise unter der Zeile (dieselbe Stelle wie „gerade nicht verfügbar"):
  Kind eines ausgeblendeten Hauptpunkts ⇒ „steht als Hauptpunkt, weil „X"
  ausgeblendet ist"; Gruppe ohne sichtbare Kinder ⇒ „erscheint erst mit einem
  Unterpunkt".
- „Link hinzufügen" bekommt eine dritte Art: **Hauptpunkt ohne eigene Seite**
  (nur Text). Gruppen sind wie eigene Links entfernbar.
- Vorschau: Hauptpunkte in einer Reihe, Kinder in Klammern dahinter
  (`Products ▾ Discover · About`), gerechnet mit `resolveCommunityNav`.
- Neue i18n-Schlüssel (de+en, KEINE spitzen Klammern): `indent`, `outdent`,
  `childOf` (`{label}`), `orphanHint` (`{label}`), `groupEmptyHint`,
  `link.kindGroup`, `groupHint`, `validation.groupNoTarget`,
  `validation.parentInvalid`; `preview.description` sagt „Hauptpunkt" statt
  „Eintrag".

## 10. Beweise

- Unit: core (Regel + `communityNavRowId` + `navMenuChildren`), pages (Schema —
  `packages/pages/tests/` neu anlegen nach dem Muster von `packages/brand/tests`,
  `vitest run` steht schon im package.json).
- `packages/pages/scripts/verify-community-navigation.mjs` bekommt einen Abschnitt
  „Unterpunkte": Gruppe + zwei Kinder speichern ⇒ SSR-HTML zeigt den Auslöser
  (`data-nav-group`) und NICHT die Kinder als Hauptpunkte; Gegenprobe: Hauptpunkt
  ausblenden ⇒ Kinder stehen als Hauptpunkte; Gegenprobe: Gruppe ohne Kinder
  erscheint nicht; Schema-Gegenproben (parent auf ein Kind ⇒ 400, Gruppe mit `to`
  ⇒ 400).
- Silo-Klickbeweis auf branding (lokaler Dev-Server, Port 3010): Gruppe anlegen,
  einrücken, speichern, neu laden, Aufklapper im Kopf — Screenshots sind der
  Prototyp für Davids Freigabe.
- Vier Checks vor dem Merge (Test/Lint/Typecheck/E2E); `check:i18n-keys`.

## 11. Nicht-Ziele (bewusst)

Mehr als eine Ebene · Icons/Beschreibungen je Kind · Texte je Sprache (siehe
Vertrag: EIN Text für beide Sprachen) · Live-Propagation des Menüs (Server liest,
30-s-Cache bleibt) · die Silo-404 von Sucheintrag/Weiterleitungen (OPEN-ITEMS).
