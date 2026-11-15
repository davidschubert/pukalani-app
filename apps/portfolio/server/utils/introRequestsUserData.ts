import { Query, type Models } from 'node-appwrite'
import type { H3Event } from 'h3'

/**
 * DSGVO-Contributor der Erstgespräch-Anfragen von pukalani.studio
 * (`intro_requests`, geschrieben allein von `server/api/intro-call.post.ts`,
 * angelegt von `scripts/ensure-intro-requests.mjs`) — SEC-026, Davids
 * Entscheidung 2026-11-15 „Export und Löschung erreichen alle Tabellen mit
 * Personenbezug".
 *
 * DIE ZEILEN HABEN KEINE userId: wer anfragt, hat kein Konto und bekommt keins.
 * Erreichbar sind sie nur über die ADRESSE — die Route speichert sie
 * kleingeschrieben (Zod `toLowerCase()`). Dieser Contributor greift deshalb
 * nur, wenn ein Konto DIESER Site dieselbe BESTÄTIGTE Adresse trägt. Eine
 * unbestätigte zählt nicht (Schnitt wie `erasureIdentity` im onboarding-
 * Layer): sonst legte jemand ein Konto mit fremder Adresse an und bekäme Name,
 * Firma und Telefon dieses Menschen als „Auskunft" — oder löschte seine
 * Anfrage. Anfragen OHNE passendes Konto erreicht dieser Weg nicht; das ist
 * der Normalfall und gehört zu einer Aufbewahrungsfrist, nicht hierher.
 *
 * Getrennt von `brand_intro_requests` (packages/brand): andere Site, andere
 * Instanz, anderer Schreiber.
 *
 * KONTO SCHON WEG: nur Appwrites 404 `user_not_found` heisst „keine Adresse
 * mehr, nichts zuzuordnen" (`isAppwriteUserMissing`); jeder andere Fehler beim
 * Lesen des Kontos wirft — sonst blieben die Zeilen still stehen, während die
 * Löschung Erfolg meldete.
 *
 * Die Tabelle entsteht per ensure-Skript, nicht per Migration — sie kann auf
 * einer Instanz fehlen; das ist die eine Nachsicht von
 * `listAllRowsIfTableExists`. Jeder andere Lesefehler wirft.
 *
 * LÖSCHUNG IST HART: der Personenbezug einer Anfrage ist alles an ihr (Name,
 * Firma, Adresse, Telefon, Freitext) — nach dem Leeren bliebe nichts übrig.
 * IDEMPOTENT: gelöschte Zeilen findet der zweite Lauf nicht mehr.
 */

export const INTRO_REQUESTS_TABLE = 'intro_requests'

type IntroRequestRow = Models.Row & {
  goals: string
  projectType: string
  industry: string
  budget: string
  teamSize: string
  market: string
  currentSetup: string
  timing: string
  note: string
  name: string
  company: string
  email: string
  phone: string
  locale: string
}

/** Die bestätigte Adresse des Kontos, kleingeschrieben — '' = keine. */
async function verifiedAccountEmail(event: H3Event, userId: string): Promise<string> {
  try {
    const { users } = createAdminClient(event)
    const user = await users.get({ userId })
    return user.emailVerification && user.email ? user.email.trim().toLowerCase() : ''
  }
  catch (error) {
    if (isAppwriteUserMissing(error)) return ''
    throw error
  }
}

async function introRequestRows(event: H3Event, userId: string): Promise<IntroRequestRow[]> {
  const email = await verifiedAccountEmail(event, userId)
  if (!email) return []
  const { tablesDB } = createAdminClient(event)
  return await listAllRowsIfTableExists<IntroRequestRow>(
    tablesDB,
    useRuntimeConfig(event).public.appwriteDatabaseId,
    INTRO_REQUESTS_TABLE,
    [Query.equal('email', email), Query.orderAsc('$createdAt')],
  )
}

export async function introRequestsExportUserData(event: H3Event, userId: string) {
  const rows = await introRequestRows(event, userId)
  return {
    introRequests: rows.map(row => ({
      createdAt: row.$createdAt,
      name: row.name,
      company: row.company,
      email: row.email,
      phone: row.phone,
      goals: row.goals,
      projectType: row.projectType,
      industry: row.industry,
      budget: row.budget,
      teamSize: row.teamSize,
      market: row.market,
      currentSetup: row.currentSetup,
      timing: row.timing,
      note: row.note,
      locale: row.locale,
    })),
  }
}

export async function introRequestsDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const rows = await introRequestRows(event, userId)
  const { tablesDB } = createAdminClient(event)
  const databaseId = useRuntimeConfig(event).public.appwriteDatabaseId
  let deleted = 0
  for (const row of rows) {
    await tablesDB.deleteRow({ databaseId, tableId: INTRO_REQUESTS_TABLE, rowId: row.$id })
    deleted++
  }
  return { deleted, anonymized: 0 }
}
