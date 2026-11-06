import { beforeAll, describe, expect, it } from 'vitest'
import {
  BRAND_INTRO_MESSAGE_MAX,
  BRAND_INTRO_MIN_ELAPSED_MS,
  brandIntroTooFast,
  createBrandIntroCallSchema,
  createBrandIntroListQuerySchema,
  createBrandIntroPatchSchema,
} from '../schemas/brandIntroCall'
import {
  BRAND_INTRO_STATUSES,
  brandIntroStatusValues,
  normalizeBrandIntroStatus,
} from '../shared/brandIntroCall'

/**
 * BS1 Z0 — die Regeln der Erstgespräch-Seite, jede mit GEGENPROBE.
 *
 * Ein Test, der nur den guten Fall kennt, ist bei einer aufgeweichten Regel
 * weiterhin grün: zu jedem „nimmt an" steht hier ein „lehnt ab", und zu jeder
 * Grenze der Wert direkt daneben.
 *
 * Der Layer-Default wird aus der ECHTEN `app.config.ts` gelesen, nicht
 * abgeschrieben — sonst prüfte der Test seine eigene Kopie (dasselbe Vorgehen
 * wie in `brandCompletionCta.test.ts`).
 */

const parse = (body: unknown) => createBrandIntroCallSchema().parse(body)

/** Der kleinste gültige Rumpf — jeder Fall unten variiert genau ein Feld. */
const VALID = {
  name: 'Alina Weber',
  email: 'alina@example.com',
  message: 'Wir starten neu und wissen nicht, wo wir anfangen sollen.',
}

describe('createBrandIntroCallSchema', () => {
  it('nimmt die drei Pflichtfelder und füllt den Rest mit Vorgaben', () => {
    const body = parse(VALID)
    expect(body.name).toBe('Alina Weber')
    expect(body.email).toBe('alina@example.com')
    expect(body.company).toBe('')
    expect(body.phone).toBe('')
    expect(body.profileId).toBe('')
    expect(body.source).toBe('')
    // `en` als Default und nicht `de`: die Seite schickt ihre Sprache immer
    // mit; die Vorgabe greift nur für einen Aufruf ohne Oberfläche.
    expect(body.locale).toBe('en')
  })

  it('normalisiert die Adresse: erst trimmen, dann kleinschreiben', () => {
    // Genau die Reihenfolge, die einen kopierten Wert rettet — ein führendes
    // Leerzeichen würde `z.email()` sonst ablehnen und einen Lead kosten.
    expect(parse({ ...VALID, email: '  Alina@Example.COM ' }).email).toBe('alina@example.com')
  })

  it('lehnt eine kaputte Adresse ab — die Gegenprobe zur Normalisierung', () => {
    expect(() => parse({ ...VALID, email: 'alina@' })).toThrow()
  })

  it('verlangt Name UND Anliegen — ein leeres Feld ist keine Anfrage', () => {
    expect(() => parse({ ...VALID, name: '   ' })).toThrow()
    expect(() => parse({ ...VALID, message: '' })).toThrow()
  })

  it('deckelt das Anliegen bei 1000 Zeichen — und lässt 1000 durch', () => {
    expect(parse({ ...VALID, message: 'x'.repeat(BRAND_INTRO_MESSAGE_MAX) }).message.length)
      .toBe(BRAND_INTRO_MESSAGE_MAX)
    expect(() => parse({ ...VALID, message: 'x'.repeat(BRAND_INTRO_MESSAGE_MAX + 1) })).toThrow()
  })

  it('lässt den Honigtopf zu, statt ihn mit einem 400 zu verraten', () => {
    // Das ist der ganze Trick: `.strict()` würde ein unbekanntes Feld ablehnen
    // und dem Bot damit sagen, dass es die Falle gibt. Ausgewertet wird sie in
    // der Route.
    expect(parse({ ...VALID, hp: 'gefuellt' }).hp).toBe('gefuellt')
  })

  it('weist ein FREMDES Feld ab — die Gegenprobe zu `.strict()`', () => {
    expect(() => parse({ ...VALID, isAdmin: true })).toThrow()
  })

  it('lässt nur Id-Zeichen in `profileId` zu', () => {
    expect(parse({ ...VALID, profileId: 'abc-123_XY' }).profileId).toBe('abc-123_XY')
    // Eine Id aus der Adresszeile geht in eine Appwrite-Abfrage; alles ausser
    // dem Id-Zeichensatz ist ein Versuch, kein Tippfehler.
    expect(() => parse({ ...VALID, profileId: 'abc 123' })).toThrow()
    expect(() => parse({ ...VALID, profileId: '../etc' })).toThrow()
  })

  it('nimmt nur die zwei Sprachen der Oberfläche', () => {
    expect(parse({ ...VALID, locale: 'de' }).locale).toBe('de')
    expect(() => parse({ ...VALID, locale: 'fr' })).toThrow()
  })
})

