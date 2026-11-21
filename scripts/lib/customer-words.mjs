/**
 * DIE WORTLISTE FÜR KUNDENTEXTE (Q16, BRD-007/008/012, UX-013 — 2026-11-21).
 *
 * Ein Wort je Sache, in beiden Sprachen, und keine Entwickler-Wörter vor
 * Kundschaft. Geprüft werden die WERTE aller Sprachdateien
 * (`packages/*` und `apps/*`, `i18n/locales/{de,en}.json`) und die
 * Kundentexte der Produkt-Manifeste (`customerDescription`). Schlüssel-Namen,
 * Code, Routen und Datenbank-Felder bleiben, wie sie sind.
 *
 * Wer ein Wort hier verbannt, ersetzt es im selben Commit überall; wer eine
 * Ausnahme braucht, trägt sie in EXCEPTIONS ein — einzeln und mit Grund.
 * Läufe: `pnpm check:customer-words` (in `pnpm check`), Test
 * `packages/core/tests/customerWords.test.ts` (mit Gegenprobe).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Produktnamen mit „Brand“ davor oder dahinter — keine Doppelung zu „Marke“. */
const BRAND_NAMES = 'Design|Book|Foundation|Story|Context|Score|Scores|Insights|Kit|Language|Monitoring|Experience|Wizard|Check|Checks|Duell|Ranking|Brand'

export const WORD_RULES = [
  { id: 'konto', lang: 'de', bad: /\bAccounts?\b|\bAccount-/, good: 'Konto' },
  { id: 'einladungscode', lang: 'de', bad: /Einladungs-Codes?\b/, good: 'Einladungscode' },
  { id: 'invite-code', lang: 'en', bad: /\binvitation codes?\b/i, good: 'invite code' },
  { id: 'brand-advisor', lang: 'en', bad: /\bbrand consultants?\b/i, good: 'brand advisor' },
  { id: 'instanz', lang: 'de', bad: /Instanz/, good: 'hier · diese Site · eigene Plattform' },
  { id: 'instance', lang: 'en', bad: /\binstances?\b/i, good: 'here · this site · your own platform' },
  { id: 'marken-entdecken', lang: 'de', bad: /Discover Brands/, good: 'Marken entdecken' },
  {
    id: 'marke',
    lang: 'de',
    // „Brand“ als Wort für die Marke (nicht im Produktnamen, nicht in
    // Fachbegriffen wie „Personal Brand“, „Sub-Brands“, „House of Brands“).
    bad: new RegExp(`(?<!Personal |Sub-|Endorsed |of )\\bBrands?\\b(?![ -](?:${BRAND_NAMES})\\b)(?! of the)`),
    good: 'Marke',
  },
  { id: 'brand-score', lang: 'de', bad: /Brand-Scores?\b/, good: 'Brand Score' },
  { id: 'upvote', lang: 'de', bad: /voten\b/, good: 'Upvote · Downvote' },
  { id: 'glocke', lang: 'de', bad: /\bBell-/, good: 'Benachrichtigungen aus der Glocke' },
  { id: 'prefs', lang: '*', bad: /\bprefs\b/i, good: 'Konto · account' },
  { id: 'schicht', lang: '*', bad: /\((?:Schicht|layer) \d\)/, good: '(ohne Nummer)' },
  { id: 'menu-de', lang: 'de', bad: /^(?:Products|About)$|^Products —/, good: 'Produkte · Über uns' },
  {
    id: 'eszett',
    lang: 'de',
    bad: /\b(?:ausschliesslich|heisst|heissen|Grösse\w*|Grössen\S*|Dreissig|draussen|schliesslich|Strasse|gemäss|massgeblich)\b/,
    good: 'ß',
  },
]

/**
 * Ausnahmen — je Regel und Schlüssel-Anfang, mit Grund. Bewusst schmal: nur
 * Betreiber-Ansichten, in denen die Instanz selbst der Gegenstand ist.
 */
