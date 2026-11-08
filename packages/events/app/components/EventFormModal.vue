<script setup lang="ts">
import { createEventSchema } from '../../schemas/event'
import type { EventRow } from '../../shared/types/event'
import { effectiveLocationType, paidAccessChoosable } from '../../shared/types/event'
import { isoFromWallClock, wallClockIn } from '../../shared/eventRecurrence'
import { suggestTimezoneForAddress } from '../../shared/addressTimezone'

/**
 * DAS Event-Formular — Anlegen und Bearbeiten, EINE Fassung fuer ALLE Einstiege.
 *
 * WARUM ES DIESE KOMPONENTE GIBT (2026-08-16, Davids Entscheidung zu F58): das
 * Formular lag in `app/pages/dashboard/events.vue`, und die oeffentlichen
 * Terminseiten VERLINKTEN dorthin (`?new=1` / `?edit=<id>`). Der Einstieg war
 * damit da, die Handlung aber weiterhin woanders — jeder Termin kostete einen
 * Kontextwechsel, und die Detailseite, auf der man gerade steht, verschwand
 * dabei. Davids Entscheidung: geteilt gehoert der MECHANISMUS (dieses
 * Formular), nicht der Einstieg — der Dialog oeffnet dort, wo geklickt wurde.
 *
 * Konsumenten sind DREI: die Dashboard-Tabelle, die oeffentliche Terminliste
 * und die Detailseite. Wer hier etwas aendert, aendert alle drei.
 *
 * Die Tiefen-Links bleiben trotzdem bestehen: `/dashboard/events?new=1` und
 * `?edit=<id>` sind weiterhin gueltige Ziele (Mails, Lesezeichen, „Verwalten").
 * Nur die Knoepfe auf den Produktseiten gehen nicht mehr diesen Weg.
 *
 * `publishOnCreate` IST KEINE BEQUEMLICHKEIT, SONDERN NOTWENDIG. Neu angelegt
 * ist ein Termin ein Entwurf (index.post.ts: `status ?? 'draft'`), und ein
 * Entwurf traegt kein Leserecht: die oeffentliche Liste filtert hart auf
 * `status: 'published'`, die Detail-Route antwortet 404. Vom oeffentlichen
 * Einstieg angelegt waere er im selben Moment unsichtbar — angelegt und
 * verschwunden. Das Dashboard bleibt bei Entwurf-zuerst, denn dort steht die
 * Entwurfsliste daneben und das Veroeffentlichen ist ein gewollter Schritt.
 */
const props = defineProps<{
  /** zu bearbeitende Row — null/undefined = Anlegen */
  event?: EventRow | null
  /** Anlegen veroeffentlicht sofort (oeffentliche Einstiege — Begruendung oben) */
  publishOnCreate?: boolean
}>()

const emit = defineEmits<{ saved: [event: EventRow] }>()

const open = defineModel<boolean>('open', { required: true })

const { t, locale } = useI18n()
const toast = useToast()

/**
 * IN WELCHER ZONE IST DIE UHRZEIT GEMEINT? (control-038, Davids Entscheidung
 * 2026-08-17 — Meetup-Modell.)
 *
 * `datetime-local` liefert immer die Wanduhr DESSEN, DER TIPPT. Ohne diese
 * Ebene wurde daraus die Zone seines Geräts: am 2026-08-17 legte ein Betreiber
 * in Honolulu den „Freelancer-Stammtisch Hamburg" für 19:00 an, gespeichert
 * wurden 05:00 UTC — in Hamburg **07:00 morgens**. Das Feld war nicht kaputt,
 * es fehlte die Aussage, WESSEN Zeit gilt.
 *
 * Vorrang: Heimat-Zone der Community, sonst leer = Gerät (bisheriges
 * Verhalten) — und seit F59 darf der Organisator davon ABWEICHEN
 * (`timezoneOverride`).
 */
const { branding: communitySettings } = useCommunitySettings()
const eventTimezone = computed(() => communitySettings.value?.timezone ?? '')

