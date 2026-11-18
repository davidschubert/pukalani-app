import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import { AppwriteException, Query, type Models } from 'node-appwrite'
import { AI_JSON_QUOTE_RULE } from '../../../core/shared/aiJson'
import { AI_DISABLED_CODE, AI_ENDPOINT_UNAVAILABLE_CODE } from '../../../core/shared/aiProviderRouting'
import type { RunLeaseCreateData, RunLeaseRow, RunLeaseStore, RunLeaseUpdateData } from '../../../core/server/utils/runLease'
import { clampRunLeaseDetail, RUN_LEASE_OUTCOME_MAX } from '../../../core/shared/runLease'
import { MAX_PAGE_TITLE } from '../../schemas/page'
import {
  clampPageTranslateSuggestion,
  noPageTranslateRunView,
  PAGE_TRANSLATE_RUN_OUTCOMES,
  PAGE_TRANSLATE_RUN_SCOPE,
  type PageTranslateRunDetail,
  toPageTranslateRunView,
} from '../../shared/pageTranslateRun'
import { PAGES_RUNS_TABLE, type PageTranslateRunView } from '../../shared/types/page'

/**
 * DIE ÜBERSETZUNG EINER SEITE HINTER DER ANTWORT (LL1 d, 2026-11-18) — die
 * Arbeit, die bis dahin in `POST /api/pages/translate` selbst stand. Warum,
 * und was an der Lauf-Zeile steht: Kopf von `shared/pageTranslateRun.ts`.
 *
 * ── DURCH DIE DATENTÜR ───────────────────────────────────────────────────
 * `pages` ist ein gepoolter Layer: die Lauf-Tabelle trägt `communityId` wie
 * `pages` selbst, und jeder Zugriff geht über `tenantDb` mit der
 * Operator-Klinke (die Tabelle hat keine Rechte, die Zeilen auch nicht —
 * gelesen und geschrieben wird nur vom Server). Die Tür hängt an jede Liste
 * den Mandanten-Filter und belegt vor jedem Ändern die Zugehörigkeit; mit der
 * Operator-Klinke ist sie die EINZIGE Grenze, deshalb fragt die Route vorher
 * das Rollen-Tor `pages.manage`.
 *
 * ── DER GEGENSTAND DER SPERRE ────────────────────────────────────────────
 * Ein Hash aus Mandant UND Adresse der Seite. Die Zeilen-Id der Sperre rechnet
 * sich aus (Art, Gegenstand, Nummer) — mit der Adresse allein bekämen zwei
 * Communities für ihr `imprint` dieselbe Id, und die zweite stünde vor einem
 * 409 für einen Lauf, den es bei ihr gar nicht gibt. EIN Lauf je Seite, egal
 * in welche Sprache: der Editor zeigt einen Reiter zur Zeit, und nach dem
 * Neuladen gibt es so genau einen Lauf, den die Seite wieder aufnimmt.
 *
 * ── `event` NUR LESEND ───────────────────────────────────────────────────
 * Runtime-Config, Admin-Client, Mandant im Kontext — kein `setHeader`, kein
 * `createError` als Ergebnis: die Antwort ist längst gesendet.
 */

type PagesRunAppwriteRow = Models.Row & {
  scope?: string | null
  subject?: string | null
  seq?: number | null
  startedAt?: string | null
  heartbeatAt?: string | null
  finishedAt?: string | null
  outcome?: string | null
  detail?: string | null
  result?: string | null
}

/** Eine Lauf-Zeile mit dem abgelegten Vorschlag. */
export interface PagesRunRow extends RunLeaseRow {
  result: string
}

/** Der Store der Lauf-Sperre über `pages_runs` — mit dem Feld `result` dazu. */
export interface PagesRunStore extends RunLeaseStore {
  latest(scope: string, subject: string): Promise<PagesRunRow | null>
  /** Die Zeilen je (scope, subject), jüngste zuerst — höchstens `PAGES_RUNS_LIST_MAX`. */
  listFor(scope: string, subject: string): Promise<PagesRunRow[]>
  update(id: string, data: RunLeaseUpdateData & { result?: string }): Promise<RunLeaseRow>
}

