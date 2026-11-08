<script setup lang="ts">
import { groupTimezonesByRegion, supportedTimezones } from '../../../../../core/shared/timezone'
import { createCommunityProfileSchema } from '../../../../../control/schemas/communityProfile'

/**
 * COMMUNITY-EINSTELLUNGEN → ALLGEMEIN: die Schalter, die der KUNDIN gehören
 * (nicht dem Betreiber). Seit F51 (2026-08-07) der INDEX des Community-Hubs
 * (`/dashboard/community`, Reiter „Allgemein") — davor
 * `/dashboard/settings/community` als Reiter der KONTO-Hülle, was die falsche
 * Ebene war. Drei Bewohner:
 *
 *  1. „Offene Registrierung" (Audit-Befund S1, Davids Entscheidung 4 vom
 *     2026-07-27) — der Einladungs-Code gilt nur fürs GRÜNDEN einer
 *     Community, wer beitreten darf, entscheidet die Community.
 *     Seit A5 (2026-07-29) steuert DIESER Schalter auch die MITGLIEDSCHAFT, nicht
 *     mehr nur die Kontoanlage: an heißt „wer sich hier anmeldet oder das erste
 *     Mal mitschreibt, wird Mitglied", aus heißt „nur per Einladung"
 *     (packages/core/shared/communityJoin.ts). Deshalb ist die Beschreibung im
 *     Schalter ausführlicher als bei einem gewöhnlichen Ja/Nein — sie muss beide
 *     Folgen benennen.
 *  2. „Sichtbarkeit" (C18, Davids Entscheidung vom 2026-07-30) — öffentlich
 *     lesbar oder nur für Mitglieder. Steht BEWUSST in derselben Karte wie die
 *     Registrierung: beides sind Zugangsregeln, keine Optik. Als URadioGroup
 *     und nicht als Schalter, weil die zwei Zustände beide einen NAMEN
 *     verdienen — ein Schalter „Sichtbarkeit: an" sagt nicht, was aus ist.
 *     Was daran hängt, sagt der Hinweistext, und er sagt auch das
 *     Unangenehme: Suchmaschinen brauchen Tage, bis Bekanntes verschwindet.
 *     Der Schreibvorgang zieht den BESTAND mit um (Row-Permissions) — deshalb
 *     kann er ein paar Sekunden dauern und meldet Zahlen zurück; bleibt etwas
 *     offen, sagt der Toast es und ein erneuter Klick setzt fort.
 *
 *  3. „Gefahrenzone" (C16, 2026-07-31) — diese Community löschen. OWNER-Sache
 *     (`community.delete`), deshalb eine eigene Karte mit eigener Capability
 *     statt einer Zeile in der ersten. Was der Knopf tut, sagt er selbst:
 *     stilllegen (Host antwortet binnen ≤30 s mit 404) und allen den Zugang
 *     entziehen — INHALTE BLEIBEN. Der bewusste Schnitt „Deaktivieren +
 *     Zugänge entziehen, Daten bleiben" ist bei der puren Regel begründet
 *     (`decideCommunityDeletion`, packages/control/shared/communityTeam.ts).
 *
 * Die ersten beiden sind ZUGANGSREGELN. Die Karte „Erscheinungsbild" (Davids
 * Entscheidung 12 vom 2026-07-28) ist seit F5 (2026-07-31) auf eine EIGENE
 * Seite umgezogen —
 * `/dashboard/community/branding` im onboarding-Layer, unter der Capability,
 * der sie gehört (`branding.manage` statt
 * `team.manage`). Umgezogen, NICHT kopiert: zwei Flächen für dieselbe Wahl
 * wären Doppelpflege. Begründung des Schnitts (Wahl vs. Katalog) steht im Kopf
 * von packages/onboarding/app/pages/dashboard/community/branding.vue.
 *
 * ── WARUM IM ONBOARDING-LAYER (F24, 2026-08-02) ────────────────────────────
 * Alle drei Routen dieser Seite (`/api/community/registration`,
 * `/api/community/audience`, `/api/community/delete`) liegen hier, weil DIESER
 * Layer die Service-Naht zum Control Plane besitzt (`communities` gehört
 * dorthin, die Platform-App hat nur einen Read-only-Key). Siehe
 * packages/onboarding/server/api/community/{registration.patch,audience.patch,
 * delete.post}.ts.
 *
 * Die Seite lag bis zum 2026-08-02 im admin-Layer und rief von dort aus
 * ausschließlich fremde Routen — derselbe Schnitt-Fehler, wegen dem schon
 * die Mitglieder-Seite (S9) und das Branding (F5) umgezogen sind: eine
 * Seite kann nur so weit reichen wie ihre Routen. Eine Silo-App ohne
 * onboarding (comments, photos, portfolio, control) trug den Reiter also im
 * Bauplan und verließ sich darauf, dass eine LAUFZEIT-Beobachtung
 * (`isTenantHost`) ihn wegblendet. Jetzt gibt es dort weder Seite noch Reiter.
 *
 * Der Reiter selbst kommt aus der Registry `pukalani.admin.communityTabs`
 * (core/shared/types/settings-tab.ts), registriert in
 * packages/onboarding/app/app.config.ts — genau wie seine vier Geschwister
 * Branding, Mitglieder, Domain und Plan.
 *
 * Der Hinweis statt der Schalter BLEIBT trotzdem: `scope: 'community'` hält
 * den Reiter von einem Kontroll-Host fern, aber die Seite ist über ihre URL
 * weiterhin erreichbar (und `apps/platform` bedient Kontroll- UND
 * Mandanten-Hosts aus derselben App). Eine Seite, die dort mit toten Schaltern
 * dastünde, wäre schlechter als eine, die sagt, warum sie leer ist.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'team.manage' })

const { t } = useI18n()
const toast = useToast()

useBrandTitle(() => t('dashboard.settings.community'))

const { openRegistration } = useTenantOpenRegistration()
/** null = kein Mandanten-Host → die Schalter haben hier keine Bedeutung. */
const isTenantHost = computed(() => openRegistration.value !== null)