/**
 * ABWEICHENDE ZONE FÜR DIESEN EINEN TERMIN (F59, Davids Entscheidung
 * 2026-08-17). `''` = keine Abweichung, es gilt die Community-Zone.
 *
 * Gesetzt wird sie NUR durch einen Klick — auf den Vorschlag aus der Adresse
 * (shared/addressTimezone.ts) oder beim Bearbeiten aus der gespeicherten Zeile.
 * Nichts leitet hier still ab; die Begründung steht im Kopf der Regel.
 */
const timezoneOverride = ref('')

/** Die Zone, in der dieses Formular rechnet, anzeigt und speichert. */
const effectiveTimezone = computed(() => timezoneOverride.value || eventTimezone.value)

/**
 * Label der Zeit-Felder — nennt die Zone, sobald sie NICHT die des Geräts ist.
 *
 * Drei Fälle statt zwei: eine Abweichung OHNE Community-Zone gibt es wirklich
 * (die Community hat keine gesetzt, der Vorschlag greift trotzdem) — dort wäre
 * „abweichend von der Zeitzone eurer Community" eine Auskunft über etwas, das
 * es nicht gibt.
 */
const timezoneNote = computed(() => {
  if (!effectiveTimezone.value) return ''
  if (!timezoneOverride.value) return t('events.admin.form.timezoneNote', { zone: effectiveTimezone.value })
  if (eventTimezone.value) return t('events.admin.form.timezoneNoteCustom', { zone: effectiveTimezone.value })
  return t('events.admin.form.timezoneNoteEvent', { zone: effectiveTimezone.value })
})

interface EventForm {
  title: string
  description: string
  startAt: string
  endAt: string
  location: string
  url: string
  capacity: number | null
  locationType: 'venue' | 'online'
  replayUrl: string
  address: string
  locationNotes: string
  access: 'free' | 'paid'
  /** Anzeige-Preis in EUR (Formular) — gespeichert werden Cent */
  priceEur: number | null
  priceLookupKey: string
  /** Serie (§7e) — nur beim Anlegen wählbar; '' = Einzeltermin */
  recurrence: '' | 'weekly' | 'biweekly' | 'monthly'
  /** optionales Serienende (date-Input) */
  seriesUntil: string
}

const emptyForm = (): EventForm => ({
  title: '', description: '', startAt: '', endAt: '', location: '', url: '', capacity: null,
  locationType: 'venue', replayUrl: '', address: '', locationNotes: '',
  access: 'free', priceEur: null, priceLookupKey: '',
  recurrence: '', seriesUntil: '',
})

/**
 * Kann diese App Tickets verkaufen? (F13) — Cast wie in der Bauplan-Seite:
 * die AppConfig-Typen entstehen erst im Merge der jeweiligen App, der Layer
 * liest sie bewusst defensiv. Es ist DERSELBE Wert, der den Kauf-CTA steuert
 * (EventDetail über packages/blueprint/app/pages/events/[id].vue).
 */
const appConfig = useAppConfig()
const ticketCheckoutPath = computed(() =>
  (appConfig.pukalani as { events?: { ticketCheckoutPath?: string } }).events?.ticketCheckoutPath ?? '')

/**
 * F21: Wenn die Installation die verkaufbaren Einmal-Preise eingrenzt
 * (`pukalani.billing.oneTimeLookupKeys`), steht die Regel HIER am Feld — und
 * nicht erst im 400 beim ersten Kaufversuch eines Gastes. Eine Allowlist, die
 * man erst am Fehlschlag kennenlernt, ist eine Falle: den Schlüssel tippt die
 * Redaktion ein, das Scheitern erlebt der Käufer.
 *
 * Aus der Config gelesen statt in den Text geschrieben — sonst steht in der
 * Oberfläche irgendwann ein Muster, das die Config gar nicht mehr kennt.
 */
const oneTimeLookupKeys = computed(() =>
  (appConfig.pukalani as { billing?: { oneTimeLookupKeys?: string[] } }).billing?.oneTimeLookupKeys ?? [])

