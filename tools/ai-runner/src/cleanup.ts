import { lstat, readdir, rm } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { RunnerConfig, RunRetentionMode } from './config.ts'
import { log } from './log.ts'
import { isSafeRunId } from './protocol.ts'

/**
 * Alte Lauf-Ordner aufräumen — BE-025 (Mac-Seite).
 *
 * Je Lauf bleibt `<stateDir>/runs/<runId>/` liegen: Auftrag, Anhänge,
 * Protokoll. Ohne Frist wächst das für immer, und mit den Anhängen liegen
 * auch fremde Texte und Bilder länger auf dem Rechner als nötig.
 *
 * VORSICHTIG ZUERST: Vorgabe ist `dry-run` (nur zählen); gelöscht wird erst,
 * wenn die Config `apply` sagt. Gewählt werden nur echte Verzeichnisse (keine
 * Symlinks — `rm` auf einem Link-Ziel wäre ein Löschen ausserhalb der
 * Ablage), mit einem Namen in Lauf-Id-Form, nie der gerade laufende Auftrag,
 * und nur, wenn die JÜNGSTE Änderung (Ordner selbst und seine direkten
 * Einträge) älter als die Frist ist.
 */

export interface RunDirEntry {
  name: string
  isDirectory: boolean
  isSymbolicLink: boolean
  /** jüngste mtime des Ordners und seiner direkten Einträge */
  newestMtimeMs: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/** PUR: welche Ordner sind abgelaufen? */
export function selectExpiredRunDirs(
  entries: RunDirEntry[],
  nowMs: number,
  days: number,
  activeRunId: string | null,
): string[] {
  const cutoff = nowMs - days * DAY_MS
  return entries
    .filter(entry => entry.isDirectory
      && !entry.isSymbolicLink
      && isSafeRunId(entry.name)
      && entry.name !== activeRunId
      && Number.isFinite(entry.newestMtimeMs)
      && entry.newestMtimeMs < cutoff)
    .map(entry => entry.name)
}

export interface SweepResult {
  mode: RunRetentionMode
  candidates: number
  deleted: number
  failed: number
}

/** Jüngste mtime von Ordner + direkten Einträgen. Unlesbares zählt als „jetzt" (⇒ bleibt). */
async function newestMtime(dir: string, ownMtimeMs: number): Promise<number> {
  let newest = ownMtimeMs
  try {
    for (const name of await readdir(dir)) {
      try {
        const stats = await lstat(join(dir, name))
        newest = Math.max(newest, stats.mtimeMs)
      }
      catch {
        return Date.now()
      }
    }
  }
  catch {
    return Date.now()
  }
  return newest
}

export async function sweepRunDirs(config: RunnerConfig, activeRunId: () => string | null): Promise<SweepResult> {
  const { mode, days } = config.runRetention
  const result: SweepResult = { mode, candidates: 0, deleted: 0, failed: 0 }
  if (mode === 'off') {
    log.info(`Ablage-Aufräumen: aus (runRetention.mode = off)`)
    return result
  }

  const runsRoot = resolve(config.stateDir, 'runs')
  let names: string[]
  try {
    names = await readdir(runsRoot)
  }
  catch (error) {
    // Kein Ordner = noch nie ein Lauf. Alles andere ist eine Warnung, kein Absturz.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    names = []
  }

  const entries: RunDirEntry[] = []
  for (const name of names) {
    // Unsichere Namen gar nicht erst anfassen (auch kein lstat-Aufwand).
    if (!isSafeRunId(name)) continue
    try {
      const path = join(runsRoot, name)
      const stats = await lstat(path)
      const isDirectory = stats.isDirectory()
      const isSymbolicLink = stats.isSymbolicLink()
      entries.push({
        name,
        isDirectory,
        isSymbolicLink,
        newestMtimeMs: isDirectory && !isSymbolicLink ? await newestMtime(path, stats.mtimeMs) : stats.mtimeMs,
      })
    }
    catch {
      // Verschwunden oder unlesbar: nicht wählen.
    }
  }

  const expired = selectExpiredRunDirs(entries, Date.now(), days, activeRunId())
  result.candidates = expired.length

  if (mode === 'apply') {
    for (const name of expired) {
      const target = resolve(join(config.stateDir, 'runs', name))
      // Zweites Netz: der Pfad liegt nach dem Auflösen DIREKT unter runs/,
      // und der Auftrag hat in der Zwischenzeit nicht begonnen.
      if (dirname(target) !== runsRoot || basename(target) !== name || name === activeRunId()) {
        result.failed++
        continue
      }
      try {
        await rm(target, { recursive: true, force: true })
        result.deleted++
      }
      catch {
        result.failed++
      }
    }
  }

  // EINE Zeile je Durchgang — Zahlen, keine Namen, keine Inhalte.
  log.info(`Ablage-Aufräumen (${mode}, Frist ${days} Tage): ${result.candidates} abgelaufen, ${result.deleted} gelöscht, ${result.failed} fehlgeschlagen`)
  return result
}
