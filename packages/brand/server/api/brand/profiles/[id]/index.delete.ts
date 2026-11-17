import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import type { BrandProfileDeleteResponse } from '../../../../../shared/types/brand'
import { markBrandChecksErased } from '../../../../utils/brandCheckErasure'
import { BRAND_FINDINGS_TABLE } from '../../../../utils/brandFindingsStore'
import { purgeBrandInspiration } from '../../../../utils/brandInspirationStore'
import { purgeBrandMarkDrafts } from '../../../../utils/brandMarkDrafts'
import { BrandProfileCascadeError, runBrandProfileCascades } from '../../../../utils/brandProfileCascade'
import { purgeBrandRuns } from '../../../../utils/brandRun'
import {
  BRAND_PUBLICATIONS_TABLE,
  BRAND_PUBLICATION_REPORTS_TABLE,
} from '../../../../utils/brandPublications'
import {
  BRAND_EVENTS_TABLE,
  BRAND_MESSAGES_TABLE,
  BRAND_PROFILES_TABLE,
  BRAND_SHARES_TABLE,
  BRAND_STEPS_TABLE,
  brandDb,
  isAppwriteNotFound,
  loadOwnedProfile,
  requireProfileIdParam,
} from '../../../../utils/brandStore'

/**
 * EIN BRANDING LÖSCHEN — die Kaskade aus Schema-Anhang §7, wörtlich in dieser
 * Reihenfolge: steps → messages → shares → events(profileId) → findings →
 * profile (die Befunde seit brand-014).
 *
 * ── KINDER ZUERST, UND ZWAR AUS EINEM BETRIEBLICHEN GRUND ─────────────────
 * Appwrite kennt keine Transaktion und kein ON DELETE CASCADE. Bricht der Lauf
 * in der Mitte ab, entscheidet die Reihenfolge, WAS zurückbleibt: mit dem Kopf
 * zuletzt bleibt ein Profil mit halbem Inhalt stehen — sichtbar, wiederholbar,
 * heilbar. Andersherum bliebe Inhalt ohne Kopf liegen: unsichtbar in jeder
 * Oberfläche, von keiner Route mehr erreichbar und damit für immer da.
 *
 * ── DIE SHARES GEHEN MIT, NICHT NUR IHR `revokedAt` ───────────────────────
 * Ein gelöschtes Branding hat keinen Snapshot mehr, den ein alter Link zeigen
 * könnte. Die Zeile zu widerrufen statt zu löschen würde den Text aufbewahren,
 * den der Mensch gerade weghaben wollte.
 *
 * ── IDEMPOTENT ────────────────────────────────────────────────────────────
 * Jede Löschung verzeiht ein 404. Ein zweiter Aufruf nach einem Teilfehler
 * findet Reste (oder nichts) und endet erfolgreich — dieselbe Zusage, die der
 * GDPR-Contributor daneben gibt, und derselbe Code dahinter.
 *
 * ── DAS PROFIL WIRD VORHER GELADEN ────────────────────────────────────────
 * Nicht aus Höflichkeit: `loadOwnedProfile` ist die Besitz-Prüfung. Ohne sie
 * wäre eine fremde Profil-Id ein Löschknopf.
 */
