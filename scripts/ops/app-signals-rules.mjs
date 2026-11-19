/**
 * Regeln des Blicks „In die App hinein" (OPS-011, 2026-11-16) — pur, ohne
 * Netz, damit sie sich prüfen lassen. Gelesen wird die Ausgabe von
 * `ops/app-watch-counts.mjs` (läuft auf dem App-Server und gibt nur Zahlen
 * aus); gerechnet wird HIER, im Repo: jede Schwelle steht an genau einer
 * Stelle, und eine Änderung daran ist ein Pull Request.
 *
 * DER MASSSTAB: ein Alarm, dem man glaubt. Der TLS-Wächter war im Oktober
 * 2026 rund 900 Läufe lang rot, und niemand hat es gesehen — ein Blick, der
 * zu oft rot ist, wird überlesen. Deshalb:
 *   · Rot wird nur, was EINDEUTIG ist und wofür es einen Handgriff gibt.
 *   · Jede Schwelle kommt aus einer Messung (Stand 2026-11-16, s. u.).
 *   · Was noch keine Messung hat, wird gezählt und berichtet, aber nicht rot
 *     („zählt nur") — bis die Zahlen einer Woche vorliegen.
 *   · Jeder rote Befund ist EIN Satz, der sagt, was zu tun ist, und nennt den
 *     Abschnitt im Runbook. Diese Sätze stehen im Alarm-Issue.
 *
 * GEMESSEN am 2026-11-16 auf dem App-Server:
 *   · `server.error` auf platform (dort seit Juli an): 0 Zeilen an 16 Tagen im
 *     November; beim Ausfall im Oktober im Schnitt über 2.000 am Tag. Scanner
 *     erzeugen im gesunden Betrieb keine Zeile (sie bekommen 404, und 4xx wird
 *     nicht geschrieben).
 *   · Gescheiterte Zeit-Läufe und KI-Ausfälle an einem normalen Tag: 0.
 *   · Für die fünf anderen Apps gibt es noch keine Zahlen — das Protokoll ist
 *     dort erst seit dem 2026-11-16 an.
 */

/** Muss zu `VERSION` in ops/app-watch-counts.mjs passen (ein Test hält beide zusammen). */
export const COUNTS_VERSION = 1

/** Fenster, über das der Server zählt (der tägliche Lauf kommt alle 24 h; eine Stunde Luft für Verspätung). */
export const WINDOW_HOURS = 25

export const RULES = {
  /**
   * ÜBERFÄLLIG: kein guter Lauf seit mehr als zwei Takten plus dieser Luft.
   * Zwei Takte, weil ein einzelner gescheiterter oder ausgefallener Takt sich
   * von selbst heilt (der nächste kommt immer); die Luft deckt die erste
   * Verzögerung nach einem Neustart (höchstens 6 Minuten) und den Lauf selbst.
   */
  overdueTakte: 2,
  overdueGraceMin: 30,
  /**
   * Ein Lauf mit einem Takt ab 12 Stunden (heute: die vier Tages-Läufe) ist
   * schon rot, wenn sein LETZTER Lauf gescheitert ist — bis „zwei Takte" wären
   * es dort zwei Tage.
   */
  slowJobFromMin: 720,
  /**
   * Ein erwarteter Lauf fehlt ganz: rot erst, wenn der Prozess länger läuft
   * als die späteste erste Verzögerung (6 Minuten) plus Luft. Davor hat er
   * sich womöglich noch nicht gemeldet.
   */
  missingAfterUpMin: 20,
  /**
   * SERVER-FEHLER (5xx) je App in 25 Stunden. Eine Zahl = scharf. `null` =
   * zählt nur (noch keine Messung). platform: Normaltag 0, Ausfall > 2.000 —
   * 25 liegt sicher dazwischen und lässt einem einzelnen Stolperer Raum.
   * SCHARF STELLEN: nach einer Woche die berichteten Zahlen ansehen
   * (Runbook, „Fehler in der App"), dann hier eine Zahl eintragen.
   */
  serverErrors: {
    platform: 25,
    control: null,
    branding: null,
    portfolio: null,
    marketing: null,
    help: null,
  },
  /**
   * BROWSER-FEHLER: zählt nur, überall. Die Annahme ist öffentlich; was dort
   * ankommt, ist zu einem unbekannten Teil Rauschen (Erweiterungen, alte
   * Browser, Bots). Ohne Messung keine Schwelle.
   */
  browserErrors: null,
  /**
   * KI: Status 402 („kein Guthaben" oder Limit des Schlüssels erreicht) und
   * 404 („kein Endpunkt unter unserer Bindung") heißen beide: JEDER Aufruf
   * dieser Art scheitert, bis jemand handelt. Ab dem ersten Vorkommen rot.
   * Alle übrigen Ausfälle (Zeitüberschreitung, 5xx des Anbieters, 429) kommen
   * und gehen — sie zählen nur.
   */
  aiNoCredit: 1,
  aiNoEndpoint: 1,
  aiOtherFailures: null,
  /**
   * BETREIBER-PROTOKOLL (BE-021, 2026-11-16): gescheiterte Einträge in
   * `audit_logs` (`audit.write_failed`). An einem normalen Tag 0. Ein
   * einzelner Wackler (Netz, Neustart von Appwrite) heilt sich von selbst;
   * ein DAUERHAFTER Ausfall — eine fehlende Spalte, ein Schlüssel ohne Recht —
   * erzeugt bei JEDER Betreiber-Aktion und jeder Anmeldung eine Zeile und
   * liegt damit schnell darüber. Ab 3 in 25 Stunden rot, darunter berichtet.
   */
  auditWriteFailures: 3,
}

