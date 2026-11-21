/**
 * ANMELDE-MAILS VON APPWRITE IM TON DER MARKE (Q06, BRD-001; Davids Antwort R6).
 *
 * Vier Mails verschickt nicht die App, sondern Appwrite selbst: Adresse
 * bestätigen (`verification`), Passwort zurücksetzen (`recovery`),
 * Anmelde-Code (`otpSession`) und Hinweis auf eine neue Anmeldung
 * (`sessionAlert`). Ohne eigene Vorlage setzt Appwrite den PROJEKTNAMEN ein —
 * im Pool unterschrieb deshalb ein „Account team". Hier stehen die Vorlagen
 * genau einmal; `../appwrite-mail-templates.mjs` spielt sie in EIN Projekt ein.
 *
 * DATEIEN: `templates/<art>.<sprache>.html`. Drei Sorten Platzhalter:
 *   - `{{user}}`, `{{redirect}}`, `{{otp}}` … setzt APPWRITE beim Versand
 *     (Namen aus dem Quelltext von Appwrite 2.7.4, je Art in `REQUIRED`);
 *   - `{brand}` setzen WIR beim Einspielen — der Name der Marke des Projekts;
 *   - `[[du-Form|ihr-Form]]` setzen WIR je Projekt (`anrede`), nur deutsch.
 *
 * WOHER DIE MARKE KOMMT: aus der `app.config.ts` der App, die das Projekt
 * benutzt (`pukalani.brand.publicName`, sonst `pukalani.brand.name`) — dieselbe
 * Quelle wie für die eigenen Mails (`core/server/utils/mailBrand.ts`). Hier
 * steht nur, WELCHE App zu welchem Projekt gehört (geprüft gegen
 * `appwriteProjects` im `site.manifest.ts`, Test
 * `packages/core/tests/appwriteMailTemplates.test.ts`).
 *
 * BEWUSST: der Anmelde-Code grüßt OHNE Namen („Hallo,"). Wer sich zum ersten
 * Mal per Code anmeldet, hat bei Appwrite noch keinen Namen — „Hallo ," wäre
 * die erste Mail, die jemand von uns bekommt.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..')

export const TEMPLATE_TYPES = ['verification', 'recovery', 'otpSession', 'sessionAlert']
export const TEMPLATE_LOCALES = ['de', 'en']

/**
 * Die vier Production-Projekte und ihre App. `anrede`: wie die Marke ihre
 * Kundschaft anspricht (branding.supply sagt „ihr", wie in ihren eigenen
 * Mails).
 */
export const PROJECTS = {
  account: { app: 'platform', anrede: 'du' },
  admin: { app: 'control', anrede: 'du' },
  portfolio: { app: 'portfolio', anrede: 'du' },
  branding: { app: 'branding', anrede: 'ihr' },
}

/** Platzhalter, ohne die eine Vorlage ihren Zweck nicht erfüllt. */
export const REQUIRED = {
  verification: ['{{redirect}}'],
  recovery: ['{{redirect}}'],
  otpSession: ['{{otp}}', '{{phrase}}'],
  sessionAlert: ['{{device}}', '{{ipAddress}}'],
}

const SUBJECTS = {
  verification: { de: '[[Bestätige deine|Bestätigt eure]] E-Mail-Adresse für {brand}', en: 'Confirm your email address for {brand}' },
  recovery: { de: 'Neues Passwort für {brand}', en: 'A new password for {brand}' },
  otpSession: { de: '[[Dein|Euer]] Anmelde-Code für {brand}', en: 'Your sign-in code for {brand}' },
  sessionAlert: { de: 'Neue Anmeldung bei {brand}', en: 'New sign-in to {brand}' },
}

/**
 * Markenname aus dem Text einer `app.config.ts` (pur): der `brand`-Block der
 * App, darin `publicName` vor `name`. `null`, wenn keiner steht.
 */
