#!/usr/bin/env node
/**
 * Der Alarmweg des Produktions-Wächters: aus den Ergebnissen EINES Laufs den
 * Zustand des Issues `produktions-alarm` machen (Job `alarm` in
 * `.github/workflows/production-watch.yml`).
 *
 * WARUM EIN SKRIPT (2026-11-19, OPEN-ITEMS „KM1" e): bis dahin stand die
 * Regel als Shell im Workflow und lautete „nichts rot in diesem Lauf ⇒ Issue
 * schließen". Der Halbstunden-Lauf prüft den täglichen Teil aber gar nicht
 * (Job `server` = `skipped`) — er schloss ein Issue aus dem täglichen Teil
 * nach höchstens 30 Minuten mit „alle Wächter wieder grün", obwohl niemand
 * neu geprüft hatte (Issue 401: auf 21:39 UTC, zu 22:10 UTC, der Befund
 * bestand um 22:31 UTC noch).
 *
 * DIE REGEL JETZT: das Issue trägt je QUELLE, die rot war und seither nicht
 * grün GESEHEN wurde, ein Label (`alarm:tls`, `alarm:server`,
 * `alarm:kundendomains`). Ein Lauf ändert nur, was er gemessen hat:
 *
 *   · Job rot (`failure`)   ⇒ Label dazu
 *   · Job grün (`success`)  ⇒ Label weg
 *   · alles andere (`skipped`, `cancelled`, leer) ⇒ Label bleibt, wie es ist
 *
 * Geschlossen wird, wenn KEIN Quellen-Label mehr übrig ist. Ein Halbstunden-
 * Lauf lässt `alarm:server` also stehen und schreibt keine Entwarnung; ein
 * Issue, das nur `alarm:tls` oder `alarm:kundendomains` trägt, schließt er
 * wie vorher. Im gemischten Fall nimmt jeder Lauf seinen Teil weg, und das
 * Issue geht mit dem letzten Label zu.
 *
 * WARUM LABELS und nicht der Titel oder ein Vermerk im Text: der Titel ist
 * Prosa (er nennt den Stand beim Öffnen und ändert sich nicht mehr), ein
 * Vermerk im Text müsste bei jedem Wechsel neu geschrieben und wieder
 * herausgelesen werden. Ein Label ist ein Wert, den GitHub selbst führt: mit
 * einem Aufruf gesetzt oder entfernt, in der Liste sichtbar, und ein Mensch
 * kann es von Hand korrigieren.
 *
 * EIN OFFENES ISSUE OHNE QUELLEN-LABEL (von Hand geöffnet, Label von Hand
 * entfernt, oder aus der Zeit vor dieser Regel) verhält sich wie früher: der
 * erste Lauf ohne roten Job schließt es.
 *
 * DER HEARTBEAT bleibt, was er war: „DIESER Lauf hat nichts Rotes gesehen"
 * (`gruen=1`), nicht „es ist kein Issue offen". Ein offenes Tages-Issue hält
 * den Halbstunden-Heartbeat nicht auf — sonst meldete UptimeRobot denselben
 * Befund ein zweites Mal.
 *
 * PROBEALARME: ein Probe-Schalter läuft immer über `workflow_dispatch`, und
 * dort laufen ALLE drei Jobs. Aufräumen ist deshalb ein Lauf von Hand ohne
 * Schalter (`gh workflow run production-watch.yml`) — er misst alle Quellen
 * und schließt sofort, ohne auf den Tageslauf zu warten.
 *
 * WAS DIESES SKRIPT AUSGIBT (das Protokoll ist öffentlich): feste Sätze,
 * Zahlen, die Namen der Jobs und der Labels. Die Sätze unter „Was zu tun
 * ist" kommen aus unseren eigenen Prüf-Skripten und stehen nur im Issue.
 *
 * Umgebung: `TLS_RESULT`, `SERVER_RESULT`, `KUNDEN_RESULT` (Ergebnis je Job),
 * `DRILL` (`1` = Probealarm), `BEFUNDE_TLS`, `BEFUNDE_SERVER`,
 * `BEFUNDE_KUNDEN`, `RUN_URL`, `LABEL`, `ALARM_ASSIGNEE`, `GITHUB_OUTPUT`;
 * dazu `GH_TOKEN` und `GH_REPO` für `gh`.
 *
 * Exit 0 = Zustand geschrieben · Exit 1 = ein Aufruf ist gescheitert (dann
 * fehlen die Ausgänge, und weder Mail noch Heartbeat laufen — ein kaputter
 * Alarmweg darf nicht grün aussehen).
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Die drei Quellen: Job im Workflow, Label am Issue, Satz für Titel und Mail.
 * Reihenfolge = Reihenfolge im Titel.
 */
