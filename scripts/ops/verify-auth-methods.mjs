#!/usr/bin/env node
/**
 * Täglicher Blick „Anmelde-Wege der Datenbank von außen zu?" (SV1 b,
 * 2026-11-17; Befund SEC-007).
 *
 * WARUM ES IHN GIBT: Appwrite bietet Kontoanlage und Anmeldung als
 * öffentliche Endpunkte an — an unserer Registrierung vorbei (Bot-Prüfung,
 * Zulassung, geschlossene Registrierung, Zustimmung). Seit dem 2026-11-16
 * sind diese Wege in allen vier Production-Projekten abgeschaltet. Das ist
 * eine Einstellung in der Verwaltung der Datenbank, kein Code: niemand merkt,
 * wenn ein Schalter wieder an ist (ein Klick, ein neues Projekt, ein Upgrade,
 * das die Einstellung zurücksetzt).
 *
 * WAS GEPRÜFT WIRD: je Projekt EIN Aufruf von außen, ohne Schlüssel —
 * anmelden direkt bei der Datenbank mit sichtbar erfundenen Zugangsdaten
 * (`POST /account/sessions/email`).
 *   501 `user_auth_method_unsupported`  ⇒ der Weg ist ZU (grün)
 *   401                                 ⇒ der Weg ist OFFEN (rot): die
 *       Datenbank hat die Zugangsdaten geprüft, statt den Weg abzulehnen
 *   anderes 4xx                         ⇒ rot: die Probe prüft nicht mehr,
 *       was sie soll (unbekanntes Projekt, geänderte Schnittstelle) — eine
 *       Probe, die still grün bliebe, wäre schlimmer als keine
 *   429, 5xx, keine Antwort             ⇒ KEINE AUSSAGE, nicht rot (zweiter
 *       Versuch nach 20 s); Erreichbarkeit meldet der Halbstunden-Blick
 *
 * WAS DIE PROBE NICHT TUT: sie legt nichts an. Es gibt kein Konto mit dieser
 * Adresse (`example.test` ist für Proben reserviert), also keine Sitzung,
 * keine Mail, keinen Fehlversuch an einem echten Konto.
 *
 * WAS SIE NICHT SIEHT: von den sechs Schaltern ist von außen nur
 * „Email/Password" ohne Nebenwirkung prüfbar. Die anderen (Magic URL, Email
 * OTP, Anonymous, Phone, Team Invites) würden bei OFFENEM Weg ein Konto
 * anlegen oder eine Mail schicken — eine Sonde, die fragt „geht das noch?",
 * darf dabei nichts anlegen. Sie wurden am 2026-11-16 zusammen umgestellt;
 * der eine Schalter ist der Anzeiger für den Stand des Projekts.
 *
 * Braucht weder ssh noch ein Secret. Die Projekt-Kennungen sind öffentlich
 * (sie stehen im Namen des Sitzungs-Cookies und in `site.manifest.ts`).
 *
 *   node scripts/ops/verify-auth-methods.mjs [projekt]
 *
 * Für die Gegenprobe gegen eine lokale Datenbank (dort sind die Wege AN, der
 * Blick muss rot werden):
 *   PUKALANI_AUTH_PROBE_ENDPOINT=http://localhost/v1 node scripts/ops/verify-auth-methods.mjs
 *
 * Exit: 0 grün · 1 rot · 2 Aufruf
 */
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Die Projekte der ausgerollten Apps (ein Test hält die Liste gegen die Site-Manifeste). */
export const PROJECTS = ['account', 'admin', 'portfolio', 'branding']

export const DEFAULT_ENDPOINT = 'https://api.pukalani.app/v1'
const TIMEOUT_MS = 15_000
const RETRY_AFTER_MS = 20_000

/** Sichtbar erfunden: reservierte Probe-Domain, und kein Wert, der wie ein Geheimnis aussieht. */
export const PROBE_BODY = { email: 'anmelde-weg-probe@example.test', password: 'x'.repeat(12) }

/**
 * Deutet die Antwort der Datenbank. `closed` grün, `open` und `unexpected`
 * rot, `inconclusive` sagt nichts aus.
 */
