import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * WELCHE ROUTEN ÜBERHAUPT IN DER DROSSEL STEHEN (Audit-Punkt AU2, 2026-08-15).
 *
 * Eine fehlende Zeile in `05.rate-limit.ts` sieht aus wie gar nichts: die Route
 * antwortet, die Seite funktioniert, nur ist sie eben unbegrenzt oft
 * aufrufbar. Genau so haben vier Einträge über Monate gefehlt — die
 * Handle-Suche war im Quelltext sogar ausdrücklich als „bekannte Lücke"
 * vermerkt und blieb es trotzdem.
 *
 * Der Test liest die LISTE, nicht das Verhalten. Das ist bewusst: die
 * Middleware hängt an Nitros Auto-Imports (`useRateLimitStore`,
 * `trustedClientIp`, `getRequestURL`) und ist ohne halbe Nitro-Attrappe nicht
 * aufrufbar; die Frage „steht die Route drin" ist aber genau die, die hier
 * schiefgegangen ist. Das VERHALTEN der Zählung deckt `rateLimitStore.test.ts`
 * ab, die Erkennung der 429 im Client `rateLimitedError.test.ts`.
 */
const quelle = readFileSync(
  new URL('../server/middleware/05.rate-limit.ts', import.meta.url),
  'utf8',
)

/** Der Teil ab der Liste — der Kopf-Kommentar erklärt Klassen, die er nennt. */
const listen = quelle.slice(quelle.indexOf('const ALWAYS_LIMITED'))

/**
 * Findet den Eintrag zu einem Pfad und gibt Bucket + Deckel zurück.
 *
 * Erwartet den Pfad GENAU so, wie er im Regex der Liste steht (also mit
 * `\/`) — gesucht wird die Zeile `{ re: /^…$/`, nicht der blosse Pfad. Sonst
 * fände ein `includes('/api/handles/search')` auch einen Kommentar, der die
 * Route nur erwähnt. Genau das war der Zustand vorher: erwähnt, nicht gelistet.
 */
function eintrag(regexRumpf: string): { bucket: string, max: number | null } | null {
  const zeile = listen
    .split('\n')
    .find(line => line.includes(`{ re: /^${regexRumpf}$/`))
  if (!zeile) return null
  const bucket = /bucket: '([^']+)'/.exec(zeile)?.[1] ?? ''
  const maxRoh = /max: ([A-Z_]+|\d+)/.exec(zeile)?.[1] ?? null
  if (maxRoh === null) return { bucket, max: null }
  const alsZahl = Number(maxRoh)
  if (Number.isFinite(alsZahl)) return { bucket, max: alsZahl }
  // Symbolische Deckel (READ_MAX, TOKEN_MAX, …) aus ihrer Deklaration lesen.
  const wert = new RegExp(`const ${maxRoh} = (\\d[\\d_]*)`).exec(quelle)?.[1]
  return { bucket, max: wert ? Number(wert.replace(/_/g, '')) : null }
}

