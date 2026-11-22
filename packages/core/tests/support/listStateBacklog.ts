/**
 * REST-LISTE „Zustände einer Liste" (FE-004, Q14, 2026-11-21) — sie darf nur SCHRUMPFEN.
 *
 * Jede Datei mit Abrufen, deren Ergebnis den Fehler nicht liest (Zählung:
 * `fetchErrorScan.ts`), steht hier mit der Zahl dieser Abrufe. Solche Seiten
 * zeigen nach einem gescheiterten Abruf womöglich „leer" statt „Fehler".
 *
 * Umstellen heißt: `error` lesen und die Seite über `listState()` +
 * `CoreListState` (Liste) oder `CoreLoadError` (Einzelstück, Zusatz-Auskunft)
 * zeichnen — oder an der Stelle begründen, warum ein Fehler dort harmlos ist,
 * und den Abruf trotzdem `error` lesen lassen. Danach die Zahl senken oder die
 * Zeile löschen. Der Wächter `listStateBacklogGuard.test.ts` ist rot, wenn eine
 * Datei hinzukommt, eine Zahl steigt, eine genannte Datei fehlt oder eine Zahl
 * höher steht als gezählt (dann hier senken).
 *
 * Plan und Reihenfolge: docs/plans/offen/LZ1.md
 *
 * WARUM der Rest bleibt (Stand nach Schub 4, LZ1): Hinweis-Kästen und Zusatz-Auskünfte
 * (`*Notice.global`, Feedback-Knopf, Sitzungs-/2FA-/Benachrichtigungs-Karten,
 * Handle, Auswahl-Kategorien der Diskussionen, Vorschläge im Nachrichten-Fenster):
 * ein Ausfall blendet nur das Zusatzstück aus, es gibt keine Liste zu zeichnen;
 * Seiten, deren Abruf hinter eigenem Fehlerweg liegt (Hilfe/Docs, Brand-Wizard,
 * Kennzahl-Kacheln des Dashboards, Einladungs-Seiten) und Lade-Wege über Stores.
 * Sie brauchen je Seite eine eigene Entscheidung und stehen für Schub 5.
 */
export const LIST_STATE_BACKLOG: Readonly<Record<string, number>> = {
  'apps/help/app/app.vue': 2,
  'apps/help/app/pages/[...slug].vue': 2,
  'apps/help/app/pages/index.vue': 1,
  'apps/platform/app/pages/index.vue': 1,
  'apps/portfolio/app/components/SiteFooter.vue': 1,
  // Bewusst offen (LZ1 Schub A): der Abruf teilt den Schlüssel `chrome-nav-pages-<locale>` mit
  // `useCommunityNav` (core), dessen Handler den Fehler dokumentiert verschluckt (keine CMS-Seiten
  // = Normalfall). Ein Fehler-Zustand hier hätte nie etwas zu lesen und gehört in den Core-Handler.
  'packages/blueprint/app/components/DiscussionSidebarLinks.vue': 1,
  'packages/brand/app/components/BwDiscoverTeaser.vue': 1,
  'packages/brand/app/pages/brand-check/[id].vue': 1,
  'packages/brand/app/pages/brand-check/vergleich.vue': 1,
  'packages/brand/app/pages/brand/[profileId]/[stepKey].vue': 2,
  'packages/brand/app/pages/brand/[profileId]/design.vue': 1,
  'packages/brand/app/pages/brand/[profileId]/document.vue': 1,
  'packages/brand/app/pages/brand/[profileId]/foundation.vue': 2,
  'packages/brand/app/pages/brand/[profileId]/kit.vue': 3,
  'packages/brand/app/pages/dashboard/brands/[id]/score.vue': 3,
  'packages/brand/app/pages/dashboard/brands/index.vue': 2,
  'packages/brand/app/pages/invite.vue': 1,
  // Bleibt bewusst: die Prüfung der Einbetter-Adresse ist „best effort" und fällt bei einem
  // Ausfall AUF (die harte Grenze ist die CSP, nicht diese Abfrage). Eine Meldung im iframe
  // auf fremden Seiten würde die Kommentare wegen einer Zusatzprüfung verdecken.
  'packages/comments/app/pages/embed.vue': 1,
  'packages/insights/app/pages/dashboard/insights/[id].vue': 1,
  'packages/insights/app/pages/dashboard/insights/radar.vue': 1,
  'packages/market/app/pages/brand/[profileId]/market.vue': 3,
  // Bleibt: der Feed zeigt den Fehler der ersten Seite schon (`loadFailed` + CoreLoadError);
  // der Zähler sieht den Abruf nur nicht, weil er in einem Ausdruck mit `? await` steht.
  'packages/posts/app/components/PostFeed.vue': 1,
}