const priceLookupKeyHelp = computed(() => {
  const base = t('events.admin.form.priceLookupKeyHelp')
  if (!oneTimeLookupKeys.value.length) return base
  return `${base} ${t('events.admin.form.priceLookupKeyPattern', { patterns: oneTimeLookupKeys.value.join(', ') })}`
})

/**
 * Der URL-Platzhalter kommt aus dem Script, NICHT als `placeholder="https://"`
 * ins Template: vue-tsc ab 3.3.9 hält jedes `//` in den Props einer Komponente
 * für einen Zeilenkommentar, auch innerhalb eines Strings, und erzeugt
 * ungültigen Code (vuejs/language-tools#6240, Fix-PR #6241 offen). Die
 * Parser-Erholung danach verlor hier die `.value`-Zusicherung für `form` —
 * sechs TS2339 in jeder App, die events erbt. Ein Literal ohne `//` im
 * Template ist sicher.
 */
const urlPlaceholder = 'https://'

/**
 * BEIM ÖFFNEN eingefroren, nicht laufend berechnet: sonst verschwände die
 * Option mitten im Ausfüllen, sobald jemand ein bestehendes Paid-Event
 * versuchsweise auf „Kostenlos" stellt — und der Rückweg wäre weg.
 */
const paidChoosable = ref(false)

const editingId = ref<string | null>(null)
const editingCoverFileId = ref<string | null>(null)
const form = reactive<EventForm>(emptyForm())
const saving = ref(false)

/**
 * Beim OEFFNEN befuellen, nicht beim Prop-Wechsel: die Detailseite haelt ihre
 * Row in einem Realtime-Ref, das sich auch waehrend des Ausfuellens aendert
 * (ein fremdes RSVP genuegt fuer ein Update von `attendeeCount`). Haenge das
 * Formular daran, ueberschreibt ein fremder Klick die halb getippten Eingaben.
 */
watch(open, (isOpen) => {
  if (!isOpen) return
  const row = props.event ?? null
  editingId.value = row?.$id ?? null
  editingCoverFileId.value = row?.coverFileId ?? null
  paidChoosable.value = paidAccessChoosable(ticketCheckoutPath.value, row?.access)
  timezoneOverride.value = ''
  Object.assign(form, emptyForm())
  if (!row) return
  /**
   * EINE ABWEICHENDE TERMIN-ZONE ÜBERLEBT DAS BEARBEITEN (F59).
   *
   * Vorher las das Formular `row.timezone` gar nicht: es rechnete die Wanduhr
   * in der Community-Zone und schrieb sie beim Speichern auch wieder dorthin —
   * ein Termin in Tokio verschob sich also, sobald jemand nur den Titel
   * korrigierte, und zwar ohne dass irgendwo etwas danach aussah.
   *
   * MUSS VOR `toLocalInput` stehen: die Umrechnung liest `effectiveTimezone`,
   * und mit der falschen Zone stünde schon beim Öffnen die falsche Uhrzeit im
   * Feld — die dann beim nächsten Speichern echt würde.
   */
  if (row.timezone && row.timezone !== eventTimezone.value) timezoneOverride.value = row.timezone
  Object.assign(form, {
    title: row.title,
    description: row.description,
    startAt: toLocalInput(row.startAt),
    endAt: toLocalInput(row.endAt),
    location: row.location ?? '',
    url: row.url ?? '',
    capacity: row.capacity,
    locationType: effectiveLocationType(row),
    replayUrl: row.replayUrl ?? '',
    address: row.address ?? '',
    locationNotes: row.locationNotes ?? '',
    access: row.access ?? 'free',
    priceEur: row.priceAmount !== null ? row.priceAmount / 100 : null,
    priceLookupKey: row.priceLookupKey ?? '',
  })
}, { immediate: true })

