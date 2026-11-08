import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { controlHomeTarget, isAllowedControlPath, isControlHost, isTenantHost, parseControlHosts, resolveControlHosts, resolveWizardHosts } from '../shared/controlCenter'

const PREFIXES = ['/api/auth/', '/api/onboarding/', '/api/health', '/api/telemetry/']

describe('Kontroll-Hosts auflösen', () => {
  it('liest die kommagetrennte Env-Liste und normalisiert', () => {
    expect(parseControlHosts(' Account.Pukalani.App , start.localhost ')).toEqual([
      'account.pukalani.app', 'start.localhost',
    ])
  })

  it('verträgt leer, undefined und Müll', () => {
    for (const raw of ['', undefined, null, ' , , ']) {
      expect(parseControlHosts(raw)).toEqual([])
    }
  })

  it('nimmt die Env VOR der app.config (Umgebung schlägt Build)', () => {
    expect(resolveControlHosts('app.localhost', ['account.pukalani.app'])).toEqual(['app.localhost'])
    expect(resolveControlHosts('', ['account.pukalani.app'])).toEqual(['account.pukalani.app'])
    expect(resolveControlHosts(undefined, undefined)).toEqual([])
  })

  it('vergleicht Hosts unabhängig von Groß-/Kleinschreibung', () => {
    const hosts = resolveControlHosts(undefined, ['account.pukalani.app'])
    expect(isControlHost('ACCOUNT.pukalani.app', hosts)).toBe(true)
    expect(isControlHost('account.pukalani.app', hosts)).toBe(true)
  })

  it('hält Community-Hosts und Leerwerte draußen', () => {
    const hosts = ['account.pukalani.app']
    for (const host of ['kunde.pukalani.app', 'pukalani.app', 'account.pukalani.app.evil.com', '', undefined, null]) {
      expect(isControlHost(host, hosts), String(host)).toBe(false)
    }
  })

  it('lässt die ABGESCHALTETEN Altnamen nicht mehr durch (AH-1)', () => {
    // `my.`/`start.` sind keine Kontroll-Hosts mehr, sondern bekommen eine 301
    // (00.legacy-control-hosts.ts). Stünden sie hier noch, hätte der Cutover
    // zwei Kundenbereiche statt einen.
    const hosts = ['account.pukalani.app']
    expect(isControlHost('my.pukalani.app', hosts)).toBe(false)
    expect(isControlHost('start.pukalani.app', hosts)).toBe(false)
  })

  it('ist ohne konfigurierte Hosts immer false (kein Versehens-Kundenbereich)', () => {
    expect(isControlHost('account.pukalani.app', [])).toBe(false)
  })
})

describe('Mandanten-Host erkennen (Betreiber-Inhalt sperren, N7)', () => {
  const CONTROL = ['account.pukalani.app']

  it('ist ohne Tenant-Gate IMMER false — Silo-Apps bleiben unverändert', () => {
    for (const host of ['localhost', 'kommentare.example.com', 'account.pukalani.app']) {
      expect(isTenantHost(false, host, CONTROL), String(host)).toBe(false)
      expect(isTenantHost(false, host, []), String(host)).toBe(false)
    }
  })

  it('lässt die Kontroll-Hosts der Pool-App in Ruhe', () => {
    expect(isTenantHost(true, 'account.pukalani.app', CONTROL)).toBe(false)
    expect(isTenantHost(true, 'ACCOUNT.pukalani.app', CONTROL)).toBe(false)
  })

  it('erkennt jede Kunden-Community als Mandanten-Host', () => {
    for (const host of ['kunde-a.localhost', 'morgenlicht.pukalani.app', 'demo.pukalani.app']) {
      expect(isTenantHost(true, host, CONTROL), host).toBe(true)
    }
  })

  it('ist fail-closed: unbekannte/leere Hosts gelten als Mandanten-Host', () => {
    // Die Middleware gibt diesen Hosts ohnehin 404 — aber Betreiber-Inhalt
    // darf auch dann nicht durchrutschen, wenn hier etwas Unerwartetes ankommt.
    for (const host of ['', undefined, null, 'irgendwas.example.com']) {
      expect(isTenantHost(true, host, CONTROL), String(host)).toBe(true)
    }
  })
})