export const SOURCES = Object.freeze([
  Object.freeze({
    key: 'tls',
    label: 'alarm:tls',
    text: 'Zertifikate/Erreichbarkeit/Live-Verbindung (alle 30 min)',
    description: 'Alarm-Quelle: Job tls (alle 30 min) war rot und ist seither nicht grün gesehen',
  }),
  Object.freeze({
    key: 'server',
    label: 'alarm:server',
    text: 'Server-Blicke (täglich: Env, Zugänge, Admin-Konto, Mail, KI-Modelle, Bot-Prüfung, Datenbank-Stand, Backup, in die App hinein, Realtime-Wächter, Server-Einstellungen, Schutz-Kopfzeilen)',
    description: 'Alarm-Quelle: Job server (täglich) war rot — nur ein Lauf MIT dem täglichen Teil nimmt das Label weg',
  }),
  Object.freeze({
    key: 'kundendomains',
    label: 'alarm:kundendomains',
    text: 'Kundendomains (alle 30 min: Zertifikat, Erreichbarkeit — im Protokoll nur als Nummer)',
    description: 'Alarm-Quelle: Job kundendomains (alle 30 min) war rot und ist seither nicht grün gesehen',
  }),
])

/** „Weiterhin rot" höchstens alle 12 Stunden, nicht alle 30 Minuten. */
export const REMINDER_SECONDS = 12 * 60 * 60

const byKey = key => SOURCES.find(source => source.key === key)

/** Die Sätze zu einer Liste von Quellen, wie sie in Titel und Mail stehen. */
export function sourceText(keys) {
  return keys.map(key => byKey(key).text).join(' ')
}

/**
 * Die Entscheidung. Rein: Ergebnisse und Stand des Issues hinein, Plan heraus.
 *
 * @param {{
 *   results: Record<string, string | undefined>,
 *   open: null | { number: number, labels: string[], updatedAt: string },
 *   now: number,
 * }} input `results` je Quelle das Ergebnis des Jobs; `now` in Millisekunden
 */
export function planAlarm({ results, open, now }) {
  const keys = SOURCES.map(source => source.key)
  const red = keys.filter(key => results[key] === 'failure')
  const green = keys.filter(key => results[key] === 'success')
  const base = {
    red,
    gruen: red.length === 0,
    wechsel: 'keiner',
    addLabels: [],
    removeLabels: [],
    rest: [],
    neu: [],
    erholt: [],
    ungeprueft: [],
    reminder: false,
    ageSeconds: 0,
  }
  const labelsOf = list => list.map(key => byKey(key).label)

  if (!open) {
    if (red.length === 0) return { ...base, action: 'none' }
    return { ...base, action: 'open', wechsel: 'alarm', addLabels: labelsOf(red), rest: red, neu: red }
  }

  const known = keys.filter(key => open.labels.includes(byKey(key).label))
  const rest = keys.filter(key => (known.includes(key) || red.includes(key)) && !green.includes(key))
  const neu = red.filter(key => !known.includes(key))
  const erholt = known.filter(key => green.includes(key))
  // Offen, aber in diesem Lauf nicht gemessen (der tägliche Teil im
  // Halbstunden-Takt): darüber sagt dieser Lauf nichts.
  const ungeprueft = rest.filter(key => !red.includes(key))
  const ageSeconds = Math.max(0, Math.floor((now - Date.parse(open.updatedAt)) / 1000))
  const shared = { ...base, rest, neu, erholt, ungeprueft, ageSeconds }

  if (rest.length === 0) {
    return { ...shared, action: 'close', wechsel: 'entwarnung', removeLabels: labelsOf(known) }
  }
  if (neu.length > 0 || erholt.length > 0) {
    return { ...shared, action: 'update', addLabels: labelsOf(neu), removeLabels: labelsOf(erholt) }
  }
  if (red.length > 0) {
    return { ...shared, action: 'still-red', reminder: ageSeconds >= REMINDER_SECONDS }
  }
  return { ...shared, action: 'waiting' }
}

/** Leerzeilen raus; bleibt nichts, gibt es keinen Abschnitt im Issue. */
export function findingLines(...blocks) {
  return blocks.join('\n').split('\n').map(line => line.trimEnd()).filter(line => line.trim() !== '')
}

const WAIT_HINT = 'Den täglichen Teil prüft nur der Tageslauf (04:17 UTC) oder ein Lauf von Hand: `gh workflow run production-watch.yml`.'

