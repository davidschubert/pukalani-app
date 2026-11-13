import {
  TRANSLATE_DAILY_LIMIT,
  TRANSLATE_DAILY_WINDOW_MS,
  TRANSLATION_DAILY_LIMIT_CODE,
  mayAddUgcTranslationLocale,
  parseUgcTranslations,
  serializeUgcTranslations,
  ugcTranslationDayKey,
} from '../../../../../core/shared/ugcTranslations'
import { AI_JSON_QUOTE_RULE } from '../../../../../core/shared/aiJson'
import { courseTranslateSchema } from '../../../../schemas/course'
import {
  LESSONS_TABLE,
  MAX_COURSE_TITLE,
  MAX_LESSON_CONTENT,
  type LessonRow,
  type LessonTranslateResponse,
} from '../../../../shared/types/course'

/**
 * EINE LEKTION ÜBERSETZEN (Davids Entscheidung 2026-08-18) — Titel und Inhalt.
 *
 * ── WARUM SIE UNTER `/api/lessons/:id/` LIEGT UND NICHT UNTER `/courses/:slug/`
 * Der Auftrag nannte `/api/courses/:slug/lessons/:id/translate`; gebaut ist sie
 * neben ihren Geschwistern, denn genau dort leben die Lektions-Routen dieses
 * Layers: `lessons/[id].get.ts`, `lessons/[id].patch.ts`,
 * `lessons/[id]/complete.post.ts`. Eine Lektions-Id ist global eindeutig, der
 * Kurs steht auf der Zeile (`lesson.courseId`) — ein Slug im Pfad wäre eine
 * ZWEITE Wahrheit über dieselbe Zugehörigkeit, und die müsste jede Route neu
 * gegen die erste prüfen. `publishedLessonWithCourse` löst den Kurs ohnehin auf,
 * die Zugehörigkeit ist damit belegt, nicht behauptet.
 *
 * ── DIESELBEN VORPRÜFUNGEN WIE DIE LESEROUTE, IN DERSELBEN REIHENFOLGE ────
 * Wer die Lektion nicht LESEN darf, darf sie nicht übersetzen. Also Zeile für
 * Zeile das, was `lessons/[id].get.ts` tut:
 *   1. Mitglieder-Wache (`requireCourseMember`, SEC-029) VOR jedem
 *      Datenbankzugriff,
 *   2. `publishedLessonWithCourse` (Datentür als Operator — Lektionen tragen
 *      bewusst KEINE Read-Permission; die Tür ist hier die einzige
 *      Mandanten-Grenze und wirft bei einem Entwurf 404),
 *   3. `course.status === 'published'`,
 *   4. Einschreibung,
 *   5. `assertCourseAccess` (paid → App-Guard).
 * Wer eine dieser Prüfungen streicht, macht aus dieser Route die Hintertür in
 * den bezahlten Inhalt — der Text steht in der ANTWORT.
 *
 * ── GESCHRIEBEN WIRD ÜBER DIE OPERATOR-KLINKE MIT `actor: 'operator'` ─────
 *  - `as: 'operator'`, weil eine Lektions-Zeile niemandem im Browser gehört.
 *  - `actor: 'operator'`, weil hier NIEMAND Inhalt schreibt: die Übersetzung ist
 *    abgeleitet und jederzeit neu herstellbar. Mit `actor: 'member'` griffe die
 *    M13-Sperre (eine zahlungssäumige Community bleibt LESBAR) und der
 *    A5-Beitritt (Übersetzen ist kein Beitrag).
 */

/** Zehn Übersetzungen je Mensch, Community und zehn Minuten. */
const TRANSLATE_LIMIT = 10
const TRANSLATE_WINDOW_MS = 10 * 60_000

