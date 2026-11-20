<script setup lang="ts">
/**
 * Passwort-Stärke-Indikator — dieselben 6 Kriterien, die createRegisterFormSchema /
 * createPasswordChangeSchema erzwingen (Live-Feedback). Wird sowohl bei Registrierung
 * als auch bei der Passwort-Änderung genutzt.
 */
const props = defineProps<{ password: string, passwordConfirm: string }>()

const { t } = useI18n()

const checks = computed(() => {
  const pw = props.password ?? ''
  return [
    { label: t('auth.password.min'), valid: pw.length >= 8 },
    { label: t('auth.password.upper'), valid: /[A-Z]/.test(pw) },
    { label: t('auth.password.lower'), valid: /[a-z]/.test(pw) },
    { label: t('auth.password.number'), valid: /[0-9]/.test(pw) },
    { label: t('auth.password.special'), valid: /[^A-Za-z0-9]/.test(pw) },
    { label: t('auth.password.match'), valid: pw.length > 0 && pw === props.passwordConfirm },
  ]
})
const score = computed(() => checks.value.filter(check => check.valid).length)
const progressLabel = () => t('auth.password.progress', { done: score.value, total: checks.value.length })
const color = computed(() => {
  if (score.value === 0) return 'neutral' as const
  if (score.value <= 2) return 'error' as const
  if (score.value <= 4) return 'warning' as const
  return 'success' as const
})
</script>

<template>
  <div class="space-y-2">
    <!-- Der Balken nennt sich selbst (UX-010): ohne eigenen Namen hieß er nur
         „17%". Die Regeln darunter sagen je Zeile „erfüllt" oder „fehlt" —
         Symbol und Farbe allein kann niemand abfragen. -->
    <UProgress :model-value="score" :max="checks.length" :color="color" size="sm" :get-value-label="progressLabel" />
    <ul class="space-y-1" :aria-label="t('auth.password.rules')">
      <li
        v-for="(check, index) in checks"
        :key="index"
        class="flex items-center gap-1.5 text-xs"
        :class="check.valid ? 'text-success' : 'text-muted'"
      >
        <UIcon :name="check.valid ? 'i-ph-check-circle' : 'i-ph-circle-dashed'" class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ check.label }}</span>
        <span class="sr-only" data-password-rule-state>{{ check.valid ? t('auth.password.met') : t('auth.password.missing') }}</span>
      </li>
    </ul>
  </div>
</template>
