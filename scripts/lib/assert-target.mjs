/**
 * Ziel-Prüfung als EINE Import-Zeile (OPS-002) — für Migrationen und für
 * Skripte, die ihre Umgebung über `node --env-file=…` bekommen:
 *
 *   import '../../../../scripts/lib/assert-target.mjs'
 *
 * Die Zeile gehört als ERSTER Import in die Datei: Module werden in der
 * Reihenfolge ihrer Importe ausgeführt, die Prüfung läuft also, bevor
 * irgendein Client entsteht. Regel und Begründung: `./target.mjs`.
 */
import { basename } from 'node:path'
import { assertTarget } from './target.mjs'

assertTarget({ script: basename(process.argv[1] ?? 'skript') })
