<script setup lang="ts">
/**
 * EINSTELLUNGEN → EIGENE DOMAIN (control-035, Davids Entscheidungen vom
 * 2026-08-07).
 *
 * Die Selbstbedienungs-Fläche zu Entscheidung 3: der Owner trägt seine Domain
 * ein, bekommt die DNS-Einträge zum Abschreiben und drückt „Prüfen", bis es
 * steht. Es gibt bewusst KEINEN Hintergrund-Job, der ihn irgendwann
 * benachrichtigt — die Wartezeiten hängen an fremden Uhren (DNS-Verbreitung,
 * Let's Encrypt), und ein Knopf, der jederzeit ehrlich sagt, wo es hängt, ist
 * verständlicher als ein Fortschrittsbalken, der etwas verspricht.
 *
 * WARUM IM ONBOARDING-LAYER: dieselbe Begründung wie bei Mitgliedern (S9),
 * Branding (F5), Abo (A6) und den Community-Einstellungen (F24) — die Seite
 * kann nur so weit reichen wie ihre Routen, und `/api/community/domain/*`
 * liegen hier, weil dieser Layer die Service-Naht zum Control Plane besitzt.
 * Eine Silo-App ohne onboarding bekommt so keinen Reiter ins Leere.
 *
 * DREI ZUSTÄNDE, DREI ANSICHTEN — und jeder erklärt sich selbst:
 *  1. Kein Mandanten-Host (Kontroll-Host, Silo): ein Hinweis statt toter
 *     Felder. Der Reiter ist dort zwar `scope: 'community'` und verschwindet,
 *     die URL bleibt aber erreichbar (apps/platform bedient beide Sorten Host).
 *  2. Plan reicht nicht (Davids Entscheidung 1: ab Pro): der Kasten steht da,
 *     erklärt das Merkmal und zeigt auf die Abo-Seite. Ein leeres Feld ohne
 *     Begründung wäre die schlechteste Antwort — der Owner soll wissen, dass
 *     es das gibt.
 *  3. Pro: Eingabe, DNS-Anleitung, Prüfen, Statuskette.
 *
 * SEIT control-040 (SEC-022, BE-014) entscheidet nicht mehr der Plan allein,
 * sondern die Regel des Control Plane (`entitlement` in der Antwort): Pro,
 * KEINE Testphase ohne Abo, und die Freigabe des Betreibers. Jeder der drei
 * Gründe hat seinen eigenen Hinweis. Ohne Antwort (älteres Control Plane, oder
 * noch nicht geladen) gilt weiter `planAllows('customDomain')`. Dazu zwei neue
 * Zustände: die FRIST nach dem Ende von Testphase oder Abo (Warnung mit Datum)
 * und die ABGESCHALTETE Domain (`paused`, mit „Wieder einschalten").
 *
 * DIE ANLEITUNG KOMMT VOM SERVER, nicht aus dieser Datei: Server-IP und
 * CNAME-Ziel stehen in der Runtime-Config des Control Plane
 * (`customDomainServerIps` / `customDomainCnameTarget`) und sind dort
 * env-überschreibbar. Sie hier zu wiederholen hieße, bei einem Server-Umzug
 * eine Kunden-Anleitung zu vergessen.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'community.domain' })

/** Warum keine eigene Domain (control-040) — die Werte von `customDomainEntitlement`. */
type DomainDenial = 'plan_required' | 'trial' | 'approval_required'

