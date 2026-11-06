import type { H3Event } from 'h3'
import { createBrandCheckSchema } from '../../../schemas/brandCheck'
import type { BrandCheckStartResponse } from '../../../shared/types/brand'
import { runBrandCheck } from '../../utils/brandCheckRun'
import {
  BRAND_PROFILES_TABLE,
  type BrandProfileRow,
  brandDb,
  isAppwriteNotFound,
} from '../../utils/brandStore'

/**
 * DER KOSTENLOSE BRAND-CHECK (docs/archiv/BRAND-CHECK.md) — die vierte
 * öffentliche Route des Layers und die teuerste von allen: sie baut eine
 * ausgehende Verbindung zu einer FREMDEN Adresse auf UND bezahlt einen
 * KI-Aufruf, beides ohne Konto davor (Davids Hybrid-Zugang 2026-09-05: „Score
 * sofort ohne Anmeldung").
 *
 * ── SEIT BC1 IST DIE ROUTE EINE HÜLLE ─────────────────────────────────────
 * Honigtopf, Rumpf, Besitz der eigenen Brand, `Retry-After` — mehr steht hier
 * nicht. Die MECHANIK (Zwischenspeicher, Deckel, Abruf, Messung, Urteil,
 * Ablage) und die Begründung dazu leben in `server/utils/brandCheckRun.ts`,
 * damit der Marktvergleich einen fehlenden Check ANSTOSSEN kann, ohne sie zu
 * kopieren (BRAND-MARKTVERGLEICH §7.3 — sonst hätte er seinen eigenen, langsam
 * abweichenden Score).
 *
 * ── DIE ANTWORT IST EINE ID, NICHT DAS ERGEBNIS ───────────────────────────
 * Der Client springt auf `/brand-check/<id>` und holt es dort (`[id].get.ts`).
 * So ist das Ergebnis von der ersten Sekunde an eine ADRESSE — teilbar,
 * nachladbar, und beim zweiten Aufruf derselben Website buchstäblich dieselbe.
 *
 * ── SEIT DEM RANKING-PAKET (BRAND-CHECK-SEITE §3/§5/§8) ───────────────────
 * Die Route kennt auch KONTEN, ohne eines zu verlangen: wer eingeloggt ist,
 * kann „neu ermitteln" (`force`) und damit den Zwischenspeicher umgehen — das
 * kostet ihn seinen Konto-Deckel (10/Tag) STATT des Anschluss-Deckels. Ein
 * Gast, der `force` schickt, bekommt schlicht den gewöhnlichen Check; die eine
 * Weiche dafür ist `decideBrandCheckMode` und steht pur im Vertrag.
 *
 * ── SEIT BS1 R2b: DIE WEBSITE DARF NEIN SAGEN ────────────────────────────
 * Der Abruf holt `robots.txt` und prüft den TDM-Nutzungsvorbehalt, mit
 * DENSELBEN Regeln wie der Marktvergleich und unter einem eigenen Absender
 * (`PukalaniBrandCheck`, `server/utils/brandCheckFetch.ts`). Untersagt die
 * Website die Auswertung, antwortet die Route 409 `site_blocked` — es
 * entsteht kein Score und KEINE Zeile in `brand_checks`, nur ein
 * Log-Ereignis `brand.check_blocked` mit dem Grund. Der Weg des WIZARDS
 * (`profiles/[id]/analyze.post.ts`) bleibt bewusst unberührt: dort trägt der
 * eingeloggte Betreiber seine EIGENE Startseite ein.
 *
 * ── DER ZWISCHENSPEICHER TRÄGT SEIN HÄKCHEN MIT SICH ──────────────────────
 * Ein Treffer gibt die GESPEICHERTE Zeile zurück, mitsamt ihrem
 * `rankingOptIn` — er läuft nichts und ändert nichts. Wer heute ein Häkchen
 * setzt und einen sieben Tage alten Check zurückbekommt, landet also NICHT im
 * Ranking. Das ist die richtige Reihenfolge: der Zwischenspeicher ist der
 * Kostendeckel, und ein Schreibvorgang „nur fürs Häkchen" liesse jeden
 * Vorbeikommenden über die Sichtbarkeit eines FREMDEN Auftritts entscheiden,
 * den ein anderer geprüft hat. Wer sein eigenes Ergebnis ins Ranking bringen
 * will, ermittelt es mit Konto neu.
 */
