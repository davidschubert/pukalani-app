import type { H3Event } from 'h3'
import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import { BRAND_ACCESS_TABLE } from './brandAccess'
import type { BrandInviteRow } from './brandInvites'
import { BRAND_FINDINGS_TABLE } from './brandFindingsStore'
import {
  BRAND_INSPIRATION_TABLE,
  purgeBrandInspiration,
} from './brandInspirationStore'
import { BRAND_MARK_DRAFTS_TABLE, purgeBrandMarkDrafts } from './brandMarkDrafts'
import { runBrandProfileCascades } from './brandProfileCascade'
import { BRAND_PUBLICATIONS_TABLE, BRAND_PUBLICATION_REPORTS_TABLE } from './brandPublications'
import {
  BRAND_EVENTS_TABLE,
  BRAND_INTRO_REQUESTS_TABLE,
  BRAND_MESSAGES_TABLE,
  BRAND_PROFILES_TABLE,
  BRAND_SHARES_TABLE,
  BRAND_STEPS_TABLE,
  type BrandIntroRequestRow,
  type BrandProfileRow,
  brandDb,
  isAppwriteNotFound,
} from './brandStore'

/**
 * GDPR-EXPORT UND -LÖSCHUNG DES BRAND-LAYERS (Schema-Anhang §7).
 *
 * Der Core orchestriert, ohne ein einziges brand-Schema zu kennen
 * (`registerUserDataContributor`, CONCEPT A14) — was zu diesem Konto gehört,
 * weiss nur dieser Layer.
 *
 * ── DIE MENGE IST GRÖSSER ALS „SEINE PROFILE" ─────────────────────────────
 * Dazu gehören auch die `brand_access`-Zeile, die an SEINE ADRESSE gebundenen
 * Einladungen und die Funnel-Ereignisse mit seiner `userId`. Ein Export, der
 * nur die Profile zeigt, verschwiege, dass wir eine Einladung an diese Adresse
 * gespeichert haben.
 *
 * ── EINLADUNGEN WERDEN ANONYMISIERT, NICHT GELÖSCHT ───────────────────────
 * Die Zeile ist der Nachweis, dass ein Code AUSGEGEBEN und ggf. verbraucht
 * wurde; gelöscht liesse sie sich ein zweites Mal einlösen (der 409 auf die
 * Zeilen-Id fiele weg). Verschwinden muss die PERSON, nicht der Vorgang: aus
 * `emailLower` wird ein Marker, `redeemedByUserId` wird geleert. Genau die
 * Aufteilung, die `UserDataDeleteResult` mit `deleted`/`anonymized` meint.
 *
 * ── IDEMPOTENT ────────────────────────────────────────────────────────────
 * Jeder Schritt verzeiht ein 404 (Vertrag: „ein Re-Run nach Teilfehler findet
 * Rest-Daten oder nichts und terminiert erfolgreich"). Eine FEHLENDE TABELLE
 * verzeiht er ebenfalls — auf Instanzen ohne brand-Migration hat dieser Layer
 * nichts, und ein GDPR-Lauf darf daran nicht scheitern.
 */

export const BRAND_USER_DATA_ID = 'brand'

/** Der Marker, der an die Stelle der Adresse tritt. Keine Rück-Rechnung möglich. */
const ANONYMIZED_EMAIL = 'deleted@invalid'

async function safeListAll<T extends Models.Row>(
  event: H3Event,
  tableId: string,
  filters: string[],
): Promise<T[]> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await listAllRows<T>(tablesDB, databaseId, tableId, filters)
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return []
    throw error
  }
}

/**
 * Eine einzelne Zeile, deren Id wir kennen — `null`, wenn es sie (oder ihre
 * Tabelle) nicht gibt. Dieselbe Nachsicht wie `safeListAll` daneben: eine
 * Tabelle vor ihrer Migration ist kein Fehlschlag eines Export-Laufs.
 */
async function safeGet<T extends Models.Row>(
  event: H3Event,
  tableId: string,
  rowId: string,
): Promise<T | null> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    return await tablesDB.getRow<T>({ databaseId, tableId, rowId })
  }
  catch (error) {
    if (isAppwriteNotFound(error)) return null
    throw error
  }
}

