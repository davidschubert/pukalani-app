import { AI_DISABLED_CODE } from '../../../../core/shared/aiProviderRouting'
import { pageTranslateSchema } from '../../../schemas/page'
import { PAGE_TRANSLATE_RUN_SCOPE } from '../../../shared/pageTranslateRun'
import type { PageTranslateRunResponse } from '../../../shared/types/page'
import {
  clearPageTranslateResult,
  pagesRunStore,
  pageTranslateRunSubject,
  runPageTranslation,
} from '../../utils/pageTranslateRun'

/**
 * KI-VORSCHLAG für eine Sprachfassung einer Betreiber-Seite (F60) — advisory,
 * wie der Kategorie-Vorschlag und der Moderations-Assist.
 *
 * DIE ROUTE SPEICHERT NICHTS AN DER SEITE. Der Vorschlag landet im Formular;
 * gespeichert und veröffentlicht wird erst, wenn ein Mensch drückt. Hier ist
 * diese Grenze schärfer als anderswo: unter den Seiten, die ein Betreiber
 * pflegt, sind Impressum, AGB und Datenschutzerklärung — Texte, für die er
 * HAFTET. Eine Maschine, die sie unbemerkt in eine zweite Sprache schreibt,
 * wäre kein Komfort, sondern ein Risiko.
 *
 * ── SEIT LL1 d (2026-11-18): ANTWORTET SOFORT, RECHNET DAHINTER ───────────
 * Ein langer Rechtstext braucht beim Modell länger als die 60 s, die der
 * Webserver wartet (die Route gab ihm 120 s). Der Mensch sah dann einen
 * Fehler, obwohl der bezahlte Lauf gelang, und klickte noch einmal. Jetzt:
 *  1. ZWEI PRODUKT-GATES, nicht eins: `pages` UND `ai` (Begründung wie beim
 *     Kategorie-Vorschlag — dass 'ai' heute den höheren Mindest-Plan trägt,
 *     ist eine KONFIGURATION der App und keine Garantie). Dann das Rollen-Tor
 *     `pages.manage`.
 *  2. Was nichts kostet: Schlüssel da (503), Eingabe gültig (400),
 *     Abschalter an (503 `ai_disabled`) — alles VOR der Sperre, damit ein
 *     Betriebszustand keine Lauf-Zeile hinterlässt. Die Drossel
 *     (`pages:translate`, je Anschluss) liegt in
 *     `core/server/middleware/05.rate-limit.ts` und zählt vor der Route.
 *  3. DIE SPERRE (`acquireRunLease`, Gegenstand = Mandant + Adresse der
 *     Seite): läuft schon eine Übersetzung dieser Seite, kommt 409
 *     `run_running` — ein zweiter Klick startet keinen zweiten Lauf. Ein
 *     Kontingent bucht diese Route nicht; es gibt also nichts, das nach der
 *     Sperre abgelehnt und zurückgenommen werden müsste.
 *  4. Den Vorschlag des Vorgängers leeren (höchstens einer je Seite).
 *  5. `202` mit dem Lauf-Stand; gerechnet wird in `runPageTranslation`
 *     (`server/utils/pageTranslateRun.ts`), die Seite fragt
 *     `GET /api/pages/translate/:slug` ab.
 *
 * DATENSCHUTZ: keine Speicherung beim Anbieter, kein Sammeln, kein Ausweichen
 * und Rechenort Europa setzt seit P17 der Transport selbst
 * (`core/shared/aiProviderRouting.ts`). Der Vorschlag liegt bis zum nächsten
 * Lauf an der Lauf-Zeile (`pages_runs`, ohne Rechte für Konten).
 *
 * DER DECKEL (12.000 Zeichen, `MAX_PAGE_TRANSLATE_BODY`) steht im Schema und
 * damit VOR dem Anbieter: was hier ankommt, ist schon bezahlt, sobald es
 * abgeschickt ist. Begründung der Zahl in `schemas/page.ts`.
 */
export default defineEventHandler(async (event): Promise<PageTranslateRunResponse> => {
  requirePlanProduct(event, 'pages')
  requirePlanProduct(event, 'ai')
  await requireCommunityPermission(event, 'pages.manage')

  if (!await isAiConfigured(event)) {
    // 503 wie beim Kategorie-Vorschlag: das Produkt ist da, der Schlüssel
    // fehlt. Die Oberfläche zeigt den Knopf dann gar nicht erst — dies ist das
    // Netz darunter.
    throw createError({ status: 503, statusText: 'AI assist not configured' })
  }

  const body = await readValidatedBody(event, pageTranslateSchema.parse)

  // Der Abschalter VOR der Sperre: der Transport fragt ihn ohnehin, aber erst
  // hinter der Antwort — dann stünde für einen Betriebszustand ein
  // gescheiterter Lauf an der Zeile statt einer ehrlichen Antwort am Knopf.
  if (!await aiSwitchedOn(event)) {
    throw createError({ status: 503, statusText: 'AI switched off', data: { code: AI_DISABLED_CODE } })
  }

  // Laufzeit-Override vor Build-Default (getEffectiveAiConfig, system-016).
  const aiConfig = await getEffectiveAiConfig(event)

  // (3) DIE SPERRE. Fehlt die Lauf-Tabelle (Instanz ohne pages-007) oder ist
  // sie nicht lesbar, antwortet `acquireRunLease` 503 `run_lease_unavailable`
  // — nie ein Start ohne Sperre.
  const store = pagesRunStore(event)
  const { lease, previous } = await acquireRunLease(store, {
    scope: PAGE_TRANSLATE_RUN_SCOPE,
    subject: pageTranslateRunSubject(tenantCacheScope(event), body.slug),
    detail: { locale: body.locale, model: aiConfig.model, paid: false },
  })

  // (4) Nur der Gewinner sieht diesen Vorgänger — also leert auch nur einer.
  // `previous` kommt aus `pagesRunStore` und trägt `result`.
  if (previous) await clearPageTranslateResult(event, body.slug, previous)

  // (5) Der Lauf BEGINNT hinter der Antwort.
  runDetached('pages-translate', () => runPageTranslation(event, {
    store,
    lease,
    locale: body.locale,
    title: body.title,
    body: body.body,
    model: aiConfig.model,
  }))

  setResponseStatus(event, 202)
  return {
    run: {
      state: 'running',
      startedAt: lease.startedAt,
      finishedAt: '',
      failure: '',
      locale: body.locale,
      result: null,
    },
  }
})