// ── Name und Beschreibung (U5, Befund K1) ───────────────────────────────────
//
// GANZ OBEN, weil es der einzige Fehler war, den ein Owner nicht mehr
// gutmachen konnte: der Name wurde im Wizard gesetzt und war danach für
// NIEMANDEN änderbar — auch nicht für uns. Er trägt Menükopf, Browser-Titel,
// Vorschaubild und den Absender jeder Mail.
//
// DIE ADRESSE BLEIBT UNBERÜHRT, und die Karte sagt das ausdrücklich: „meine
// Community umbenennen" heißt für die meisten Menschen auch „meine Adresse
// ändern", und wer das hier erwartet und nicht findet, sucht es nicht auf dem
// Reiter „Eigene Domain" — er hält es für kaputt.
const profileSchema = createCommunityProfileSchema(t)
const profileState = reactive({ name: '', description: '' })

/**
 * Der SSR-Name steht über `useTenantBrand()` bereit, die BESCHREIBUNG bewusst
 * nicht (sie reist nicht im Payload mit). Deshalb EIN Abruf für beide — er
 * kostet nichts extra, weil die Route ihn aus dem Resolver-Cache beantwortet.
 */
/**
 * `useRequestFetch` statt `$fetch` — dieselbe Regel und derselbe Fehler wie in
 * events/app/components/EventList.vue: im Pool entscheidet der HOST über den
 * Mandanten, und im SSR trägt ein blankes `$fetch` ihn nicht mit. Die Route
 * antwortete dann `404 Unknown host`, und die Karte stand leer da — dauerhaft,
 * denn `watch: [isTenantHost]` löst kein zweites Mal aus: der Wert ist beim
 * Hydrieren schon `true` und ändert sich nicht mehr.
 */
const brandName = useTenantBrand()
const requestFetch = useRequestFetch()
const { data: profile } = await useAsyncData(
  'community-profile',
  () => isTenantHost.value
    ? requestFetch<{ name: string, description: string }>('/api/community/profile')
    : Promise.resolve(null),
  { watch: [isTenantHost] },
)
watchEffect(() => {
  profileState.name = profile.value?.name ?? ''
  profileState.description = profile.value?.description ?? ''
})

