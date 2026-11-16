import { z } from 'zod'
import { mergeMailerSettings, parseMailerSettings } from '../../../../core/shared/mailerSettings'

/**
 * EINEN Zugang setzen oder entfernen.
 *
 * IMMER NUR EINEN: die Seite hat je Dienst einen eigenen Speichern-Knopf, und
 * ein Sammel-PATCH über alle Dienste könnte bei einem Fehler in der Mitte
 * einen halben Zustand hinterlassen — bei Geheimnissen die schlechteste Sorte
 * Überraschung. Ein Aufruf, ein Dienst, ein Ergebnis.
 *
 * LEERER WERT = ENTFERNEN, und das muss ausgesprochen werden: das Formular
 * schickt ein leeres Feld NICHT mit (leer heisst dort „nicht angefasst"),
 * sondern nur der Entfernen-Knopf schickt ''.
 *
 * Das Protokoll hält die TATSACHE fest, nie den Wert — auch nicht gekürzt:
 * die ersten Zeichen eines Schlüssels sind bereits eine Auskunft.
 */
/**
 * ZWEI FORMEN, weil es zwei Sorten Zugang gibt: ein einzelner Schlüssel — und
 * SMTP, das ein BLOCK ist (Host, Port, Benutzer, Passwort, Absender gehören
 * zusammen).
 */
const bodySchema = z.union([
  z.object({
    // Die Einzel-Schlüssel: ausdrücklich aufgezählt statt aus INTEGRATION_IDS
    // gefiltert — nur so bleibt es eine unterscheidbare Union, und der
    // Compiler kann `body.smtp` von `body.value` trennen.
    // Die beiden Naht-Geheimnisse (A0) stehen hier mit drin: aus Sicht dieser
    // Route sind sie EIN Wert wie jeder andere. Was sie besonders macht —
    // dass drüben derselbe stehen muss — ist eine Frage der REIHENFOLGE beim
    // Eintragen, nicht des Speicherns (siehe `sharedSeamSecret.ts`).
    id: z.enum(['ai', 'analytics', 'tickets-ai', 'onboarding-service', 'events-sweep']),
    value: z.string().trim().max(400),
  }),
  z.object({
    id: z.literal('smtp'),
    smtp: z.object({
      // Leerer Host = diesen Zugang gibt es nicht mehr (siehe unten).
      host: z.string().trim().max(200),
      port: z.string().trim().max(6),
      user: z.string().trim().max(200),
      // Leeres Passwort heisst UNVERÄNDERT — nicht „löschen".
      pass: z.string().max(200),
      from: z.string().trim().max(200),
    }),
  }),
])

/**
 * FRISCHE ANMELDUNG (SEC-034, Davids Entscheidung 2026-11-16 — „wie die
 * großen Anbieter: Zugänge"): wer einen Schlüssel setzt oder entfernt, hat
 * sich in den letzten 10 Minuten angemeldet. Geprüft NACH dem Rechte-Gate
 * und VOR dem ersten Lesen oder Schreiben eines Geheimnisses.
 */
export default defineEventHandler(async (event) => {
  requirePermission(event, 'system.manage')
  await requireRecentAuth(event)

  const body = await readValidatedBody(event, bodySchema.parse)

  if (body.id === 'smtp') {
    /**
     * DAS PASSWORT DARF NICHT VERSEHENTLICH VERSCHWINDEN. Wer nur den Absender
     * ändert, tippt es nicht neu — das Feld kommt leer zurück. Der bisherige
     * Stand wird deshalb gelesen und zusammengeführt (`mergeMailerSettings`,
     * pur und getestet). Ohne diese Regel nimmt die erste harmlose Korrektur
     * den Versand mit, und zwar STILL.
     */
    const previous = parseMailerSettings(await readInstanceSecret(event, 'smtp'))
    // Dritte Quelle: das Passwort aus der Env. Das Formular ist mit den
    // Env-Werten vorausgefüllt, das Passwort-Feld aber leer — ohne diese
    // Stufe würde „einfach speichern" den Versand still kappen.
    const merged = mergeMailerSettings(previous, body.smtp, useRuntimeConfig(event).smtpPass ?? '')
    // Leerer Host = entfernen: das ist die Handlung „diesen Zugang gibt es
    // nicht mehr", und sie sieht anders aus als ein leeres Passwort-Feld.
    await writeInstanceSecret(event, 'smtp', merged.host ? JSON.stringify(merged) : '', event.context.user?.$id ?? '')
    // Der Puffer im Mailer (30 s) würde sonst weiter den alten Zugang liefern
    // — nach einem bewussten Speichern ist das eine Wartezeit ohne Grund.
    __resetMailerSettingsCache()
    await recordAudit(event, {
      action: merged.host ? 'integration.key_set' : 'integration.key_cleared',
      targetType: 'integration',
      targetId: 'smtp',
    })
    return { ok: true, id: 'smtp' as const, source: merged.host ? 'settings' as const : 'none' as const }
  }

  const { id, value } = body
  await writeInstanceSecret(event, id, value, event.context.user?.$id ?? '')

  await recordAudit(event, {
    action: value ? 'integration.key_set' : 'integration.key_cleared',
    targetType: 'integration',
    targetId: id,
  })

  return { ok: true, id, source: value ? 'settings' as const : 'none' as const }
})
