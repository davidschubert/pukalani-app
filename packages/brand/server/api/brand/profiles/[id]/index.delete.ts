import type { Models } from 'node-appwrite'
import { Query } from 'node-appwrite'
import type { BrandProfileDeleteResponse } from '../../../../../shared/types/brand'
import { BRAND_FINDINGS_TABLE } from '../../../../utils/brandFindingsStore'
import { purgeBrandInspiration } from '../../../../utils/brandInspirationStore'
import { purgeBrandMarkDrafts } from '../../../../utils/brandMarkDrafts'
import { runBrandProfileCascades } from '../../../../utils/brandProfileCascade'
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
  // VOR dem Kopf — dieselbe Reihenfolge-Begründung wie oben. Fail-soft: ein
  // Zusatzprodukt darf das Löschen eines Brandings nicht verhindern
  // (`brandProfileCascade.ts`).
  const cascades = await runBrandProfileCascades(event, profileId)

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
    inspiration, markDrafts, ...cascades,
  })

  return { deleted: true, removed: { steps, messages, shares, events, findings } }
})