export default defineEventHandler(async (event): Promise<BrandProfileDeleteResponse> => {
  const { userId } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  await loadOwnedProfile(event, userId, profileId)

  const { tablesDB, databaseId } = brandDb(event)

  async function purge(tableId: string, field = 'profileId', value = profileId): Promise<number> {
    let removed = 0
    let rows: Models.Row[]
    try {
      rows = await listAllRows<Models.Row>(tablesDB, databaseId, tableId, [Query.equal(field, value)])
    }
    catch (error) {
      // Tabelle fehlt (Deploy vor der Migration) ⇒ es gibt nichts zu löschen.
      if (isAppwriteNotFound(error)) return 0
      throw toH3Error(error, 'Brand profile could not be deleted')
    }
    for (const row of rows) {
      try {
        await tablesDB.deleteRow({ databaseId, tableId, rowId: row.$id })
        removed++
      }
      catch (error) {
        if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand profile could not be deleted')
      }
    }
    return removed
  }

  /**
   * DIE CHECKS DER MARKE (brand-026, SEC-015) — ZUERST, und sie werden nur
   * MARKIERT: ab jetzt sieht sie niemand mehr, nach 90 Tagen räumt ein Lauf
   * sie ab (Davids Entscheidung, `brandCheckErasure.ts`). Gefunden über
   * `profileId` und den Dokument-Schlüssel `doc:<profileId>` — beides geht nur
   * mit der Profil-Id, also vor dem Kopf.
   *
   * Scheitert es, bleibt ALLES stehen und die Antwort ist dieselbe 502 wie
   * bei einem scheiternden Mitläufer: ein „gelöscht" mit weiter sichtbaren
   * Ergebnissen wäre die falsche Meldung. Ein zweiter Versuch ist gefahrlos —
   * ein schon gesetzter Zeitpunkt wird nicht verschoben.
   */
  let checksErased: number
  try {
    checksErased = await markBrandChecksErased(event, { profileId })
  }
  catch (error) {
    logEvent('warn', 'brand.profile_checks_erase_failed', {
      profileId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({
      status: 502,
      statusText: 'Brand profile could not be deleted completely',
      data: { code: 'profile_delete_incomplete' },
    })
  }

  const steps = await purge(BRAND_STEPS_TABLE)
  const messages = await purge(BRAND_MESSAGES_TABLE)
  const shares = await purge(BRAND_SHARES_TABLE)
  const events = await purge(BRAND_EVENTS_TABLE)
  // Die Befunde des Spezialisten (brand-014). Sie hängen an `profileId` wie
  // alles andere — ohne diese Zeile bliebe unsichtbarer Inhalt liegen, den
  // keine Route mehr erreicht (die Begründung im Kopf gilt wörtlich).
  const findings = await purge(BRAND_FINDINGS_TABLE)
  /**
   * DIE VERÖFFENTLICHUNG UND IHRE MELDUNGEN (brand-020, Discover D1).
   *
   * Sie hängen NICHT an einer `profileId`-Spalte: die Zeile der Veröffentlichung
   * TRÄGT die Profil-Id als ihre eigene (Kopf von brand-020), die Meldungen
   * zeigen mit `publicationId` darauf. Ohne diese zwei Zeilen bliebe nach dem
   * Löschen eines Brandings eine öffentlich ausgelieferte Seite ohne Eigentümer
   * stehen — der teuerste denkbare Rest, und genau die Fehlerklasse, gegen die
   * der Kopf dieser Route geschrieben ist.
   */
  const publicationReports = await purge(BRAND_PUBLICATION_REPORTS_TABLE, 'publicationId', profileId)
  /**
   * DIE VORBILDER (brand-024, Brand Design D2a) — ZEILEN **UND** DATEIEN.
   *
   * Sie laufen nicht durch `purge()`, weil an jeder Zeile eine Datei im Bucket
   * `brand-inspiration` hängt (Zeilen-Id = Datei-Id). Ein `deleteRow` allein
   * liesse Fremdwerke im Speicher liegen, die keine Route mehr erreicht — der
   * teuerste Rest, den dieses Produkt hinterlassen kann (§2.13).
   */
  const inspiration = await purgeBrandInspiration(event, profileId)
  /**
   * DIE KI-ENTWÜRFE DES ZEICHENS (brand-023, Brand Design D5c) — ZEILEN **UND**
   * DATEIEN, aus demselben Grund wie die Vorbilder darüber: an jeder Zeile
   * hängt eine Datei im Bucket `brand-drafts` (Zeilen-Id = Datei-Id). Ein
   * `deleteRow` allein liesse unfertige Logo-Vorschläge im Speicher liegen,
   * die keine Route mehr erreicht (§2.13).
   */
  const markDrafts = await purgeBrandMarkDrafts(event, profileId)
  /**
   * DIE LÄUFE DER MARKE (brand-027, `brand_runs`) — sie hängen über `subject`
   * an ihr, nicht an einer `profileId`-Spalte. NACH den Entwürfen: ein Lauf,
   * der gerade noch rechnet, fragt vor dem Ablegen, ob es die Marke noch gibt
   * (`brandRunProfileExists`).
   */
  let runs: number
  try {
    runs = await purgeBrandRuns(event, profileId)
  }
  catch (error) {
    throw toH3Error(error, 'Brand profile could not be deleted')
  }
  let publications = 0
  try {
    await tablesDB.deleteRow({ databaseId, tableId: BRAND_PUBLICATIONS_TABLE, rowId: profileId })
    publications = 1
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand profile could not be deleted')
  }
  // Die Mitläufer ANDERER Layer (MV1 M1): heute `market` mit seinen drei
  // Tabellen an derselben `profileId`. Sie laufen NACH den eigenen Kindern und
  // VOR dem Kopf — dieselbe Reihenfolge-Begründung wie oben.
  //
  // Scheitert einer, BLEIBT DAS PROFIL (SEC-026, Teil 2): seine Zeilen findet
  // man nur über das Profil, ohne Kopf wären sie für immer unerreichbar. Die
  // Antwort ist ein 502 mit eigenem Grund; der Mensch kann erneut löschen —
  // jeder Schritt davor ist idempotent. Welcher Mitläufer scheiterte, steht
  // in `brand.profile_cascade_failed` (die Kaskade loggt es selbst).
  let cascades: Record<string, number>
  try {
    cascades = await runBrandProfileCascades(event, profileId)
  }
  catch (error) {
    if (!(error instanceof BrandProfileCascadeError)) throw toH3Error(error, 'Brand profile could not be deleted')
    throw createError({
      status: 502,
      statusText: 'Brand profile could not be deleted completely',
      data: { code: 'profile_delete_incomplete' },
    })
  }

  try {
    await tablesDB.deleteRow({ databaseId, tableId: BRAND_PROFILES_TABLE, rowId: profileId })
  }
  catch (error) {
    if (!isAppwriteNotFound(error)) throw toH3Error(error, 'Brand profile could not be deleted')
  }

  // Das Löschen selbst schreibt KEIN brand_event: der Funnel hängt an
  // `profileId`, und dessen Zeilen sind gerade Teil der Kaskade gewesen — ein
  // Ereignis über ein gelöschtes Profil wäre der einzige Rest, der bliebe.
  logEvent('info', 'brand.profile_deleted', {
    profileId, steps, messages, shares, events, findings, publications, publicationReports,
    inspiration, markDrafts, runs, checksErased, ...cascades,
  })

  return { deleted: true, removed: { steps, messages, shares, events, findings } }
})
