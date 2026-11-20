import { createHash } from 'node:crypto'
import { ID, Query } from 'node-appwrite'
import { createBrandDocumentCheckSchema } from '../../../../../schemas/brandCheck'
import {
  BRAND_CHECK_CACHE_MS,
  BRAND_CHECK_CRITERIA,
  type BrandCheckScores,
  brandCheckDocumentRow,
  brandCheckDocumentUrlKey,
  computeBrandCheck,
  pickBrandCheckFindings,
} from '../../../../../shared/brandCheck'
import { BRAND_RUN_OUTCOMES, BRAND_RUN_SCOPES, emptyBrandRunDetail } from '../../../../../shared/brandRun'
import type {
  BrandCheckCriterionResult,
  BrandCheckFinding,
  BrandCheckStartResponse,
} from '../../../../../shared/types/brand'
import { bookBrandCheckQuota, brandCheckIpHash } from '../../../../utils/brandAiQuota'
import { brandDocumentCheckFields } from '../../../../utils/brandCheckDocument'
import { BRAND_CHECK_DOC_PROMPT_VERSION, judgeBrandCheck } from '../../../../utils/brandCheckJudge'
import {
  brandRunProfileExists,
  brandRunStore,
  runningBrandRunView,
  startBrandRun,
} from '../../../../utils/brandRun'
import {
  BRAND_CHECKS_TABLE,
  BRAND_PROFILES_TABLE,
  type BrandCheckRow,
  brandDb,
  loadOwnedProfile,
  loadStepRows,
  requireProfileIdParam,
} from '../../../../utils/brandStore'
import { softFail } from '../../../../../../core/server/utils/softFail'

