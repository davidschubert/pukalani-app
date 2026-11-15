#!/usr/bin/env node
/**
 * Seed: Termine für eine SCHAUFENSTER-Community (Demo).
 *
 * Gegenstück zu `packages/posts/scripts/seed-demo-discussions.mjs` — getrennt,
 * weil Events dem events-Layer gehören und Kategorien/Beiträge dem posts-Layer
 * (Layer-Grenzen-Matrix, CONCEPT.md A14). Ein Skript, das beide Tabellen
 * anfasst, wäre die erste Ausnahme, auf die sich später weitere berufen.
 *
 * WOZU: `demo.pukalani.app` ist von der Startseite verlinkt und zeigte unter
 * „Events" nur „Aktuell sind keine Events geplant" — bei einem Produkt, das die
 * Marketing-Seite bewirbt (Kundenreise 2026-08-15, OPEN-ITEMS D7).
 *
 * MANDANT UND LESE-PUBLIKUM SIND PFLICHT-ANGABEN, mit derselben Begründung wie
 * beim Diskussions-Seed: der Stempel ist auf einer Pool-Instanz nicht zu sehen,
 * wenn er fehlt, und `communities.audience` steht im Control-Plane-Projekt, zu
 * dem dieses Skript keinen Zugang hat. Geraten würde hier im schlimmsten Fall
 * eine geschlossene Community öffentlich.
 *
 * ZUSAGEN SIND ECHTE ZEILEN, keine hochgesetzte Zahl. `attendeeCount` ist ein
 * denormalisierter Wert, den sonst nur der Server bei einer RSVP hochzählt —
 * ihn allein zu setzen ergäbe ein Schaufenster, das „6 Zusagen" behauptet und
 * beim Aufklappen niemanden zeigt. Das Skript legt deshalb zu jeder gezählten
 * Zusage eine `event_rsvps`-Zeile an und setzt den Zähler auf deren Anzahl.
 *
 * IDEMPOTENT über den `title` zusammen mit der Community.
 *
 * Aufruf (Pool/Produktion):
 *   node --env-file=~/.appwrite-secrets/migrations/account.env \
 *     packages/events/scripts/seed-demo-events.mjs --community t-demo --public
 *
 * `--dry-run` zeigt nur, was entstehen würde.
 */
import '../../../scripts/lib/assert-target.mjs'
import { Client, ID, Permission, Query, Role, TablesDB } from 'node-appwrite'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY ?? process.env.NUXT_APPWRITE_KEY
if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('Fehlende Env-Vars — mit --env-file der Instanz aufrufen.')
  process.exit(1)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const oeffentlich = args.includes('--public')
const i = args.indexOf('--community')
const community = i >= 0 ? (args[i + 1] ?? '') : ''
if (!community) {
  console.error('Pflicht: --community <tenantId>  (z. B. t-demo)')
  process.exit(1)
}
if (!oeffentlich) {
  console.error('Pflicht: --public — dieses Skript setzt read(any) und ist nur für eine')
  console.error('öffentliche Community gedacht (communities.audience = "public").')
  process.exit(1)
}

const EVENTS_TABLE = 'events'
const RSVPS_TABLE = 'event_rsvps'
const READ_PUBLIC = [Permission.read(Role.any())]

/**
 * Feste Zeitpunkte statt „in N Tagen": ein Termin ist eine Verabredung, kein
 * gleitender Abstand. Die Uhrzeiten sind in UTC angegeben und auf das
 * DACH-Publikum gelegt (Lena sitzt auf Maui, ihre Leute sitzen in Europa) —
 * 17:00 UTC ist 19:00 in Mitteleuropa im Sommer.
 *
 * ACHTUNG BEIM NACHPFLEGEN: Läuft ein Datum ab, verschwindet der Termin aus
 * „Kommende" und landet im Archiv. Dann gehören hier neue Daten hinein — die
 * bestehenden Zeilen rührt das Skript nicht an.
 */
