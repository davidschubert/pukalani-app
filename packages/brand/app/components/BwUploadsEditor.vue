<script setup lang="ts">
import { BRAND_INSPIRATION_AREAS } from '../../shared/brandDesignVocab'
import {
  BRAND_INSPIRATION_ACCEPT,
  BRAND_INSPIRATION_MAX,
  BRAND_INSPIRATION_MAX_BYTES,
  BRAND_INSPIRATION_NOTE_MAX,
  type BrandInspirationEntry,
} from '../../shared/brandInspiration'
import type { BrandInspirationWriteResponse } from '../../shared/types/brand'

/**
 * DAS INSTRUMENT `uploads` — die Vorbilder des Kunden (`g.inspiration`,
 * Konzept docs/archiv/BRAND-DESIGN.md §2.2 Schritt 2, Paket D2a).
 *
 * Es ist der erste Editor der Registry, der KEIN Textfeld ist
 * (`BrandSlotEditor: 'uploads'`, seit D0 deklariert). Gebaut ist es nach dem
 * freigegebenen Prototyp `.playground/app/pages/brand/demo/design/dna.vue` —
 * Karte je Bild mit Vorschau, „Vorbild n", Dateiname, Bereich als Auswahl,
 * Notiz, Entfernen; darunter die Ablagefläche, der Zähler, die Drossel-Zeile
 * und der Privatheits-Hinweis.
 *
 * ── SEIT D2b GEHÖRT DIE LISTE NICHT MEHR DIESER KOMPONENTE ───────────────
 * Sie liegt in `useBrandInspiration(profileId)`, weil der Abschnitt DARUNTER
 * (`BwReadingPanel`) dieselben Zeilen meint: wer hier ein Bild ablegt, macht
 * die Lesung dort veraltet. Zwei eigene Listen wären zwei Stände, und der
 * zweite behauptete weiter, alles sei gelesen. Alles andere unten gilt
 * unverändert.
 *
 * ── DIE WAHRHEIT LIEGT AUF DEM SERVER, NICHT HIER ─────────────────────────
 * Anders als der Klickdummy hält diese Komponente KEINE Object-URLs und keine
 * lokale Liste, die sie selbst fortschreibt: jede Handlung antwortet mit der
 * GANZEN Liste (`BrandInspirationWriteResponse.items`), und die wird
 * übernommen. Der Grund ist die Nummerierung — sie zählt server-seitig vom
 * höchsten vergebenen Wert weiter (`nextBrandInspirationNumber`), und eine
 * zweite Zählung im Browser wäre spätestens nach dem ersten Entfernen eine
 * andere.
 *
 * ── EIN AUFRUF JE BILD, UND ZWAR NACHEINANDER ─────────────────────────────
 * Der Datei-Wähler nimmt mehrere; hochgeladen wird trotzdem eines nach dem
 * anderen. Das ist die Gegenseite der Route (s. deren Kopf): bei fünf Bildern,
 * von denen eines zu gross ist, bekommt genau dieses seine Absage — die
 * anderen vier liegen danach da. NACHEINANDER und nicht parallel, weil die
 * Nummer und der Zwölfer-Deckel am Server-Zustand hängen: fünf gleichzeitige
 * Aufrufe läsen alle denselben Stand.
 *
 * ── DAS BILD KOMMT AUS DER EIGENEN ROUTE ──────────────────────────────────
 * `…/inspiration/:id/image` — es gibt keine Bucket-Adresse, die ein Browser
 * aufrufen könnte (§2.13). `?v=` trägt den Anlege-Zeitpunkt und ist reiner
 * Cache-Brecher; die Route selbst antwortet mit `private, no-store`.
 *
 * ── FREMDWERK-HINWEIS UND DROSSEL STEHEN IMMER DA ─────────────────────────
 * Nicht erst im Fehlerfall: der Mensch lädt hier Bilder hoch, die ihm nicht
 * gehören, und er soll VORHER wissen, dass sie privat bleiben und dass wir sie
 * lesen und nicht nachbauen (§2.2 Leitplanke a).
 */
const props = defineProps<{
  profileId: string
  /** Sperrt jede Handlung — solange das Kapitel abgeschlossen ist etwa. */
  disabled?: boolean
}>()

const { t, locale } = useI18n()

const inspiration = useBrandInspiration(props.profileId)
const { items } = inspiration
const loading = ref(!inspiration.loaded.value)
const busy = ref(false)
const errorKey = ref('')

/**
 * Wie der Bereich dem Menschen heisst — AUS DEM VOKABULAR, nicht aus dem
 * i18n-Katalog. `BRAND_INSPIRATION_AREAS` trägt beide Sprachen selbst und ist
 * dieselbe Quelle, aus der der Server den Slot-Wert baut; zwei Kataloge für
 * dieselben fünf Wörter wären der erste Ort, an dem „Zeichen" und „Mark"
 * auseinanderlaufen (dasselbe Muster wie `display` in `brandChoiceOptions`).
 */
