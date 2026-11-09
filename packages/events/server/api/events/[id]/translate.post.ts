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
import { eventTranslateSchema } from '../../../../schemas/event'
import { eventIsRedacted } from '../../../../shared/eventModerationPolicy'
import {
  EVENTS_TABLE,
  MAX_EVENT_DESCRIPTION,
  MAX_EVENT_TITLE,
  type EventRow,
  type EventTranslateResponse,
} from '../../../../shared/types/event'

/**
 * EINEN TERMIN ÜBERSETZEN (Davids Entscheidung 2026-08-18 — die KI-Übersetzung
 * gilt jetzt auch für Events und Kurse).
 *
 * Das Zwillingsstück zu `posts/[id]/translate.post.ts`; was hier anders ist,
 * steht unten. Ein KNOPF je Inhalt, keine Automatik: übersetzt wird, was ein
 * Mensch lesen will — nicht jeder Termin in jede App-Sprache, sobald er
 * entsteht.
 *
 * ── DAS PRODUKT-GATE IST `events`, BEWUSST NICHT `ai` ─────────────────────
 * Übersetzt wird der Inhalt, und wer den Inhalt hat, soll ihn lesen können.
 * Davids Entscheidung vom 2026-08-17, wörtlich: Produkt-Gate = das jeweilige
 * INHALTS-Produkt. Ein zusätzliches `ai`-Gate (das die VERWALTUNGS-Werkzeuge
 * tragen — Moderations-Assist, Kategorie-Vorschlag) hieße hier, dass eine
 * Community ihre eigenen Termine nicht lesen darf.
 *
 * ── ZWEI TÜREN, UND JEDE HAT IHREN GRUND ──────────────────────────────────
 * GELESEN wird über die MITGLIEDER-Klinke (`tenantDb(event)`), genau wie in
 * `[id].get.ts`: der Session-Client wertet die Row-Permissions aus, und das ist
 * hier die Sichtbarkeits-Prüfung — Entwürfe und von der Moderation
 * ausgeblendete Termine tragen kein Leserecht und ergeben 404, ohne dass diese
 * Route den Status kennen müsste. GESCHRIEBEN wird der Cache über die
 * Operator-Klinke MIT `actor: 'operator'`:
 *  - `as: 'operator'`, weil eine Event-Zeile `update` niemandem im Browser gibt
 *    (alle Schreibwege des Layers laufen über den Admin-Client).
 *  - `actor: 'operator'`, weil hier NIEMAND Inhalt schreibt. Die Übersetzung
 *    ist abgeleitet und jederzeit neu herstellbar. Mit `actor: 'member'` griffe
 *    die M13-Sperre (eine zahlungssäumige Community bleibt LESBAR, und
 *    Übersetzen ist Lesen) und der A5-Beitritt (ein Vorbeisurfer würde durch
 *    einen Klick auf „übersetzen" Mitglied, obwohl er nichts beigetragen hat).
 *
 * ── GESCHWÄRZTE TERMINE WERDEN NICHT ÜBERSETZT (F46) ──────────────────────
 * Nach `POST /api/events/:id/redact` sind Titel und Beschreibung leer; die
 * Seite zeigt dort einen i18n-Hinweis. Es gäbe also nichts zu übersetzen — und
 * ein KI-Aufruf auf einen leeren Text wäre bezahlte Erfindung. Die Schwärzung
 * leert zusätzlich diese Spalte (siehe dort): eine Übersetzung, die den
 * geschwärzten Text weiterträgt, wäre keine Schwärzung.
 */

/** Zehn Übersetzungen je Mensch, Community und zehn Minuten. */
const TRANSLATE_LIMIT = 10
const TRANSLATE_WINDOW_MS = 10 * 60_000

