import {
  TRANSLATE_DAILY_LIMIT,
  TRANSLATE_DAILY_WINDOW_MS,
  TRANSLATION_DAILY_LIMIT_CODE,
  mayAddUgcTranslationLocale,
  parseUgcTranslations,
  serializeUgcTranslations,
  translatedPollOptions,
  ugcTranslationDayKey,
  type UgcTranslationEntry,
} from '../../../../../core/shared/ugcTranslations'
import { AI_JSON_QUOTE_RULE } from '../../../../../core/shared/aiJson'
import { postTranslateSchema } from '../../../../schemas/post'
import {
  MAX_POLL_OPTION_LENGTH,
  MAX_POST_BODY,
  MAX_POST_TITLE,
  POSTS_TABLE,
  type CommunityPost,
  type PostTranslateResponse,
} from '../../../../shared/types/post'

/**
 * EINEN BEITRAG ÜBERSETZEN (Davids Entscheidungen 2026-08-17).
 *
 * Ein KNOPF je Inhalt, keine Automatik: übersetzt wird, was ein Mensch lesen
 * will — nicht jeder Beitrag in jede App-Sprache, sobald er entsteht. Das ist
 * der ganze Unterschied zwischen einer Funktion und einer Rechnung.
 *
 * ── DAS PRODUKT-GATE IST `posts`, BEWUSST NICHT `ai` ──────────────────────
 * Der Moderations-Assist (`[id]/assist.post.ts`) und der Kategorie-Vorschlag
 * verlangen BEIDE Gates, weil sie Werkzeuge für die VERWALTUNG sind — dort ist
 * KI das Produkt. Hier ist sie es nicht: übersetzt wird der Inhalt, und wer den
 * Inhalt hat, soll ihn lesen können. Ein `requirePlanProduct(event, 'ai')`
 * daneben hieße, dass eine Community mit Plan `personal` ihre eigenen Beiträge
 * nicht übersetzen darf — genau die Sorte Grenze, die niemand erklären kann.
 * Davids Entscheidung vom 2026-08-17, wörtlich: Produkt-Gate = das jeweilige
 * INHALTS-Produkt.
 *
 * ── ZWEI TÜREN, UND JEDE HAT IHREN GRUND ──────────────────────────────────
 * GELESEN wird über die MITGLIEDER-Klinke (`tenantDb(event)`): der
 * Session-Client wertet die Row-Permissions aus, und das ist hier die
 * Sichtbarkeits-Prüfung — ohne sie könnte ein eingeloggter Nicht-Mitleser einer
 * geschlossenen Community deren Beiträge über den Umweg „Übersetzung" lesen.
 * GESCHRIEBEN wird der Cache über die Operator-Klinke MIT `actor: 'operator'`,
 * und beides ist nötig:
 *  - `as: 'operator'`, weil eine Beitrags-Zeile `update` nur ihrem AUTOR gibt
 *    (index.post.ts) — ein fremder Leser käme sonst nicht an die Spalte.
 *  - `actor: 'operator'`, weil hier NIEMAND Inhalt schreibt. Die Übersetzung
 *    ist abgeleitet und jederzeit neu herstellbar. Mit `actor: 'member'` griffe
 *    die M13-Sperre (eine zahlungssäumige Community ist NUR-LESEND — Lesen soll
 *    sie aber bleiben, und Übersetzen ist Lesen) und der A5-Beitritt (ein
 *    Vorbeisurfer würde durch einen Klick auf „übersetzen" Mitglied, obwohl er
 *    nichts beigetragen hat).
 *
 * ── NUR VERÖFFENTLICHTE BEITRÄGE ──────────────────────────────────────────
 * Die Statusprüfung ist hier keine Kosmetik: verborgene und gelöschte Beiträge
 * verlieren beim Ausblenden ihre Lese-Permission, die Antwort dieser Route
 * würde ihren Text aber ausliefern. Geplante ebenso — sie gehören bis zum
 * Termin niemandem außer ihrem Autor.
 *
 * ── ZWEI KLICKS IM SELBEN MOMENT KOSTEN ZWEIMAL, UND DAS IST HINGENOMMEN ──
 * Der letzte Schreiber gewinnt. Eine Sperre (Reservierungszeile, Lock-Spalte)
 * kostete einen Schreibvorgang JE Übersetzung, um in einem seltenen Rennen
 * einen KI-Aufruf zu sparen, dessen Ergebnis ohnehin dasselbe ist.
 *
 * ── UMFRAGEN ÜBERSETZEN IHRE OPTIONEN MIT (Davids Entscheidung 2026-08-18) ─
 * Bis dahin bekam der Leser eine übersetzte FRAGE mit fremdsprachigen
 * Wahlmöglichkeiten — halb übersetzt ist hier schlechter als gar nicht, weil
 * die Frage vorgibt, verstanden worden zu sein. Die Optionen reisen deshalb
 * nummeriert in den Prompt und kommen als Array zurück. Was sie NICHT
 * verändern, ist die Stimme: die hängt am INDEX (`poll_votes.optionIndex`).
 * Der Anzahl-Wächter (`translatedPollOptions`) ist trotzdem Pflicht — die
 * Reihenfolge verspricht hier nur der Prompt, und ein verschobenes Array
 * ließe jemanden auf „Ja" klicken und für „Nein" stimmen. Passt sie nicht,
 * wird der Eintrag OHNE Optionen gespeichert: Titel und Text bleiben nutzbar,
 * die Optionen bleiben im Original.
 */