describe('Drossel-Liste in 05.rate-limit.ts', () => {
  it('deckelt den Namenswechsel eng — er schreibt mit dem Admin-Client und ist ein Namens-Orakel', () => {
    const treffer = eintrag('PATCH \\/api\\/account\\/handle')
    expect(treffer, 'PATCH /api/account/handle fehlt in WRITE_LIMITED').not.toBeNull()
    // Ein Mensch benennt sich einmal in 30 Tagen um; alles über den fünf
    // Versuchen der Auth-Geschwister wäre hier ein Zugeständnis an Skripte.
    expect(treffer?.max).toBeLessThanOrEqual(5)
  })

  it('drosselt die Handle-Suche — und teilt ihren Eimer NICHT mit den Themen', () => {
    const suche = eintrag('GET \\/api\\/handles\\/search')
    const themen = eintrag('GET \\/api\\/posts\\/discussions\\/link-search')
    expect(suche, 'GET /api/handles/search fehlt in WRITE_LIMITED').not.toBeNull()
    // Beide Menüs leben in DERSELBEN Schreibfläche: ein gemeinsamer Eimer
    // hiesse, dass ein Beitrag mit Themen UND Erwähnungen sich selbst sperrt.
    expect(suche?.bucket).not.toBe(themen?.bucket)
    // Der Client entprellt um 150 ms, ein Mensch tippt langsamer — es fliegt
    // rund eine Anfrage je Zeichen. Vier Erwähnungen à acht Zeichen sind schon
    // gut 30 Anfragen; ein knapperer Deckel würde das Menü beim Schreiben
    // abwürgen statt Missbrauch zu bremsen.
    expect(suche?.max).toBeGreaterThanOrEqual(60)
  })

  it('nennt die Handle-Suche nicht mehr eine „bekannte Lücke"', () => {
    // Ein Kommentar, der eine geschlossene Lücke behauptet, schickt den
    // nächsten Leser auf eine falsche Fährte — und ein Kommentar, der eine
    // OFFENE Lücke bloss benennt, hat sie noch nie geschlossen.
    expect(quelle).not.toContain('bekannte Lücke')
  })

  it('drosselt das Mess-Ereignis wie sein Geschwister aus der Fehler-Inbox', () => {
    const stats = eintrag('POST \\/api\\/stats-event')
    const telemetry = eintrag('POST \\/api\\/telemetry\\/error')
    expect(stats, 'POST /api/stats-event fehlt in WRITE_LIMITED').not.toBeNull()
    // Gastoffen, ein ausgehender fetch je Aufruf: dieselbe Kostenklasse,
    // deshalb dieselbe Zahl. Eigener Eimer, weil es zwei Melder sind.
    expect(stats?.max).toBe(telemetry?.max)
    expect(stats?.bucket).not.toBe(telemetry?.bucket)
  })

  it('deckelt beide Reaktions-Umschalter, bevor sie ihr Ziel lesen', () => {
    const kommentare = eintrag('POST \\/api\\/comments\\/[^/]+\\/reactions')
    const themen = eintrag('POST \\/api\\/posts\\/discussions\\/reactions')
    expect(kommentare, 'POST /api/comments/:id/reactions fehlt').not.toBeNull()
    expect(themen, 'POST /api/posts/discussions/reactions fehlt').not.toBeNull()
    // Ohne eigenen `max` gilt der Standard-Schreibdeckel (60/min) — genau die
    // Zahl, die die Routen selbst je Mensch und Community führen.
    expect(kommentare?.max).toBeNull()
    expect(themen?.max).toBeNull()
    // Getrennte Eimer wie bei den Stimmen: wer eine Diskussion durchliest,
    // soll sich mit Antwort-Reaktionen nicht die Themen-Reaktionen sperren.
    expect(kommentare?.bucket).not.toBe(themen?.bucket)
  })

  // Audit-Runde 5 (2026-08-16): die Schreibwege von events/courses/billing/
  // tickets waren als einzige ihrer jeweiligen Klasse ohne Backstop.
  it('deckelt die member-led Aktionen von events und kursen (Standard-Schreibdeckel)', () => {
    for (const [pfad, name] of [
      ['POST \\/api\\/events\\/[^/]+\\/rsvp', 'events rsvp'],
      ['POST \\/api\\/events\\/[^/]+\\/score', 'events score'],
      ['POST \\/api\\/courses\\/[^/]+\\/enroll', 'courses enroll'],
      ['POST \\/api\\/lessons\\/[^/]+\\/complete', 'lessons complete'],
    ] as const) {
      const treffer = eintrag(pfad)
      expect(treffer, `${name} fehlt in WRITE_LIMITED`).not.toBeNull()
      // Ohne eigenen `max` = Standard-Schreibdeckel (60/min), wie posts:vote.
      expect(treffer?.max, `${name} sollte den Standard-Deckel tragen`).toBeNull()
    }
  })

  it('deckelt die Binär-Uploads von event-cover und ticket-anhang wie /api/media', () => {
    const media = eintrag('POST \\/api\\/media')
    for (const [pfad, name] of [
      ['POST \\/api\\/events\\/[^/]+\\/cover', 'events cover'],
      ['POST \\/api\\/tickets\\/[^/]+\\/files', 'tickets files'],
    ] as const) {
      const treffer = eintrag(pfad)
      expect(treffer, `${name} fehlt in WRITE_LIMITED`).not.toBeNull()
      // Dieselbe Binär-auf-die-Platte-Klasse ⇒ dieselbe Zahl wie /api/media.
      expect(treffer?.max, `${name} sollte den media-Deckel tragen`).toBe(media?.max)
    }
  })

  it('deckelt die Stripe-Anlege-Routen — checkout enger als portal', () => {
    const checkout = eintrag('POST \\/api\\/billing\\/checkout')
    const portal = eintrag('POST \\/api\\/billing\\/portal')
    expect(checkout, 'POST /api/billing/checkout fehlt in WRITE_LIMITED').not.toBeNull()
    expect(portal, 'POST /api/billing/portal fehlt in WRITE_LIMITED').not.toBeNull()
    // checkout legt ZWEI Stripe-Objekte je Ruf an (Customer + Session), portal
    // nur eine Session — deshalb ist checkout der engere Eimer.
    expect(checkout?.max ?? Infinity).toBeLessThanOrEqual(portal?.max ?? Infinity)
    expect(checkout?.bucket).not.toBe(portal?.bucket)
  })

  /**
   * Audit-Runde Brand Design (2026-09-09): von den vier KI-Läufen des
   * Zeichen-Kapitels stand einer GAR NICHT in der Liste — das Briefing. Es ist
   * dieselbe Fehlerklasse wie die Handle-Suche oben: die Route antwortete, die
   * Seite lief, nur zählte niemand mit.
   */
  it('deckelt alle vier KI-Läufe von Brand Design — jeder in seinem EIGENEN Eimer', () => {
    const laeufe = [
      ['POST \\/api\\/brand\\/profiles\\/[^/]+\\/inspiration\\/read', 'Vorbilder lesen'],
      ['POST \\/api\\/brand\\/profiles\\/[^/]+\\/dna\\/propose', 'DNA vorschlagen'],
      ['POST \\/api\\/brand\\/profiles\\/[^/]+\\/mark\\/brief', 'Zeichen-Briefing'],
      ['POST \\/api\\/brand\\/profiles\\/[^/]+\\/mark\\/drafts', 'Zeichen-Entwürfe'],
    ] as const
    const eimer = new Set<string>()
    for (const [pfad, name] of laeufe) {
      const treffer = eintrag(pfad)
      expect(treffer, `${name} fehlt in der Drossel-Liste`).not.toBeNull()
      // TOKEN_MAX (10/min): WEITER als jeder fachliche Tages-Deckel, sonst
      // hörte der Mensch „zu schnell", wo „heute genug" richtig wäre.
      expect(treffer?.max, `${name} sollte TOKEN_MAX tragen`).toBe(10)
      eimer.add(treffer?.bucket ?? '')
    }
    // Vier Rechnungen, vier Eimer — ein geteilter bremste den nächsten Schritt
    // im selben Kapitel aus.
    expect(eimer.size).toBe(4)
  })

  it('das Briefing wird NICHT vom Entwurfs-Muster mitgedeckt (Reihenfolge-Falle)', () => {
    // `find()` nimmt den ERSTEN Treffer: stünde `…/mark/brief` hinter einem
    // Muster, das es mitfängt, liefe der Lauf im fremden Eimer.
    const brief = eintrag('POST \\/api\\/brand\\/profiles\\/[^/]+\\/mark\\/brief')
    const drafts = eintrag('POST \\/api\\/brand\\/profiles\\/[^/]+\\/mark\\/drafts')
    expect(brief?.bucket).not.toBe(drafts?.bucket)
    let geprueft = 0
    for (const zeile of listen.split('\n')) {
      const muster = /\{ re: \/\^(.+?)\$\//.exec(zeile)?.[1]
      if (!muster || muster.includes('mark\\/brief')) continue
      geprueft++
      expect(
        new RegExp(`^${muster}$`).test('POST /api/brand/profiles/p1/mark/brief'),
        `„${muster}" fängt das Briefing mit ab`,
      ).toBe(false)
    }
    // Ohne diese Zeile wäre die Schleife eine Tautologie: fände die Ausdruck-
    // Erkennung nichts, liefe sie null Mal und der Test wäre immer grün.
    expect(geprueft).toBeGreaterThan(50)
  })
})

/**
 * Die Liste so auswerten, wie die Middleware es tut: `WRITE_LIMITED.find()`
 * nimmt den ERSTEN passenden Eintrag. Gelesen werden die Regex-Literale in
 * Quelltext-Reihenfolge — damit lässt sich prüfen, wer eine Route WIRKLICH
 * bekommt, nicht nur, ob irgendwo eine Zeile für sie steht.
 */
function ersterTreffer(route: string): { bucket: string, max: number | null } | null {
  const writeListe = listen.slice(listen.indexOf('const WRITE_LIMITED'))
  for (const zeile of writeListe.split('\n')) {
    const m = /\{ re: \/(.+)\/, bucket: '([^']+)'(?:, max: ([A-Z_]+|\d+))? \}/.exec(zeile)
    if (!m) continue
    if (!new RegExp(m[1] ?? '').test(route)) continue
    const maxRoh = m[3]
    if (maxRoh === undefined) return { bucket: m[2] ?? '', max: null }
    const alsZahl = Number(maxRoh)
    if (Number.isFinite(alsZahl)) return { bucket: m[2] ?? '', max: alsZahl }
    const wert = new RegExp(`const ${maxRoh} = (\\d[\\d_]*)`).exec(quelle)?.[1]
    return { bucket: m[2] ?? '', max: wert ? Number(wert.replace(/_/g, '')) : null }
  }
  return null
}

