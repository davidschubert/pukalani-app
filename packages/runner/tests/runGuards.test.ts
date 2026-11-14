import { describe, expect, it } from 'vitest'
import { MAX_RUN_ATTACHMENTS, PERMISSION_MODES, RUN_STATUSES, type PermissionMode, type RunStatus } from '../shared/types/runner'
import { parseRunAttachments, runAttachmentsFull, serializeRunAttachments } from '../shared/runAttachments'
import { buildResumeRunFields, isActiveRunStatus, isTerminalRunStatus, permissionModeAllowed, runResumeAllowed, runTransitionAllowed, type ResumePredecessor, type RunActor } from '../shared/runGuards'

/**
 * Die zwei Sicherungen des AI-Runners, einzeln gemessen —
 * docs/plans/AI-RUNNER.md § 8.2 (Modus-Sperre) und § 4 (Zustandsautomat).
 *
 * Beide Tabellen enthalten bewusst GEGENPROBEN: ein Test, der nur bestätigt,
 * was erlaubt ist, bleibt grün, wenn jemand die Regel „vereinfacht" und alles
 * erlaubt. Die Zeilen mit `false` sind der eigentliche Wert dieser Datei.
 */

describe('permissionModeAllowed (§ 8.2)', () => {
  const cases: Array<[PermissionMode, boolean, boolean, string]> = [
    // GEPRÜFTER Auftragstext: alle sechs Modi der CLI stehen offen.
    ['default', true, true, 'vertraut ⇒ default erlaubt'],
    ['auto', true, true, 'vertraut ⇒ auto erlaubt'],
    ['plan', true, true, 'vertraut ⇒ plan erlaubt'],
    ['acceptEdits', true, true, 'vertraut ⇒ acceptEdits erlaubt'],
    ['dontAsk', true, true, 'vertraut ⇒ dontAsk erlaubt'],
    ['bypassPermissions', true, true, 'vertraut ⇒ bypassPermissions erlaubt'],
    // UNGEPRÜFT (Gast-Feedback im Text): nur die zwei harmlosen.
    ['plan', false, true, 'ungeprüft ⇒ plan erlaubt'],
    ['acceptEdits', false, true, 'ungeprüft ⇒ acceptEdits erlaubt'],
    ['default', false, false, 'ungeprüft ⇒ default gesperrt'],
    ['auto', false, false, 'ungeprüft ⇒ auto gesperrt'],
    ['dontAsk', false, false, 'ungeprüft ⇒ dontAsk gesperrt'],
    /**
     * DIE ZEILE, DIE DEN GANZEN ABSCHNITT TRÄGT. `bypassPermissions` auf einem
     * Text, in dem Fremdmaterial steckt, wäre die volle Werkzeugkiste auf
     * Davids Rechner — genau der Pfad, gegen den § 8.2 geschrieben ist. Wer
     * die Regel „vereinfacht", lässt diesen Test fallen.
     */
    ['bypassPermissions', false, false, 'ungeprüft ⇒ bypassPermissions GESPERRT'],
  ]

  it.each(cases)('%s (trusted=%s) ⇒ %s — %s', (mode, trusted, expected) => {
    expect(permissionModeAllowed(mode, trusted)).toBe(expected)
  })

  it('kennt keinen Modus ausserhalb der CLI-Liste', () => {
    expect(permissionModeAllowed('yolo' as PermissionMode, true)).toBe(false)
  })

  it('erlaubt einem ungeprüften Auftrag höchstens zwei der sechs Modi', () => {
    const allowed = PERMISSION_MODES.filter(mode => permissionModeAllowed(mode, false))
    expect(allowed).toEqual(['plan', 'acceptEdits'])
  })
})