describe('Wohin führt `/` auf einem Kontroll-Host? (F12)', () => {
  // Lokal gibt es weiterhin einen eigenen Kurz-Link-Host; in Produktion ist die
  // Liste seit AH-1 leer (s. der eigene Block darunter).
  const WIZARD = ['start.localhost']

  it('schickt den Kurz-Link-Host in den Wizard', () => {
    expect(controlHomeTarget('start.localhost', WIZARD, false)).toBe('wizard')
    expect(controlHomeTarget('START.localhost', WIZARD, false)).toBe('wizard')
  })

  it('zeigt auf dem Kundenbereich die Übersicht', () => {
    expect(controlHomeTarget('app.localhost', WIZARD, false)).toBe('overview')
  })

  it('lässt ein `?code=` immer in den Wizard — auch auf dem Kundenbereich', () => {
    // Weitergeleitete Mail, kopierter Link: die Absicht steht in der Query.
    expect(controlHomeTarget('app.localhost', WIZARD, true)).toBe('wizard')
    expect(controlHomeTarget('start.localhost', WIZARD, true)).toBe('wizard')
  })

  it('ist ohne konfigurierte Wizard-Hosts überall die Übersicht', () => {
    // Die Übersicht schickt Konten OHNE Community selbst weiter — der
    // Neukunde landet also auch dann im Trichter, nur einen Schritt später.
    for (const host of ['app.localhost', 'start.localhost', '', undefined, null]) {
      expect(controlHomeTarget(host, [], false), String(host)).toBe('overview')
    }
  })

  /**
   * DIE PRODUKTIONS-FORM SEIT AH-1 (2026-08-11): ein Kontroll-Host, keine
   * Wizard-Hosts. Beide Zusagen des Cutovers stehen hier nebeneinander, weil
   * die zweite die erste sonst still aushebeln könnte — eine Einladungs-Mail
   * ist sieben Tage gültig und landet nach der 301 von `start.*` mit ihrem
   * `?code=` auf genau diesem Host.
   */
  it('account.pukalani.app: `/` = Übersicht, `?code=` = Wizard', () => {
    expect(controlHomeTarget('account.pukalani.app', [], false)).toBe('overview')
    expect(controlHomeTarget('account.pukalani.app', [], true)).toBe('wizard')
  })
})

/**
 * WO LIEGT DER WIZARD? (AH-1) — die Liste für einen LINK dorthin, nicht die
 * Frage, was `/` zeigt.
 */
describe('resolveWizardHosts', () => {
  it('nimmt eigene Wizard-Hosts, wenn es welche gibt', () => {
    expect(resolveWizardHosts(['app.localhost'], ['start.localhost'])).toEqual(['start.localhost'])
  })

  it('fällt ohne Wizard-Hosts auf die Kontroll-Hosts zurück (Produktion seit AH-1)', () => {
    // `/start` liegt auf JEDEM Kontroll-Host — das ist kein Raten aus einer
    // fremden Achse, sondern die Bauart des onboarding-Layers.
    expect(resolveWizardHosts(['account.pukalani.app'], [])).toEqual(['account.pukalani.app'])
    expect(resolveWizardHosts(['account.pukalani.app'], undefined)).toEqual(['account.pukalani.app'])
    expect(resolveWizardHosts(['account.pukalani.app'], ['', '  '])).toEqual(['account.pukalani.app'])
  })

  it('bleibt leer, wenn beide Listen leer sind (Silo, Playground)', () => {
    expect(resolveWizardHosts(undefined, undefined)).toEqual([])
    expect(resolveWizardHosts([], [])).toEqual([])
  })
})

