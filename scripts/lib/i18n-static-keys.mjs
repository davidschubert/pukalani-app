/**
 * FEST IM CODE GENANNTE TEXT-SCHLÜSSEL (Q03, 2026-11-20) — der zweite Teil von
 * `pnpm check:i18n-keys`.
 *
 * WARUM: `t('ui.close')` stand vom 2026-09-07 an auf einem Knopf, den Schlüssel
 * gab es in keiner Sprachdatei. vue-i18n zeigt dann den Schlüssel selbst, ohne
 * Fehler und ohne Warnung; Typecheck, Lint und Tests sehen einen `string`.
 *
 * WAS GELESEN WIRD: jeder Aufruf `t('…')` und `$t('…')` (auch `x.t('…')`) mit
 * einem FESTEN Schlüssel und jedes `keypath="…"` in `app/` und `shared/` eines
 * Layers oder einer App, in `.vue`- und `.ts`-Dateien. Kommentare zählen nicht.
 *
 * WOGEGEN GEPRÜFT WIRD: eine Datei eines Layers läuft in JEDER App, die den
 * Layer mitbringt. Der Schlüssel muss deshalb in jeder dieser Apps bekannt
 * sein, in beiden Sprachen — bekannt heißt: in den Sprachdateien der App oder
 * eines Layers aus ihrem `extends`.
 *
 * WAS DRAUSSEN BLEIBT, MIT GRUND:
 *  - zusammengesetzte Schlüssel (t(`a.${x}`), t('a.' + x)): der Wert steht erst
 *    zur Laufzeit fest, ein Wächter müsste raten,
 *  - `te('…')`: fragt nur, ob es den Schlüssel gibt,
 *  - `server/`: dort heißt auch eine eigene Hilfe `t` (Texte für Mails und
 *    Start-Inhalte mit eigener Tabelle),
 *  - Felder wie `labelKey: '…'` im Code: manche tragen einen ganzen Schlüssel,
 *    manche nur den Anfang, manche gar keinen Text-Schlüssel. Die Felder der
 *    `app.config` prüft Teil 1 über seine Tabelle.
 *
 * GRENZE DES LESERS: er ist eine Textanalyse. Ein Apostroph im Fließtext vor
 * einem Zeilen-Kommentar derselben Zeile kann einen Aufruf im Kommentar
 * sichtbar machen. Das fällt als roter Befund auf, nie als stille Lücke.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', 'dist'])
const SOURCE_DIRS = ['app', 'shared']
const SOURCE_FILE = /\.(vue|ts|mts)$/
const TEST_FILE = /\.(test|spec)\.ts$/

/**
 * Zeichenketten bleiben stehen, Kommentare werden zu Leerzeichen (die Zeilen
 * bleiben, damit die Zeilennummer stimmt). Zeichenketten stehen in der Regel
 * VOR den Kommentaren: ein `//` in `'https://…'` ist kein Kommentar.
 */
const STRING_OR_COMMENT = /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|(?<![:\\])\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g

export function stripComments(source) {
  return source.replace(STRING_OR_COMMENT, (hit) => {
    if (hit.startsWith('\'') || hit.startsWith('"')) return hit
    return hit.replace(/[^\n]/g, ' ')
  })
}

/**
 * `t(` nicht als Ende eines längeren Namens (`format(`, `at(`), davor optional
 * `$`. Nach dem Schlüssel muss der Aufruf enden oder ein weiteres Argument
 * folgen — `t('a.' + x)` ist zusammengesetzt und fällt damit heraus.
 */
const CALL = /(?<![\w$])\$?t\(\s*(['"`])([^'"`\n]*)\1\s*[,)]/g
const KEYPATH = /(?<![\w:-])keypath=(['"])([^'"\n]*)\1/g

/** Alle festen Schlüssel einer Datei: `[{ key, line }]`. */
export function staticKeysOf(source) {
  const clean = stripComments(source)
  const found = []
  for (const pattern of [CALL, KEYPATH]) {
    for (const match of clean.matchAll(pattern)) {
      const key = match[2]
      if (!key || key.includes('${')) continue
      found.push({ key, line: clean.slice(0, match.index).split('\n').length })
    }
  }
  return found.sort((a, b) => a.line - b.line)
}

function sourceFiles(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) sourceFiles(path, out)
    else if (SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name)) out.push(path)
  }
  return out
}

/**
 * @param {object} input
 * @param {string} input.root Wurzel des Repos (für die Anzeige der Pfade)
 * @param {{ name: string, dirs: string[], known: Record<string, Set<string>> }[]} input.apps
 *   je App: ihre Verzeichnisse (App zuerst, dann die Layer) und die bekannten
 *   Schlüssel je Sprache
 * @param {string[]} input.locales
 * @returns {{ calls: number, files: number, findings: { file: string, line: number, key: string, apps: { app: string, missing: string[] }[] }[] }}
 */
export function checkStaticKeys({ root, apps, locales }) {
  const keysByFile = new Map()
  const keysIn = (dir) => {
    const files = []
    for (const sub of SOURCE_DIRS) {
      for (const file of sourceFiles(join(dir, sub))) {
        if (!keysByFile.has(file)) keysByFile.set(file, staticKeysOf(readFileSync(file, 'utf8')))
        files.push(file)
      }
    }
    return files
  }

  const byPlace = new Map()
  for (const app of apps) {
    for (const dir of app.dirs) {
      for (const file of keysIn(dir)) {
        for (const { key, line } of keysByFile.get(file)) {
          const missing = locales.filter(locale => !app.known[locale].has(key))
          if (!missing.length) continue
          const place = `${file}:${line}:${key}`
          if (!byPlace.has(place)) byPlace.set(place, { file: relative(root, file), line, key, apps: [] })
          byPlace.get(place).apps.push({ app: app.name, missing })
        }
      }
    }
  }

  let calls = 0
  for (const keys of keysByFile.values()) calls += keys.length
  return { calls, files: keysByFile.size, findings: [...byPlace.values()] }
}