const WORD = {
  status: '(online|stopping|stopped|launching|errored|unbekannt|fehlt)',
  result: '(ok|failed|skipped|nie)',
  job: '[a-z][a-z0-9-]{1,39}',
  age: '(\\d{1,9}|nie)',
}

/**
 * Die feste Form jeder Zeile des Zähl-Skripts. Was nicht passt, kommt weder
 * in die Rechnung noch ins (öffentliche) Protokoll.
 */
export const LINE_FORMS = {
  head: new RegExp(`^zaehler version=(\\d{1,4}) prozess=([a-z0-9]{3,40}) stunden=(\\d{1,3}) status=${WORD.status}$`),
  process: /^prozess speicher_mb=(\d{1,7}) neustarts=(\d{1,9}) laeuft_min=(\d{1,9})$/,
  errors: /^fehler server=(\d{1,9}) browser=(\d{1,9}) browser_gedeckelt=(\d{1,9})$/,
  ai: /^ki ausfaelle=(\d{1,9}) ohne_guthaben=(\d{1,9}) kein_endpunkt=(\d{1,9}) abgeschaltet=(\d{1,9})$/,
  job: new RegExp(`^lauf name=(${WORD.job}) takt_min=(\\d{1,6}) ok=(\\d{1,9}) gescheitert=(\\d{1,9}) uebersprungen=(\\d{1,9}) haengt=(\\d{1,9}) letzter_ok_min=${WORD.age} letzter_lauf_min=${WORD.age} letztes_ergebnis=${WORD.result} angemeldet_min=${WORD.age}$`),
  end: /^ende laeufe=(\d{1,3})$/,
  /** Seit BE-021 — OPTIONAL: ein Server mit dem älteren Skript schreibt sie nicht. */
  audit: /^protokoll ausfaelle=(\d{1,9})$/,
  csp: /^skriptregel berichte=(\d{1,9}) gedeckelt=(\d{1,9})$/,
  /** Seit WA1 e (2026-11-18) — OPTIONAL wie `audit`; gelesen vom Mail-Blick. */
  mailBreaker: new RegExp(`^mailbremse ausgeloest=(\\d{1,9}) letzte_min=${WORD.age}$`),
  /** Seit SE1 d (2026-11-19) — OPTIONAL wie `audit`: der Erinnerungs-Lauf im Pool. */
  reminders: /^erinnerungen takte=(\d{1,9}) ohne_antwort=(\d{1,9}) termine=(\d{1,9}) empfaenger=(\d{1,9})$/,
}

const age = value => (value === 'nie' ? null : Number(value))