interface CustomDomainState {
  domain: string
  status: 'none' | 'pending_dns' | 'pending_cert' | 'pending_platform' | 'active' | 'error' | 'paused'
  error: string
  forms: string[]
  verifiedAt: string | null
  activatedAt: string | null
  canonicalHost: string
  fallbackHost: string
  plan: string
  planAllows: boolean
  /** Seit control-040: die Regel des Control Plane. Fehlt bei einem älteren
   *  Control Plane — dann gilt `planAllows`. */
  entitlement?: { allowed: boolean, reason?: DomainDenial }
  approved?: boolean
  graceEndsAt?: string | null
  pausedAt?: string | null
  claimExpiresAt?: string | null
  /**
   * NUR aus einer Antwort auf „Prüfen" (U16) — die Lade- und die
   * Speicher-Antwort tragen es bewusst nicht, weil dort nichts gemessen wurde.
   * `undefined` heißt deshalb „nicht geprüft" und blendet die Warnung aus,
   * statt sie zu verneinen.
   */
  caaBlocked?: boolean
  instructions: {
    txtName: string
    txtValue: string
    cnameTarget: string
    serverIps: string[]
    apexForm: string | null
    wwwForm: string | null
  }
}

const { t } = useI18n()
const toast = useToast()
const localePath = useLocalePath()
const { formatDate } = useFormatDate()

useBrandTitle(() => t('onboarding.domain.title'))

/** null = kein Pool-Mandant (Silo, Kontroll-Host) → hier gibt es keine Adresse. */
const { plan, planAllows } = useTenantPlan()
const isTenantHost = computed(() => plan.value !== null)
/**
 * Sichtbarkeits-Gate über die BESTEHENDE Plan-Mechanik. Die Autorität ist der
 * Server (das Control Plane liest den Plan aus der `communities`-Zeile und
 * antwortet 403 `plan_required`); das hier entscheidet nur, ob die Seite die
 * Eingabe anbietet oder den Hinweis.
 */
const state = ref<CustomDomainState | null>(null)

/**
 * Warum es (gerade) keine eigene Domain gibt — `null` = erlaubt. Die Antwort
 * des Control Plane gewinnt; ohne sie der alte Weg über den Plan.
 */
const denial = computed<DomainDenial | null>(() => {
  const entitlement = state.value?.entitlement
  if (entitlement) return entitlement.allowed ? null : (entitlement.reason ?? 'plan_required')
  return planAllows('customDomain') ? null : 'plan_required'
})
const allowed = computed(() => denial.value === null)

const DENIAL_TEXT: Record<DomainDenial, { title: string, description: string }> = {
  plan_required: { title: 'onboarding.domain.planTitle', description: 'onboarding.domain.planDesc' },
  trial: { title: 'onboarding.domain.trialTitle', description: 'onboarding.domain.trialDesc' },
  approval_required: { title: 'onboarding.domain.approvalTitle', description: 'onboarding.domain.approvalDesc' },
}
/**
 * Plan und Testphase zeigen auf die Abo-Seite. Die Freigabe hat KEINEN Link:
 * im Dashboard gibt es heute keinen privaten Weg zu uns (der Feedback-Knopf
 * ist eine geteilte Liste, keine Nachricht) — der Satz sagt, was zu tun ist.
 */
function denialActions(reason: DomainDenial) {
  return reason === 'approval_required'
    ? []
    : [{ label: t('onboarding.domain.planCta'), to: localePath('/dashboard/community/plan'), color: 'primary' as const }]
}

const graceDate = computed(() => (state.value?.graceEndsAt ? formatDate(state.value.graceEndsAt) : ''))
const claimDate = computed(() => (state.value?.claimExpiresAt ? formatDate(state.value.claimExpiresAt) : ''))
const loading = ref(true)
const busy = ref('')

