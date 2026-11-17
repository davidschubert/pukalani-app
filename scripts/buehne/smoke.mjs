/**
 * Rauchtest der Bühne (OPS-009, GA1 P27): steht die Bühne so, wie die
 * Beweis-Skripte sie brauchen? Gestartet über `pnpm buehne smoke` — die
 * Clients und der Stand kommen aus `buehne.mjs`.
 *
 * Geprüft wird gegen den laufenden Platform-Server, über echte Routen:
 *   1. jede Rolle auf Host A meldet sich an, `GET /api/auth/me` ⇒ 200;
 *   2. eine Mitglieder-Route (`GET /api/posts/discussions/link-search`):
 *      Mitglied ⇒ 200, fremdes Konto ⇒ 403 `not_a_member`, entferntes Konto
 *      ⇒ 403 `community_removed`;
 *   3. eine Verwaltungs-Route (`GET /api/community/members`, `team.manage`):
 *      der Owner von A auf A ⇒ 200, auf B ⇒ 403;
 *   4. eine dritte Wegwerf-Community über die ECHTE Anlage-Route
 *      (`createProbeCommunity`) — sie antwortet, dann wird alles wieder
 *      abgeräumt und nachgezählt.
 */
import {
  createCleanup,
  createHttpCaller,
  createProbeAccount,
  createProbeCommunity,
  login,
  runStamp,
  waitForHost,
} from '../lib/probe-stage.mjs'

const reasonOf = res => res.json?.reason ?? res.json?.data?.reason ?? null

/**
 * @param {{ state: any, platformPort: number, controlHost: string, pool: any, control: any, poolDatabaseId: string, controlDatabaseId: string }} ctx
 * @returns {Promise<{ pass: number, fail: number }>}
 */
export async function runSmoke({ state, platformPort, controlHost, pool, control, poolDatabaseId, controlDatabaseId }) {
  const { call } = createHttpCaller({ port: platformPort })
  let pass = 0
  let fail = 0
  const check = (label, ok, detail = '') => {
    if (ok) {
      pass++
      console.log(`  ✔ ${label}`)
    }
    else {
      fail++
      console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
    }
  }

  const { a, b } = state.communities
  console.log(`\nRauchtest der Bühne ${state.stamp} gegen [::1]:${platformPort}\n`)

  try {
    console.log('0. Beide Hosts antworten')
    check(`${a.host} antwortet`, await waitForHost(call, a.host))
    check(`${b.host} antwortet`, await waitForHost(call, b.host))

    console.log('\n1. Jede Rolle auf Host A: anmelden, /api/auth/me')
    /** @type {Record<string, string>} */
    const cookies = {}
    for (const [key, account] of Object.entries(a.accounts)) {
      try {
        cookies[key] = await login(call, a.host, account)
        const me = await call(a.host, '/api/auth/me', { cookie: cookies[key] })
        check(`${key}: /api/auth/me → 200`, me.status === 200, `Status ${me.status}`)
      }
      catch (error) {
        check(`${key}: Anmeldung`, false, error instanceof Error ? error.message : String(error))
      }
    }

    console.log('\n2. Mitglieder-Route (link-search) auf Host A')
    const SEARCH = '/api/posts/discussions/link-search?q=ab'
    const asMember = await call(a.host, SEARCH, { cookie: cookies.member })
    check('member → 200', asMember.status === 200, `Status ${asMember.status} ${asMember.text.slice(0, 120)}`)
    const asStranger = await call(a.host, SEARCH, { cookie: cookies.stranger })
    check('stranger → 403 not_a_member', asStranger.status === 403 && reasonOf(asStranger) === 'not_a_member',
      `Status ${asStranger.status}, Grund ${reasonOf(asStranger)}`)
    const asRemoved = await call(a.host, SEARCH, { cookie: cookies.removed })
    check('removed → 403 community_removed', asRemoved.status === 403 && reasonOf(asRemoved) === 'community_removed',
      `Status ${asRemoved.status}, Grund ${reasonOf(asRemoved)}`)

    console.log('\n3. Verwaltungs-Route (Mitgliederliste): Team auf A, nicht auf B')
    const ownerOnA = await call(a.host, '/api/community/members', { cookie: cookies.owner })
    check('owner von A auf A → 200', ownerOnA.status === 200, `Status ${ownerOnA.status} ${ownerOnA.text.slice(0, 120)}`)
    const ownerCookieB = await login(call, b.host, a.accounts.owner)
    const ownerOnB = await call(b.host, '/api/community/members', { cookie: ownerCookieB })
    check('owner von A auf B → 403', ownerOnB.status === 403, `Status ${ownerOnB.status}`)
  }
  catch (error) {
    fail++
    console.error(`\n✗ Abbruch: ${error instanceof Error ? error.message : String(error)}`)
  }

  console.log('\n4. Dritte Community über die echte Anlage-Route, danach Abbau')
  const cleanup = createCleanup({ pool, control, poolDatabaseId, controlDatabaseId })
  try {
    const stamp = runStamp()
    const founder = await createProbeAccount(pool, { tag: 'buehne-smoke-founder', stamp, name: 'Bühne Rauchtest' })
    cleanup.track('account', founder.userId)
    const cookie = await login(call, controlHost, founder)
    const site = await createProbeCommunity({
      call, controlHost, cookie, control, databaseId: controlDatabaseId,
      slug: `buehne-smoke-${stamp}`, name: 'Bühne Rauchtest',
      bodyOverrides: { description: 'Rauchtest der Bühne: die Anlage-Route nimmt den gemeinsamen Rumpf.' },
      cleanup,
    })
    check('angelegt (200, communityId)', !!site.communityId)
    check('Owner-Zeile steht', site.memberRowIds.length >= 1, `${site.memberRowIds.length} Zeilen`)
    check(`${site.host} antwortet`, await waitForHost(call, site.host))
  }
  catch (error) {
    check('Anlage über die echte Route', false, error instanceof Error ? error.message : String(error))
  }
  finally {
    const { deleted, leftovers } = await cleanup.run()
    const total = Object.values(deleted).reduce((sum, n) => sum + n, 0)
    console.log(`  gelöscht: ${total} (${Object.entries(deleted).map(([key, n]) => `${key} ${n}`).join(', ')})`)
    check('Wegwerf-Community restlos abgeräumt (übrig 0)', leftovers.length === 0, leftovers.join(', '))
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass} bestanden, ${fail} fehlgeschlagen\n`)
  return { pass, fail }
}

// Direkt gestartet tut diese Datei nichts — und ein stiller Exit 0 sähe aus
// wie ein bestandener Rauchtest. Der Einstieg ist `pnpm buehne smoke`.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  console.error('✗ Der Rauchtest läuft über die Bühne: `pnpm buehne smoke` (node scripts/buehne/buehne.mjs smoke).')
  process.exit(1)
}
