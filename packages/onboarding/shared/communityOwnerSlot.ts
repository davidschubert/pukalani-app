import { z } from 'zod'

/**
 * VERWAISTER INHABER-PLATZ (LA2) — was die Betreiber-Seite sieht.
 *
 * Bewusst ohne Konto-Kennungen und Adressen: die Seite braucht nur „gibt es
 * einen lebenden Inhaber?". Die Kennungen bleiben auf dem Server.
 */
export interface CommunityOwnerSlotView {
  communityId: string
  communityName: string
  /** Stillgelegt — dort wird nichts vergeben. */
  disabled: boolean
  owners: Array<{ memberId: string, deleted: boolean, hasEmail: boolean }>
  /** Es gibt Owner-Zeilen, und ALLE gehören zu gelöschten Konten. */
  orphaned: boolean
}

export interface CommunityOwnerReassignResponse {
  ok: true
  communityName: string
}

/** Die fachlichen Gründe, die die Seite in eigene Sätze übersetzt. */
export const OWNER_SLOT_REASONS = [
  'owner_present',
  'owner_changed',
  'account_not_found',
  'account_blocked',
  'community_disabled',
  'new_owner_is_orphan',
  'owner_check_unavailable',
] as const
export type OwnerSlotReason = (typeof OWNER_SLOT_REASONS)[number]

export function isOwnerSlotReason(value: unknown): value is OwnerSlotReason {
  return typeof value === 'string' && (OWNER_SLOT_REASONS as readonly string[]).includes(value)
}

type Translate = (key: string, params?: Record<string, unknown>) => string

/** Formular „Community prüfen" — eine Community-Id. */
export function createOwnerSlotCheckSchema(t: Translate) {
  return z.object({
    communityId: z.string().trim().min(1, t('onboarding.ownerSlot.validation.communityId')).max(36, t('onboarding.ownerSlot.validation.communityId')),
  })
}

/** Formular „Neuer Inhaber" — die Adresse eines bestehenden Kontos. */
export function createOwnerSlotAssignSchema(t: Translate) {
  return z.object({
    email: z.string().trim().pipe(z.email(t('onboarding.ownerSlot.validation.email')).max(320, t('onboarding.ownerSlot.validation.email'))),
  })
}
