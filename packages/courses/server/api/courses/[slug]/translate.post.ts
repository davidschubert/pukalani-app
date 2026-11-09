import { Query } from 'node-appwrite'
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
  COURSES_TABLE,
  MAX_COURSE_DESCRIPTION,
  MAX_COURSE_TITLE,
  type CourseRow,
  type CourseTranslateResponse,
} from '../../../../shared/types/course'

/**
 * EINEN KURS ÜBERSETZEN (Davids Entscheidung 2026-08-18 — die KI-Übersetzung
 * gilt jetzt auch für Events und Kurse): Titel und Beschreibung der
 * Kurs-Übersicht. Die LEKTIONEN übersetzt ihre eigene Route
 * (`/api/lessons/:id/translate`), und zwar einzeln — ein Kurs mit dreißig
 * Lektionen wäre sonst EIN Klick mit dreißig KI-Aufrufen.
 *
 * ── DAS PRODUKT-GATE IST `courses`, BEWUSST NICHT `ai` ────────────────────
 * Übersetzt wird der Inhalt, und wer den Inhalt hat, soll ihn lesen können.
 * Davids Entscheidung vom 2026-08-17, wörtlich: Produkt-Gate = das jeweilige
 * INHALTS-Produkt.
 *
 * ── DIESELBEN VORPRÜFUNGEN WIE DIE LESEROUTE ──────────────────────────────
 * Wer den Kurs nicht LESEN darf, darf ihn nicht übersetzen. Deshalb steht hier
 * Zeile für Zeile, was auch `[slug].get.ts` tut: Session-Pflicht, Suche über
 * die MITGLIEDER-Klinke (der Slug eines Nachbarn ist im Pool nicht auffindbar,
 * und die Row-Permissions sind die zweite Grenze) und `status === 'published'`.
 * Ein Entwurf gehört bis zur Veröffentlichung niemandem außer seiner Redaktion.
 *
 * KEIN Enrollment-Gate, und das ist der Unterschied zur Lektion: die
 * Kurs-Übersicht steht jedem eingeloggten Mitglied offen (genau darum entscheidet
 * man dort, ob man sich einschreibt). Erst der INHALT liegt hinter dem Tor.
 *
 * ── `[slug]` HEISST HIER WIRKLICH SLUG ────────────────────────────────────
 * Im selben Ordner liegen Routen, in denen dasselbe Segment die ROW-ID trägt
 * (`index.patch.ts`, `lessons.post.ts`, `reorder.post.ts` — der Builder
 * adressiert per Id). Diese Route gehört zur LESE-Seite und folgt deshalb
 * `[slug].get.ts`: sie sucht über `Query.equal('slug', …)`. Wer das ändert,
 * ändert die Adresse, die in der Oberfläche steht.
 *
 * ── GESCHRIEBEN WIRD ÜBER DIE OPERATOR-KLINKE MIT `actor: 'operator'` ─────
 *  - `as: 'operator'`, weil eine Kurs-Zeile `update` niemandem im Browser gibt.
 *  - `actor: 'operator'`, weil hier NIEMAND Inhalt schreibt: die Übersetzung ist
 *    abgeleitet und jederzeit neu herstellbar. Mit `actor: 'member'` griffe die
 *    M13-Sperre (eine zahlungssäumige Community bleibt LESBAR, und Übersetzen
 *    ist Lesen) und der A5-Beitritt (ein Vorbeisurfer würde durch einen Klick
 *    auf „übersetzen" Mitglied, obwohl er nichts beigetragen hat).
 */

/** Zehn Übersetzungen je Mensch, Community und zehn Minuten. */
const TRANSLATE_LIMIT = 10
const TRANSLATE_WINDOW_MS = 10 * 60_000

function buildPrompt(course: CourseRow, locale: string): string {
  return [
    'Du übersetzt die Beschreibung eines Online-Kurses für einen Leser.',
    '',
    `Zielsprache (BCP-47-Code): ${locale}`,
    '',
    'Titel:',
    '"""',
    course.title,
    '"""',
    '',
    'Beschreibung (Markdown):',
    '"""',
    course.description,
    '"""',
    '',
    'Regeln:',
    '- Übersetze den Inhalt, ändere ihn nicht: nichts hinzufügen, nichts weglassen, nichts zusammenfassen, nichts kommentieren.',
    '- Die Markdown-Struktur bleibt EXAKT erhalten. Es gibt nur: fett, kursiv, `Code`, Links, Überschriften (## und ###), Listen, Zitate (>) und Codeblöcke (```).',
    '- Inhalte von Code-Spans und Codeblöcken bleiben UNVERÄNDERT stehen, auch wenn dort Wörter der Ausgangssprache vorkommen.',
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
    '  "body": "<die übersetzte Beschreibung>"',
    '}',
    'Oder, wenn der Text bereits in der Zielsprache ist: {"same": true}',
  ].join('\n')
}

