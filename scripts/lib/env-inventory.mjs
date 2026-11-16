/**
 * WELCHE EINSTELLUNGEN LIEST DER CODE? — gelesen aus dem Code (OPS-012, GA1 P20).
 *
 * Der tägliche Wächter `scripts/ops/verify-site-env.mjs` prüft je Site eine
 * PFLICHT-Liste. Die Liste ist eine Entscheidung und bleibt von Hand: eine
 * Variable gehört erst hinein, wenn ihr Wert auf dem Server steht, und
 * manche Zugänge liegen in der verschlüsselten Ablage statt in der Env.
 * Was fehlte, war das Netz davor: drei der vier `NUXT_PLATFORM_CONTROL_*`
 * standen monatelang nicht auf der Liste (SEC-025), weil niemand eine neue
 * Variable dort nachtragen MUSSTE.
 *
 * Diese Datei liest alle Namen, die der Code kennt:
 *  - jeden Schlüssel aus `runtimeConfig` in den `nuxt.config.ts` der Layer
 *    und Apps (`smtpHost` ⇒ `NUXT_SMTP_HOST`, `public.appwriteEndpoint`
 *    ⇒ `NUXT_PUBLIC_APPWRITE_ENDPOINT`),
 *  - jedes `process.env.NUXT_…` im Server- und App-Code.
 *
 * Der Test `packages/core/tests/verifySiteEnv.test.ts` verlangt für jeden
 * Namen eine ENTSCHEIDUNG: Pflicht auf mindestens einer Site, oder mit Grund
 * „keine Pflicht", oder (Bestand vom 2026-11-16) „noch nicht bewertet".
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments } from './migration-inventory.mjs'

function balanced(source, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < source.length; i += 1) {
    const ch = source[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') quote = ch
    else if (ch === '(' || ch === '{' || ch === '[') depth += 1
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return ''
}

/** Alle Blatt-Schlüssel eines Objekt-Literals als Pfade (`['public', 'appwriteEndpoint']`). */
export function leafKeys(body, prefix = [], out = []) {
  let depth = 0
  let quote = null
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (quote) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      i += 1
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch
      i += 1
      continue
    }
    if (ch === '(' || ch === '{' || ch === '[') depth += 1
    else if (ch === ')' || ch === '}' || ch === ']') depth -= 1
    else if (depth === 0 && /[A-Za-z_$]/.test(ch) && !/[A-Za-z0-9_$.]/.test(body[i - 1] ?? ' ')) {
      const match = body.slice(i).match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*/)
      if (match) {
        const after = i + match[0].length
        if (body[after] === '{') {
          const inner = balanced(body, after)
          leafKeys(inner, [...prefix, match[1]], out)
          i = after + inner.length + 2
          continue
        }
        out.push([...prefix, match[1]])
        i = after
        continue
      }
    }
    i += 1
  }
  return out
}

/** `appwriteProjectId` ⇒ `APPWRITE_PROJECT_ID` (Nuxts Regel für Env-Namen). */
export const envSegment = key => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

export function runtimeConfigEnvNames(source) {
  const clean = stripComments(source)
  const names = []
  for (const match of clean.matchAll(/\bruntimeConfig\s*:\s*\{/g)) {
    for (const path of leafKeys(balanced(clean, match.index + match[0].length - 1))) {
      names.push(`NUXT_${path.map(envSegment).join('_')}`)
    }
  }
  return names
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(ts|mts|mjs|vue)$/.test(name)) out.push(path)
  }
  return out
}

/** @returns {Map<string, string[]>} Name ⇒ wo er herkommt (für die Meldung) */
export function codeEnvNames(root) {
  const names = new Map()
  const add = (name, where) => {
    if (!names.has(name)) names.set(name, [])
    if (!names.get(name).includes(where)) names.get(name).push(where)
  }
  for (const group of ['packages', 'apps']) {
    for (const entry of readdirSync(join(root, group)).sort()) {
      const base = join(root, group, entry)
      const config = join(base, 'nuxt.config.ts')
      if (existsSync(config)) {
        for (const name of runtimeConfigEnvNames(readFileSync(config, 'utf8'))) add(name, `${group}/${entry}/nuxt.config.ts`)
      }
      for (const file of [...(existsSync(config) ? [config] : []), ...walk(join(base, 'server')), ...walk(join(base, 'app'))]) {
        for (const match of stripComments(readFileSync(file, 'utf8')).matchAll(/process\.env\.(NUXT_[A-Z0-9_]+)/g)) {
          add(match[1], file.slice(root.length + 1))
        }
      }
    }
  }
  return names
}

/**
 * @param {object} input
 * @param {Map<string, string[]>} input.names        aus dem Code
 * @param {Set<string>} input.required               Pflicht auf mindestens einer Site
 * @param {Record<string, string>} input.notRequired Name ⇒ Grund
 * @param {string[]} input.undecided                 Bestand, noch nicht bewertet
 * @param {Record<string, string>} [input.readByModules] Pflicht-Namen, die ein Nuxt-Modul liest
 * @returns {string[]}
 */
export function envDecisionProblems({ names, required, notRequired, undecided, readByModules = {} }) {
  const problems = []
  const undecidedSet = new Set(undecided)
  for (const [name, where] of names) {
    const decisions = [required.has(name), name in notRequired, undecidedSet.has(name)].filter(Boolean).length
    if (decisions === 0) {
      problems.push(`${name} (${where[0]}): der Code liest diese Einstellung, aber niemand hat entschieden, ob sie auf einer Site Pflicht ist. Entweder in die Pflicht-Liste der betroffenen Site(s) in scripts/ops/verify-site-env.mjs (ERST nachdem der Wert auf dem Server steht — der Wächter läuft täglich), oder mit Grund in ENV_NOT_REQUIRED (scripts/ops/site-env-decisions.mjs).`)
    }
    else if (decisions > 1) {
      problems.push(`${name}: steht in mehr als einer Liste (Pflicht / keine Pflicht / nicht bewertet) — genau eine Entscheidung je Einstellung.`)
    }
  }
  for (const name of required) {
    if (!names.has(name) && !(name in readByModules)) problems.push(`${name}: steht auf einer Pflicht-Liste in scripts/ops/verify-site-env.mjs, aber der Code liest die Einstellung nicht (mehr) — Eintrag streichen, sonst verlangt der tägliche Wächter etwas, das niemand braucht.`)
  }
  for (const [name, reason] of Object.entries(notRequired)) {
    if (!names.has(name)) problems.push(`ENV_NOT_REQUIRED: ${name} — der Code liest die Einstellung nicht (mehr). Eintrag streichen.`)
    if ((reason ?? '').trim().length < 30) problems.push(`ENV_NOT_REQUIRED: ${name} — ohne tragfähigen Grund.`)
  }
  for (const name of undecided) {
    if (!names.has(name)) problems.push(`ENV_UNDECIDED: ${name} — der Code liest die Einstellung nicht (mehr). Eintrag streichen.`)
  }
  for (const [name, reason] of Object.entries(readByModules)) {
    if (!required.has(name)) problems.push(`ENV_READ_BY_MODULES: ${name} — steht auf keiner Pflicht-Liste (mehr). Eintrag streichen.`)
    if (names.has(name)) problems.push(`ENV_READ_BY_MODULES: ${name} — liest inzwischen unser eigener Code. Eintrag streichen.`)
    if ((reason ?? '').trim().length < 30) problems.push(`ENV_READ_BY_MODULES: ${name} — ohne tragfähigen Grund.`)
  }
  return problems
}