describe('Teure Wege ohne Bremse (BE-002)', () => {
  it.each([
    ['GET /api/auth/export', 'auth:export', 2],
    ['DELETE /api/auth/account', 'auth:account-delete', 5],
    ['POST /api/community/domain/verify', 'domains:verify', 10],
    ['POST /api/site/domain/verify', 'domains:verify', 10],
    ['POST /api/community/billing/checkout', 'community:checkout', 10],
    ['POST /api/community/billing/portal', 'community:portal', 30],
    ['POST /api/community/branding/favicon', 'community:favicon', 10],
    ['DELETE /api/posts/p1', 'posts:delete', null],
    ['DELETE /api/comments/c1', 'comments:delete', null],
    ['DELETE /api/reports', 'reports:withdraw', null],
    ['PATCH /api/posts/p1/state', 'posts:state', null],
    ['POST /api/admin/comments/c1/assist', 'comments:assist', 10],
    ['POST /api/posts/p1/assist', 'posts:assist', 10],
    ['GET /api/comments/counts', 'comments:read', 120],
    ['PUT /api/pages', 'pages:save', null],
    // BE-025: der Aufräum-Lauf von Hand — eigener Eimer, nicht der des Claims.
    ['POST /api/runner/retention/run', 'runner:retention', 6],
  ])('%s → Bucket %s, Deckel %s', (route, bucket, max) => {
    expect(ersterTreffer(route)).toEqual({ bucket, max })
  })

  it('Konto- und Community-Abo teilen sich die Zahlen, nicht den Eimer', () => {
    expect(ersterTreffer('POST /api/community/billing/checkout')?.max).toBe(ersterTreffer('POST /api/billing/checkout')?.max)
    expect(ersterTreffer('POST /api/community/billing/portal')?.max).toBe(ersterTreffer('POST /api/billing/portal')?.max)
    expect(ersterTreffer('POST /api/community/billing/checkout')?.bucket).not.toBe(ersterTreffer('POST /api/billing/checkout')?.bucket)
  })

  it('das DELETE-Auffangnetz steht zuletzt und fängt jede sonst ungelistete DELETE-Route', () => {
    const zeilen = listen.slice(listen.indexOf('const WRITE_LIMITED')).split('\n').filter(z => z.includes('{ re: /'))
    expect(zeilen.at(-1)).toContain("bucket: 'delete:other'")
    expect(ersterTreffer('DELETE /api/community/branding/favicon')).toEqual({ bucket: 'delete:other', max: 120 })
    expect(ersterTreffer('DELETE /api/irgendwas/x1')).toEqual({ bucket: 'delete:other', max: 120 })
    // Kein GET, kein POST und nichts ausserhalb von /api/ läuft hinein.
    expect(ersterTreffer('GET /api/irgendwas')).toBeNull()
    expect(ersterTreffer('POST /api/irgendwas')).toBeNull()
    expect(ersterTreffer('DELETE /irgendwas')).toBeNull()
  })

  it('das Auffangnetz schluckt keinen spezifischen DELETE-Eintrag davor', () => {
    expect(ersterTreffer('DELETE /api/brand/profiles/b1/publication')?.bucket).toBe('brand:publish')
    expect(ersterTreffer('DELETE /api/brand/profiles/b1/inspiration/i1')?.bucket).toBe('brand:inspiration')
    expect(ersterTreffer('DELETE /api/brand/profiles/b1/mark/drafts/d1')?.bucket).toBe('brand:drafts-edit')
    expect(ersterTreffer('DELETE /api/market/profiles/m1/competitors/c1')?.bucket).toBe('market:competitors')
    expect(ersterTreffer('DELETE /api/auth/account')?.bucket).toBe('auth:account-delete')
    expect(ersterTreffer('DELETE /api/posts/p1')?.bucket).toBe('posts:delete')
  })

  it('die neuen Zeilen verschieben keine bestehende Zuordnung', () => {
    expect(ersterTreffer('PATCH /api/posts/p1')?.bucket).toBe('posts:edit')
    expect(ersterTreffer('PATCH /api/comments/c1')?.bucket).toBe('comments:edit')
    expect(ersterTreffer('GET /api/comments/count')?.bucket).toBe('comments:read')
    expect(ersterTreffer('GET /api/community/export')?.bucket).toBe('community:export')
  })
})
