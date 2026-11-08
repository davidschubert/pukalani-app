/**
 * Der EINE Client-Weg für `reason: reauth_required` (RA1 → RA2, 2026-11-08).
 *
 * Der Server lehnt Unumkehrbares ab, wenn die Anmeldung älter als 10 Minuten
 * ist (`requireRecentAuth`, shared/recentAuth.ts). Jede Oberfläche, die so eine
 * Route ruft, reicht ihren Fehler hier durch:
 *
 *   catch (error) {
 *     if (await promptFreshSignIn(error, t('…reauthText'))) return
 *     toast.add(…)
 *   }
 *
 * Erkennt der Helfer den Grund, erklärt er ihn, meldet ab und schickt über
 * `/login?redirect=…` an dieselbe Seite zurück (`useLogout().reauthenticate`)
 * — das geht für jede Konto-Art (Passwort, Google, E-Mail-Code) und prüft MFA
 * gleich mit. Die Wiederholung ist dann ein zweiter Klick der Person: die
 * Seite merkt sich die Aktion bewusst NICHT über den Login hinweg, denn ein
 * Unumkehrbares, das nach dem Login von allein losläuft, hätte niemand
 * bestätigt.
 *
 * `description` sagt, WAS danach geht und dass nichts passiert ist — das
 * weiß nur die aufrufende Stelle. Titel und Knopf sind überall gleich.
 *
 * Rückgabe `true` ⇒ der Fehler war `reauth_required` und ist behandelt;
 * `false` ⇒ ein anderer Fehler, der Aufrufer meldet ihn wie bisher.
 */
export function useRecentAuthPrompt() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const route = useRoute()
  const { reauthenticate } = useLogout()

  async function promptFreshSignIn(error: unknown, description: string): Promise<boolean> {
    if (!isReauthRequired(error)) return false
    const ok = await confirm({
      title: t('auth.reauthTitle'),
      description,
      confirmLabel: t('auth.reauthConfirm'),
      color: 'primary',
    })
    if (ok) await reauthenticate(route.fullPath)
    return true
  }

  return { promptFreshSignIn }
}
