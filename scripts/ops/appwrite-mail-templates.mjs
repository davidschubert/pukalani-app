#!/usr/bin/env node
/**
 * ANMELDE-MAILS EINES APPWRITE-PROJEKTS: Vorlagen vergleichen und einspielen
 * (Q06, BRD-001). Die Vorlagen selbst und warum: `./appwrite-mail/templates.mjs`.
 *
 *   node --env-file=<datei> scripts/ops/appwrite-mail-templates.mjs                                # Trockenlauf: je Vorlage alt → neu
 *   node --env-file=<datei> scripts/ops/appwrite-mail-templates.mjs --apply --backup <datei.json>  # einspielen, vorher sichern
 *   node --env-file=<datei> scripts/ops/appwrite-mail-templates.mjs --restore <datei.json>         # Sicherung zurückschreiben
 *   node --env-file=<datei> scripts/ops/appwrite-mail-templates.mjs --smtp-local host:port         # NUR lokal: Projekt-SMTP auf Mailpit
 *   pnpm ops:mail-templates   (Umgebung vorher laden)
 *
 * EIN PROJEKT JE LAUF: das aus `NUXT_PUBLIC_APPWRITE_PROJECT_ID`. Erlaubt
 * sind nur die Projekte aus `PROJECTS`; ein anderes bricht ab.
 *
 * ZIEL-PRÜFUNG (OPS-002): jeder schreibende Lauf ruft `assertTarget` — gegen
 * einen entfernten Endpunkt nur mit `PUKALANI_TARGET_CONFIRM=<Projekt-Id>`.
 * Der Trockenlauf liest nur.
 *
 * VORAUSSETZUNG BEI APPWRITE: eigene Vorlagen nimmt Appwrite nur an, wenn das
 * PROJEKT eine eigene SMTP-Einstellung hat (Settings → SMTP); sonst antwortet
 * es 400 „SMTP must be enabled". Der Trockenlauf meldet den Stand, wenn der
 * Schlüssel `project.read` hat.
 *
 * SCHLÜSSEL aus `APPWRITE_TEMPLATES_KEY`, sonst `NUXT_APPWRITE_MIGRATIONS_KEY`,
 * sonst `NUXT_APPWRITE_KEY`. Rechte: `templates.read` (vergleichen),
 * `templates.write` (einspielen, zurückschreiben), `project.read` (SMTP-Stand
 * lesen, freiwillig), `project.write` (nur `--smtp-local`). DER SCHLÜSSEL WIRD
 * NIE AUSGEGEBEN.
 *
 * RÜCKWEG: `--apply` verlangt `--backup <datei>` und schreibt dorthin den
 * Stand JEDER Vorlage vor dem Lauf; `--restore <datei>` schreibt ihn zurück.
 * War vorher keine eigene Vorlage gesetzt, steht danach Appwrites Standardtext
 * als eigene Vorlage — dasselbe, was Empfänger vorher sahen. Ganz löschen kann
 * nur die Konsole (Auth → Templates → Reset).
 *
 * Exit: 0 = alles stimmt (bzw. nach dem Schreiben zurückgelesen), 1 =
 * Abweichung, 2 = Aufruf- oder Verbindungsfehler.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { assertTarget, isLocalEndpoint } from '../lib/target.mjs'
import {
  PROJECTS,
  TEMPLATE_LOCALES,
  TEMPLATE_TYPES,
  brandForProject,
  compareTemplate,
  desiredTemplate,
  formatDiff,
  templateProblems,
} from './appwrite-mail/templates.mjs'

class TemplateApiError extends Error {}

function argValue(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    console.error(`${name} braucht einen Wert.`)
    process.exit(2)
  }
  return value
}

function config() {
  const endpoint = (process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT || '').replace(/\/+$/, '')
  const project = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID || ''
  const key = process.env.APPWRITE_TEMPLATES_KEY || process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY || ''
  if (!endpoint || !project || !key) {
    console.error('Fehlende Umgebung: NUXT_PUBLIC_APPWRITE_ENDPOINT, NUXT_PUBLIC_APPWRITE_PROJECT_ID und ein Schlüssel (APPWRITE_TEMPLATES_KEY | NUXT_APPWRITE_MIGRATIONS_KEY | NUXT_APPWRITE_KEY) — mit node --env-file=<pfad> aufrufen.')
    process.exit(2)
  }
  if (!PROJECTS[project]) {
    console.error(`Projekt „${project}" hat keine Vorlagen hier — erlaubt: ${Object.keys(PROJECTS).join(', ')}.`)
    process.exit(2)
  }
  return { endpoint, project, key }
}

async function api({ endpoint, project, key }, method, path, body) {
  let res
  try {
    res = await fetch(`${endpoint}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'X-Appwrite-Project': project, 'X-Appwrite-Key': key },
      body: body ? JSON.stringify(body) : undefined,
    })
  }
  catch (error) {
    throw new TemplateApiError(`${endpoint} nicht erreichbar (${error?.cause?.code || error?.message || error})`)
  }
  const json = await res.json().catch(() => ({}))
  if (res.status === 401) {
    throw new TemplateApiError(`401 bei ${method} ${path.split('?')[0]} — dem Schlüssel fehlt ein Recht (${json?.message ? String(json.message).slice(0, 120) : 'Scope'}).`)
  }
  if (!res.ok) throw new TemplateApiError(`${res.status} bei ${method} ${path.split('?')[0]}${json?.message ? `: ${String(json.message).slice(0, 160)}` : ''}`)
  return json
}

function readTemplate(cfg, type, locale) {
  return api(cfg, 'GET', `/project/templates/email/${type}?locale=${locale}`)
}

function writeTemplate(cfg, type, locale, fields) {
  return api(cfg, 'PATCH', '/project/templates/email', { templateId: type, locale, ...fields })
}

/** SMTP-Stand des Projekts — `null`, wenn der Schlüssel ihn nicht lesen darf. */
async function readSmtpEnabled(cfg) {
  try {
    const project = await api(cfg, 'GET', '/project')
    return project?.smtpEnabled ?? project?.smtp?.enabled ?? null
  }
  catch {
    return null
  }
}