function toPagesRunRow(row: PagesRunAppwriteRow): PagesRunRow {
  return {
    $id: row.$id,
    scope: row.scope ?? '',
    subject: row.subject ?? '',
    seq: typeof row.seq === 'number' ? row.seq : 0,
    startedAt: row.startedAt ?? '',
    heartbeatAt: row.heartbeatAt ?? '',
    finishedAt: row.finishedAt ?? '',
    outcome: row.outcome ?? '',
    detail: row.detail ?? '',
    result: row.result ?? '',
  }
}

/**
 * Wie viele Lauf-Zeilen einer Seite das Leeren beim Löschen ansieht. Eine
 * Seite sammelt eine Zeile je Klick auf „Übersetzen"; hundert sind weit über
 * dem Alltag, und ein Vorschlag steht ohnehin nur an der jüngsten.
 */
export const PAGES_RUNS_LIST_MAX = 100

/** Die Tür für die Lauf-Tabelle — fest die Operator-Klinke (SEC-002). */
function pagesRunDb(event: H3Event) {
  return tenantDb(event, { as: 'operator' })
}

export function pagesRunStore(event: H3Event): PagesRunStore {
  const db = pagesRunDb(event)
  return {
    async latest(scope, subject) {
      const { rows } = await db.list<PagesRunAppwriteRow>(PAGES_RUNS_TABLE, [
        Query.equal('scope', scope),
        Query.equal('subject', subject),
        Query.orderDesc('seq'),
        Query.limit(1),
      ])
      return rows[0] ? toPagesRunRow(rows[0]) : null
    },
    async listFor(scope, subject) {
      const { rows } = await db.list<PagesRunAppwriteRow>(PAGES_RUNS_TABLE, [
        Query.equal('scope', scope),
        Query.equal('subject', subject),
        Query.orderDesc('seq'),
        Query.limit(PAGES_RUNS_LIST_MAX),
      ])
      return rows.map(toPagesRunRow)
    },
    async create(id: string, data: RunLeaseCreateData) {
      // `permissions: []`: KEIN Recht für irgendein Konto, auch kein Lesen —
      // der Vorschlag kommt nur über die lesende Route hinaus.
      const row = await db.create<PagesRunAppwriteRow>(PAGES_RUNS_TABLE, { ...data }, { rowId: id, permissions: [] })
      return toPagesRunRow(row)
    },
    async update(id, data) {
      return toPagesRunRow(await db.update<PagesRunAppwriteRow>(PAGES_RUNS_TABLE, id, { ...data }))
    },
    async remove(id) {
      await db.remove(PAGES_RUNS_TABLE, id)
    },
    isConflict(error) {
      return error instanceof AppwriteException && error.code === 409
    },
  }
}

/** Der Gegenstand der Sperre (s. Kopf): `p` + 40 Hex-Zeichen = 41 von 64. */
export function pageTranslateRunSubject(tenantScope: string, slug: string): string {
  return `p${createHash('sha256').update(`${tenantScope}|${slug}`).digest('hex').slice(0, 40)}`
}

/** Fehlt die Tabelle oder die Zeile? (Appwrite `code`, h3 `statusCode`) */
function isMissing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const value = error as { code?: unknown, statusCode?: unknown, status?: unknown }
  return value.code === 404 || value.statusCode === 404 || value.status === 404
}

/**
 * DEN LAUF-STAND EINER SEITE LESEN — fail-soft: eine nicht lesbare
 * Lauf-Tabelle (Instanz ohne pages-007) heisst „kein Lauf". Die Seite bleibt
 * bearbeitbar; nur ein Start antwortet dort 503.
 */
export async function readPageTranslateRun(event: H3Event, slug: string): Promise<PageTranslateRunView> {
  try {
    const latest = await pagesRunStore(event)
      .latest(PAGE_TRANSLATE_RUN_SCOPE, pageTranslateRunSubject(tenantCacheScope(event), slug))
    return toPageTranslateRunView(latest, Date.now())
  }
  catch (error) {
    if (!isMissing(error)) {
      logEvent('warn', 'pages.translate_run_unreadable', {
        message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
      })
    }
    return noPageTranslateRunView()
  }
}

/**
 * DEN VORSCHLAG LEEREN — beim nächsten Start derselben Seite (nur am
 * Vorgänger: jeder Start leert den seinen, also trägt höchstens die jüngste
 * Zeile einen) und beim Löschen der Seite (an ALLEN Zeilen der Seite, falls
 * eine Zeile doch einmal am Start vorbei entstand). So steht je Seite
 * höchstens EIN Vorschlag in der Tabelle, ohne Aufräum-Lauf. Wirft nie: ein
 * stehengebliebener Vorschlag ist kein Grund, den neuen Lauf oder das Löschen
 * scheitern zu lassen (er wird nach einer Stunde ohnehin nicht mehr
 * ausgeliefert).
 */