export default defineEventHandler(async (event): Promise<CourseTranslateResponse> => {
  // Produkt-Gate (P4): Kurse sind ab Plan pro enthalten. NICHT zusätzlich
  // 'ai' — Begründung im Kopf.
  requirePlanProduct(event, 'courses')

  const user = event.context.user
  if (!user) {
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const slug = getRouterParam(event, 'slug')
  if (!slug) {
    throw createError({ status: 400, statusText: 'Missing slug' })
  }

  if (!await isAiConfigured(event)) {
    // 503 wie beim Moderations-Assist: das Produkt ist da, der Schlüssel fehlt.
    // Die Oberfläche zeigt den Knopf dann gar nicht erst an — dies ist das Netz.
    throw createError({ status: 503, statusText: 'AI translation not configured' })
  }

  const { locale } = await readValidatedBody(event, courseTranslateSchema.parse)

  // Wort für Wort die Vorprüfung der Leseroute (siehe Kopf).
  const course = await tenantDb(event).find<CourseRow>(COURSES_TABLE, [Query.equal('slug', slug)])
    .catch((error) => { throw toH3Error(error, 'Course not found') })
  if (!course || course.status !== 'published') {
    throw createError({ status: 404, statusText: 'Course not found' })
  }
  if (!course.description.trim()) {
    // Ohne Beschreibung gibt es nichts zu übersetzen, was die Anzeige zeigen
    // könnte: `body` ist im Cache-Eintrag Pflicht (die geteilte Regel wirft
    // einen Eintrag ohne Text weg).
    throw createError({ status: 400, statusText: 'Nothing to translate', data: { code: 'nothing_to_translate' } })
  }

  const existing = parseUgcTranslations(course.translations)

  /**
   * DER CACHE ZUERST, VOR DER DROSSEL: wer eine schon übersetzte Fassung ein
   * zweites Mal aufschlägt, löst keinen KI-Aufruf aus — also darf ihn das auch
   * kein Kontingent kosten.
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
   * Lesen, ab hier kostet es Geld beim KI-Anbieter und schreibt auf `courses`,
   * also genau die Tabelle, an der der Betreiber gerade womöglich arbeitet.
   */
  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  /**
   * Drossel: ein Mensch, eine Community, ein Fenster — erst HIER, wo der
   * nächste Schritt bezahlt wird. Fail-open wie überall. EIGENER Eimer neben
   * denen der anderen Inhaltsarten (Beiträge, Antworten, Termine, Lektionen):
   * wer eine Community durchliest, soll sich nicht zwischen zwei Produkten
   * selbst aussperren. Je IP deckelt zusätzlich `05.rate-limit.ts`
   * (Bucket `courses:translate`), und zwar bevor hier eine Zeile gelesen wird.
   */
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}course-translate:${communityId}:${user.$id}`, TRANSLATE_WINDOW_MS)
  if (state.count > TRANSLATE_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
    throw createError({ status: 429, statusText: 'Too many translations' })
  }

  /**
   * DER TAGES-DECKEL JE KONTO — DERSELBE Eimer wie in allen anderen
   * Übersetzungs-Routen (kein `communityId`, keine Inhaltsart im Schlüssel):
   * er begrenzt die RECHNUNG eines KONTOS, und die ist dieselbe, egal welche
   * Inhaltsart jemand übersetzt. Begründung und Zahl:
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
    buildPrompt(course, locale),
    { model: aiConfig.model, maxTokens: 8000, label: 'courses' },
  )

  let title: string
  let body: string
  if (parsed.same === true) {
    /**
     * SCHON IN DER ZIELSPRACHE (Davids Entscheidung 2026-08-21).
     *
     * Das Modell hat den Marker gesetzt, statt die Beschreibung Wort für Wort
     * zurückzuechoen — die halbe Rechnung gespart. Gecacht wird trotzdem, und
     * zwar die GRUNDFASSUNG wörtlich: genau das macht jeden weiteren Klick
     * kostenlos (er trifft ab jetzt den Cache-Zweig ganz oben). Ein verworfener
     * `same`-Fall wäre der teuerste von allen — er bezahlte bei jedem Klick
     * aufs Neue dafür, nichts zu tun.
     *
     * Die Antwort trägt KEIN Flag: der Client erkennt die Gleichheit selbst
     * (`ugcTranslationIsOriginal`) und zeigt statt des sinnlosen Umschalters
     * einen Hinweis. Ein Flag wüsste nur dieser eine Aufruf — spätere Leser
     * sehen den Cache aus der Spalte und hätten nichts davon.
     *
     * Weder klemmen noch die 502-Prüfung: beides kommt aus der ZEILE, nicht vom
     * Anbieter — es steht längst in seinen Grenzen, und die leere Beschreibung
     * hat die Vorprüfung oben bereits abgewiesen.
     */
    title = course.title
    body = course.description
  }
  else {
    // Klemmen statt vertrauen — die Antwort ist eine Behauptung, und sie geht in
    // eine Spalte, deren Grenzen die des Originals sind.
    title = String(parsed.title ?? '').trim().slice(0, MAX_COURSE_TITLE)
    body = String(parsed.body ?? '').trim().slice(0, MAX_COURSE_DESCRIPTION)
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
    .update(COURSES_TABLE, course.$id, { translations })
    .catch((error: unknown) => {
      console.error('[courses] Übersetzungs-Cache nicht geschrieben:', error)
    })

  return { locale, title: title || null, body, cached: false }
})
