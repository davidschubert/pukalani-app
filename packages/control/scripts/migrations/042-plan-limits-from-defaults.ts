/**
 * Migration control-042: Kontingent-Zahlen in den Katalog (KK1 c, Davids
 * Antworten 6a/6b/6c vom 2026-11-22: „Jetzt bauen", die Vorgabe „bleibt in
 * der Platform-App", „heutige Werte übernehmen").
 *
 * Trägt je Plan (basic, personal, pro) die Zahlen aus
 * `apps/platform/shared/quotaPlans.ts` in die Zeile von `community_plans` —
 * NUR für Arten, die dort FEHLEN (`fillMissingPlanLimits`). Eine Art, die im
 * Katalog steht, bleibt unverändert, auch wenn ihre Zahl von der Vorgabe
 * abweicht; die Migration nennt die Abweichung nur. Alt-Zeilen (`free`,
 * `business`) fasst sie nicht an.
 *
 * NUR DATEN, keine Tabelle, keine Spalte: `schema.latest` zieht nach, die
 * `probe` im Manifest nicht. Der Code arbeitet OHNE diese Migration genau wie
 * vorher — fehlt eine Art im Katalog, gilt die Vorgabe aus der Platform-App
 * (`tenantLimitsFor`, core/server/utils/tenantQuota.ts). Ergebnis also: die
 * Bremse rechnet mit denselben Zahlen; neu ist nur, dass sie im Katalog
 * stehen und der Betreiber sie in der Konsole sieht und ändert.
 *
 * WIEDERHOLT SICH JEDER VOLLE LAUF: nimmt der Betreiber eine Art mit „auf
 * Vorgabe zurück" heraus, trägt der nächste volle Lauf sie wieder ein — mit
 * der Vorgabe-Zahl, also derselben Wirkung. Anders wird es erst, wenn die
 * Vorgabe in der Datei geändert wird; dann gilt im Katalog die alte Zahl, bis
 * der Betreiber sie ändert.
 *
 * Ohne Sperre des Control Plane (`withControlLock` ist eine Server-Hilfe):
 * ein gleichzeitiges Speichern in der Konsole während des Laufs könnte eine
 * hier hinzugefügte Art überschreiben oder umgekehrt — beides mit denselben
 * Zahlen. Den Lauf deshalb nicht neben einer Bearbeitung starten.
 *
 * ── ZIEL-INSTANZ: NUR DAS CONTROL PLANE ────────────────────────────────────
 *
 *   pnpm migrate --app control --only control-042
 *
 * DAUER: drei Lese- und höchstens drei Schreibzugriffe, wenige Sekunden.
 * Wirkung im Pool nach höchstens 90 s (Katalog-Cache 60 s + Host-Cache 30 s).
 *
 * RÜCKWEG: in der Konsole (Communities → „Pläne & Limits") je Art „auf
 * Vorgabe zurück" — oder die vor dem Lauf ausgegebene Zeile (`vorher:`) per
 * `PATCH /api/control/plans/<key>` mit `null` für die hinzugefügten Arten.
 * Die Bremse rechnet in beiden Fällen weiter mit denselben Zahlen.
 *
 * Benötigte Key-Scopes: rows.read, rows.write. Idempotent: ein zweiter Lauf
 * findet nichts mehr zu tun.
 */
import '../../../../scripts/lib/assert-target.mjs'
import { Client, TablesDB } from 'node-appwrite'
import { PLATFORM_QUOTA_PLANS } from '../../../../apps/platform/shared/quotaPlans.ts'
import { COMMUNITY_PLANS_TABLE, TENANT_PLANS, fillMissingPlanLimits, parseTenantPlanLimits, type TenantPlanLimits } from '../../shared/types/tenantRecord.ts'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID

const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!process.env.NUXT_APPWRITE_MIGRATIONS_KEY) {
  console.warn('⚠️  NUXT_APPWRITE_MIGRATIONS_KEY nicht gesetzt — Fallback auf NUXT_APPWRITE_KEY.')
}
if (!endpoint || !projectId || !apiKey || !databaseId) {
  console.error('Fehlende Env-Vars — über den Runner aufrufen: pnpm migrate --app <app>')
  process.exit(1)
}

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

function hasCode(error: unknown, code: number): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

console.log(`Migration control-042 gegen ${endpoint} / Projekt ${projectId} / DB ${databaseId}`)

const defaults: Record<string, Record<string, TenantPlanLimits>> = PLATFORM_QUOTA_PLANS

for (const key of TENANT_PLANS) {
  const planDefaults = defaults[key]
  if (!planDefaults) {
    console.log(`↷ Plan '${key}': keine Vorgabe in der Platform-App`)
    continue
  }

  let stored: Record<string, TenantPlanLimits> = {}
  let raw = ''
  try {
    const row = await tablesDB.getRow({ databaseId, tableId: COMMUNITY_PLANS_TABLE, rowId: key })
    raw = String((row as { limits?: unknown }).limits ?? '')
    stored = parseTenantPlanLimits(raw)
  }
  catch (error) {
    // 404 = die Zeile fehlt ⇒ sie entsteht mit der Vorgabe. Jeder andere
    // Fehler bricht ab: nie einen Stand schreiben, der die Zeile nicht kennt.
    if (!hasCode(error, 404)) throw error
  }

  for (const [kind, value] of Object.entries(stored)) {
    const fallback = planDefaults[kind]
    if (fallback && (fallback.perDay !== value.perDay || fallback.total !== value.total)) {
      console.log(`  Hinweis '${key}.${kind}': Katalog ${JSON.stringify(value)} weicht von der Vorgabe ${JSON.stringify(fallback)} ab — bleibt`)
    }
  }

  const { limits, added } = fillMissingPlanLimits(stored, planDefaults)
  if (added.length === 0) {
    console.log(`↷ Plan '${key}': alle Arten stehen schon im Katalog`)
    continue
  }

  console.log(`  vorher '${key}': ${raw || '(keine Zeile)'}`)
  await tablesDB.upsertRow({
    databaseId,
    tableId: COMMUNITY_PLANS_TABLE,
    rowId: key,
    data: { key, limits: JSON.stringify(limits) },
  })
  console.log(`✔ Plan '${key}': ergänzt ${added.join(', ')}`)
}

console.log('Migration control-042 abgeschlossen.')
