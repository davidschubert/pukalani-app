import { z } from 'zod'
import { INSIGHTS_FORMATS, INSIGHTS_LOCALES } from '../../shared/insightsPost'

/**
 * DIE FORMULAR-SCHEMAS DER REDAKTION (BI1 I2).
 *
 * ── WARUM `create*Schema(t)`-FABRIKEN UND KEINE KONSTANTEN ───────────────
 * Ein Fehlertext ist ein User-facing String und gehört damit in den
 * i18n-Katalog (CLAUDE.md). Ein Schema als Konstante könnte ihn nur einmal
 * beim Modul-Laden auflösen — also in der Sprache, die zufällig gerade galt.
 * Die Fabrik nimmt `t` entgegen und wird dort gebaut, wo die Sprache bekannt
 * ist. Dasselbe Muster wie überall im Repo.
 *
 * ── WARUM SIE IN `app/utils` LIEGEN UND NICHT IN `shared/` ───────────────
 * Sie sind OBERFLÄCHE: sie prüfen, was ein Dialog abfragt, und tragen
 * übersetzte Texte. Der VERTRAG (was ein Beitrag ist, was eine Quelle
 * mitbringen muss) steht in `shared/insightsPost.ts` und wird vom SERVER
 * durchgesetzt — diese Schemas ersetzen ihn nicht, sie fangen den Tippfehler
 * vor dem Absenden.
 */

/** Der Anlege-Dialog: drei Angaben, mehr fragt `POST /api/insights/posts` nicht. */
export function createInsightsNewPostSchema(t: (key: string) => string) {
  return z.object({
    format: z.enum(INSIGHTS_FORMATS),
    baseLocale: z.enum(INSIGHTS_LOCALES),
    title: z.string().trim().min(1, t('insights.editor.newPostTitleRequired')).max(200),
  })
}

export type InsightsNewPostForm = z.infer<ReturnType<typeof createInsightsNewPostSchema>>

/**
 * Die Marken-Schnellanlage im Editor. Sie gibt es, weil Prüfregel 6 sonst
 * unerfüllbar wäre („jede genannte Marke hat eine Zeile") — nicht, weil der
 * Editor die Marken-Pflege ersetzen soll.
 */
export function createInsightsBrandSchema(t: (key: string) => string) {
  return z.object({
    name: z.string().trim().min(1, t('insights.editor.brandNameRequired')).max(200),
    homepage: z.union([z.url(t('insights.editor.brandHomepageInvalid')).max(512), z.literal('')]).default(''),
    industry: z.string().trim().max(40).default(''),
  })
}

export type InsightsBrandForm = z.infer<ReturnType<typeof createInsightsBrandSchema>>
