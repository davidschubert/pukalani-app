<script setup lang="ts">
import type { IntegrationId, IntegrationsResponse } from '../../../../shared/types/integrations'

/**
 * INTEGRATIONEN — die Zugänge dieser Instanz zu fremden Diensten
 * (Davids Entscheidung 2026-08-18).
 *
 * ── WARUM NICHT „APIs" ────────────────────────────────────────────────────
 * Hier liegen keine Schnittstellen, sondern ZUGÄNGE zu ihnen. „Integrationen"
 * trägt ausserdem, was zum Schlüssel gehört (Modell, Absender, Endpoint) —
 * und Pfad wie Beschriftung stimmen in beiden Sprachen überein, wie es die
 * Regel aus dem Kategorien-Kopf verlangt (U8/G4: der Pfad benennt, was im
 * Menü steht).
 *
 * ── EIN FELD ZEIGT EINEN ZUSTAND, KEINEN WERT ─────────────────────────────
 * Der Server gibt nie einen Schlüssel heraus (er läge sonst im
 * __NUXT__-Payload dieser Seite). Sichtbar ist die HERKUNFT: hier hinterlegt ·
 * aus der Server-Umgebung · keiner. Ein leeres Eingabefeld heisst „nicht
 * angefasst"; Entfernen ist ein eigener Knopf, weil es eine eigene Absicht ist.
 *
 * ── DIE UNBEWEGLICHEN STEHEN MIT DA ───────────────────────────────────────
 * Appwrite-Key, Umschlag, Control-Plane, Redis: die KÖNNEN nicht hierher, man
 * braucht sie, um an die verschlüsselte Zeile zu kommen. Sie werden trotzdem
 * genannt — eine Übersicht, die „alle Zugänge" verspricht und die Hälfte
 * verschweigt, schickt beim nächsten Suchen in die Irre.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage', dashboardScope: 'operator' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
// Zugänge setzen verlangt eine frische Anmeldung (SEC-034, 2026-11-16).
const { promptFreshSignIn } = useRecentAuthPrompt()
useBrandTitle(() => t('admin.integrations.title'))

const { data, error, refresh } = await useFetch<IntegrationsResponse>('/api/admin/integrations')

/** Je Dienst ein eigenes Eingabefeld — sie werden auch einzeln gespeichert. */
const inputs = reactive<Record<string, string>>({})
const busy = ref<IntegrationId | ''>('')

