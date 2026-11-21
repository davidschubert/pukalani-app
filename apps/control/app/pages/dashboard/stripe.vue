<script setup lang="ts">
/**
 * STRIPE — Betreiber-Seite (F55, Davids Entscheidung 2026-08-08).
 *
 * Vier Karten in genau der Reihenfolge, in der man sie beim Go-Live braucht:
 * Status (wo stehe ich?) · Schlüssel (was gilt?) · Preise (was verkaufe ich?)
 * · Webhook (kommt das Geld auch an?). Der komplette Go-Live läuft danach
 * ohne Terminal — der Weg über `scripts/stripe/ensure-prices.mjs` bleibt als
 * Rückfall bestehen und arbeitet aus demselben Katalog.
 *
 * SIE STEHT NICHT IN DER ADMIN-HÜLLE (packages/admin/.../admin.vue) — Davids
 * Vorgabe und der richtige Ort: die Reiter dort sind eine HARTE Liste im
 * admin-LAYER, und `apps/comments` erbt sie mit. Ein Stripe-Reiter dort hätte
 * dem Silo einen Menüpunkt gegeben, dessen Routen (`/api/control/stripe/*`)
 * es gar nicht gibt. Als eigene Dashboard-Seite mit Sidebar-Eintrag aus
 * `apps/control/app/app.config.ts` existiert sie genau dort, wo auch die
 * Routen existieren.
 *
 * WAS DIE SEITE NIE ZU SEHEN BEKOMMT: den Schlüssel. Aus dem Server kommen
 * Modus und die letzten VIER Zeichen, mehr nicht — die Eingabefelder sind
 * `type="password"` und werden nach dem Speichern geleert.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t, locale } = useI18n()
const toast = useToast()
useBrandTitle(() => t('control.stripe.title'))

interface SectionError { error: true }

interface PriceStatus {
  lookupKey: string
  interval: 'month' | 'year'
  expectedAmount: number
  exists: boolean
  amount: number | null
  currency: string | null
  active: boolean
  taxBehavior: string | null
}

interface WebhookStatus {
  found: boolean
  id: string | null
  status: string | null
  enabledEvents: string[]
  missingEvents: string[]
  otherEndpoints: number
  /**
   * Gehört das gespeicherte Signatur-Geheimnis zu DIESEM Endpunkt? (MEDIUM 2)
   * 'created_here' = ja, weil dieses Deployment ihn selbst angelegt hat.
   * 'unconfirmed'  = ein Geheimnis ist da, seine Herkunft ist aber unbelegbar.
   * 'none'         = gar keins.
   */
  secretOrigin: 'created_here' | 'unconfirmed' | 'none'
  /** API-Version, in der der Endpunkt sendet (`null` = Standard des Kontos, BE-016). */
  apiVersion: string | null
  apiVersionMatches: boolean
  expectedApiVersion: string
}

interface TaxStatus {
  defaultTaxBehavior: string | null
  status: string | null
}

interface StripeStatus {
  mode: 'live' | 'test' | 'none'
  keySource: 'db' | 'env' | 'none'
  keyTail: string
  webhookSecretSource: 'db' | 'env' | 'none'
  webhookSecretTail: string
  storageAvailable: boolean
  expectedWebhookUrl: string
  expectedEvents: string[]
  tax: TaxStatus | SectionError | null
  prices: PriceStatus[] | SectionError | null
  webhook: WebhookStatus | SectionError | null
}

const { data, refresh, status: fetchStatus } = await useFetch<StripeStatus>('/api/control/stripe/status', {
  lazy: true,
  server: false,
})

/** Hat der Abschnitt Daten? (`null` = kein Key, `{error:true}` = Stripe-Störung) */
function ok<T>(section: T | SectionError | null | undefined): section is T {
  return !!section && (section as SectionError).error !== true
}

function failed(section: unknown): boolean {
  return !!section && (section as SectionError).error === true
}

const tax = computed(() => (ok<TaxStatus>(data.value?.tax) ? data.value!.tax as TaxStatus : null))
const prices = computed(() => (ok<PriceStatus[]>(data.value?.prices) ? data.value!.prices as PriceStatus[] : null))
const webhook = computed(() => (ok<WebhookStatus>(data.value?.webhook) ? data.value!.webhook as WebhookStatus : null))

/** Brutto ist Pflicht (A3) — alles andere rechnet 19 % oben drauf. */
const taxOk = computed(() => tax.value?.defaultTaxBehavior === 'inclusive')

