<script setup lang="ts">
/** P1c-Wegweiser (NEU, ändert am Klickdummy nichts): die ECHTEN Layer-Seiten
 *  kommen über `extends` von selbst in den Playground — sie stehen nur in
 *  keinem Menü, weil der Playground Davids Demo-Anker ist und seine
 *  Startseite der Dummy bleibt. Diese Seite ist die Brücke dorthin.
 *
 *  WAS MAN HIER SIEHT: der Playground hat KEINE eigene branding-Appwrite und
 *  keine Sitzung. `requireBrandAccess` antwortet deshalb 404 (Datentür-Muster),
 *  und die echten Seiten zeigen dafür ihren gebauten Leerzustand „Noch kein
 *  Zugang" — KEINE Fehlerseite. Genau das ist der sichtbare Beweis, dass der
 *  404 des Gates sauber landet. */
const routes = [
  { to: '/dashboard/brands', label: 'Brandings (echt)', note: 'Übersicht aus GET /api/brand/profiles. Ohne Zugang: Leerzustand „Noch kein Zugang".' },
  { to: '/dashboard/brands/new', label: 'Neues Branding (echt)', note: 'Weiche, Rebrand-Verzweigung, Rahmendaten — legt über POST /api/brand/profiles an.' },
  { to: '/brand/x/context', label: 'Werkstatt (echt)', note: 'Vollbild-Workspace. Mit erfundener Id ohne Zugang: derselbe Leerzustand.' },
]
const demo = [
  { to: '/', label: 'Klickdummy: Brandings' },
  { to: '/brand/demo/werte', label: 'Klickdummy: Werkstatt' },
  { to: '/brand/demo/gespraech', label: 'Klickdummy: Werkstatt „Gespräch als Bühne" (Revision 2026-09-02)' },
]
</script>

<template>
  <div class="bw-root min-h-dvh px-6 pb-10">
    <BwSiteNav />
    <div class="mx-auto max-w-3xl">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Entwicklung</p>
      <h1 class="mt-1 text-[28px] font-extralight leading-tight tracking-tight">P1c — echte Seiten neben dem Dummy</h1>
      <p class="mt-3 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        Der Playground hat keine eigene branding-Appwrite und keine Sitzung. Die echten Seiten zeigen
        deshalb ihren Leerzustand „Noch kein Zugang" statt einer Fehlerseite — so ist der 404 des
        Zugangs-Gates gemeint.
      </p>

      <p class="bw-label mt-8" style="color: var(--bw-muted)">Echte Layer-Seiten</p>
      <div class="mt-2 space-y-2">
        <NuxtLink
          v-for="route in routes" :key="route.to" :to="route.to"
          class="bw-card bw-card--hover flex items-center justify-between gap-3 px-5 py-4"
        >
          <span class="min-w-0">
            <span class="block text-sm font-medium">{{ route.label }}</span>
            <span class="bw-label block" style="color: var(--bw-muted)">{{ route.to }}</span>
            <span class="mt-1 block text-sm" style="color: var(--bw-ink-soft)">{{ route.note }}</span>
          </span>
          <UIcon name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-muted)" />
        </NuxtLink>
      </div>

      <p class="bw-label mt-8" style="color: var(--bw-muted)">Klickdummy (unverändert)</p>
      <div class="mt-2 space-y-2">
        <NuxtLink
          v-for="route in demo" :key="route.to" :to="route.to"
          class="bw-card bw-card--hover flex items-center justify-between gap-3 px-5 py-4"
        >
          <span class="min-w-0">
            <span class="block text-sm font-medium">{{ route.label }}</span>
            <span class="bw-label block" style="color: var(--bw-muted)">{{ route.to }}</span>
          </span>
          <UIcon name="i-ph-arrow-right" class="size-4 flex-none" style="color: var(--bw-muted)" />
        </NuxtLink>
      </div>

      <BwSiteFooter />
    </div>
  </div>
</template>
