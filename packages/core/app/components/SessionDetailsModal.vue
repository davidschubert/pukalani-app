<script setup lang="ts">
import type { Map as LeafletMap } from 'leaflet'
import type { SessionRow } from '../../shared/types/session'
import { formatSessionLocation } from '../../shared/sessionLocation'

/**
 * Alles, was zu EINER Sitzung bekannt ist — inklusive Karte.
 *
 * WARUM EIN DIALOG: die Tabelle beantwortet „war ich das?" in vier Spalten.
 * Wer daran zweifelt, will mehr sehen (Engine, Faktoren, Ablauf, den Ort auf
 * einer Karte) — das ist die Ausnahme und gehört deshalb hinter einen Klick,
 * nicht in jede Zeile.
 *
 * DIE KARTE LÄDT ERST BEIM ÖFFNEN. Leaflet und sein CSS kommen per
 * DYNAMISCHEM Import, die Kacheln von OpenStreetMap. Damit geht erst nach
 * einem bewussten Klick eine Anfrage an einen Dritten — die Sitzungsliste
 * selbst bleibt drittanbieterfrei, so wie die Ortsauflösung (lokale MMDB)
 * es auch ist.
 *
 * `session` ist NULLBAR, weil die Tabelle EIN Exemplar dieses Dialogs für alle
 * Zeilen hält: vor dem ersten Klick gibt es keine Auswahl, und beim Schließen
 * darf die Auswahl stehen bleiben, statt den offenen Dialog per v-if aus dem
 * Baum zu nehmen (Nuxt-UI/Reka-Falle).
 */
const props = defineProps<{ session: SessionRow | null }>()
const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useI18n()

/** Koordinaten nur als PAAR — ein halbes Paar ergibt keinen Punkt. */
const coordinates = computed<[number, number] | null>(() => {
  const s = props.session
  if (!s || s.latitude === null || s.longitude === null) return null
  return [s.latitude, s.longitude]
})

const locationLine = computed(() => (props.session ? formatSessionLocation(props.session) : ''))

/**
 * Attribution (CC BY 4.0) wie in der Tabelle: sie hängt am ZEIGEN, nicht an
 * der Konfiguration. Im Dialog zählen auch die Koordinaten dazu — sie stammen
 * aus derselben DB-IP-Datei wie Stadt und Region.
 */
const showsGeoData = computed(() => Boolean(props.session && (props.session.city || props.session.region || coordinates.value)))

const mapEl = ref<HTMLDivElement | null>(null)
let map: LeafletMap | null = null
let stopObservingSize: (() => void) | null = null

/**
 * Start-Zoom Stadt-Ebene (Davids Wunsch 2026-08-23, nach dem Vorbild der
 * DB-IP-Beispielseite): der Ort mit seiner Umgebung, nicht die ganze Insel.
 * Mehr Nähe wäre gelogen — die IP-Auflösung ist eine Stadt-Schätzung,
 * keine Adresse.
 */
const MAP_ZOOM = 12

function destroyMap(): void {
  stopObservingSize?.()
  stopObservingSize = null
  // Ohne `remove()` bleibt bei jedem Öffnen eine Leaflet-Instanz samt ihren
  // Fenster-Listenern zurück — der Dialog wird über die Sitzung mehrfach
  // geöffnet, das summiert sich.
  map?.remove()
  map = null
}

async function mountMap(el: HTMLDivElement, center: [number, number]): Promise<void> {
  // Beides erst hier: Leaflet ist window-abhängig (nie SSR) und wiegt samt CSS
  // genug, dass es niemand bezahlen soll, der nur eine Sitzungsliste ansieht.
  const [L] = await Promise.all([
    import('leaflet'),
    import('leaflet/dist/leaflet.css'),
  ])

  // Zwischen `await` und hier kann der Dialog längst wieder zu sein.
  if (!open.value || mapEl.value !== el) return

  // Angelegt wird erst, wenn der Container echte Maße hat: die Dialog-
  // Transition macht ihn erst nach dem Mounten groß, und eine Karte, die
  // vorher entsteht, bleibt kaputt (core/app/utils/mapContainer.ts).
  destroyMap()
  stopObservingSize = observeMapContainer(el, {
    onFirstVisible: () => createMap(L, el, center),
    onResize: () => map?.invalidateSize(),
  })
}

/** Legt die Karte an — nur aus `onFirstVisible` heraus aufzurufen. */
function createMap(L: typeof import('leaflet'), el: HTMLDivElement, center: [number, number]): void {
  map = L.map(el, {
    center,
    zoom: MAP_ZOOM,
    // Im Dialog scrollt man die Seite, nicht die Karte — Zoom nur über die
    // Knöpfe, sonst bleibt man beim Scrollen ungewollt in der Karte hängen.
    scrollWheelZoom: false,
    attributionControl: true,
  })

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    // Pflicht der OSM-Tile-Usage-Policy — Leaflet zeichnet sie in die Karte.
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)

  // divIcon statt des Standard-Markers: dessen PNG-Pfade werden von Leaflet aus
  // der CSS-URL geraten und brechen im Bundle regelmäßig. Ein Punkt aus CSS
  // kann nicht 404en.
  //
  // FESTE FARBE, kein `bg-primary`: die Kacheln sind eine FREMDE, immer helle
  // Fläche und folgen unserem Theme nicht. `--ui-primary` ist je nach Theme
  // auch mal `white` (auf den Kontroll-Hosts gemessen) — der Punkt wäre dann
  // weiß im weißen Ring und praktisch unsichtbar. Rot mit weißem Ring liest
  // sich auf jeder Karte und in jedem Theme gleich.
  L.marker(center, {
    keyboard: false,
    icon: L.divIcon({
      className: '',
      html: '<span class="block size-3 rounded-full bg-red-500 shadow ring-2 ring-white"></span>',
      iconSize: [12, 12],
      iconAnchor: [6, 6],
    }),
  }).addTo(map)

}