describe('brandIntroTooFast', () => {
  it('bremst unter der Mindestzeit', () => {
    expect(brandIntroTooFast(0)).toBe(true)
    expect(brandIntroTooFast(BRAND_INTRO_MIN_ELAPSED_MS - 1)).toBe(true)
  })

  it('lässt die Mindestzeit selbst und alles darüber durch', () => {
    expect(brandIntroTooFast(BRAND_INTRO_MIN_ELAPSED_MS)).toBe(false)
    expect(brandIntroTooFast(60_000)).toBe(false)
  })

  it('bremst NICHT, wenn gar keine Zeit gemeldet wurde', () => {
    // Fail-open, und zwar bewusst: das Feld ist optional, und ein Browser ohne
    // brauchbare Uhr darf keinen Kunden kosten. Die Bremse, die zählt, ist die
    // Drossel je IP.
    expect(brandIntroTooFast(undefined)).toBe(false)
  })

  it('bremst NICHT bei einer unsinnigen Uhr', () => {
    // Ein negativer Wert sagt etwas über den Client, nichts über einen Bot.
    expect(brandIntroTooFast(-5)).toBe(false)
    expect(brandIntroTooFast(Number.NaN)).toBe(false)
  })
})

describe('normalizeBrandIntroStatus', () => {
  it('lässt die drei bekannten Zustände stehen', () => {
    for (const status of BRAND_INTRO_STATUSES) {
      expect(normalizeBrandIntroStatus(status)).toBe(status)
    }
  })

  it('fällt auf `new` zurück — nicht auf `closed`', () => {
    // Die Richtung ist die Entscheidung: eine Zeile mit kaputtem Zustand in der
    // Arbeitsliste zu zeigen ist der Fehler, den man bemerkt; sie als erledigt
    // zu verstecken der, den niemand bemerkt.
    expect(normalizeBrandIntroStatus('erledigt')).toBe('new')
    expect(normalizeBrandIntroStatus(undefined)).toBe('new')
    expect(normalizeBrandIntroStatus('')).toBe('new')
  })
})

describe('brandIntroStatusValues', () => {
  it('filtert auf genau einen Zustand', () => {
    expect(brandIntroStatusValues('new')).toEqual(['new'])
  })

  it('filtert bei „alle" GAR NICHT — statt die drei aufzuzählen', () => {
    // Eine Aufzählung liesse eine von Hand gesetzte, unbekannte Zeile aus
    // JEDER Ansicht fallen, auch aus „alle". Genau das darf „alle" nicht tun.
    expect(brandIntroStatusValues('all')).toBeNull()
  })
})

