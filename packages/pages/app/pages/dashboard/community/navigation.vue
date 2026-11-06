<script setup lang="ts">
/**
 * DAS MENÜ DER COMMUNITY ZUSAMMENSTELLEN (U15 Teil 1, Davids Zuschnitt vom
 * 2026-08-13; UNTERPUNKTE seit U15 Teil 3, Davids Entscheidung 2026-09-08,
 * DECISION-LOG „Navigation anpassen") — Reiter des Community-Hubs.
 *
 * ── WARUM DIE SEITE IM pages-LAYER LIEGT ──────────────────────────────────
 * Dieselbe Regel wie überall (A14, „eine Seite reicht nur so weit wie ihre
 * Routen"), und hier fällt sie eindeutig aus:
 *
 *  - Die Schreib-Route (`PATCH /api/pages/navigation`) braucht KEINE Naht ins
 *    Control Plane — die Wahrheit steht im Runtime-Projekt. Damit entfällt der
 *    Grund, aus dem Branding und Mitglieder im onboarding-Layer sitzen.
 *  - Der Link-Wähler braucht die VERÖFFENTLICHTEN SEITEN dieser Community, und
 *    die gehören diesem Layer.
 *  - Der Layer hat sich hier selbst angekündigt: der Kommentar an
 *    `pukalani.admin.modules` sagt seit E9 „die Seiten SIND die Website einer
 *    Community; Navigation kommt später als zweiter Eintrag dazu".
 *
 * Die Registry-EINTRÄGE gehören trotzdem nicht diesem Layer, und das muss auch
 * so bleiben: die Liste kommt über `useCommunityNav()` aus core und weiss von
 * keinem Produkt-Layer etwas. Ihre Ids sind für sie undurchsichtige Schlüssel.
 *
 * ── DIE ANGEBOTENE LISTE KOMMT AUS `useCommunityNav()` ────────────────────
 * Sie ist WORT FÜR WORT dieselbe, die auch die öffentliche Seite rendert — seit
 * U15 Teil 3 nicht mehr, weil hier dieselben Zeilen stehen, sondern weil es sie
 * nur noch EINMAL gibt (core/app/composables/useCommunityNav.ts). Böte der
 * Editor eine andere Liste an als die Seite zeigt, verspräche er Einträge, die
 * nie erscheinen — oder verschwiege welche, die es tun. Genau das ist zwischen
 * Layout und Editor schon einmal auseinandergelaufen.
 *
 * ── KEINE `UTable`, UND DER GRUND STEHT HIER ──────────────────────────────
 * `UTable` ist der Standard für Datenlisten im Dashboard (Davids Entscheidung
 * B6). Diese Liste ist keine: sie hat keine Sortierung (die REIHENFOLGE IST
 * der Inhalt), keine Auswahl und keine Seiten. Ihre Kernhandlung ist das
 * Ziehen, und ein sortierbares Raster, dessen Sortierung man nicht benutzen
 * darf, wäre eine Bedienhilfe, die in die Irre führt. Gezogen wird nativ
 * (HTML5, wie das Ticket-Board) — dazu Pfeiltasten-Knöpfe, denn eine
 * Reihenfolge, die nur mit der Maus zu ändern ist, kann ein Teil der Leute
 * gar nicht ändern. Für die Ebene gilt dasselbe: Einrücken/Ausrücken sind
 * Knöpfe, nicht nur eine Zieh-Gebärde.
 *
 * ── DREI DINGE AN DIESER SEITE, DIE MAN NICHT „AUFRÄUMEN" DARF ────────────
 *
 * (1) **GESPEICHERTE, GERADE NICHT VERFÜGBARE EINTRÄGE BLEIBEN STEHEN**
 *     (gedimmt, mit Hinweis) — Zusage 2 von `resolveCommunityNav`. Würde der
 *     Editor eine Zeile weglassen, deren Produkt gerade abgeschaltet ist,
 *     LÖSCHTE das nächste Speichern sie endgültig, und mit ihr die
 *     Entscheidung, die der Owner einmal getroffen hat.
 * (2) **`normalize()` LÄUFT NACH JEDER ÄNDERUNG.** Die Anzeige ist gruppiert
 *     (Hauptpunkt, direkt darunter seine Kinder) — und weil genau diese
 *     Reihenfolge auch gespeichert wird, gibt es keinen zweiten, unsichtbaren
 *     Zustand daneben. Sie löst dabei auch ungültige Elternschaft auf (Ebene
 *     zwei, verschwundener Hauptpunkt), damit hier nie ein Dokument entsteht,
 *     das das Schema ablehnt.
 * (3) **AUSGEBLENDETE Hauptpunkte bleiben Hauptpunkte** — die Kinder rutschen
 *     im Editor NICHT heraus, sondern bekommen den Hinweis, dass sie auf der
 *     Seite als Hauptpunkt erscheinen (Zusage 6, fail-soft). Sonst hätte
 *     „ausblenden" die Gruppierung stillschweigend zerstört.
 */