/**
 * Liest die Ausgabe des Zähl-Skripts. `problem` ist gesetzt, wenn sie nicht
 * vollständig in der festen Form kam — dann gibt es keine Zahlen, nur den
 * Grund (ein Wort aus einer festen Liste).
 */
export function parseCounts(text) {
  const lines = String(text ?? '').split('\n').map(line => line.trimEnd()).filter(Boolean)
  const head = lines[0]?.match(LINE_FORMS.head)
  if (!head) return { problem: 'unlesbar' }
  const counts = {
    version: Number(head[1]),
    process: head[2],
    hours: Number(head[3]),
    status: head[4],
    jobs: new Map(),
  }
  if (counts.status === 'fehlt' || counts.status === 'unbekannt') return { ...counts, problem: counts.status === 'fehlt' ? 'prozess-fehlt' : 'pm2-antwortet-nicht' }
  if (counts.version !== COUNTS_VERSION) return { ...counts, problem: 'version' }

  let ended = null
  for (const line of lines.slice(1)) {
    let hit
    if ((hit = line.match(LINE_FORMS.process))) {
      Object.assign(counts, { memoryMb: Number(hit[1]), restarts: Number(hit[2]), upMin: Number(hit[3]) })
    }
    else if ((hit = line.match(LINE_FORMS.errors))) {
      Object.assign(counts, { server: Number(hit[1]), browser: Number(hit[2]), browserCapped: Number(hit[3]) })
    }
    else if ((hit = line.match(LINE_FORMS.ai))) {
      Object.assign(counts, { ai: Number(hit[1]), aiNoCredit: Number(hit[2]), aiNoEndpoint: Number(hit[3]), aiDisabled: Number(hit[4]) })
    }
    else if ((hit = line.match(LINE_FORMS.job))) {
      counts.jobs.set(hit[1], {
        everyMin: Number(hit[2]),
        ok: Number(hit[3]),
        failed: Number(hit[4]),
        skipped: Number(hit[5]),
        overlap: Number(hit[6]),
        lastOkMin: age(hit[7]),
        lastRunMin: age(hit[8]),
        lastResult: hit[9],
        registeredMin: age(hit[10]),
      })
    }
    else if ((hit = line.match(LINE_FORMS.audit))) {
      counts.auditFailed = Number(hit[1])
    }
    else if ((hit = line.match(LINE_FORMS.csp))) {
      Object.assign(counts, { cspReports: Number(hit[1]), cspCapped: Number(hit[2]) })
    }
    else if ((hit = line.match(LINE_FORMS.mailBreaker))) {
      Object.assign(counts, { mailBreaker: Number(hit[1]), mailBreakerLastMin: age(hit[2]) })
    }
    else if ((hit = line.match(LINE_FORMS.reminders))) {
      Object.assign(counts, { reminderRuns: Number(hit[1]), reminderNoAnswer: Number(hit[2]), reminderEvents: Number(hit[3]), reminderRecipients: Number(hit[4]) })
    }
    else if ((hit = line.match(LINE_FORMS.end))) {
      ended = Number(hit[1])
    }
    else {
      return { ...counts, problem: 'unlesbar' }
    }
  }
  // `protokoll` ist BEWUSST nicht in der Pflichtliste unten: nach dem Merge
  // gilt diese Auswertung sofort (der Wächter läuft aus `main`), das neue
  // Skript kommt erst mit dem nächsten Ausliefern auf den Server. Fehlt die
  // Zeile, bleibt `auditFailed` undefiniert und die Regel berichtet „nicht
  // gezählt" statt rot zu werden.
  // Ohne Schlusszeile ist die Ausgabe abgeschnitten — dann lieber keine Zahlen
  // als halbe.
  if (ended === null || ended !== counts.jobs.size) return { ...counts, problem: 'abgeschnitten' }
  for (const key of ['memoryMb', 'server', 'ai']) {
    if (counts[key] === undefined) return { ...counts, problem: 'abgeschnitten' }
  }
  return counts
}

/** In `ops/timed-jobs.conf` statt einer App: der Lauf fährt bewusst in keiner ausgerollten App. */
export const NOWHERE = 'nirgends'