function buildPrompt(lesson: LessonRow, locale: string): string {
  return [
    'Du übersetzt die Lektion eines Online-Kurses für einen Leser.',
    '',
    `Zielsprache (BCP-47-Code): ${locale}`,
    '',
    'Titel:',
    '"""',
    lesson.title,
    '"""',
    '',
    'Inhalt (Markdown):',
    '"""',
    lesson.content,
    '"""',
    '',
    'Regeln:',
    '- Übersetze den Inhalt, ändere ihn nicht: nichts hinzufügen, nichts weglassen, nichts zusammenfassen, nichts kommentieren.',
    '- Die Markdown-Struktur bleibt EXAKT erhalten. Es gibt nur: fett, kursiv, `Code`, Links, Überschriften (## und ###), Listen, Zitate (>) und Codeblöcke (```).',
    '- Inhalte von Code-Spans und Codeblöcken bleiben UNVERÄNDERT stehen — in einer Lektion ist der Code das Lernmaterial, nicht die Beschriftung.',
    '- URLs und Erwähnungen (@name) bleiben UNVERÄNDERT stehen.',
    '- Eigennamen, Produktnamen und Fachbegriffe, die auch in der Zielsprache unübersetzt benutzt werden, bleiben stehen (z. B. „Nuxt“, „TypeScript“).',
    '- Ist der Text bereits vollständig in der Zielsprache, übersetze NICHT: Antworte stattdessen NUR mit {"same": true} und wiederhole den Text nicht.',
    '',
    // Die Vorsorge VOR dem bezahlten Aufruf (AI2, `core/shared/aiJson.ts`):
    // ein gerades `"` im Fliesstext beendet den JSON-String. Die Rettung
    // DANACH ist `parseModelJson`, durch die dieser Aufruf ohnehin läuft.
    AI_JSON_QUOTE_RULE,
    '',
    'Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärung außenrum):',
    '{',
    '  "title": "<der übersetzte Titel>",',
    '  "body": "<der übersetzte Inhalt>"',
    '}',
    'Oder, wenn der Text bereits in der Zielsprache ist: {"same": true}',
  ].join('\n')
}

