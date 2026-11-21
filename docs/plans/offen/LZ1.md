# LZ1 — Einzelheiten

> Einzelheiten zum offenen Punkt **LZ1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**LZ1 — Listen-Zustände: der Rest nach Q14 (2026-11-21).**
Seit Q14 gibt es im Core einen Weg für die vier Zustände einer Liste
(lädt, Fehler mit „Noch einmal versuchen", leer mit nächstem Schritt, Daten):
`listState()` (`packages/core/app/utils/listState.ts`) und `CoreListState`,
für ein Einzelstück oder eine Zusatz-Auskunft `CoreLoadError`. Umgestellt
sind die Seiten mit Geld und Mitgliedern (Erledigt-Liste, „Q14").

**Die Rest-Liste ist eine Datei, kein Text:**
`packages/core/tests/support/listStateBacklog.ts` nennt jede Seite und jeden
Baustein, dessen Abruf den Fehler nicht liest, mit der Zahl solcher Abrufe.
Der Wächter `packages/core/tests/listStateBacklogGuard.test.ts` ist rot, wenn
eine Datei dazukommt, eine Zahl steigt, oder ein Eintrag nicht mehr stimmt
(Datei weg, weniger Abrufe offen) — die Liste schrumpft also mit jeder
Umstellung, von Hand im selben Commit.

**Stand am 2026-11-21:** 110 Dateien mit 136 Abrufen. Nach Layer (Dateien):
brand 17, onboarding 14, posts 11, admin 10, insights 10, control 6,
blueprint 4, comments 4, core 4, courses 4, messages 4, events 3, feedback 3,
pages 3, apps/help 3, apps/control 2, je 1 in analytics, billing, market,
media, themes, apps/comments, apps/platform, apps/portfolio.

**Reihenfolge (Vorschlag):**

- **(a) Dashboard-Datenlisten** mit `UTable` (Betreiber- und Owner-Seiten in
  admin, control, posts, messages, events, courses, pages): dort heißt ein
  Fehler heute „keine Einträge". Am Muster der Mitglieder-Seite umstellen.
- **(b) Community-Listen** (Feed, Kurse, Kommentare, Termine): das Erste, was
  eine neue Community sieht — zugleich die leeren Zustände nach UI-004 auf
  `CoreEmptyState` (eine Zeile in einem Kasten ist kein leerer Zustand).
- **(c) brand und insights** (branding.supply): eigenes Muster der leeren
  Zustände; entscheiden, ob es als Ausnahme gilt, und das an einer Stelle
  aufschreiben.
- **(d) Zusatz-Abrufe** (Zähler, Kontingente, Hinweise wie das
  Einladungs-Kontingent der Mitglieder-Seite): oft harmlos — dann den Grund
  an die Stelle schreiben und `error` trotzdem lesen, damit der Eintrag
  fällt.
- **(e) Sackgassen aus UX-012:** Nachrichten beim Owner (Satz mit Link zur
  Einstellung, „Neue Nachricht" ausblenden), Dashboard für einfache
  Mitglieder, der Willkommens-Satz einer neuen Community nur für den Owner.
- **(f) Lade-Zeichen (UI-008):** die handgesetzten `i-ph-spinner` auf
  `CoreLoadingState` umstellen.
- **(g) Handgebaute Listen ohne Grund (UI-009):** Statistik
  (`analytics.vue`), Preiskatalog der Stripe-Seite, Vergleichstabelle im
  Brand Score, Plan-Vergleich in `billing` — `UTable` oder ein Satz mit „B6".

**Fertig heißt:** die Datei `listStateBacklog.ts` ist leer (dann den Wächter
auf „keine Ausnahme" umstellen), (e) bis (g) erledigt.