describe('runTransitionAllowed (§ 4)', () => {
  const cases: Array<[RunStatus, RunStatus, RunActor, boolean, string]> = [
    // Das Board kennt genau EINE Bewegung — abbrechen, in drei Zuständen.
    ['queued', 'cancelled', 'board', true, 'Abbrechen VOR dem Claim'],
    ['claimed', 'cancelled', 'board', true, 'Abbrechen nach dem Claim'],
    ['running', 'cancelled', 'board', true, 'Abbrechen im Lauf'],
    ['queued', 'claimed', 'board', false, 'Board claimt nicht'],
    ['running', 'succeeded', 'board', false, 'Board erklärt keinen Erfolg'],
    ['queued', 'running', 'board', false, 'Board startet nichts'],
    // `draft` (Paket 3): die Schleuse gegen das Anhänge-Wettrennen.
    ['draft', 'queued', 'board', true, 'Board gibt frei, wenn die Anhänge liegen'],
    ['draft', 'cancelled', 'board', true, 'Entwurf wegwerfen (Upload gescheitert)'],
    ['draft', 'claimed', 'board', false, 'Board claimt auch einen Entwurf nicht'],
    ['queued', 'draft', 'board', false, 'kein Zurück in den Entwurf'],
    // Der Runner bewegt den Lauf vorwärts.
    ['queued', 'claimed', 'runner', true, 'Claim'],
    ['claimed', 'running', 'runner', true, 'erstes Lebenszeichen'],
    ['claimed', 'failed', 'runner', true, 'scheitert vor dem Start (unbekannter repoKey)'],
    ['running', 'succeeded', 'runner', true, 'fertig'],
    ['running', 'needs_input', 'runner', true, 'Rückfrage'],
    ['running', 'failed', 'runner', true, 'Fehler'],
    ['running', 'cancelled', 'runner', true, 'Runner bestätigt den Abbruch'],
    ['queued', 'running', 'runner', false, 'kein Start ohne Claim'],
    /**
     * DIE GEGENPROBE ZUM WETTRENNEN (Paket 3). Ein Entwurf hat womöglich erst
     * die halben Anhänge; der Runner zieht sie EINMAL am Anfang (§ 7.2 Schritt
     * 4) und merkt nie, dass etwas fehlte. `claim` filtert zwar auf `queued` —
     * aber diese Zeile hält auch dann noch, wenn jemand den Filter „aufräumt".
     */
    ['draft', 'claimed', 'runner', false, 'Runner greift KEINEN Entwurf'],
    ['draft', 'running', 'runner', false, 'Runner startet KEINEN Entwurf'],
    ['running', 'claimed', 'runner', false, 'kein Rückwärts'],
    ['running', 'queued', 'runner', false, 'kein Zurück in die Schlange'],
    // GEGENPROBEN: terminal bleibt terminal, für JEDEN Handelnden.
    ['cancelled', 'running', 'runner', false, 'abgebrochen wird nicht wiederbelebt'],
    ['cancelled', 'succeeded', 'runner', false, 'Nachlauf hebt den Abbruch nicht auf'],
    ['succeeded', 'running', 'runner', false, 'fertig bleibt fertig'],
    ['failed', 'running', 'runner', false, 'gescheitert bleibt gescheitert'],
    ['needs_input', 'running', 'runner', false, 'Rückfrage geht per NEUEM Lauf (--resume) weiter'],
    ['succeeded', 'cancelled', 'board', false, 'nichts abzubrechen'],
    ['cancelled', 'cancelled', 'board', false, 'zweimal abbrechen ist kein Übergang'],
  ]

  it.each(cases)('%s → %s (%s) ⇒ %s — %s', (from, to, actor, expected) => {
    expect(runTransitionAllowed(from, to, actor)).toBe(expected)
  })

  /**
   * Die Regel „terminal ist terminal" nicht nur an Stichproben, sondern über
   * das ganze Kreuzprodukt: vier Endzustände × sieben Ziele × zwei Handelnde.
   */
  it('lässt aus KEINEM Endzustand irgendeinen Übergang zu', () => {
    const escapes: string[] = []
    for (const from of RUN_STATUSES.filter(isTerminalRunStatus)) {
      for (const to of RUN_STATUSES) {
        for (const actor of ['board', 'runner'] as const) {
          if (runTransitionAllowed(from, to, actor)) escapes.push(`${actor}: ${from} → ${to}`)
        }
      }
    }
    expect(escapes).toEqual([])
  })

  it('kennt genau vier Endzustände', () => {
    expect(RUN_STATUSES.filter(isTerminalRunStatus)).toEqual(['succeeded', 'needs_input', 'failed', 'cancelled'])
  })

  /**
   * `draft` ist der EINZIGE Zustand, aus dem der Runner nirgendwohin darf,
   * ohne selbst ein Ende zu sein. Als Menge geprüft statt an zwei Stichproben:
   * käme morgen ein Ziel dazu, fiele diese Zeile.
   */
  it('gibt dem Runner aus „draft" keinen einzigen Übergang', () => {
    const reachable = RUN_STATUSES.filter(to => runTransitionAllowed('draft', to, 'runner'))
    expect(reachable).toEqual([])
  })

  it('hält „draft" für einen ARBEITS-Zustand, nicht für ein Ende', () => {
    expect(isTerminalRunStatus('draft')).toBe(false)
    expect(isActiveRunStatus('draft')).toBe(true)
    expect(isActiveRunStatus('cancelled')).toBe(false)
  })
})

