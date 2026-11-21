import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openFetchCount, REPO, scanOpenFetches } from './support/fetchErrorScan'
import { LIST_STATE_BACKLOG } from './support/listStateBacklog'

/**
 * WÄCHTER: DIE REST-LISTE „ZUSTÄNDE EINER LISTE" WÄCHST NICHT (FE-004, Q14).
 *
 * Neue Seiten lesen den Fehler ihres Abrufs (`listState()`, `CoreListState`,
 * `CoreLoadError`); der Bestand steht in `support/listStateBacklog.ts` und
 * schrumpft dort. Rot, wenn
 *  - eine Datei offene Abrufe hat, aber nicht auf der Liste steht (neu),
 *  - eine Datei mehr offene Abrufe hat als eingetragen (gewachsen),
 *  - eine genannte Datei nicht mehr existiert oder weniger offene Abrufe hat
 *    als eingetragen (Liste nachziehen — sonst deckt der Eintrag später eine
 *    neue Stelle still ab).
 *
 * GEGENPROBEN (2026-11-21): eine neue Seite mit `const { data } = await
 * useFetch<…>(…)` ⇒ rot (Datei fehlt); `error` aus der Mitglieder-Seite
 * entfernt ⇒ rot (Zahl gestiegen); ein ausgedachter Eintrag ⇒ rot.
 */
describe('Rest-Liste Listen-Zustände (Q14)', () => {
  const actual = scanOpenFetches()

  it('keine neue Datei mit Abruf ohne Fehler-Zweig, keine gestiegene Zahl', () => {
    const grown = Object.entries(actual)
      .filter(([file, count]) => count > (LIST_STATE_BACKLOG[file] ?? 0))
      .map(([file, count]) => `${file}: ${count} offen, eingetragen ${LIST_STATE_BACKLOG[file] ?? 0}`)
    expect(grown, 'Abruf ohne `error` — über listState()/CoreListState/CoreLoadError zeichnen (CLAUDE.md, Datenlisten)').toEqual([])
  })

  it('jeder Eintrag existiert und stimmt noch (die Liste schrumpft mit)', () => {
    const stale = Object.entries(LIST_STATE_BACKLOG)
      .filter(([file, count]) => !existsSync(join(REPO, file)) || (actual[file] ?? 0) < count)
      .map(([file, count]) => `${file}: eingetragen ${count}, gezählt ${actual[file] ?? 0}`)
    expect(stale, 'Eintrag in tests/support/listStateBacklog.ts senken oder löschen').toEqual([])
  })

  it('die Liste ist nicht leer gezählt (der Scanner findet die umgestellten Seiten als erledigt)', () => {
    // Fühler: eine bekannte umgestellte Seite hat keinen offenen Abruf mehr,
    // eine Datei der Liste hat einen — sonst zählt der Scanner nichts.
    expect(openFetchCount(readFileSync(join(REPO, 'packages/onboarding/app/pages/settings/billing.vue'), 'utf8'))).toBe(0)
    expect(openFetchCount('const { data, status } = await useFetch<X>(\'/api/x\')')).toBe(1)
    expect(openFetchCount('const { data, error } = await useFetch<X>(\'/api/x\')')).toBe(0)
    expect(openFetchCount('const res = useFetch<X>(\'/api/x\')\nif (res.error.value) {}')).toBe(0)
    expect(openFetchCount('// useFetch(\'/api/x\')')).toBe(0)
    expect(Object.keys(actual).length).toBeGreaterThan(0)
  })
})
