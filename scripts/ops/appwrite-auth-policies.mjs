#!/usr/bin/env node
/**
 * ANMELDE-REGELN EINES APPWRITE-PROJEKTS (P29): prüfen und auf Wunsch setzen.
 *
 *   node --env-file=apps/comments/.env scripts/ops/appwrite-auth-policies.mjs           # nur prüfen
 *   node --env-file=apps/comments/.env scripts/ops/appwrite-auth-policies.mjs --apply   # Abweichungen setzen
 *   pnpm ops:auth-policies   (Umgebung vorher laden, s. unten)
 *
 * WARUM ES DAS GIBT: Appwrite kennt je Projekt Regeln für Passwörter und
 * Adressen (Auth → Security in der Console). Von Hand geklickt driften sie
 * zwischen den Instanzen auseinander, und niemand sieht es. Hier steht das
 * SOLL genau einmal; der Standard-Lauf vergleicht nur und endet rot, wenn ein
 * Feld abweicht, `--apply` setzt NUR die abweichenden Regeln und liest danach
 * zurück. Ein zweiter `--apply` ändert nichts.
 *
 * Die Regeln greifen auch bei Aufrufen mit API-Schlüssel — so ruft unser
 * Server Appwrite auf (Signup, Passwort ändern, Reset). Die Ablehnungen
 * übersetzt `packages/core/shared/passwordPolicy.ts` in verständliche Sätze.
 *
 * BEWUSST NICHT GESETZT:
 *  - Alias- und Gratis-Adressen bleiben erlaubt (`deny-aliased-email`,
 *    `deny-free-email`): echte Menschen nutzen sie, Missbrauch hält der
 *    Bot-Beweis bei der Registrierung auf.
 *  - Keine Zeichenregeln (Groß/Klein/Zahl/Sonderzeichen) bei
 *    `password-strength`: die prüft schon unser Formular, und Länge plus
 *    Leak-Abgleich schützen besser als Zeichenklassen.
 *  - Leak-Abgleich mit `sessions: false`: geprüft wird beim Setzen eines
 *    Passworts, nicht bei jeder Anmeldung — sonst sperrt ein neu gemeldetes
 *    Leck Menschen mitten im Alltag aus, ohne ihnen einen Weg zu zeigen.
 *  - Passkeys bleiben offen (`passkey`), eine eigene Entscheidung.
 *
 * UMGEBUNG: Endpoint `NUXT_PUBLIC_APPWRITE_ENDPOINT`, Projekt
 * `NUXT_PUBLIC_APPWRITE_PROJECT_ID`, Schlüssel aus `APPWRITE_POLICIES_KEY`,
 * sonst `NUXT_APPWRITE_MIGRATIONS_KEY`, sonst `NUXT_APPWRITE_KEY` — geladen
 * per `node --env-file=<pfad>`. Der Schlüssel braucht `policies.read` (prüfen)
 * und `policies.write` (setzen). DER SCHLÜSSEL WIRD NIE AUSGEGEBEN.
 *
 * Exit: 0 = alles stimmt (bzw. nach `--apply` zurückgelesen stimmt alles),
 * 1 = Abweichung, 2 = Aufruf- oder Verbindungsfehler.
 */
import { pathToFileURL } from 'node:url'

/**
 * DAS SOLL — je Regel nur die Felder, die wir festlegen. Verglichen werden
 * ausschließlich diese Felder; was Appwrite sonst noch meldet, bleibt unberührt.
 */
export const AUTH_POLICIES = [
  // Häufige Passwörter (Liste der 10.000 häufigsten) ablehnen — die ersten, die geraten werden.
  { id: 'password-dictionary', fields: { enabled: true } },
  // Kein Passwort, das Name, E-Mail oder userId enthält — das steht oft öffentlich.
  { id: 'password-personal-data', fields: { enabled: true } },
  // Mindestlänge 8, wie unser Formular — Länge schützt mehr als Zeichenklassen.
  { id: 'password-strength', fields: { min: 8 } },
  // Die letzten fünf Passwörter nicht wiederverwenden — sonst ist ein Wechsel nach einem Vorfall wirkungslos.
  { id: 'password-history', fields: { total: 5 } },
  // Passwörter aus bekannten Datenlecks beim Setzen ablehnen (nicht bei jeder Anmeldung).
  { id: 'password-pwned', fields: { enabled: true, users: true, sessions: false } },
  // Wegwerf-Adressen ablehnen — über sie laufen Spam-Konten, und Mails an sie erreicht niemand.
  { id: 'deny-disposable-email', fields: { enabled: true } },
  // Mail bei Anmeldung von einem neuen Gerät — der Besitzer erfährt von einem fremden Zugriff.
  { id: 'session-alert', fields: { enabled: true } },
]

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Vergleich (pur): IST (Liste aus `GET /project/policies`) gegen SOLL.
 * Liefert je Soll-Regel `{ id, ok, diffs: [{ field, ist, soll }] }`; eine
 * fehlende Regel zählt mit `ist: undefined` als Abweichung.
 */
