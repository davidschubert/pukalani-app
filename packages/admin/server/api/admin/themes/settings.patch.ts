import { applyThemeSettingsPatch, parseStoredThemeSettings, themeSettingsPatchSchema } from '../../../../shared/themeSettingsPatch'

/**
 * Customize theme: Instanz-weite Einstellungen (Default-Theme für Besucher ohne
 * Cookie, Built-ins umbenennen/ausblenden/umsortieren) — als JSON in
 * app_config.themeSettings (Migration system-011).
 *
 * Lesen, Zusammenführen und Schreiben laufen in der Kette von
 * `mutateAppConfig()` (server/utils/appConfigWrite.ts) gegen den FRISCH
 * gelesenen Stand; die Antwort trägt den neuen Gesamtstand, die Seite
 * übernimmt ihn.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')

  const body = await readValidatedBody(event, themeSettingsPatchSchema.parse)

  const { previous, settings } = await mutateAppConfig(event, (current) => {
    const stored = parseStoredThemeSettings(current?.themeSettings)
    const merged = applyThemeSettingsPatch(stored, body)
    return {
      data: { themeSettings: JSON.stringify(merged) },
      result: { previous: stored, settings: merged },
    }
  }, 'Could not save theme settings')

  await recordAudit(event, { action: 'theme.settings_updated', targetType: 'theme', targetId: 'settings' })

  // Activity-Feed nur, wenn der Instanz-Default WECHSELT (Umbenennen/Sortieren
  // von Built-ins bleibt still) — alle offenen Fenster morphen live, der
  // Eintrag erklärt warum. Verglichen mit dem Stand aus der Kette.
  // Core-Vertrag, best-effort.
  if (body.defaultThemeId && body.defaultThemeId !== previous.defaultThemeId) {
    const user = event.context.user!
    await recordActivity(event, {
      actorId: user.$id,
      actorName: user.name,
      type: 'theme.default_changed',
      objectType: 'theme',
      objectId: body.defaultThemeId,
      link: '/',
      metadata: { snippet: body.defaultThemeId },
    })
  }

  return { ok: true, settings }
})