const isLive = computed(() => data.value?.mode === 'live')
const hasKey = computed(() => !!data.value && data.value.keySource !== 'none')

function money(cents: number, currency: string | null): string {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: (currency ?? 'eur').toUpperCase() }).format(cents / 100)
}

/** Der fachliche Grund reist im Envelope als `reason` (core/server/error.ts). */
function reasonOf(error: unknown): string {
  return (error as { data?: { reason?: string } })?.data?.reason ?? ''
}

/**
 * Der Meldungstext des Envelopes. Er ist NUR bei 4xx echt (ab 500 ersetzt ihn
 * der zentrale Handler durch „Internal server error") — hier gebraucht für den
 * einen Fall, in dem eine ADRESSE mitreisen muss: die Id des Stripe-Endpunkts,
 * dessen Geheimnis nicht abgelegt werden konnte.
 */
function messageOf(error: unknown): string | undefined {
  const message = (error as { data?: { message?: string } })?.data?.message
  return typeof message === 'string' && message ? message : undefined
}

// ── Schlüssel ───────────────────────────────────────────────────────────────
const form = reactive({ secretKey: '', webhookSecret: '' })
const savingKeys = ref(false)

async function saveKeys() {
  const body: { secretKey?: string, webhookSecret?: string } = {}
  if (form.secretKey.trim()) body.secretKey = form.secretKey.trim()
  if (form.webhookSecret.trim()) body.webhookSecret = form.webhookSecret.trim()
  if (!body.secretKey && !body.webhookSecret) return

  savingKeys.value = true
  try {
    await $fetch('/api/control/stripe/keys', { method: 'POST', body })
    // Sofort leeren: ein stehengebliebener Klartext im Feld überlebt sonst
    // jeden Screenshot und jede Bildschirmfreigabe.
    form.secretKey = ''
    form.webhookSecret = ''
    toast.add({ title: t('control.stripe.keys.saved'), color: 'success' })
    await refresh()
  }
  catch (error) {
    const reason = reasonOf(error)
    const key = reason === 'key_invalid'
      ? 'control.stripe.keys.errorInvalid'
      : reason === 'key_malformed'
        ? 'control.stripe.keys.errorMalformed'
        : reason === 'webhook_secret_malformed'
          ? 'control.stripe.keys.errorWebhookMalformed'
          : reason === 'encryption_unconfigured'
            ? 'control.stripe.keys.errorNoStorage'
            // Der Schlüssel STEHT in der Env, er ist nur falsch geformt — eine
            // andere Handlung als „anlegen".
            : reason === 'encryption_key_invalid'
              ? 'control.stripe.keys.errorStorageKeyInvalid'
              : 'control.stripe.keys.errorGeneric'
    toast.add({ title: t(key), color: 'error' })
  }
  finally {
    savingKeys.value = false
  }
}

// ── Preise ──────────────────────────────────────────────────────────────────
interface PriceSyncResult { lookupKey: string, outcome: 'created' | 'skipped' | 'transferred' }
const syncingPrices = ref(false)
const showPriceConfirm = ref(false)

/**
 * WELCHE PREISE WÜRDE DER ABGLEICH ERSETZEN? (LOW 6) — die existieren, aber
 * einen anderen Betrag tragen als der Katalog. Genau diese legt
 * `syncStripePriceCatalog` neu an und archiviert den alten; fehlende Preise
 * werden dagegen nur ANGELEGT und sind harmlos.
 */
const priceReplacements = computed(() =>
  (prices.value ?? []).filter(price => price.exists && price.amount !== price.expectedAmount),
)

/**
 * BEI LIVE-GELD ERST FRAGEN (LOW 6). Der Knopf ersetzte bisher ohne Rückfrage
 * echte Preise — und was er ersetzen würde, stand nur als kleines Abzeichen in
 * der Liste daneben. Im Testmodus bleibt der Weg direkt: dort ist ein Fehlgriff
 * kostenlos, und eine Rückfrage, die man immer wegklickt, schützt beim
 * einunddreißigsten Mal niemanden mehr.
 */
function requestPriceSync() {
  if (isLive.value && priceReplacements.value.length > 0) {
    showPriceConfirm.value = true
    return
  }
  return syncPrices()
}

async function confirmPriceSync() {
  showPriceConfirm.value = false
  await syncPrices()
}