/**
 * Die Fortsetzung einer `needs_input`-Rückfrage (§ 4 / § 9). Zwei Regeln, beide
 * mit Gegenprobe: WANN darf man fortsetzen (`runResumeAllowed`) und WAS erbt der
 * neue Lauf (`buildResumeRunFields`, die Vererbung von `promptTrusted` aus § 8.2).
 */
describe('runResumeAllowed (§ 4 / § 9)', () => {
  const cases: Array<[RunStatus, string, boolean, string]> = [
    ['needs_input', 's-1', true, 'Rückfrage mit Session ⇒ fortsetzbar'],
    // GEGENPROBEN — der eigentliche Wert: jeder andere Zustand ist ein 409.
    ['needs_input', '', false, 'Rückfrage OHNE Session ⇒ nichts zum Anknüpfen'],
    ['succeeded', 's-1', false, 'fertig ist keine offene Frage'],
    ['failed', 's-1', false, 'gescheitert ist keine offene Frage'],
    ['cancelled', 's-1', false, 'abgebrochen ist keine offene Frage'],
    ['running', 's-1', false, 'läuft noch — nichts fortzusetzen'],
    ['queued', 's-1', false, 'wartet noch — nichts fortzusetzen'],
    ['draft', 's-1', false, 'Entwurf — nichts fortzusetzen'],
  ]

  it.each(cases)('%s (session=%s) ⇒ %s — %s', (status, sessionId, expected) => {
    expect(runResumeAllowed({ status, sessionId })).toBe(expected)
  })
})

