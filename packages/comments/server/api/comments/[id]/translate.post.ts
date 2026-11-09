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
import { commentTranslateSchema } from '../../../../schemas/comment'
import {
  COMMENTS_TABLE,
  MAX_COMMENT_CONTENT,
  type Comment,
  type CommentTranslateResponse,
} from '../../../../shared/types/comment'

/**
 * EINE ANTWORT ÜBERSETZEN (Davids Entscheidungen 2026-08-17) — das
 * Zwillingsstück zu `POST /api/posts/:id/translate`, bis auf das eine Feld:
 * ein Kommentar hat keinen Titel.
 *
 * Ein KNOPF je Inhalt, keine Automatik: übersetzt wird, was ein Mensch lesen
 * will — nicht jede Antwort in jede App-Sprache, sobald sie entsteht.
 *
 * ── DAS PRODUKT-GATE IST `comments`, BEWUSST NICHT `ai` ───────────────────
 * Der Moderations-Assist (`admin/comments/[id]/assist.post.ts`) verlangt `ai`,
 * weil er ein Werkzeug der VERWALTUNG ist. Hier wird der Inhalt übersetzt, und
 * wer den Inhalt hat, soll ihn lesen können — Davids Entscheidung vom
 * 2026-08-17, wörtlich: Produkt-Gate = das jeweilige INHALTS-Produkt.
 * `comments` steht heute in keiner `tenancy.products`-Karte und ist damit frei;
 * der Aufruf steht trotzdem hier, damit eine spätere Zuordnung wirkt, ohne
 * diese Datei anzufassen (Muster `activity: 'basic'` in apps/platform).
 *
 * ── ZWEI TÜREN, UND JEDE HAT IHREN GRUND ──────────────────────────────────
 * GELESEN wird über die MITGLIEDER-Klinke (`tenantDb(event)`): der
 * Session-Client wertet die Row-Permissions aus, und das ist hier die
 * Sichtbarkeits-Prüfung — C18 stuft das Publikum einer Community auf Mitglieder
 * herunter, und ohne diese Klinke läse ein Fremder den Text über den Umweg
 * „Übersetzung". GESCHRIEBEN wird der Cache über die Operator-Klinke MIT
 * `actor: 'operator'`, und beides ist nötig:
 *  - `as: 'operator'`, weil eine Kommentar-Zeile `update` nur ihrem AUTOR gibt
 *    (Row-Security) — ein fremder Leser käme sonst nicht an die Spalte.
 *  - `actor: 'operator'`, weil hier NIEMAND Inhalt schreibt. Die Übersetzung
 *    ist abgeleitet und jederzeit neu herstellbar. Mit `actor: 'member'` griffe
 *    die M13-Sperre (eine zahlungssäumige Community ist NUR-LESEND — Lesen soll
 *    sie aber bleiben, und Übersetzen ist Lesen) und der A5-Beitritt (ein
 *    Vorbeisurfer würde durch einen Klick auf „übersetzen" Mitglied, obwohl er
 *    nichts beigetragen hat).
 *
 * KEIN `assertCommentsWritable` (anders als bei Reaktion, Stimme und
 * Bearbeitung): eine Community, die das Kommentieren abgeschaltet hat, LIEST
 * ihre Kommentare weiter — und ein Wartungsmodus friert Schreibvorgänge ein,
 * nicht das Lesen.
 *
 * NUR AKTIVE KOMMENTARE: ausgeblendete und soft-gelöschte verlieren ihre
 * Lese-Permission bzw. zeigen nur einen Platzhalter — die Antwort dieser Route
 * würde ihren Text ausliefern.
 */

/** Zehn Übersetzungen je Mensch, Community und zehn Minuten. */
const TRANSLATE_LIMIT = 10
const TRANSLATE_WINDOW_MS = 10 * 60_000

