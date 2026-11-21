<script setup lang="ts">
import type { LayerGroup, Map as LeafletMap, Marker } from 'leaflet'
import type { MemberLocationGroup } from '../../shared/membersMap'

/**
 * DIE WELTKARTE DER MITGLIEDER (Etappe 2, 2026-08-23).
 *
 * Das Leaflet-Muster ist DASSELBE wie im Sitzungs-Dialog
 * (packages/core/app/components/SessionDetailsModal.vue) und aus denselben
 * Gründen — hier steht nur, was ANDERS ist und warum:
 *
 *  - **Dynamischer Import** von Leaflet UND seinem CSS: window-abhängig (nie
 *    SSR) und schwer genug, dass es niemand bezahlen soll, der die
 *    Mitgliederliste ansieht. Erst hier geht eine Anfrage an OpenStreetMap.
 *  - **Init erst bei echter Container-Höhe**: initialisiert Leaflet in einem
 *    0-Pixel-Container, vermisst es sich und rendert eine falsche Zoom-Stufe.
 *  - **`map.remove()`** beim Verlassen: sonst bleiben Instanz und
 *    Fenster-Listener zurück.
 *  - **divIcon statt Standard-Marker**: dessen PNG-Pfade rät Leaflet aus der
 *    CSS-URL und sie brechen im Bundle regelmässig.
 *
 * ── WAS HIER ANDERS IST ────────────────────────────────────────────────────
 *
 * 1. **`scrollWheelZoom` IST AN.** Im Dialog war es aus, weil man dort die
 *    Seite scrollt und in einer kleinen Karte hängenbliebe. Das hier ist die
 *    Hauptfläche der Seite — eine grosse Karte, die auf das Mausrad nicht
 *    reagiert, wirkt kaputt.
 *
 * 2. **Die Welt kachelt nicht** (`noWrap` + `maxBounds`). Ohne das zeichnet
 *    Leaflet Europa beliebig oft nebeneinander, und beim Herausziehen steht
 *    dasselbe Mitglied fünfmal auf dem Schirm — auf einer Karte, die zählt,
 *    ist das keine Kosmetik.
 *
 * 3. **`fitBounds` statt eines festen Zooms.** „Weltkarte" heisst: alle sollen
 *    drauf sein. Sind alle in einer Stadt, wäre eine Totale der Erde eine
 *    leere Fläche mit einem Punkt; sind sie über drei Kontinente verteilt,
 *    passte kein fester Zoom. Ohne Mitglieder bleibt es bei der Totale (Zoom
 *    2) — dann gibt es nichts einzupassen.
 *
 * 4. **Das Icon wird als ELEMENT gebaut, nicht als HTML-Zeichenkette.**
 *    Name und Avatar-URL sind FREMDE EINGABEN (jedes Mitglied schreibt sie
 *    selbst). In eine `html:`-Zeichenkette gesteckt wären sie eine
 *    Einladung zum Einschleusen von Markup; `createElement` +
 *    `textContent`/`src` kann das per Konstruktion nicht. Leaflets `divIcon`
 *    nimmt beides entgegen — die sichere Form kostet nichts.
 *
 * 5. **Der Klick öffnet KEIN Leaflet-Popup**, sondern meldet die Auswahl nach
 *    oben. Ein Popup wäre fremdes HTML ausserhalb von Vue: es folgte weder
 *    dem Theme noch der Sprache, und in einem Test wäre es nur über
 *    Leaflet-internes Markup zu finden.
 */
const props = defineProps<{
  groups: MemberLocationGroup[]
  selectedKey: string | null
}>()

const emit = defineEmits<{ select: [key: string] }>()

const mapEl = ref<HTMLDivElement | null>(null)
let map: LeafletMap | null = null
let layer: LayerGroup | null = null
let stopObservingSize: (() => void) | null = null
const markerElements = new Map<string, HTMLElement>()

