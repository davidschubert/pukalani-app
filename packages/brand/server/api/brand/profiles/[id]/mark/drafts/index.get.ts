import { BRAND_MARK_DRAFTS_MAX } from '../../../../../../../shared/brandMarkDrafts'
import type { BrandMarkDraftsIndexResponse } from '../../../../../../../shared/types/brand'
import { requireBrandMarkContext } from '../../../../../../utils/brandMarkBrief'
import { BRAND_RUN_SCOPES } from '../../../../../../../shared/brandRun'
import { listBrandMarkDrafts } from '../../../../../../utils/brandMarkDrafts'
import { readBrandRunView } from '../../../../../../utils/brandRun'

/**
 * DIE ENTWÜRFE EINER MARKE LESEN (Paket D5c).
 *
 * Dieselben drei Schranken wie an jeder anderen Route dieser Fläche
 * (`requireBrandMarkContext`): Zugang, Besitz der Marke, Kapitel auf dem Weg.
 * Alle antworten mit 404 — es gibt hier keine Seite, die etwas erklären würde,
 * also gibt es auch nichts zu verraten.
 *
 * OHNE BILD-MODELL ANTWORTET SIE TROTZDEM 200 mit dem, was da liegt: die
 * Entwürfe von gestern verschwinden nicht, weil der Betreiber heute das Modell
 * ausgetragen hat. Das 503 gehört dem LAUF, nicht der Liste.
 *
 * ── DAS BILDMODELL STEHT MIT DRIN (Davids Entscheidung 2026-11-13) ───────
 * Die Werkstatt nennt es VOR dem Knopf. Gemeint ist das Modell, das ein Lauf
 * auf dieser Instanz WIRKLICH riefe (`getEffectiveAiImageConfig`, inklusive
 * Laufzeit-Override) — bewusst unabhängig vom Dev-Ersatz: der Hinweis ist
 * eine Auskunft über das Produkt, nicht über die Beweis-Umgebung. Kein
 * Bildmodell eingetragen ⇒ leer, und der Hinweis erscheint nicht.
 *
 * ── DER LAUF-STAND STEHT MIT DRIN (LL1 b, 2026-11-17) ────────────────────
 * Ein Lauf rechnet hinter der Antwort seines Starts. Die Werkstatt fragt
 * diese Route ab, solange `run.state` `running` ist, und liest hier Liste
 * UND Ausgang in einem Zug — so passt, was sie zeigt, immer zusammen. Der
 * Stand ist fail-soft: fehlt die Lauf-Tabelle, heisst er „kein Lauf".
 */
export default defineEventHandler(async (event): Promise<BrandMarkDraftsIndexResponse> => {
  const { userId, betaAccount } = await requireBrandAccess(event)
  const { profile } = await requireBrandMarkContext(event, userId, betaAccount)
  // DER LAUF-STAND ZUERST, die Liste danach: endet der Lauf zwischen den zwei
  // Lesevorgängen, zeigt die Antwort „läuft noch" mit schon vollständiger
  // Liste (die nächste Abfrage zieht den Stand nach) — nie „fertig" mit einer
  // Liste von vorher.
  const run = await readBrandRunView(event, BRAND_RUN_SCOPES.drafts, profile.$id)
  const [items, imageConfig] = await Promise.all([
    listBrandMarkDrafts(event, profile.$id),
    getEffectiveAiImageConfig(event),
  ])
  return {
    items,
    max: BRAND_MARK_DRAFTS_MAX,
    imageModel: imageConfig.enabled ? imageConfig.model : '',
    run,
  }
})
