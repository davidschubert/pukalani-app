import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CUSTOM_DOMAIN_CLAIM_DAYS,
  CUSTOM_DOMAIN_GRACE_DAYS,
  CUSTOM_DOMAIN_MIN_PLAN,
  CUSTOM_DOMAIN_STATUSES,
  canonicalHostFor,
  customDomainAllowedForPlan,
  customDomainClaimExpired,
  customDomainClaimExpiresAt,
  customDomainEntitlement,
  customDomainGraceEnd,
  customDomainHasProof,
  customDomainIsParked,
  customDomainBase,
  customDomainCandidates,
  customDomainForms,
  customDomainIsLive,
  customDomainSibling,
  customDomainTokenPresent,
  customDomainVerifyRecordName,
  customDomainVerifyRecordValue,
  caaChain,
  caaVerdictFromRecords,
  domainPointsToUs,
  isCustomDomainToken,
  isOperatorDomain,
  normalizeCustomDomain,
  resolveCustomDomainStatus,
  validateCustomDomain,
  healthConfirmsApprovalWaiver,
  platformHealthUrlAllowed,
} from '../shared/customDomain'
import { isDryRunFlag } from '../server/utils/ploi'

/**
 * Die puren Regeln hinter eigenen Domains (control-035).
 *
 * Was hier NICHT getestet wird und auch nicht kann: echtes DNS, echte
 * Zertifikate, echtes ploi. Dafür gibt es den Live-Rundlauf
 * (packages/onboarding/scripts/verify-custom-domain.mjs) und das Runbook für
 * den ersten echten Kunden. Hier stehen die Entscheidungen, die man mit
 * Nachdenken beweisen kann — und ausgerechnet die halten die Sicherheit:
 * welche Eingabe abgelehnt wird, welcher Host kanonisch ist, wann ein Token
 * gilt.
 */

describe('normalizeCustomDomain', () => {
  it('macht aus einer getippten URL einen Hostnamen', () => {
    expect(normalizeCustomDomain('https://www.Beispiel.de/pfad?x=1#a')).toBe('www.beispiel.de')
    expect(normalizeCustomDomain('  HTTP://beispiel.de:8443  ')).toBe('beispiel.de')
    expect(normalizeCustomDomain('//beispiel.de')).toBe('beispiel.de')
    expect(normalizeCustomDomain('user:pw@beispiel.de')).toBe('beispiel.de')
  })

  it('entfernt den DNS-Wurzelpunkt', () => {
    expect(normalizeCustomDomain('beispiel.de.')).toBe('beispiel.de')
  })

  it('leere Eingaben bleiben leer', () => {
    expect(normalizeCustomDomain('')).toBe('')
    expect(normalizeCustomDomain(null)).toBe('')
    expect(normalizeCustomDomain(undefined)).toBe('')
  })
})

