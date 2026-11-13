import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ACCOUNT_ACTIVITY_KINDS } from '../../core/shared/accountActivity'
import { ACCOUNT_EVENT_KINDS, ACCOUNT_EVENT_PROFILE_FIELDS } from '../../core/shared/accountEvents'
import { isAllowedControlPath } from '../../core/shared/controlCenter'
import { isControlOnlyPath } from '../shared/controlOnlyPaths'

/**
 * STRUKTURELLE Netze für AH-3 — dieselbe Bauart wie
 * `packages/core/tests/notificationBellTexts.test.ts`.
 *
 * Das Muster dahinter: ein neuer Wert in einer geschlossenen Union wird im
 * Server-Code widerspruchsfrei ergänzt und fällt erst in der Oberfläche auf,
 * wo vue-i18n bei fehlender Übersetzung den SCHLÜSSEL ausgibt. Typecheck, Lint
 * und Unit-Tests der Logik sehen davon nichts — dieser Test schon.
 */
const LOCALES = resolve(import.meta.dirname, '../i18n/locales')

function messages(locale: 'de' | 'en'): Record<string, string> {
  const json = JSON.parse(readFileSync(resolve(LOCALES, `${locale}.json`), 'utf8')) as Record<string, unknown>
  const kinds = (json.onboarding as Record<string, Record<string, Record<string, Record<string, string>>>>)
    ?.account?.activity?.kinds
  return kinds ?? {}
}

describe('Aktivitäts-Arten haben Texte', () => {
  for (const locale of ['de', 'en'] as const) {
    it(`jede Art hat einen ${locale}-Text`, () => {
      const kinds = messages(locale)
      for (const kind of ACCOUNT_ACTIVITY_KINDS) {
        expect(kinds[kind], `${locale}: onboarding.account.activity.kinds.${kind} fehlt`).toBeTruthy()
      }
    })
  }

  it('trägt keine überzähligen Arten mit (tote Texte fallen sonst nie auf)', () => {
    for (const locale of ['de', 'en'] as const) {
      expect(Object.keys(messages(locale)).sort()).toEqual([...ACCOUNT_ACTIVITY_KINDS].sort())
    }
  })
})

/**
 * Dasselbe Netz für den Abschnitt „Konto und Sicherheit" (2026-11-13): zwei
 * geschlossene Listen — die Arten der Konto-Ereignisse und die Namen der
 * Profil-Felder —, jede mit Text in beiden Sprachen und ohne Überzählige.
 */
describe('Konto-Ereignisse haben Texte', () => {
  function section(locale: 'de' | 'en', key: 'events' | 'fields'): Record<string, string> {
    const json = JSON.parse(readFileSync(resolve(LOCALES, `${locale}.json`), 'utf8')) as {
      onboarding?: { account?: { activity?: { account?: Record<string, Record<string, string>> } } }
    }
    return json.onboarding?.account?.activity?.account?.[key] ?? {}
  }

  for (const locale of ['de', 'en'] as const) {
    it(`jede Art und jedes Feld hat einen ${locale}-Text, und keinen zu viel`, () => {
      expect(Object.keys(section(locale, 'events')).sort()).toEqual([...ACCOUNT_EVENT_KINDS].sort())
      expect(Object.keys(section(locale, 'fields')).sort()).toEqual([...ACCOUNT_EVENT_PROFILE_FIELDS].sort())
      for (const text of [...Object.values(section(locale, 'events')), ...Object.values(section(locale, 'fields'))]) {
        expect(text).toBeTruthy()
      }
    })
  }

  it('die Feld-Liste deckt, was `auth/profile.put.ts` ins Protokoll schreibt', () => {
    // Die Route schreibt die Namen als Literale in `changedFields`. Kommt dort
    // ein Feld dazu, fiele es hier still unter den Tisch (unbekannte Namen
    // werden verworfen) — dieser Vergleich macht es laut.
    const source = readFileSync(resolve(import.meta.dirname, '../../core/server/api/auth/profile.put.ts'), 'utf8')
    const block = source.slice(source.indexOf('const changedFields = ['), source.indexOf('if (changedFields.length > 0)'))
    const written = [...block.matchAll(/\? \['([a-z]+)'\]/g)].map(match => match[1]!)
    expect(written.length).toBeGreaterThan(0)
    expect(written.sort()).toEqual([...ACCOUNT_EVENT_PROFILE_FIELDS].sort())
  })
})

/**
 * Der Endpunkt der Aktivität muss auf dem Kontroll-Host DURCHKOMMEN — und
 * zwar genau er. Ohne den Eintrag in `pukalani.tenancy.controlApiPrefixes`
 * antwortet `01.control-center.ts` mit 404, und die Seite wäre dauerhaft leer,
 * ohne dass irgendwo ein Fehler stünde.
 */
describe('/api/account/activity auf dem Kontroll-Host', () => {
  // Die Liste aus packages/core/app/app.config.ts — hier bewusst wörtlich
  // wiederholt, damit der Test die REGEL prüft und nicht die Config sich
  // selbst bestätigt.
  const PREFIXES = ['/api/auth/', '/api/onboarding/', '/api/health', '/api/telemetry/', '/api/notifications', '/api/feedback', '/api/abuse', '/api/account/activity']

  it('lässt genau diesen Pfad durch', () => {
    expect(isAllowedControlPath('/api/account/activity', PREFIXES)).toBe(true)
    expect(isAllowedControlPath('/api/account/activity?x=1', PREFIXES)).toBe(true)
  })

  it('öffnet NICHT das ganze Verzeichnis /api/account/', () => {
    // Der Grund, warum der exakte Pfad in der Liste steht und nicht das
    // Verzeichnis: eine künftige Konto-Route soll bewusst eingetragen werden
    // müssen, statt still mitzureisen.
    for (const path of ['/api/account/export', '/api/account/delete', '/api/account/']) {
      expect(isAllowedControlPath(path, PREFIXES), path).toBe(false)
    }
  })

  it('öffnet auch keinen Nachbarn, der zufällig so anfängt', () => {
    expect(isAllowedControlPath('/api/account/activityfeed', PREFIXES)).toBe(false)
  })
})

/**
 * Die Gegenrichtung: auf einem MANDANTEN-Host haben beide neuen Seiten nichts
 * zu suchen. `/profile` und `/settings` stehen schon in CONTROL_ONLY_PATHS —
 * dieser Test nagelt fest, dass die Segmentgrenzen-Regel ihre neuen Kinder
 * mitnimmt, ohne dass jemand die Liste erweitern muss.
 */
describe('Die neuen Konto-Seiten bleiben auf dem Kontroll-Host', () => {
  it('sperrt /profile/activity und /settings/billing auf Mandanten-Hosts', () => {
    expect(isControlOnlyPath('/profile/activity')).toBe(true)
    expect(isControlOnlyPath('/settings/billing')).toBe(true)
  })
})