const savingProfile = ref(false)
async function saveProfile() {
  savingProfile.value = true
  try {
    const result = await $fetch<{ name: string, description: string }>('/api/community/profile', {
      method: 'PATCH',
      body: { name: profileState.name, description: profileState.description },
    })
    // Aus der ANTWORT übernehmen — dieselbe Regel wie beim Schalter darunter.
    profile.value = result
    /**
     * UND EINMAL OPTIMISTISCH IN DEN KOPF DER SEITE: `useBrandName()` liest
     * diesen State, und der stammt aus dem Resolver-Cache (≤30 s). Ohne diese
     * Zeile stünde nach dem Speichern noch eine halbe Minute lang der ALTE
     * Name im Sidebar-Kopf und im Browser-Titel — direkt neben dem Formular,
     * das gerade „gespeichert" gemeldet hat. Ein D6-Spiegel wie beim Branding
     * kommt dafür bewusst NICHT in Frage: `community_branding` ist
     * read(any) und darf laut Migration 028 nie ein identifizierendes Feld
     * tragen. Andere offene Fenster holen den Namen beim nächsten
     * Seitenaufbau; der Wächter bleibt heil.
     */
    brandName.value = result.name
    toast.add({ title: t('dashboard.community.saved'), color: 'success' })
  }
  catch {
    toast.add({
      title: t('dashboard.community.saveFailed'),
      description: t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
  }
  finally {
    savingProfile.value = false
  }
}

const value = ref(openRegistration.value !== false)
watch(openRegistration, next => { value.value = next !== false })

/**
 * F57 Mechanik 2 (Davids Entscheidung 2026-08-14): „Mitglieder dürfen
 * einladen" — der Schwester-Schalter der offenen Registrierung, und deshalb
 * direkt darunter. Beide beantworten dieselbe Frage: wer kommt hier herein?
 *
 * Er nimmt dem Owner NICHTS: aus heißt „nur Owner/Admin laden ein", also der
 * Zustand von vor dem 2026-08-14.
 */
const { memberInvitesEnabled } = useTenantMemberInvites()
const memberInvites = ref(memberInvitesEnabled.value !== false)
watch(memberInvitesEnabled, next => { memberInvites.value = next !== false })

/**
 * HEIMAT-ZEITZONE (control-038, Davids Entscheidung 2026-08-17).
 *
 * Sie steht in DIESER Karte und nicht unter „Erscheinungsbild", weil sie keine
 * Optik ist: sie sagt, in welcher Zone die Community PLANT. Der Organisator
 * tippt „19:00" und meint Gruppen-Zeit — egal, wo er selbst sitzt (Meetup-Modell).
 *
 * WARUM ES DIE EINSTELLUNG GIBT: ohne sie kam die Vorgabe im Termin-Formular
 * aus dem BROWSER des Ausfüllenden. Am 2026-08-17 wurde so der „Freelancer-
 * Stammtisch Hamburg" von einem Gerät in Honolulu auf 07:00 morgens gelegt.
 *
 * '' = keine eigene Wahl (dann bleibt es beim Geräte-Verhalten, sichtbar
 * beschriftet). Der Leerwert darf NICHT in ein `USelectItem` (Reka verbietet
 * ihn, s. CLAUDE.md) — deshalb der Sentinel `AUTOMATIC` wie im Konto-Picker.
 */
const AUTOMATIC_TZ = '__automatic__'
const { branding: communitySettings } = useCommunitySettings()
const communityTimezone = ref(communitySettings.value?.timezone || AUTOMATIC_TZ)
watch(() => communitySettings.value?.timezone, (next) => {
  communityTimezone.value = next || AUTOMATIC_TZ
})

/**
 * Dieselbe Bauart wie der Konto-Picker (`UserTimezoneSettings.vue`) — inklusive
 * der dort gelernten Eigenheit: WÄHREND EINER SUCHE FALLEN DIE ÜBERSCHRIFTEN
 * WEG. Nuxt UI behandelt `type: 'label'` als STRUKTUR und filtert sie nie mit;
 * die Suche nach „Berlin" zeigte sonst leere Regions-Zeilen über dem Treffer.
 */
const timezoneSearch = ref('')
const timezoneItems = computed(() => {
  const entries: Array<{ label: string, value?: string, type?: 'label' }> = [
    { label: t('dashboard.community.timezoneAutomatic'), value: AUTOMATIC_TZ },
  ]
  const searching = timezoneSearch.value.trim().length > 0
  for (const group of groupTimezonesByRegion(supportedTimezones())) {
    if (!searching) entries.push({ label: group.region, type: 'label' })
    for (const zone of group.zones) entries.push({ label: zone.replace(/_/g, ' '), value: zone })
  }
  return entries
})

const savingTimezone = ref(false)
/**
 * Gespeichert wird bei ÄNDERUNG, nicht über `@update:model-value`: der
 * Item-Union des Menüs (Zonen + Überschriften) trägt dort keinen sauberen
 * String-Typ. Der Vergleich mit dem gespeicherten Wert verhindert zugleich ein
 * Speichern beim bloßen Befüllen — sonst schriebe jeder Seitenaufbau.
 */
watch(communityTimezone, (next) => {
  const stored = communitySettings.value?.timezone || AUTOMATIC_TZ
  if (next === stored) return
  void saveTimezone(next)
})

async function saveTimezone(next: string) {
  savingTimezone.value = true
  const value = next === AUTOMATIC_TZ ? '' : next
  try {
    const result = await $fetch<{ timezone: string }>('/api/community/timezone', {
      method: 'PATCH',
      body: { timezone: value },
    })
    // Aus der ANTWORT übernehmen, wie bei den Schaltern darüber: der SSR-Wert
    // stammt aus dem Resolver-Cache (≤30 s) und wäre sonst 30 s lang veraltet.
    if (communitySettings.value) communitySettings.value = { ...communitySettings.value, timezone: result.timezone }
    communityTimezone.value = result.timezone || AUTOMATIC_TZ
    toast.add({ title: t('dashboard.community.saved'), color: 'success' })
  }
  catch {
    communityTimezone.value = communitySettings.value?.timezone || AUTOMATIC_TZ
    toast.add({
      title: t('dashboard.community.saveFailed'),
      description: t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
  }
  finally {
    savingTimezone.value = false
  }
}

const savingMemberInvites = ref(false)
async function saveMemberInvites(next: boolean) {
  savingMemberInvites.value = true
  try {
    const result = await $fetch<{ memberInvitesEnabled: boolean }>('/api/community/member-invites', {
      method: 'PATCH',
      body: { memberInvitesEnabled: next },
    })
    // Aus der ANTWORT übernehmen, aus demselben Grund wie beim Schalter
    // darüber: der SSR-Wert stammt aus dem Resolver-Cache (≤30 s).
    memberInvitesEnabled.value = result.memberInvitesEnabled
    memberInvites.value = result.memberInvitesEnabled
    toast.add({ title: t('dashboard.community.saved'), color: 'success' })
  }
  catch {
    memberInvites.value = memberInvitesEnabled.value !== false
    toast.add({
      title: t('dashboard.community.saveFailed'),
      description: t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
  }
  finally {
    savingMemberInvites.value = false
  }
}

const saving = ref(false)
async function save(next: boolean) {
  saving.value = true
  try {
    const result = await $fetch<{ openRegistration: boolean }>('/api/community/registration', {
      method: 'PATCH',
      body: { openRegistration: next },
    })
    // Aus der ANTWORT übernehmen, nicht aus dem Klick: das Control Plane ist
    // die Wahrheit. Der SSR-Wert stammt aus dem Resolver-Cache der Platform-App
    // (≤30 s) — ohne diese Zeile würde ein Reload kurzzeitig das Alte zeigen.
    openRegistration.value = result.openRegistration
    value.value = result.openRegistration
    toast.add({ title: t('dashboard.community.saved'), color: 'success' })
  }
  catch {
    value.value = openRegistration.value !== false
    toast.add({
      title: t('dashboard.community.saveFailed'),
      description: t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

// ── Sichtbarkeit (C18) ──────────────────────────────────────────────────────

/** Ergebnis des Bestands-Umzugs, wie ihn die Route zurückmeldet. */
interface AudienceResult {
  audience: 'members' | 'public'
  repermission: { complete: boolean, changed: number, failed: number }
}

const { audience } = useTenantAudience()
const audienceValue = ref<'members' | 'public'>(audience.value ?? 'public')
watch(audience, (next) => { audienceValue.value = next ?? 'public' })

const audienceOptions = computed(() => [
  {
    value: 'public',
    label: t('dashboard.community.audience.public'),
    description: t('dashboard.community.audience.publicDesc'),
  },
  {
    value: 'members',
    label: t('dashboard.community.audience.members'),
    description: t('dashboard.community.audience.membersDesc'),
  },
])

const savingAudience = ref(false)
async function saveAudience(next: 'members' | 'public') {
  if (savingAudience.value || next === audience.value) return
  savingAudience.value = true
  try {
    const result = await $fetch<AudienceResult>('/api/community/audience', {
      method: 'PATCH',
      body: { audience: next },
    })
    // Wie bei den anderen Schaltern: der gültige Wert kommt aus der ANTWORT.
    audience.value = result.audience
    audienceValue.value = result.audience
    // Der Umzug des Bestands kann an einem Zeitbudget enden oder an einzelnen
    // Zeilen scheitern. Das zu verschweigen wäre das Schlimmste, was diese
    // Seite tun könnte — „geschlossen" muss geschlossen heißen.
    if (result.repermission.complete) {
      toast.add({
        title: t('dashboard.community.audience.saved'),
        description: t('dashboard.community.audience.savedDesc', { n: result.repermission.changed }),
        color: 'success',
      })
    }
    else {
      toast.add({
        title: t('dashboard.community.audience.partialTitle'),
        description: t('dashboard.community.audience.partialDesc', { n: result.repermission.changed }),
        color: 'warning',
      })
    }
  }
  catch {
    audienceValue.value = audience.value ?? 'public'
    toast.add({
      title: t('dashboard.community.saveFailed'),
      description: t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
  }
  finally {
    savingAudience.value = false
  }
}

// ── Gefahrenzone: diese Community löschen (C16) ─────────────────────────────

/**
 * OWNER-Sache (`community.delete`), nicht `team.manage` — ein Admin führt die
 * Verwaltung, aber er legt die Community nicht still. Die Karte verschwindet
 * für ihn ganz; die AUTORITÄT ist `requireCommunityPermission` auf der Route
 * und das Control Plane, das die Regel noch einmal selbst prüft.
 */
const canDelete = useCommunityCapability('community.delete')
const confirm = useConfirm()
/** Stilllegen verlangt eine frische Anmeldung (RA2) — gemeinsamer Weg aus core. */
const { promptFreshSignIn } = useRecentAuthPrompt()
/** Anzeigename dieser Community (mit Fallback auf den App-Brand). Er gehört in
 *  die Rückfrage — „diese Community" ist kein Gegenstand, den man
 *  wiedererkennt, und genau daran hängt eine unumkehrbar wirkende Zusage. */
const communityName = useBrandName()

const deleting = ref(false)
/** true = in dieser Sitzung stillgelegt (der Host antwortet gleich mit 404). */
const deleted = ref(false)

/**
 * Was der Klick WIRKLICH tut, steht im Dialog und noch einmal im Toast:
 * stilllegen + allen den Zugang nehmen, Inhalte bleiben. Ein „Löschen", das
 * in Wahrheit etwas anderes tut, wäre die schlimmste Sorte Knopf — deshalb
 * nennt der Text beides, die Wirkung UND die Grenze.
 */
async function deleteCommunity() {
  if (deleting.value || deleted.value) return
  const ok = await confirm({
    title: t('dashboard.community.danger.confirmTitle', { name: communityName.value }),
    description: t('dashboard.community.danger.confirmText'),
    confirmLabel: t('dashboard.community.danger.confirm'),
    action: async () => {
      deleting.value = true
      await $fetch('/api/community/delete', { method: 'POST' })
    },
  }).catch(async (error: unknown) => {
    // Erst die frische Anmeldung (RA2): dann erklärt ein eigener Dialog den
    // Grund, und nichts ist stillgelegt — kein Fehler-Toast obendrauf.
    if (await promptFreshSignIn(error, t('dashboard.community.danger.reauthText'))) return false
    // FACHLICHE Gründe reisen als `data.reason` (core/server/error.ts hebt
    // `data.code` ins Envelope) — alles andere ist ein echter Fehler.
    const reason = (error as { data?: { reason?: string } })?.data?.reason
    const known = reason === 'subscription_active' || reason === 'already_disabled' || reason === 'owner_protected'
    toast.add({
      title: known ? t(`dashboard.community.danger.errors.${reason}`) : t('dashboard.community.saveFailed'),
      description: known ? undefined : t('dashboard.community.saveFailedDesc'),
      color: 'error',
    })
    return false
  }).finally(() => { deleting.value = false })

  if (!ok) return
  deleted.value = true
  toast.add({
    title: t('dashboard.community.danger.done'),
    description: t('dashboard.community.danger.doneDesc'),
    color: 'success',
  })
}
</script>

<template>
  <!-- Name und Beschreibung (U5): die erste Karte, weil sie den einzigen
       unumkehrbaren Fehler des Produkts umkehrbar macht. Nur auf einem
       Mandanten-Host — ohne Community gibt es keinen Namen zu ändern. -->
  <UPageCard
    v-if="isTenantHost"
    :title="t('dashboard.community.profile.title')"
    :description="t('dashboard.community.profile.description')"
    variant="subtle"
  >
    <UForm
      :schema="profileSchema"
      :state="profileState"
      class="flex flex-col gap-4"
      data-community-profile
      @submit="saveProfile"
    >
      <UFormField
        name="name"
        :label="t('dashboard.community.profile.nameLabel')"
        :description="t('dashboard.community.profile.nameHelp')"
        required
      >
        <UInput v-model="profileState.name" class="w-full" data-community-profile-name />
      </UFormField>

      <UFormField
        name="description"
        :label="t('dashboard.community.profile.descriptionLabel')"
        :description="t('dashboard.community.profile.descriptionHelp')"
      >
        <UTextarea
          v-model="profileState.description"
          :rows="3"
          class="w-full"
          data-community-profile-description
        />
      </UFormField>

      <!-- Der Satz, der die häufigste Fehlerwartung abfängt: „umbenennen"
           heißt für viele auch „Adresse ändern". -->
      <p class="flex items-start gap-2 text-sm text-muted">
        <UIcon name="i-ph-link" class="mt-0.5 size-4 shrink-0" />
        {{ t('dashboard.community.profile.addressHint') }}
      </p>

      <div class="flex justify-end">
        <UButton type="submit" :loading="savingProfile" data-community-profile-save>
          {{ t('dashboard.community.profile.submit') }}
        </UButton>
      </div>
    </UForm>
  </UPageCard>

  <UPageCard
    :title="t('dashboard.community.title')"
    :description="t('dashboard.community.description')"
    variant="subtle"
  >
    <UAlert
      v-if="!isTenantHost"
      color="neutral"
      variant="subtle"
      icon="i-ph-info"
      :title="t('dashboard.community.noTenantTitle')"
      :description="t('dashboard.community.noTenantText')"
    />

    <div v-else class="flex items-center justify-between gap-4" data-community-registration>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-user-plus" class="mt-0.5 size-5 shrink-0 text-muted" />
        <div>
          <p class="text-sm font-medium">{{ t('dashboard.community.openRegistration') }}</p>
          <p class="text-sm text-muted">{{ t('dashboard.community.openRegistrationDesc') }}</p>
        </div>
      </div>
      <!-- Der neue Wert kommt aus dem EVENT, nicht aus `value`: die Reihenfolge
           von v-model-Zuweisung und Emit ist nichts, worauf man sich verlassen
           sollte. -->
      <USwitch
        v-model="value"
        :disabled="saving"
        :aria-label="t('dashboard.community.openRegistration')"
        @update:model-value="(next: boolean) => save(next)"
      />
    </div>

    <!-- F57 Mechanik 2: derselbe Bereich, weil es dieselbe Frage ist — wer
         kommt hier herein. Aus heißt „nur Owner/Admin laden ein", also der
         Zustand von vor dem 2026-08-14; das Recht des Owners schrumpft nie. -->
    <div v-if="isTenantHost" class="flex items-center justify-between gap-4" data-community-member-invites>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-paper-plane-tilt" class="mt-0.5 size-5 shrink-0 text-muted" />
        <div>
          <p class="text-sm font-medium">{{ t('dashboard.community.memberInvites') }}</p>
          <p class="text-sm text-muted">{{ t('dashboard.community.memberInvitesDesc') }}</p>
        </div>
      </div>
      <USwitch
        v-model="memberInvites"
        :disabled="savingMemberInvites"
        :aria-label="t('dashboard.community.memberInvites')"
        @update:model-value="(next: boolean) => saveMemberInvites(next)"
      />
    </div>

    <!-- Heimat-Zeitzone: KEINE Zugangsregel, sondern die Wahl, in welcher Zone
         diese Community plant. Steht hier, weil sie die ganze Community betrifft
         und nicht ein einzelnes Produkt. -->
    <div v-if="isTenantHost" class="flex flex-col gap-3 border-t border-default pt-4" data-community-timezone>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-clock" class="mt-0.5 size-5 shrink-0 text-muted" />
        <div class="min-w-0">
          <p class="text-sm font-medium">{{ t('dashboard.community.timezone') }}</p>
          <p class="text-sm text-muted">{{ t('dashboard.community.timezoneDesc') }}</p>
        </div>
      </div>
      <USelectMenu
        v-model="communityTimezone"
        v-model:search-term="timezoneSearch"
        :items="timezoneItems"
        value-key="value"
        :disabled="savingTimezone"
        class="w-full sm:max-w-sm"
        :aria-label="t('dashboard.community.timezone')"
        data-community-timezone-select
      />
    </div>

    <!-- Sichtbarkeit (C18): zweite Zugangsregel derselben Karte. Zwei benannte
         Zustände statt eines Schalters — und darunter der Satz, der die
         unbequeme Wahrheit sagt (Suchmaschinen brauchen Zeit). -->
    <div v-if="isTenantHost" class="flex flex-col gap-3 border-t border-default pt-4" data-community-audience>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-globe-hemisphere-west" class="mt-0.5 size-5 shrink-0 text-muted" />
        <div>
          <p class="text-sm font-medium">{{ t('dashboard.community.audience.title') }}</p>
          <p class="text-sm text-muted">{{ t('dashboard.community.audience.description') }}</p>
        </div>
      </div>
      <URadioGroup
        v-model="audienceValue"
        :items="audienceOptions"
        :disabled="savingAudience"
        variant="card"
        :aria-label="t('dashboard.community.audience.title')"
        @update:model-value="(next) => saveAudience(next as 'members' | 'public')"
      />
      <p class="text-sm text-muted">{{ t('dashboard.community.audience.searchNote') }}</p>
    </div>
  </UPageCard>

  <!-- Gefahrenzone (C16): eigene Karte, eigene Capability (Owner). Bewusst UNTEN
       und optisch abgesetzt — und bewusst NICHT ausgegraut versteckt: was es
       nicht gibt, gehört gar nicht ins Bild; was es gibt, muss ehrlich sagen,
       was es tut. -->
  <UPageCard
    v-if="isTenantHost && canDelete"
    :title="t('dashboard.community.danger.title')"
    :description="t('dashboard.community.danger.description')"
    variant="subtle"
    class="ring-error/30"
  >
    <div class="flex flex-wrap items-center justify-between gap-4" data-community-danger>
      <div class="flex items-start gap-3">
        <UIcon name="i-ph-warning-octagon" class="mt-0.5 size-5 shrink-0 text-error" />
        <div>
          <p class="text-sm font-medium">{{ t('dashboard.community.danger.what') }}</p>
          <p class="text-sm text-muted">{{ t('dashboard.community.danger.keeps') }}</p>
        </div>
      </div>
      <UButton
        color="error"
        variant="subtle"
        icon="i-ph-trash"
        :loading="deleting"
        :disabled="deleted"
        data-community-delete
        @click="deleteCommunity"
      >
        {{ t('dashboard.community.danger.cta') }}
      </UButton>
    </div>

    <UAlert
      v-if="deleted"
      color="warning"
      variant="subtle"
      icon="i-ph-moon"
      :title="t('dashboard.community.danger.done')"
      :description="t('dashboard.community.danger.doneDesc')"
    />
  </UPageCard>
</template>
