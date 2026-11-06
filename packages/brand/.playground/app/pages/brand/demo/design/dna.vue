<script setup lang="ts">
import {
  type DsInspiration,
  type DsInspirationArea,
  type DsReadingVerdict,
  DS_BOARDS,
  DS_DNA_DIMENSIONS,
  DS_DNA_PROPOSAL,
  DS_INSPIRATION_AREAS,
  DS_INSPIRATION_LIMITS,
  DS_INSPIRATION_PRIVACY,
  DS_INSPIRATIONS,
  DS_READING_SUMMARY,
  DS_READING_VERDICTS,
  DS_READINGS,
  dsAreaLabel,
  dsDnaLabel,
  dsSceneColors,
  dsSceneFonts,
} from '../../../../utils/demoDesign'

/**
 * KAPITEL „MOODBOARD" (Konzept docs/archiv/BRAND-DESIGN.md §2.2, Prototyp-
 * Screen 1) — Visual DNA, drei Boards nebeneinander, Mix & Match.
 *
 * DIE DREI SESSIONS STEHEN UNTEREINANDER auf EINER Bühne und nicht als
 * Reiter: sie bauen aufeinander auf (Vorschlag ⇒ Varianten ⇒ Feinschliff),
 * und wer beim Mix steht, muss den Vorschlag darüber noch sehen können.
 *
 * MIX & MATCH IST DAS LOCK-MUSTER von Huemint/Fontjoy (Marktbefund §1.7):
 * festhalten, was gefällt — der Rest wird neu vorgeschlagen. Neu vorgeschlagen
 * heisst hier: aus einem der drei Boards, nicht aus dem Nichts. Ein Würfel
 * über 10 × 5 Werten erzeugt Kombinationen, die niemand verantwortet.
 */
const boards = DS_BOARDS

/**
 * ── DIE WEICHE (`g.source`, Davids Entscheidung 2026-09-08) ───────────────
 * Richtung aus ZWEI Quellen: der Foundation und den Vorbildern des Kunden.
 * „Vorbilder" ist die Vorgabe des Dummys, weil sie den neuen Weg zeigt; der
 * andere Weg ist über `?quelle=foundation` erreichbar und überspringt nur
 * Upload und Lesung — die DNA darunter ist dieselbe, nur ohne Vorbild-Bezug.
 */
type DnaSource = 'inspiration' | 'foundation'
const route = useRoute()
const dnaSource = ref<DnaSource>(route.query.quelle === 'foundation' ? 'foundation' : 'inspiration')
const withInspiration = computed(() => dnaSource.value === 'inspiration')

const SOURCE_OPTIONS: { id: DnaSource, label: string, note: string, icon: string }[] = [
  { id: 'inspiration', label: 'Wir haben Vorbilder', note: 'Screenshots, Pinterest, drei Websites, die euch gefallen. Frida liest sie gegen eure Foundation.', icon: 'i-ph-images' },
  { id: 'foundation', label: 'Frida schlägt vor', note: 'Die Richtung kommt allein aus der Foundation — Archetyp, Werte, Ton-Wörter, Positionierung.', icon: 'i-ph-compass' },
]

/**
 * ── VORBILDER (`g.inspiration`) ──────────────────────────────────────────
 * Fünf Attrappen als Vorbelegung. Eigene Dateien kommen über den Datei-Wähler
 * als Object-URL dazu — nur im Browser, nichts verlässt den Tab (Klickdummy,
 * kein Upload). Der Bereich-Chip ist Pflicht: die Lesung braucht ihn.
 */
interface InspirationItem extends DsInspiration {
  src?: string | null
}
const items = ref<InspirationItem[]>(DS_INSPIRATIONS.map(item => ({ ...item })))
const MAX_ITEMS = 12
const fileInput = ref<HTMLInputElement | null>(null)

function pickFiles(): void {
  fileInput.value?.click()
}

function addFiles(event: Event): void {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  for (const file of files) {
    if (items.value.length >= MAX_ITEMS) break
    if (!file.type.startsWith('image/')) continue
    const number = (items.value.at(-1)?.number ?? 0) + 1
    items.value.push({
      id: `u${number}`,
      number,
      filename: file.name,
      area: 'color',
      note: '',
      kind: 'site',
      colors: ['#eeeeee', '#333333', '#999999', '#cccccc'],
      src: URL.createObjectURL(file),
    })
  }
  input.value = ''
}