/**
 * Nach einem Cover-Wechsel die Row nachladen und melden — der Aufrufer haelt
 * seine eigene Kopie (Tabelle, Detail-Ref) und wuesste sonst nichts vom neuen
 * `coverFileId`.
 *
 * Fail-soft: der Upload IST gelaufen, die Erfolgsmeldung steht schon. Ein
 * Fehlschlag hier ist eine veraltete Anzeige, kein verlorenes Bild — einen
 * Fehler-Toast ueber den Erfolgs-Toast zu legen waere die falsche Auskunft.
 */
async function reloadSaved() {
  if (!editingId.value) return
  try {
    emit('saved', await $fetch<EventRow>(`/api/events/${editingId.value}`))
  }
  catch {
    // Anzeige bleibt bis zum naechsten Laden alt — bewusst still.
  }
}

/**
 * ISO → Wert fürs datetime-local-Input, gerechnet in der TERMIN-Zone.
 *
 * Ohne Community-Zone (`''`) fällt beides auf die Gerätezone zurück und
 * verhält sich damit exakt wie vorher — das ist der Zustand jeder Community,
 * die noch keine Zone gesetzt hat.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  if (!effectiveTimezone.value) {
    const d = new Date(iso)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const w = wallClockIn(iso, effectiveTimezone.value)
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`
}

/** datetime-local → ISO (UTC), gelesen als Wanduhr der TERMIN-Zone. */
function toIso(local: string): string | null {
  if (!local) return null
  if (!effectiveTimezone.value) return new Date(local).toISOString()
  const [date, time] = local.split('T')
  const [year, month, day] = date!.split('-').map(Number)
  const [hour, minute] = time!.split(':').map(Number)
  return isoFromWallClock(
    { year: year!, month: month!, day: day!, hour: hour!, minute: minute!, second: 0 },
    effectiveTimezone.value,
  )
}

/**
 * ZEIGT DIE ADRESSE IN EIN ANDERES LAND? (F59)
 *
 * Nur bei „Vor Ort" — für einen Online-Termin gibt es keinen Ort, dessen Zone
 * gemeint sein könnte. Zeigt die Adresse ins EIGENE Land (Zone = die, in der
 * das Formular ohnehin rechnet), gibt es nichts vorzuschlagen; ein Vorschlag,
 * der nichts ändert, ist nur Lärm.
 */
const timezoneSuggestion = computed(() => {
  if (form.locationType !== 'venue') return null
  const hit = suggestTimezoneForAddress(form.address)
  return hit && hit.zone !== effectiveTimezone.value ? hit : null
})

/** Ländername in der Sprache der Oberfläche — die Regel liefert beide. */
const suggestionCountry = computed(() => {
  const hit = timezoneSuggestion.value
  if (!hit) return ''
  return locale.value.startsWith('de') ? hit.country.de : hit.country.en
})

/**
 * Übernehmen tauscht NUR die Bedeutung, nicht die getippte Zahl: 19:00 bleibt
 * 19:00 und heißt jetzt 19:00 in Tokio. Würden wir die Wanduhr umrechnen,
 * stünde nach einem Klick eine Uhrzeit im Feld, die niemand eingegeben hat.
 */
function applySuggestedTimezone() {
  const hit = timezoneSuggestion.value
  if (hit) timezoneOverride.value = hit.zone
}

// ---- Cover (nur im Bearbeiten-Modus — der Upload braucht die Event-Id) ----

const coverBusy = ref(false)

/**
 * Vorschau über die SERVER-Route, nicht über die Bucket-URL (F28, 2026-08-02).
 *
 * Das Titelbild eines ENTWURFS trägt seit F28 gar kein Leserecht mehr — vorher
 * bekam es ersatzweise das Mitglieder-Publikum, nur damit dieses `<img>` etwas
 * anzuzeigen hatte. Damit sah jedes Mitglied die Bilder unveröffentlichter
 * Termine. `GET /api/events/:id/cover` liefert dieselbe Vorschau hinter
 * `events.manage` und der Datentür.
 *
 * Der `fileId` hängt nur als Cache-Brecher dran: nach einem Ersetzen zeigt der
 * Browser sonst das alte Bild aus seinem Speicher. Gelesen wird er vom Server
 * nicht — die Datei kommt aus der geprüften Row.
 */