export function comparePolicies(ist, soll = AUTH_POLICIES) {
  const byId = new Map((Array.isArray(ist) ? ist : []).map(p => [p?.$id, p]))
  return soll.map(({ id, fields }) => {
    const current = byId.get(id)
    const diffs = Object.entries(fields)
      .filter(([field, value]) => !sameValue(current?.[field], value))
      .map(([field, value]) => ({ field, ist: current?.[field], soll: value }))
    return { id, ok: diffs.length === 0, diffs }
  })
}

/** Eine Zeile je Regel (pur): „stimmt" oder „weicht ab (feld: ist → soll, …)". */
export function formatResult(result) {
  if (result.ok) return `${result.id}: stimmt`
  const detail = result.diffs.map(d => `${d.field}: ${d.ist === undefined ? '–' : JSON.stringify(d.ist)} → ${JSON.stringify(d.soll)}`).join(', ')
  return `${result.id}: weicht ab (${detail})`
}

class PolicyApiError extends Error {}

function config() {
  const endpoint = (process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT || '').replace(/\/+$/, '')
  const project = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID || ''
  const key = process.env.APPWRITE_POLICIES_KEY || process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY || ''
  if (!endpoint || !project || !key) {
    console.error('Fehlende Umgebung: NUXT_PUBLIC_APPWRITE_ENDPOINT, NUXT_PUBLIC_APPWRITE_PROJECT_ID und ein Schlüssel (APPWRITE_POLICIES_KEY | NUXT_APPWRITE_MIGRATIONS_KEY | NUXT_APPWRITE_KEY) — mit node --env-file=<pfad> aufrufen.')
    process.exit(2)
  }
  return { endpoint, project, key }
}

async function api({ endpoint, project, key }, method, path, body) {
  let res
  try {
    res = await fetch(`${endpoint}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'X-Appwrite-Project': project,
        'X-Appwrite-Key': key,
        'X-Appwrite-Response-Format': '2.6.2',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  }
  catch (error) {
    throw new PolicyApiError(`${endpoint} nicht erreichbar (${error?.cause?.code || error?.message || error})`)
  }
  const json = await res.json().catch(() => ({}))
  if (res.status === 401) {
    const scope = method === 'GET' ? 'policies.read' : 'policies.write'
    throw new PolicyApiError(`401 bei ${method} ${path} — dem Schlüssel fehlt ${scope} (Scopes policies.read/policies.write).`)
  }
  if (!res.ok) throw new PolicyApiError(`${res.status} bei ${method} ${path}${json?.type ? ` (${json.type})` : ''}`)
  return json
}

async function readPolicies(cfg) {
  const json = await api(cfg, 'GET', '/project/policies')
  return Array.isArray(json?.policies) ? json.policies : []
}

async function main() {
  const apply = process.argv.includes('--apply')
  const cfg = config()
  console.log(`Anmelde-Regeln · Projekt ${cfg.project} @ ${cfg.endpoint}${apply ? ' · --apply' : ''}`)

  const before = comparePolicies(await readPolicies(cfg))
  for (const r of before) console.log(`  ${formatResult(r)}`)
  const off = before.filter(r => !r.ok)

  if (!apply) {
    console.log(off.length === 0 ? 'Alles stimmt.' : `${off.length} Regel(n) weichen ab — mit --apply setzen.`)
    process.exit(off.length === 0 ? 0 : 1)
  }

  if (off.length === 0) {
    console.log('Alles stimmt — nichts zu setzen.')
    process.exit(0)
  }
  for (const r of off) {
    const { fields } = AUTH_POLICIES.find(p => p.id === r.id)
    await api(cfg, 'PATCH', `/project/policies/${r.id}`, fields)
    console.log(`  gesetzt: ${r.id}`)
  }

  const after = comparePolicies(await readPolicies(cfg))
  const still = after.filter(r => !r.ok)
  for (const r of still) console.log(`  NACH DEM SETZEN: ${formatResult(r)}`)
  console.log(still.length === 0 ? `${off.length} Regel(n) gesetzt, zurückgelesen: alles stimmt.` : `${still.length} Regel(n) weichen nach dem Setzen weiter ab.`)
  process.exit(still.length === 0 ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof PolicyApiError ? error.message : `Fehler: ${error?.message || error}`)
    process.exit(2)
  })
}