function removeItem(id: string): void {
  const item = items.value.find(entry => entry.id === id)
  if (item?.src) URL.revokeObjectURL(item.src)
  items.value = items.value.filter(entry => entry.id !== id)
}

const areaItems = DS_INSPIRATION_AREAS.map(area => ({ label: area.label, value: area.id }))

function setArea(id: string, area: DsInspirationArea): void {
  const item = items.value.find(entry => entry.id === id)
  if (item) item.area = area
}

/**
 * ── LESUNG (`g.reading`) ──────────────────────────────────────────────────
 * Die Lesung ist GESCHRIEBEN, nicht erzeugt (Klickdummy). Sie hängt am Bild:
 * ein entferntes Vorbild nimmt seine Lesung mit, ein neu hochgeladenes hat
 * noch keine — dafür steht der Knopf „Vorbilder lesen", der im Produkt den
 * Vision-Lauf startet (Drossel: DS_INSPIRATION_LIMITS).
 */
const readings = computed(() => items.value
  .map(item => ({ item, reading: DS_READINGS.find(reading => reading.inspirationId === item.id) ?? null })))
const unread = computed(() => readings.value.filter(entry => !entry.reading).length)
const verdictCount = computed(() => {
  const count: Record<DsReadingVerdict, number> = { fits: 0, tension: 0, off: 0 }
  for (const entry of readings.value) if (entry.reading) count[entry.reading.verdict] += 1
  return count
})

function dimensionLabel(id: string): string {
  return DS_DNA_DIMENSIONS.find(dimension => dimension.id === id)?.label ?? id
}

/** Herkunfts-Chip einer DNA-Zeile — ohne Vorbilder ist jede Zeile Foundation. */
function originLabel(origin: 'foundation' | 'inspiration' | 'both'): string {
  if (!withInspiration.value) return 'Foundation'
  return origin === 'both' ? 'Foundation + Vorbild' : origin === 'inspiration' ? 'Vorbild' : 'Foundation'
}

/** Die Wahl aus `g.board` — Ausgangspunkt für alles Weitere. */
const chosenBoard = ref(boards[0]!.id)

/** Je Dimension: aus WELCHEM Board der Wert kommt (`g.mix`). */
const source = ref<Record<string, string>>(
  Object.fromEntries(DS_DNA_DIMENSIONS.map(dimension => [dimension.id, boards[0]!.id])),
)
/** Festgehalten = beim Neu-Vorschlagen unangetastet. */
const held = ref<Record<string, boolean>>(
  Object.fromEntries(DS_DNA_DIMENSIONS.map(dimension => [dimension.id, false])),
)

/* Ein Board-Wechsel setzt den Mix zurück — alles andere wäre eine Mischung
 * aus einer Wahl, die es nicht mehr gibt. Festgehaltene bleiben festgehalten:
 * genau dafür hat man sie festgehalten. */
watch(chosenBoard, (id) => {
  for (const dimension of DS_DNA_DIMENSIONS) {
    if (!held.value[dimension.id]) source.value[dimension.id] = id
  }
})

function boardById(id: string) {
  return boards.find(board => board.id === id) ?? boards[0]!
}

/** „Nicht festgehaltene neu vorschlagen": jede offene Dimension rückt ein
 *  Board weiter — deterministisch, damit zweimal Klicken nachvollziehbar ist. */
function resuggest(): void {
  for (const dimension of DS_DNA_DIMENSIONS) {
    if (held.value[dimension.id]) continue
    const current = boards.findIndex(board => board.id === source.value[dimension.id])
    source.value[dimension.id] = boards[(current + 1) % boards.length]!.id
  }
}

const heldCount = computed(() => Object.values(held.value).filter(Boolean).length)

/* Die Szene des Mixes: Farbwelt kommt aus dem Board der Dimension
 * „Farb-Charakter", Typografie aus dem Board der Dimension „Typografie" —
 * Davids Satz „Farbwelt aus 1, Typografie aus 3", wörtlich verdrahtet. */