const coverPreviewUrl = computed(() =>
  editingId.value && editingCoverFileId.value
    ? `/api/events/${editingId.value}/cover?v=${editingCoverFileId.value}`
    : null,
)

async function uploadCover(input: HTMLInputElement) {
  const file = input.files?.[0]
  if (!file || !editingId.value) return
  coverBusy.value = true
  try {
    const body = new FormData()
    body.append('file', file)
    const res = await $fetch<{ fileId: string }>(`/api/events/${editingId.value}/cover`, { method: 'POST', body })
    editingCoverFileId.value = res.fileId
    toast.add({ title: t('events.admin.coverSaved'), color: 'success' })
    await reloadSaved()
  }
  catch {
    // Der wahrscheinlichste Grund steht in der Regel, die der Server prüft —
    // Format und Größe. Deshalb hier und nicht beim Entfernen (andere Ursache).
    toast.add({ title: t('events.admin.coverFailed'), description: t('events.admin.coverFailedHint'), color: 'error' })
  }
  finally {
    coverBusy.value = false
    input.value = ''
  }
}

async function removeCover() {
  if (!editingId.value) return
  coverBusy.value = true
  try {
    await $fetch(`/api/events/${editingId.value}/cover`, { method: 'DELETE' })
    editingCoverFileId.value = null
    toast.add({ title: t('events.admin.coverRemoved'), color: 'success' })
    await reloadSaved()
  }
  catch {
    toast.add({ title: t('events.admin.coverRemoveFailed'), description: t('events.admin.coverRemoveFailedHint'), color: 'error' })
  }
  finally {
    coverBusy.value = false
  }
}


