/**
 * Wächter gegen das EINE Anführungszeichen, das eine bezahlte KI-Antwort
 * zerstört (BI4 → AI2, 2026-11-09).
 *
 * ── WAS ER SUCHT ─────────────────────────────────────────────────────────
 * Ein deutsches Anführungszeichen auf (U+201E „) und ein GERADES ASCII-`"`
 * (U+0022) zu — in einer Zeichenkette, die als Teil eines KI-PROMPTS zum
 * Anbieter reist. In einem JSON-String beendet dieses Zeichen den String:
 * gemessen am 2026-11-08 starben so 4 von 52 bezahlten Entwurfs-Läufen
 * (`502 AI returned no JSON` vor einem vollständigen, fertigen Artikel).
 *
 * ── WARUM EIN WÄCHTER UND KEIN TEST ──────────────────────────────────────
 * Weil der Fehler nicht im Code sitzt, sondern in einem Beispiel-SATZ, und
 * weil er zweimal unabhängig entstanden ist: am 2026-11-08 in der Regel
 * selbst, einen Tag später nochmal in den SEO/GEO-Regeln aus einer
 * Nachbarsitzung (sieben weitere Vorlagen in demselben Prompt). Ein Modell
 * lernt die FORM seiner Antwort aus den Beispielen im Auftrag, nicht aus dem
 * Verbot daneben — eine Regel, die ihr Gegenteil vorführt, ist weniger als
 * keine. Typecheck, Lint und Tests sehen davon nichts.
 *
 * ── WAS ER NICHT IST ─────────────────────────────────────────────────────
 * Keine Typografie-Polizei. Deutsche OBERFLÄCHEN-Texte dieses Repos schreiben
 * `„…"` seit immer so, und das bleibt: geprüft werden NUR Dateien, die einen
 * KI-Prompt bauen (sie rufen `aiComplete*`/`aiVision*`/`aiVideo*` oder heißen
 * `*Prompt.ts`), und auch dort nur Zeichenketten-Zeilen, keine Kommentare.
 * Eine Zeile in einer solchen Datei, die NICHT in einen Prompt geht (ein
 * Ersatz-Text, eine Oberflächen-Meldung), trägt `prompt-quotes-ok` als
 * Kommentar — mit Grund, in derselben oder der Zeile darüber.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCAN = ['packages', 'apps', 'scripts']
const SKIP_DIRS = new Set(['node_modules', '.nuxt', '.output', 'dist', '.git', '.playground', 'tests', 'e2e'])

/** Deutsches Anführungszeichen auf, gerades zu — der Fehler als Muster. */
const BROKEN = /„[^“"\n]{0,120}"/
/**
 * Woran man eine Prompt-Datei erkennt: sie RUFT einen KI-Transport, oder sie
 * heisst `*Prompt.ts`. Bewusst eng — die erste Fassung nahm jede Datei, in der
 * irgendwo `Prompt(` stand, und fand damit 47 deutsche INHALTS-Zeilen der
 * Demo-Sitzungen (`brand/shared/sessionContent.ts`), die kein Modell je sieht.
 * Ein Wächter, der zu viel meldet, wird abgeschaltet.
 */
const BUILDS_PROMPT = /\bai(Complete|Vision|Video|Stream)(Json)?\s*[<(]/
const ESCAPE = 'prompt-quotes-ok'

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full)
  }
  return out
}

const files = SCAN.flatMap(d => {
  try {
    return walk(join(ROOT, d))
  }
  catch {
    return []
  }
})

const findings = []
let scanned = 0

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const isPromptFile = BUILDS_PROMPT.test(text) || /Prompt\.ts$/.test(file)
  if (!isPromptFile) continue
  scanned++
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    const bare = line.trimStart()
    // Kommentare lehren kein Modell etwas.
    if (bare.startsWith('*') || bare.startsWith('//') || bare.startsWith('/*')) return
    if (!BROKEN.test(line)) return
    // Die Verbots-Zeile der Regel MUSS das gerade Zeichen nennen.
    if (line.includes('darf in keinem Textwert') || line.includes('must never appear inside a text value')) return
    if (line.includes(ESCAPE) || (lines[index - 1] ?? '').includes(ESCAPE)) return
    findings.push({ file: relative(ROOT, file), line: index + 1, text: line.trim().slice(0, 120) })
  })
}

if (findings.length > 0) {
  console.error(`✖ ${findings.length} Prompt-Zeile(n) führen ein gerades Anführungszeichen vor:\n`)
  for (const f of findings) console.error(`  ${f.file}:${f.line}\n    ${f.text}`)
  console.error(`
So geht es weg: das schliessende Zeichen typografisch setzen („…“ im
Deutschen, “…” im Englischen). Ein gerades " im Prompt ist eine Vorlage
für genau das Zeichen, das die JSON-Antwort des Modells beendet — gemessen
4 von 52 bezahlten Läufen (BI4). Geht die Zeile NICHT in einen Prompt,
trägt sie einen Kommentar '${ESCAPE}: <Grund>'.`)
  process.exit(1)
}

console.log(`✓ ${scanned} Prompt-Dateien geprüft, keine führt ein gerades Anführungszeichen vor`)