/** Die Adresse des Kontos — sie ist der Schlüssel zu `brand_invites`. */
async function accountEmailLower(event: H3Event, userId: string): Promise<string | null> {
  try {
    const { users } = createAdminClient(event)
    const user = await users.get({ userId })
    return (user.email ?? '').toLowerCase() || null
  }
  catch {
    // Konto schon weg (Löschreihenfolge) ⇒ keine Einladungs-Zeilen auffindbar.
    // Das ist kein Fehlschlag: was nicht mehr adressierbar ist, kann auch nicht
    // mehr zugeordnet werden.
    return null
  }
}

export async function brandExportUserData(event: H3Event, userId: string): Promise<unknown> {
  const profiles = await safeListAll<BrandProfileRow>(event, BRAND_PROFILES_TABLE, [
    Query.equal('ownerType', 'user'),
    Query.equal('ownerId', userId),
  ])

  const exported = []
  for (const profile of profiles) {
    const filter = [Query.equal('profileId', profile.$id)]
    const shares = await safeListAll<Models.Row & { tokenHash?: string }>(event, BRAND_SHARES_TABLE, filter)
    exported.push({
      profile,
      steps: await safeListAll(event, BRAND_STEPS_TABLE, filter),
      messages: await safeListAll(event, BRAND_MESSAGES_TABLE, filter),
      // Die Befunde des Spezialisten (brand-014) gehören zum Branding: sie
      // tragen Aussagen ÜBER die Marke dieses Menschen und müssen deshalb im
      // Export erscheinen — ein Export, der sie verschwiege, wäre unvollständig.
      findings: await safeListAll(event, BRAND_FINDINGS_TABLE, filter),
      // `tokenHash` fliegt raus: er ist kein Datum ÜBER die Person, sondern das
      // Geheimnis eines Links — ein Export ist kein Ort dafür.
      shares: shares.map(({ tokenHash: _tokenHash, ...rest }) => rest),
      /**
       * DIE ÖFFENTLICHE VERÖFFENTLICHUNG (brand-020). Sie hängt NICHT an einer
       * `profileId`-Spalte, sondern TRÄGT die Profil-Id als Zeilen-Id — deshalb
       * ein eigener Lesevorgang statt `filter`. Sie gehört in den Export, weil
       * sie die weitreichendste Tatsache über dieses Branding ist: dass es
       * öffentlich steht.
       */
      publication: await safeGet(event, BRAND_PUBLICATIONS_TABLE, profile.$id),
      /**
       * DIE VORBILDER (brand-024, Brand Design D2a) — NUR die Metadaten:
       * Bereich, Notiz, Nummer, Dateiname und (ab D2b) die Lesung. Die BILDER
       * selbst reisen NICHT mit.
       *
       * Das ist kein Versehen und keine Lücke im Export: der GDPR-Export ist
       * eine JSON-Antwort, und ein Fremdwerk von 5 MB je Zeile gehört nicht
       * hinein. Was hier steht, ist die vollständige Auskunft darüber, WAS wir
       * über diese Bilder gespeichert haben — und die Bilder selbst hat der
       * Mensch hochgeladen, er hat sie also. Die LÖSCHUNG nimmt sie sehr wohl
       * mit (`purgeBrandInspiration`, s. u.).
       */
      inspiration: await safeListAll(event, BRAND_INSPIRATION_TABLE, filter),
      /**
       * DIE KI-ENTWÜRFE DES ZEICHENS (brand-023, Brand Design D5c) — NUR die
       * Metadaten: Name, Modell, Prompt-Hash und ob der Mensch den Entwurf
       * behalten hat. Die BILDER selbst reisen NICHT mit, aus demselben Grund
       * wie eine Zeile darüber: der Export ist eine JSON-Antwort. Die LÖSCHUNG
       * nimmt sie sehr wohl mit (`purgeBrandMarkDrafts`, s. u.).
       */
      markDrafts: await safeListAll(event, BRAND_MARK_DRAFTS_TABLE, filter),
    })
  }

  const emailLower = await accountEmailLower(event, userId)

  return {
    profiles: exported,
    access: await safeListAll(event, BRAND_ACCESS_TABLE, [Query.equal('userId', userId)]),
    invites: emailLower
      ? await safeListAll<BrandInviteRow>(event, BRAND_INVITES_TABLE, [Query.equal('emailLower', emailLower)])
      : [],
    events: await safeListAll(event, BRAND_EVENTS_TABLE, [Query.equal('userId', userId)]),
    /**
     * DIE GESPRÄCHSANFRAGEN (brand-021, BS1 Z0) — auf ZWEI Wegen gesucht und
     * zu EINER Liste vereinigt.
     *
     * Der Grund steht im Kopf der Migration: eine Anfrage kann VOR der
     * Anmeldung entstanden sein (dann trägt sie nur die Adresse) oder aus der
     * Werkstatt heraus (dann trägt sie die `userId`). Nur nach `userId` zu
     * suchen verschwiege dem Menschen die Anfrage, die er als Gast gestellt
     * hat — und genau die ist die ältere.
     *
     * Doppelte werden über die Zeilen-Id entfernt: eine Zeile mit BEIDEN
     * Merkmalen (angemeldet gefragt) kommt sonst zweimal im Export vor und
     * sähe wie zwei Anfragen aus.
     */
    introRequests: await introRequestRows(event, userId, emailLower),
  }
}