describe('validateCustomDomain', () => {
  it('nimmt gewöhnliche Kundendomains an', () => {
    expect(validateCustomDomain('www.pukalani.studio')).toEqual({ ok: true, domain: 'www.pukalani.studio' })
    expect(validateCustomDomain('pukalani.studio')).toEqual({ ok: true, domain: 'pukalani.studio' })
    expect(validateCustomDomain('xn--bcher-kva.de')).toEqual({ ok: true, domain: 'xn--bcher-kva.de' })
  })

  /**
   * DIE WICHTIGSTE PRÜFUNG DER DATEI. Ohne sie umginge eine Kundendomain die
   * Sperrliste RESERVED_SUBDOMAINS: der Wizard prüft nur das SLUG, hier kommt
   * ein VOLLER Host herein — `login.pukalani.app` in Kundenhand wäre eine
   * Anmeldedaten-Falle mit unserem Namen und gültigem Zertifikat.
   */
  it('lehnt JEDE Adresse unterhalb der Betreiber-Domain ab', () => {
    for (const host of ['pukalani.app', 'login.pukalani.app', 'my.pukalani.app', 'irgendwas.pukalani.app', 'a.b.pukalani.app']) {
      expect(validateCustomDomain(host)).toEqual({ ok: false, reason: 'operator_domain' })
    }
  })

  it('lehnt ab, was keine Domain ist', () => {
    expect(validateCustomDomain('localhost').reason).toBe('not_a_domain')
    expect(validateCustomDomain('192.168.0.1').reason).toBe('not_a_domain')
    expect(validateCustomDomain('beispiel.123').reason).toBe('not_a_domain')
    expect(validateCustomDomain('').reason).toBe('empty')
  })

  it('lehnt DNS-widrige Zeichen und Längen ab', () => {
    expect(validateCustomDomain('bücher.de').reason).toBe('invalid')
    expect(validateCustomDomain('-start.de').reason).toBe('invalid')
    expect(validateCustomDomain('ende-.de').reason).toBe('invalid')
    expect(validateCustomDomain('unter_strich.de').reason).toBe('invalid')
    expect(validateCustomDomain(`${'a'.repeat(64)}.de`).reason).toBe('invalid')
    expect(validateCustomDomain(`${'a'.repeat(60)}.`.repeat(5) + 'de').reason).toBe('too_long')
  })

  it('normalisiert vor dem Prüfen', () => {
    expect(validateCustomDomain('HTTPS://WWW.Beispiel.DE/')).toEqual({ ok: true, domain: 'www.beispiel.de' })
  })
})

describe('isOperatorDomain', () => {
  it('trennt uns von fremden Domains', () => {
    expect(isOperatorDomain('pukalani.app')).toBe(true)
    expect(isOperatorDomain('demo.pukalani.app')).toBe(true)
    // Kein Suffix-Trick: `nichtpukalani.app` endet NICHT auf `.pukalani.app`.
    expect(isOperatorDomain('nichtpukalani.app')).toBe(false)
    expect(isOperatorDomain('pukalani.studio')).toBe(false)
  })
})

describe('customDomainSibling / customDomainForms', () => {
  it('paart Apex und www', () => {
    expect(customDomainSibling('beispiel.de')).toBe('www.beispiel.de')
    expect(customDomainSibling('www.beispiel.de')).toBe('beispiel.de')
  })

  /**
   * Die bewusste GRENZE: für eine tiefere Subdomain bilden wir kein Paar.
   * Sonst würden wir ein Zertifikat für `www.blog.beispiel.de` beantragen, für
   * das niemand einen DNS-Eintrag angelegt hat — der Kunde bekäme einen Fehler
   * für einen Namen, den er nie wollte.
   */
  it('bildet für tiefere Subdomains kein Paar', () => {
    expect(customDomainSibling('blog.beispiel.de')).toBeNull()
    expect(customDomainForms('blog.beispiel.de')).toEqual(['blog.beispiel.de'])
  })

  it('nimmt der www-Form ihr www, auch tief', () => {
    expect(customDomainSibling('www.blog.beispiel.de')).toBe('blog.beispiel.de')
  })

  it('die EINGETRAGENE Form steht vorn — sie ist die kanonische', () => {
    expect(customDomainForms('www.beispiel.de')).toEqual(['www.beispiel.de', 'beispiel.de'])
    expect(customDomainForms('beispiel.de')).toEqual(['beispiel.de', 'www.beispiel.de'])
  })

  it('customDomainBase liegt immer ohne www', () => {
    expect(customDomainBase('www.beispiel.de')).toBe('beispiel.de')
    expect(customDomainBase('beispiel.de')).toBe('beispiel.de')
    expect(customDomainBase('blog.beispiel.de')).toBe('blog.beispiel.de')
  })
})

describe('customDomainCandidates', () => {
  it('findet die Zeile über BEIDE Formen', () => {
    expect(customDomainCandidates('beispiel.de')).toEqual(['beispiel.de', 'www.beispiel.de'])
    expect(customDomainCandidates('www.beispiel.de')).toEqual(['www.beispiel.de', 'beispiel.de'])
  })

  it('leerer Host ⇒ keine Kandidaten (der Resolver fragt dann gar nicht)', () => {
    expect(customDomainCandidates('')).toEqual([])
  })
})