function buildPrompt(row: EventRow, locale: string): string {
  return [
    'Du übersetzt die Ankündigung eines Community-Termins für einen Leser.',
    '',
    `Zielsprache (BCP-47-Code): ${locale}`,
    '',
    'Titel:',
    '"""',
    row.title,
    '"""',
    '',
    'Beschreibung (Markdown):',
    '"""',
    row.description,
    '"""',
    '',
    'Regeln:',
    '- Übersetze den Inhalt, ändere ihn nicht: nichts hinzufügen, nichts weglassen, nichts zusammenfassen, nichts kommentieren.',
    '- Die Markdown-Struktur bleibt EXAKT erhalten. Es gibt nur: fett, kursiv, `Code`, Links, Überschriften (## und ###), Listen, Zitate (>) und Codeblöcke (```).',
    '- Inhalte von Code-Spans und Codeblöcken bleiben UNVERÄNDERT stehen, auch wenn dort Wörter der Ausgangssprache vorkommen.',
    '- Erwähnungen (@name), URLs, Datums- und Zeitangaben, Ortsnamen und Anschriften bleiben UNVERÄNDERT stehen.',
    '- Eigennamen, Produktnamen und Fachbegriffe, die auch in der Zielsprache unübersetzt benutzt werden, bleiben stehen.',
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

export default defineEventHandler(async (event): Promise<EventTranslateResponse> => {
  // Produkt-Gate (P4): Events sind ab Plan pro enthalten. NICHT zusätzlich
  // 'ai' — Begründung im Kopf.
  requirePlanProduct(event, 'events')

  const user = event.context.user
  if (!user) {
    // Nur Eingeloggte (Davids Entscheidung): ein Gast, der in einer Schleife
    // klickt, wäre eine offene Rechnung. Die Event-Detailseite ist öffentlich —
    // dieser Knopf ist es nicht.
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing event id' })
  }

  if (!await isAiConfigured(event)) {
    // 503 wie beim Moderations-Assist: das Produkt ist da, der Schlüssel fehlt.
    // Die Oberfläche zeigt den Knopf dann gar nicht erst an — dies ist das Netz.
    throw createError({ status: 503, statusText: 'AI translation not configured' })
  }

  const { locale } = await readValidatedBody(event, eventTranslateSchema.parse)

  // Mitglieder-Klinke: die Row-Permissions sind hier die Sichtbarkeits-Prüfung
  // (siehe Kopf), der Mandanten-Filter der Tür das Netz darunter.
  const row = await tenantDb(event).get<EventRow>(EVENTS_TABLE, id, 'Event not found')
  if (eventIsRedacted(row.redactedAt)) {
    throw createError({ status: 400, statusText: 'Event is redacted', data: { code: 'event_redacted' } })
  }
  if (!row.description.trim()) {
    /**
     * Ohne Beschreibung gibt es nichts zu übersetzen, was die Anzeige zeigen
     * könnte: `body` ist im Cache-Eintrag PFLICHT (die geteilte Regel wirft
     * einen Eintrag ohne Text weg), und ein Titel allein wäre dort kein
     * gültiger Eintrag. Das Formular verlangt eine Beschreibung
     * (`events.validation.descriptionRequired`) — dieser Fall ist Bestand
     * oder Import, kein Normalzustand.
     */
    throw createError({ status: 400, statusText: 'Nothing to translate', data: { code: 'nothing_to_translate' } })
  }

  const existing = parseUgcTranslations(row.translations)

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
   * WARTUNGSMODUS — und zwar erst AB HIER (Muster posts).
   *
   * Alles darüber ist reines Lesen: eine schon übersetzte Fassung kommt aus der
   * Zeile, die ohnehin gelesen wurde, und der Wartungsmodus friert Schreibwege
   * ein, nicht das Lesen. Ab dieser Zeile wird es etwas anderes — ein Aufruf
   * beim KI-Anbieter (kostet Geld) und ein Schreibvorgang auf `events`, also
   * genau die Tabelle, an der der Betreiber gerade womöglich arbeitet.
   * `assertEventsWritable` ist der Wächter dieses Layers (A14: nicht der
   * gleichnamige aus comments).
   */
  await assertEventsWritable(event)

  /**
   * Drossel: ein Mensch, eine Community, ein Fenster — und ausdrücklich erst
   * HIER, wo der nächste Schritt Geld beim KI-Anbieter kostet. Fail-open wie
   * überall. EIGENER Eimer neben denen der anderen Inhaltsarten: wer eine
   * Community durchliest, soll sich nicht zwischen Beiträgen und Terminen
   * selbst aussperren.
   *
   * SIE IST NICHT DIE ERSTE: `05.rate-limit.ts` deckelt die Route zusätzlich je
   * IP (Bucket `events:translate`), bevor hier eine Zeile gelesen wird.
   */
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}event-translate:${communityId}:${user.$id}`, TRANSLATE_WINDOW_MS)
  if (state.count > TRANSLATE_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
    throw createError({ status: 429, statusText: 'Too many translations' })
  }

  /**
   * DER TAGES-DECKEL JE KONTO — DERSELBE Eimer wie in allen anderen
   * Übersetzungs-Routen (kein `communityId`, keine Inhaltsart im Schlüssel):
   * er begrenzt die RECHNUNG eines KONTOS, und die ist dieselbe, ob jemand
   * Beiträge, Antworten, Termine oder Lektionen übersetzt. Vier eigene Eimer
   * wären in Wahrheit 400 am Tag. Begründung und Zahl:
   * `core/shared/ugcTranslations.ts`.
   *
   * ERST DIE DROSSEL, DANN DER DECKEL: `store.hit` ZÄHLT immer — stünde der
   * Tages-Eimer davor, fräße jeder von der Drossel abgewiesene Versuch ein
   * Tages-Kontingent.
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
    buildPrompt(row, locale),
    { model: aiConfig.model, maxTokens: 8000, label: 'events' },
  )

  let title: string
  let body: string
  if (parsed.same === true) {
    /**
     * SCHON IN DER ZIELSPRACHE (Davids Entscheidung 2026-08-21).
     *
     * Das Modell hat den Marker gesetzt, statt die Ankündigung Wort für Wort
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
    title = row.title
    body = row.description
  }
  else {
    // Klemmen statt vertrauen — die Antwort ist eine Behauptung, und sie geht in
    // eine Spalte, deren Grenzen die des Originals sind.
    title = String(parsed.title ?? '').trim().slice(0, MAX_EVENT_TITLE)
    body = String(parsed.body ?? '').trim().slice(0, MAX_EVENT_DESCRIPTION)
    if (!body) {
      // Ohne Text gibt es nichts zu zeigen und nichts zu merken. 502 wie überall,
      // wo der Anbieter etwas Unbrauchbares geliefert hat.
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
   * DEN CACHE SCHREIBEN — FAIL-SOFT, und das ist eine Abwägung, keine
   * Nachlässigkeit: der Mensch hat seine Übersetzung bereits, sie wegen eines
   * misslungenen Schreibvorgangs zu verwerfen wäre der teuerste denkbare
   * Fehler (bezahlt und weggeworfen). Der nächste Klick stellt sie wieder her.
   * Laut geloggt, damit eine fehlende Spalte (Migration nicht gelaufen) nicht
   * still Geld verbrennt.
   */
  await tenantDb(event, { as: 'operator', actor: 'operator' })
    .update(EVENTS_TABLE, id, { translations })
    .catch((error: unknown) => {
      console.error('[events] Übersetzungs-Cache nicht geschrieben:', error)
    })

  return { locale, title: title || null, body, cached: false }
})
