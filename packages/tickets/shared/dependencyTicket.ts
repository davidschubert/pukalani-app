import type { DependencyTicketInput } from '../../core/shared/dependencyTicket'

/**
 * Der TEXT eines Update-Prüf-Tickets — pur, ohne node/h3, damit ihn ein Test
 * ohne Server aufschlagen kann.
 *
 * Die Gestalt der Frage (welches Paket, von wo nach wo) kommt aus dem
 * core-Vertrag `shared/dependencyTicket.ts`; was daraus für ein Ticket wird,
 * gehört diesem Layer. Kein `##`-Heading in der Beschreibung: der
 * Core-Markdown-Sink (MarkdownContent) rendert Headings nicht — fett gesetzte
 * Zeilen und Listen sind die einzige Struktur, die beim Leser ankommt.
 */

export type { DependencyTicketInput }

/** Anzeigename: der Appwrite-SERVER ist kein npm-Paket und heißt auch nicht so. */
function displayName(input: DependencyTicketInput): string {
  return input.kind === 'appwrite' ? 'Appwrite-Server' : input.name
}

/**
 * Der Dedup-Schlüssel. `dep:` als Präfix, damit er sich von einer Feedback-Row-Id
 * unterscheidet — beide leben in derselben Spalte `feedbackId` (Begründung in
 * server/utils/ticketIngest.ts). Die ZIEL-Version steckt drin: eine Version
 * später ist es eine neue Frage und darf ein neues Ticket geben.
 */
export function dependencyTicketKey(input: DependencyTicketInput): string {
  return `dep:${input.name}@${input.to}`
}

export function dependencyTicketTitle(input: DependencyTicketInput): string {
  return `Update prüfen: ${displayName(input)} ${input.from} → ${input.to}`
}

/** Die Fragen, die bei JEDEM Update dieselben sind. */
const QUESTIONS = [
  'Können wir updaten — welche Vor- und Nachteile bringt es?',
  'Was steht im Changelog an Breaking Changes — ist das ein kleines Update oder komplex und mit Vorsicht zu fahren?',
  'Machen wir uns etwas kaputt (bekannte Fallen, Verhalten, das still kippt)?',
  'Müssen gekoppelte Pakete mitziehen?',
]

/**
 * Die Fallen je Art. Sie stehen als TEXT im Ticket, nicht als Link: wer die
 * Karte in drei Monaten aufschlägt, soll die Kopplung lesen können, ohne zu
 * wissen, in welchem Absatz von CLAUDE.md sie steht.
 */
const PACKAGE_PITFALLS = [
  '`@nuxtjs/i18n` gehört zur Nuxt-Generation und wird nur ZUSAMMEN mit Nuxt gebumpt (10.4↔4.4, 10.6↔4.5) — sonst stehen unhead, vue-router und pinia doppelt im Baum.',
  '`pinia` und `@pinia/nuxt` nur paarweise (0.11.x↔pinia 3, 1.0.x↔pinia 4).',
  'Ein-Versions-Regel: `pnpm check:single-copy` muss grün bleiben — zwei Kopien einer Kernabhängigkeit brechen Typen oder Build, und welche gewinnt, entscheidet das Hoisting, nicht das Lockfile.',
  'Eine Caret-Range pinnt nichts (`^4.4.8` erlaubt 4.5.1) — die echte Version nach dem Bump beweisen: `node -p "require(\'./apps/<app>/node_modules/<pkg>/package.json\').version"`.',
  'Nach dem Bump `git diff --stat pnpm-lock.yaml` lesen: steht dort viel mehr als erwartet, gehört es nicht so in den Commit.',
]

const APPWRITE_PITFALLS = [
  'BEIDE Instanzen aktualisieren (dev + prod), je über ihre Compose-Datei.',
  'Den SMTP-KeepAlive-Patch danach erneuern — die gemountete `registers.php` (keepAlive:false) wird vom Update überschrieben, sonst geht die erste Mail nach einer Leerlaufphase still verloren.',
  'Den Container `appwrite-realtime` prüfen: nach einem Update oder einem Swoole-Crash steht sonst jede Realtime still (`docker compose up -d --no-deps appwrite-realtime`).',
  'Release-Notes auf Migrations- und Breaking-Hinweise durchsehen (Schema, Permissions, SDK-Gegenstücke).',
  'Als Healthcheck NIEMALS `doctor` (schickt pro Lauf eine Test-Mail über SMTP), sondern `/v1/health/version`.',
]

export function dependencyTicketDescription(input: DependencyTicketInput): string {
  const pitfalls = input.kind === 'appwrite' ? APPWRITE_PITFALLS : PACKAGE_PITFALLS
  const closing = input.kind === 'appwrite'
    ? 'Update = geplantes Wartungsfenster mit Backup, nie nebenbei am laufenden System.'
    : 'Update = Catalog-Bump in `pnpm-workspace.yaml` + volle CI (Test/Lint/Typecheck/E2E), NIE am laufenden System.'

  return [
    `**${displayName(input)}** steht auf ${input.from}, aktuell wäre ${input.to}. Bitte prüfen, bevor wir das anfassen.`,
    '',
    ...QUESTIONS.map(question => `- ${question}`),
    '',
    '**Bekannte Kopplungen/Fallen**',
    '',
    ...pitfalls.map(pitfall => `- ${pitfall}`),
    '',
    closing,
  ].join('\n')
}
