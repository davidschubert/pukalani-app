/**
 * BESTAND: ROUTEN IM BLICK, DIE NOCH KEINEN ROLLEN-TEST HABEN (P27, OPS-009).
 *
 * Stand 2026-11-17, einmalig mechanisch aus dem damaligen Code erzeugt. Gelesen
 * von `../route-role-coverage.test.ts`.
 *
 * Diese Liste darf NUR SCHRUMPFEN. Bekommt eine Route einen Rollen-Test
 * (Prüfstand `participationHarness.ts`), fliegt ihr Eintrag hier raus — der
 * Wächter meldet es. Eine NEUE Route gehört NICHT hierher: sie bekommt gleich
 * einen Test.
 *
 * Gruppiert nach Layer (`packages/<name>` ⇒ `<name>`, `apps/<name>` ⇒
 * `apps/<name>`), Gruppen und Einträge alphabetisch. Pfade relativ zum Repo.
 */
export const ROUTE_ROLE_BACKLOG: Readonly<Record<string, readonly string[]>> = {}