export function classifyAuthProbe(status, type) {
  // 501 ist KEINE Störung: die Datenbank sagt „diesen Weg gibt es hier nicht".
  // Nur mit der erwarteten Kennung heißt das „abgeschaltet".
  if (status === 501) return type === 'user_auth_method_unsupported' ? 'closed' : 'unexpected'
  if (status === 401) return 'open'
  if (status === 0 || status === 429 || status >= 500) return 'inconclusive'
  return 'unexpected'
}

async function probe(endpoint, project) {
  try {
    const res = await fetch(`${endpoint}/account/sessions/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-appwrite-project': project, 'user-agent': 'pukalani-verify-auth-methods' },
      body: JSON.stringify(PROBE_BODY),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'manual',
    })
    let type = ''
    try {
      const body = await res.json()
      // Nur die kurze Kennung der Datenbank; nie eine Meldung.
      if (typeof body?.type === 'string' && /^[a-z_]{1,60}$/.test(body.type)) type = body.type
    }
    catch {
      // keine JSON-Antwort ⇒ ohne Kennung
    }
    return { status: res.status, type }
  }
  catch {
    return { status: 0, type: '' }
  }
}

const TODO = 'Zu tun: in der Verwaltung der Datenbank das Projekt öffnen, Auth → Settings → Auth methods, und Email/Password, Magic URL, Email OTP, Anonymous, Phone, Team Invites und JWT ausschalten. Runbook ANMELDE-REGELN.md, Abschnitt „Anmelde-Wege für Aufrufe ohne Schlüssel".'

async function main() {
  const only = process.argv[2]
  const projects = only ? PROJECTS.filter(project => project === only) : PROJECTS
  if (projects.length === 0) {
    console.error(`Kein Projekt "${only}". Bekannt: ${PROJECTS.join(', ')}`)
    process.exit(2)
  }
  const endpoint = (process.env.PUKALANI_AUTH_PROBE_ENDPOINT || DEFAULT_ENDPOINT).replace(/\/+$/, '')
  const retryMs = Number(process.env.PUKALANI_AUTH_PROBE_RETRY_MS ?? RETRY_AFTER_MS)
  console.log('Anmelde-Wege der Datenbank von außen zu?\n')

  const failures = []
  for (const project of projects) {
    let answer = await probe(endpoint, project)
    let verdict = classifyAuthProbe(answer.status, answer.type)
    if (verdict === 'inconclusive') {
      await new Promise(done => setTimeout(done, retryMs))
      answer = await probe(endpoint, project)
      verdict = classifyAuthProbe(answer.status, answer.type)
    }
    const label = project.padEnd(12)
    if (verdict === 'closed') {
      console.log(`✔ ${label} zu (501, die Datenbank lehnt den Weg ab)`)
    }
    else if (verdict === 'inconclusive') {
      console.log(`… ${label} keine Aussage (Status ${answer.status || 'keine Antwort'}) — Erreichbarkeit meldet der Health-Blick`)
    }
    else if (verdict === 'open') {
      console.log(`✗ ${label} OFFEN (401): die Datenbank prüft Zugangsdaten ohne Schlüssel`)
      failures.push(`Projekt ${project}: der Weg „Email/Password" ist für Aufrufe ohne Schlüssel wieder offen.`)
    }
    else {
      console.log(`✗ ${label} unerwartete Antwort (Status ${answer.status}${answer.type ? `, ${answer.type}` : ''})`)
      failures.push(`Projekt ${project}: die Probe bekam eine unerwartete Antwort (Status ${answer.status}${answer.type ? `, ${answer.type}` : ''}) — sie prüft nicht mehr, was sie soll.`)
    }
  }

  if (!failures.length) {
    console.log('\n✔ Nichts Rotes.')
    return
  }
  console.error(`\n✗ ${failures.length} Projekt(e) mit offenem oder nicht prüfbarem Anmelde-Weg.`)
  if (process.env.PUKALANI_FINDINGS_FILE) {
    for (const failure of failures) {
      appendFileSync(process.env.PUKALANI_FINDINGS_FILE, `Anmelde-Wege: ${failure.slice(0, 300)} ${TODO}\n`)
    }
  }
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