describe('Erlaubte Pfade im Kundenbereich (fail-closed)', () => {
  it('lässt die eingetragenen API-Präfixe durch', () => {
    for (const path of ['/api/auth/me', '/api/auth/login', '/api/onboarding/site', '/api/health', '/api/telemetry/error']) {
      expect(isAllowedControlPath(path, PREFIXES), path).toBe(true)
    }
  })

  it('lässt die Icon-Route durch — gegen die ECHTE Liste aus der app.config', () => {
    // Gemessen am 2026-08-14 auf account.pukalani.app: `/api/_nuxt_icon/ph.json`
    // fiel in das Fail-Closed dieser Wache, und damit fehlte auf ANMELDEN und
    // REGISTRIEREN jedes Symbol — sichtbar vor allem an der Passwort-Prüfliste,
    // die ihre Häkchen verlor und nur noch Text war. Die Route liefert
    // SVG-Pfade aus dem Iconify-Paket, fasst keine Datenbank an und hat mit
    // Mandanten-Scoping nichts zu tun.
    //
    // Geprüft wird bewusst die ECHTE Liste aus `app/app.config.ts`, nicht die
    // nachgebaute Konstante oben: ein Wächter, der seine eigene Kopie befragt,
    // bemerkt genau die Änderung nicht, gegen die er schützen soll.
    const config = readFileSync(new URL('../app/app.config.ts', import.meta.url), 'utf8')
    const line = /controlApiPrefixes:\s*\[([^\]]*)\]/.exec(config)
    expect(line, 'controlApiPrefixes in app.config.ts gefunden').toBeTruthy()
    const livePrefixes = [...line![1]!.matchAll(/'([^']+)'/g)].map(m => m[1]!)
    expect(livePrefixes.length).toBeGreaterThan(5)
    for (const path of ['/api/_nuxt_icon/ph.json', '/api/_nuxt_icon/lucide.json']) {
      expect(isAllowedControlPath(path, livePrefixes), path).toBe(true)
    }
    // Die Wache bleibt fail-closed: was nicht in der Liste steht, ist zu.
    expect(isAllowedControlPath('/api/comments', livePrefixes)).toBe(false)
  })

  it('lässt den Resend-Webhook durch, aber nur genau ihn (RS1 b) — gegen die ECHTE Liste', () => {
    // Live erwischt beim Einrichten am 2026-11-08: Secret gesetzt, Prozess
    // trug es, account.pukalani.app antwortete trotzdem 404 — diese Wache.
    const config = readFileSync(new URL('../app/app.config.ts', import.meta.url), 'utf8')
    const livePrefixes = [...(/controlApiPrefixes:\s*\[([^\]]*)\]/.exec(config)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(m => m[1]!)
    expect(isAllowedControlPath('/api/mail/resend-webhook', livePrefixes)).toBe(true)
    expect(isAllowedControlPath('/api/mail/other', livePrefixes)).toBe(false)
    expect(isAllowedControlPath('/api/mail', livePrefixes)).toBe(false)
  })

  it('sperrt JEDEN anderen API-Pfad — dort wäre nichts mandanten-gescopt', () => {
    for (const path of ['/api/comments', '/api/pages/public/home', '/api/themes', '/api/stats', '/api/admin/themes', '/api/presence/heartbeat']) {
      expect(isAllowedControlPath(path, PREFIXES), path).toBe(false)
    }
  })

  it('lässt sich nicht mit Präfix-Tricks umgehen', () => {
    // '/api/authX' beginnt mit '/api/auth', aber NICHT mit '/api/auth/' —
    // deshalb enden die Einträge auf einen Schrägstrich.
    expect(isAllowedControlPath('/api/authX/leak', PREFIXES)).toBe(false)
    expect(isAllowedControlPath('/api/onboarding-secret', PREFIXES)).toBe(false)
  })

  /**
   * Audit-Befund 9 (2026-08-02): der Vergleich war ein nacktes `startsWith`.
   * Für Einträge OHNE Schrägstrich am Ende — und vier der sieben echten stehen
   * so in der app.config — erlaubte das jeden Pfad, der zufällig mit demselben
   * Wort beginnt. Jetzt gilt die Segmentgrenze aus dem Produkt-Gate.
   */
  it('vergleicht an der SEGMENTGRENZE, auch bei Präfixen ohne Schrägstrich', () => {
    const real = ['/api/auth/', '/api/onboarding/', '/api/health', '/api/telemetry/', '/api/notifications', '/api/feedback', '/api/abuse']
    // Erlaubt bleibt, was erlaubt war.
    for (const path of ['/api/health', '/api/health?deep=1', '/api/notifications', '/api/notifications/42', '/api/feedback', '/api/abuse/report', '/api/auth/me', '/api/onboarding/site']) {
      expect(isAllowedControlPath(path, real), path).toBe(true)
    }
    // Und die Mitläufer sind draußen.
    for (const path of ['/api/healthz', '/api/health-internal', '/api/notificationsettings', '/api/feedbackfoo', '/api/abuse-export']) {
      expect(isAllowedControlPath(path, real), path).toBe(false)
    }
  })

  it('ein Schrägstrich am Ende des Präfixes verlangt kein doppeltes //', () => {
    expect(isAllowedControlPath('/api/auth', ['/api/auth/'])).toBe(true)
    expect(isAllowedControlPath('/api/auth/me', ['/api/auth/'])).toBe(true)
    expect(isAllowedControlPath('/api/authX', ['/api/auth/'])).toBe(false)
  })

  it('lässt Nicht-API-Pfade unberührt (Seiten, Assets, i18n)', () => {
    for (const path of ['/', '/start', '/de/start', '/_nuxt/entry.js', '/_i18n/de/messages.json']) {
      expect(isAllowedControlPath(path, PREFIXES), path).toBe(true)
    }
  })

  it('sperrt bei leerer Präfix-Liste jeden API-Pfad', () => {
    expect(isAllowedControlPath('/api/auth/me', [])).toBe(false)
    expect(isAllowedControlPath('/start', [])).toBe(true)
  })
})