async function syncPrices() {
  syncingPrices.value = true
  try {
    const report = await $fetch<{ results: PriceSyncResult[] }>('/api/control/stripe/prices', { method: 'POST' })
    const created = report.results.filter(r => r.outcome === 'created').length
    const transferred = report.results.filter(r => r.outcome === 'transferred').length
    const skipped = report.results.filter(r => r.outcome === 'skipped').length
    toast.add({ title: t('control.stripe.prices.synced', { created, transferred, skipped }), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.stripe.prices.syncFailed'), color: 'error' })
  }
  finally {
    syncingPrices.value = false
  }
}

// ── Webhook ─────────────────────────────────────────────────────────────────
const creatingWebhook = ref(false)
const showRecreateConfirm = ref(false)

type WebhookAction = 'created' | 'recreated' | 'events_added' | 'unchanged'

/**
 * Herkunft des Signatur-Geheimnisses ist unbelegbar (MEDIUM 2). Nur zeigen,
 * wenn es überhaupt etwas zu belegen gäbe: ohne Endpunkt oder ohne Geheimnis
 * sagt die Karte an anderer Stelle schon das Wesentliche.
 */
const secretUnconfirmed = computed(() => !!webhook.value?.found && webhook.value.secretOrigin === 'unconfirmed')

async function confirmRecreateWebhook() {
  showRecreateConfirm.value = false
  await ensureWebhook(true)
}

async function ensureWebhook(recreate = false) {
  creatingWebhook.value = true
  try {
    const result = await $fetch<{ action: WebhookAction, secretStored: boolean }>(
      '/api/control/stripe/webhook',
      { method: 'POST', body: recreate ? { recreate: true } : {} },
    )
    const titles: Record<WebhookAction, string> = {
      created: t('control.stripe.webhook.created'),
      recreated: t('control.stripe.webhook.recreated'),
      events_added: t('control.stripe.webhook.eventsAdded'),
      unchanged: t('control.stripe.webhook.unchanged'),
    }
    toast.add({
      title: titles[result.action],
      description: result.secretStored ? t('control.stripe.webhook.secretStored') : undefined,
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    const reason = reasonOf(error)
    const key = reason === 'app_url_missing'
      ? 'control.stripe.webhook.errorNoAppUrl'
      // Der Endpunkt STEHT bei Stripe, nur sein Geheimnis fehlt — das ist eine
      // andere Nachricht als „konnte nicht eingerichtet werden" und verlangt
      // eine andere Handlung (dort löschen, hier neu anlegen).
      : reason === 'secret_not_stored'
        ? 'control.stripe.webhook.errorSecretNotStored'
        : reason === 'encryption_unconfigured'
          ? 'control.stripe.webhook.errorNoStorage'
          : 'control.stripe.webhook.errorGeneric'
    toast.add({
      title: t(key),
      // Nur hier trägt der Rohtext eine Information, die kein Übersetzungs-
      // schlüssel haben kann: WELCHEN Endpunkt der Betreiber bei Stripe
      // löschen muss.
      description: reason === 'secret_not_stored' ? messageOf(error) : undefined,
      color: 'error',
    })
    // Auch der Fehlschlag ändert womöglich den Zustand (beim Neu-Anlegen ist
    // der alte Endpunkt dann schon weg) — die Karte muss die Wahrheit zeigen.
    await refresh()
  }
  finally {
    creatingWebhook.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="stripe">
    <template #header>
      <UDashboardNavbar :title="t('control.stripe.title')">
        <template #leading>
          <CoreSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-arrows-clockwise"
            variant="ghost"
            color="neutral"
            :loading="fetchStatus === 'pending'"
            :aria-label="t('control.stripe.refresh')"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <!-- ── Status ────────────────────────────────────────────────────── -->
        <UPageCard
          :title="t('control.stripe.status.title')"
          :description="t('control.stripe.status.description')"
          variant="subtle"
        >
          <UAlert
            v-if="isLive"
            color="warning"
            variant="subtle"
            icon="i-ph-warning-circle"
            class="mb-4"
            :title="t('control.stripe.status.liveTitle')"
            :description="t('control.stripe.status.liveHint')"
          />

          <dl class="divide-y divide-default text-sm">
            <div class="flex items-center justify-between gap-4 py-3 first:pt-0">
              <dt class="text-muted">{{ t('control.stripe.status.mode') }}</dt>
              <dd>
                <UBadge v-if="data?.mode === 'live'" color="warning" variant="subtle">{{ t('control.stripe.status.modeLive') }}</UBadge>
                <UBadge v-else-if="data?.mode === 'test'" color="neutral" variant="subtle">{{ t('control.stripe.status.modeTest') }}</UBadge>
                <UBadge v-else color="neutral" variant="outline">{{ t('control.stripe.status.modeNone') }}</UBadge>
              </dd>
            </div>

            <div class="flex items-center justify-between gap-4 py-3">
              <dt class="text-muted">{{ t('control.stripe.status.key') }}</dt>
              <dd class="text-right">
                <span v-if="hasKey" class="font-mono">…{{ data?.keyTail }}</span>
                <span v-else>{{ t('control.stripe.status.keyMissing') }}</span>
                <!-- Ohne Herkunft steht hier NICHTS. Vorher trug der Schlüssel
                     `source.none` bewusst einen leeren Wert — vue-i18n rendert
                     den zwar wirklich als '' (11.4.8 nachgemessen), aber ein
                     leerer Übersetzungswert ist von einem VERGESSENEN nicht zu
                     unterscheiden, und beim nächsten Bibliotheks-Wechsel
                     stünde dort womöglich der Schlüssel. -->
                <span v-if="hasKey" class="ml-2 text-muted">{{ t(`control.stripe.source.${data!.keySource}`) }}</span>
              </dd>
            </div>

            <div class="flex items-center justify-between gap-4 py-3">
              <dt class="text-muted">{{ t('control.stripe.status.webhookSecret') }}</dt>
              <dd class="text-right">
                <span v-if="data && data.webhookSecretSource !== 'none'" class="font-mono">…{{ data.webhookSecretTail }}</span>
                <span v-else>{{ t('control.stripe.status.keyMissing') }}</span>
                <span v-if="data && data.webhookSecretSource !== 'none'" class="ml-2 text-muted">{{ t(`control.stripe.source.${data.webhookSecretSource}`) }}</span>
              </dd>
            </div>

            <div class="flex items-center justify-between gap-4 py-3 last:pb-0">
              <dt class="text-muted">{{ t('control.stripe.status.tax') }}</dt>
              <dd class="text-right">
                <span v-if="!hasKey" class="text-muted">{{ t('control.stripe.status.needsKey') }}</span>
                <span v-else-if="failed(data?.tax)" class="text-muted">{{ t('control.stripe.sectionFailed') }}</span>
                <UBadge v-else-if="taxOk" color="success" variant="subtle">{{ t('control.stripe.status.taxInclusive') }}</UBadge>
                <UBadge v-else color="error" variant="subtle">{{ tax?.defaultTaxBehavior || t('control.stripe.status.taxUnset') }}</UBadge>
              </dd>
            </div>
          </dl>

          <UAlert
            v-if="hasKey && tax && !taxOk"
            color="error"
            variant="subtle"
            icon="i-ph-receipt"
            class="mt-4"
            :title="t('control.stripe.status.taxWrongTitle')"
            :description="t('control.stripe.status.taxWrongHint')"
          />
        </UPageCard>

        <!-- ── Schlüssel ─────────────────────────────────────────────────── -->
        <UPageCard
          :title="t('control.stripe.keys.title')"
          :description="t('control.stripe.keys.description')"
          variant="subtle"
        >
          <UAlert
            v-if="data && !data.storageAvailable"
            color="warning"
            variant="subtle"
            icon="i-ph-lock-key-open"
            :title="t('control.stripe.keys.noStorageTitle')"
            :description="t('control.stripe.keys.noStorageHint')"
          />

          <form v-else class="flex flex-col gap-4" @submit.prevent="saveKeys">
            <UFormField
              :label="t('control.stripe.keys.secretLabel')"
              :description="t('control.stripe.keys.secretHint')"
            >
              <UInput
                v-model="form.secretKey"
                type="password"
                autocomplete="off"
                class="w-full"
                placeholder="sk_live_…"
              />
            </UFormField>

            <UFormField
              :label="t('control.stripe.keys.webhookLabel')"
              :description="t('control.stripe.keys.webhookHint')"
            >
              <UInput
                v-model="form.webhookSecret"
                type="password"
                autocomplete="off"
                class="w-full"
                placeholder="whsec_…"
              />
            </UFormField>

            <div class="flex justify-end">
              <UButton
                type="submit"
                :loading="savingKeys"
                :disabled="!form.secretKey.trim() && !form.webhookSecret.trim()"
              >
                {{ t('control.stripe.keys.save') }}
              </UButton>
            </div>
          </form>
        </UPageCard>

        <!-- ── Preise ────────────────────────────────────────────────────── -->
        <UPageCard
          :title="t('control.stripe.prices.title')"
          :description="t('control.stripe.prices.description')"
          variant="subtle"
        >
          <p v-if="!hasKey" class="text-sm text-muted">{{ t('control.stripe.status.needsKey') }}</p>
          <p v-else-if="failed(data?.prices)" class="text-sm text-muted">{{ t('control.stripe.sectionFailed') }}</p>

          <!-- `prices` ist eine LEERE Liste, wenn der Plan-Katalog nichts
               hergibt — die Karte stand dann komplett leer da, ohne einen
               Hinweis, dass etwas fehlt (M8). Kein Knopf: das ist ein
               Katalog-Fehler, kein Schritt, den man hier tut; der
               Abgleich-Knopf sitzt ohnehin in der Kopfzeile der Seite. -->
          <CoreEmptyState
            v-else-if="prices && prices.length === 0"
            icon="i-ph-tag"
            :title="t('control.stripe.prices.emptyTitle')"
            :description="t('control.stripe.prices.emptyText')"
          />

          <!-- KEINE UTable (B6): der feste Preiskatalog (eine Handvoll Einträge
               aus `stripePriceCatalog.ts`) als Zustands-Karte — Soll gegen Ist
               je Preis, nichts zu sortieren oder zu blättern. -->
          <div v-else-if="prices" class="divide-y divide-default">
            <div
              v-for="price in prices"
              :key="price.lookupKey"
              class="flex items-center justify-between gap-4 py-3 first:pt-0"
            >
              <div class="min-w-0">
                <p class="text-sm font-medium">
                  {{ money(price.expectedAmount, 'eur') }}
                  <span class="text-muted">· {{ t(`control.stripe.prices.interval.${price.interval}`) }}</span>
                </p>
                <p class="truncate font-mono text-xs text-muted">{{ price.lookupKey }}</p>
              </div>
              <div class="shrink-0 text-right">
                <UBadge v-if="!price.exists" color="warning" variant="subtle">{{ t('control.stripe.prices.missing') }}</UBadge>
                <UBadge v-else-if="price.amount !== price.expectedAmount" color="warning" variant="subtle">
                  {{ t('control.stripe.prices.drift', { amount: money(price.amount ?? 0, price.currency) }) }}
                </UBadge>
                <UBadge v-else-if="price.taxBehavior !== 'inclusive'" color="error" variant="subtle">
                  {{ t('control.stripe.prices.taxWrong') }}
                </UBadge>
                <UBadge v-else color="success" variant="subtle">{{ t('control.stripe.prices.ok') }}</UBadge>
              </div>
            </div>
          </div>

          <UAlert
            color="neutral"
            variant="subtle"
            icon="i-ph-info"
            class="mt-4"
            :title="t('control.stripe.prices.landingTitle')"
            :description="t('control.stripe.prices.landingHint')"
          />

          <div class="mt-4 flex justify-end">
            <UButton :loading="syncingPrices" :disabled="!hasKey" @click="requestPriceSync">
              {{ t('control.stripe.prices.sync') }}
            </UButton>
          </div>
        </UPageCard>

        <!-- ── Webhook ───────────────────────────────────────────────────── -->
        <UPageCard
          :title="t('control.stripe.webhook.title')"
          :description="t('control.stripe.webhook.description')"
          variant="subtle"
        >
          <dl class="divide-y divide-default text-sm">
            <div class="flex items-start justify-between gap-4 py-3 first:pt-0">
              <dt class="text-muted">{{ t('control.stripe.webhook.url') }}</dt>
              <dd class="break-all text-right font-mono text-xs">
                {{ data?.expectedWebhookUrl || t('control.stripe.webhook.urlMissing') }}
              </dd>
            </div>
            <div class="flex items-center justify-between gap-4 py-3 last:pb-0">
              <dt class="text-muted">{{ t('control.stripe.webhook.state') }}</dt>
              <dd>
                <span v-if="!hasKey" class="text-muted">{{ t('control.stripe.status.needsKey') }}</span>
                <span v-else-if="failed(data?.webhook)" class="text-muted">{{ t('control.stripe.sectionFailed') }}</span>
                <UBadge v-else-if="!webhook?.found" color="warning" variant="subtle">{{ t('control.stripe.webhook.stateMissing') }}</UBadge>
                <UBadge v-else-if="webhook.missingEvents.length" color="warning" variant="subtle">
                  <!-- Pluralform (LOW 8): bei genau einem fehlenden Ereignis
                       stand hier „1 Ereignisse fehlen". -->
                  {{ t('control.stripe.webhook.stateIncomplete', { count: webhook.missingEvents.length }, webhook.missingEvents.length) }}
                </UBadge>
                <UBadge v-else color="success" variant="subtle">{{ t('control.stripe.webhook.stateOk') }}</UBadge>
              </dd>
            </div>
          </dl>

          <div class="mt-4">
            <p class="mb-2 text-sm text-muted">{{ t('control.stripe.webhook.events') }}</p>
            <ul class="flex flex-wrap gap-1.5">
              <li v-for="name in data?.expectedEvents ?? []" :key="name">
                <UBadge
                  variant="subtle"
                  :color="webhook && !webhook.missingEvents.includes(name) ? 'success' : 'neutral'"
                  class="font-mono text-xs"
                >
                  {{ name }}
                </UBadge>
              </li>
            </ul>
          </div>

          <UAlert
            v-if="secretUnconfirmed"
            color="warning"
            variant="subtle"
            icon="i-ph-seal-question"
            class="mt-4"
            :title="t('control.stripe.webhook.secretUnconfirmedTitle')"
            :description="t('control.stripe.webhook.secretUnconfirmedHint')"
          />

          <!-- BE-016: die Version eines bestehenden Endpunkts ändert nur die
               Neuanlage — deshalb nur ein Hinweis, keine eigene Aktion. -->
          <UAlert
            v-if="webhook?.found && !webhook.apiVersionMatches"
            color="warning"
            variant="subtle"
            icon="i-ph-clock-counter-clockwise"
            class="mt-4"
            :title="t('control.stripe.webhook.apiVersionMismatch')"
          />

          <div class="mt-4 flex flex-wrap justify-end gap-2">
            <UButton
              v-if="webhook?.found"
              color="error"
              variant="subtle"
              :loading="creatingWebhook"
              :disabled="!hasKey || !data?.expectedWebhookUrl"
              @click="showRecreateConfirm = true"
            >
              {{ t('control.stripe.webhook.recreate') }}
            </UButton>
            <UButton
              :loading="creatingWebhook"
              :disabled="!hasKey || !data?.expectedWebhookUrl"
              @click="ensureWebhook()"
            >
              {{ webhook?.found ? t('control.stripe.webhook.addEvents') : t('control.stripe.webhook.create') }}
            </UButton>
          </div>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Live-Preise ersetzen (LOW 6): nennt die betroffenen lookup_keys mit
       alt→neu, damit die Zustimmung eine Zustimmung ZU ETWAS ist. -->
  <UModal v-model:open="showPriceConfirm" :title="t('control.stripe.prices.confirmTitle')">
    <template #body>
      <div class="space-y-3 text-sm">
        <p class="text-muted">{{ t('control.stripe.prices.confirmIntro') }}</p>
        <ul class="divide-y divide-default rounded-md border border-default">
          <li v-for="price in priceReplacements" :key="price.lookupKey" class="px-3 py-2 font-mono text-xs">
            {{ t('control.stripe.prices.confirmRow', {
              lookupKey: price.lookupKey,
              from: money(price.amount ?? 0, price.currency),
              to: money(price.expectedAmount, 'eur'),
            }) }}
          </li>
        </ul>
        <p class="text-muted">{{ t('control.stripe.prices.confirmNote') }}</p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="showPriceConfirm = false" />
        <UButton color="warning" :loading="syncingPrices" :label="t('control.stripe.prices.confirmCta')" @click="confirmPriceSync" />
      </div>
    </template>
  </UModal>

  <!-- Endpunkt neu anlegen (MEDIUM 2): löscht bei Stripe und ersetzt das
       Signatur-Geheimnis — deshalb nie ohne ausdrückliche Zustimmung. -->
  <UModal v-model:open="showRecreateConfirm" :title="t('control.stripe.webhook.recreateConfirmTitle')">
    <template #body>
      <p class="text-sm text-muted">{{ t('control.stripe.webhook.recreateConfirmBody') }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="showRecreateConfirm = false" />
        <UButton color="error" :loading="creatingWebhook" :label="t('control.stripe.webhook.recreateConfirm')" @click="confirmRecreateWebhook" />
      </div>
    </template>
  </UModal>
</template>