/** Totale der Erde, wenn es nichts einzupassen gibt. */
const WORLD_CENTER: [number, number] = [20, 0]
const WORLD_ZOOM = 2
/** Näher als das ist bei Verzeichnis-Koordinaten (Stadt-Ebene) gelogen. */
const MAX_ZOOM = 12

/** Initialen für den Fall ohne Avatar — dieselbe Idee wie in UserAvatar. */
function initials(group: MemberLocationGroup): string {
  const first = group.members[0]
  const source = (first?.name || first?.handle || '?').trim()
  const parts = source.split(/\s+/).filter(Boolean)
  const letters = parts.length > 1
    ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`
    : source.slice(0, 2)
  return letters.toUpperCase() || '?'
}

/**
 * Das Marker-Element EINER Gruppe: Avatar (oder Initialen) im weissen Ring,
 * dazu ein Zähler, sobald mehr als ein Mensch an diesem Ort steht.
 *
 * FESTE STUFEN DER FARBWELT, kein `bg-primary` und kein hell/dunkel-Token: die
 * Kacheln sind eine fremde, immer helle Fläche und folgen dem Modus nicht —
 * `--ui-primary` ist je nach Theme auch mal `white` (im Sitzungs-Dialog live
 * gemessen), `bg-inverted` wäre im dunklen Modus weiß. Deshalb die Stufen
 * `neutral-800` (Grundton der Community) und `error-600` (Q25/UI-006; weiße
 * Schrift darauf 14,3 bis 15,5 bzw. 4,8 zu 1). Der weiße Ring trennt vom
 * Kartengrund.
 */
function markerElement(group: MemberLocationGroup): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'relative size-9 cursor-pointer'
  wrapper.dataset.memberMarker = group.key

  const face = document.createElement('div')
  face.className = 'size-9 overflow-hidden rounded-full bg-(--ui-color-neutral-800) text-white shadow ring-2 ring-white flex items-center justify-center'

  const first = group.members[0]
  if (first?.avatarUrl) {
    const img = document.createElement('img')
    // `src` als PROPERTY gesetzt, nicht als Markup zusammengebaut: eine
    // Avatar-URL ist fremde Eingabe.
    img.src = first.avatarUrl
    img.alt = ''
    img.className = 'size-full object-cover'
    face.appendChild(img)
  }
  else {
    const text = document.createElement('span')
    text.className = 'text-[11px] font-semibold leading-none'
    text.textContent = initials(group)
    face.appendChild(text)
  }
  wrapper.appendChild(face)

  if (group.members.length > 1) {
    const badge = document.createElement('span')
    badge.className = 'absolute -right-1 -top-1 min-w-4 rounded-full bg-(--ui-color-error-600) px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-white'
    badge.textContent = String(group.members.length)
    wrapper.appendChild(badge)
  }

  return wrapper
}

/** Die Auswahl sichtbar machen — ohne die Marker neu zu bauen. */
function paintSelection(): void {
  for (const [key, element] of markerElements) {
    element.classList.toggle('ring-4', key === props.selectedKey)
    element.classList.toggle('ring-red-500', key === props.selectedKey)
  }
}

async function mountMap(el: HTMLDivElement): Promise<void> {
  const [L] = await Promise.all([
    import('leaflet'),
    import('leaflet/dist/leaflet.css'),
  ])

  // Zwischen `await` und hier kann die Seite längst verlassen sein.
  if (mapEl.value !== el) return

  /**
   * ANGELEGT WIRD ERST, WENN DER CONTAINER ECHTE MASSE HAT — und das meldet
   * der Beobachter, es wartet niemand darauf. Warum das keine Feinheit ist,
   * sondern die ganze Miete, steht in core/app/utils/mapContainer.ts: eine
   * Karte, die in einem 2-px-Container entsteht, bleibt für immer bei drei
   * Kacheln, und eine rAF-Warteschleife davor hängt im Hintergrund-Tab ewig.
   */
  destroyMap()
  stopObservingSize = observeMapContainer(el, {
    onFirstVisible: () => createMap(L, el),
    onResize: () => map?.invalidateSize(),
  })
}

/** Legt die Karte an — nur aus `onFirstVisible` heraus aufzurufen. */
function createMap(L: typeof import('leaflet'), el: HTMLDivElement): void {
  map = L.map(el, {
    center: WORLD_CENTER,
    zoom: WORLD_ZOOM,
    minZoom: 2,
    maxZoom: MAX_ZOOM,
    scrollWheelZoom: true,
    worldCopyJump: false,
    // Die Welt EINMAL: `maxBounds` hält die Ansicht darin, `noWrap` (unten)
    // verhindert die Wiederholung der Kacheln.
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1,
    attributionControl: true,
  })

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: MAX_ZOOM,
    noWrap: true,
    // Pflicht der OSM-Tile-Usage-Policy — Leaflet zeichnet sie in die Karte.
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)

  layer = L.layerGroup().addTo(map)
  renderMarkers(L)
}

function destroyMap(): void {
  stopObservingSize?.()
  stopObservingSize = null
  map?.remove()
  map = null
  layer = null
  markerElements.clear()
}

/**
 * „Alle drauf" — geteilt von renderMarkers und dem Resize-Nachziehen.
 *
 * `animate: false` ist hier PFLICHT, nicht Geschmack (live gemessen
 * 2026-08-23): wächst der Container von fast null auf seine echte Breite,
 * ruft der Beobachter `invalidateSize()` und direkt danach diese Funktion.
 * Ein ANIMIERTES `fitBounds` unterbricht dabei das gerade angestossene
 * Nachladen der Kacheln — die Karte stand danach mit drei Kacheln und viel
 * Grau da, bis irgendein weiteres Resize sie erlöste. Ohne Animation läuft
 * beides in derselben Runde durch (nachgemessen: 18 Kacheln).
 */
function fitToGroups(): void {
  if (!map) return
  const points = props.groups.map(group => [group.lat, group.lon] as [number, number])
  if (points.length > 0) {
    map.fitBounds(points, { padding: [48, 48], maxZoom: 8, animate: false })
  }
  else {
    map.setView(WORLD_CENTER, WORLD_ZOOM, { animate: false })
  }
}

function renderMarkers(L: typeof import('leaflet')): void {
  if (!map || !layer) return
  layer.clearLayers()
  markerElements.clear()

  for (const group of props.groups) {
    const element = markerElement(group)
    markerElements.set(group.key, element)

    const marker: Marker = L.marker([group.lat, group.lon], {
      keyboard: true,
      title: group.label,
      icon: L.divIcon({
        className: '',
        html: element,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    })
    marker.on('click', () => emit('select', group.key))
    marker.addTo(layer)
  }

  paintSelection()

  // „Alle drauf" statt eines festen Zooms — `fitToGroups` deckelt mit maxZoom
  // den Fall, dass alle am selben Ort stehen (Verzeichnis-Koordinaten geben
  // keine Strassen-Ebene her). Vorher nachmessen: zwischen Warte-Schleife und
  // hier kann das Layout noch gewachsen sein.
  map.invalidateSize()
  fitToGroups()
}

/**
 * Am ELEMENT hängen, nicht an einem Zustand: die Ref ist das einzige
 * verlässliche Signal „der Container steht jetzt".
 */
watch(mapEl, (el) => {
  if (!el) {
    destroyMap()
    return
  }
  void mountMap(el)
})

// Neue Daten (Refresh) ⇒ Marker neu zeichnen, aber die Karte NICHT neu bauen.
watch(() => props.groups, () => {
  if (!map) return
  void import('leaflet').then(L => renderMarkers(L))
})

watch(() => props.selectedKey, paintSelection)

onScopeDispose(destroyMap)
</script>

<template>
  <div
    ref="mapEl"
    class="h-[28rem] w-full overflow-hidden rounded-lg border border-default"
    data-members-map
  />
</template>
