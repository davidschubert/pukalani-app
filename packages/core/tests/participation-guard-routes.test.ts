import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WÄCHTER: JEDE SCHREIBENDE ROUTE DER POOL-PRODUKTE HAT EINE WACHE (SEC-030).
 *
 * Ein Konto im Pool ist auf jedem Community-Host angemeldet. „Angemeldet"
 * sagt deshalb nichts darüber, ob jemand hierher gehört — jede Route, die
 * schreibt, muss das selbst fragen (oder über ein Rollen-Gate fragen lassen).
 * Bis 2026-11-13 fragten die Mitmach-Routen nur nach dem Konto.
 *
 * Diese Liste kann man nicht vergessen: sie zählt die Dateien selbst. Eine
 * NEUE Route ohne Wache macht den Test rot; ebenso ein Ausnahme-Eintrag, zu
 * dem es keine Datei mehr gibt (eine Ausnahme ohne Gegenstand würde sonst
 * still die nächste gleichnamige Route freistellen).
 *
 * Gesucht wird im Quelltext OHNE Kommentare: ein auskommentierter Aufruf oder
 * ein Satz „ruft requireCommunityMembership" in einem Kommentar zählt nicht.
 */

const REPO = resolve(import.meta.dirname, '../../..')

const POOL_LAYERS = ['comments', 'posts', 'events', 'courses', 'moderation', 'feedback', 'media', 'activity', 'messages'] as const

/** Aufrufe, die als Wache gelten. Rollen-Gates eingeschlossen. */
const GUARDS = [
  // Mitgliedschaft (SEC-030 / SEC-029)
  'requireCommunityParticipant',
  'requireCommunityMembership',
  'requireCourseMember',
  'requireCourseMemberJoining',
  // Rollen-Gates: eine Community-Rolle IST Mitgliedschaft, der Betreiber-
  // Break-Glass ist bewusst protokolliert (communityPermission.ts).
  'requireCommunityPermission',
  'requireCommunityTeamGate',
  // Instanz-Rechte (globales Label): im Pool hat sie nur der Betreiber.
  'requirePermission',
] as const

/**
 * Routen ohne Wache — jede mit Grund. Pfade relativ zum Repo.
 */
const EXCEPTIONS: Record<string, string> = {
  'packages/comments/server/api/comments/guest.post.ts':
    'Gast-Weg ohne Konto: es gibt niemanden, dessen Mitgliedschaft man prüfen könnte. Eigene Schranken: Config-Gate, '
    + 'öffentliche Community, Turnstile, Inhalts-Sperre (actor guest).',
  'packages/events/server/api/events/reminder-sweep.post.ts':
    'Dienst-Route ohne Nutzer: geschützt durch das Naht-Geheimnis (x-sweep-key), läuft je Community-Host.',
  // ÜBERSETZEN IST LESEN, NICHT MITMACHEN. Regel 4 der UGC-Übersetzung
  // („Übersetzen zeigt nie mehr als Lesen"): die drei Routen lesen ihr Ziel
  // über die Session-Klinke, wer es nicht lesen darf, bekommt 404. Eine
  // Mitgliedschafts-Pflicht nähme angemeldeten Lesern einer offenen Community
  // den Knopf, bevor sie je etwas geschrieben haben — genau den Menschen, die
  // ihn brauchen. Bremsen: 10 je 10 min je Mensch und Community, Tages-Eimer.
  // (Kurse und Lektionen sind anders: ihr Inhalt gehört Mitgliedern, SEC-029.)
  'packages/comments/server/api/comments/[id]/translate.post.ts':
    'Übersetzen ist Lesen: Ziel wird über die Session-Klinke gelesen (404 ohne Leserecht), nur Angemeldete, gebremst.',
  'packages/posts/server/api/posts/[id]/translate.post.ts':
    'Übersetzen ist Lesen: Ziel wird über die Session-Klinke gelesen (404 ohne Leserecht), nur Angemeldete, gebremst.',
  'packages/events/server/api/events/[id]/translate.post.ts':
    'Übersetzen ist Lesen: Ziel wird über die Session-Klinke gelesen (404 ohne Leserecht), nur Angemeldete, gebremst.',
  'packages/feedback/server/api/feedback/index.post.ts':
    'Feedback an den BETREIBER (Control Plane), kein Inhalt der Community; bewusst auch für Gäste '
    + '(Hürde minimal, Rate-Limit feedback:create, Stummschaltung je Community im Control Plane).',
}

const WRITE_ROUTE = /\.(post|patch|put|delete)\.ts$/

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

/** Block- und Zeilenkommentare entfernen (Strings bleiben stehen — gut genug für Bezeichner). */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

function guardIn(source: string): string | null {
  const code = stripComments(source)
  return GUARDS.find(guard => new RegExp(`\\b${guard}\\s*\\(`).test(code)) ?? null
}

const routes = POOL_LAYERS.flatMap(layer =>
  walk(resolve(REPO, `packages/${layer}/server/api`))
    .filter(path => WRITE_ROUTE.test(path))
    .map(path => ({ layer, path: relative(REPO, path), source: readFileSync(path, 'utf8') })))

describe('Wächter-Selbsttest', () => {
  it('ein auskommentierter Aufruf zählt nicht', () => {
    expect(guardIn('// await requireCommunityParticipant(event)\n')).toBeNull()
    expect(guardIn('/* requireCommunityMembership(event) */')).toBeNull()
    expect(guardIn('/**\n * ruft requireCommunityParticipant(event) auf\n */')).toBeNull()
  })

  it('ein echter Aufruf zählt', () => {
    expect(guardIn('  const user = await requireCommunityParticipant(event)')).toBe('requireCommunityParticipant')
  })

  it('findet die Routen der Pool-Layer', () => {
    expect(routes.length).toBeGreaterThan(50)
    for (const layer of POOL_LAYERS.filter(l => l !== 'activity')) {
      expect(routes.some(r => r.layer === layer), layer).toBe(true)
    }
  })
})

describe.each(POOL_LAYERS)('Layer %s: jede schreibende Route hat eine Wache', (layer) => {
  const own = routes.filter(r => r.layer === layer)
  if (own.length === 0) {
    it('hat keine schreibenden Routen', () => {
      expect(own).toEqual([])
    })
    return
  }
  it.each(own.map(r => [r.path, r.source] as const))('%s', (path, source) => {
    if (EXCEPTIONS[path]) {
      expect(EXCEPTIONS[path]!.length, 'Ausnahme braucht einen Grund').toBeGreaterThan(20)
      return
    }
    expect(guardIn(source), `${path}: keine Wache gefunden — requireCommunityParticipant (Mitmachen), `
      + 'requireCommunityMembership (eigenes Ändern) oder ein Rollen-Gate setzen, sonst begründet in EXCEPTIONS').not.toBeNull()
  })
})

describe('Ausnahmeliste', () => {
  it.each(Object.keys(EXCEPTIONS))('%s existiert noch', (path) => {
    expect(existsSync(resolve(REPO, path))).toBe(true)
  })

  it('stellt keine Route frei, die ohnehin eine Wache hat', () => {
    for (const path of Object.keys(EXCEPTIONS)) {
      const route = routes.find(r => r.path === path)
      expect(route, path).toBeDefined()
      expect(guardIn(route!.source), path).toBeNull()
    }
  })
})