import {
  MAX_NAV_LABEL,
  type CommunityNavOverride,
  type CommunityNavOverrideEntry,
  isGroupNavId,
  isSafeExternalNavTarget,
  nextCustomNavLinkId,
  nextGroupNavId,
  resolveCommunityNav,
} from '../../../../../core/shared/communityNavigation'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'branding.manage' })

const { t } = useI18n()
const toast = useToast()

useBrandTitle(() => t('pages.navigation.title'))

/** Eine Zeile im Editor. `available: false` = gespeichert, aber gerade nicht
 *  angeboten (Produkt aus, Tarif zu klein, Seite zurückgezogen). */
interface EditorRow {
  id: string
  hidden: boolean
  /** Eigener Text; leer = die mitgelieferte Übersetzung. Bei Gruppen der Text. */
  label: string
  /** Der mitgelieferte Text (bei eigenen Links und Gruppen leer). */
  fallbackLabel: string
  /** Die Adresse zur ANZEIGE — roh, ohne Sprach-Präfix. Leer bei Gruppen. */
  to: string
  external: boolean
  /** Eigener Link ODER Gruppe: entfernbar, weil der Owner ihn angelegt hat. */
  custom: boolean
  /** Hauptpunkt ohne eigenes Ziel (`group-<n>`). */
  group: boolean
  available: boolean
  /** Id des Hauptpunkts — `null` heisst „ist selbst einer". */
  parent: string | null
}

const rows = ref<EditorRow[]>([])
const saving = ref(false)
const dragIndex = ref<number | null>(null)

/**
 * Angebot + gespeicherte Wahl — dieselbe Rechnung wie die öffentliche Seite.
 * `saved` ist der schreibbare Ref aus dem Composable: die PATCH-Antwort ist der
 * gespeicherte Zustand, und die Seite übernimmt ihn daraus statt sich ihn
 * zusammenzureimen (Muster registration.patch.ts).
 */
const { candidates, override: saved, pages: navPages, ready: navReady } = useCommunityNav()
// WARTEN IST PFLICHT (Klickbeweis 2026-09-08): `rows` entsteht unten in einem
// `watch(…, { immediate: true })`, und ein Watcher läuft auf dem Server genau
// einmal — ohne dieses `await` stünde im SSR-HTML das Menü OHNE gespeicherte
// Wahl und der Client baute es mit ihr neu (Hydration-Mismatch). Begründung am
// Feld `ready` in core/app/composables/useCommunityNav.ts.
await navReady

/** Seiten, auf die ein eigener Link zeigen darf (die Route prüft dieselbe Menge). */
const linkablePages = computed(() => [
  { label: t('pages.navigation.link.homePage'), value: '/' },
  ...(navPages.value ?? []).filter(page => page.slug !== 'home').map(page => ({
    label: page.title,
    value: `/${page.slug}`,
  })),
])

// ── Ebene und Reihenfolge ─────────────────────────────────────────────────

const rowById = computed(() => new Map(rows.value.map(row => [row.id, row])))
const childrenOf = (id: string) => rows.value.filter(row => row.parent === id)
const displayLabel = (row: EditorRow) => row.label.trim() || row.fallbackLabel