export async function clearPageTranslateResult(
  event: H3Event,
  slug: string,
  previous?: { $id: string, result?: string } | null,
): Promise<void> {
  try {
    const store = pagesRunStore(event)
    const rows = previous !== undefined
      ? (previous ? [previous] : [])
      : await store.listFor(PAGE_TRANSLATE_RUN_SCOPE, pageTranslateRunSubject(tenantCacheScope(event), slug))
    for (const row of rows) {
      if (row.result) await store.update(row.$id, { result: '' })
    }
  }
  catch (error) {
    if (isMissing(error)) return
    logEvent('warn', 'pages.translate_result_uncleared', {
      message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    })
  }
}

/** Der Auftrag an das Modell — wortgleich der, der bis LL1 d in der Route stand. */
export function buildPageTranslatePrompt(title: string, body: string, locale: string): string {
  return [
    'Du übersetzt eine Inhaltsseite (z. B. Impressum, Nutzungsbedingungen, Datenschutzerklärung, Über-uns-Seite) einer Online-Community.',
    '',
    `Zielsprache (BCP-47-Code): ${locale}`,
    '',
    'Titel:',
    '"""',
    title,
    '"""',
    '',
    'Inhalt (Markdown):',
    '"""',
    body,
    '"""',
    '',
    'Regeln:',
    '- Übersetze VOLLSTÄNDIG. Lass nichts weg, fasse nichts zusammen, ergänze nichts.',
    '- Die Markdown-Struktur bleibt Zeichen für Zeichen erhalten: Überschriften, Listen, Links, Zitate, Codeblöcke, Absätze und deren Reihenfolge.',
    '- Eigennamen, Firmennamen, Produktnamen, Adressen, Registernummern, E-Mail-Adressen und URLs bleiben unverändert stehen.',
    '- Rechtsbegriffe werden mit dem im Zielland üblichen Begriff übersetzt; gibt es keinen, bleibt der Originalbegriff stehen und du fügst nichts hinzu.',
    '- Platzhalter in eckigen Klammern (z. B. [AUSFÜLLEN: …]) bleiben Platzhalter und werden mit übersetzt, nicht ausgefüllt.',
    '- Ist der Text schon in der Zielsprache, gib ihn unverändert zurück.',
    `- Der Titel bleibt kurz (höchstens ${MAX_PAGE_TITLE} Zeichen) und ohne Satzzeichen am Ende.`,
    '- Keine Erklärungen, keine Alternativen, keine Anmerkungen zur Übersetzung.',
    '',
    // Die Vorsorge VOR dem bezahlten Aufruf (AI2, `core/shared/aiJson.ts`):
    // ein gerades `"` im Fliesstext beendet den JSON-String. Die Rettung
    // DANACH ist `parseModelJson`, durch die dieser Aufruf ohnehin läuft.
    AI_JSON_QUOTE_RULE,
    '',
    'Antworte NUR mit einem JSON-Objekt (kein Markdown-Zaun, keine Erklärung außenrum):',
    '{',
    '  "title": "<der übersetzte Titel>",',
    '  "body": "<der übersetzte Inhalt als Markdown>"',
    '}',
  ].join('\n')
}

/**
 * Die Frist des einen Modell-Aufrufs. Sie gilt HINTER der Antwort und damit
 * nicht mehr gegen die 60 s des Webservers — nur noch gegen ein Modell, das
 * gar nicht antwortet.
 */
export const PAGE_TRANSLATE_AI_TIMEOUT_MS = 120_000

/** Der `paid`-Vermerk liess sich nicht schreiben — ohne ihn kein Modell-Aufruf. */
class PageTranslateLeaseUnwritable extends Error {}

function outcomeOf(error: unknown): string {
  if (error instanceof PageTranslateLeaseUnwritable) return PAGE_TRANSLATE_RUN_OUTCOMES.leaseUnwritable
  const code = (error as { data?: { code?: unknown } } | null)?.data?.code
  if (code === AI_ENDPOINT_UNAVAILABLE_CODE) return PAGE_TRANSLATE_RUN_OUTCOMES.aiEndpointUnavailable
  if (code === AI_DISABLED_CODE) return PAGE_TRANSLATE_RUN_OUTCOMES.aiDisabled
  return PAGE_TRANSLATE_RUN_OUTCOMES.failed
}