/** `ops/timed-jobs.conf`: je Zeile `<app> <kennung>`; `#` beginnt einen Kommentar. */
export function parseExpectedJobs(text) {
  const expected = new Map()
  const problems = []
  for (const [index, raw] of String(text ?? '').split('\n').entries()) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const hit = line.match(/^([a-z][a-z0-9-]{1,30})\s+([a-z][a-z0-9-]{1,39})$/)
    if (!hit) {
      problems.push(index + 1)
      continue
    }
    if (!expected.has(hit[1])) expected.set(hit[1], new Set())
    expected.get(hit[1]).add(hit[2])
  }
  return { expected, problems }
}

const RUNBOOK = 'docs/runbooks/PRODUKTIONS-ALARM.md'

const PROBLEM_TEXT = {
  'unlesbar': 'die Antwort des Zähl-Skripts kam nicht in der festen Form',
  'abgeschnitten': 'die Antwort des Zähl-Skripts ist unvollständig',
  'prozess-fehlt': 'pm2 kennt den Prozess nicht',
  'pm2-antwortet-nicht': 'pm2 antwortet auf dem Server nicht',
  'version': 'das Zähl-Skript auf dem Server hat eine andere Version als die Auswertung (nach dem nächsten Ausliefern stimmt sie wieder)',
  'nicht-erreichbar': 'das Zähl-Skript war über ssh nicht erreichbar',
}

/**
 * Die Regeln für EINE App. `red` = Befunde (je ein Satz mit Handgriff und
 * Runbook-Abschnitt), `notes` = was nur gezählt wird.
 */