/**
 * Die Anzeige-Ordnung — und weil so gespeichert wird, auch die gespeicherte:
 * Hauptpunkte in ihrer Reihenfolge, dahinter jeweils ihre Kinder in
 * Geschwister-Reihenfolge.
 *
 * ZWEI DURCHGÄNGE beim Auflösen ungültiger Elternschaft, und die Reihenfolge
 * ist Absicht: erst fällt weg, wessen Hauptpunkt es GAR NICHT gibt (oder der
 * auf sich selbst zeigt), danach, wessen Hauptpunkt SELBST ein Kind ist. Ein
 * Durchgang würde je nach Array-Position zu verschiedenen Ergebnissen kommen —
 * dieselbe Sorte Zufall, die die Regel in core mit ihrem Zyklen-Schutz vermeidet.
 */
function normalize(list: EditorRow[]): EditorRow[] {
  const byId = new Map(list.map(row => [row.id, row]))
  for (const row of list) {
    const parent = row.parent ? byId.get(row.parent) : undefined
    if (!parent || parent.id === row.id) row.parent = null
  }
  for (const row of list) {
    const parent = row.parent ? byId.get(row.parent) : undefined
    if (parent && parent.parent !== null) row.parent = null
  }
  const out: EditorRow[] = []
  for (const row of list) {
    if (row.parent !== null) continue
    out.push(row)
    for (const child of list) {
      if (child.parent === row.id) out.push(child)
    }
  }
  return out
}

/** Der Block einer Zeile: sie selbst, und bei einem Hauptpunkt seine Kinder.
 *  Verlässt sich darauf, dass `normalize()` sie direkt dahinter gelegt hat. */
function blockOf(list: EditorRow[], row: EditorRow): [number, number] {
  const start = list.indexOf(row)
  let end = start + 1
  if (row.parent === null) {
    while (end < list.length && list[end]!.parent === row.id) end++
  }
  return [start, end]
}

const hasChildren = (row: EditorRow) => row.parent === null && rows.value.some(other => other.parent === row.id)

/**
 * Gespeicherte Wahl + Angebot ⇒ Editor-Zeilen.
 *
 * GRUPPIERT (U15 Teil 3): gespeicherte Kinder landen unter ihrem Hauptpunkt —
 * das macht `normalize()` am Ende, unabhängig davon, in welcher Reihenfolge sie
 * im Dokument stehen. Kandidaten, über die die gespeicherte Wahl NICHTS sagt,
 * hängen als HAUPTPUNKTE hinten an (Zusage 3): sichtbar am Ende ist die
 * ehrlichere Vorgabe als unsichtbar.
 */
function buildRows(): EditorRow[] {
  const byId = new Map(candidates.value.map(candidate => [candidate.id, candidate]))
  const seen = new Set<string>()
  const out: EditorRow[] = []

  for (const entry of saved.value?.entries ?? []) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    const candidate = byId.get(entry.id)
    const group = isGroupNavId(entry.id)
    const custom = entry.to !== undefined || entry.external !== undefined
    out.push({
      id: entry.id,
      hidden: entry.hidden === true,
      label: entry.label ?? '',
      fallbackLabel: candidate?.label ?? '',
      to: entry.to ?? candidate?.path ?? candidate?.to ?? '',
      external: entry.external === true,
      custom: !candidate && (custom || group),
      group: !candidate && group,
      available: !!candidate || (!candidate && (custom || group)),
      parent: typeof entry.parent === 'string' && entry.parent ? entry.parent : null,
    })
  }
  for (const candidate of [...candidates.value].sort((a, b) => a.order - b.order)) {
    if (seen.has(candidate.id)) continue
    out.push({
      id: candidate.id,
      hidden: false,
      label: '',
      fallbackLabel: candidate.label,
      to: candidate.path ?? candidate.to,
      external: false,
      custom: false,
      group: false,
      available: true,
      // ZUSAGE 9c: ein unerwähnter Kandidat bringt den Standard-Hauptpunkt aus
      // dem BAUPLAN mit (`chrome.nav.<id>.parent`) — sonst zeigte der Editor
      // eine flache Reihe, während die Seite die Gruppe rendert. Steht dieser
      // Hauptpunkt hier nicht als Zeile (oder ist selbst ein Kind), löst
      // `normalize()` am Ende die Elternschaft auf — genau dieselbe Rechnung,
      // die auch die Regel in core fail-soft macht.
      parent: candidate.parent ?? null,
    })
  }
  return normalize(out)
}

