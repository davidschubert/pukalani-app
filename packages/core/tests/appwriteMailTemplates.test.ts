import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  PROJECTS,
  REQUIRED,
  TEMPLATE_LOCALES,
  TEMPLATE_TYPES,
  brandForProject,
  brandFromAppConfig,
  compareTemplate,
  desiredTemplate,
  fillTemplate,
  formatDiff,
  templateProblems,
} from '../../../scripts/ops/appwrite-mail/templates.mjs'

/**
 * ANMELDE-MAILS VON APPWRITE (Q06, BRD-001): jede Vorlage jedes Projekts
 * trägt die Marke, keinen „team"-Gruß, alle Platzhalter, die Appwrite für
 * ihren Zweck braucht — und die Marke kommt aus der App, nicht aus dem Skript.
 */
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const PROJECT_IDS = Object.keys(PROJECTS) as (keyof typeof PROJECTS)[]

describe('Appwrite-Mail-Vorlagen — jede Art, Sprache und jedes Projekt', () => {
  for (const project of PROJECT_IDS) {
    const brand = brandForProject(project)
    for (const type of TEMPLATE_TYPES) {
      for (const locale of TEMPLATE_LOCALES) {
        it(`${project} · ${type}/${locale}`, () => {
          const filled = desiredTemplate(type, locale, project, { brand })
          expect(templateProblems(type, filled)).toEqual([])
          expect(filled.subject).toContain(brand)
          expect(filled.senderName).toBe(brand)
          // Schluss-Zeile nach R6: Gruß und darunter die Marke.
          expect(filled.message).toContain(locale === 'de' ? 'Viele Grüße' : 'Best regards')
          expect(filled.message).toContain(`<p style="margin-top: 0px;">${brand}</p>`)
          expect(filled.message.startsWith(locale === 'de' ? '<p>Hallo' : '<p>Hi')).toBe(true)
          expect(filled.message).not.toMatch(/Account team|\{\{project\}\}/)
        })
      }
    }
  }

  it('die Marke stammt aus der app.config.ts der App, die das Projekt im site.manifest.ts nennt', () => {
    for (const [project, entry] of Object.entries(PROJECTS)) {
      const manifest = readFileSync(join(REPO, 'apps', entry.app, 'site.manifest.ts'), 'utf8')
      expect(manifest, `apps/${entry.app} nennt ${project} nicht in appwriteProjects`).toMatch(new RegExp(`appwriteProjects:\\s*\\[[^\\]]*'${project}'`))
    }
    expect(brandForProject('account')).toBe('Pukalani')
    // control: Kopf-Name „Pukalani Control", vor der Kundschaft „Pukalani".
    expect(brandForProject('admin')).toBe('Pukalani')
    expect(brandForProject('branding')).toBe('Branding Supply')
  })

  it('branding.supply sagt „ihr", der Pool „du"', () => {
    expect(desiredTemplate('recovery', 'de', 'branding', { brand: 'X' }).message).toContain('euer Konto')
    expect(desiredTemplate('recovery', 'de', 'account', { brand: 'X' }).message).toContain('dein Konto')
  })
})

describe('Gegenproben — die Prüfung sieht Fehler', () => {
  it('fehlender Pflicht-Platzhalter, Rest eines eigenen Platzhalters und „team" sind rot', () => {
    const broken = { subject: 'Code für {brand}', message: '<p>Hallo,</p><p>Thanks, Account team</p>', senderName: 'X' }
    const problems = templateProblems('otpSession', broken)
    expect(problems).toContain(`Platzhalter ${REQUIRED.otpSession[0]} fehlt`)
    expect(problems).toContain('subject: ungefüllter Platzhalter')
    expect(problems).toContain('message: enthält „team"')
  })

  it('unbekanntes Projekt bricht ab', () => {
    expect(() => desiredTemplate('recovery', 'de', 'photos-qgry' as never)).toThrow(/Unbekanntes Projekt/)
  })

  it('brandFromAppConfig: mailName vor name, mehrzeiliger Block, kein Block', () => {
    expect(brandFromAppConfig(`x\n    brand: { name: 'A Control', mailName: 'A' },\n`)).toBe('A')
    expect(brandFromAppConfig(`  pukalani: {\n    brand: {\n      name: 'B',\n      // mailName: 'nicht im Block'\n    },\n    other: { mailName: 'falsch' },\n`)).toBe('B')
    expect(brandFromAppConfig('export default {}')).toBeNull()
  })

  it('fillTemplate wählt die Form je Projekt', () => {
    expect(fillTemplate('[[dein|euer]] {brand}', { brand: 'M', anrede: 'ihr' })).toBe('euer M')
    expect(fillTemplate('[[dein|euer]] {brand}', { brand: 'M', anrede: 'du' })).toBe('dein M')
  })
})

describe('Vergleich IST gegen SOLL', () => {
  const desired = { subject: 'S', message: '<p>M</p>', senderName: 'N' }
  it('gleiche Werte ⇒ „stimmt"', () => {
    expect(formatDiff('recovery', 'de', compareTemplate({ ...desired }, desired))).toBe('recovery/de: stimmt')
  })
  it('Appwrite-Standard ⇒ alle drei Felder mit alt → neu', () => {
    const diffs = compareTemplate({ subject: 'Password Reset for Account', message: '<p>x</p>', senderName: '' }, desired)
    expect(diffs.map(d => d.field)).toEqual(['subject', 'senderName', 'message'])
    expect(formatDiff('recovery', 'en', diffs)).toBe('recovery/en: ändert Betreff „Password Reset for Account" → „S", Absender „" → „N", Text (8 → 8 Zeichen)')
  })
})
