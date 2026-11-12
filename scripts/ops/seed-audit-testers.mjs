#!/usr/bin/env node
/**
 * Gesamtaudit: zwei lokale Audit-Testnutzer und ein Einladungs-Code für den
 * Wizard (Runbook docs/runbooks/GESAMTAUDIT.md, Abschnitt „Vorbereitung").
 * Abgeleitet aus packages/onboarding/scripts/seed-local-tester.mjs.
 *
 * NUR LOKAL: bricht ab, wenn der Endpoint nicht localhost ist. Passwörter werden
 * zufällig erzeugt und nur in die AUDIT_ENV-Datei geschrieben (chmod 600), nie
 * ausgegeben. Ein zweiter Lauf setzt neue Passwörter und legt einen neuen Code an.
 *
 *   MAIN=<Haupt-Checkout>
 *   POOL_KEY=$(grep '^NUXT_APPWRITE_KEY=' $MAIN/apps/platform/.env | cut -d= -f2-) \
 *   AUDIT_ENV=~/Developer/Claude/Audits/pukalani-<JJJJ-MM>/.env.audit \
 *   node --env-file=$MAIN/apps/control/.env scripts/ops/seed-audit-testers.mjs
 */
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync, chmodSync } from 'node:fs'
import { Client, ID, Query, TablesDB, Users } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const controlProject = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const controlKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY
const poolProject = process.env.NUXT_PUBLIC_CONTROL_POOL_PROJECT
const poolKey = process.env.POOL_KEY
const auditEnv = process.env.AUDIT_ENV

if (!endpoint || !controlProject || !databaseId || !controlKey || !poolProject || !poolKey || !auditEnv) {
  console.error('✗ Env unvollständig.')
  process.exit(1)
}
if (!/^http:\/\/localhost(:\d+)?\/v1$/.test(endpoint)) {
  console.error(`✗ Kein lokaler Endpoint: ${endpoint}`)
  process.exit(1)
}

const pw = () => `Audit-${randomBytes(12).toString('base64url')}-1!`
const testers = [
  { key: 'BASIC', email: 'audit-basic@example.test', name: 'Audit Basic', password: pw() },
  { key: 'OWNER', email: 'audit-owner@example.test', name: 'Audit Owner', password: pw() },
]
const today = new Date().toISOString().slice(0, 10)
const CODE = `AUDIT-${randomBytes(4).toString('hex').toUpperCase()}`

const control = new TablesDB(new Client().setEndpoint(endpoint).setProject(controlProject).setKey(controlKey))
const users = new Users(new Client().setEndpoint(endpoint).setProject(poolProject).setKey(poolKey))

for (const t of testers) {
  const { users: found } = await users.list({ queries: [Query.equal('email', t.email), Query.limit(1)] })
  if (found[0]) {
    await users.updatePassword({ userId: found[0].$id, password: t.password })
    t.id = found[0].$id
    console.log(`↷ ${t.email} existierte, Passwort neu gesetzt`)
  }
  else {
    const u = await users.create({ userId: ID.unique(), email: t.email, password: t.password, name: t.name })
    t.id = u.$id
    console.log(`✔ ${t.email} angelegt`)
  }
  await users.updateEmailVerification({ userId: t.id, emailVerification: true })
}

await control.createRow({
  databaseId, tableId: 'invite_codes', rowId: ID.unique(),
  data: {
    codeHash: createHash('sha256').update(CODE, 'utf8').digest('hex'),
    label: `Gesamtaudit ${today} (lokal)`, maxUses: 1, uses: 0, expiresAt: null, status: 'active',
  },
})
console.log('✔ Einladungs-Code angelegt (1 Nutzung)')

const lines = [
  `# Lokale Audit-Testnutzer (Projekt ${poolProject}, nur localhost). Angelegt ${today}.`,
  '# BASIC: ohne Labels/Rollen/Community. OWNER: legt im Wizard mit AUDIT_INVITE_CODE',
  '# selbst eine Test-Community an (das ist zugleich die Journey "Community anlegen").',
  `AUDIT_APPWRITE_ENDPOINT=${endpoint}`,
  `AUDIT_POOL_PROJECT=${poolProject}`,
  ...testers.flatMap(t => [
    `AUDIT_${t.key}_EMAIL=${t.email}`,
    `AUDIT_${t.key}_PASSWORD=${t.password}`,
    `AUDIT_${t.key}_USER_ID=${t.id}`,
  ]),
  `AUDIT_INVITE_CODE=${CODE}`,
  '',
]
writeFileSync(auditEnv, lines.join('\n'))
chmodSync(auditEnv, 0o600)
console.log(`✔ Zugänge in ${auditEnv} (chmod 600)`)
