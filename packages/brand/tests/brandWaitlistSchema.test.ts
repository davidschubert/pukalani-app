import { describe, expect, it } from 'vitest'
import {
  BRAND_WAITLIST_TOKEN_MAX,
  BRAND_WAITLIST_TOKEN_MIN,
  BRAND_WAITLIST_WEBSITE_MAX,
  createBrandWaitlistConfirmSchema,
  createBrandWaitlistSchema,
} from '../schemas/brandWaitlist'

/**
 * DER RUMPF DER WARTELISTE — die Normalisierung ist hier die Aussage, nicht die
 * Ablehnung.
 *
 * Die Route vergleicht `emailLower` mit dem Wert, den DIESES Schema liefert;
 * würde es nicht trimmen oder nicht kleinschreiben, entstünde für jede
 * Schreibweise derselben Adresse eine eigene Zeile — und der UNIQUE-Index
 * merkte davon nichts. Deshalb steht die Reihenfolge trim → lowercase → email
 * hier unter Beobachtung.
 */
describe('createBrandWaitlistSchema', () => {
  const schema = createBrandWaitlistSchema()

  it('normalisiert die Adresse: erst trimmen und kleinschreiben, dann prüfen', () => {
    const parsed = schema.parse({ email: '  Aloha@Kailua.Coffee ' })
    expect(parsed.email).toBe('aloha@kailua.coffee')
  })

  it('lehnt eine kaputte Adresse ab', () => {
    expect(schema.safeParse({ email: 'kein-at-zeichen' }).success).toBe(false)
    expect(schema.safeParse({ email: '' }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('macht aus fehlenden Feldern leere Strings und aus fehlender Sprache "en"', () => {
    const parsed = schema.parse({ email: 'a@b.de' })
    expect(parsed.name).toBe('')
    expect(parsed.company).toBe('')
    expect(parsed.website).toBe('')
    expect(parsed.source).toBe('')
    expect(parsed.locale).toBe('en')
    expect(parsed.hp).toBeUndefined()
  })

  it('nimmt die leeren Felder, die das Formular tatsächlich schickt', () => {
    // `BwWaitlistForm` sendet website/hp IMMER mit, auch leer — ein `.strict()`
    // ohne diese Duldung wäre ein 400 auf jede ausgefüllte Kurzform.
    const parsed = schema.parse({ email: 'a@b.de', website: '', hp: '', locale: 'de', source: 'about' })
    expect(parsed.website).toBe('')
    expect(parsed.hp).toBe('')
  })

  it('ergänzt ein fehlendes Schema in der Web-Adresse', () => {
    expect(schema.parse({ email: 'a@b.de', website: 'kailua.coffee' }).website)
      .toBe('https://kailua.coffee')
    // Ein vorhandenes Schema bleibt, wie es war.
    expect(schema.parse({ email: 'a@b.de', website: 'http://kailua.coffee' }).website)
      .toBe('http://kailua.coffee')
  })

  it('lehnt ab, was auch mit Schema keine Adresse ist', () => {
    // Kein Punkt im Hostnamen ⇒ ein Wort, keine Website.
    expect(schema.safeParse({ email: 'a@b.de', website: 'hallo' }).success).toBe(false)
    // Falsches Schema wird NICHT still verbogen, sondern abgelehnt.
    expect(schema.safeParse({ email: 'a@b.de', website: 'ftp://kailua.coffee' }).success).toBe(false)
    // Auch nach dem Ergänzen gilt der Spalten-Deckel.
    const long = `${'a'.repeat(BRAND_WAITLIST_WEBSITE_MAX - 4)}.de`
    expect(schema.safeParse({ email: 'a@b.de', website: long }).success).toBe(false)
  })

  it('deckelt Herkunft, Name, Firma und die Sprache', () => {
    expect(schema.safeParse({ email: 'a@b.de', source: 'x'.repeat(65) }).success).toBe(false)
    expect(schema.safeParse({ email: 'a@b.de', name: 'x'.repeat(121) }).success).toBe(false)
    expect(schema.safeParse({ email: 'a@b.de', company: 'x'.repeat(161) }).success).toBe(false)
    expect(schema.safeParse({ email: 'a@b.de', locale: 'fr' }).success).toBe(false)
  })

  it('ERLAUBT den Honigtopf — ein 400 wäre die Rückmeldung an den Bot', () => {
    const parsed = schema.parse({ email: 'a@b.de', hp: 'ich bin ein Skript' })
    expect(parsed.hp).toBe('ich bin ein Skript')
    // Alles andere bleibt trotzdem draußen: `.strict()` gilt weiter.
    expect(schema.safeParse({ email: 'a@b.de', status: 'invited' }).success).toBe(false)
  })
})

/**
 * DER RUMPF DER BESTÄTIGUNG — hier ist die GRENZE die Aussage.
 *
 * Der Token ist das einzige Geheimnis dieser Route; gemessen wird er, BEVOR er
 * gehasht und abgefragt wird. Ohne den Deckel liefe ein 10-MB-„Token" erst
 * durch sha256 und dann in eine Appwrite-Abfrage.
 */
describe('createBrandWaitlistConfirmSchema', () => {
  const schema = createBrandWaitlistConfirmSchema()
  /** So lang, wie ihn `randomBytes(32).toString('hex')` liefert. */
  const token = 'a'.repeat(64)

  it('nimmt einen echten Token und trimmt ihn', () => {
    expect(schema.parse({ token }).token).toBe(token)
    expect(schema.parse({ token: `  ${token} ` }).token).toBe(token)
  })

  it('lehnt zu kurz, zu lang und leer ab', () => {
    expect(schema.safeParse({ token: '' }).success).toBe(false)
    expect(schema.safeParse({ token: 'a'.repeat(BRAND_WAITLIST_TOKEN_MIN - 1) }).success).toBe(false)
    expect(schema.safeParse({ token: 'a'.repeat(BRAND_WAITLIST_TOKEN_MAX + 1) }).success).toBe(false)
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('nimmt nur dieses eine Feld', () => {
    expect(schema.safeParse({ token, email: 'a@b.de' }).success).toBe(false)
  })
})
