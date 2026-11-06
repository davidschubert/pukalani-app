import { MAX_PAGE_TITLE, MAX_PAGE_TRANSLATE_BODY, pageTranslateSchema } from '../../../schemas/page'
import type { PageTranslateResponse } from '../../../shared/types/page'

/**
 * KI-VORSCHLAG für eine Sprachfassung einer Betreiber-Seite (F60) — advisory,
 * wie der Kategorie-Vorschlag und der Moderations-Assist.
 *
 * DIE ROUTE SPEICHERT NICHTS. Sie gibt Titel und Text zurück, die im Formular
 * landen; gespeichert und veröffentlicht wird erst, wenn ein Mensch drückt.
 * Hier ist diese Grenze schärfer als anderswo: unter den Seiten, die ein
 * Betreiber pflegt, sind Impressum, AGB und Datenschutzerklärung — Texte, für
 * die er HAFTET. Eine Maschine, die sie unbemerkt in eine zweite Sprache
 * schreibt, wäre kein Komfort, sondern ein Risiko.
 *
 * ZWEI PRODUKT-GATES, nicht eins: `pages` UND `ai`. Wort für Wort die
 * Begründung des Kategorie-Vorschlags — dass 'ai' heute den höheren
 * Mindest-Plan trägt, ist eine KONFIGURATION der App und keine Garantie.
 *
 * ZDR, ANDERS ALS BEI DEN KATEGORIEN: dort geht eine Menü-Beschriftung an den
 * Anbieter, hier ein Rechtstext. Deshalb fail-closed — nur Anbieter mit
 * Zero-Data-Retention, kein Sammeln fürs Training, KEIN Ausweichen. Findet
 * sich keiner, ist „gerade nicht verfügbar" die richtige Antwort; ein stiller
 * Ausweich auf einen Anbieter ohne ZDR wäre eine Zusage, die wir dem Kunden
 * nicht halten.
 *
 * DER DECKEL (12.000 Zeichen, `MAX_PAGE_TRANSLATE_BODY`) steht im Schema und
 * damit VOR dem Anbieter: was hier ankommt, ist schon bezahlt, sobald es
 * abgeschickt ist. Begründung der Zahl in `schemas/page.ts`.
 *
 * Die Drossel liegt in `core/server/middleware/05.rate-limit.ts`
 * (`pages:translate`, je IP, vor der Arbeit) — hier steht keine zweite.
 */
const PROVIDER_ROUTING = { zdr: true, dataCollection: 'deny', allowFallbacks: false } as const

function buildPrompt(title: string, body: string, locale: string): string {
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
    'Antworte NUR mit einem JSON-Objekt (kein Markdown-Zaun, keine Erklärung außenrum):',
    '{',
    '  "title": "<der übersetzte Titel>",',
    '  "body": "<der übersetzte Inhalt als Markdown>"',
    '}',
  ].join('\n')
}

export default defineEventHandler(async (event): Promise<PageTranslateResponse> => {
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

  // Laufzeit-Override vor Build-Default (getEffectiveAiConfig, system-016).
  const aiConfig = await getEffectiveAiConfig(event)
  const parsed = await aiCompleteJson<{ title?: unknown, body?: unknown }>(
    event,
    buildPrompt(body.title, body.body, body.locale),
    {
      model: aiConfig.model,
      providerRouting: { ...PROVIDER_ROUTING },
      label: 'pages',
      /**
       * Ein Rechtstext ist lang. Der Vorgabewert schnitte die zweite Fassung
       * mitten im Satz ab, und das sähe für den Betreiber wie ein Modellfehler
       * aus. 12.000 Zeichen sind grob 4.000 Tokens Eingabe; die Antwort darf
       * auch in einer wortreicheren Sprache herauskommen.
       */
      maxTokens: 8000,
      temperature: 0.2,
      // Ein langer Text braucht länger als die Vorgabe — der Knopf wartet.
      timeoutMs: 120_000,
    },
  )

  // Klemmen statt vertrauen: die Antwort ist eine Behauptung, und sie geht in
  // ein Formular, dessen Schema dieselben Grenzen kennt. Käme hier ein zu
  // langer Titel an, scheiterte erst das Speichern — mit einem Fehler, für den
  // der Mensch nichts kann.
  return {
    locale: body.locale,
    // Leer heißt „kein Vorschlag": die Oberfläche lässt das Feld dann in Ruhe,
    // statt zu löschen, was jemand von Hand geschrieben hat.
    title: String(parsed.title ?? '').trim().slice(0, MAX_PAGE_TITLE),
    body: String(parsed.body ?? '').trim().slice(0, MAX_PAGE_TRANSLATE_BODY),
    model: aiConfig.model,
  }
})
