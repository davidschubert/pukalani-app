# Kontingent-Zahlen im Katalog des Control Plane (KK1 c)

> **Plan-Status (2026-11-22):** teils gebaut — offen: Felder je Art in der Betreiber-Oberfläche und die Zahlen in den drei Plan-Zeilen der echten Datenbank ([OPEN-ITEMS](../OPEN-ITEMS.md) „KK1“).

Davids Antwort vom 2026-11-21: „Ja, in den Katalog". Gemeint sind die Zahlen
des Seiten-Kontingents (und damit jede Art außer den Kommentaren), die heute
nur in der Konfiguration der Platform-App stehen.

## Wie es heute ist

- **Zwei Quellen, je Art ausgewertet.** Die Bremse `assertPoolWriteQuota`
  (`packages/core/server/utils/tenantQuota.ts`) nimmt je Art zuerst die Zahl
  aus dem Katalog (`community_plans` im Control Plane, über den
  Host-Resolver an die Community gehängt) und, fehlt die Art dort, die Zahl
  aus `pukalani.tenancy.quota.plans` in `apps/platform/app/app.config.ts`.
- **Im Katalog stehen heute nur Kommentare.** Die Betreiber-Oberfläche
  (`packages/control/app/pages/dashboard/communities.vue`, Kasten
  „Plan-Grenzen") hat nur Felder für `comments`. Seiten (`pages`), Termine
  (`events`) und Mediathek (`media`) gelten aus der Konfiguration — mit
  derselben Zahl in allen Plänen für Seiten (BE-019).
- **Die Plan-Route überschrieb die ganze Zeile.** `PATCH
  /api/control/plans/:key` schrieb den Körper als neue Grenzen-Zeile. Stünde
  eine Art wie `pages` im Katalog, löschte das nächste Speichern der
  Kommentar-Grenzen sie still — danach galt wieder die Konfiguration.

## Was sich ändert

1. **Gebaut am 2026-11-22 (ohne Datenbank-Änderung):** die Plan-Route führt
   zusammen statt zu überschreiben (`mergeTenantPlanLimits` in
   `packages/control/shared/types/tenantRecord.ts`). Der Körper nennt nur die
   Arten, die sich ändern; `null` nimmt eine Art heraus (dann gilt wieder die
   Konfiguration). Gelesen, zusammengeführt und geschrieben wird unter der
   Sperre des Control Plane (`withControlLock`, Scope `plans`). Test:
   `packages/control/tests/planLimitsMerge.test.ts`. Für den heutigen
   Betrieb ändert sich nichts — die Oberfläche schickt weiter nur
   `comments`.
2. **Offen — Oberfläche:** im Kasten „Plan-Grenzen" je Plan eine Zeile je
   Art (`comments`, `pages`, `events`, `media`), je mit „pro Tag" und
   „insgesamt", dazu sichtbar, ob die Zahl aus dem Katalog oder aus der
   Konfiguration kommt („Vorgabe"), und ein Knopf „auf Vorgabe zurück"
   (schickt `null`). Die Vorgabe-Zahlen kennt die Betreiber-App nicht (sie
   stehen in der Platform-App); sie zeigt deshalb nur „aus der
   Konfiguration", ohne Zahl — oder die Zahlen ziehen in eine geteilte Datei
   (siehe Entscheidung 2). Rollen-Test der Route besteht schon
   (`route-roles-operator-tenants.test.ts`).
3. **Offen — die Zahlen in die echte Datenbank:** einmal je Plan die heutige
   Konfigurations-Zahl in die Zeile schreiben (basic, personal, pro), über
   die Oberfläche aus Schritt 2 oder ein Skript, das ohne `--apply` nur zeigt,
   was es schreiben würde.

## Braucht es eine Änderung an der Datenbank?

- **Am Schema: nein.** `community_plans.limits` ist schon ein JSON je Art
  (`{ [kind]: { perDay, total } }`); keine Spalte, keine Migration.
- **An den Daten: ja, in Schritt 3** — drei Zeilen im Control Plane auf
  Production. Das ist eine Klick-Pflicht (Davids Ja), wird nicht von selbst
  gemacht.

## Rückweg

- Schritt 1: ein `git revert` des Commits; die Route schriebe dann wieder die
  ganze Zeile. Daten ändert der Schritt nicht.
- Schritt 3: je Art „auf Vorgabe zurück" (`null`) — dann gilt sofort wieder
  die Konfiguration (Wirkung nach höchstens 90 s: Katalog-Cache 60 s,
  Host-Cache 30 s). Vor dem Schreiben die drei Zeilen lesen und den Stand
  notieren.

## Was David freigeben müsste

1. **Ob überhaupt.** Die Bewertung vom 2026-11-17 bleibt richtig: solange die
   Seiten-Zahl in allen Plänen gleich ist, bringt der Katalog nur die
   Möglichkeit, sie ohne Ausliefern zu ändern. Empfehlung: Schritt 2 und 3
   erst, wenn eine Zahl je Plan verschieden sein oder im Betrieb geändert
   werden soll.
2. **Wo die Vorgabe lebt** (für die Anzeige in Schritt 2): bleibt sie in der
   Platform-App (Anzeige ohne Zahl), oder zieht sie in eine geteilte Datei im
   control-Layer, die beide Apps lesen (eine Quelle, aber ein Umzug der
   Kommentare in `apps/platform/app/app.config.ts`).
3. **Die Zahlen** für Schritt 3 und das Ja zum Schreiben auf Production.