const mixColorBoard = computed(() => boardById(source.value.color ?? chosenBoard.value))
const mixTypeBoard = computed(() => boardById(source.value.typography ?? chosenBoard.value))
const mixColors = computed(() => dsSceneColors(mixColorBoard.value.base, mixColorBoard.value.accent, mixColorBoard.value.base))
const mixFonts = computed(() => dsSceneFonts(mixTypeBoard.value.fontPairId))

/** Womit sich ein Board vom Vorschlag unterscheidet — die Karte sagt es. */
function differences(boardId: string): string[] {
  const board = boardById(boardId)
  return DS_DNA_DIMENSIONS
    .filter(dimension => board.values[dimension.id] !== boards[0]!.values[dimension.id])
    .map(dimension => dimension.label)
}

/* Je Board eine fertige Szene — der Neutral-Ton kommt aus der Basisfarbe
 * (getönt), wie es die Farbwelt-Seite später als Vorgabe anbietet. */
const boardScenes = computed(() => boards.map(board => ({
  board,
  colors: dsSceneColors(board.base, board.accent, board.base),
  fonts: dsSceneFonts(board.fontPairId),
})))
</script>

<template>
  <FdDesignWorkspace chapter="dna">
    <!-- ── g.source: die Weiche — woher die Richtung kommt ─────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Woher die Richtung kommt</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">g.source · Weiche</span>
      </div>
      <p class="bw-doc-text mt-2">
        Niemand fängt mit der Palette an. Vor Farbe und Schrift steht eine Richtung — aus eurer Strategie, und wenn ihr welche habt, aus euren Vorbildern. Beides landet in derselben Visual DNA; die Foundation bleibt der Maßstab.
      </p>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          v-for="option in SOURCE_OPTIONS" :key="option.id"
          type="button"
          class="bw-choice-card flex w-full items-start gap-3 rounded-2xl p-4 text-left"
          :class="dnaSource === option.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="dnaSource === option.id"
          @click="dnaSource = option.id"
        >
          <UIcon :name="option.icon" class="mt-0.5 size-5 flex-none" style="color: var(--bw-ink-soft)" />
          <span class="min-w-0 flex-1">
            <span class="flex items-start justify-between gap-2">
              <span class="text-sm font-medium">{{ option.label }}</span>
              <UIcon v-if="dnaSource === option.id" name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
            </span>
            <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ option.note }}</span>
          </span>
        </button>
      </div>
    </section>

    <!-- ── g.inspiration: Vorbilder je Bereich ─────────────────────────── -->
    <section v-if="withInspiration">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Eure Vorbilder</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">g.inspiration · {{ items.length }} von {{ MAX_ITEMS }}</span>
      </div>
      <p class="bw-doc-text mt-2">
        Screenshots von allem, was euch gefällt — je Bild sagt ihr nur, <em>was</em> daran: Farbwelt, Typografie, Zeichen, Bildsprache oder Komposition. Ein Satz dazu hilft, ist aber nicht Pflicht.
      </p>

      <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="item in items" :key="item.id"
          class="bw-frame flex flex-col gap-3 p-3" style="background: var(--bw-surface)"
        >
          <FdInspirationThumb :item="item" :src="item.src" />
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1 leading-tight">
              <p class="text-sm font-medium">Vorbild {{ item.number }}</p>
              <p class="bw-label truncate" style="color: var(--bw-muted)">{{ item.filename }}</p>
            </div>
            <UButton
              size="xs" color="neutral" variant="ghost" icon="i-ph-x" class="rounded-full"
              :aria-label="`Vorbild ${item.number} entfernen`" @click="removeItem(item.id)"
            />
          </div>
          <!-- Der Bereich ist EINE Wahl je Bild — ein Select statt fünf Chips,
               damit die Karte in der Dreier-Reihe eine Zeile dafür braucht. -->
          <USelect
            :model-value="item.area" :items="areaItems" size="sm"
            value-key="value" :ui="{ base: 'bw-frame' }"
            :aria-label="`Bereich von Vorbild ${item.number}`"
            @update:model-value="value => setArea(item.id, value as DsInspirationArea)"
          />
          <UInput
            v-model="item.note" size="sm" placeholder="Was gefällt euch daran? (optional)"
            :ui="{ base: 'bw-frame' }"
          />
        </div>

        <!-- Die Ablagefläche: echte Dateien aus dem Browser, nur im Tab. -->
        <button
          v-if="items.length < MAX_ITEMS"
          type="button"
          class="bw-frame flex min-h-48 flex-col items-center justify-center gap-2 p-4 text-center"
          style="border: 1px dashed var(--bw-line-strong); background: transparent"
          @click="pickFiles"
        >
          <UIcon name="i-ph-upload-simple" class="size-6" style="color: var(--bw-muted)" />
          <span class="text-sm font-medium">Screenshots hinzufügen</span>
          <span class="bw-label" style="color: var(--bw-muted)">PNG, JPG, WebP · bis 5 MB je Bild</span>
        </button>
        <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" multiple class="hidden" @change="addFiles">
      </div>

      <div class="mt-4 flex flex-col gap-2">
        <p class="bw-pending">{{ DS_INSPIRATION_LIMITS }}</p>
        <p class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
          <UIcon name="i-ph-eye-slash" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
          <span class="min-w-0">{{ DS_INSPIRATION_PRIVACY }}</span>
        </p>
      </div>
    </section>

    <!-- ── g.reading: die Lesung gegen die Foundation ───────────────────── -->
    <section v-if="withInspiration">
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Was Frida darin liest</h2>
        <span class="bw-state bw-state--confirmed"><UIcon name="i-ph-check" /> gelesen</span>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">g.reading · {{ DS_READING_SUMMARY.run }}</span>
      </div>
      <p class="bw-doc-text mt-2">
        Jedes Vorbild wird an eurer Foundation gemessen, nicht umgekehrt: Was trägt schon, weil es zu Archetyp, Werten und Ton passt — und was geht besser? Die Stelle, an der gemessen wurde, steht bei jedem Urteil.
      </p>

      <!-- Das Fazit zuerst: zwei Listen, wie David es gesagt hat. -->
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div class="bw-frame px-5 py-4" style="background: var(--bw-surface)">
          <p class="bw-label" style="color: var(--bw-accent)">Trägt schon · {{ verdictCount.fits }}</p>
          <ul class="mt-2 flex flex-col gap-1.5">
            <li v-for="line in DS_READING_SUMMARY.keeps" :key="line" class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              <UIcon name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
              <span class="min-w-0">{{ line }}</span>
            </li>
          </ul>
        </div>
        <div class="bw-frame px-5 py-4" style="background: var(--bw-surface)">
          <p class="bw-label" style="color: var(--bw-draft)">Geht besser · {{ verdictCount.tension + verdictCount.off }}</p>
          <ul class="mt-2 flex flex-col gap-1.5">
            <li v-for="line in DS_READING_SUMMARY.improves" :key="line" class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              <UIcon name="i-ph-arrow-bend-down-right" class="mt-0.5 size-4 flex-none" style="color: var(--bw-draft)" />
              <span class="min-w-0">{{ line }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Je Bild: Beobachtung, Urteil, Foundation-Stelle, Vorschlag. -->
      <div class="mt-4 flex flex-col gap-2">
        <div
          v-for="entry in readings" :key="entry.item.id"
          class="bw-frame grid gap-x-4 gap-y-3 p-4 sm:grid-cols-[9rem_minmax(0,1fr)]"
          style="background: var(--bw-surface)"
        >
          <div class="min-w-0">
            <FdInspirationThumb :item="entry.item" :src="entry.item.src" />
            <p class="mt-2 text-sm font-medium">Vorbild {{ entry.item.number }}</p>
            <p class="bw-label" style="color: var(--bw-muted)">{{ dsAreaLabel(entry.item.area) }}</p>
          </div>
          <div v-if="entry.reading" class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="bw-state" :class="`bw-state--${DS_READING_VERDICTS[entry.reading.verdict].tone}`">
                <UIcon :name="DS_READING_VERDICTS[entry.reading.verdict].icon" /> {{ DS_READING_VERDICTS[entry.reading.verdict].label }}
              </span>
              <span class="bw-label" style="color: var(--bw-muted)">gemessen an: {{ entry.reading.anchor }}</span>
            </div>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="obs in entry.reading.observed" :key="obs.dimension" class="bw-chip bw-chip--quiet" style="cursor: default">
                {{ dimensionLabel(obs.dimension) }}: {{ dsDnaLabel(obs.dimension, obs.value) }}
              </span>
            </div>
            <p class="mt-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.reading.reason }}</p>
            <p v-if="entry.reading.suggestion" class="mt-2 flex items-start gap-2 text-sm leading-relaxed">
              <UIcon name="i-ph-arrow-bend-down-right" class="mt-0.5 size-4 flex-none" style="color: var(--bw-draft)" />
              <span class="min-w-0">{{ entry.reading.suggestion }}</span>
            </p>
          </div>
          <div v-else class="flex min-w-0 flex-col justify-center gap-2">
            <span class="bw-state bw-state--draft">Noch nicht gelesen</span>
            <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">Kommt mit dem nächsten Lauf dazu.</p>
          </div>
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-sparkle" :label="unread ? `${unread} neue Vorbilder lesen` : 'Vorbilder erneut lesen'"
          color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
        />
        <p class="bw-pending">Klickdummy: die Lesung ist geschrieben, nicht erzeugt — im Produkt läuft hier der Vision-Lauf (ZDR, Drossel wie oben).</p>
      </div>
    </section>

    <!-- ── g.dna: der Vorschlag, zehn Zeilen mit Begründung und Herkunft ── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Visual DNA</h2>
        <span class="bw-state bw-state--confirmed"><UIcon name="i-ph-check" /> bestätigt</span>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">g.dna · zehn Dimensionen</span>
      </div>
      <p class="bw-doc-text mt-2">
        Zehn Eigenschaften, die sich nicht gegenseitig erklären. Jede ist aus eurer Foundation hergeleitet<template v-if="withInspiration"> — und dort, wo ein Vorbild sie bestätigt oder korrigiert, steht das dabei</template>. Die Begründung steht daneben, damit ihr widersprechen könnt.
      </p>

      <div class="mt-4 flex flex-col gap-2">
        <div
          v-for="entry in DS_DNA_PROPOSAL" :key="entry.dimension"
          class="bw-frame grid gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[10rem_9rem_minmax(0,1fr)]"
          style="background: var(--bw-surface)"
        >
          <p class="text-sm font-medium">{{ DS_DNA_DIMENSIONS.find(d => d.id === entry.dimension)?.label }}</p>
          <p class="text-sm" style="color: var(--bw-ink)">{{ dsDnaLabel(entry.dimension, entry.value) }}</p>
          <div class="min-w-0">
            <p class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.reason }}</p>
            <p v-if="withInspiration && entry.inspirationReason" class="mt-1 flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
              <UIcon name="i-ph-images" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
              <span class="min-w-0">{{ entry.inspirationReason }}</span>
            </p>
            <!-- Herkunft (§2.2 Leitplanke e): jede Zeile sagt, woher sie kommt. -->
            <p class="bw-label mt-1.5" style="color: var(--bw-muted)">Herkunft: {{ originLabel(entry.origin) }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── g.boards + g.board: drei Boards nebeneinander ────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Drei Moodboards</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">g.boards · g.board</span>
      </div>
      <p class="bw-doc-text mt-2">
        Dieselbe DNA in drei Stärken. Alle drei zeigen dieselbe Anwendung — Kopf, Überschrift, Knopf, Karte, Rampe —, damit ihr an der Sache vergleicht und nicht an drei verschiedenen Bildern.
      </p>

      <div class="mt-4 grid gap-4 lg:grid-cols-3">
        <button
          v-for="entry in boardScenes" :key="entry.board.id"
          type="button"
          class="bw-choice-card block w-full rounded-2xl p-3 text-left"
          :class="chosenBoard === entry.board.id ? 'bw-choice-card--selected' : ''"
          :aria-pressed="chosenBoard === entry.board.id"
          @click="chosenBoard = entry.board.id"
        >
          <FdDesignScene compact :colors="entry.colors" :fonts="entry.fonts" scheme="light" />
          <span class="mt-3 flex items-start justify-between gap-2">
            <span class="text-sm font-medium">{{ entry.board.name }}</span>
            <UIcon
              v-if="chosenBoard === entry.board.id" name="i-ph-check-circle-fill"
              class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)"
            />
          </span>
          <span class="mt-1 block text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ entry.board.note }}</span>
          <span v-if="differences(entry.board.id).length" class="bw-label mt-2 block" style="color: var(--bw-muted)">
            Anders als der Vorschlag: {{ differences(entry.board.id).join(' · ') }}
          </span>
          <span v-else class="bw-label mt-2 block" style="color: var(--bw-muted)">Der Vorschlag selbst</span>
        </button>
      </div>
    </section>

    <!-- ── g.mix: festhalten, tauschen, neu vorschlagen ─────────────────── -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Mix &amp; Match</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">g.mix · {{ heldCount }} von {{ DS_DNA_DIMENSIONS.length }} festgehalten</span>
      </div>
      <p class="bw-doc-text mt-2">
        Haltet fest, was sitzt — den Rest schlage ich neu vor. „Farbwelt aus Board 1, Typografie aus Board 3" ist hier kein Sonderfall, sondern der Normalweg.
      </p>

      <div class="mt-4 flex flex-col gap-2">
        <div
          v-for="dimension in DS_DNA_DIMENSIONS" :key="dimension.id"
          class="bw-frame grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
          style="background: var(--bw-surface)"
        >
          <div class="min-w-0">
            <p class="text-sm font-medium">{{ dimension.label }}</p>
            <p class="bw-label" style="color: var(--bw-muted)">{{ dimension.hint }}</p>
          </div>
          <!-- Untereinander statt umbrechend (Davids Korrektur 2026-09-08): drei
               Optionen je Dimension lesen sich als Liste, nicht als Zeile —
               so steht „wie vorgeschlagen" immer an derselben Stelle. -->
          <div class="flex flex-col items-start gap-1.5">
            <button
              v-for="board in boards" :key="board.id"
              type="button"
              class="bw-chip"
              :class="source[dimension.id] === board.id ? 'bw-chip--selected' : ''"
              :aria-pressed="source[dimension.id] === board.id"
              @click="source[dimension.id] = board.id"
            >
              {{ dsDnaLabel(dimension.id, board.values[dimension.id] ?? '') }}
              <span class="bw-label ms-1" style="color: var(--bw-muted)">{{ board.name }}</span>
            </button>
          </div>
          <UButton
            size="xs" color="neutral" :variant="held[dimension.id] ? 'solid' : 'ghost'"
            class="rounded-full justify-self-end"
            :icon="held[dimension.id] ? 'i-ph-lock-simple-fill' : 'i-ph-lock-simple-open'"
            :label="held[dimension.id] ? 'Festgehalten' : 'Festhalten'"
            @click="held[dimension.id] = !held[dimension.id]"
          />
        </div>
      </div>

      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UButton
          icon="i-ph-sparkle" label="Nicht festgehaltene neu vorschlagen"
          color="neutral" variant="outline" class="rounded-full"
          style="background: var(--bw-surface-hi)" @click="resuggest"
        />
        <p class="bw-pending">Klickdummy: schaltet nur den Zustand um — im Produkt fragt der Knopf Frida.</p>
      </div>
    </section>

    <!-- Die Szene des MIXES: was aus der Mischung geworden ist. -->
    <section>
      <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 class="text-xl font-medium">Euer Stand</h2>
        <span class="bw-label ms-auto" style="color: var(--bw-muted)">
          Farbwelt aus „{{ mixColorBoard.name }}" · Typografie aus „{{ mixTypeBoard.name }}"
        </span>
      </div>
      <div class="mt-3">
        <FdDesignScene :colors="mixColors" :fonts="mixFonts" />
      </div>
      <p class="bw-pending mt-3">
        Diese Belegung ist die Vorbelegung aller folgenden Kapitel — Farbwelt, Typografie, Zeichen, Bildsprache und Bewegung fangen damit an.
      </p>
    </section>
  </FdDesignWorkspace>
</template>
