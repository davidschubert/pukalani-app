import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  collectRepoTexts,
  EXCEPTIONS,
  findViolations,
  missingCustomerTexts,
  readManifests,
  WORD_RULES,
} from '../../../scripts/lib/customer-words.mjs'

/**
 * DIE WORTLISTE FÜR KUNDENTEXTE (Q16). Liste und Ausnahmen:
 * `scripts/lib/customer-words.mjs`, Lauf im Lint: `pnpm check:customer-words`.
 *
 * Der Test beweist drei Dinge: der echte Stand ist sauber; jede Regel schlägt
 * an einem eingebauten Fehler an (Gegenprobe), und die erlaubten Formen
 * daneben bleiben grün; jede Ausnahme nimmt noch etwas aus.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url))

type Entry = { file: string, lang: 'de' | 'en', key: string, text: string }
const entry = (lang: 'de' | 'en', text: string, key = 'probe.text'): Entry => ({ file: 'probe.json', lang, key, text })

describe('Wortliste für Kundentexte', () => {
  it('der echte Stand hat kein verbanntes Wort', () => {
    expect(findViolations(collectRepoTexts(REPO))).toEqual([])
  })

  it('jedes optionale Produkt hat einen Kundentext in beiden Sprachen', () => {
    expect(missingCustomerTexts(readManifests(REPO))).toEqual([])
  })

  it('Gegenprobe: jede Regel schlägt an einem alten Wort an', () => {
    const bad: Record<string, Entry> = {
      'konto': entry('de', 'Melde dich mit deinem Account an.'),
      'einladungscode': entry('de', 'Gib deinen Einladungs-Code ein.'),
      'invite-code': entry('en', 'Redeem invitation code'),
      'brand-advisor': entry('en', 'your brand consultant takes over'),
      'instanz': entry('de', 'Die KI ist auf dieser Instanz abgeschaltet.'),
      'instance': entry('en', 'AI is switched off on this instance.'),
      'marken-entdecken': entry('de', 'Discover Brands'),
      'marke': entry('de', 'Zurück zu den Brands'),
      'brand-score': entry('de', 'Brand-Score neu ermitteln'),
      'upvote': entry('de', 'Hochvoten'),
      'glocke': entry('de', 'Bell-Benachrichtigungen'),
      'prefs': entry('en', 'Stored in your account prefs.'),
      'schicht': entry('en', 'Brand Design (layer 2)'),
      'menu-de': entry('de', 'Products'),
      'eszett': entry('de', 'Wie heisst eure Marke?'),
    }
    expect(Object.keys(bad).sort()).toEqual(WORD_RULES.map(r => r.id).sort())
    for (const [id, e] of Object.entries(bad)) {
      expect(findViolations([e]).map(h => h.rule), id).toContain(id)
    }
  })

  it('erlaubte Formen bleiben grün', () => {
    const ok = [
      entry('de', 'Dein Konto'),
      entry('de', 'Einladungscode einlösen'),
      entry('de', 'Brand Design, Brand Book & Kit, Brand-Check, Brand Score, Brand Insights'),
      entry('de', 'für alle, die ihre Personal Brand aufbauen'),
      entry('de', 'Sub-Brands, Endorsed Brands, House of Brands'),
      entry('de', 'Marke des Tages · Marken entdecken'),
      entry('de', 'Upvote'),
      entry('de', 'Wie heißt eure Marke? Ein Team.'),
      entry('en', 'Discover Brands · your brand advisor · invite code'),
    ]
    expect(findViolations(ok)).toEqual([])
  })

  it('eine Sprache prüft nur ihre Regeln: englische Wörter in en sind erlaubt', () => {
    expect(findViolations([entry('en', 'Account settings · Products · About')])).toEqual([])
  })

  it('jede Ausnahme nimmt im echten Stand noch etwas aus', () => {
    const texts = collectRepoTexts(REPO)
    for (const x of EXCEPTIONS) {
      const rule = WORD_RULES.find(r => r.id === x.rule)
      expect(rule, x.rule).toBeTruthy()
      const used = texts.some(e => e.key.startsWith(x.keyPrefix) && (rule!.lang === '*' || rule!.lang === e.lang) && rule!.bad.test(e.text))
      expect(used, `${x.rule} · ${x.keyPrefix}`).toBe(true)
    }
  })

  it('eine Ausnahme gilt nur für ihren Schlüssel-Anfang', () => {
    expect(findViolations([entry('de', 'Backend-Instanz', 'dashboard.system.appwrite.description')])).toEqual([])
    expect(findViolations([entry('de', 'Backend-Instanz', 'onboarding.x')]).map(h => h.rule)).toEqual(['instanz'])
  })
})