/**
 * DER FUNDAMENT-CHECK (docs/archiv/BRAND-CHECK-SEITE.md §5b, Davids
 * Entscheidung 3 vom 2026-09-05: „sofort mit").
 *
 * Er beantwortet die Frage, die eine Brand OHNE Website sonst gar nicht
 * stellen kann: „wie weit ist unser Fundament?" Material sind die BESTÄTIGTEN
 * Feldwerte des Brand-Dokuments statt einer Startseite; gerechnet wird mit
 * derselben Formel, geurteilt von demselben Modell nach demselben Katalog.
 *
 * ── SECHZEHN KRITERIEN GIBT ES HIER NICHT, UND SIE ZÄHLEN AUCH NICHT ──────
 * Favicon, Viewport, HTTPS, Meta-Hygiene: das sind Eigenschaften einer SEITE.
 * Sie stehen als `null` in der Zeile („nicht bewertbar") und fallen damit aus
 * der Normalisierung — genau der Mechanismus, den `computeBrandCheck` für
 * gesperrte Kategorien ohnehin hat. Eine 0 wäre eine Aussage über die Marke
 * aufgrund einer Frage, die man an ein Dokument nicht stellen kann.
 *
 * ── DIE ZAHL HEISST DESHALB ANDERS ────────────────────────────────────────
 * `scoreVersion: 'doc-score-1'` und `source: 'document'`. Beides ist nicht
 * Kosmetik: eine Dokument-78 und eine Website-78 messen Verschiedenes, und
 * ohne diese zwei Felder liesse sich das später nicht mehr auseinanderhalten
 * (die Gegenüberstellung verweigert den Vergleich über Quellgrenzen hinweg —
 * `diffBrandChecks`).
 *
 * ── DIE REIHENFOLGE IST DIE KOSTENKONTROLLE (wie in `check.post.ts`) ──────
 *  1. Zugang und Besitz — fremde oder fehlende Brand antworten identisch 404.
 *  2. ZWISCHENSPEICHER je Brand (`doc:<profileId>`, sieben Tage). Ein Treffer
 *     holt nichts und bucht nichts.
 *  3. Das Material sammeln. NICHTS BESTÄTIGT ⇒ 409 `document_empty` — VOR der
 *     Buchung: ein leeres Fundament ist kein Kontingent wert, und der Mensch
 *     bekommt den einen Satz, der ihm weiterhilft.
 *  4. DIE LAUF-SPERRE (`brand_runs`, Art `doc-check`, Gegenstand = die
 *     Marke) → läuft schon ein Lauf, 409 `run_running`, und kein Zähler wird
 *     berührt.
 *  5. Der Konto-Deckel (10/Tag, `BRAND_CHECK_ACCOUNT_DAILY_LIMIT`). Immer der
 *     Konto-Eimer — diese Route gibt es ohne Konto nicht. Lehnt er ab, fällt
 *     die Sperre wieder.
 *  6. `202` — urteilen, rechnen und speichern laufen hinter der Antwort.
 *
 * ── DIE ANTWORT KOMMT SOFORT, DER LAUF RECHNET WEITER (LL1 b, 2026-11-17) ─
 * Das Urteil hat eine Frist von 90 s; der Webserver wartet 60. Bis hierher
 * sah der Mensch dann einen Fehler, obwohl der Check entstand — und ein
 * zweiter Klick buchte einen zweiten. Jetzt nimmt die Route die Sperre,
 * bucht, antwortet `202` (ohne Id, mit dem Lauf-Stand) und rechnet mit
 * Besitzer weiter (`startBrandRun`, Regel „Lange Arbeit gehört nicht in die
 * Anfrage"). Die Seite fragt den Verlauf ab (`GET …/checks`, Feld
 * `documentRun`); die Id des fertigen Checks steht am Lauf (`ref`) und der
 * Check selbst im Verlauf. EIN TREFFER IM ZWISCHENSPEICHER antwortet weiter
 * sofort mit `200` und der Id — er holt nichts und sperrt nichts.
 *
 * ── OHNE MODELL GIBT ES KEINEN CHECK ──────────────────────────────────────
 * Wie beim Website-Check: fällt der Anbieter aus, wird NICHTS gespeichert —
 * der Lauf endet mit dem Grund `check_unavailable` (dasselbe Wort wie früher
 * der Fehler-Code der Anfrage). Hier wöge ein halbes Ergebnis sogar schwerer —
 * ohne die vierundzwanzig Urteile bliebe von einem Dokument-Check gar nichts
 * übrig, weil die gerechneten Kriterien allesamt `null` sind.
 *
 * ── LOG-REGEL §6 ──────────────────────────────────────────────────────────
 * Geloggt werden Brand-Id, Feldzahl, Score, Dauer und Fehlercode — nie ein
 * Feldwert. Gespeichert wird ebenfalls kein Fundament-Text: nur die Belege
 * (je ≤ 160 Zeichen) und ein `textHash` über das gesamte Material, mit dem
 * sich später fragen lässt, ob sich überhaupt etwas geändert hat.
 */
