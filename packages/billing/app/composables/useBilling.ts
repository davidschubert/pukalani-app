import { BILLING_SUBSCRIPTIONS_TABLE, type BillingSubscriptionResponse, type PukalaniBillingConfig } from '../../shared/types/billing'

/**
 * Billing-Zustand des eingeloggten Users (B22): SSR-hydriert über
 * GET /api/billing/subscription, Realtime-Refresh auf die eigene
 * Subscription-Row (Row-Security filtert server-seitig) — die Billing-Seite
 * springt nach dem Checkout live auf „aktiv", sobald der Webhook schrieb.
 */
export function useBilling() {
  const appConfig = useAppConfig()
  const config = useRuntimeConfig()

  const billingConfig = computed<PukalaniBillingConfig>(() => {
    const billing = (appConfig.pukalani as { billing?: Partial<PukalaniBillingConfig> } | undefined)?.billing
    return {
      enabled: billing?.enabled ?? false,
      currency: billing?.currency ?? 'eur',
      trialDays: billing?.trialDays ?? 0,
      plans: billing?.plans ?? [],
      compare: billing?.compare,
    }
  })

  const { data, refresh, error } = useFetch<BillingSubscriptionResponse>('/api/billing/subscription', {
    key: 'billing:subscription',
    immediate: billingConfig.value.enabled,
    default: () => ({ subscription: null, planId: null, products: [], entitled: false }),
  })

  /**
   * „GERADE NICHT FESTSTELLBAR" IST KEIN „FREE" (Bahn 2, Q13-Stelle 4): der
   * Server antwortet bei einem Lesefehler 503 `billing_unavailable`. Vorher
   * schluckte `ignoreResponseError` jede Antwort, und die Seite zeigte einem
   * Zahlenden den Basic-Plan. Nur 404 (Gate aus) bleibt still beim Free-Zustand.
   */
  const unavailable = computed(() => {
    const status = error.value?.statusCode ?? (error.value as { status?: number } | null | undefined)?.status
    return Boolean(error.value) && status !== 404
  })

  const subscription = computed(() => data.value?.subscription ?? null)
  const planId = computed(() => data.value?.planId ?? null)
  const entitled = computed(() => data.value?.entitled ?? false)
  const hasProduct = (product: string) => (data.value?.products ?? []).includes(product)

  // Realtime auf die EIGENE Row (sofern vorhanden) — Muster PostFeed:
  // Stop-Funktion selbst halten, onMounted hat keinen Effect-Scope
  let stopRealtime: (() => void) | undefined
  onMounted(() => {
    if (!billingConfig.value.enabled) return
    stopRealtime = useRealtimeRows(
      config.public.appwriteDatabaseId,
      BILLING_SUBSCRIPTIONS_TABLE,
      () => { void refresh() },
    )
  })
  onBeforeUnmount(() => stopRealtime?.())

  return { config: billingConfig, subscription, planId, entitled, unavailable, hasProduct, refresh }
}