function areaLabel(areaId: string): string {
  const area = BRAND_INSPIRATION_AREAS.find(entry => entry.id === areaId)
  if (!area) return areaId
  return locale.value === 'en' ? area.en : area.de
}

const areaItems = computed(() => BRAND_INSPIRATION_AREAS.map(area => ({
  label: areaLabel(area.id),
  value: area.id,
})))

const full = inspiration.full
const canAct = computed(() => !props.disabled && !busy.value)

interface FetchErrorLike {
  status?: number
  statusCode?: number
  response?: { status?: number }
  data?: { reason?: string }
}

/**
 * Der fachliche Grund reist als `data.code` durch den zentralen Fehler-Handler
 * und kommt als `error.data.reason` an (CLAUDE.md). Unbekanntes fällt auf den
 * allgemeinen Satz zurück — ein leerer Hinweis wäre schlimmer als ein
 * ungenauer.
 */
function messageKey(error: unknown): string {
  const value = error as FetchErrorLike | null
  const status = value?.status ?? value?.statusCode ?? value?.response?.status ?? 0
  const reason = typeof value?.data?.reason === 'string' ? value.data.reason : ''
  if (reason === 'inspiration_too_large' || status === 413) return 'tooLarge'
  if (reason === 'inspiration_unsupported_type' || status === 415) return 'unsupportedType'
  if (reason === 'inspiration_limit_reached') return 'limitReached'
  if (reason === 'inspiration_area_invalid') return 'areaInvalid'
  if (reason === 'inspiration_note_too_long') return 'noteTooLong'
  if (status === 429) return 'rateLimited'
  if (status === 404) return 'notFound'
  return 'generic'
}

const base = computed(() => inspiration.base)

async function load(): Promise<void> {
  loading.value = true
  try {
    await inspiration.load()
    errorKey.value = ''
  }
  catch (error) {
    errorKey.value = messageKey(error)
  }
  finally {
    loading.value = false
  }
}

onMounted(load)

/**
 * DIE ABLAGEFLÄCHE. `UFileUpload` liefert die Auswahl als `File[]`; die Liste
 * wird sofort geleert, damit dieselbe Datei ein zweites Mal gewählt werden
 * kann (der Wähler meldet sonst keine Änderung).
 *
 * DIE GRÖSSE WIRD SCHON HIER GEPRÜFT — nicht statt der Route, sondern vor ihr:
 * 20 MB durch die Leitung zu schicken, um sie mit 413 zurückzubekommen, ist
 * eine Minute Warten für eine Absage, die man sofort geben kann. Der Server
 * misst dieselbe Zahl noch einmal (`BRAND_INSPIRATION_MAX_BYTES`, dieselbe
 * Konstante).
 */
const picked = ref<File[]>([])

watch(picked, async (files) => {
  if (!files?.length) return
  picked.value = []
  await addFiles(files)
})

async function addFiles(files: readonly File[]): Promise<void> {
  if (!canAct.value) return
  busy.value = true
  errorKey.value = ''
  try {
    for (const file of files) {
      if (items.value.length >= BRAND_INSPIRATION_MAX) {
        errorKey.value = 'limitReached'
        break
      }
      if (file.size > BRAND_INSPIRATION_MAX_BYTES) {
        errorKey.value = 'tooLarge'
        continue
      }
      const form = new FormData()
      form.append('file', file)
      // Der Bereich ist Pflicht (Route: 400) — vorbelegt mit dem ersten aus
      // dem Vokabular, änderbar an der Karte. Ein Bild ohne Bereich könnte
      // nicht abgelegt werden, und ein Auswahl-Dialog VOR dem Upload machte
      // aus einem Ablegen einen Formular-Vorgang.
      form.append('area', BRAND_INSPIRATION_AREAS[0]?.id ?? 'color')
      form.append('note', '')
      try {
        const res = await $fetch<BrandInspirationWriteResponse>(base.value, {
          method: 'POST',
          body: form,
        })
        inspiration.setItems(res.items)
      }
      catch (error) {
        errorKey.value = messageKey(error)
      }
    }
  }
  finally {
    busy.value = false
  }
}

async function patchItem(id: string, body: { area?: string, note?: string }): Promise<void> {
  if (!canAct.value) return
  busy.value = true
  try {
    const res = await $fetch<BrandInspirationWriteResponse>(
      `${base.value}/${encodeURIComponent(id)}`,
      { method: 'PATCH', body },
    )
    inspiration.setItems(res.items)
    errorKey.value = ''
  }
  catch (error) {
    errorKey.value = messageKey(error)
  }
  finally {
    busy.value = false
  }
}