async function save(id: IntegrationId) {
  const value = (inputs[id] ?? '').trim()
  if (!value || busy.value) return
  busy.value = id
  try {
    await $fetch('/api/admin/integrations', { method: 'PATCH', body: { id, value } })
    inputs[id] = ''
    await refresh()
    toast.add({ title: t('admin.integrations.saved'), color: 'success' })
  }
  catch (error) {
    if (await promptFreshSignIn(error, t('admin.integrations.reauthText'))) return
    toast.add({ title: t('admin.integrations.saveFailed'), description: t('admin.integrations.saveFailedHint'), color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

async function clear(id: IntegrationId) {
  try {
    const ok = await confirm({
      title: t('admin.integrations.clearTitle'),
      description: t('admin.integrations.clearText', { env: envName(id) }),
      confirmLabel: t('admin.integrations.clear'),
      action: () => $fetch('/api/admin/integrations', { method: 'PATCH', body: { id, value: '' } }),
    })
    if (!ok) return
    inputs[id] = ''
    await refresh()
  }
  catch (error) {
    // confirm() wirft den Fehler der Aktion weiter (Dialog ist dann zu).
    if (await promptFreshSignIn(error, t('admin.integrations.reauthText'))) return
    toast.add({ title: t('admin.integrations.saveFailed'), description: t('admin.integrations.saveFailedHint'), color: 'error' })
  }
}

const envName = (id: IntegrationId) => data.value?.items.find(i => i.id === id)?.envName ?? ''

// ── SMTP: ein Block statt eines Feldes ─────────────────────────────────────
/** Das Passwort steht bewusst LEER im Formular — der Server gibt keines heraus,
 *  und leer heisst beim Speichern „unverändert" (mergeMailerSettings). */
const smtp = reactive({ host: '', port: '', user: '', pass: '', from: '' })
const smtpBusy = ref(false)
watchEffect(() => {
  const s = data.value?.smtp
  if (!s) return
  smtp.host = s.host
  smtp.port = s.port
  smtp.user = s.user
  smtp.from = s.from
})

async function saveSmtp() {
  if (smtpBusy.value) return
  smtpBusy.value = true
  try {
    await $fetch('/api/admin/integrations', { method: 'PATCH', body: { id: 'smtp', smtp: { ...smtp } } })
    smtp.pass = ''
    await refresh()
    toast.add({ title: t('admin.integrations.saved'), color: 'success' })
  }
  catch (error) {
    if (await promptFreshSignIn(error, t('admin.integrations.reauthText'))) return
    toast.add({ title: t('admin.integrations.saveFailed'), description: t('admin.integrations.saveFailedHint'), color: 'error' })
  }
  finally {
    smtpBusy.value = false
  }
}
const badgeColor = (source: string) => (source === 'none' ? 'warning' : 'success')
</script>

<template>
  <UDashboardPanel id="admin-integrations">
    <template #header>
      <UDashboardNavbar :title="t('admin.integrations.title')">
        <template #leading>
          <CoreSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl space-y-4">
        <p class="text-sm text-muted">{{ t('admin.integrations.description') }}</p>

        <!-- Fehler statt „keine Dienste" (FE-004, LZ1) -->
        <div v-if="error && !data" role="alert">
          <CoreLoadError :retry="refresh" />
        </div>

        <UAlert
          v-if="data && !data.editable"
          color="neutral"
          variant="subtle"
          icon="i-ph-info"
          :description="t('admin.integrations.notEditable')"
        />

        <CoreEmptyState
          v-if="data && data.items.length === 0"
          icon="i-ph-plugs"
          :title="t('admin.integrations.emptyTitle')"
          :description="t('admin.integrations.emptyText')"
        />

        <UCard v-for="item in data?.items ?? []" :key="item.id" :data-integration="item.id">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-semibold">{{ t(`admin.integrations.service.${item.id}`) }}</h3>
                <UBadge :color="badgeColor(item.source)" variant="subtle" size="sm">
                  {{ t(`admin.integrations.source.${item.source}`) }}
                </UBadge>
              </div>
              <p class="mt-1 text-sm text-muted">{{ t(`admin.integrations.serviceDesc.${item.id}`) }}</p>
              <!-- GETEILTES Naht-Geheimnis: hier steht die Reihenfolge, ohne
                   die ein Wechsel die Naht reißt. Sie steht auf der KARTE und
                   nicht im Handbuch, weil sie genau in dem Moment gebraucht
                   wird, in dem jemand das Feld ausfüllt.
                   ZWEI TEXTE, weil es zwei Lagen sind: bei einer EINSEITIGEN
                   Naht genügt „erst Empfänger, dann Sender" und es gibt kein
                   Fenster; bei einer ZWEISEITIGEN ist jede Seite Empfänger,
                   der Eintrag ändert immer auch das SENDEN, und zwischen den
                   zwei Einträgen ist eine Richtung tot. Ein Text für beides
                   wäre für die zweite Lage schlicht falsch. -->
              <p v-if="item.shared" class="mt-1 text-xs text-dimmed" :data-integration-rotation="item.id">
                {{ t(item.shared === 'two-way'
                  ? 'admin.integrations.rotationHintTwoWay'
                  : 'admin.integrations.rotationHint') }}
              </p>
            </div>
          </div>

          <template v-if="data?.editable">
            <UInput
              v-model="inputs[item.id]"
              type="password"
              autocomplete="off"
              class="mt-3 w-full"
              :placeholder="t('admin.integrations.placeholder')"
              :data-integration-input="item.id"
            />
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <UButton
                size="xs"
                :loading="busy === item.id"
                :disabled="!(inputs[item.id] ?? '').trim()"
                :data-integration-save="item.id"
                @click="save(item.id)"
              >
                {{ t('admin.integrations.save') }}
              </UButton>
              <UButton
                v-if="item.source === 'settings'"
                size="xs"
                color="error"
                variant="ghost"
                icon="i-ph-trash"
                :data-integration-clear="item.id"
                @click="clear(item.id)"
              >
                {{ t('admin.integrations.clear') }}
              </UButton>
              <span class="text-xs text-dimmed">{{ t('admin.integrations.envHint', { env: item.envName }) }}</span>
            </div>
          </template>
        </UCard>

        <!-- SMTP. Kein einzelner Schlüssel, sondern ein Block — deshalb ein
             kleines Formular statt einer Zeile. Das Passwort-Feld bleibt beim
             Laden LEER: der Server gibt keines heraus, und leer heisst beim
             Speichern „unverändert". Entfernen geht über einen leeren Host,
             weil das die andere Absicht ist. -->
        <UCard v-if="data?.editable" data-integration="smtp">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="font-semibold">{{ t('admin.integrations.service.smtp') }}</h3>
            <UBadge :color="badgeColor(data.smtp.source)" variant="subtle" size="sm">
              {{ t(`admin.integrations.source.${data.smtp.source}`) }}
            </UBadge>
          </div>
          <p class="mt-1 text-sm text-muted">{{ t('admin.integrations.serviceDesc.smtp') }}</p>

          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <UFormField :label="t('admin.integrations.smtp.host')">
              <UInput v-model="smtp.host" class="w-full" placeholder="smtp.example.com" data-smtp-host />
            </UFormField>
            <UFormField :label="t('admin.integrations.smtp.port')">
              <UInput v-model="smtp.port" class="w-full" placeholder="587" />
            </UFormField>
            <UFormField :label="t('admin.integrations.smtp.user')">
              <UInput v-model="smtp.user" class="w-full" autocomplete="off" />
            </UFormField>
            <UFormField :label="t('admin.integrations.smtp.pass')" :help="data.smtp.hasPassword ? t('admin.integrations.smtp.passKept') : undefined">
              <UInput v-model="smtp.pass" type="password" class="w-full" autocomplete="off" data-smtp-pass />
            </UFormField>
            <UFormField :label="t('admin.integrations.smtp.from')" class="sm:col-span-2">
              <UInput v-model="smtp.from" class="w-full" placeholder="noreply@example.com" />
            </UFormField>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-2">
            <UButton size="xs" :loading="smtpBusy" data-smtp-save @click="saveSmtp">
              {{ t('admin.integrations.save') }}
            </UButton>
            <span class="text-xs text-dimmed">{{ t('admin.integrations.smtp.clearHint') }}</span>
          </div>
        </UCard>

        <!-- Die Unbeweglichen: genannt, damit niemand sie hier sucht. -->
        <UCard v-if="data?.bootstrap?.length">
          <h3 class="font-semibold">{{ t('admin.integrations.bootstrapTitle') }}</h3>
          <p class="mt-1 text-sm text-muted">{{ t('admin.integrations.bootstrapText') }}</p>
          <ul class="mt-3 space-y-1">
            <li v-for="name in data.bootstrap" :key="name" class="font-mono text-xs text-dimmed">{{ name }}</li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