function plan(cfg) {
  const brand = brandForProject(cfg.project)
  const entries = []
  for (const type of TEMPLATE_TYPES) {
    for (const locale of TEMPLATE_LOCALES) {
      const desired = desiredTemplate(type, locale, cfg.project, { brand })
      const problems = templateProblems(type, desired)
      if (problems.length > 0) throw new Error(`Vorlage ${type}/${locale} ist kaputt: ${problems.join('; ')}`)
      entries.push({ type, locale, desired })
    }
  }
  return { brand, entries }
}

async function compareAll(cfg, entries) {
  const results = []
  for (const entry of entries) {
    const current = await readTemplate(cfg, entry.type, entry.locale)
    results.push({ ...entry, current, diffs: compareTemplate(current, entry.desired) })
  }
  return results
}

async function smtpLocal(cfg, value) {
  if (!isLocalEndpoint(cfg.endpoint)) {
    console.error('--smtp-local gilt nur für einen lokalen Endpunkt. Auf Production setzt David die SMTP-Einstellung des Projekts in der Konsole.')
    process.exit(2)
  }
  assertTarget({ script: 'appwrite-mail-templates --smtp-local', endpoint: cfg.endpoint, projectId: cfg.project })
  if (value === 'off') {
    await api(cfg, 'PATCH', '/project/smtp', { enabled: false })
    console.log(`Projekt-SMTP von ${cfg.project} ausgeschaltet (lokal).`)
    return
  }
  const [host, port] = value.split(':')
  await api(cfg, 'PATCH', '/project/smtp', {
    enabled: true,
    host,
    port: Number(port) || 1025,
    username: '',
    password: '',
    senderEmail: `noreply@${cfg.project}.localhost.test`,
    senderName: brandForProject(cfg.project),
  })
  console.log(`Projekt-SMTP von ${cfg.project} zeigt auf ${host}:${Number(port) || 1025} (lokal).`)
}