export const EXCEPTIONS = [
  { rule: 'instanz', keyPrefix: 'admin.', why: 'Betreiber-Ansicht: die Instanz ist dort der Gegenstand (Menü „Instanz“, Integrationen).' },
  { rule: 'instance', keyPrefix: 'admin.', why: 'Betreiber-Ansicht, wie oben.' },
  { rule: 'instanz', keyPrefix: 'control.', why: 'Betreiber-Konsole: spricht über die eigene Instanz (Stripe-Rückweg).' },
  { rule: 'instance', keyPrefix: 'control.', why: 'Betreiber-Konsole, wie oben.' },
  { rule: 'instanz', keyPrefix: 'dashboard.system.', why: 'System-Seite des Betreibers: „Backend-Instanz“ ist Technik-Auskunft.' },
  { rule: 'instance', keyPrefix: 'dashboard.system.', why: 'System-Seite des Betreibers, wie oben.' },
]

function walkStrings(node, prefix, out) {
  if (typeof node === 'string') out.push([prefix, node])
  else if (Array.isArray(node)) node.forEach((v, i) => walkStrings(v, `${prefix}[${i}]`, out))
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) walkStrings(v, prefix ? `${prefix}.${k}` : k, out)
  }
  return out
}

/** Alle Kundentexte des Repos: `{ file, lang, key, text }`. */
export function collectRepoTexts(root) {
  const entries = []
  for (const area of ['packages', 'apps']) {
    for (const name of readdirSync(join(root, area))) {
      for (const lang of ['de', 'en']) {
        const file = join(area, name, 'i18n', 'locales', `${lang}.json`)
        if (!existsSync(join(root, file))) continue
        const json = JSON.parse(readFileSync(join(root, file), 'utf8'))
        for (const [key, text] of walkStrings(json, '', [])) entries.push({ file, lang, key, text })
      }
    }
  }
  for (const m of readManifests(root)) {
    for (const lang of ['de', 'en']) {
      if (m.customer?.[lang]) entries.push({ file: m.file, lang, key: `customerDescription.${lang}`, text: m.customer[lang] })
    }
  }
  return entries
}

/**
 * Produkt-Manifeste, gelesen als Text (sie sind TypeScript): Stufe und der
 * Kundentext. Ein Manifest mit `tier: 'optional'` erscheint im Reiter
 * „Produkte“ der Community — es braucht einen Kundentext.
 */
export function readManifests(root) {
  const out = []
  for (const name of readdirSync(join(root, 'packages'))) {
    const file = join('packages', name, 'product.manifest.ts')
    if (!existsSync(join(root, file))) continue
    const src = readFileSync(join(root, file), 'utf8')
    const block = src.match(/customerDescription: \{([^}]*)\}/)
    const pick = lang => block?.[1].match(new RegExp(`${lang}: '((?:[^'\\\\]|\\\\.)*)'`))?.[1]
    out.push({
      file,
      optional: /tier: 'optional'/.test(src),
      customer: block ? { de: pick('de'), en: pick('en') } : undefined,
    })
  }
  return out
}

/** Verstöße: `{ file, key, rule, good, text }`. */
export function findViolations(entries, rules = WORD_RULES, exceptions = EXCEPTIONS) {
  const hits = []
  for (const e of entries) {
    for (const r of rules) {
      if (r.lang !== '*' && r.lang !== e.lang) continue
      if (!r.bad.test(e.text)) continue
      if (exceptions.some(x => x.rule === r.id && e.key.startsWith(x.keyPrefix))) continue
      hits.push({ file: e.file, key: e.key, rule: r.id, good: r.good, text: e.text })
    }
  }
  return hits
}

/** Manifeste mit `tier: 'optional'` ohne vollständigen Kundentext. */
export function missingCustomerTexts(manifests) {
  return manifests.filter(m => m.optional && !(m.customer?.de && m.customer?.en)).map(m => m.file)
}