function buildPrompt(content: string, locale: string): string {
  return [
    'Du übersetzt eine Antwort aus einer Community-Diskussion für einen Leser.',
    '',
    `Zielsprache (BCP-47-Code): ${locale}`,
    '',
    'Text (Markdown):',
    '"""',
    content,
    '"""',
    '',
    'Regeln:',
    '- Übersetze den Inhalt, ändere ihn nicht: nichts hinzufügen, nichts weglassen, nichts zusammenfassen, nichts kommentieren.',
    '- Die Markdown-Struktur bleibt EXAKT erhalten. Es gibt nur: fett, kursiv, `Code`, Links, Überschriften (## und ###), Listen, Zitate (>) und Codeblöcke (```).',
    '- Inhalte von Code-Spans und Codeblöcken bleiben UNVERÄNDERT stehen, auch wenn dort Wörter der Ausgangssprache vorkommen.',
    '- Erwähnungen (@name), Themen-Verweise (#id) und URLs bleiben UNVERÄNDERT stehen.',
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
    '  "body": "<der übersetzte Text>"',
    '}',
    'Oder, wenn der Text bereits in der Zielsprache ist: {"same": true}',
  ].join('\n')
}

export default defineEventHandler(async (event): Promise<CommentTranslateResponse> => {
  requirePlanProduct(event, 'comments')

  const user = event.context.user
  if (!user) {
    // Nur Eingeloggte (Davids Entscheidung): ein Gast, der auf einer
    // eingebetteten Seite in einer Schleife klickt, wäre eine offene Rechnung.
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const commentId = getRouterParam(event, 'id')
  if (!commentId) {
    throw createError({ status: 400, statusText: 'Missing comment id' })
  }

  if (!await isAiConfigured(event)) {
    // 503 wie beim Moderations-Assist: das Produkt ist da, der Schlüssel fehlt.
    // Die Oberfläche zeigt den Knopf dann gar nicht erst an — dies ist das Netz.
    throw createError({ status: 503, statusText: 'AI translation not configured' })
  }

  const { locale } = await readValidatedBody(event, commentTranslateSchema.parse)

  // Mitglieder-Klinke: die Row-Permissions sind hier die Sichtbarkeits-Prüfung
  // (siehe Kopf), der Mandanten-Filter der Tür das Netz darunter.
  const comment = await tenantDb(event).get<Comment>(COMMENTS_TABLE, commentId, 'Comment not found')
  if (comment.status !== 'active') {
    throw createError({
      status: 400,
      statusText: 'Comment is not translatable',
      data: { code: 'comment_not_active' },
    })
  }

  const existing = parseUgcTranslations(comment.translations)

  /**
   * DER CACHE ZUERST, VOR DER DROSSEL: wer eine schon übersetzte Fassung ein
   * zweites Mal aufschlägt, löst keinen KI-Aufruf aus — also darf ihn das auch
   * kein Kontingent kosten.
   */
  const cached = existing[locale]
  if (cached) {
    return { locale, body: cached.body, cached: true }
  }

  if (!mayAddUgcTranslationLocale(existing, locale)) {
    throw createError({
      status: 400,
      statusText: 'Too many translated languages',
      data: { code: 'translation_locale_limit' },
    })
  }

  /**
   * WARTUNGSMODUS — und zwar erst AB HIER, und nur er.
   *
   * `assertNotMaintenance` statt `assertCommentsWritable`: eine Community, die
   * das Kommentieren abgeschaltet hat, LIEST ihre Kommentare weiter, und
   * Übersetzen ist Lesen (dieselbe Wahl wie beim Löschen eigener Kommentare).
   * Alles darüber ist ohnehin reines Lesen — eine schon übersetzte Fassung kommt
   * aus der Zeile, die ohnehin gelesen wurde. Ab hier wird es etwas anderes: ein
   * Aufruf beim KI-Anbieter (kostet Geld) und ein Schreibvorgang auf `comments`,
   * also genau die Tabelle, an der der Betreiber gerade womöglich arbeitet.
   */
  await assertNotMaintenance(event)

  /**
   * Drossel: ein Mensch, eine Community, ein Fenster — und ausdrücklich erst
   * HIER, wo der nächste Schritt Geld beim KI-Anbieter kostet. Fail-open wie
   * überall. EIGENER Eimer neben dem der Beiträge: wer eine Diskussion liest
   * und dabei Thema UND Antworten übersetzt, soll sich nicht selbst aussperren.
   *
   * SIE IST NICHT DIE ERSTE: `05.rate-limit.ts` deckelt die Route zusätzlich je
   * IP (Bucket `comments:translate`), bevor hier eine Zeile gelesen wird.
   */
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}comment-translate:${communityId}:${user.$id}`, TRANSLATE_WINDOW_MS)
  if (state.count > TRANSLATE_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
    throw createError({ status: 429, statusText: 'Too many translations' })
  }

  /**
   * DER TAGES-DECKEL JE KONTO (Davids Nachtrag 2026-08-17) — DERSELBE Eimer wie
   * in `posts/[id]/translate.post.ts`, und das ist keine Nachlässigkeit,
   * sondern die Absicht: der Deckel begrenzt die RECHNUNG eines KONTOS, und die
   * ist dieselbe, ob jemand Themen oder Antworten übersetzt. Zwei Eimer wären
   * 200 am Tag. Begründung, Zahl und Schlüssel: `core/shared/ugcTranslations.ts`.
   *
   * ERST DIE DROSSEL, DANN DER DECKEL: `store.hit` ZÄHLT immer — stünde der
   * Tages-Eimer davor, fräße jeder von der Drossel abgewiesene Versuch ein
   * Tages-Kontingent.
   */
  const day = await store.hit(`${prefix}${ugcTranslationDayKey(user.$id)}`, TRANSLATE_DAILY_WINDOW_MS)
  if (day.count > TRANSLATE_DAILY_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(day.resetInMs / 1000)))
    // Der GRUND reist mit: eine 429 aus dem Tages-Deckel ist erst morgen
    // vorbei, die aus der Drossel in Minuten — der Client sagt Verschiedenes.
    throw createError({
      status: 429,
      statusText: 'Daily translation limit reached',
      data: { code: TRANSLATION_DAILY_LIMIT_CODE },
    })
  }

  // Laufzeit-Override vor Build-Default (getEffectiveAiConfig, system-016).
  const aiConfig = await getEffectiveAiConfig(event)
  const parsed = await aiCompleteJson<{ body?: unknown, same?: unknown }>(
    event,
    buildPrompt(comment.content, locale),
    { model: aiConfig.model, maxTokens: 8000, label: 'comments' },
  )

  let body: string
  if (parsed.same === true) {
    /**
     * SCHON IN DER ZIELSPRACHE (Davids Entscheidung 2026-08-21).
     *
     * Das Modell hat den Marker gesetzt, statt die Antwort Wort für Wort
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
     * Weder klemmen noch die 502-Prüfung: der Text kommt aus der ZEILE, nicht
     * vom Anbieter — er steht längst in seinen Grenzen und ist nie leer.
     */
    body = comment.content
  }
  else {
    // Klemmen statt vertrauen — die Antwort ist eine Behauptung, und sie geht in
    // eine Spalte, deren Grenze die des Originals ist.
    body = String(parsed.body ?? '').trim().slice(0, MAX_COMMENT_CONTENT)
    if (!body) {
      throw createError({ status: 502, statusText: 'AI returned no translation' })
    }
  }

  const translations = serializeUgcTranslations({ ...existing, [locale]: { body } })

  /**
   * DEN CACHE SCHREIBEN — FAIL-SOFT, und das ist eine Abwägung, keine
   * Nachlässigkeit: der Mensch hat seine Übersetzung bereits, sie wegen eines
   * misslungenen Schreibvorgangs zu verwerfen wäre der teuerste denkbare
   * Fehler (bezahlt und weggeworfen). Der nächste Klick stellt sie wieder her.
   * Laut geloggt, damit eine fehlende Spalte (Migration nicht gelaufen) nicht
   * still Geld verbrennt.
   */
  await tenantDb(event, { as: 'operator', actor: 'operator' })
    .update(COMMENTS_TABLE, commentId, { translations })
    .catch((error: unknown) => {
      console.error('[comments] Übersetzungs-Cache nicht geschrieben:', error)
    })

  return { locale, body, cached: false }
})