/** `2026-11-19 09:12 UTC` */
export function stamp(now) {
  return `${new Date(now).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

/** Titel und Text eines neuen Issues. Rein. */
export function composeIssue({ red, drill, findings, runUrl, now }) {
  const rot = sourceText(red)
  const lines = [
    `Der Produktions-Wächter ist ROT. Betroffen: **${rot}**.`,
    '',
    `- Lauf: ${runUrl}`,
    '- Was zuerst tun: `docs/runbooks/PRODUKTIONS-ALARM.md`, Abschnitt „Wenn ein Alarm kommt" (Appwrite-Zertifikat, ok:false, Mail-Missbrauch).',
    '- Dieses Issue schließt der Wächter SELBST, sobald jede Quelle mit einem Label `alarm:…` in einem Lauf geprüft UND grün war. Solange es offen ist, ist der Alarm aktiv.',
    `- Der Halbstunden-Lauf prüft den täglichen Teil nicht und lässt \`alarm:server\` stehen. ${WAIT_HINT}`,
  ]
  if (drill) {
    lines.push('- **PROBEALARM**: absichtlich ausgelöst über einen Probe-Schalter. Aufräumen: ein Lauf von Hand ohne Schalter (`gh workflow run production-watch.yml`) — er prüft alle Quellen.')
  }
  if (findings.length > 0) {
    lines.push('', '**Was zu tun ist** (je Befund ein Satz; Blicke ohne eigenen Satz stehen im Lauf):', '', ...findings.map(line => `- ${line}`))
  }
  lines.push('', '_Erzeugt vom Job `alarm` in `.github/workflows/production-watch.yml` (MON1), Regel in `scripts/ops/alarm-issue.mjs`._')
  return {
    title: `🔴 Produktions-Alarm${drill ? ' (Probealarm)' : ''}: ${rot} — ${stamp(now)}`,
    body: lines.join('\n'),
  }
}

/** Der Kommentar, wenn sich am offenen Issue eine Quelle ändert. Rein. */
export function composeUpdate({ plan, findings, runUrl, now }) {
  const lines = [`Stand ${stamp(now)} — Lauf: ${runUrl}`, '']
  if (plan.neu.length > 0) lines.push(`- 🔴 Rot in diesem Lauf, jetzt am Issue vermerkt: ${sourceText(plan.neu)}`)
  if (plan.erholt.length > 0) lines.push(`- ✅ Wieder grün: ${sourceText(plan.erholt)}`)
  lines.push(`- Offen bleibt: ${sourceText(plan.rest)}`)
  if (plan.ungeprueft.includes('server')) lines.push(`- ${WAIT_HINT}`)
  if (plan.neu.length > 0 && findings.length > 0) lines.push('', ...findings.map(line => `- ${line}`))
  return lines.join('\n')
}

/**
 * Führt den Plan aus. `gh(args, input?)` liefert die Standard-Ausgabe und
 * wirft bei einem Fehler; `output(zeile)` schreibt einen Job-Ausgang.
 *
 * @param {{
 *   env: Record<string, string | undefined>,
 *   gh: (args: string[], input?: string) => string,
 *   now: number,
 *   log: (line: string) => void,
 *   output: (line: string) => void,
 * }} deps
 */
