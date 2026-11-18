/**
 * Mail-Blick, Blick 1: die Rechnung (WA1 e, 2026-11-18).
 *
 * WORAUS GELESEN WIRD: die Zeile `mailbremse ausgeloest=<n> letzte_min=<m|nie>`
 * des Zähl-Skripts `ops/app-watch-counts.mjs`. Das Skript liest je App genau
 * die zwei Log-Dateien, in die der Prozess GERADE schreibt (aus `pm2 jlist`),
 * ihre umgelaufenen Geschwister und nur Zeilen im Zeitfenster. Bis dahin lief
 * ein `grep` über `~/.pm2/logs/*-error*.log` — also auch über die Dateien
 * früherer Prozess-Nummern, und nur das Zeitfenster hielt den Blick richtig.
 *
 * Rein: bekommt Text, gibt Zahlen und Wörter aus festen Listen zurück. Die
 * Site-Namen kommen aus `ops/apps.conf` (öffentlich im Repo).
 */
import { parseCounts } from './app-signals-rules.mjs'

/** Warum eine App nicht gezählt werden konnte — ein Satzteil je Wort. */
export const UNCHECKED_TEXT = {
  'nicht-erreichbar': 'der Server hat nicht geantwortet',
  'unlesbar': 'die Antwort hatte nicht die feste Form',
  'abgeschnitten': 'die Antwort war abgeschnitten',
  'version': 'das Zähl-Skript auf dem Server hat eine andere Version',
  'prozess-fehlt': 'pm2 kennt den Prozess nicht',
  'pm2-antwortet-nicht': 'pm2 antwortet nicht',
  'zaehl-skript-aelter': 'das Zähl-Skript auf dem Server zählt die Notbremse noch nicht (es kommt mit dem nächsten Ausliefern)',
}

/**
 * Die Antwort des Zähl-Skripts EINER App für den Mail-Blick deuten.
 *
 * @param {string | null} text Ausgabe von `app-watch-counts.mjs`, `null` = keine Antwort
 * @returns {{ state: 'counted', count: number, lastMin: number | null } | { state: 'unchecked', reason: keyof typeof UNCHECKED_TEXT }}
 */
export function readMailBreaker(text) {
  if (text === null || text === undefined) return { state: 'unchecked', reason: 'nicht-erreichbar' }
  const counts = parseCounts(text)
  if (counts.problem) return { state: 'unchecked', reason: counts.problem in UNCHECKED_TEXT ? counts.problem : 'unlesbar' }
  // Die Zeile ist für die Auswertung optional (ein Server mit dem Skript von
  // vorher schreibt sie nicht) — „nicht gezählt" ist dann die ehrliche Antwort.
  if (counts.mailBreaker === undefined) return { state: 'unchecked', reason: 'zaehl-skript-aelter' }
  return { state: 'counted', count: counts.mailBreaker, lastMin: counts.mailBreakerLastMin ?? null }
}

/**
 * Alle Apps zusammen: was gezählt wurde, wo die Notbremse griff, wo nicht
 * gezählt werden konnte.
 *
 * @param {Array<{ site: string, text: string | null }>} answers
 */
export function summarizeMailBreaker(answers) {
  const findings = []
  const unchecked = []
  let counted = 0
  for (const { site, text } of answers) {
    const result = readMailBreaker(text)
    if (result.state === 'unchecked') {
      unchecked.push({ site, reason: result.reason })
      continue
    }
    counted++
    if (result.count > 0) findings.push({ site, count: result.count, lastMin: result.lastMin })
  }
  return { counted, findings, unchecked, total: findings.reduce((sum, item) => sum + item.count, 0) }
}