/**
 * Die Anfrage-Zeilen dieses Menschen — über `userId` UND über die Adresse.
 * Geteilt von Export und Löschung, damit beide dieselbe Menge meinen; eine
 * Löschung, die weniger findet als der Export zeigt, wäre der schlimmere der
 * beiden Fehler.
 */
async function introRequestRows(
  event: H3Event,
  userId: string,
  emailLower: string | null,
): Promise<BrandIntroRequestRow[]> {
  const byUser = await safeListAll<BrandIntroRequestRow>(
    event,
    BRAND_INTRO_REQUESTS_TABLE,
    [Query.equal('userId', userId)],
  )
  const byEmail = emailLower
    ? await safeListAll<BrandIntroRequestRow>(
        event,
        BRAND_INTRO_REQUESTS_TABLE,
        [Query.equal('emailLower', emailLower)],
      )
    : []

  const seen = new Map<string, BrandIntroRequestRow>()
  for (const row of [...byUser, ...byEmail]) seen.set(row.$id, row)
  return [...seen.values()]
}

export async function brandDeleteUserData(event: H3Event, userId: string): Promise<UserDataDeleteResult> {
  const { tablesDB, databaseId } = brandDb(event)
  let deleted = 0
  let anonymized = 0

  async function remove(tableId: string, rowId: string): Promise<void> {
    try {
      await tablesDB.deleteRow({ databaseId, tableId, rowId })
      deleted++
    }
    catch (error) {
      if (!isAppwriteNotFound(error)) throw error
    }
  }

  const profiles = await safeListAll<BrandProfileRow>(event, BRAND_PROFILES_TABLE, [
    Query.equal('ownerType', 'user'),
    Query.equal('ownerId', userId),
  ])

  for (const profile of profiles) {
    const filter = [Query.equal('profileId', profile.$id)]
    // Kinder zuerst — dieselbe Reihenfolge und derselbe Grund wie in der
    // Löschroute: ein Abbruch soll sichtbaren Rest hinterlassen, keinen
    // unsichtbaren.
    for (const tableId of [
      BRAND_STEPS_TABLE,
      BRAND_MESSAGES_TABLE,
      BRAND_SHARES_TABLE,
      BRAND_EVENTS_TABLE,
      BRAND_FINDINGS_TABLE,
    ]) {
      for (const row of await safeListAll<Models.Row>(event, tableId, filter)) {
        await remove(tableId, row.$id)
      }
    }
    // Die Veröffentlichung (brand-020) und ihre Meldungen. Sie stehen NICHT in
    // der Schleife darüber, weil sie nicht an einer `profileId`-Spalte hängen:
    // die Veröffentlichung TRÄGT die Profil-Id als Zeilen-Id, die Meldungen
    // zeigen mit `publicationId` darauf. Ohne sie bliebe nach einer
    // Konto-Löschung eine öffentlich ausgelieferte Marken-Seite stehen — der
    // eine Rest, den man von aussen sehen kann.
    for (const row of await safeListAll<Models.Row>(event, BRAND_PUBLICATION_REPORTS_TABLE, [
      Query.equal('publicationId', profile.$id),
    ])) {
      await remove(BRAND_PUBLICATION_REPORTS_TABLE, row.$id)
    }
    await remove(BRAND_PUBLICATIONS_TABLE, profile.$id)
    /**
     * DIE VORBILDER (brand-024) — ZEILEN **UND** DATEIEN.
     *
     * Sie stehen nicht in der Tabellen-Schleife darüber, weil an jeder Zeile
     * eine DATEI im Bucket `brand-inspiration` hängt (Zeilen-Id = Datei-Id).
     * Ein `deleteRow` allein liesse die Bilder liegen — Fremdwerke, die keine
     * Route mehr erreicht und die niemand mehr einsammeln kann. Genau der
     * Rest, gegen den §2.13 geschrieben ist.
     */
    deleted += await purgeBrandInspiration(event, profile.$id)
    /**
     * DIE KI-ENTWÜRFE (brand-023) — ZEILEN **UND** DATEIEN, aus demselben
     * Grund wie die Vorbilder eine Zeile darüber (Zeilen-Id = Datei-Id im
     * Bucket `brand-drafts`).
     */
    deleted += await purgeBrandMarkDrafts(event, profile.$id)
    // Die Mitläufer anderer Layer an derselben `profileId` (MV1 M1) — dieselbe
    // Registry und dieselbe Stelle wie in der Löschroute. Ohne sie bliebe nach
    // einer Konto-Löschung Inhalt liegen, den keine Route mehr erreicht.
    for (const count of Object.values(await runBrandProfileCascades(event, profile.$id))) {
      if (count > 0) deleted += count
    }
    await remove(BRAND_PROFILES_TABLE, profile.$id)
  }

  for (const row of await safeListAll<Models.Row>(event, BRAND_ACCESS_TABLE, [Query.equal('userId', userId)])) {
    await remove(BRAND_ACCESS_TABLE, row.$id)
  }

  // Ereignisse OHNE Profil-Bezug (z. B. `invite.redeemed`) hängen nur an der
  // userId — sie wären sonst der Rest, der die Person überlebt.
  for (const row of await safeListAll<Models.Row>(event, BRAND_EVENTS_TABLE, [Query.equal('userId', userId)])) {
    await remove(BRAND_EVENTS_TABLE, row.$id)
  }

  const emailLower = await accountEmailLower(event, userId)
  if (emailLower) {
    for (const invite of await safeListAll<BrandInviteRow>(event, BRAND_INVITES_TABLE, [Query.equal('emailLower', emailLower)])) {
      try {
        await tablesDB.updateRow({
          databaseId,
          tableId: BRAND_INVITES_TABLE,
          rowId: invite.$id,
          data: { emailLower: ANONYMIZED_EMAIL, redeemedByUserId: '' },
        })
        anonymized++
      }
      catch (error) {
        if (!isAppwriteNotFound(error)) throw error
      }
    }
  }

  /**
   * DIE GESPRÄCHSANFRAGEN (brand-021) WERDEN GELÖSCHT, NICHT ANONYMISIERT.
   *
   * Das ist der bewusste Unterschied zu den Einladungen darüber. Eine
   * Einladungs-Zeile ist der NACHWEIS eines Vorgangs — gelöscht liesse sich
   * derselbe Code ein zweites Mal einlösen, der 409 auf die Zeilen-Id fiele
   * weg. Eine Anfrage-Zeile beweist nichts und schaltet nichts frei: sie IST
   * die Nachricht dieses Menschen, samt Name, Adresse, Telefonnummer und
   * einem frei geschriebenen Anliegen. Ein anonymisierter Rest davon wäre ein
   * Text ohne Absender in einer Betreiber-Liste — nutzlos für uns und für ihn
   * eine Zumutung.
   *
   * Gesucht wird über BEIDE Wege (`introRequestRows`, s. Export): eine
   * Anfrage aus der Zeit vor der Anmeldung trägt nur die Adresse.
   */
  for (const row of await introRequestRows(event, userId, emailLower)) {
    await remove(BRAND_INTRO_REQUESTS_TABLE, row.$id)
  }

  return { deleted, anonymized }
}