watch([saved, candidates], () => { rows.value = buildRows() }, { immediate: true })

/** Was gespeichert würde — und damit auch, was die Vorschau rechnet. */
const draft = computed<CommunityNavOverride>(() => ({
  entries: rows.value.map((row) => {
    const entry: CommunityNavOverrideEntry = { id: row.id }
    if (row.hidden) entry.hidden = true
    const label = row.label.trim()
    if (label) entry.label = label
    // Eine Gruppe hat KEIN Ziel — das Schema weist eines ausdrücklich ab.
    if (row.custom && !row.group) {
      entry.to = row.to
      if (row.external) entry.external = true
    }
    if (row.parent) entry.parent = row.parent
    return entry
  }),
}))

/** Die Vorschau rechnet mit DERSELBEN Regel wie die Seite — nicht mit einer
 *  zweiten, die „ungefähr dasselbe" tut. */
const preview = computed(() => resolveCommunityNav(candidates.value, draft.value))

// ── Umordnen: Pfeiltasten (unter Geschwistern) ────────────────────────────

const siblingsOf = (list: EditorRow[], row: EditorRow) => list.filter(other => other.parent === row.parent)

function canMove(row: EditorRow, delta: number): boolean {
  const siblings = siblingsOf(rows.value, row)
  const index = siblings.indexOf(row) + delta
  return index >= 0 && index < siblings.length
}

/**
 * Verschiebt UNTER GESCHWISTERN, nicht über rohe Array-Positionen: ein
 * Hauptpunkt springt über den nächsten Hauptpunkt (und nimmt seine Kinder mit),
 * ein Kind über das nächste Kind derselben Gruppe. Ein Pfeil, der einen
 * Hauptpunkt in eine fremde Gruppe schöbe, wäre eine Ebenen-Änderung, die
 * niemand angefordert hat.
 */
function move(row: EditorRow, delta: number) {
  if (!canMove(row, delta)) return
  const list = [...rows.value]
  const siblings = siblingsOf(list, row)
  const target = siblings[siblings.indexOf(row) + delta]!
  const [start, end] = blockOf(list, row)
  const block = list.splice(start, end - start)
  const [targetStart, targetEnd] = blockOf(list, target)
  list.splice(delta < 0 ? targetStart : targetEnd, 0, ...block)
  rows.value = normalize(list)
}

// ── Ebene: Einrücken / Ausrücken ──────────────────────────────────────────

/** Der nächste HAUPTPUNKT über dieser Zeile — der künftige Besitzer. */
function parentAbove(row: EditorRow): EditorRow | null {
  const list = rows.value
  for (let i = list.indexOf(row) - 1; i >= 0; i--) {
    const above = list[i]!
    if (above.parent === null) return above
  }
  return null
}

/** Einrücken geht nur für einen Hauptpunkt OHNE Kinder, und nur wenn über ihm
 *  einer steht — sonst entstünde Ebene zwei oder ein Kind ohne Besitzer. */
const canIndent = (row: EditorRow) => row.parent === null && !hasChildren(row) && !!parentAbove(row)

function indent(row: EditorRow) {
  const parent = parentAbove(row)
  if (!parent || !canIndent(row)) return
  row.parent = parent.id
  rows.value = normalize([...rows.value])
}

function outdent(row: EditorRow) {
  if (row.parent === null) return
  const list = [...rows.value]
  const parent = list.find(other => other.id === row.parent) ?? null
  list.splice(list.indexOf(row), 1)
  row.parent = null
  // Direkt HINTER die Gruppe des bisherigen Hauptpunkts — nicht ans Ende der
  // Liste: die Zeile soll dort auftauchen, wo der Blick gerade ist.
  list.splice(parent ? blockOf(list, parent)[1] : list.length, 0, row)
  rows.value = normalize(list)
}