describe('resolveCustomDomainStatus', () => {
  /**
   * FAIL-CLOSED wie `resolveTenantAudience`: an dieser Spalte hängt, welcher
   * HOST eine Community bedient. Eine Bestands-Zeile (null) darf nicht in
   * einen halbaktiven Zustand rutschen.
   */
  it('unbekannte Werte sind "none"', () => {
    expect(resolveCustomDomainStatus(null)).toBe('none')
    expect(resolveCustomDomainStatus(undefined)).toBe('none')
    expect(resolveCustomDomainStatus('')).toBe('none')
    expect(resolveCustomDomainStatus('tippfehler')).toBe('none')
  })

  it('kennt die sechs echten Stufen', () => {
    for (const value of ['pending_dns', 'pending_cert', 'pending_platform', 'active', 'error', 'paused']) {
      expect(resolveCustomDomainStatus(value)).toBe(value)
    }
  })
})

describe('canonicalHostFor', () => {
  const base = { host: 'kunde.pukalani.app' }

  it('ohne eigene Domain gilt die Subdomain', () => {
    expect(canonicalHostFor(base)).toBe('kunde.pukalani.app')
    expect(canonicalHostFor({ ...base, customDomain: '', customDomainStatus: 'none' })).toBe('kunde.pukalani.app')
  })

  /** Solange das Zertifikat fehlt, bleibt die Subdomain zu Hause — sonst
   *  leitete sie auf ein Zertifikats-Warnschild um. */
  it('eine unfertige Domain gewinnt NICHT', () => {
    for (const status of ['pending_dns', 'pending_cert', 'pending_platform', 'error', '', 'paused']) {
      expect(canonicalHostFor({ ...base, customDomain: 'www.kunde.de', customDomainStatus: status })).toBe('kunde.pukalani.app')
    }
  })

  it('eine aktive Domain ist die kanonische Adresse', () => {
    expect(canonicalHostFor({ ...base, customDomain: 'www.kunde.de', customDomainStatus: 'active' })).toBe('www.kunde.de')
  })

  it('customDomainIsLive verlangt BEIDES', () => {
    expect(customDomainIsLive('', 'active')).toBe(false)
    expect(customDomainIsLive('www.kunde.de', 'pending_cert')).toBe(false)
    expect(customDomainIsLive('www.kunde.de', 'active')).toBe(true)
  })
})

describe('Eigentums-Nachweis', () => {
  const token = 'a'.repeat(32)

  it('der Record liegt an der BASIS — ein Eintrag für beide Formen', () => {
    expect(customDomainVerifyRecordName('www.kunde.de')).toBe('_pukalani-verify.kunde.de')
    expect(customDomainVerifyRecordName('kunde.de')).toBe('_pukalani-verify.kunde.de')
  })

  it('erkennt das Token in einer Zone mit mehreren Nachweisen', () => {
    const records = [
      ['v=spf1 include:example.com ~all'],
      ['google-site-verification=abc'],
      [customDomainVerifyRecordValue(token)],
    ]
    expect(customDomainTokenPresent(records, token)).toBe(true)
  })

  /** DNS zerlegt lange TXT-Werte in 255-Zeichen-Häppchen. Ein Vergleich, der
   *  nur das erste Stück ansieht, wäre still falsch. */
  it('setzt zerlegte TXT-Werte wieder zusammen', () => {
    const value = customDomainVerifyRecordValue(token)
    expect(customDomainTokenPresent([[value.slice(0, 10), value.slice(10)]], token)).toBe(true)
  })

  it('duldet Anführungszeichen und Leerraum mancher DNS-Oberflächen', () => {
    expect(customDomainTokenPresent([[` "${customDomainVerifyRecordValue(token)}" `]], token)).toBe(true)
  })

  /** DIE GEGENPROBE: ein FREMDES Token gilt nicht. Genau daran hängt, dass
   *  eine andere Community eine Domain nicht übernehmen kann, die zufällig
   *  noch auf unsere IP zeigt. */
  it('ein fremdes Token gilt nicht', () => {
    expect(customDomainTokenPresent([[customDomainVerifyRecordValue('b'.repeat(32))]], token)).toBe(false)
    expect(customDomainTokenPresent([], token)).toBe(false)
    expect(customDomainTokenPresent([[customDomainVerifyRecordValue(token)]], '')).toBe(false)
  })

  it('erkennt gültige Token-Formen', () => {
    expect(isCustomDomainToken(token)).toBe(true)
    expect(isCustomDomainToken('ZZZ')).toBe(false)
    expect(isCustomDomainToken('A'.repeat(32))).toBe(false)
    expect(isCustomDomainToken(null)).toBe(false)
  })
})