/** Zehn Übersetzungen je Mensch, Community und zehn Minuten. */
const TRANSLATE_LIMIT = 10
const TRANSLATE_WINDOW_MS = 10 * 60_000

function buildPrompt(post: CommunityPost, options: string[], locale: string): string {
  return [
    'Du übersetzt einen Beitrag aus einem Community-Forum für einen Leser.',
    '',
    `Zielsprache (BCP-47-Code): ${locale}`,
    '',
    ...(post.title ? ['Titel:', '"""', post.title, '"""', ''] : []),
    'Text (Markdown):',
    '"""',
    post.body,
    '"""',
    ...(options.length
      ? [
          '',
          'Wahlmöglichkeiten der Umfrage (nummeriert, die Nummer ist die Reihenfolge):',
          '"""',
          ...options.map((option, index) => `${index + 1}. ${option}`),
          '"""',
        ]
      : []),
    '',
    'Regeln:',
    '- Übersetze den Inhalt, ändere ihn nicht: nichts hinzufügen, nichts weglassen, nichts zusammenfassen, nichts kommentieren.',
    '- Die Markdown-Struktur bleibt EXAKT erhalten. Es gibt nur: fett, kursiv, `Code`, Links, Überschriften (## und ###), Listen, Zitate (>) und Codeblöcke (```).',
    '- Inhalte von Code-Spans und Codeblöcken bleiben UNVERÄNDERT stehen, auch wenn dort Wörter der Ausgangssprache vorkommen.',
    '- Erwähnungen (@name), Themen-Verweise (#id) und URLs bleiben UNVERÄNDERT stehen.',
    '- Eigennamen, Produktnamen und Fachbegriffe, die auch in der Zielsprache unübersetzt benutzt werden, bleiben stehen.',
    '- Ist der Beitrag bereits vollständig in der Zielsprache, übersetze NICHT: Antworte stattdessen NUR mit {"same": true} und wiederhole den Text nicht.',
    ...(options.length
      ? [
          `- Übersetze JEDE Wahlmöglichkeit und gib EXAKT ${options.length} zurück, in DERSELBEN Reihenfolge wie oben — keine zusammenfassen, keine weglassen, keine hinzufügen. Die Nummern selbst gehören nicht in die Ausgabe.`,
          '- Eine Wahlmöglichkeit ist eine Beschriftung: kurz, ohne Satzzeichen am Ende.',
        ]
      : []),
    '',
    // Die Vorsorge VOR dem bezahlten Aufruf (AI2, `core/shared/aiJson.ts`):
    // ein gerades `"` im Fliesstext beendet den JSON-String. Die Rettung
    // DANACH ist `parseModelJson`, durch die dieser Aufruf ohnehin läuft.
    AI_JSON_QUOTE_RULE,
    '',
    'Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärung außenrum):',
    '{',
    ...(post.title ? ['  "title": "<der übersetzte Titel>",'] : []),
    `  "body": "<der übersetzte Text>"${options.length ? ',' : ''}`,
    ...(options.length ? [`  "options": [<${options.length} übersetzte Wahlmöglichkeiten in der Reihenfolge oben>]`] : []),
    '}',
    'Oder, wenn der Beitrag bereits in der Zielsprache ist: {"same": true}',
    ...(post.title ? [] : ['Der Beitrag hat keinen Titel — gib das Feld "title" nicht aus.']),
  ].join('\n')
}