describe('buildResumeRunFields (§ 8.2-Vererbung)', () => {
  const predecessor: ResumePredecessor = {
    status: 'needs_input',
    sessionId: 'sess-abc',
    subjectType: 'ticket',
    subjectId: 't-1',
    runnerId: 'r-1',
    repoKey: 'maui-monorepo',
    baseBranch: 'main',
    model: 'opus',
    permissionMode: 'plan',
    promptTrusted: false,
    testCommands: '["pnpm lint"]',
    maxBudgetUsd: 5,
  }

  it('erbt alle Ausführungs-Felder aus dem Vorgänger, NUR der Text ist neu', () => {
    const fields = buildResumeRunFields(predecessor, 'Ja, bitte fortfahren.', true)
    expect(fields.subjectType).toBe('ticket')
    expect(fields.subjectId).toBe('t-1')
    expect(fields.runnerId).toBe('r-1')
    expect(fields.repoKey).toBe('maui-monorepo')
    expect(fields.model).toBe('opus')
    expect(fields.permissionMode).toBe('plan')
    expect(fields.testCommands).toBe('["pnpm lint"]')
    expect(fields.maxBudgetUsd).toBe(5)
    expect(fields.promptSource).toBe('Ja, bitte fortfahren.')
    expect(fields.resumeSessionId).toBe('sess-abc')
  })

  /**
   * DIE ZEILE, DIE DEN ABSCHNITT TRÄGT (§ 8.2): eine Fortsetzung eines
   * ungeprüften Laufs bleibt ungeprüft. Würde `buildResumeRunFields` hier `true`
   * einsetzen (oder den Wert aus einem Body nehmen), wäre die Antwort ein Weg,
   * die Modus-Sperre zu umgehen. Wer die Vererbung „vereinfacht", wird hier rot.
   */
  it('vererbt promptTrusted=false und wäscht die Herkunft NICHT rein', () => {
    // Auch ein heute geprüftes Subjekt hebt einen ungeprüften Vorgänger nicht an.
    expect(buildResumeRunFields(predecessor, 'x', true).promptTrusted).toBe(false)
    expect(buildResumeRunFields(predecessor, 'x', false).promptTrusted).toBe(false)
    expect(buildResumeRunFields({ ...predecessor, promptTrusted: true }, 'x', true).promptTrusted).toBe(true)
  })

  /**
   * SEC-038: ein geprüfter Vorgänger bleibt nur geprüft, solange das Subjekt es
   * HEUTE noch ist — wurde das Ticket inzwischen von fremder Hand umgeschrieben
   * (oder gelöscht), ist die Fortsetzung ungeprüft.
   */
  it('stuft ab, wenn das Subjekt heute nicht mehr geprüft ist', () => {
    expect(buildResumeRunFields({ ...predecessor, promptTrusted: true }, 'x', false).promptTrusted).toBe(false)
  })

  it('zählt nur ein boolesches true des Vorgängers (Alt-Daten)', () => {
    const odd = { ...predecessor, promptTrusted: 'true' as unknown as boolean }
    expect(buildResumeRunFields(odd, 'x', true).promptTrusted).toBe(false)
  })

  it('lässt einen ungeprüften Vorgänger nur harmlose Modi weitertragen (§ 8.2)', () => {
    // Ein ungeprüfter Lauf hätte nie `bypassPermissions` bekommen; wäre er es
    // doch (Alt-Daten), fiele die Fortsetzung an derselben Sperre.
    const fields = buildResumeRunFields({ ...predecessor, permissionMode: 'bypassPermissions' }, 'x', true)
    expect(permissionModeAllowed(fields.permissionMode, fields.promptTrusted)).toBe(false)
  })
})

/**
 * Die Anhang-Spalte ist ein JSON-Text in einer Datenbank — also alles, was
 * dort landen kann, und nicht nur das, was wir hineinschreiben. Sie ist
 * zugleich die ERLAUBNISLISTE für `runs/:id/files/:fileId`: was hier
 * herausfällt, wird nicht ausgeliefert.
 */
describe('parseRunAttachments (§ 6)', () => {
  it('liest, was der Upload geschrieben hat', () => {
    const raw = JSON.stringify([{ fileId: 'f1', name: 'bild.png', mimeType: 'image/png', size: 12 }])
    expect(parseRunAttachments(raw)).toEqual([{ fileId: 'f1', name: 'bild.png', mimeType: 'image/png', size: 12 }])
  })

  it.each([
    ['', 'leere Spalte (Default)'],
    ['{}', 'Objekt statt Liste'],
    ['[', 'abgeschnittenes JSON'],
    ['null', 'null'],
  ])('macht aus %s eine leere Liste — %s', (raw) => {
    expect(parseRunAttachments(raw)).toEqual([])
  })

  it('wirft Einträge ohne fileId weg — sie wären nicht auslieferbar', () => {
    expect(parseRunAttachments(JSON.stringify([{ name: 'ohne-id' }, 'text', 42]))).toEqual([])
  })

  it('serialisiert leer als "" (Spalten-Default), nicht als "[]"', () => {
    expect(serializeRunAttachments([])).toBe('')
  })

  it('ist bei MAX_RUN_ATTACHMENTS voll', () => {
    const many = Array.from({ length: MAX_RUN_ATTACHMENTS }, (_, i) => ({ fileId: `f${i}`, name: 'x', mimeType: 'text/plain', size: 1 }))
    expect(runAttachmentsFull(many)).toBe(true)
    expect(runAttachmentsFull(many.slice(1))).toBe(false)
  })
})