/**
 * Am ELEMENT hängen, nicht an `open`: der Dialog-Körper wird erst gemountet,
 * wenn er wirklich sichtbar wird (Teleport + Transition). Die Ref ist damit
 * das einzige verlässliche Signal „der Container steht jetzt".
 */
watch([mapEl, coordinates], ([el, center]) => {
  if (!el || !center) {
    destroyMap()
    return
  }
  void mountMap(el, center)
})

onScopeDispose(destroyMap)

// Im Script statt als Literal im Template: vue-tsc ab 3.3.9 liest jedes `//`
// in den Props einer Komponente als Zeilenkommentar, auch in einem String, und
// erzeugt ungültigen virtuellen Code (vuejs/language-tools#6240, Fix-PR #6241).
const dbIpUrl = 'https://db-ip.com'
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('account.sessions.detailsTitle')"
    :description="t('account.sessions.detailsDescription')"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <div v-if="session" class="space-y-4">
        <!-- Karte nur mit Koordinaten — eine leere Weltkarte sagt nichts. -->
        <div
          v-if="coordinates"
          ref="mapEl"
          class="h-56 w-full overflow-hidden rounded-lg border border-default"
        />

        <dl class="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div v-if="session.countryName || locationLine" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.location') }}</dt>
            <dd class="flex items-center gap-1.5">
              <UIcon :name="flagIcon(session.countryCode)" class="size-4 shrink-0" />
              <span class="truncate">{{ locationLine || t('account.sessions.unknown') }}</span>
            </dd>
          </div>
          <div v-if="coordinates" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.coordinates') }}</dt>
            <dd class="font-mono text-xs">{{ coordinatesLabel(session.latitude, session.longitude) }}</dd>
          </div>
          <div v-if="session.ip" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.ip') }}</dt>
            <dd class="truncate font-mono text-xs">{{ session.ip }}</dd>
          </div>
          <div v-if="browserLabel(session)" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.browser') }}</dt>
            <dd class="flex items-center gap-1.5">
              <UIcon :name="browserIcon(session.clientName)" class="size-4 shrink-0 text-muted" />
              <span class="truncate">{{ browserLabel(session) }}</span>
            </dd>
          </div>
          <div v-if="engineLabel(session)" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.engine') }}</dt>
            <dd class="flex items-center gap-1.5">
              <UIcon name="i-ph-engine" class="size-4 shrink-0 text-muted" />
              <span class="truncate">{{ engineLabel(session) }}</span>
            </dd>
          </div>
          <div v-if="osLabel(session)" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.os') }}</dt>
            <dd class="flex items-center gap-1.5">
              <UIcon :name="osIcon(session.osName)" class="size-4 shrink-0 text-muted" />
              <span class="truncate">{{ osLabel(session) }}</span>
            </dd>
          </div>
          <div v-if="deviceLabel(session)" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.device') }}</dt>
            <dd class="flex items-center gap-1.5">
              <UIcon :name="deviceIcon(session.deviceName)" class="size-4 shrink-0 text-muted" />
              <span class="truncate">{{ deviceLabel(session) }}</span>
            </dd>
          </div>
          <div v-if="session.provider" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.auth') }}</dt>
            <dd class="flex flex-wrap items-center gap-1.5">
              <UIcon :name="session.provider === 'email' ? 'i-ph-envelope-simple' : 'i-ph-plugs-connected'" class="size-4 shrink-0 text-muted" />
              <span class="truncate">{{ session.provider }}</span>
            </dd>
          </div>
          <div v-if="session.factors.length" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.mfa') }}</dt>
            <dd class="flex items-center gap-1.5">
              <UIcon name="i-ph-shield-check" class="size-4 shrink-0 text-muted" />
              <span class="truncate">{{ session.factors.join(', ') }}</span>
            </dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.created') }}</dt>
            <dd>{{ sessionDateTime(session.$createdAt, locale) }}</dd>
          </div>
          <div class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.updated') }}</dt>
            <dd>{{ sessionDateTime(session.$updatedAt, locale) }}</dd>
          </div>
          <div v-if="session.expire" class="min-w-0">
            <dt class="text-xs text-dimmed">{{ t('account.sessions.expiry') }}</dt>
            <dd>{{ sessionDateTime(session.expire, locale) }}</dd>
          </div>
        </dl>

        <UBadge v-if="session.current" color="success" variant="subtle" size="sm">
          {{ t('account.sessions.current') }}
        </UBadge>

        <!-- Attribution (CC BY 4.0) — hängt am Zeigen, nicht an der Konfiguration -->
        <i18n-t
          v-if="showsGeoData"
          keypath="account.sessions.geoAttribution"
          tag="p"
          scope="global"
          class="text-xs text-dimmed"
        >
          <template #provider>
            <ULink :to="dbIpUrl" target="_blank" rel="noopener" class="underline">DB-IP</ULink>
          </template>
        </i18n-t>
      </div>
    </template>
  </UModal>
</template>
