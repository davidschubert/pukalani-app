import type { ProductManifest } from '../core/shared/types/manifest'

export default {
  key: 'billing',
  tier: 'foundation',
  kind: 'foundation',
  hasMigrations: true,
  userData: true,
  // Schema-Probe (OPS-008): billing-003 legt stripe_settings.webhookEndpointId an.
  schema: { latest: '003', probe: { migration: '003', table: 'stripe_settings', column: 'webhookEndpointId' } },
  title: { en: 'Billing', de: 'Billing' },
  description: {
    en: 'Stripe subscriptions: hosted checkout and portal, signed webhooks and entitlements for paid products.',
    de: 'Stripe-Abos: Hosted Checkout und Portal, signierte Webhooks und Entitlements für kostenpflichtige Inhalte.',
  },
  icon: 'i-ph-credit-card',
} satisfies ProductManifest