export function brandFromAppConfig(source) {
  const lines = String(source).split('\n')
  const start = lines.findIndex(line => /^\s*brand:\s*\{/.test(line))
  if (start < 0) return null
  let block
  if (/\}/.test(lines[start])) {
    block = lines[start]
  }
  else {
    const indent = lines[start].match(/^\s*/)[0]
    const end = lines.findIndex((line, i) => i > start && new RegExp(`^${indent}\\},?\\s*$`).test(line))
    block = lines.slice(start, end < 0 ? undefined : end + 1).join('\n')
  }
  // Kommentare zählen nicht — im branding-Block stehen lange Erklärungen.
  block = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const pick = key => block.match(new RegExp(`\\b${key}:\\s*'([^']+)'`))?.[1]?.trim()
  return pick('publicName') || pick('name') || null
}

/** Markenname eines Projekts — aus der App, nie aus diesem Skript. */
export function brandForProject(project, readFile = path => readFileSync(path, 'utf8')) {
  const entry = PROJECTS[project]
  if (!entry) throw new Error(`Unbekanntes Projekt „${project}" — erlaubt: ${Object.keys(PROJECTS).join(', ')}`)
  const brand = brandFromAppConfig(readFile(join(REPO, 'apps', entry.app, 'app', 'app.config.ts')))
  if (!brand) throw new Error(`apps/${entry.app}/app/app.config.ts nennt keinen pukalani.brand.name`)
  return brand
}

/** `{brand}` und `[[du|ihr]]` setzen (pur). */
export function fillTemplate(text, { brand, anrede }) {
  return text
    .replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, (_, du, ihr) => (anrede === 'ihr' ? ihr : du))
    .replaceAll('{brand}', brand)
}

export function readTemplateFile(type, locale) {
  return readFileSync(join(HERE, 'templates', `${type}.${locale}.html`), 'utf8').trim()
}

/**
 * Das SOLL einer Vorlage in einem Projekt: Betreff, Text, Absender-Name.
 * `senderName` ist die Marke — sonst bliebe der Absender-Name der Instanz.
 */
export function desiredTemplate(type, locale, project, { brand, readTemplate = readTemplateFile } = {}) {
  const entry = PROJECTS[project]
  if (!entry) throw new Error(`Unbekanntes Projekt „${project}"`)
  const name = brand ?? brandForProject(project)
  const values = { brand: name, anrede: entry.anrede }
  return {
    subject: fillTemplate(SUBJECTS[type][locale], values),
    message: fillTemplate(readTemplate(type, locale), values),
    senderName: name,
  }
}

/** Prüft eine gefüllte Vorlage (pur): Pflicht-Platzhalter da, keine Reste. */
export function templateProblems(type, filled) {
  const problems = []
  for (const token of REQUIRED[type] ?? []) {
    if (!filled.message.includes(token)) problems.push(`Platzhalter ${token} fehlt`)
  }
  for (const [field, value] of Object.entries(filled)) {
    if (/\{brand\}|\[\[|\]\]/.test(value)) problems.push(`${field}: ungefüllter Platzhalter`)
    if (/\bteam\b/i.test(value)) problems.push(`${field}: enthält „team"`)
  }
  if (!filled.senderName.trim()) problems.push('Absender-Name leer')
  return problems
}

/** Vergleich IST gegen SOLL (pur): geänderte Felder mit alt → neu. */
export function compareTemplate(current, desired) {
  return ['subject', 'senderName', 'message']
    .filter(field => (current?.[field] ?? '') !== desired[field])
    .map(field => ({ field, ist: current?.[field] ?? '', soll: desired[field] }))
}

function short(value, max = 60) {
  const flat = String(value).replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Eine Zeile je Vorlage (pur): „stimmt" oder die Felder mit alt → neu. */
export function formatDiff(type, locale, diffs) {
  if (diffs.length === 0) return `${type}/${locale}: stimmt`
  const parts = diffs.map(d => d.field === 'message'
    ? `Text (${d.ist.length} → ${d.soll.length} Zeichen)`
    : `${d.field === 'subject' ? 'Betreff' : 'Absender'} „${short(d.ist)}" → „${short(d.soll)}"`)
  return `${type}/${locale}: ändert ${parts.join(', ')}`
}