export function evaluateApp({ app, site, counts, expected = new Set(), rules = RULES }) {
  const red = []
  const notes = []
  const where = `${site}:`

  if (counts.problem) {
    red.push(`${where} keine Zahlen — ${PROBLEM_TEXT[counts.problem] ?? counts.problem}. Tun: den Schritt von Hand noch einmal laufen lassen; bleibt es so, auf dem Server \`pm2 ls\` ansehen. (${RUNBOOK}, „In die App hinein — keine Zahlen")`)
    return { red, notes }
  }

  if (counts.status !== 'online') {
    red.push(`${where} der Prozess läuft nicht (Zustand ${counts.status}). Tun: auf dem Server \`pm2 ls\` ansehen, die App über ihre Ecosystem-Datei neu laden. (${RUNBOOK}, „In die App hinein — keine Zahlen")`)
  }

  // ── Zeit-Läufe ────────────────────────────────────────────────────────
  for (const name of [...expected].sort()) {
    const job = counts.jobs.get(name)
    if (!job) {
      if (counts.upMin >= rules.missingAfterUpMin) {
        red.push(`${where} der Zeit-Lauf „${name}" hat sich nie gemeldet. Tun: prüfen, ob sein Tor in dieser App noch offen ist (Env-Variable, Schalter); läuft er hier bewusst nicht mehr, die Zeile aus ops/timed-jobs.conf nehmen. (${RUNBOOK}, „Zeit-Lauf überfällig oder gescheitert")`)
      }
      else {
        notes.push(`${where} „${name}" hat sich noch nicht gemeldet (Prozess läuft erst ${counts.upMin} min)`)
      }
      continue
    }
    const limit = rules.overdueTakte * job.everyMin + rules.overdueGraceMin
    // Vor dem ersten Lauf zählt die Anmeldung als Beginn der Frist.
    const since = job.lastOkMin ?? job.registeredMin
    if (since === null || since > limit) {
      const seit = job.lastOkMin === null ? 'noch nie einen guten Lauf' : `seit ${job.lastOkMin} Minuten keinen guten Lauf`
      const haengt = job.overlap > 0 ? ` Der Lauf hängt (${job.overlap} Takte fielen aus, weil der vorige noch lief).` : ''
      red.push(`${where} der Zeit-Lauf „${name}" hatte ${seit} (Takt ${job.everyMin} min, erlaubt ${limit}).${haengt} Tun: im Fehler-Log der App die Zeile \`job.run\` mit diesem Namen lesen. (${RUNBOOK}, „Zeit-Lauf überfällig oder gescheitert")`)
    }
    else if (job.everyMin >= rules.slowJobFromMin && job.lastResult === 'failed') {
      red.push(`${where} der Zeit-Lauf „${name}" ist zuletzt gescheitert (er läuft nur alle ${Math.round(job.everyMin / 60)} Stunden). Tun: im Fehler-Log der App die Zeile \`job.run\` mit diesem Namen lesen; der Lauf lässt sich von Hand anstoßen. (${RUNBOOK}, „Zeit-Lauf überfällig oder gescheitert")`)
    }
    else if (job.failed > 0) {
      const stand = job.lastResult === 'failed' ? 'zuletzt gescheitert, noch in der Frist' : 'zuletzt wieder gut'
      notes.push(`${where} „${name}" ${job.failed}× gescheitert in ${counts.hours} h, ${stand}`)
    }
  }
  for (const name of [...counts.jobs.keys()].sort()) {
    if (!expected.has(name)) notes.push(`${where} „${name}" läuft, steht aber nicht in ops/timed-jobs.conf (dort eintragen, sonst fällt sein Ausfall nicht auf)`)
  }

  // ── Fehler in der App ─────────────────────────────────────────────────
  const serverLimit = rules.serverErrors[app] ?? null
  if (serverLimit !== null && counts.server >= serverLimit) {
    red.push(`${where} ${counts.server} Server-Fehler (5xx) in ${counts.hours} Stunden, Schwelle ${serverLimit}. Tun: im Fehler-Log der App die Zeilen \`server.error\` lesen (Pfad und Status stehen dabei) — häuft sich ein Pfad, ist es eine Route; sind es alle, die Datenbank. (${RUNBOOK}, „Fehler in der App")`)
  }
  else if (counts.server > 0) {
    notes.push(`${where} ${counts.server} Server-Fehler (5xx) in ${counts.hours} h${serverLimit === null ? ' — zählt nur' : `, Schwelle ${serverLimit}`}`)
  }
  if (counts.browser > 0 || counts.browserCapped > 0) {
    notes.push(`${where} ${counts.browser} Fehler aus dem Browser in ${counts.hours} h${counts.browserCapped > 0 ? `, der Deckel hat ${counts.browserCapped}× gegriffen` : ''} — zählt nur`)
  }

  // ── KI ────────────────────────────────────────────────────────────────
  if (counts.aiNoCredit >= rules.aiNoCredit) {
    red.push(`${where} ${counts.aiNoCredit} KI-Aufruf(e) mit Status 402 abgelehnt — kein Guthaben oder das Limit des Schlüssels ist erreicht; jeder weitere Aufruf scheitert. Tun: bei OpenRouter Guthaben und Limit des Schlüssels ansehen und aufladen oder anheben. (${RUNBOOK}, „KI fällt aus")`)
  }
  if (counts.aiNoEndpoint >= rules.aiNoEndpoint) {
    red.push(`${where} ${counts.aiNoEndpoint} KI-Aufruf(e) mit Status 404 abgelehnt — ein Modell hat unter unseren Bedingungen keinen Endpunkt mehr. Tun: \`pnpm ops:ai-models\` zeigt, welches. (${RUNBOOK}, „KI fällt aus")`)
  }
  const aiOther = counts.ai - counts.aiNoCredit - counts.aiNoEndpoint
  if (aiOther > 0) notes.push(`${where} ${aiOther} weitere KI-Ausfälle in ${counts.hours} h — zählt nur`)
  if (counts.aiDisabled > 0) notes.push(`${where} der KI-Abschalter hat ${counts.aiDisabled} Aufruf(e) verhindert`)

  // ── Betreiber-Protokoll ───────────────────────────────────────────────
  if (counts.auditFailed === undefined) {
    notes.push(`${where} Betreiber-Protokoll nicht gezählt (das Zähl-Skript auf dem Server ist älter; nach dem nächsten Ausliefern kommt die Zahl)`)
  }
  else if (counts.auditFailed >= rules.auditWriteFailures) {
    red.push(`${where} ${counts.auditFailed} Einträge ins Betreiber-Protokoll gescheitert in ${counts.hours} Stunden, Schwelle ${rules.auditWriteFailures} — Herausgaben (Export, CSV, Lösch-Kopien) werden dabei abgelehnt. Tun: im Fehler-Log der App die Zeilen \`audit.write_failed\` lesen (Status und \`type\` stehen dabei). (${RUNBOOK}, „Betreiber-Protokoll fällt aus")`)
  }
  else if (counts.auditFailed > 0) {
    notes.push(`${where} ${counts.auditFailed} Eintrag/Einträge ins Betreiber-Protokoll gescheitert in ${counts.hours} h, Schwelle ${rules.auditWriteFailures}`)
  }

  // ── Berichte der Skript-Regel (SE1 a) ─────────────────────────────────
  // Zählt nur: die Regel beobachtet. Eine Zeile `csp.report` je VERSCHIEDENEM
  // Verstoß und Stunde — ohne die Zeile ist das Zähl-Skript auf dem Server
  // älter, dann steht in der Übersicht „nicht gezählt".
  if (counts.cspReports > 0 || counts.cspCapped > 0) {
    notes.push(`${where} ${counts.cspReports} Bericht(e) der Skript-Regel in ${counts.hours} h${counts.cspCapped > 0 ? `, der Deckel hat ${counts.cspCapped}× gegriffen` : ''} — zählt nur; welche Quelle auf welcher Seite, steht im Fehler-Log der App in den Zeilen \`csp.report\``)
  }

  // ── Erinnerungen an nicht erreichbare Communities (SE1 d) ─────────────
  // Zählt nur, nie rot: Stufe 1 erinnert weiter und zählt, wen Stufe 2
  // ausließe. Ein Hinweis nur dort, wo der Lauf im Fenster gezählt hat (die
  // Apps ohne Pool-Erinnerungen schreiben lauter Nullen). Ohne die Zeile ist
  // das Zähl-Skript auf dem Server älter — dann steht in der Übersicht
  // „nicht gezählt", und das ist kein Fehler.
  if (counts.reminderRuns > 0) {
    notes.push(`${where} der Erinnerungs-Lauf hat in ${counts.hours} h ${counts.reminderRuns} Takt(e) gezählt: ${counts.reminderEvents} Termin(e) stillgelegter oder gesperrter Communities mit ${counts.reminderRecipients} Erinnerung(en), ${counts.reminderNoAnswer} Takt(e) ohne Antwort des Control Plane — zählt nur`)
  }

  return { red, notes }
}

