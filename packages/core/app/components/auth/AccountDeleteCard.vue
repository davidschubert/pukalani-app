<script setup lang="ts">
const { t } = useI18n()
const localePath = useLocalePath()
const toast = useToast()
const auth = useAuthStore()
const appConfig = useAppConfig()
const runtimeConfig = useRuntimeConfig()

const confirm = useConfirm()
/**
 * Der Server löscht nur nach FRISCHER Anmeldung (RA1, requireRecentAuth) —
 * ist sie älter, übernimmt der gemeinsame Weg (useRecentAuthPrompt). Gelöscht
 * wurde dabei nichts.
 */
const { promptFreshSignIn } = useRecentAuthPrompt()

/**
 * „Was beim Löschen geschieht" (GA1 P14, Davids Entscheidung): VOR dem Knopf,
 * in einfachen Worten, und nichts, was der Server nicht hält.
 *
 *  · `now` und `irreversible` gelten überall.
 *  · `backup` NUR, wenn diese Instanz einen GDPR-Bucket hat — ohne ihn läuft
 *    die Löschung ohne Sicherungskopie, und die Zeile wäre eine Lüge.
 *  · danach je Produkt-Layer eine Zeile aus `pukalani.account.deleteNotices`
 *    (Schlüssel, vom Layer angemeldet und von `check:i18n-keys` bewacht) —
 *    der Core kennt die Produkte nicht (A14).
 */
const notices = computed<string[]>(() => {
  const lines = [t('account.delete.notice.now')]
  if (runtimeConfig.public.appwriteGdprBucket) lines.push(t('account.delete.notice.backup'))
  for (const key of appConfig.pukalani.account.deleteNotices) lines.push(t(key))
  lines.push(t('account.delete.notice.irreversible'))
  return lines
})

async function deleteAccount() {
  try {
    const ok = await confirm({
      title: t('account.delete.confirmTitle'),
      description: t('account.delete.confirmText'),
      confirmLabel: t('account.delete.confirm'),
      action: () => $fetch('/api/auth/account', { method: 'DELETE' }),
    })
    if (!ok) return
    auth.setUser(null)
    toast.add({ title: t('account.delete.success'), color: 'success', icon: 'i-ph-check-circle' })
    await navigateTo(localePath('/login'))
  }
  catch (error) {
    if (await promptFreshSignIn(error, t('account.delete.reauthText'))) return
    toast.add({
      title: isNetworkError(error) ? t('auth.networkError') : t('account.delete.failed'),
      // Der Titel nennt nur den Fehlschlag — die für den Nutzer entscheidende
      // Frage ist, ob sein Account jetzt weg ist. Ehrliche Antwort: vielleicht
      // halb. Bricht die Löschung mittendrin ab, ist der Account schon gesperrt
      // und zum Teil geleert; der Text sagt das, statt „nichts passiert".
      description: t('account.delete.failedDescription'),
      color: 'error',
    })
  }
}
</script>

<template>
  <UPageCard
    :title="t('account.delete.title')"
    :description="t('account.delete.description')"
    class="bg-linear-to-tl from-error/10 from-5% to-default"
  >
    <!-- Liste UND Knopf im Fuß: der Standard-Slot der Karte rendert NACH dem
         Fuß — die Liste stünde sonst unter dem Knopf, und der Bestätigungstext
         verweist auf „die Liste über dem Knopf". -->
    <template #footer>
      <div class="space-y-4">
        <section aria-labelledby="account-delete-notice-title" class="text-sm">
          <!-- `h2`: der Titel der Karte ist keine Überschrift, die Seite hat
               nur ihre `h1` darüber — `h3` übersprang eine Ebene (UX-011). -->
          <h2 id="account-delete-notice-title" class="font-medium text-highlighted">
            {{ t('account.delete.notice.title') }}
          </h2>
          <ul class="mt-2 space-y-1.5 text-muted">
            <li v-for="(line, index) in notices" :key="index" class="flex gap-2">
              <UIcon name="i-ph-dot-outline-bold" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{{ line }}</span>
            </li>
          </ul>
        </section>

        <UButton :label="t('account.delete.button')" color="error" @click="deleteAccount" />
      </div>
    </template>
  </UPageCard>
</template>
