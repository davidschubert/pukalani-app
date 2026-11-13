import { createTenantsTableResolver } from '../../../../packages/control/server/utils/tenantsResolver'
import { createFormerCommunityMembersResolver, createCommunityMembersResolver } from '../../../../packages/control/server/utils/communityMembersResolver'
import { createCommunityHostResolver } from '../../../../packages/control/server/utils/communityHostResolver'
import { createCommunityJoinDatesResolver } from '../../../../packages/control/server/utils/communityJoinDatesResolver'

/**
 * A14-Komposition: die APP verdrahtet die core-Resolver-Verträge mit den
 * Tabellen des Control Plane (studio-Layer-Utilities). Beide sind CROSS-Projekt-
 * Reads mit demselben read-only-Key (Scope rows.read auf das Control-Plane-
 * Projekt) — bewusst getrennt vom Pool-Runtime-Key der App.
 *
 *  - tenants-Resolver: Host → TenantContext (inkl. communityId = tenants.$id).
 *  - community_members-Resolver: {communityId, runtimeProjectId, runtimeUserId} → Rolle
 *    (G1, requireCommunityPermission). Dieselbe Verbindung, eigener Cache.
 *  - GEBÜNDELTER Ehemaligen-Resolver (N9): viele runtimeUserIds → wer von ihnen
 *    aus DIESER Community entfernt wurde. Eigener Vertrag, weil eine
 *    Kommentarliste 25 Autoren hat und der Einzel-Lookup daraus 25
 *    Cross-Projekt-Abfragen machen würde; Cache pro Nutzer, 60 s, fail-soft.
 *  - BEITRITTS-Resolver (F1): „seit wann ist wer dabei?" (Abzeichen
 *    „Jahrestag") und „wie viele kamen in N Tagen dazu?" (About-Seite). EIN
 *    Vertrag mit zwei Fragen, weil beide dieselbe Tabelle über dieselbe
 *    Verbindung lesen — getrennt registriert könnte eine App die eine
 *    verdrahten und die andere vergessen, und beide sind fail-soft, also
 *    stumm. Cache 60 s.
 *  - HOST-Resolver (D5): Ablage-Wert einer Benachrichtigung → Host der
 *    Community, damit Benachrichtigungs-MAILS dorthin verlinken statt auf den
 *    App-Host. Gebündelt und OHNE H3Event, weil der Digest-Sweep ohne Request
 *    läuft; Cache 60 s, fail-soft (kein Host ⇒ App-Basis, nie eine verworfene
 *    Mail).
 *
 * OHNE VOLLSTÄNDIGE NUXT_PLATFORM_CONTROL_*-Env wird KEIN Resolver
 * registriert — und seit SEC-025 (2026-11-13, Davids Entscheidung: „Eine
 * Sicherung, die nicht prüfen kann, lehnt ab") LEHNT DIE APP DANN JEDE ANFRAGE
 * AB: `00.tenant.ts` (core) antwortet mit 503 `tenant_resolver_missing`, nur
 * `/api/health` antwortet (mit `ok:false` und diesem Grund). Vorher lief sie
 * an dieser Stelle still OHNE Trennung der Communities weiter. Die Zeile
 * unten nennt die NAMEN der fehlenden Variablen (nie Werte); die vier stehen
 * auch auf der Pflicht-Liste von `scripts/ops/verify-site-env.mjs`.
 * Ein Build braucht sie nicht (die Plugins laufen erst beim Start).
 */
const CONTROL_ENV_KEYS = [
  'NUXT_PLATFORM_CONTROL_ENDPOINT',
  'NUXT_PLATFORM_CONTROL_PROJECT_ID',
  'NUXT_PLATFORM_CONTROL_DATABASE_ID',
  'NUXT_PLATFORM_CONTROL_KEY',
] as const

export default defineNitroPlugin(() => {
  const endpoint = process.env.NUXT_PLATFORM_CONTROL_ENDPOINT
  const projectId = process.env.NUXT_PLATFORM_CONTROL_PROJECT_ID
  const databaseId = process.env.NUXT_PLATFORM_CONTROL_DATABASE_ID
  const apiKey = process.env.NUXT_PLATFORM_CONTROL_KEY
  if (!endpoint || !projectId || !databaseId || !apiKey) {
    const missing = CONTROL_ENV_KEYS.filter(key => !process.env[key])
    console.error(`[platform] FEHLER: ${missing.join(', ')} nicht gesetzt — kein Tenant-Resolver registriert. Die App lehnt deshalb ALLE Anfragen mit 503 ab (nur /api/health antwortet, mit ok:false). SEC-025`)
    return
  }
  registerTenantResolver(createTenantsTableResolver({ endpoint, projectId, apiKey, databaseId }))
  registerCommunityRoleResolver(createCommunityMembersResolver({ endpoint, projectId, apiKey, databaseId }))
  registerFormerCommunityMembersResolver(createFormerCommunityMembersResolver({ endpoint, projectId, apiKey, databaseId }))
  registerCommunityHostResolver(createCommunityHostResolver({ endpoint, projectId, apiKey, databaseId }))
  registerCommunityJoinDatesResolver(createCommunityJoinDatesResolver({ endpoint, projectId, apiKey, databaseId }))
})
