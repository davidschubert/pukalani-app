/**
 * WESSEN EINSTELLUNGS-ZEILE? — die EINE Row-Id-Regel für Community-Einstellungen,
 * die als „eine Zeile je Community" abgelegt sind (rowId = Community):
 * Navigation (`community_navigation`, system-033), Sucheintrag
 * (`community_seo`, system-034) und Weiterleitungen (`community_redirects`).
 *
 * BIS ZUM 2026-09-08 galt in allen drei Schreib-Routen `useTenant(event)?.
 * communityId` — ohne Mandanten-Kontext (Silo/Single-Tenant) war die Id leer,
 * also antwortete JEDES Speichern 404, obwohl der Reiter im Dashboard stand.
 * Zuerst für die Navigation behoben (Paket 2 des Vorhabens „Navigation
 * anpassen"), am selben Tag auf Davids Auftrag für Sucheintrag und
 * Weiterleitungen nachgezogen — mit DERSELBEN Funktion, damit die drei
 * Ablagen nie wieder auseinanderlaufen.
 *
 * DREI FÄLLE:
 *
 *  1. **Pool-Mandant** ⇒ seine `communityId` (unverändert).
 *  2. **Kein Mandant und keine Mandantenfähigkeit** (Silo/Single-Tenant:
 *     branding, portfolio, comments, photos, Playground) ⇒ `'instance'`. Die
 *     Instanz IST hier der Besitzer, es gibt genau eine Website. Kollidieren
 *     kann der Name nicht: Community-Zeilen liegen im POOL-Projekt, die
 *     `instance`-Zeile in einem SILO-Projekt — nie beide im selben —, und ein
 *     `unique()`-Schlüssel ist ohnehin 20 Hex-Zeichen. ERST WAR ES `_instance`
 *     nach dem Muster `_account` der Benachrichtigungen — aber das ist dort ein
 *     Spalten-WERT; als ROW-ID lehnt Appwrite einen führenden Unterstrich ab
 *     („Can't start with a leading underscore", Klickbeweis 2026-09-08:
 *     Speichern antwortete 500). Muster also nicht übertragbar.
 *     EINE INSTANZ OHNE APPWRITE (help, Endpunkt leer) bekommt ebenfalls
 *     `'instance'` — die LESER steigen dann vor dem Client-Bau aus
 *     (shared/appwriteConfigured.ts); hier ist das richtig so, denn die
 *     Row-Id sagt, WEM die Zeile gehörte, nicht, ob es sie geben kann.
 *  3. **Kontroll-Host der Pool-App** (kein Mandant, aber Mandantenfähigkeit an)
 *     ⇒ `null`. Dort gibt es keine Community, deren Einstellung jemand wählen
 *     dürfte; Leser liefern leer, Schreib-Routen antworten 404. Ohne diese
 *     Unterscheidung schrieben alle Kontroll-Hosts in dieselbe `instance`-Zeile.
 *
 * `onControlHost` kommt server-seitig aus `event.context.controlCenter` — die
 * Fahne, die `00.tenant.ts` genau in Fall 3 setzt. Sie ist ein eigenes
 * Argument und nicht aus dem Mandanten hergeleitet, weil sie es nicht sein
 * KANN: Fall 2 und Fall 3 haben beide `tenant === null`. Server-Aufrufer
 * nehmen `communitySettingsRowIdFor(event)` (core/server/utils) und rechnen
 * das nicht selbst.
 */

/** Die Zeile der INSTANZ im Silo — eine gültige Appwrite-Row-Id (kein `_`). */
export const INSTANCE_SETTINGS_ROW_ID = 'instance'

export function communitySettingsRowId(
  tenant: { communityId?: string } | null | undefined,
  onControlHost = false,
): string | null {
  if (onControlHost) return null
  if (!tenant) return INSTANCE_SETTINGS_ROW_ID
  // Fail-closed: ein Mandant OHNE communityId ist ein Datenfehler (der Resolver
  // setzt sie immer) — dann lieber keine Zeile als die der ganzen Instanz.
  return tenant.communityId || null
}
