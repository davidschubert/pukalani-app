<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { accountMenuLinks } from '../../../shared/customDomainScope'

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const { logout } = useLogout()
const canSiteDashboard = useCommunityCapability('dashboard.access')

/**
 * Die Rolle steht unter dem Namen (Davids Vorgabe 2026-08-17, Screenshot 2) —
 * dieselbe Zeile wie im Dashboard-Konto-Menü, damit beide Orte dasselbe sagen.
 * Ohne nennbare Rolle bleibt sie weg statt etwas zu behaupten.
 */
const roleLabel = useRoleLabel()

/**
 * Eigene Domain im Modus `write` (PK1 E1b-2): „Verwalten" führt in den
 * Kundenbereich, ein Hinweis zeigt, wo Konto und Sicherheit liegen — die
 * Routen dafür antworten hier 404. Überall sonst wie vorher.
 */
const customDomainScope = useCustomDomainScope()
const accountUrl = useAccountAreaUrl()
const links = computed(() => accountMenuLinks({
  scope: customDomainScope.value,
  canDashboard: userHasCapability(auth.user, 'dashboard.access') || canSiteDashboard.value,
  accountUrl,
}))

const items = computed<DropdownMenuItem[]>(() => [
  {
    label: auth.user?.name || t('ui.account'),
    avatar: { alt: auth.user?.name || t('ui.account') },
    ...(roleLabel.value ? { description: roleLabel.value } : {}),
    type: 'label',
  },
  { type: 'separator' },
  // Dashboard-Link für jeden mit dashboard.access — per Operator-Label (admin +
  // moderator) ODER Site-Rolle dieses Mandanten (N1);
  // die Route liefert der admin-Layer — Apps ohne ihn haben keine solchen User.
  ...(links.value.manage?.kind === 'dashboard'
    ? [{ label: t('ui.adminArea'), icon: 'i-ph-gauge', to: localePath('/dashboard') } satisfies DropdownMenuItem]
    : []),
  ...(links.value.manage?.kind === 'external'
    ? [{ label: t('ui.customDomain.manage'), icon: 'i-ph-gauge', to: links.value.manage.href, external: true } satisfies DropdownMenuItem]
    : []),
  ...(links.value.accountHref
    ? [{
        label: t('ui.customDomain.account'),
        description: t('ui.customDomain.accountHint'),
        icon: 'i-ph-user-gear',
        to: links.value.accountHref,
        external: true,
      } satisfies DropdownMenuItem]
    : []),
  {
    label: t('auth.logout'),
    icon: 'i-ph-sign-out',
    onSelect: () => { void logout() },
  },
])
</script>

<template>
  <UDropdownMenu :items="items">
    <!-- Der Name kommt aus dem INHALT: Avatar (Initialen oder Bild-Text) plus
         versteckter Zweck. Ein `aria-label` ohne die sichtbaren Initialen
         passte nicht zum sichtbaren Text (UX-011, Q09). -->
    <UButton color="neutral" variant="ghost" class="rounded-full p-1">
      <UserAvatar size="sm" />
      <span class="sr-only">{{ t('ui.userMenu') }}</span>
    </UButton>
  </UDropdownMenu>
</template>
