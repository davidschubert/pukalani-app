import { z } from 'zod'

/**
 * THEME-EINSTELLUNGEN STÜCKWEISE ÄNDERN (BP1 d, 2026-11-17) — pure Regel für
 * `PATCH /api/admin/themes/settings` (Spalte `app_config.themeSettings`).
 * Die Route führt sie in der Kette von `mutateAppConfig()` gegen den frisch
 * gelesenen Stand aus.
 */

const builtinOverrideSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  hidden: z.boolean().optional(),
  order: z.number().int().min(0).max(100).optional(),
}).strict()

/**
 * Der Body nennt NUR, was dieser Klick ändert (BP1 d, 2026-11-17):
 *   · ein genannter Schlüssel der obersten Ebene ersetzt seinen Wert,
 *     `null` heißt „keiner" (Default zurück auf die Voreinstellung bzw.
 *     „keine Variante"); ein fehlender Schlüssel bleibt, wie er ist;
 *   · `builtins` wird JE EINTRAG ersetzt: ein genannter Built-in bekommt
 *     genau diesen Eintrag (`{}` = keine Abweichung, der Eintrag fällt weg),
 *     nicht genannte bleiben.
 * Vorher ersetzte der Body die ganze Spalte — zwei Betreiber im selben
 * Augenblick überschrieben einander.
 */
export const themeSettingsPatchSchema = z.object({
  defaultThemeId: z.string().max(64).nullable().optional(),
  defaultVariantId: z.string().regex(/^[a-z0-9-]{1,24}$/).nullable().optional(),
  builtins: z.record(z.string().max(32), builtinOverrideSchema).optional(),
}).strict()

export type BuiltinOverride = z.infer<typeof builtinOverrideSchema>
export type ThemeSettingsPatch = z.infer<typeof themeSettingsPatchSchema>

export interface StoredThemeSettings {
  defaultThemeId?: string
  defaultVariantId?: string
  builtins?: Record<string, BuiltinOverride>
}

/** Gespeicherten Stand fehlertolerant lesen — kaputtes JSON ⇒ leer, wie bisher. */
export function parseStoredThemeSettings(raw: unknown): StoredThemeSettings {
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const source = parsed as Record<string, unknown>
    const result: StoredThemeSettings = {}
    if (typeof source.defaultThemeId === 'string') result.defaultThemeId = source.defaultThemeId
    if (typeof source.defaultVariantId === 'string') result.defaultVariantId = source.defaultVariantId
    if (typeof source.builtins === 'object' && source.builtins !== null && !Array.isArray(source.builtins)) {
      result.builtins = source.builtins as Record<string, BuiltinOverride>
    }
    return result
  }
  catch {
    return {}
  }
}

/** Nur die Felder, die einen Wert tragen — `{}` heißt „keine Abweichung". */
function compactOverride(entry: BuiltinOverride): BuiltinOverride | null {
  const out: BuiltinOverride = {}
  if (entry.name !== undefined) out.name = entry.name
  if (entry.hidden !== undefined) out.hidden = entry.hidden
  if (entry.order !== undefined) out.order = entry.order
  return Object.keys(out).length > 0 ? out : null
}

/** Pure Regel: gespeicherter Stand + Body ⇒ neuer Stand. */
export function applyThemeSettingsPatch(stored: StoredThemeSettings, patch: ThemeSettingsPatch): StoredThemeSettings {
  // Ein genannter Schlüssel ersetzt, `null` heißt „keiner", fehlend bleibt.
  const pick = (patched: string | null | undefined, current: string | undefined) =>
    patched === undefined ? current : (patched ?? undefined)
  const defaultThemeId = pick(patch.defaultThemeId, stored.defaultThemeId)
  const defaultVariantId = pick(patch.defaultVariantId, stored.defaultVariantId)

  // builtins je Eintrag: genannte ersetzt (oder entfernt bei `{}`), andere bleiben.
  const patchedIds = new Set(Object.keys(patch.builtins ?? {}))
  const builtinEntries = [
    ...Object.entries(stored.builtins ?? {}).filter(([id]) => !patchedIds.has(id)),
    ...Object.entries(patch.builtins ?? {})
      .map(([id, entry]) => [id, compactOverride(entry)] as const)
      .filter((pair): pair is readonly [string, BuiltinOverride] => pair[1] !== null),
  ]

  const next: StoredThemeSettings = {}
  if (defaultThemeId !== undefined) next.defaultThemeId = defaultThemeId
  if (defaultVariantId !== undefined) next.defaultVariantId = defaultVariantId
  if (builtinEntries.length > 0) next.builtins = Object.fromEntries(builtinEntries)
  return next
}
