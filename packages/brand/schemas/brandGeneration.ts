import { z } from 'zod'
import { BRAND_UI_LOCALES } from '../shared/brandUiLocale'

/**
 * DER RUMPF EINER GENERIERUNG (§3e „Streaming-Protokoll").
 *
 * Vier Felder: WELCHER Slot, ein optionaler HINWEIS des Menschen, der
 * Idempotenzschlüssel — und seit dem Walkthrough vom 2026-09-02 die Sprache
 * der SEITE, auf der der Mensch steht.
 *
 * ── WARUM DIE UI-SPRACHE IM RUMPF STEHT UND NICHT IM COOKIE ───────────────
 * Der Server kann sie auf `/api/**` nicht ableiten (dort steht kein
 * Locale-Präfix), und das Cookie `i18n_redirected` beantwortet eine andere
 * Frage: was der Mensch einmal GEWÄHLT hat, nicht was er gerade OFFEN hat.
 * Genau diese Lücke war Davids Befund — englische Oberfläche, deutscher
 * George. Der Browser weiss es sicher, also sagt er es. Begründung und
 * Rückfall: `shared/brandUiLocale.ts`.
 *
 * ── WARUM DER HINWEIS BEI 500 ZEICHEN ENDET ───────────────────────────────
 * Er ist die Nachjustierung („wärmer", „kürzer", „weniger Agentur-Sprech"),
 * nicht der Inhalt — der steht in den Slots. Ohne Deckel wäre er der bequemste
 * Weg, beliebigen Fremdtext in den Prompt zu schieben, und die
 * Prompt-Injection-Grenze (Plan §6) hätte ein Loch in Nutzergrösse.
 *
 * ── WAS HIER BEWUSST NICHT STEHT ──────────────────────────────────────────
 * Kein `model`, kein `temperature`, kein `promptVersion`. Die Override-Kette
 * ist Serversache (Plan §6: `app_config.aiModel > pukalani.brand.ai >
 * pukalani.ai`); ein Modell aus dem Client wäre ein Kostenhebel für jeden
 * angemeldeten Beta-Nutzer.
 *
 * Auch KEINE `revision`: anders als der Autosave überschreibt eine Generierung
 * nichts, was der Mensch gerade tippt — sie legt einen ENTWURF daneben und
 * erhöht die revision selbst. Der Client bekommt die neue Fassung im
 * `generation.completed`-Frame und zieht nach.
 */
export function createBrandGenerateSchema() {
  return z.object({
    slotId: z.string().min(1).max(64),
    hint: z.string().max(500).optional(),
    idempotencyKey: z.string().min(1).max(128).optional(),
    // OPTIONAL, nicht Pflicht: ein Client von vor dieser Änderung soll nicht
    // 400 kassieren, sondern Georges Rahmung in der Inhaltssprache bekommen —
    // das bisherige Verhalten ohne Cookie. Eine unbekannte Sprache wird hier
    // abgewiesen statt still übernommen: sie landete sonst wörtlich im
    // System-Prompt.
    uiLocale: z.enum(BRAND_UI_LOCALES).optional(),
  }).strict()
}

export type BrandGenerateBody = z.infer<ReturnType<typeof createBrandGenerateSchema>>