describe('domainPointsToUs', () => {
  const ours = { serverIps: ['49.13.211.173'], cnameTarget: 'platform.pukalani.app' }

  it('A-Record auf uns genügt', () => {
    expect(domainPointsToUs({ a: ['49.13.211.173'], cname: '', ...ours })).toBe(true)
  })

  it('CNAME auf uns genügt', () => {
    expect(domainPointsToUs({ a: [], cname: 'platform.pukalani.app.', ...ours })).toBe(true)
  })

  it('fremde Ziele zählen nicht', () => {
    expect(domainPointsToUs({ a: ['1.2.3.4'], cname: 'fremd.example.com', ...ours })).toBe(false)
  })

  /** FAIL-CLOSED: eine vergessene Konfiguration darf nicht „alles zeigt auf
   *  uns" bedeuten — sonst wäre jede Domain sofort aktivierbar. */
  it('ohne Konfiguration zeigt NICHTS auf uns', () => {
    expect(domainPointsToUs({ a: ['1.2.3.4'], cname: 'x.example.com', serverIps: [], cnameTarget: '' })).toBe(false)
    expect(domainPointsToUs({ a: [], cname: '', serverIps: [], cnameTarget: '' })).toBe(false)
  })
})

describe('Plan-Grenze', () => {
  it('eigene Domains gibt es ab Pro', () => {
    expect(customDomainAllowedForPlan('pro')).toBe(true)
    expect(customDomainAllowedForPlan('personal')).toBe(false)
    expect(customDomainAllowedForPlan('basic')).toBe(false)
    expect(customDomainAllowedForPlan(null)).toBe(false)
    // Alt-Wert aus der Zeit vor dem P4-Rename: 'business' → 'pro'.
    expect(customDomainAllowedForPlan('business')).toBe(true)
  })

  /**
   * DER WÄCHTER GEGEN AUSEINANDERLAUFEN.
   *
   * Die Plan-Grenze steht an ZWEI Orten, und das ist unvermeidbar: das
   * Control Plane ist die Autorität (es liest den Plan aus der
   * `communities`-Zeile), `apps/platform` gatet die SICHTBARKEIT über die
   * bestehende Produkt-Mechanik (`pukalani.tenancy.products`) und kann die
   * app.config des Control Plane nicht lesen — anderes Deployment.
   *
   * Liefe eines der beiden weg, entstünde genau die Sorte Fehler, die niemand
   * bemerkt: die Seite verschwindet für einen Kunden, der sie bezahlt hat,
   * oder sie steht einem offen, der sie nicht bezahlt hat und dann an einem
   * 403 landet. Deshalb liest dieser Test die andere Datei.
   */
  it('apps/platform nennt dieselbe Grenze wie das Control Plane', () => {
    const source = readFileSync(join(import.meta.dirname, '../../../apps/platform/app/app.config.ts'), 'utf8')
    const match = source.match(/customDomain:\s*'([a-z]+)'/)
    expect(match?.[1]).toBe(CUSTOM_DOMAIN_MIN_PLAN)
  })
})

