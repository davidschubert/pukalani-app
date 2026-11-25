import type { H3Event } from 'h3'
import { isBrandProfileErased } from '../../../shared/brandProfileTrash'
import { RUN_LEASE_BUSY_CODE } from '../../../../core/shared/runLease'
import { createBrandCheckSchema } from '../../../schemas/brandCheck'
import {
  BRAND_RUN_OUTCOMES,
  BRAND_RUN_SCOPES,
  emptyBrandRunDetail,
  parseBrandRunDetail,
  toBrandRunView,
} from '../../../shared/brandRun'
import type { BrandCheckStartResponse } from '../../../shared/types/brand'
import {
  type RunBrandCheckInput,
  bookBrandCheck,
  executeBrandCheck,
  prepareBrandCheck,
} from '../../utils/brandCheckRun'
import {
  brandCheckRunSubject,
  brandCheckRunToken,
  brandCheckRunVisitor,
  newBrandCheckRunNonce,
} from '../../utils/brandCheckRunToken'
import {
  brandRunProfileExists,
  brandRunStore,
  runningBrandRunView,
  startBrandRun,
} from '../../utils/brandRun'
import {
  BRAND_PROFILES_TABLE,
  type BrandProfileRow,
  brandDb,
  isAppwriteNotFound,
} from '../../utils/brandStore'
import { softFail } from '../../../../core/server/utils/softFail'

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
 * ── DIE ANTWORT KOMMT SOFORT, DER LAUF RECHNET WEITER (LL1 b, 2026-11-18) ─
 * Lesen und Urteilen brauchen zusammen bis rund 120 s; der Webserver wartet
 * 60. Bis hierher sah der Mensch dann einen Fehler, obwohl der Check entstand.
 * Jetzt, in dieser Reihenfolge (Regel „Lange Arbeit gehört nicht in die
 * Anfrage"):
 *  1. Honigtopf und Rumpf.
 *  2. Was nichts kostet (`prepareBrandCheck`): Zwischenspeicher — ein Treffer
 *     antwortet weiter SOFORT mit `200` und der Id —, eigene Brand, Abschalter.
 *  3. DIE LAUF-SPERRE (`brand_runs`, Art `check`). Der Gegenstand ist ein
 *     Hash aus Adresse UND Besucher: derselbe Besucher mit derselben Adresse
 *     startet nie doppelt, ein Fremder trifft die Sperre nie. Läuft schon
 *     einer, ist das hier KEIN 409 — die Antwort ist dieselbe `202` mit dem
 *     Kennzeichen des LAUFENDEN Laufs, ohne Buchung. Ein zweiter Reiter folgt
 *     damit demselben Lauf.
 *  4. Die Deckel (`bookBrandCheck`). Lehnt einer ab, fällt die Sperre wieder.
 *  5. `202` mit dem Lauf-Stand und dem KENNZEICHEN, das nur der Starter
 *     bekommt (`brandCheckRunToken.ts`). Die Seite fragt damit den Stand ab
 *     (`GET /api/brand/check/runs/<kennzeichen>`); am fertigen Lauf steht die
 *     Id des Ergebnisses (`run.ref`).
 * Was früher der Fehler-Code der Anfrage war (`site_blocked`, `fetch_failed`,
 * `blocked_target`, `check_unavailable`), ist jetzt der AUSGANG des Laufs —
 * dieselben Wörter, die Seite bildet sie auf dieselben Sätze ab. Ein
 * gescheiterter Lauf bleibt gebucht, wie vorher eine gescheiterte Anfrage
 * (der Abruf ist hinausgegangen; s. Kopf von `brandCheckRun.ts`).
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

  const input: RunBrandCheckInput = {
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
  }

  // (2) Was nichts kostet. Ein Treffer im Zwischenspeicher IST das Ergebnis.
  const { cached, prepared } = await prepareBrandCheck(event, input)
  if (cached) return { ok: true, ...cached }

  // (3) DIE SPERRE — vor den Deckeln. Derselbe Besucher mit derselben Adresse
  // trifft immer denselben Gegenstand (s. Kopf von `brandCheckRunToken.ts`).
  const store = brandRunStore(event)
  const scope = BRAND_RUN_SCOPES.check
  const subject = brandCheckRunSubject(event, prepared.urlKey, brandCheckRunVisitor(userId, prepared.ipHash))
  const nonce = newBrandCheckRunNonce()

  let lease: Awaited<ReturnType<typeof acquireRunLease>>['lease']
  try {
    lease = (await acquireRunLease(store, { scope, subject, detail: emptyBrandRunDetail({ key: nonce }) })).lease
  }
  catch (error) {
    if ((error as { data?: { code?: unknown } } | null)?.data?.code !== RUN_LEASE_BUSY_CODE) throw error
    // ES LÄUFT SCHON EINER — und zwar der dieses Besuchers für diese Adresse.
    // Kein zweiter Lauf, keine Buchung: die Antwort führt auf den laufenden.
    // Ist er zwischen Sperre und Nachlesen zu Ende gegangen, steht das schon
    // im Stand, und die Seite liest sein Ergebnis beim ersten Nachfragen.
    const running = await store.latest(scope, subject).catch(softFail('brand:api/brand/check.post:latest', null))
    const key = running ? parseBrandRunDetail(running.detail).key : ''
    if (!running || !key) throw error
    setResponseStatus(event, 202)
    return {
      ok: true,
      id: '',
      cached: false,
      run: toBrandRunView(running, Date.now()),
      token: brandCheckRunToken(event, running.$id, key),
    }
  }

  // (4) Die Deckel. Erst ab hier kostet der Aufruf etwas.
  try {
    await bookBrandCheck(event, input, prepared)
  }
  catch (error) {
    // Abgelehnt (429) oder der Zähler war nicht erreichbar — dann läuft auch
    // nichts, und die Sperre darf den nächsten Versuch nicht festhalten.
    await dropRunLease(store, lease)
    // DER `Retry-After`-KOPF gehört zur ANTWORT und damit der Route — die
    // Mechanik hat zwei Aufrufer, und beim zweiten (dem Lauf des
    // Marktvergleichs) stempelte ein `setHeader` dort ein `Retry-After` auf
    // eine 200er-Antwort, die niemand abgewiesen hat.
    const seconds = retryAfterSecOf(error)
    if (seconds) setHeader(event, 'Retry-After', seconds)
    throw error
  }

  const detail = emptyBrandRunDetail({ key: nonce, booked: true })
  // Fail-soft — der Lauf schreibt das Detail spätestens mit seinem Ende.
  await touchRunLease(store, lease, { detail }).catch(softFail('brand:api/brand/check.post:touchRunLease', undefined))

  // (5) DER LAUF — hinter der Antwort. In die Antwort schreibt er nicht.
  startBrandRun({
    label: 'brand-check',
    store,
    lease,
    detail,
    work: async ({ lost }) => {
      try {
        const result = await executeBrandCheck(event, input, prepared, {
          // Ohne Herzschlag darf ein anderer Start übernehmen — dann speichert
          // DIESER Lauf nichts mehr. Und gibt es die zugeordnete Marke nicht
          // mehr, entsteht kein Check, der an ihr hinge.
          abortBeforeSave: async () => {
            if (lost()) return BRAND_RUN_OUTCOMES.leaseLost
            if (prepared.profileId
              && !await brandRunProfileExists(event, BRAND_PROFILES_TABLE, prepared.profileId)) {
              return BRAND_RUN_OUTCOMES.profileGone
            }
            return ''
          },
        })
        detail.ref = result.id
        detail.created = 1
        return BRAND_RUN_OUTCOMES.done
      }
      catch (error) {
        // Die Mechanik benennt ihre Ausgänge selbst (`data.code`) — dieselben
        // Wörter, die früher der Fehler-Code der Anfrage waren. Alles andere
        // ist ein Wurf, den `startBrandRun` als `failed` festhält.
        const code = (error as { data?: { code?: unknown } } | null)?.data?.code
        if (typeof code === 'string' && code) return code
        throw error
      }
    },
  })

  // 202: angenommen, nicht erledigt. Die Lauf-Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return {
    ok: true,
    id: '',
    cached: false,
    run: runningBrandRunView(lease, detail),
    token: brandCheckRunToken(event, lease.$id, nonce),
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
    // Eine Marke im Papierkorb (WH1) gilt wie eine fehlende.
    if (row.ownerType !== 'user' || row.ownerId !== userId || isBrandProfileErased(row)) {
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
