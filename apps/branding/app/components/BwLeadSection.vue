<script setup lang="ts">
/**
 * DER BLOCK „FRÜHZUGANG" VON /about UND /team — eine Fassung statt zwei.
 *
 * Bis zum 2026-11-12 stand derselbe Abschnitt wörtlich auf beiden Seiten und
 * zeigte immer die Warteliste. Seit der offenen Beta (Davids Entscheidung vom
 * selben Tag) folgt er der AUFNAHME: ist die Anmeldung offen, steht hier die
 * Kontoanlage; sonst wie bisher die Warteliste. Die Antwort kommt aus
 * `useBrandAdmission` — derselben Quelle wie die Knöpfe der Startseite, damit
 * keine Seite „geschlossen" sagt, während eine andere schon Konten anlegt.
 *
 * Der Einladungs-Knopf bleibt auch bei offener Aufnahme: ein Code schaltet
 * weiterhin ein Beta-Konto frei, und wer einen hat, soll ihn nicht suchen.
 *
 * In der APP und nicht im Layer: die Texte (`lead.*`) gehören der App.
 */
defineProps<{
  /** Woher der Wartelisten-Eintrag kommt — reist als `source` mit. */
  source: 'about' | 'team'
  /** Ein Satz der Seite, der VOR dem gemeinsamen Text steht (Team-Seite). */
  intro?: string
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const { signupOpen } = await useBrandAdmission()
</script>

<template>
  <section class="bw-card mt-28 grid items-center gap-10 p-10 @lg:grid-cols-[minmax(0,1fr)_26rem] @lg:p-14">
    <div class="min-w-0">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
        {{ t(signupOpen ? 'lead.open.eyebrow' : 'lead.eyebrow') }}
      </p>
      <h2 class="mt-3 max-w-lg text-balance text-3xl font-extralight leading-snug tracking-tight sm:text-4xl">
        {{ t(signupOpen ? 'lead.open.title' : 'lead.title') }}
      </h2>
      <p class="mt-4 max-w-lg text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        <template v-if="intro">{{ intro }} </template>{{ t(signupOpen ? 'lead.open.body' : 'lead.body') }}
      </p>
    </div>
    <div v-if="signupOpen" class="flex flex-wrap items-center gap-3" data-lead-open>
      <UButton
        :label="t('lead.open.cta')" :to="localePath('/register')"
        size="lg" color="neutral" icon="i-ph-plus" class="rounded-full"
      />
      <UButton
        :label="t('home.cta.invite')" :to="localePath('/invite')"
        size="lg" color="neutral" variant="ghost" class="rounded-full"
      />
    </div>
    <BwWaitlistForm v-else :source="source" />
  </section>
</template>