export default defineEventHandler(async (event): Promise<LessonTranslateResponse> => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten. NICHT zusätzlich
  // 'ai' — Begründung im Kopf.
  requirePlanProduct(event, 'courses')

  // Vorprüfung 1 (siehe Kopf): nur Mitglieder, vor jedem Datenbankzugriff.
  const user = await requireCourseMember(event)

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing lesson id' })
  }

  if (!await isAiConfigured(event)) {
    // 503 wie beim Moderations-Assist: das Produkt ist da, der Schlüssel fehlt.
    // Die Oberfläche zeigt den Knopf dann gar nicht erst an — dies ist das Netz.
    throw createError({ status: 503, statusText: 'AI translation not configured' })
  }

  const { locale } = await readValidatedBody(event, courseTranslateSchema.parse)

  // Die fünf Vorprüfungen der Leseroute, in derselben Reihenfolge (siehe Kopf).
  const { lesson, course } = await publishedLessonWithCourse(event, id)
  if (course.status !== 'published') {
    throw createError({ status: 404, statusText: 'Course not found' })
  }
  const enrollment = await enrollmentFor(event, course.$id, user.$id)
  if (!enrollment) {
    throw createError({ status: 403, statusText: 'Enroll first' })
  }
  await assertCourseAccess(event, course)

  if (!lesson.content.trim()) {
    // Ohne Inhalt gibt es nichts zu übersetzen, was die Anzeige zeigen könnte:
    // `body` ist im Cache-Eintrag Pflicht (die geteilte Regel wirft einen
    // Eintrag ohne Text weg).
    throw createError({ status: 400, statusText: 'Nothing to translate', data: { code: 'nothing_to_translate' } })
  }

  const existing = parseUgcTranslations(lesson.translations)

  /**
   * DER CACHE ZUERST, VOR DER DROSSEL: wer eine schon übersetzte Fassung ein
   * zweites Mal aufschlägt, löst keinen KI-Aufruf aus — also darf ihn das auch
   * kein Kontingent kosten. Bei Lektionen wiegt das schwerer als anderswo: eine
   * Lektion wird beim Lernen mehrfach aufgeschlagen.
   */
  const cached = existing[locale]
  if (cached) {
    return { locale, title: cached.title ?? null, body: cached.body, cached: true }
  }

  if (!mayAddUgcTranslationLocale(existing, locale)) {
    throw createError({
      status: 400,
      statusText: 'Too many translated languages',
      data: { code: 'translation_locale_limit' },
    })
  }

  /**
   * WARTUNGSMODUS — erst AB HIER (Muster posts): alles darüber ist reines
   * Lesen, ab hier kostet es Geld beim KI-Anbieter und schreibt auf `lessons`.
   */
  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  /**
   * Drossel: ein Mensch, eine Community, ein Fenster — erst HIER, wo der
   * nächste Schritt bezahlt wird. Fail-open wie überall. EIGENER Eimer neben
   * dem des Kurses: wer eine Kursbeschreibung übersetzt und danach die ersten
   * Lektionen, soll sich nicht an der eigenen Übersicht aussperren. Je IP
   * deckelt zusätzlich `05.rate-limit.ts` (Bucket `courses:lesson-translate`),
   * bevor hier eine Zeile gelesen wird.
   */
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}lesson-translate:${communityId}:${user.$id}`, TRANSLATE_WINDOW_MS)
  if (state.count > TRANSLATE_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
    throw createError({ status: 429, statusText: 'Too many translations' })
  }

  /**
   * DER TAGES-DECKEL JE KONTO — DERSELBE Eimer wie in allen anderen
   * Übersetzungs-Routen (kein `communityId`, keine Inhaltsart im Schlüssel):
   * er begrenzt die RECHNUNG eines KONTOS. Gerade hier ist das der wirksame
   * Deckel: ein Kurs mit dreißig Lektionen ist dreißig Klicks, und jeder
   * schickt bis zu 15.000 Zeichen an den Anbieter. Begründung und Zahl:
   * `core/shared/ugcTranslations.ts`. ERST die Drossel, DANN der Deckel —
   * `store.hit` zählt immer, ein abgewiesener Versuch darf keinen Tag fressen.
   */
  const day = await store.hit(`${prefix}${ugcTranslationDayKey(user.$id)}`, TRANSLATE_DAILY_WINDOW_MS)
  if (day.count > TRANSLATE_DAILY_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(day.resetInMs / 1000)))
    throw createError({
      status: 429,
      statusText: 'Daily translation limit reached',
      data: { code: TRANSLATION_DAILY_LIMIT_CODE },
    })
  }

  // Laufzeit-Override vor Build-Default (getEffectiveAiConfig, system-016).
  const aiConfig = await getEffectiveAiConfig(event)
  const parsed = await aiCompleteJson<{ title?: unknown, body?: unknown, same?: unknown }>(
    event,
    buildPrompt(lesson, locale),
    { model: aiConfig.model, maxTokens: 8000, label: 'courses' },
  )

  let title: string
  let body: string
  if (parsed.same === true) {
    /**
     * SCHON IN DER ZIELSPRACHE (Davids Entscheidung 2026-08-21).
     *
     * Das Modell hat den Marker gesetzt, statt die Lektion Wort für Wort
     * zurückzuechoen — die halbe Rechnung gespart, und hier wiegt das am
     * schwersten: eine Lektion ist der längste Text dieses Hauses. Gecacht wird
     * trotzdem, und zwar die GRUNDFASSUNG wörtlich: genau das macht jeden
     * weiteren Klick kostenlos (er trifft ab jetzt den Cache-Zweig ganz oben),
     * und eine Lektion wird beim Lernen mehrfach aufgeschlagen.
     *
     * Die Antwort trägt KEIN Flag: der Client erkennt die Gleichheit selbst
     * (`ugcTranslationIsOriginal`) und zeigt statt des sinnlosen Umschalters
     * einen Hinweis. Ein Flag wüsste nur dieser eine Aufruf — spätere Leser
     * sehen den Cache aus der Spalte und hätten nichts davon.
     *
     * Weder klemmen noch die 502-Prüfung: beides kommt aus der ZEILE, nicht vom
     * Anbieter — es steht längst in seinen Grenzen, und der leere Inhalt hat die
     * Vorprüfung oben bereits abgewiesen.
     */
    title = lesson.title
    body = lesson.content
  }
  else {
    /**
     * Klemmen statt vertrauen. Der Lektions-Titel teilt sich die Grenze mit dem
     * Kurs-Titel (`MAX_COURSE_TITLE`, 200) — dieselbe Konstante, die auch das
     * Lektions-Formular prüft; eine eigene `MAX_LESSON_TITLE` gibt es im Layer
     * nicht, und eine hier erfundene wäre eine zweite Wahrheit.
     */
    title = String(parsed.title ?? '').trim().slice(0, MAX_COURSE_TITLE)
    body = String(parsed.body ?? '').trim().slice(0, MAX_LESSON_CONTENT)
    if (!body) {
      throw createError({ status: 502, statusText: 'AI returned no translation' })
    }
  }

  // Ein leerer Titel ist KEIN Titel: der Eintrag trägt das Feld dann nicht, und
  // die Anzeige fällt auf den Originaltitel zurück, statt ihn zu verschlucken.
  const translations = serializeUgcTranslations({
    ...existing,
    [locale]: { ...(title ? { title } : {}), body },
  })

  /**
   * DEN CACHE SCHREIBEN — FAIL-SOFT: der Mensch hat seine Übersetzung bereits,
   * sie wegen eines misslungenen Schreibvorgangs zu verwerfen wäre der teuerste
   * denkbare Fehler (bezahlt und weggeworfen). Der nächste Klick stellt sie
   * wieder her; laut geloggt, damit eine fehlende Spalte (Migration nicht
   * gelaufen) nicht still Geld verbrennt.
   */
  await tenantDb(event, { as: 'operator', actor: 'operator' })
    .update(LESSONS_TABLE, lesson.$id, { translations })
    .catch((error: unknown) => {
      console.error('[courses] Übersetzungs-Cache der Lektion nicht geschrieben:', error)
    })

  return { locale, title: title || null, body, cached: false }
})
