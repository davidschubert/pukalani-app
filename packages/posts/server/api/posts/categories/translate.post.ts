import { AI_JSON_QUOTE_RULE } from '../../../../../core/shared/aiJson'
import { categoryTranslateSchema } from '../../../../schemas/postCategory'
import { MAX_CATEGORY_DESCRIPTION, MAX_CATEGORY_NAME, type CategoryTranslateResponse } from '../../../../shared/types/post'

/**
 * KI-VORSCHLAG für eine Kategorie-Übersetzung — advisory, wie der
 * Moderations-Assist.
 *
 * DIE ROUTE SPEICHERT NICHTS. Sie gibt einen Vorschlag zurück, der im Formular
 * landet; gespeichert wird er erst, wenn ein Mensch auf „Speichern" drückt.
 * Das ist dieselbe Grenze wie bei `[id]/assist.post.ts` („die KI ändert
 * NICHTS") und hier besonders wichtig: ein Kategorie-Name ist die Beschriftung
 * einer Adresse, die tausende Leute lesen — er gehört niemandem sonst als dem,
 * der die Community führt.
 *
 * ZWEI PRODUKT-GATES, nicht eins: `posts` UND `ai`. Wort für Wort die
 * Begründung des Moderations-Assists — dass 'ai' heute den höheren
 * Mindest-Plan trägt, ist eine KONFIGURATION der App und keine Garantie.
 *
 * WARUM DER TEXT AUS DEM BODY KOMMT und nicht aus der Datenbank: sonst ließe
 * sich nur übersetzen, was schon gespeichert ist — beim ANLEGEN einer
 * Kategorie käme der Vorschlag also immer zu spät. Der Text ist ohnehin
 * derselbe, den dieselbe Person eine Sekunde später speichern darf.
 */
function buildPrompt(name: string, description: string, locale: string): string {
  return [
    'Du übersetzt die Beschriftung einer Kategorie in einem Community-Forum.',
    '',
    `Zielsprache (BCP-47-Code): ${locale}`,
    '',
    'Name:',
    '"""',
    name,
    '"""',
    ...(description
      ? ['', 'Beschreibung:', '"""', description, '"""']
      : []),
    '',
    'Regeln:',
    `- Der Name bleibt kurz (höchstens ${MAX_CATEGORY_NAME} Zeichen), wie eine Menü-Beschriftung, ohne Satzzeichen am Ende.`,
    '- Eigennamen, Produktnamen und Fachbegriffe, die auch im Zielland unübersetzt benutzt werden, bleiben stehen (z. B. „GSAP“, „Nuxt“).',
    '- Ist der Text schon in der Zielsprache, gib ihn unverändert zurück.',
    `- Die Beschreibung bleibt ein Satz und höchstens ${MAX_CATEGORY_DESCRIPTION} Zeichen. Gibt es keine, gib "" zurück.`,
    '- Keine Erklärungen, keine Alternativen, keine Anführungszeichen um die Werte.',
    '',
    // Die Vorsorge VOR dem bezahlten Aufruf (AI2, `core/shared/aiJson.ts`):
    // ein gerades `"` im Fliesstext beendet den JSON-String. Die Rettung
    // DANACH ist `parseModelJson`, durch die dieser Aufruf ohnehin läuft.
    AI_JSON_QUOTE_RULE,
    '',
    'Antworte NUR mit einem JSON-Objekt (kein Markdown, keine Erklärung außenrum):',
    '{',
    '  "name": "<der übersetzte Name>",',
    '  "description": "<die übersetzte Beschreibung oder \\"\\">"',
    '}',
  ].join('\n')
}

export default defineEventHandler(async (event): Promise<CategoryTranslateResponse> => {
  requirePlanProduct(event, 'posts')
  requirePlanProduct(event, 'ai')
  await requireCommunityPermission(event, 'posts.manage')

  if (!await isAiConfigured(event)) {
    // 503 wie beim Moderations-Assist: das Produkt ist da, der Schlüssel fehlt.
    // Die Oberfläche zeigt den Knopf dann gar nicht erst an — dies ist das Netz.
    throw createError({ status: 503, statusText: 'AI assist not configured' })
  }

  const body = await readValidatedBody(event, categoryTranslateSchema.parse)

  // Laufzeit-Override vor Build-Default (getEffectiveAiConfig, system-016).
  const aiConfig = await getEffectiveAiConfig(event)
  const parsed = await aiCompleteJson<{ name?: unknown, description?: unknown }>(
    event,
    buildPrompt(body.name, body.description, body.locale),
    { model: aiConfig.model, maxTokens: 300, label: 'posts' },
  )

  // Klemmen statt vertrauen — die Antwort ist eine Behauptung, und sie geht in
  // ein Formular, dessen Schema dieselben Grenzen kennt. Käme hier ein zu
  // langer Name an, scheiterte erst das Speichern — mit einem Fehler, für den
  // der Mensch nichts kann.
  const name = String(parsed.name ?? '').trim().slice(0, MAX_CATEGORY_NAME)
  return {
    locale: body.locale,
    // Leer heißt „kein Vorschlag": die Oberfläche lässt das Feld dann in Ruhe,
    // statt einen leeren Namen hineinzuschreiben.
    name,
    description: String(parsed.description ?? '').trim().slice(0, MAX_CATEGORY_DESCRIPTION),
    model: aiConfig.model,
  }
})