export default defineEventHandler(async (event): Promise<BrandCheckStartResponse> => {
  const body = await readValidatedBody(event, createBrandCheckSchema().parse)

  // (1) Der Honigtopf. Ununterscheidbar vom Erfolg — nur ohne Id, weil es
  // nichts gibt, worauf sie zeigen könnte. Er bleibt HIER und nicht in der
  // Mechanik: er ist eine Eigenschaft des FORMULARS, nicht des Checks.
  if (body.hp) {
    logEvent('info', 'brand.check_honeypot', { locale: body.locale })
    return { ok: true, id: '', cached: true }
  }

  // Die Session, falls es eine gibt — die Route VERLANGT keine (Davids
  // Hybrid-Zugang). `requireBrandAccess` wäre hier falsch: das ist das Gate
  // der Beta-WERKSTATT, und der Check ist das Akquise-Instrument davor.
  const userId = typeof event.context.user?.$id === 'string' ? event.context.user.$id : ''

  try {
    const result = await runBrandCheck(event, {
      url: body.url,
      locale: body.locale,
      userId,
      force: body.force,
      rankingOptIn: body.rankingOptIn,
      // Als FUNKTION, damit ein Zwischenspeicher-Treffer keine Besitz-Abfrage
      // kostet: die Mechanik löst sie erst auf, wenn wirklich geprüft wird.
      profileId: body.profileId && userId
        ? () => requireOwnProfileId(event, userId, body.profileId)
        : '',
    })
    return { ok: true, ...result }
  }
  catch (error) {
    // DER EINZIGE GRUND FÜR DIESEN FANG: der `Retry-After`-Kopf. Er gehört zur
    // ANTWORT und damit der Route — die Mechanik hat zwei Aufrufer, und beim
    // zweiten (dem Lauf des Marktvergleichs) stempelte ein `setHeader` dort
    // ein `Retry-After` auf eine 200er-Antwort, die niemand abgewiesen hat.
    const seconds = retryAfterSecOf(error)
    if (seconds) setHeader(event, 'Retry-After', seconds)
    throw error
  }
})

/** Die Sekunden aus einem 429 der Mechanik — oder 0, wenn es keiner war. */
function retryAfterSecOf(error: unknown): number {
  const data = (error as { data?: { retryAfterSec?: unknown } } | null)?.data
  return typeof data?.retryAfterSec === 'number' ? data.retryAfterSec : 0
}

/**
 * DIE MITGESCHICKTE BRAND — nur, wenn sie diesem Konto gehört.
 *
 * Sie ist eine ZUORDNUNG und kein Zugriffsrecht: `brand_checks.profileId`
 * entscheidet, unter welcher Brand ein Check in „Meine Brands" auftaucht, nicht
 * wer ihn lesen darf (die Ergebnis-Seite ist für jeden mit der Adresse offen).
 * Trotzdem wird der Besitz belegt — sonst hängte ein Fremder seine Messung an
 * die Marke eines anderen, und dessen Verlauf zeigte einen Stand, den er nie
 * ermittelt hat.
 *
 * Sie läuft VOR der Buchung (die Mechanik löst sie genau dort auf): eine fremde
 * Profil-Id ist ein Fehler des Aufrufers und soll kein Kontingent kosten. Und
 * mit 404 statt 403 — dieselbe Regel wie überall im Layer: ein 403 auf eine
 * fremde Id bestätigte deren Existenz. Die Prüfung ist bewusst KEIN
 * `loadOwnedProfile` (das zieht `assertBrandOwnerAccess` und dessen
 * community-Zweig): hier wird nur gefragt, ob DIESES Konto der Eigentümer ist,
 * und mehr darf ein Check-Anstoss auch nicht dürfen.
 *
 * FEHLENDE Tabelle ⇒ 404 wie eine fehlende Zeile: für den Aufrufer ist beides
 * „diese Brand gibt es für dich nicht".
 */
async function requireOwnProfileId(event: H3Event, userId: string, profileId: string): Promise<string> {
  const { tablesDB, databaseId } = brandDb(event)
  try {
    const row = await tablesDB.getRow<BrandProfileRow>({
      databaseId,
      tableId: BRAND_PROFILES_TABLE,
      rowId: profileId,
    })
    if (row.ownerType !== 'user' || row.ownerId !== userId) {
      throw createError({ status: 404, statusText: 'Not Found', data: { code: 'profile_not_found' } })
    }
    return row.$id
  }
  catch (error) {
    if (isAppwriteNotFound(error)) {
      throw createError({ status: 404, statusText: 'Not Found', data: { code: 'profile_not_found' } })
    }
    throw error
  }
}