export function runAlarm({ env, gh, now, log, output }) {
  const label = env.LABEL || 'produktions-alarm'
  const runUrl = env.RUN_URL || ''
  const drill = env.DRILL === '1'
  const results = { tls: env.TLS_RESULT, server: env.SERVER_RESULT, kundendomains: env.KUNDEN_RESULT }
  const findings = findingLines(env.BEFUNDE_TLS || '', env.BEFUNDE_SERVER || '', env.BEFUNDE_KUNDEN || '')

  // Label einmalig sicherstellen (--force: vorhandenes nur aktualisieren).
  gh(['label', 'create', label, '--color', 'B60205', '--force', '--description', 'Produktions-Wächter rot — offen = Alarm aktiv, zu = Entwarnung'])

  const list = JSON.parse(gh(['issue', 'list', '--label', label, '--state', 'open', '--limit', '1', '--json', 'number,updatedAt,labels']) || '[]')
  const first = Array.isArray(list) && list.length > 0 ? list[0] : null
  const open = first
    ? { number: Number(first.number), updatedAt: String(first.updatedAt), labels: (first.labels || []).map(entry => String(entry.name)) }
    : null
  // STRENG: eine Antwort, die kein Issue beschreibt, ist ein kaputter
  // Alarmweg und kein „nichts offen" (der erste Probealarm starb an `null`).
  if (open && (!Number.isInteger(open.number) || Number.isNaN(Date.parse(open.updatedAt)))) {
    throw new Error('gh issue list: Antwort ohne Nummer oder Datum')
  }

  const plan = planAlarm({ results, open, now })
  log(`tls=${results.tls ?? ''} server=${results.server ?? ''} kundendomains=${results.kundendomains ?? ''} rot='${plan.red.join(' ')}' offen='${open ? `#${open.number} ${open.labels.filter(name => name.startsWith('alarm:')).join(' ')}` : ''}' drill=${drill ? 1 : 0} plan=${plan.action}`)

  // Quellen-Labels nur anlegen, wenn dieser Lauf eines setzt.
  for (const name of plan.addLabels) {
    const source = SOURCES.find(entry => entry.label === name)
    gh(['label', 'create', name, '--color', 'D93F0B', '--force', '--description', source.description])
  }

  if (plan.action === 'open') {
    const issue = composeIssue({ red: plan.red, drill, findings, runUrl, now })
    // ZUWEISEN statt nur öffnen (MON2, 2026-11-08): ein Bot-Issue erreicht
    // den Besitzer nur über „Watching" — und das lieferte KEINE Mail. Eine
    // Zuweisung ist „Participating" und kommt als Mail an.
    const args = ['issue', 'create', '--title', issue.title, '--label', [label, ...plan.addLabels].join(','), '--body-file', '-']
    if (env.ALARM_ASSIGNEE) args.push('--assignee', env.ALARM_ASSIGNEE)
    const url = gh(args, issue.body).trim()
    log(`Issue geöffnet: ${url}`)
  }
  else if (plan.action === 'close') {
    gh(['issue', 'comment', String(open.number), '--body-file', '-'], `✅ Entwarnung (${stamp(now)}): jede Quelle dieses Alarms war in einem Lauf wieder grün. Lauf: ${runUrl}`)
    gh(['issue', 'close', String(open.number), '--reason', 'completed'])
    // Nach dem Schließen: ein geschlossenes Issue trägt kein „noch rot".
    if (plan.removeLabels.length > 0) gh(['issue', 'edit', String(open.number), '--remove-label', plan.removeLabels.join(',')])
    log(`Issue #${open.number} geschlossen (Entwarnung).`)
  }
  else if (plan.action === 'update') {
    const args = ['issue', 'edit', String(open.number)]
    if (plan.addLabels.length > 0) args.push('--add-label', plan.addLabels.join(','))
    if (plan.removeLabels.length > 0) args.push('--remove-label', plan.removeLabels.join(','))
    gh(args)
    gh(['issue', 'comment', String(open.number), '--body-file', '-'], composeUpdate({ plan, findings, runUrl, now }))
    log(`Issue #${open.number} bleibt offen: neu rot '${plan.neu.join(' ')}', wieder grün '${plan.erholt.join(' ')}', offen '${plan.rest.join(' ')}'.`)
  }
  else if (plan.action === 'still-red') {
    if (plan.reminder) {
      const lines = [`Weiterhin rot (${stamp(now)}): ${sourceText(plan.red)}. Lauf: ${runUrl}`]
      if (findings.length > 0) lines.push('', ...findings.map(line => `- ${line}`))
      gh(['issue', 'comment', String(open.number), '--body-file', '-'], lines.join('\n'))
      log(`Issue #${open.number}: weiterhin rot, Kommentar gesetzt (zuletzt vor ${Math.floor(plan.ageSeconds / 3600)} h).`)
    }
    else {
      log(`Issue #${open.number} ist offen (zuletzt vor ${Math.floor(plan.ageSeconds / 60)} min) — nichts zu tun.`)
    }
  }
  else if (plan.action === 'waiting') {
    log(`Issue #${open.number} bleibt offen: '${plan.ungeprueft.join(' ')}' ist in diesem Lauf nicht geprüft worden — keine Entwarnung. Schließen kann nur ein Lauf, der diese Quelle grün sieht.`)
  }
  else {
    log('Alles grün, kein offenes Alarm-Issue.')
  }

  // Die Folge-Schritte prüfen EXPLIZIT auf diese Werte: fehlen sie (Skript
  // abgebrochen), läuft weder Mail noch Heartbeat.
  output(`wechsel=${plan.wechsel}`)
  output(`rot=${sourceText(plan.red)}`)
  output(`gruen=${plan.gruen ? 1 : 0}`)
  return plan
}

function main() {
  const outputFile = process.env.GITHUB_OUTPUT
  runAlarm({
    env: process.env,
    gh: (args, input) => execFileSync('gh', args, {
      encoding: 'utf8',
      input: input ?? '',
      stdio: ['pipe', 'pipe', 'inherit'],
    }),
    now: Date.now(),
    log: line => console.log(line),
    output: (line) => {
      if (outputFile) appendFileSync(outputFile, `${line}\n`)
      else console.log(`[Ausgang] ${line}`)
    },
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main()
  }
  catch (error) {
    // Nur die Art des Fehlers: `gh` schreibt seine eigene Meldung schon auf
    // die Fehler-Ausgabe, und die Befehlszeile enthielte den Issue-Text.
    console.error(`::error::Alarmweg gescheitert (${error?.code ?? error?.status ?? error?.name ?? 'Fehler'}) — weder Mail noch Heartbeat laufen.`)
    process.exit(1)
  }
}