async function save() {
  const payload = {
    title: form.title,
    description: form.description,
    startAt: toIso(form.startAt) ?? '',
    endAt: toIso(form.endAt),
    location: form.location.trim() || null,
    url: form.url.trim() || null,
    capacity: form.capacity,
    locationType: form.locationType,
    replayUrl: form.replayUrl.trim() || null,
    address: form.address.trim() || null,
    locationNotes: form.locationNotes.trim() || null,
    access: form.access,
    priceAmount: form.access === 'paid' && form.priceEur !== null ? Math.round(form.priceEur * 100) : null,
    priceLookupKey: form.access === 'paid' ? (form.priceLookupKey.trim() || null) : null,
    // Die Zone reist MIT der Zeile — nur so kann die Serien-Expansion später
    // auf der richtigen Wanduhr rechnen (shared/eventRecurrence.ts).
    timezone: effectiveTimezone.value || null,
    // Serie nur beim ANLEGEN — danach gibt es „Serie beenden" (PATCH strippt die Felder eh)
    ...(editingId.value
      ? {}
      : {
          recurrence: form.recurrence,
          seriesUntil: form.recurrence && form.seriesUntil ? new Date(`${form.seriesUntil}T23:59:59`).toISOString() : null,
          // Oeffentlicher Einstieg: sofort sichtbar statt unsichtbarer Entwurf
          ...(props.publishOnCreate ? { status: 'published' as const } : {}),
        }),
  }
  const parsed = createEventSchema(t).safeParse(payload)
  if (!parsed.success) {
    toast.add({ title: parsed.error.issues[0]?.message ?? t('events.admin.saveFailed'), color: 'error' })
    return
  }

  saving.value = true
  try {
    const row = editingId.value
      ? await $fetch<EventRow>(`/api/events/${editingId.value}`, { method: 'PATCH', body: parsed.data })
      : await $fetch<EventRow>('/api/events', { method: 'POST', body: parsed.data })
    // Nur beim ANLEGEN gibt es etwas zu erklaeren — und je nach Einstieg etwas
    // ANDERES: im Dashboard entsteht ein Entwurf, oeffentlich ein sichtbarer
    // Termin. Denselben Satz an beiden Stellen zu zeigen waere an einer falsch.
    toast.add({
      title: t('events.admin.saved'),
      description: editingId.value
        ? undefined
        : props.publishOnCreate ? t('events.admin.savedLiveHint') : t('events.admin.savedDraftHint'),
      color: 'success',
    })
    open.value = false
    emit('saved', row)
  }
  catch {
    toast.add({ title: t('events.admin.saveFailed'), description: t('events.admin.saveFailedHint'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

/**
 * Zwei echte Auswahlfelder (Audit-Befund C12): Ortstyp und Zugang waren
 * handgebaute Knopf-Paare — ein Paar Knöpfe, dessen „ausgewählt" nur eine
 * Farbe ist. `URadioGroup` ist genau dafür da: eine Auswahl, ein Wert, mit
 * Tastatur (Pfeiltasten) und Vorlesbarkeit ohne Zutun. Die Icons wandern in
 * die Items, damit die Erkennbarkeit bleibt.
 */
const locationTypeItems = computed(() => [
  { label: t('events.admin.form.venue'), value: 'venue', icon: 'i-ph-map-pin' },
  { label: t('events.admin.form.online'), value: 'online', icon: 'i-ph-video-camera' },
])
const accessItems = computed(() => [
  { label: t('events.card.free'), value: 'free', icon: 'i-ph-gift' },
  { label: t('events.card.paid'), value: 'paid', icon: 'i-ph-ticket' },
])

// ---- Serie (§7e) ----

/**
 * „Einmalig" TRÄGT EINEN WERT, und das ist kein Geschmack (2026-08-16 live
 * erwischt): `USelect` reicht seine Items an Rekas `SelectItem` durch, und das
 * WIRFT bei `value: ''` — „must have a value prop that is not an empty string",
 * weil der leere String dort reserviert ist („Auswahl gelöscht, Platzhalter
 * zeigen").
 *
 * Die Items mounten erst beim ÖFFNEN der Liste, deshalb sah das Formular heil
 * aus: der Dialog ging auf, der Knopf zeigte „Einmalig" — und jeder Klick auf
 * die Liste stürzte ab. Serien-Termine waren damit über die Oberfläche gar
 * nicht anzulegen (der Absturz riss beim Vorab-Öffnen über `?new=1` die ganze
 * Seite mit, so ist er aufgefallen).
 *
 * Der Sentinel bleibt in DIESER Datei: das Formularfeld und die Nutzlast führen
 * weiter '' (`recurrence: '' | 'weekly' | …`, die Route kennt nur das) —
 * übersetzt wird an genau einer Stelle, dem Proxy darunter.
 */
const RECURRENCE_NONE = 'none'
const recurrenceItems = computed(() => [
  { label: t('events.admin.form.recurrenceNone'), value: RECURRENCE_NONE },
  { label: t('events.series.weekly'), value: 'weekly' },
  { label: t('events.series.biweekly'), value: 'biweekly' },
  { label: t('events.series.monthly'), value: 'monthly' },
])
const recurrenceChoice = computed({
  get: () => form.recurrence || RECURRENCE_NONE,
  set: (value: string) => {
    form.recurrence = value === RECURRENCE_NONE ? '' : value as EventForm['recurrence']
  },
})
</script>

<template>
  <UModal v-model:open="open" :title="editingId ? t('events.admin.editTitle') : t('events.admin.createTitle')">
    <template #body>
      <form class="space-y-4" data-testid="event-form" @submit.prevent="save">
        <UFormField :label="t('events.admin.form.title')" required>
          <UInput v-model="form.title" class="w-full" :maxlength="200" data-testid="event-form-title" />
        </UFormField>
        <UFormField :label="t('events.admin.form.description')" :help="t('events.admin.form.descriptionHelp')" required>
          <UTextarea v-model="form.description" class="w-full" :rows="5" data-testid="event-form-description" />
        </UFormField>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField :label="t('events.admin.form.startAt')" :help="timezoneNote || undefined" required>
            <UInput v-model="form.startAt" type="datetime-local" class="w-full" data-testid="event-form-start" />
          </UFormField>
          <UFormField :label="t('events.admin.form.endAt')">
            <UInput v-model="form.endAt" type="datetime-local" class="w-full" />
          </UFormField>
        </div>
        <!-- Serie (§7e): nur beim Anlegen — danach gibt es „Serie beenden" -->
        <div v-if="!editingId" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField :label="t('events.admin.form.recurrence')" :help="t('events.admin.form.recurrenceHelp')">
            <USelect v-model="recurrenceChoice" :items="recurrenceItems" class="w-full" data-testid="event-form-recurrence" />
          </UFormField>
          <UFormField v-if="form.recurrence" :label="t('events.admin.form.seriesUntil')" :help="t('events.admin.form.seriesUntilHelp')">
            <UInput v-model="form.seriesUntil" type="date" class="w-full" data-testid="event-form-series-until" />
          </UFormField>
        </div>
        <UFormField :label="t('events.admin.form.locationType')">
          <URadioGroup
            v-model="form.locationType"
            :items="locationTypeItems"
            value-key="value"
            orientation="horizontal"
            :ui="{ fieldset: 'gap-x-6 gap-y-2 flex-wrap' }"
            data-testid="event-form-location-type"
          />
        </UFormField>
        <UFormField v-if="form.locationType === 'venue'" :label="t('events.admin.form.location')">
          <UInput v-model="form.location" class="w-full" :maxlength="255" />
        </UFormField>
        <UFormField
          v-if="form.locationType === 'venue'"
          :label="t('events.admin.form.address')"
          :help="t('events.admin.form.addressHelp')"
        >
          <UInput v-model="form.address" class="w-full" :maxlength="255" data-testid="event-form-address" />
        </UFormField>

        <!-- F59: Vorschlag und Rückweg stehen beim ORT, nicht bei der Uhrzeit —
             ausgelöst hat ihn die Adresse, und dort schaut man beim Prüfen hin.
             Beide Zeilen sind BEWUSST unabhängig (kein v-else): zeigt die
             Adresse nach dem Übernehmen in ein DRITTES Land, gibt es sonst
             einen Vorschlag ohne Rückweg. -->
        <div v-if="timezoneSuggestion || timezoneOverride" class="space-y-2">
          <UAlert
            v-if="timezoneSuggestion"
            color="neutral"
            variant="soft"
            icon="i-ph-clock"
            :title="t('events.admin.form.tzSuggestion', { country: suggestionCountry, zone: timezoneSuggestion.zone })"
            data-testid="event-form-tz-suggestion"
          >
            <template #actions>
              <UButton
                color="primary"
                variant="soft"
                size="xs"
                data-testid="event-form-tz-apply"
                @click="applySuggestedTimezone"
              >
                {{ t('events.admin.form.tzSuggestionApply') }}
              </UButton>
            </template>
          </UAlert>
          <UAlert
            v-if="timezoneOverride"
            color="neutral"
            variant="soft"
            icon="i-ph-globe-hemisphere-west"
            :title="t('events.admin.form.tzActive', { zone: timezoneOverride })"
            data-testid="event-form-tz-active"
          >
            <template #actions>
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                data-testid="event-form-tz-reset"
                @click="timezoneOverride = ''"
              >
                {{ eventTimezone ? t('events.admin.form.tzResetCommunity') : t('events.admin.form.tzResetDevice') }}
              </UButton>
            </template>
          </UAlert>
        </div>

        <UFormField
          v-if="form.locationType === 'venue'"
          :label="t('events.admin.form.locationNotes')"
          :help="t('events.admin.form.locationNotesHelp')"
        >
          <UTextarea v-model="form.locationNotes" class="w-full" :rows="2" :maxlength="1000" />
        </UFormField>
        <UFormField
          :label="t('events.admin.form.url')"
          :help="form.locationType === 'online' ? t('events.admin.form.urlHelp') : undefined"
        >
          <UInput v-model="form.url" type="url" class="w-full" :maxlength="500" :placeholder="urlPlaceholder" />
        </UFormField>
        <UFormField :label="t('events.admin.form.replayUrl')" :help="t('events.admin.form.replayHelp')">
          <UInput v-model="form.replayUrl" type="url" class="w-full" :maxlength="500" :placeholder="urlPlaceholder" />
        </UFormField>
        <UFormField :label="t('events.admin.form.capacity')" :help="t('events.admin.form.capacityHelp')">
          <UInputNumber v-model="form.capacity" :min="1" class="w-full" data-testid="event-form-capacity" />
        </UFormField>

        <!-- F13: ohne Verkaufsmöglichkeit (kein ticketCheckoutPath, also
             im Pool) fällt die GANZE Zeile weg — bliebe sie mit dem
             einzigen Wert „Kostenlos" stehen, wäre das eine Auswahl, die
             keine ist. Ein bestehendes Paid-Event bringt die Zeile beim
             Bearbeiten zurück (paidAccessChoosable). -->
        <UFormField v-if="paidChoosable" :label="t('events.admin.form.access')" :help="t('events.admin.form.accessHelp')">
          <URadioGroup
            v-model="form.access"
            :items="accessItems"
            value-key="value"
            orientation="horizontal"
            :ui="{ fieldset: 'gap-x-6 gap-y-2 flex-wrap' }"
            data-testid="event-form-access"
          />
        </UFormField>
        <div v-if="form.access === 'paid'" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <UFormField :label="t('events.admin.form.priceEur')">
            <UInputNumber v-model="form.priceEur" :min="0" :step="0.5" class="w-full" data-testid="event-form-price" />
          </UFormField>
          <UFormField :label="t('events.admin.form.priceLookupKey')" :help="priceLookupKeyHelp" required>
            <UInput
              v-model="form.priceLookupKey"
              class="w-full"
              :maxlength="64"
              :placeholder="t('events.admin.form.priceLookupKeyPlaceholder')"
            />
          </UFormField>
        </div>

        <UFormField v-if="editingId" :label="t('events.admin.form.cover')" :help="t('events.admin.form.coverHelp')">
          <!-- flex-wrap (Audit-Befund C12, „Mobil"): Vorschaubild + zwei
               Knöpfe passen auf 375 px nicht in eine Zeile und schoben den
               Dialog vorher seitlich auf. Der ursprünglich gemeldete Ort
               (die handgebaute Ereignis-Liste) existiert nicht mehr — sie
               ist mit B6 eine UTable geworden; das hier ist die letzte
               nicht umbrechende Zeile der Seite. -->
          <div class="flex flex-wrap items-center gap-3" data-testid="event-form-cover">
            <!-- Bewusst KEIN <NuxtImg provider="appwrite"> (F28): das
                 Bild kommt seit F28 aus der eigenen Server-Route, nicht
                 aus dem Bucket — der Anbieter würde aus dieser URL weder
                 Bucket noch Datei lesen können. Die Route liefert schon
                 eine skalierte WebP-Fassung; die Kachel bleibt 80×48. -->
            <img
              v-if="coverPreviewUrl"
              :src="coverPreviewUrl"
              alt=""
              width="80"
              height="48"
              decoding="async"
              class="h-12 w-20 rounded object-cover"
            >
            <label class="inline-flex">
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                class="hidden"
                data-testid="event-cover-input"
                @change="uploadCover($event.target as HTMLInputElement)"
              >
              <UButton as="span" color="neutral" variant="outline" size="sm" icon="i-ph-upload-simple" :loading="coverBusy">
                {{ editingCoverFileId ? t('events.admin.form.coverReplace') : t('events.admin.form.coverUpload') }}
              </UButton>
            </label>
            <UButton
              v-if="editingCoverFileId"
              color="error" variant="ghost" size="sm" icon="i-ph-trash"
              :disabled="coverBusy"
              @click="removeCover"
            >
              {{ t('events.admin.form.coverRemove') }}
            </UButton>
          </div>
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton color="neutral" variant="ghost" @click="() => { open = false }">
            {{ t('events.admin.form.cancel') }}
          </UButton>
          <UButton type="submit" :loading="saving" data-testid="event-form-save">
            {{ t('events.admin.form.save') }}
          </UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