async function main() {
  const cfg = config()
  const smtp = argValue('--smtp-local')
  if (smtp) return smtpLocal(cfg, smtp)

  const restore = argValue('--restore')
  const apply = process.argv.includes('--apply')
  const backup = argValue('--backup')

  if (restore) {
    assertTarget({ script: 'appwrite-mail-templates --restore', endpoint: cfg.endpoint, projectId: cfg.project })
    const saved = JSON.parse(readFileSync(restore, 'utf8'))
    if (saved.project !== cfg.project) {
      console.error(`Die Sicherung gehört zu „${saved.project}", die Umgebung zeigt auf „${cfg.project}".`)
      process.exit(2)
    }
    for (const t of saved.templates) {
      await writeTemplate(cfg, t.type, t.locale, { subject: t.subject, message: t.message, senderName: t.senderName ?? '' })
      console.log(`  zurückgeschrieben: ${t.type}/${t.locale}`)
    }
    console.log(`${saved.templates.length} Vorlage(n) aus ${restore} zurückgeschrieben.`)
    return
  }

  if (apply) {
    if (!backup) {
      console.error('--apply braucht --backup <datei.json> — ohne Sicherung gibt es keinen Rückweg.')
      process.exit(2)
    }
    if (existsSync(backup)) {
      console.error(`${backup} gibt es schon — eine Sicherung wird nie überschrieben.`)
      process.exit(2)
    }
    assertTarget({ script: 'appwrite-mail-templates --apply', endpoint: cfg.endpoint, projectId: cfg.project })
  }

  const { brand, entries } = plan(cfg)
  console.log(`Anmelde-Mails · Projekt ${cfg.project} @ ${cfg.endpoint} · Marke „${brand}"${apply ? ' · --apply' : ' · Trockenlauf'}`)
  const smtpEnabled = await readSmtpEnabled(cfg)
  console.log(`  Projekt-SMTP: ${smtpEnabled === null ? 'unbekannt (Schlüssel ohne project.read)' : smtpEnabled ? 'an' : 'AUS — Appwrite nimmt so keine eigene Vorlage an'}`)

  const before = await compareAll(cfg, entries)
  for (const r of before) console.log(`  ${formatDiff(r.type, r.locale, r.diffs)}`)
  const off = before.filter(r => r.diffs.length > 0)

  if (!apply) {
    console.log(off.length === 0 ? 'Alles stimmt.' : `${off.length} Vorlage(n) weichen ab — mit --apply --backup <datei> einspielen.`)
    process.exit(off.length === 0 ? 0 : 1)
  }

  writeFileSync(backup, `${JSON.stringify({
    project: cfg.project,
    endpoint: cfg.endpoint,
    savedAt: new Date().toISOString(),
    templates: before.map(r => ({ type: r.type, locale: r.locale, subject: r.current.subject, message: r.current.message, senderName: r.current.senderName ?? '' })),
  }, null, 2)}\n`)
  console.log(`  Sicherung: ${backup}`)

  for (const r of off) {
    await writeTemplate(cfg, r.type, r.locale, r.desired)
    console.log(`  gesetzt: ${r.type}/${r.locale}`)
  }

  const after = await compareAll(cfg, entries)
  const still = after.filter(r => r.diffs.length > 0)
  for (const r of still) console.log(`  NACH DEM SETZEN: ${formatDiff(r.type, r.locale, r.diffs)}`)
  console.log(still.length === 0 ? `${off.length} Vorlage(n) gesetzt, zurückgelesen: alles stimmt.` : `${still.length} Vorlage(n) weichen nach dem Setzen weiter ab.`)
  process.exit(still.length === 0 ? 0 : 1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof TemplateApiError ? error.message : `Fehler: ${error?.message || error}`)
    process.exit(2)
  })
}