describe('createBrandIntroPatchSchema', () => {
  const patch = (body: unknown) => createBrandIntroPatchSchema().parse(body)

  it('nimmt Zustand allein und Notiz allein', () => {
    expect(patch({ status: 'contacted' })).toEqual({ status: 'contacted' })
    expect(patch({ note: 'Termin steht' })).toEqual({ note: 'Termin steht' })
  })

  it('lehnt einen LEEREN Patch ab', () => {
    // Sonst wäre ein Aufruf ohne Felder ein erfolgreiches Nichts — und die
    // Route schriebe eine Zeile, ohne dass sich etwas ändert.
    expect(() => patch({})).toThrow()
  })

  it('lässt eine leere Notiz zu — „Notiz löschen" ist eine Handlung', () => {
    expect(patch({ note: '' })).toEqual({ note: '' })
  })

  it('lehnt einen unbekannten Zustand ab', () => {
    expect(() => patch({ status: 'done' })).toThrow()
  })
})

describe('createBrandIntroListQuerySchema', () => {
  it('filtert per Vorgabe auf `new` — die Arbeitsliste', () => {
    expect(createBrandIntroListQuerySchema().parse({}).status).toBe('new')
  })

  it('deckelt das Limit, statt es dem Aufrufer zu überlassen', () => {
    expect(() => createBrandIntroListQuerySchema().parse({ limit: 5000 })).toThrow()
  })

  it('lässt Fremdes in der Query zu (kein `.strict()`)', () => {
    // Eine Query trägt regelmässig Cache-Brecher mit sich; ein 400 darauf wäre
    // eine Fehlfunktion ohne Angreifer.
    expect(createBrandIntroListQuerySchema().parse({ _: '123' }).status).toBe('new')
  })

  it('prüft den Cursor trotzdem — er reist über die Adresszeile', () => {
    expect(() => createBrandIntroListQuerySchema().parse({ cursor: 'a b' })).toThrow()
  })
})

/**
 * DER LAYER-DEFAULT — gelesen aus der echten Datei. `defineAppConfig` ist ein
 * Auto-Import von Nuxt und existiert hier nicht; der Stub gibt die Config
 * unverändert zurück, was genau ihre Laufzeit-Bedeutung ist.
 */
describe('Layer-Config', () => {
  let brandConfig: Record<string, unknown> = {}
  let adminModules: { id: string, to?: string, labelKey?: string, requiredCapability?: string }[] = []

  beforeAll(async () => {
    ;(globalThis as Record<string, unknown>).defineAppConfig = (config: unknown) => config
    const mod = await import('../app/app.config') as {
      default: {
        pukalani: {
          brand: Record<string, unknown>
          admin: { modules: { id: string, to?: string, labelKey?: string, requiredCapability?: string }[] }
        }
      }
    }
    brandConfig = mod.default.pukalani.brand
    adminModules = mod.default.pukalani.admin.modules
  })

  it('hat einen eigenen, LEEREN Empfänger für die Betreiber-Meldung', () => {
    // Leer ist der Default und heisst „keine Mail". Ein erfundener
    // Standard-Empfänger wäre eine Zustellung ins Nichts, die wie eine
    // Zustellung aussieht.
    expect(brandConfig.introCallNotify).toBe('')
  })

  it('teilt ihn NICHT mit der Warteliste — zwei Fragen, zwei Schlüssel', () => {
    expect(Object.keys(brandConfig)).toContain('waitlistNotify')
    expect(Object.keys(brandConfig)).toContain('introCallNotify')
  })

  it('zeigt den Abschluss-CTA im Layer wieder auf die eigene Seite', () => {
    // Seit Z0 gibt es `/erstgespraech` in diesem Layer — der Default ist damit
    // kein Versprechen mehr, das eine App einlösen müsste.
    expect(brandConfig.completionCta).toMatchObject({ type: 'route', to: '/erstgespraech' })
  })

  it('meldet die Betreiber-Seite mit derselben Capability wie ihre Nachbarn an', () => {
    const entry = adminModules.find(module => module.id === 'brand-intro-calls')
    expect(entry).toBeDefined()
    expect(entry?.to).toBe('/dashboard/intro-calls')
    expect(entry?.requiredCapability).toBe('users.manage')
    expect(entry?.labelKey).toBe('brand.admin.introCalls.nav')
  })
})