/** Eine Zeile Zahlen je App fürs Protokoll (nur Zahlen und Namen aus dem Repo). */
export function summaryLine({ site, counts, expected = new Set() }) {
  if (counts.problem) return `${site.padEnd(24)} keine Zahlen (${counts.problem})`
  const good = [...expected].filter((name) => {
    const job = counts.jobs.get(name)
    return job && job.lastResult !== 'failed' && job.lastOkMin !== null
  }).length
  return `${site.padEnd(24)} ${counts.status} · ${counts.memoryMb} MB · 5xx ${counts.server} · Browser ${counts.browser} · KI-Ausfälle ${counts.ai} · Protokoll-Ausfälle ${counts.auditFailed ?? 'nicht gezählt'} · Skript-Regel ${counts.cspReports ?? 'nicht gezählt'} · Erinnerungen ins Leere ${counts.reminderRecipients ?? 'nicht gezählt'} · Zeit-Läufe ${good}/${expected.size} gut`
}

/**
 * PROBEALARM: verfälscht die GELESENE Antwort einer App so, dass ihr erster
 * erwarteter Zeit-Lauf überfällig aussieht (hat sie keinen: 402 bei der KI).
 * An Production ändert das nichts — der Weg danach (Auswertung, roter Lauf,
 * Issue, Mail) ist der echte.
 */
export function drillCounts(counts, expected = new Set()) {
  const copy = { ...counts, jobs: new Map(counts.jobs) }
  delete copy.problem
  const name = [...expected].sort()[0]
  if (name) {
    copy.jobs.set(name, { everyMin: 60, ok: 0, failed: 3, skipped: 0, overlap: 0, lastOkMin: 9999, lastRunMin: 5, lastResult: 'failed', registeredMin: 9999 })
  }
  else {
    Object.assign(copy, { ai: (copy.ai ?? 0) + 1, aiNoCredit: (copy.aiNoCredit ?? 0) + 1 })
  }
  return copy
}