describe('isDryRunFlag', () => {
  /**
   * 2026-08-07 LIVE ERWISCHT: `runtimeConfig` typisiert den Schalter als
   * String (Default ''), Nuxt schiebt eine Env-Überschreibung aber durch
   * `destr()` — aus `NUXT_CUSTOM_DOMAIN_DRY_RUN=1` wird die ZAHL 1, und
   * `1 === '1'` ist falsch. Der volle Rundlauf lief deshalb gegen echtes ploi
   * statt im Trockenlauf und meldete „ploi ist nicht konfiguriert"; das sah
   * aus wie ein fehlendes Token und war ein Typ.
   */
  it('nimmt die Zahl 1 genauso wie den String', () => {
    expect(isDryRunFlag(1)).toBe(true)
    expect(isDryRunFlag('1')).toBe(true)
  })

  it('nimmt, was ein Mensch schreiben würde', () => {
    for (const value of ['true', 'TRUE', 'yes', 'on', true]) {
      expect(isDryRunFlag(value)).toBe(true)
    }
  })

  it('alles andere heißt aus', () => {
    for (const value of ['', '0', 'false', 'no', undefined, null, 0]) {
      expect(isDryRunFlag(value)).toBe(false)
    }
  })
})

/**
 * CAA — die häufigste Ursache eines fehlgeschlagenen Zertifikats (U16,
 * Wettbewerb E6).
 *
 * Getestet werden die zwei PUREN Hälften: welche Namen gefragt werden und wie
 * ein gefundener Satz gelesen wird. Das Fragen selbst (`checkDomainCaa`)
 * braucht einen Resolver und gehört damit zum Live-Rundlauf.
 */
describe('caaChain', () => {
  it('läuft von unten nach oben, ohne die TLD', () => {
    expect(caaChain('www.kunde.de')).toEqual(['www.kunde.de', 'kunde.de'])
    expect(caaChain('kunde.de')).toEqual(['kunde.de'])
    expect(caaChain('a.b.c.kunde.de')).toEqual(['a.b.c.kunde.de', 'b.c.kunde.de', 'c.kunde.de', 'kunde.de'])
  })

  it('normalisiert wie der Rest des Moduls (Punkt am Ende, Grossschreibung)', () => {
    expect(caaChain('WWW.Kunde.DE.')).toEqual(['www.kunde.de', 'kunde.de'])
  })

  it('eine TLD allein ergibt keine Frage', () => {
    expect(caaChain('de')).toEqual([])
    expect(caaChain('')).toEqual([])
  })
})

describe('caaVerdictFromRecords', () => {
  it('ein Satz, der uns nennt, erlaubt', () => {
    expect(caaVerdictFromRecords([{ issue: 'letsencrypt.org' }])).toBe('ok')
  })

  it('Parameter hinter dem Namen ändern das WIE, nicht das WER', () => {
    expect(caaVerdictFromRecords([{ issue: 'letsencrypt.org; validationmethods=dns-01' }])).toBe('ok')
  })

  it('ein fremder Aussteller allein sperrt', () => {
    expect(caaVerdictFromRecords([{ issue: 'sectigo.com' }])).toBe('blocked')
  })

  it('mehrere Aussteller: einer davon genügt', () => {
    expect(caaVerdictFromRecords([{ issue: 'sectigo.com' }, { issue: 'letsencrypt.org' }])).toBe('ok')
  })

  /**
   * `issue ";"` ist das ausdrückliche Verbot für ALLE (RFC 8659 § 4.2) — der
   * Name vor dem Semikolon ist leer und fällt damit heraus. Ohne diesen Fall
   * hätte ein leerer Aussteller-Name als „keine Beschränkung" gelesen werden
   * können, und die härteste Policy des Feldes wäre still durchgerutscht.
   */
  it('das Verbot für alle sperrt auch uns', () => {
    expect(caaVerdictFromRecords([{ issue: ';' }])).toBe('blocked')
    expect(caaVerdictFromRecords([{ issue: ';' }, { issue: 'letsencrypt.org' }])).toBe('ok')
  })

  /**
   * GEGENPROBE ZUM FEHLALARM: ein Satz aus reinen `iodef`- oder
   * `issuewild`-Einträgen beschränkt das Ausstellen für konkrete Namen NICHT.
   * Wer ihn als Sperre läse, schickte den Kunden in seiner Zone auf die Suche
   * nach einem Fehler, den es nicht gibt — und für eine Kundendomain wird nie
   * ein Wildcard bestellt.
   */
  it('ohne issue-Feld wird nichts beschränkt', () => {
    expect(caaVerdictFromRecords([{ iodef: 'mailto:security@kunde.de' }])).toBe('ok')
    expect(caaVerdictFromRecords([{ issuewild: ';' }])).toBe('ok')
    expect(caaVerdictFromRecords([])).toBe('ok')
  })

  it('Grossschreibung und Punkt am Ende sind egal', () => {
    expect(caaVerdictFromRecords([{ issue: 'LetsEncrypt.ORG.' }])).toBe('ok')
  })

  /** Die Kennung ist ein fester Bezeichner, kein Hostname-Muster: eine
   *  Subdomain davon ist NICHT Let's Encrypt. */
  it('eine Subdomain der Kennung zählt nicht', () => {
    expect(caaVerdictFromRecords([{ issue: 'acme.letsencrypt.org' }])).toBe('blocked')
  })
})