async function load() {
  if (!isTenantHost.value) {
    loading.value = false
    return
  }
  try {
    state.value = await $fetch<CustomDomainState>('/api/community/domain')
  }
  catch {
    state.value = null
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const input = ref('')
watch(state, (next) => { input.value = next?.domain ?? '' })

/** Fehlerschlüssel → Text. Ohne bekannten Schlüssel der allgemeine Satz —
 *  besser ein unscharfer Satz als ein roher Code auf der Seite. */
function rejectionText(error: unknown): string {
  const reason = (error as { data?: { reason?: string } })?.data?.reason ?? ''
  const known = [
    'domain_empty', 'domain_too_long', 'domain_invalid', 'domain_not_a_domain',
    'domain_operator_domain', 'domain_taken', 'plan_required', 'domain_missing',
    'domain_not_ready', 'trial_not_included', 'approval_required',
  ]
  return known.includes(reason)
    ? t(`onboarding.domain.errors.${reason}`)
    : t('onboarding.domain.errors.generic')
}

async function save() {
  const value = input.value.trim()
  if (!value || busy.value) return
  busy.value = 'save'
  try {
    // Der gültige Zustand kommt aus der ANTWORT, nicht aus dem Klick — das
    // Control Plane ist die Wahrheit (Muster registration.patch.ts).
    state.value = await $fetch<CustomDomainState>('/api/community/domain', { method: 'PUT', body: { domain: value } })
    toast.add({ title: t('onboarding.domain.savedTitle'), description: t('onboarding.domain.savedDesc'), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('onboarding.domain.saveFailed'), description: rejectionText(error), color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

/**
 * Läuft gerade IRGENDEIN Prüf-Lauf? Knopf und Takt (U16) teilen sich diese
 * Sperre — `busy` allein reichte nicht, weil der automatische Lauf es bewusst
 * NICHT setzt (sonst blinkte alle 30 s der Ladezustand über die Knöpfe und
 * finge dabei Klicks ab).
 */
const checking = ref(false)

/**
 * `quiet` = der Lauf kommt vom Takt, nicht vom Knopf: gleiche Anfrage,
 * gleicher Zustand, aber KEINE Meldung. Ein Toast alle 30 s („noch nicht
 * fertig") wäre die Belästigung, für die niemand einen Auto-Check will — und
 * eine automatische FEHLERmeldung ließe einen kurzen Netzhänger wie ein
 * Problem der Domain aussehen.
 */
async function verify(quiet = false) {
  if (busy.value || checking.value) return
  checking.value = true
  if (!quiet) busy.value = 'verify'
  try {
    const next = await $fetch<CustomDomainState>('/api/community/domain/verify', { method: 'POST' })
    state.value = next
    if (quiet) return
    if (next.status === 'active') {
      toast.add({ title: t('onboarding.domain.activeTitle'), description: t('onboarding.domain.activeDesc', { domain: next.domain }), color: 'success' })
    }
    else {
      // Der Zwischenstand ist KEIN Fehler, und er wird auch nicht als einer
      // gemeldet: „noch nicht" ist der Normalfall, solange DNS unterwegs ist.
      toast.add({ title: t(`onboarding.domain.status.${next.status}`), description: next.error || t('onboarding.domain.checkAgain'), color: 'info' })
    }
  }
  catch (error) {
    if (!quiet) toast.add({ title: t('onboarding.domain.saveFailed'), description: rejectionText(error), color: 'error' })
  }
  finally {
    checking.value = false
    if (!quiet) busy.value = ''
  }
}

/**
 * Nachgeprüft wird NUR, solange etwas offen ist: eine eingetragene Domain, die
 * noch nicht aktiv ist. Danach hört der Takt von selbst auf — ein Takt ohne
 * Frage ist nur eine Anfrage-Quelle. Der manuelle Knopf bleibt unberührt.
 */
const autoCheckActive = computed(() =>
  isTenantHost.value && allowed.value && !!state.value?.domain
  // Eine ABGESCHALTETE Domain schaltet nur der Knopf wieder ein, nie der Takt
  // (control-040) — sonst ginge sie hinter dem Rücken des Owners wieder an.
  && state.value.status !== 'active' && state.value.status !== 'paused',
)
useDomainAutoCheck({ active: () => autoCheckActive.value, run: () => verify(true) })

const confirm = useConfirm()

async function remove() {
  if (busy.value || !state.value?.domain) return
  const ok = await confirm({
    title: t('onboarding.domain.removeConfirmTitle'),
    description: t('onboarding.domain.removeConfirmText', { domain: state.value.domain, host: state.value.fallbackHost }),
    confirmLabel: t('onboarding.domain.remove'),
    color: 'error',
  })
  if (!ok) return
  busy.value = 'remove'
  try {
    state.value = await $fetch<CustomDomainState>('/api/community/domain', { method: 'DELETE' })
    input.value = ''
    toast.add({ title: t('onboarding.domain.removedTitle'), color: 'success' })
  }
  catch (error) {
    toast.add({ title: t('onboarding.domain.saveFailed'), description: rejectionText(error), color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

/**
 * ANLEITUNGEN JE ANBIETER (U16, Wettbewerb E6.2 — Ghost, Discourse, Circle und
 * Framer führen alle eine solche Liste; Pukalani hatte keine).
 *
 * Die fünf im DACH-Raum häufigsten plus einen ehrlichen Sammel-Abschnitt. Was
 * hier steht, ist der WEG zur DNS-Oberfläche und die jeweilige Falle — NICHT
 * die Werte: die stehen genau einmal oben in der Anleitungs-Karte und kommen
 * vom Server (Server-IP und CNAME-Ziel sind env-überschreibbar). Eine zweite
 * Abschrift hier wäre bei einem Server-Umzug die Kopie, die niemand mitzieht.
 */
const REGISTRARS = ['ionos', 'strato', 'united', 'hetzner', 'cloudflare', 'other'] as const

const registrarItems = computed(() => REGISTRARS.map(key => ({
  label: t(`onboarding.domain.registrars.${key}.label`),
  path: t(`onboarding.domain.registrars.${key}.path`),
  note: t(`onboarding.domain.registrars.${key}.note`),
})))

/** Die Kette der Schritte — jeder Schritt weiß, ob er schon durch ist. */
const steps = computed(() => {
  const status = state.value?.status ?? 'none'
  const rank = ['none', 'pending_dns', 'pending_cert', 'pending_platform', 'active'].indexOf(status)
  const done = (needed: number) => rank > needed
  return [
    { key: 'dns', label: t('onboarding.domain.steps.dns'), done: done(1) },
    { key: 'cert', label: t('onboarding.domain.steps.cert'), done: done(2) },
    { key: 'platform', label: t('onboarding.domain.steps.platform'), done: done(3) },
  ]
})
</script>

<template>
  <div class="space-y-6">
    <UAlert
      v-if="!isTenantHost"
      icon="i-ph-info"
      color="neutral"
      variant="subtle"
      :title="t('onboarding.domain.noTenantTitle')"
      :description="t('onboarding.domain.noTenantDesc')"
    />

    <template v-else>
      <!--
        KEINE BERECHTIGUNG (Plan, Testphase oder Freigabe — control-040). Eine
        schon eingetragene Domain bleibt darunter sichtbar (Frist, abgeschaltet,
        Stand), und entfernen geht immer.
      -->
      <UPageCard
        v-if="denial"
        :title="t('onboarding.domain.title')"
        :description="t('onboarding.domain.description')"
      >
        <div class="space-y-4">
          <UAlert
            icon="i-ph-lock-simple"
            color="primary"
            variant="subtle"
            :title="t(DENIAL_TEXT[denial].title)"
            :description="t(DENIAL_TEXT[denial].description)"
            :actions="denialActions(denial)"
            :data-domain-denial="denial"
          />
          <UButton
            v-if="state?.domain"
            variant="ghost"
            color="error"
            :label="t('onboarding.domain.remove')"
            :loading="busy === 'remove'"
            :disabled="busy !== ''"
            @click="remove"
          />
        </div>
      </UPageCard>

      <UPageCard
        v-else
        :title="t('onboarding.domain.title')"
        :description="t('onboarding.domain.description')"
      >
        <div class="space-y-4">
          <UFormField
            :label="t('onboarding.domain.field')"
            :help="t('onboarding.domain.fieldHelp')"
          >
            <UInput
              v-model="input"
              :placeholder="t('onboarding.domain.placeholder')"
              :disabled="loading || busy !== ''"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              class="w-full"
            />
          </UFormField>

          <div class="flex flex-wrap items-center gap-2">
            <UButton
              :label="state?.domain ? t('onboarding.domain.replace') : t('onboarding.domain.save')"
              :loading="busy === 'save'"
              :disabled="loading || busy !== '' || !input.trim() || input.trim() === state?.domain"
              @click="save"
            />
            <UButton
              v-if="state?.domain"
              variant="soft"
              :label="t('onboarding.domain.check')"
              :loading="busy === 'verify'"
              :disabled="busy !== ''"
              @click="verify()"
            />
            <UButton
              v-if="state?.domain"
              variant="ghost"
              color="error"
              :label="t('onboarding.domain.remove')"
              :loading="busy === 'remove'"
              :disabled="busy !== ''"
              @click="remove"
            />
          </div>

          <p class="text-sm text-dimmed">
            {{ t('onboarding.domain.fallbackNote', { host: state?.fallbackHost ?? '' }) }}
          </p>
        </div>
      </UPageCard>

      <!--
        ABGESCHALTET (control-040, BE-014): die Domain gehört der Community
        noch, Besucher landen auf der Pukalani-Adresse. Ein Klick schaltet sie
        wieder ein (derselbe Prüf-Lauf wie immer) — oder der Satz sagt, warum
        das gerade nicht geht.
      -->
      <UAlert
        v-if="state?.domain && state.status === 'paused'"
        icon="i-ph-power"
        color="warning"
        variant="subtle"
        :title="t('onboarding.domain.pausedTitle')"
        :description="denial
          ? `${t('onboarding.domain.pausedDesc', { domain: state.domain, host: state.fallbackHost })} ${t(`onboarding.domain.pausedDenied.${denial}`)}`
          : t('onboarding.domain.pausedDesc', { domain: state.domain, host: state.fallbackHost })"
        :actions="denial
          ? denialActions(denial)
          : [{ label: t('onboarding.domain.reenable'), color: 'primary', loading: busy === 'verify', disabled: busy !== '', onClick: () => verify() }]"
        data-domain-paused
      />

      <!-- FRIST nach dem Ende von Testphase oder Abo (BE-014): die Domain ist
           noch aktiv, aber nicht mehr lange. -->
      <UAlert
        v-if="state?.domain && state.status === 'active' && state.graceEndsAt"
        icon="i-ph-hourglass-medium"
        color="warning"
        variant="subtle"
        :title="t('onboarding.domain.graceTitle')"
        :description="t('onboarding.domain.graceDesc', { date: graceDate, host: state.fallbackHost })"
        :actions="[{ label: t('onboarding.domain.planCta'), to: localePath('/dashboard/community/plan'), color: 'primary' }]"
        data-domain-grace
      />

      <UPageCard
        v-if="state?.domain"
        :title="t('onboarding.domain.statusTitle')"
        :description="t(`onboarding.domain.status.${state.status}`)"
      >
        <div class="space-y-4">
          <ul v-if="state.status !== 'paused'" class="space-y-2">
            <li
              v-for="step in steps"
              :key="step.key"
              class="flex items-center gap-2 text-sm"
            >
              <UIcon
                :name="step.done ? 'i-ph-check-circle-fill' : 'i-ph-circle-dashed'"
                :class="step.done ? 'text-success' : 'text-dimmed'"
              />
              <span :class="step.done ? '' : 'text-dimmed'">{{ step.label }}</span>
            </li>
          </ul>

          <!--
            CAA VOR dem allgemeinen Fehlertext (U16): steht sie unten, liest der
            Owner zuerst „Zertifikat noch nicht aktiv" und wartet — dabei ist
            genau das die ERKLÄRUNG dafür, und sie ist in zehn Sekunden behoben.
          -->
          <UAlert
            v-if="state.caaBlocked"
            icon="i-ph-seal-warning"
            color="error"
            variant="subtle"
            :title="t('onboarding.domain.caaTitle')"
            :description="t('onboarding.domain.caaDesc')"
          />

          <UAlert
            v-if="state.error"
            icon="i-ph-warning"
            color="warning"
            variant="subtle"
            :title="t('onboarding.domain.pendingTitle')"
            :description="state.error"
          />

          <!-- Der Takt ist unsichtbar; dass er läuft, gehört trotzdem gesagt —
               sonst drückt der Owner weiter im Minutentakt selbst. -->
          <p v-if="autoCheckActive" class="text-sm text-dimmed">
            {{ t('onboarding.domain.autoCheckNote') }}
          </p>

          <!-- Ein Eintrag ohne Nachweis wird nur begrenzt gehalten (control-040). -->
          <p v-if="claimDate" class="text-sm text-dimmed" data-domain-claim-expires>
            {{ t('onboarding.domain.claimExpires', { date: claimDate }) }}
          </p>

          <UAlert
            v-if="state.status === 'active'"
            icon="i-ph-check-circle"
            color="success"
            variant="subtle"
            :title="t('onboarding.domain.activeTitle')"
            :description="t('onboarding.domain.activeDesc', { domain: state.domain })"
          />
        </div>
      </UPageCard>

      <UPageCard
        v-if="state?.domain && allowed"
        :title="t('onboarding.domain.dnsTitle')"
        :description="t('onboarding.domain.dnsDescription')"
      >
        <div class="space-y-4 text-sm">
          <div>
            <p class="font-medium">
              {{ t('onboarding.domain.dns.txt') }}
            </p>
            <p class="text-dimmed">
              {{ t('onboarding.domain.dns.txtHelp') }}
            </p>
            <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">TXT  {{ state.instructions.txtName }}  {{ state.instructions.txtValue }}</pre>
          </div>

          <div v-if="state.instructions.apexForm">
            <p class="font-medium">
              {{ t('onboarding.domain.dns.a') }}
            </p>
            <p class="text-dimmed">
              {{ t('onboarding.domain.dns.aHelp') }}
            </p>
            <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">A  {{ state.instructions.apexForm }}  {{ state.instructions.serverIps.join(', ') }}</pre>
          </div>

          <div v-if="state.instructions.wwwForm">
            <p class="font-medium">
              {{ t('onboarding.domain.dns.cname') }}
            </p>
            <p class="text-dimmed">
              {{ t('onboarding.domain.dns.cnameHelp') }}
            </p>
            <pre class="mt-1 overflow-x-auto rounded bg-elevated p-2 font-mono text-xs">CNAME  {{ state.instructions.wwwForm }}  {{ state.instructions.cnameTarget }}</pre>
          </div>

          <p class="text-dimmed">
            {{ t('onboarding.domain.dns.note') }}
          </p>

          <!-- Der praktischste Satz im ganzen Vergleichsfeld (U16, Wettbewerb
               E6.3) und der einzige, der WÄHREND der Wartezeit nichts mehr
               nützt — deshalb steht er hier, direkt an den Einträgen. -->
          <p class="text-dimmed">
            {{ t('onboarding.domain.dns.ttl') }}
          </p>
        </div>
      </UPageCard>

      <UPageCard
        v-if="state?.domain && allowed"
        :title="t('onboarding.domain.registrars.title')"
        :description="t('onboarding.domain.registrars.description')"
      >
        <UAccordion :items="registrarItems" type="multiple">
          <template #body="{ item }">
            <div class="space-y-1 text-sm">
              <p>{{ item.path }}</p>
              <p class="text-dimmed">
                {{ item.note }}
              </p>
            </div>
          </template>
        </UAccordion>
      </UPageCard>
    </template>
  </div>
</template>
