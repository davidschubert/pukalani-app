/**
 * AUSNAHME-LISTE „Zustände einer Liste" (FE-004, Q14, LZ1) — sie darf nur SCHRUMPFEN.
 *
 * Jede Datei mit Abrufen, deren Ergebnis den Fehler nicht liest (Zählung:
 * `fetchErrorScan.ts`), steht hier mit der Zahl dieser Abrufe. Solche Seiten
 * zeigen nach einem gescheiterten Abruf womöglich „leer" statt „Fehler".
 *
 * STAND (LZ1 abgeschlossen am 2026-11-22, Bahn 12): NUR NOCH EINE AUSNAHME,
 * mit im Browser bestätigtem Grund (s. Eintrag). Alles andere liest seinen
 * Fehler — über `listState()` + `CoreListState` (Liste), `CoreLoadError`
 * (Einzelstück) oder `CoreInlineLoadError` bei `isFetchOutage(error)`
 * (Hinweis, Kachel, Zusatz-Auskunft). Eine neue Datei kommt hier NICHT dazu:
 * eine neue Seite liest `error`. Der Wächter `listStateBacklogGuard.test.ts`
 * ist rot, wenn eine Datei hinzukommt, eine Zahl steigt, eine genannte Datei
 * fehlt oder eine Zahl höher steht als gezählt — und er hält fest, dass nur
 * diese eine Ausnahme bleibt.
 */
export const LIST_STATE_BACKLOG: Readonly<Record<string, number>> = {
  // Bewusst offen (LZ1 Schub A, im Browser bestätigt am 2026-11-22): der Abruf teilt den
  // Schlüssel `chrome-nav-pages-<locale>` mit `useCommunityNav` (core), dessen Handler den
  // Fehler dokumentiert verschluckt (keine CMS-Seiten = Normalfall). Bei einer gestellten 500
  // bleibt `error` leer und die Liste `[]` — ein Fehler-Zustand hier hätte nie etwas zu lesen.
  'packages/blueprint/app/components/DiscussionSidebarLinks.vue': 1,
}