// ── Ziehen: die Ebene folgt dem Nachbarn ──────────────────────────────────

function onDragStart(index: number) {
  dragIndex.value = index
}

/**
 * DIE EBENE FOLGT DEM NACHBARN: wer auf eine Zeile fällt, übernimmt deren
 * `parent`. Ein Hauptpunkt nimmt seine Kinder mit — sie hängen an seiner Id,
 * nicht an ihrer Position.
 *
 * Eine Zeile MIT Kindern kann nicht auf ein Kind fallen (sie bleibt an Ort und
 * Stelle): sie würde damit selbst zum Kind, und ihre eigenen Kinder stünden auf
 * Ebene zwei. Lieber eine Bewegung, die nicht passiert, als eine, die die Regel
 * hinter dem Rücken des Benutzers zurechtbiegt.
 */
function onDragOver(index: number) {
  const from = dragIndex.value
  if (from === null || from === index) return
  const list = [...rows.value]
  const source = list[from]
  const target = list[index]
  if (!source || !target) return
  if (target.parent !== null && hasChildren(source)) return

  const [start, end] = blockOf(list, source)
  const block = list.splice(start, end - start)
  source.parent = target.parent
  const at = list.indexOf(target)
  list.splice(index > from ? at + 1 : at, 0, ...block)
  rows.value = normalize(list)
  dragIndex.value = rows.value.indexOf(source)
}

function onDragEnd() {
  dragIndex.value = null
}

// ── Hinweise unter der Zeile ──────────────────────────────────────────────

/** Der Text des Hauptpunkts — für „Unterpunkt von X". */
function parentLabel(row: EditorRow): string {
  const parent = row.parent ? rowById.value.get(row.parent) : undefined
  return parent ? displayLabel(parent) : ''
}

/** Zusage 6: der Hauptpunkt ist ausgeblendet, das Kind erscheint als einer. */
function orphanLabel(row: EditorRow): string {
  const parent = row.parent ? rowById.value.get(row.parent) : undefined
  return parent?.hidden ? displayLabel(parent) : ''
}

/** Zusage 7: eine Gruppe ohne SICHTBARE Kinder wird gar nicht gerendert. */
const groupIsEmpty = (row: EditorRow) =>
  row.group && !row.hidden && !childrenOf(row.id).some(child => !child.hidden)

// ── Eigenen Link (oder Hauptpunkt) anlegen ────────────────────────────────
const adding = ref(false)
const newKind = ref<'page' | 'external' | 'group'>('page')
const newLabel = ref('')
const newPage = ref<string>('/')
const newUrl = ref('')

const newTargetValid = computed(() => {
  if (newKind.value === 'group') return true
  return newKind.value === 'page' ? !!newPage.value : isSafeExternalNavTarget(newUrl.value.trim())
})
const canAdd = computed(() => !!newLabel.value.trim() && newTargetValid.value)

function addLink() {
  if (!canAdd.value) return
  const ids = rows.value.map(row => ({ id: row.id }))
  const group = newKind.value === 'group'
  rows.value = normalize([...rows.value, {
    id: group ? nextGroupNavId(ids) : nextCustomNavLinkId(ids),
    hidden: false,
    label: newLabel.value.trim(),
    fallbackLabel: '',
    to: group ? '' : (newKind.value === 'page' ? newPage.value : newUrl.value.trim()),
    external: newKind.value === 'external',
    custom: true,
    group,
    available: true,
    parent: null,
  }])
  adding.value = false
  newLabel.value = ''
  newUrl.value = ''
  newPage.value = '/'
}

/** Entfernen nimmt die Kinder NICHT mit: sie werden Hauptpunkte. Ein Klick auf
 *  „entfernen" bezieht sich auf EINE Zeile — alles andere wäre eine Löschung,
 *  die niemand angefordert hat. */