async function removeItem(id: string): Promise<void> {
  if (!canAct.value) return
  busy.value = true
  try {
    const res = await $fetch<BrandInspirationWriteResponse>(
      `${base.value}/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    )
    inspiration.setItems(res.items)
    errorKey.value = ''
  }
  catch (error) {
    errorKey.value = messageKey(error)
  }
  finally {
    busy.value = false
  }
}

/**
 * Die Notiz wird beim Verlassen des Feldes geschickt, nicht bei jedem
 * Tastendruck: 240 Zeichen sind sonst 240 Aufrufe, und der Eimer
 * (`brand:inspiration`, 12/min) wäre nach dem dritten Wort leer. Unverändert ⇒
 * gar kein Aufruf (die Route hätte ihn ohnehin als No-op erkannt, aber ein
 * Aufruf, den man nicht braucht, kostet trotzdem einen Zug im Eimer).
 */
function commitNote(entry: BrandInspirationEntry, value: string): void {
  const next = value.slice(0, BRAND_INSPIRATION_NOTE_MAX)
  if (next === entry.note) return
  void patchItem(entry.id, { note: next })
}

function imageSrc(entry: BrandInspirationEntry): string {
  return `${base.value}/${encodeURIComponent(entry.id)}/image?v=${encodeURIComponent(entry.createdAt)}`
}
</script>

<template>
  <section data-brand-inspiration>
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 class="text-xl font-medium">{{ t('brand.inspiration.title') }}</h2>
      <span class="bw-label ms-auto tabular-nums" style="color: var(--bw-muted)">
        {{ t('brand.inspiration.counter', { count: items.length, max: BRAND_INSPIRATION_MAX }) }}
      </span>
    </div>
    <p class="bw-doc-text mt-2">{{ t('brand.inspiration.intro') }}</p>

    <p v-if="loading" class="bw-pending mt-4">{{ t('brand.inspiration.loading') }}</p>

    <div v-else class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="entry in items" :key="entry.id"
        class="bw-frame flex flex-col gap-3 p-3" style="background: var(--bw-surface)"
      >
        <!-- Das Bild kommt aus der eigenen Route (s. Kopf) — nie aus dem
             Bucket, nie aus einer Object-URL. -->
        <img
          :src="imageSrc(entry)"
          :alt="t('brand.inspiration.itemLabel', { number: entry.number })"
          class="aspect-[4/3] w-full rounded-xl object-cover"
          style="background: var(--bw-surface-hi)"
          loading="lazy"
        >
        <div class="flex items-start gap-2">
          <div class="min-w-0 flex-1 leading-tight">
            <p class="text-sm font-medium">
              {{ t('brand.inspiration.itemLabel', { number: entry.number }) }}
            </p>
            <p class="bw-label truncate" style="color: var(--bw-muted)">{{ entry.filename }}</p>
          </div>
          <UButton
            size="xs" color="neutral" variant="ghost" icon="i-ph-x" class="rounded-full"
            :disabled="!canAct"
            :aria-label="t('brand.inspiration.remove', { number: entry.number })"
            @click="removeItem(entry.id)"
          />
        </div>
        <!-- Der Bereich ist EINE Wahl je Bild — eine Auswahl statt fünf Chips,
             damit die Karte in der Dreier-Reihe eine Zeile dafür braucht
             (Prototyp). -->
        <USelect
          :model-value="entry.area" :items="areaItems" size="sm"
          value-key="value" :ui="{ base: 'bw-frame' }"
          :disabled="!canAct"
          :aria-label="t('brand.inspiration.areaLabel', { number: entry.number })"
          @update:model-value="value => patchItem(entry.id, { area: String(value) })"
        />
        <UInput
          :model-value="entry.note" size="sm"
          :maxlength="BRAND_INSPIRATION_NOTE_MAX"
          :placeholder="t('brand.inspiration.notePlaceholder')"
          :ui="{ base: 'bw-frame' }"
          :disabled="!canAct"
          :aria-label="t('brand.inspiration.noteLabel', { number: entry.number })"
          @blur="event => commitNote(entry, (event.target as HTMLInputElement).value)"
        />
      </div>

      <UFileUpload
        v-if="!full"
        v-model="picked"
        multiple
        :accept="BRAND_INSPIRATION_ACCEPT"
        :disabled="!canAct"
        :label="t('brand.inspiration.add')"
        :description="t('brand.inspiration.formats')"
        icon="i-ph-upload-simple"
        class="min-h-48"
      />
    </div>

    <div class="mt-4 flex flex-col gap-2">
      <p class="bw-pending">{{ t('brand.inspiration.limits', { max: BRAND_INSPIRATION_MAX }) }}</p>
      <p v-if="errorKey" class="text-sm" style="color: var(--bw-stale)">
        {{ t(`brand.inspiration.error.${errorKey}`) }}
      </p>
      <p class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
        <UIcon name="i-ph-eye-slash" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
        <span class="min-w-0">{{ t('brand.inspiration.privacy') }}</span>
      </p>
    </div>
  </section>
</template>