// ── control-040: Berechtigung, Nachweis, Fristen (SEC-022, BE-014) ─────────

describe('customDomainEntitlement', () => {
  const NOW = Date.parse('2026-11-16T12:00:00.000Z')
  const FUTURE = '2026-11-30T12:00:00.000Z'
  const PAST = '2026-11-01T12:00:00.000Z'

  it('Plan nicht Pro ⇒ plan_required — vor allem anderen, auch mit Freigabe', () => {
    for (const plan of ['basic', 'personal', '', null, 'free']) {
      expect(customDomainEntitlement({ plan, customDomainApproved: true }, NOW)).toEqual({ allowed: false, reason: 'plan_required' })
    }
    // Reihenfolge: ein Basic-Plan in der Testphase ohne Freigabe nennt den Plan.
    expect(customDomainEntitlement({ plan: 'basic', trialEndsAt: FUTURE }, NOW)).toEqual({ allowed: false, reason: 'plan_required' })
  })

  it('Testphase mit Plan pro ist NICHT berechtigt — auch nicht mit Freigabe', () => {
    expect(customDomainEntitlement({ plan: 'pro', trialEndsAt: FUTURE, billingStatus: '' }, NOW)).toEqual({ allowed: false, reason: 'trial' })
    expect(customDomainEntitlement({ plan: 'pro', trialEndsAt: FUTURE, billingStatus: null, customDomainApproved: true }, NOW)).toEqual({ allowed: false, reason: 'trial' })
    // Reihenfolge: Testphase vor Freigabe.
    expect(customDomainEntitlement({ plan: 'pro', trialEndsAt: FUTURE, customDomainApproved: false }, NOW)).toEqual({ allowed: false, reason: 'trial' })
  })

  it('bezahltes Pro ohne Freigabe ⇒ approval_required', () => {
    for (const approved of [false, null, undefined]) {
      expect(customDomainEntitlement({ plan: 'pro', billingStatus: 'active', customDomainApproved: approved }, NOW))
        .toEqual({ allowed: false, reason: 'approval_required' })
    }
  })

  it('bezahltes Pro mit Freigabe ⇒ erlaubt — auch wenn während der Testphase gekauft wurde', () => {
    expect(customDomainEntitlement({ plan: 'pro', billingStatus: 'active', customDomainApproved: true }, NOW)).toEqual({ allowed: true })
    expect(customDomainEntitlement({ plan: 'pro', trialEndsAt: FUTURE, billingStatus: 'active', customDomainApproved: true }, NOW)).toEqual({ allowed: true })
    expect(customDomainEntitlement({ plan: 'pro', trialEndsAt: PAST, billingStatus: 'active', customDomainApproved: true }, NOW)).toEqual({ allowed: true })
  })

  it('vom Betreiber gesetztes Pro ohne Testphasen-Datum + Freigabe ⇒ erlaubt', () => {
    expect(customDomainEntitlement({ plan: 'pro', trialEndsAt: null, billingStatus: '', customDomainApproved: true }, NOW)).toEqual({ allowed: true })
    // Alt-Wert `business` ist Pro (normalizeTenantPlan).
    expect(customDomainEntitlement({ plan: 'business', customDomainApproved: true }, NOW)).toEqual({ allowed: true })
  })
})