export interface PageTranslateRunInput {
  store: PagesRunStore
  lease: Pick<RunLeaseRow, '$id'>
  locale: string
  title: string
  body: string
  model: string
}

/**
 * Den Vorschlag rechnen und an die EIGENE Lauf-Zeile legen. Wirft nie: jeder
 * Ausgang steht an der Zeile (`done` oder ein kurzes Wort). Schreibt auch das
 * Ende nicht mehr, bleibt der Herzschlag stehen, und die Zeile wird nach der
 * Frist `stalled` — die Seite sagt dann „abgebrochen".
 *
 * Er schreibt NIE in die Seiten-Zeile: gespeichert wird erst, wenn ein Mensch
 * drückt — dazwischen kann er im Formular weitergetippt haben.
 */
export async function runPageTranslation(event: H3Event, input: PageTranslateRunInput): Promise<void> {
  const startedAtMs = Date.now()
  const alive = keepRunLeaseAlive(input.store, input.lease)
  const detail: PageTranslateRunDetail = { locale: input.locale, model: input.model, paid: false }
  let outcome: string = PAGE_TRANSLATE_RUN_OUTCOMES.done
  let result = ''

  try {
    if (alive.lost()) {
      outcome = PAGE_TRANSLATE_RUN_OUTCOMES.leaseLost
    }
    else {
      // AB HIER KOSTET ES — der Vermerk steht VOR dem Aufruf; ohne ihn kein
      // Aufruf. Ein Kontingent bucht diese Route nicht (die Drossel
      // `pages:translate` zählt je Anschluss vor der Route); der Vermerk sagt
      // dem Alarm und der Diagnose trotzdem, ob ein abgebrochener Lauf schon
      // beim Anbieter war.
      detail.paid = true
      try {
        await touchRunLease(input.store, input.lease, { detail })
      }
      catch {
        throw new PageTranslateLeaseUnwritable()
      }

      const parsed = await aiCompleteJson<{ title?: unknown, body?: unknown }>(
        event,
        buildPageTranslatePrompt(input.title, input.body, input.locale),
        {
          model: input.model,
          label: 'pages',
          /**
           * Ein Rechtstext ist lang. Der Vorgabewert schnitte die zweite Fassung
           * mitten im Satz ab, und das sähe für den Betreiber wie ein Modellfehler
           * aus. 12.000 Zeichen sind grob 4.000 Tokens Eingabe; die Antwort darf
           * auch in einer wortreicheren Sprache herauskommen.
           */
          maxTokens: 8000,
          temperature: 0.2,
          timeoutMs: PAGE_TRANSLATE_AI_TIMEOUT_MS,
        },
      )
      const suggestion = clampPageTranslateSuggestion(parsed)
      if (!suggestion.title && !suggestion.body) outcome = PAGE_TRANSLATE_RUN_OUTCOMES.empty
      else result = JSON.stringify(suggestion)
    }
  }
  catch (error) {
    outcome = outcomeOf(error)
    // Nur die Art, nie Inhalt: eine Anbieter-Meldung kann fremden Text tragen.
    logEvent('warn', 'pages.translate_run_failed', {
      code: outcome,
      status: typeof (error as { statusCode?: unknown })?.statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 0,
    })
  }
  finally {
    alive.stop()
  }

  // Vorschlag und Ende in EINEM Schreibvorgang: ein „fertig" ohne Vorschlag
  // (oder ein Vorschlag an einem Lauf, der noch „läuft") gibt es so nicht.
  const at = new Date().toISOString()
  try {
    await input.store.update(input.lease.$id, {
      finishedAt: at,
      heartbeatAt: at,
      outcome: outcome.slice(0, RUN_LEASE_OUTCOME_MAX),
      detail: clampRunLeaseDetail(detail),
      ...(result ? { result } : {}),
    })
  }
  catch (error) {
    logEvent('warn', 'pages.translate_run_finish_unwritten', {
      code: outcome,
      message: error instanceof Error ? error.message.slice(0, 120) : 'unknown',
    })
  }
  logEvent('info', 'pages.translate_run_finished', {
    code: outcome,
    ms: Date.now() - startedAtMs,
    paid: detail.paid,
    chars: input.body.length,
  })
}