const TERMINE = [
  {
    title: 'Live-Session: Zehn Minuten, die immer gehen',
    description: 'Wir gehen die kurze Reihenfolge gemeinsam durch — die, die auch an einem schlechten Morgen funktioniert.\n\nKamera aus ist völlig in Ordnung. Wer mitmachen will, braucht nur so viel Platz, wie eine Matte hat.\n\nAufzeichnung gibt es danach im Feed.',
    startAt: '2026-08-27T17:00:00.000Z',
    endAt: '2026-08-27T17:45:00.000Z',
    locationType: 'online',
    location: null,
    url: 'https://meet.jit.si/morgenlicht-live',
    capacity: null,
    zusagen: ['demo-anna', 'demo-jonas', 'demo-tobi', 'demo-miriam', 'demo-nalani'],
  },
  {
    title: 'Sunrise practice on Haleakalā',
    description: 'For everyone on the island — or visiting. We meet in the dark, walk the last stretch together and practise as the light comes up.\n\nBring a jacket. It is genuinely cold up there before sunrise, and everyone underestimates it exactly once.\n\nSmall group on purpose.',
    startAt: '2026-09-12T15:30:00.000Z',
    endAt: '2026-09-12T17:30:00.000Z',
    locationType: 'venue',
    location: 'Haleakalā, Maui — Treffpunkt am Besucherzentrum',
    url: null,
    capacity: 12,
    zusagen: ['demo-grace', 'demo-nalani'],
  },
  {
    title: 'Sunrise-Retreat — Wochenende auf Maui',
    description: 'Das Retreat, nach dem im Feed gefragt wurde: zweite November-Woche, von Freitagabend bis Sonntagmittag.\n\nZwei Einheiten am Tag, dazwischen viel Zeit und wenig Programm. Kein Vorwissen nötig — die Gruppe ist gemischt, und das ist der Punkt.\n\nAnmeldung über die Zusage hier; alles Weitere kommt per Nachricht.',
    startAt: '2026-11-13T04:00:00.000Z',
    endAt: '2026-11-15T22:00:00.000Z',
    locationType: 'venue',
    location: 'Kula, Maui',
    url: null,
    capacity: 20,
    zusagen: ['demo-anna', 'demo-grace', 'demo-miriam', 'demo-jonas'],
  },
]

const tablesDB = new TablesDB(new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey))

async function findeTermin(title) {
  const { rows } = await tablesDB.listRows({
    databaseId, tableId: EVENTS_TABLE,
    queries: [Query.equal('communityId', [community]), Query.equal('title', [title]), Query.limit(1)],
  })
  return rows[0] ?? null
}

console.log(`Seed Termine → ${endpoint} / Projekt ${projectId} / DB ${databaseId} / Community ${community}${dryRun ? '  [DRY RUN]' : ''}`)

let neu = 0
for (const t of TERMINE) {
  if (await findeTermin(t.title)) { console.log(`↷ „${t.title}" (existiert)`); continue }
  if (dryRun) { console.log(`+ ${t.title}  (${t.startAt}, ${t.zusagen.length} Zusagen)`); neu++; continue }

  const row = await tablesDB.createRow({
    databaseId, tableId: EVENTS_TABLE, rowId: ID.unique(),
    data: {
      title: t.title,
      description: t.description,
      startAt: t.startAt,
      endAt: t.endAt,
      location: t.location,
      url: t.url,
      capacity: t.capacity,
      // wird gleich auf die Anzahl der wirklich angelegten Zusagen gesetzt
      attendeeCount: 0,
      status: 'published',
      organizerId: 'demo-lena',
      organizerName: 'Lena (Coach)',
      locationType: t.locationType,
      replayUrl: null,
      coverFileId: null,
      address: null,
      locationNotes: null,
      upvotes: 0,
      downvotes: 0,
      score: 0,
      remindersSentAt: null,
      access: null,
      priceAmount: null,
      priceLookupKey: null,
      recurrence: '',
      seriesId: '',
      seriesIndex: 0,
      seriesUntil: null,
      seriesGeneratedUntil: null,
      communityId: community,
    },
    permissions: READ_PUBLIC,
  })

  let gezaehlt = 0
  for (const userId of t.zusagen) {
    await tablesDB.createRow({
      databaseId, tableId: RSVPS_TABLE, rowId: ID.unique(),
      data: { eventId: row.$id, userId, status: 'going', communityId: community },
      // Eine Zusage ist keine öffentliche Aussage: sie gehört der Person und
      // der Zählung. Gelesen wird sie über den Server, nicht vom Browser.
      permissions: [],
    })
    gezaehlt++
  }
  await tablesDB.updateRow({
    databaseId, tableId: EVENTS_TABLE, rowId: row.$id, data: { attendeeCount: gezaehlt },
  })

  neu++
  console.log(`✔ ${t.title}  (${gezaehlt} Zusagen)`)
}

console.log(`\nFertig: ${neu} Termine neu${dryRun ? ' (nichts geschrieben)' : ''}.`)
