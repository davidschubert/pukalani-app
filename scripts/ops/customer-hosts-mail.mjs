#!/usr/bin/env node
/**
 * Die private Mail „Betroffene Kundendomains" (WA1 d, 2026-11-18).
 *
 * Der Produktions-Wächter nennt eine Kundendomain öffentlich nur als Nummer
 * („Kundendomain 3/5" — die Protokolle der Läufe und das Alarm-Issue kann
 * jedes GitHub-Konto lesen). Geht ein Alarm NEU auf und betrifft er eine
 * Kundendomain, schickt dieses Skript die NAMEN zu den Nummern an die
 * Alarm-Adresse — der eine Ort, an dem der Name steht.
 *
 *   PUKALANI_CUSTOMER_NUMBERS=3,5 node scripts/ops/customer-hosts-mail.mjs
 *
 * Umgebung (Job `kundendomains-namen` in production-watch.yml):
 *   PUKALANI_CUSTOMER_NUMBERS    die Nummern mit Befund (`3,5`)
 *   PUKALANI_WATCH_HOSTS_SECRET  liest die Liste noch einmal (die Nummer ist
 *                                die Stelle in der sortierten Liste der Route)
 *   RESEND_API_KEY, ALARM_MAIL_TO  Versand; `ALARM_MAIL_TO` darf eine
 *                                Kommaliste sein
 *   RUN_URL                      der Lauf, zum Nachlesen
 *
 * WAS DIESES SKRIPT AUSGIBT: Zahlen und feste Sätze. Nie einen Host-Namen,
 * nie die Empfänger-Adresse, nie die rohe Antwort von Resend (sie zitiert bei
 * einem Fehler das abgelehnte Feld).
 *
 * Exit 0 = Mail raus ODER nichts zu tun ODER der Versand ist nicht
 * eingerichtet (eine Zeile dazu) · Exit 1 = die Mail sollte raus und ging
 * nicht (Liste nicht lesbar, Resend lehnt ab).
 */
import { pathToFileURL } from 'node:url'
import { parseNumbers, readCustomerHosts, UNREAD_TEXT } from './customer-hosts.mjs'

/**
 * Betreff und Text der Mail. Rein. Eine Nummer außerhalb der Liste (die Liste
 * hat sich zwischen Prüfung und Mail geändert) steht als eigene Zeile da,
 * statt still zu fehlen.
 *
 * @param {{ hosts: Array<{ host: string }>, numbers: number[], runUrl?: string }} input
 */
export function composeCustomerMail({ hosts, numbers, runUrl = '' }) {
  const lines = []
  for (const nr of numbers) {
    const entry = hosts[nr - 1]
    lines.push(entry
      ? `- ${entry.host} (Kundendomain ${nr}/${hosts.length})`
      : `- Kundendomain ${nr}: steht nicht mehr an dieser Stelle der Liste (sie hat sich seit der Prüfung geändert)`)
  }
  return {
    subject: `🔴 Produktions-Alarm: betroffene Kundendomain${numbers.length === 1 ? '' : 's'}`,
    text: [
      'Der Produktions-Wächter meldet einen Befund an:',
      '',
      ...lines,
      '',
      'Im öffentlichen Protokoll und im Alarm-Issue steht nur die Nummer.',
      'Was zu tun ist: docs/runbooks/PRODUKTIONS-ALARM.md, „Kundendomain rot".',
      ...(runUrl ? ['', `Lauf: ${runUrl}`] : []),
    ].join('\n'),
  }
}

/** Die Empfänger aus der Kommaliste — getrimmt, leere raus. */
export function recipients(raw) {
  return String(raw ?? '').split(',').map(part => part.trim()).filter(Boolean)
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetchFn?: typeof fetch, log?: (line: string) => void, retryDelayMs?: number }} [options]
 * @returns {Promise<number>} Exit-Code
 */
export async function runCustomerMail({ env = process.env, fetchFn = fetch, log = console.log, retryDelayMs = 5000 } = {}) {
  const numbers = parseNumbers(env.PUKALANI_CUSTOMER_NUMBERS)
  if (!numbers.length) {
    log('Keine Nummern mit Befund — nichts zu senden.')
    return 0
  }
  const to = recipients(env.ALARM_MAIL_TO)
  const key = (env.RESEND_API_KEY ?? '').trim()
  if (!key || !to.length) {
    log('Mail mit den Namen nicht eingerichtet (Resend-Schlüssel oder Empfänger fehlt) — die Namen zeigt von Hand `node scripts/ops/verify-tls.mjs --nur-kundendomains --namen`.')
    return 0
  }
  const list = await readCustomerHosts({ env, fetchFn, retryDelayMs })
  if (list.state !== 'read') {
    log(`Die Liste der Kundendomains ließ sich nicht lesen — ${UNREAD_TEXT[list.reason]}. Mail NICHT raus.`)
    return 1
  }
  const mail = composeCustomerMail({ hosts: list.hosts, numbers, runUrl: env.RUN_URL })
  let response
  try {
    response = await fetchFn('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'authorization': `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'Produktions-Wächter <noreply@pukalani.app>', to, subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(20_000),
    })
  }
  catch {
    log('Resend nicht erreichbar — Mail mit den Namen NICHT raus.')
    return 1
  }
  if (response.status !== 200) {
    log(`Resend antwortet HTTP ${response.status} — Mail mit den Namen NICHT raus.`)
    return 1
  }
  log(`Mail mit den Namen gesendet (${numbers.length} Kundendomain${numbers.length === 1 ? '' : 's'}).`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(await runCustomerMail())