export default defineEventHandler(async (event): Promise<BrandCheckStartResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const profileId = requireProfileIdParam(event)
  const profile = await loadOwnedProfile(event, userId, profileId)

  // Ein LEERER Rumpf ist der Normalfall (der Knopf schickt nichts mit) —
  // dieselbe Nachsicht wie in `analyze.post.ts`. `readBody` wirft bei leerem
  // Rumpf je nach Content-Type, und ein 400 dafür wäre die falsche Antwort auf
  // „prüf mein Fundament".
  // eslint-disable-next-line pukalani/no-silent-catch -- ein fehlender oder kaputter Rumpf des Aufrufers ist kein Serverfehler, der Ersatz ist die Antwort darauf
  const raw = await readBody(event).catch(() => ({}))
  const parsed = createBrandDocumentCheckSchema().safeParse(raw ?? {})
  if (!parsed.success) {
    throw createError({ status: 400, statusText: 'Invalid check payload', data: { code: 'invalid_body' } })
  }
  const body = parsed.data

  const urlKey = brandCheckDocumentUrlKey(profileId)
  const { tablesDB, databaseId } = brandDb(event)

  // (2) Der Zwischenspeicher. Die ABFRAGE läuft auch bei `force`, nur ihr
  // Ergebnis zählt dann nicht — sie ist zugleich der Lebenszeichen-Test der
  // Ablage (Begründung wörtlich wie in `check.post.ts`).
  let cached: BrandCheckRow | undefined
  try {
    const found = await tablesDB.listRows<BrandCheckRow>({
      databaseId,
      tableId: BRAND_CHECKS_TABLE,
      queries: [Query.equal('urlKey', urlKey), Query.orderDesc('$createdAt'), Query.limit(1)],
    })
    // Ein GELÖSCHTER Treffer (brand-026) ist kein Zwischenspeicher — seine Id
    // führte auf ein 404 (Begründung wörtlich wie in `brandCheckRun.ts`).
    const latest = found.rows[0]
    cached = body.force || latest?.erasedAt ? undefined : latest
  }
  catch (error) {
    logEvent('warn', 'brand.doc_check_unavailable', {
      profileId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    throw createError({ status: 503, statusText: 'Check unavailable', data: { code: 'check_unavailable' } })
  }

  if (cached && Date.parse(cached.$createdAt) > Date.now() - BRAND_CHECK_CACHE_MS) {
    logEvent('info', 'brand.doc_check_completed', {
      profileId,
      score: cached.score,
      ms: 0,
      cached: true,
    })
    return { ok: true, id: cached.$id, cached: true }
  }

  // (2b) DER ABSCHALTER (P17, BE-006) — nach dem Zwischenspeicher, vor der
  // Buchung; derselbe eigene Code wie beim öffentlichen Check (`brandCheckRun.ts`).
  if (!await aiSwitchedOn(event)) {
    logEvent('info', 'brand.doc_check_paused', { profileId })
    throw createError({ status: 503, statusText: 'Check paused', data: { code: 'check_paused' } })
  }

  // (3) Das Material — bestätigte Felder, in Kapitel-Reihenfolge.
  const stepRows = await loadStepRows(event, profileId)
  const fields = brandDocumentCheckFields(profile, stepRows, betaAccount)
  if (!fields.length) {
    // 409 und nicht 400: der Rumpf war in Ordnung, der ZUSTAND passt nicht.
    // Der Mensch kann das ändern (Felder bestätigen), und der Satz dazu steht
    // im Client (`brand.check.document.errors.empty`).
    throw createError({
      status: 409,
      statusText: 'Brand foundation is empty',
      data: { code: 'document_empty' },
    })
  }

  // (4) DIE SPERRE — vor dem Deckel. Ein Doppelklick (oder ein zweiter
  // Reiter) bekommt 409 `run_running`, bevor er den Zähler berührt.
  const store = brandRunStore(event)
  const { lease } = await acquireRunLease(store, {
    scope: BRAND_RUN_SCOPES.documentCheck,
    subject: profileId,
    detail: emptyBrandRunDetail(),
  })

  // (5) Der Deckel. Erst ab hier kostet der Aufruf etwas.
  const ipHash = brandCheckIpHash(event)
  let rejection: Awaited<ReturnType<typeof bookBrandCheckQuota>>
  try {
    rejection = await bookBrandCheckQuota(event, { ipHash, quota: 'account', userId })
  }
  catch (error) {
    // Der Zähler war nicht erreichbar — dann läuft auch nichts, und die
    // Sperre darf den Knopf nicht zwei Minuten lang festhalten.
    await dropRunLease(store, lease)
    throw error
  }
  if (rejection) {
    await dropRunLease(store, lease)
    setHeader(event, 'Retry-After', rejection.retryAfterSec)
    logEvent('info', 'brand.doc_check_throttled', { profileId, code: rejection.code })
    throw createError({
      status: 429,
      statusText: 'Brand check limit reached',
      data: { code: rejection.code },
    })
  }

  const detail = emptyBrandRunDetail({ booked: true })
  // Fail-soft — der Lauf schreibt das Detail spätestens mit seinem Ende.
  await touchRunLease(store, lease, { detail }).catch(softFail('brand:api/brand/profiles/[id]/check.post:touchRunLease', undefined))

  // (6) DER LAUF — hinter der Antwort. Was er braucht, ist hier schon gelesen
  // (Material, Häkchen, Anschluss-Stempel); in die Antwort schreibt er nicht.
  const rankingOptIn = body.rankingOptIn
  startBrandRun({
    label: 'brand-doc-check',
    store,
    lease,
    detail,
    work: async ({ lost }) => {
      // (6a) Die vierundzwanzig beurteilten Kriterien — EIN Aufruf, wie immer.
      const started = Date.now()
      let judged: Awaited<ReturnType<typeof judgeBrandCheck>>
      try {
        judged = await judgeBrandCheck(event, { kind: 'document', fields })
      }
      catch (error) {
        // Kein Endpunkt unter der Bindung ⇒ der gemeinsame Code (`startBrandRun`).
        if (isAiEndpointUnavailable(error)) throw error
        logEvent('warn', 'brand.doc_check_provider_error', {
          profileId,
          ms: Date.now() - started,
          // Die MELDUNG des Anbieters, nie der Prompt und nie die Antwort.
          message: error instanceof Error ? error.message : 'unknown',
        })
        return 'check_unavailable'
      }
      detail.model = judged.model

      // (6b) Zusammenlegen — in KATALOG-Reihenfolge. Die gerechneten Kriterien
      // gibt es hier nicht: sie werden `null`, nicht 0 (s. Kopf).
      const criteria: BrandCheckCriterionResult[] = BRAND_CHECK_CRITERIA.map((criterion) => {
        const judgement = criterion.kind === 'judged' ? judged.judgements[criterion.id] : undefined
        return {
          id: criterion.id,
          category: criterion.category,
          kind: criterion.kind,
          score: judgement?.score ?? null,
          evidence: judgement?.evidence ?? '',
          note: judgement?.note ?? '',
        }
      })

      const scores: BrandCheckScores = {}
      for (const entry of criteria) scores[entry.id] = entry.score

      const computation = computeBrandCheck(scores)
      const findings: BrandCheckFinding[] = pickBrandCheckFindings(scores).map(criterionId => ({
        criterionId,
        evidence: criteria.find(entry => entry.id === criterionId)?.evidence ?? '',
      }))

      // Ohne Herzschlag darf ein anderer Start übernehmen — dann speichert
      // DIESER Lauf nichts mehr (es entstünden zwei Checks für einen Klick).
      // Und gibt es die Marke nicht mehr, entsteht kein Check ohne Besitzer.
      if (lost()) return BRAND_RUN_OUTCOMES.leaseLost
      if (!await brandRunProfileExists(event, BRAND_PROFILES_TABLE, profileId)) {
        return BRAND_RUN_OUTCOMES.profileGone
      }

      // (6c) Speichern. Die Spaltenliste steht PUR in `brandCheckDocumentRow` —
      // dort ist sie prüfbar, ohne dass ein Test eine Appwrite braucht.
      try {
        const row = await tablesDB.createRow<BrandCheckRow>({
          databaseId,
          tableId: BRAND_CHECKS_TABLE,
          rowId: ID.unique(),
          data: brandCheckDocumentRow({
            profileId,
            brandName: profile.title ?? '',
            locale: profile.contentLocale || 'de',
            userId,
            rankingOptIn,
            industry: judged.industry,
            model: judged.model,
            promptVersion: BRAND_CHECK_DOC_PROMPT_VERSION,
            // Der einzige Rest des gelesenen Fundaments — kein Feldwert.
            textHash: createHash('sha256')
              .update(fields.map(field => `${field.label}\n${field.value}`).join('\n\n'))
              .digest('hex'),
            ipHash,
            computation,
            criteria,
            findings,
          }),
        })
        detail.ref = row.$id
        detail.created = 1
      }
      catch (error) {
        logEvent('warn', 'brand.doc_check_unavailable', {
          profileId,
          message: error instanceof Error ? error.message : 'unknown',
        })
        return 'check_unavailable'
      }

      logEvent('info', 'brand.doc_check_completed', {
        profileId,
        fields: fields.length,
        score: computation.score,
        ms: Date.now() - started,
        cached: false,
      })
      return BRAND_RUN_OUTCOMES.done
    },
  })

  // 202: angenommen, nicht erledigt. Die Lauf-Zeile sagt, was daraus wird.
  setResponseStatus(event, 202)
  return { ok: true, id: '', cached: false, run: runningBrandRunView(lease, detail) }
})