export default defineEventHandler(async (event): Promise<PostTranslateResponse> => {
  // Produkt-Gate (P4): der Posting-Feed ist ab Plan personal enthalten. NICHT
  // zusätzlich 'ai' — Begründung im Kopf.
  requirePlanProduct(event, 'posts')

  const user = event.context.user
  if (!user) {
    // Nur Eingeloggte (Davids Entscheidung): ein Gast, der auf einer
    // eingebetteten Seite in einer Schleife klickt, wäre eine offene Rechnung.
    throw createError({ status: 401, statusText: 'Unauthorized' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ status: 400, statusText: 'Missing post id' })
  }

  if (!await isAiConfigured(event)) {
    // 503 wie beim Moderations-Assist: das Produkt ist da, der Schlüssel fehlt.
    // Die Oberfläche zeigt den Knopf dann gar nicht erst an — dies ist das Netz.
    throw createError({ status: 503, statusText: 'AI translation not configured' })
  }

  const { locale } = await readValidatedBody(event, postTranslateSchema.parse)

  // Mitglieder-Klinke: die Row-Permissions sind hier die Sichtbarkeits-Prüfung
  // (siehe Kopf), der Mandanten-Filter der Tür das Netz darunter.
  const post = await tenantDb(event).get<CommunityPost>(POSTS_TABLE, id, 'Post not found')
  if (post.status !== 'published') {
    throw createError({ status: 400, statusText: 'Post is not translatable', data: { code: 'post_not_published' } })
  }

  /**
   * Die Wahlmöglichkeiten — leer bei allem, was keine Umfrage ist. Gelesen mit
   * demselben Helfer wie überall im Layer (`parsePollOptions`, fail-soft): eine
   * kaputte JSON-Spalte heißt hier „keine Optionen" und übersetzt still nur
   * Titel und Text, statt den Beitrag unübersetzbar zu machen.
   */
  const pollOptions = post.type === 'poll' ? parsePollOptions(post) : []

  const existing = parseUgcTranslations(post.translations)

  /**
   * DER CACHE ZUERST, VOR DER DROSSEL.
   *
   * Wer eine schon übersetzte Fassung ein zweites Mal aufschlägt, löst keinen
   * KI-Aufruf aus — also darf ihn das auch kein Kontingent kosten. Eine Drossel
   * VOR dieser Stelle würde genau das Verhalten bestrafen, das nichts kostet.
   */
  const cached = existing[locale]
  if (cached) {
    // `options` fehlt bei jedem Cache aus der Zeit vor dem 2026-08-18 und bei
    // jedem Beitrag, der keine Umfrage ist — `null` heißt hier wie überall
    // „nimm die Originale".
    return { locale, title: cached.title ?? null, body: cached.body, options: cached.options ?? null, cached: true }
  }

  if (!mayAddUgcTranslationLocale(existing, locale)) {
    throw createError({
      status: 400,
      statusText: 'Too many translated languages',
      data: { code: 'translation_locale_limit' },
    })
  }

  /**
   * WARTUNGSMODUS — und zwar erst AB HIER (S10b).
   *
   * Alles darüber ist reines Lesen: eine schon übersetzte Fassung kommt aus der
   * Zeile, die ohnehin gelesen wurde, und der Wartungsmodus friert Schreibwege
   * ein, nicht das Lesen. Ab dieser Zeile wird es etwas anderes — ein Aufruf
   * beim KI-Anbieter (kostet Geld) und ein Schreibvorgang auf
   * `community_posts`, also genau die Tabelle, an der der Betreiber gerade
   * womöglich arbeitet.
   */
  const appConfig = await getAppConfig(event)
  if (appConfig.maintenanceMode) {
    throw createError({ status: 403, statusText: 'Maintenance mode' })
  }

  /**
   * Drossel: ein Mensch, eine Community, ein Fenster — und ausdrücklich erst
   * HIER, wo der nächste Schritt Geld beim KI-Anbieter kostet. Fail-open wie
   * überall (ein toter Redis darf das Übersetzen nicht abschalten).
   *
   * SIE IST NICHT DIE ERSTE: `05.rate-limit.ts` deckelt die Route zusätzlich je
   * IP (Bucket `posts:translate`), und zwar bevor hier eine Zeile gelesen wird.
   * Diese Drossel bleibt die feinere (Mensch + Community statt IP) und im
   * Normalfall die wirksame.
   */
  const tenant = useTenant(event)
  const communityId = tenant?.mode === 'pool' ? tenant.tenantId : ''
  const { store, prefix } = useRateLimitStore(event)
  const state = await store.hit(`${prefix}post-translate:${communityId}:${user.$id}`, TRANSLATE_WINDOW_MS)
  if (state.count > TRANSLATE_LIMIT) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil(state.resetInMs / 1000)))
    throw createError({ status: 429, statusText: 'Too many translations' })
  }

  /**
   * DER TAGES-DECKEL JE KONTO (Davids Nachtrag 2026-08-17) — die zweite Frage
   * neben der Drossel darüber: die begrenzt das TEMPO, dieser die RECHNUNG.
   * Begründung, Zahl und Schlüssel stehen in `core/shared/ugcTranslations.ts`;
   * die Kommentar-Route benutzt DENSELBEN Eimer (kein `communityId`, keine
   * Inhaltsart im Schlüssel), sonst wären es in Wahrheit 200 am Tag.
   *
   * ERST DIE DROSSEL, DANN DER DECKEL, und die Reihenfolge ist die ganze
   * Sorgfalt: `store.hit` ZÄHLT immer. Stünde der Tages-Eimer davor, fräße
   * jeder von der Burst-Drossel abgewiesene Versuch ein Tages-Kontingent —
   * wer zu schnell klickt, verlöre seinen Tag.
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
  const parsed = await aiCompleteJson<{ title?: unknown, body?: unknown, options?: unknown, same?: unknown }>(
    event,
    buildPrompt(post, pollOptions, locale),
    { model: aiConfig.model, maxTokens: 8000, label: 'posts' },
  )

  let entry: UgcTranslationEntry
  if (parsed.same === true) {
    /**
     * SCHON IN DER ZIELSPRACHE (Davids Entscheidung 2026-08-21).
     *
     * Das Modell hat den Marker gesetzt, statt den Beitrag Wort für Wort
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
     * Klemmen ist hier unnötig: Titel, Text und Optionen kommen aus der ZEILE,
     * nicht vom Anbieter, und stehen damit längst in ihren Grenzen.
     */
    entry = {
      ...(post.title ? { title: post.title } : {}),
      body: post.body,
      ...(pollOptions.length ? { options: pollOptions } : {}),
    }
  }
  else {
    // Klemmen statt vertrauen — die Antwort ist eine Behauptung, und sie geht in
    // eine Spalte, deren Grenzen die des Originals sind.
    const title = post.title ? String(parsed.title ?? '').trim().slice(0, MAX_POST_TITLE) : ''
    const body = String(parsed.body ?? '').trim().slice(0, MAX_POST_BODY)
    if (!body) {
      // Ohne Text gibt es nichts zu zeigen und nichts zu merken. 502 wie überall,
      // wo der Anbieter etwas Unbrauchbares geliefert hat.
      throw createError({ status: 502, statusText: 'AI returned no translation' })
    }
    /**
     * Die Optionen sind das Gegenteil des Textes: hier gilt ALLES ODER NICHTS.
     * `null` (falsche Anzahl, kein Array, ein leeres Element) ist KEIN Fehler
     * nach außen — der Beitrag bleibt übersetzt, nur die Beschriftungen bleiben
     * im Original. Ein 502 wäre die schlechtere Antwort: sie würfe eine
     * brauchbare Übersetzung weg, die schon bezahlt ist.
     */
    const options = pollOptions.length
      ? translatedPollOptions(pollOptions, parsed.options, MAX_POLL_OPTION_LENGTH)
      : null
    entry = { ...(title ? { title } : {}), body, ...(options ? { options } : {}) }
  }

  const translations = serializeUgcTranslations({ ...existing, [locale]: entry })

  /**
   * DEN CACHE SCHREIBEN — FAIL-SOFT, und das ist eine Abwägung, keine
   * Nachlässigkeit: der Mensch hat seine Übersetzung bereits, sie wegen eines
   * misslungenen Schreibvorgangs zu verwerfen wäre der teuerste denkbare
   * Fehler (bezahlt und weggeworfen). Der nächste Klick stellt sie wieder her.
   * Laut geloggt, damit eine fehlende Spalte (Migration nicht gelaufen) nicht
   * still Geld verbrennt.
   */
  await tenantDb(event, { as: 'operator', actor: 'operator' })
    .update(POSTS_TABLE, id, { translations })
    .catch((error: unknown) => {
      console.error('[posts] Übersetzungs-Cache nicht geschrieben:', error)
    })

  return { locale, title: entry.title ?? null, body: entry.body, options: entry.options ?? null, cached: false }
})