describe('customDomainIsParked / customDomainHasProof', () => {
  it('abgeschaltet ist nur paused MIT Domain — und nie kanonisch', () => {
    expect(customDomainIsParked('www.kunde.de', 'paused')).toBe(true)
    expect(customDomainIsParked('', 'paused')).toBe(false)
    expect(customDomainIsParked('www.kunde.de', 'active')).toBe(false)
    expect(customDomainIsLive('www.kunde.de', 'paused')).toBe(false)
  })

  it('Nachweis haben genau pending_cert, pending_platform, active, paused', () => {
    const proven = CUSTOM_DOMAIN_STATUSES.filter(status => customDomainHasProof(status))
    expect(proven).toEqual(['pending_cert', 'pending_platform', 'active', 'paused'])
    expect(customDomainHasProof(null)).toBe(false)
    expect(customDomainHasProof('tippfehler')).toBe(false)
  })
})

describe('Fristen', () => {
  const NOW = Date.parse('2026-11-16T12:00:00.000Z')
  const DAY = 24 * 60 * 60 * 1000

  it('customDomainGraceEnd: jetzt + 14 Tage', () => {
    expect(CUSTOM_DOMAIN_GRACE_DAYS).toBe(14)
    expect(customDomainGraceEnd(NOW)).toBe(new Date(NOW + 14 * DAY).toISOString())
  })

  it('customDomainClaimExpired: pending_dns/error ohne Nachweis, älter als 14 Tage', () => {
    expect(CUSTOM_DOMAIN_CLAIM_DAYS).toBe(14)
    const old = new Date(NOW - 15 * DAY).toISOString()
    const fresh = new Date(NOW - 13 * DAY).toISOString()
    expect(customDomainClaimExpired({ customDomain: 'kunde.de', customDomainStatus: 'pending_dns', customDomainClaimedAt: old }, NOW)).toBe(true)
    expect(customDomainClaimExpired({ customDomain: 'kunde.de', customDomainStatus: 'error', customDomainClaimedAt: old }, NOW)).toBe(true)
    expect(customDomainClaimExpired({ customDomain: 'kunde.de', customDomainStatus: 'pending_dns', customDomainClaimedAt: fresh }, NOW)).toBe(false)
    // Genau auf der Grenze ist verfallen.
    expect(customDomainClaimExpired({ customDomain: 'kunde.de', customDomainStatus: 'pending_dns', customDomainClaimedAt: new Date(NOW - 14 * DAY).toISOString() }, NOW)).toBe(true)
  })

  it('ein fehlendes Datum ist NICHT verfallen, ein Nachweis auch nicht', () => {
    const old = new Date(NOW - 30 * DAY).toISOString()
    for (const claimedAt of [null, undefined, '', 'kaputt']) {
      expect(customDomainClaimExpired({ customDomain: 'kunde.de', customDomainStatus: 'pending_dns', customDomainClaimedAt: claimedAt }, NOW)).toBe(false)
    }
    for (const status of ['pending_cert', 'pending_platform', 'active', 'paused', 'none']) {
      expect(customDomainClaimExpired({ customDomain: 'kunde.de', customDomainStatus: status, customDomainClaimedAt: old }, NOW)).toBe(false)
    }
    expect(customDomainClaimExpired({ customDomain: '', customDomainStatus: 'pending_dns', customDomainClaimedAt: old }, NOW)).toBe(false)
  })

  it('customDomainClaimExpiresAt: Eintragsdatum + 14 Tage, nur ohne Nachweis', () => {
    const claimed = new Date(NOW).toISOString()
    expect(customDomainClaimExpiresAt({ customDomain: 'kunde.de', customDomainStatus: 'pending_dns', customDomainClaimedAt: claimed }))
      .toBe(new Date(NOW + 14 * DAY).toISOString())
    expect(customDomainClaimExpiresAt({ customDomain: 'kunde.de', customDomainStatus: 'active', customDomainClaimedAt: claimed })).toBeNull()
  })
})