function removeRow(row: EditorRow) {
  const list = rows.value.filter(other => other !== row)
  for (const child of list) {
    if (child.parent === row.id) child.parent = null
  }
  rows.value = normalize(list)
}

async function save() {
  saving.value = true
  try {
    saved.value = await $fetch<CommunityNavOverride>('/api/pages/navigation', {
      method: 'PATCH',
      body: draft.value,
    })
    toast.add({ title: t('pages.navigation.saved'), color: 'success' })
  }
  catch (error) {
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    toast.add({
      title: reason === 'unknown_page' ? t('pages.navigation.errorUnknownPage') : t('pages.navigation.errorSave'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

async function resetAll() {
  rows.value = []
  await save()
}
</script>

<template>
  <div class="space-y-6">
    <UCard>
      <template #header>
        <div class="flex items-start justify-between gap-4">
          <div>
            <h2 class="font-semibold">{{ t('pages.navigation.title') }}</h2>
            <p class="mt-1 text-sm text-muted">{{ t('pages.navigation.description') }}</p>
          </div>
          <UButton
            :loading="saving"
            icon="i-ph-floppy-disk"
            data-testid="nav-save"
            @click="save"
          >
            {{ t('ui.save') }}
          </UButton>
        </div>
      </template>

      <CoreEmptyState
        v-if="!rows.length"
        icon="i-ph-list-dashes"
        :title="t('pages.navigation.empty.title')"
        :description="t('pages.navigation.empty.description')"
      />

      <ul v-else class="divide-y divide-default" data-testid="nav-editor-list">
        <li
          v-for="(row, index) in rows"
          :key="row.id"
          class="flex items-center gap-3 py-2"
          :class="[dragIndex === index ? 'opacity-40' : '', row.hidden ? 'opacity-60' : '', row.parent ? 'pl-6' : '']"
          :data-nav-row="row.id"
          :data-nav-parent="row.parent ?? ''"
          draggable="true"
          @dragstart="onDragStart(index)"
          @dragover.prevent="onDragOver(index)"
          @dragend="onDragEnd"
        >
          <UIcon name="i-ph-dots-six-vertical" class="shrink-0 cursor-grab text-muted" />
          <!-- Einrückung sichtbar machen: ein Kind trägt das Winkel-Zeichen,
               damit „unter X" nicht nur aus dem Abstand zu erraten ist. -->
          <UIcon v-if="row.parent" name="i-ph-arrow-elbow-down-right" class="shrink-0 text-dimmed" />

          <div class="flex min-w-0 flex-1 flex-col gap-1">
            <UInput
              v-model="row.label"
              size="sm"
              :maxlength="MAX_NAV_LABEL"
              :placeholder="row.fallbackLabel || t('pages.navigation.labelPlaceholder')"
              :aria-label="t('pages.navigation.labelAria')"
            />
            <span class="truncate text-xs text-muted">
              <template v-if="row.group">{{ t('pages.navigation.groupHint') }}</template>
              <template v-else>{{ row.to }}</template>
              <template v-if="row.external"> · {{ t('pages.navigation.externalHint') }}</template>
              <template v-if="!row.available"> · {{ t('pages.navigation.unavailable') }}</template>
              <template v-if="row.parent"> · {{ t('pages.navigation.childOf', { label: parentLabel(row) }) }}</template>
            </span>
            <span v-if="orphanLabel(row)" class="text-xs text-warning">
              {{ t('pages.navigation.orphanHint', { label: orphanLabel(row) }) }}
            </span>
            <span v-if="groupIsEmpty(row)" class="text-xs text-warning">
              {{ t('pages.navigation.groupEmptyHint') }}
            </span>
          </div>

          <div class="flex shrink-0 items-center gap-1">
            <UButton
              :icon="row.hidden ? 'i-ph-eye-slash' : 'i-ph-eye'"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="row.hidden ? t('pages.navigation.show') : t('pages.navigation.hide')"
              :data-nav-toggle="row.id"
              @click="row.hidden = !row.hidden"
            />
            <UButton
              v-if="row.parent"
              icon="i-ph-arrow-line-left"
              color="neutral"
              variant="ghost"
              size="xs"
              :aria-label="t('pages.navigation.outdent')"
              :data-nav-outdent="row.id"
              @click="outdent(row)"
            />
            <UButton
              v-else
              icon="i-ph-arrow-line-right"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!canIndent(row)"
              :aria-label="t('pages.navigation.indent')"
              :data-nav-indent="row.id"
              @click="indent(row)"
            />
            <UButton
              icon="i-ph-arrow-up"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!canMove(row, -1)"
              :aria-label="t('pages.navigation.moveUp')"
              @click="move(row, -1)"
            />
            <UButton
              icon="i-ph-arrow-down"
              color="neutral"
              variant="ghost"
              size="xs"
              :disabled="!canMove(row, 1)"
              :aria-label="t('pages.navigation.moveDown')"
              @click="move(row, 1)"
            />
            <UButton
              v-if="row.custom"
              icon="i-ph-trash"
              color="error"
              variant="ghost"
              size="xs"
              :aria-label="t('pages.navigation.link.remove')"
              @click="removeRow(row)"
            />
          </div>
        </li>
      </ul>

      <template #footer>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <UButton
            icon="i-ph-plus"
            color="neutral"
            variant="subtle"
            data-testid="nav-add-link"
            @click="adding = !adding"
          >
            {{ t('pages.navigation.link.add') }}
          </UButton>
          <UButton color="neutral" variant="ghost" size="sm" @click="resetAll">
            {{ t('pages.navigation.reset') }}
          </UButton>
        </div>

        <div v-if="adding" class="mt-4 space-y-3 rounded-lg bg-elevated/50 p-3">
          <URadioGroup
            v-model="newKind"
            orientation="horizontal"
            :items="[
              { label: t('pages.navigation.link.kindPage'), value: 'page' },
              { label: t('pages.navigation.link.kindExternal'), value: 'external' },
              { label: t('pages.navigation.link.kindGroup'), value: 'group' },
            ]"
          />
          <UInput
            v-model="newLabel"
            :maxlength="MAX_NAV_LABEL"
            :placeholder="t('pages.navigation.link.labelPlaceholder')"
            :aria-label="t('pages.navigation.link.labelAria')"
            class="w-full"
          />
          <p v-if="newKind === 'group'" class="text-xs text-muted">
            {{ t('pages.navigation.groupHint') }}
          </p>
          <USelectMenu
            v-else-if="newKind === 'page'"
            v-model="newPage"
            value-key="value"
            :items="linkablePages"
            class="w-full"
          />
          <UInput
            v-else
            v-model="newUrl"
            type="url"
            placeholder="https://"
            :aria-label="t('pages.navigation.link.urlAria')"
            class="w-full"
          />
          <p v-if="newKind === 'external' && newUrl && !newTargetValid" class="text-xs text-error">
            {{ t('pages.navigation.validation.externalInvalid') }}
          </p>
          <UButton :disabled="!canAdd" size="sm" @click="addLink">
            {{ t('pages.navigation.link.confirm') }}
          </UButton>
        </div>
      </template>
    </UCard>

    <UCard>
      <template #header>
        <h2 class="font-semibold">{{ t('pages.navigation.preview.title') }}</h2>
        <p class="mt-1 text-sm text-muted">{{ t('pages.navigation.preview.description') }}</p>
      </template>
      <div class="flex flex-wrap items-center gap-4 text-sm" data-testid="nav-preview">
        <span v-if="!preview.length" class="text-muted">{{ t('pages.navigation.preview.emptyMenu') }}</span>
        <span v-for="item in preview" :key="item.id" class="flex items-center gap-1 text-muted">
          {{ item.label }}
          <UIcon v-if="item.external" name="i-ph-arrow-square-out" class="size-3" />
          <template v-if="item.children?.length">
            <UIcon name="i-ph-caret-down" class="size-3" />
            <span class="text-dimmed">({{ item.children.map(child => child.label).join(' · ') }})</span>
          </template>
        </span>
      </div>
    </UCard>
  </div>
</template>