/**
 * PK1 K6: die Freigabe-Pflicht entfällt NUR mit bestätigter Ausnahme
 * (`approvalWaived`); Plan und Testphase bleiben.
 */
describe('customDomainEntitlement — Freigabe-Pflicht entfällt (PK1 K6)', () => {
  const NOW = Date.parse('2026-11-16T12:00:00.000Z')
  const FUTURE = '2026-11-30T12:00:00.000Z'
  it('ohne Ausnahme bleibt die Pflicht (Gegenprobe)', () => {
    expect(customDomainEntitlement({ plan: 'pro', billingStatus: 'active', customDomainApproved: false }, NOW)).toEqual({ allowed: false, reason: 'approval_required' })
    expect(customDomainEntitlement({ plan: 'pro', billingStatus: 'active', customDomainApproved: false }, NOW, { approvalWaived: false })).toEqual({ allowed: false, reason: 'approval_required' })
  })
  it('mit Ausnahme braucht eine bezahlte Pro-Community keine Freigabe', () => {
    expect(customDomainEntitlement({ plan: 'pro', billingStatus: 'active', customDomainApproved: false }, NOW, { approvalWaived: true })).toEqual({ allowed: true })
    expect(customDomainEntitlement({ plan: 'pro', billingStatus: 'active', customDomainApproved: null }, NOW, { approvalWaived: true })).toEqual({ allowed: true })
  })
  it('Testphase und Plan bleiben gesperrt', () => {
    expect(customDomainEntitlement({ plan: 'pro', trialEndsAt: FUTURE, billingStatus: '', customDomainApproved: true }, NOW, { approvalWaived: true })).toEqual({ allowed: false, reason: 'trial' })
    expect(customDomainEntitlement({ plan: 'basic', customDomainApproved: true }, NOW, { approvalWaived: true })).toEqual({ allowed: false, reason: 'plan_required' })
  })
})

describe('healthConfirmsApprovalWaiver (PK1 K6)', () => {
  it.each([
    // Erst mit E1d meldet die Platform `liveRelay` — nur dann entfällt die Pflicht.
    [{ ok: true, siteCard: { mode: 'write', cards: true, previous: false, liveRelay: true } }, true],
    [{ ok: false, siteCard: { mode: 'write', cards: true, liveRelay: true } }, true],
    // Der heutige Stand (E1c): write mit Karten, aber ohne Live-Weiterleitung ⇒ Pflicht bleibt.
    [{ ok: true, siteCard: { mode: 'write', cards: true, previous: false } }, false],
    [{ ok: true, siteCard: { mode: 'write', cards: true, liveRelay: false } }, false],
    [{ ok: true, siteCard: { mode: 'write', cards: false, liveRelay: true } }, false],
    [{ ok: true, siteCard: { mode: 'read', cards: true, liveRelay: true } }, false],
    [{ ok: true, siteCard: { mode: 'off', cards: false } }, false],
    [{ ok: true, siteCard: { mode: 'write', cards: 'true', liveRelay: true } }, false],
    [{ ok: true }, false],
    [{ ok: true, siteCard: null }, false],
    [null, false],
    ['write', false],
  ])('%j ⇒ %s', (body, expected) => {
    expect(healthConfirmsApprovalWaiver(body)).toBe(expected)
  })
})

describe('platformHealthUrlAllowed (PK1 K6)', () => {
  it.each([
    ['https://platform.pukalani.app/api/health', true],
    ['http://localhost:3250/api/health', true],
    ['http://127.0.0.1:3250/api/health', true],
    ['http://app.localhost:3250/api/health', true],
    ['', false],
    ['http://platform.pukalani.app/api/health', false],
    ['http://localhost.example.com/api/health', false],
    ['ftp://platform.pukalani.app/api/health', false],
    ['https://user:pw@platform.pukalani.app/api/health', false],
    ['kein-url', false],
  ])('%s ⇒ %s', (url, expected) => {
    expect(platformHealthUrlAllowed(url)).toBe(expected)
  })
})
