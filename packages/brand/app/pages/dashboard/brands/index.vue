<script setup lang="ts">
import type { BwNewBrandSubmit } from '../../../components/BwNewBrandModal.vue'
import {
  BRAND_FOUNDATION_STEP_KEYS,
  BRAND_STEP_KEYS,
  type BrandFoundationStepKey,
  type BrandStepKey,
} from '../../../../shared/slotRegistry'
import { brandGradientFor } from '../../../../shared/brandPalette'
import type { BrandProfileScoresResponse, BrandProfileSummary } from '../../../../shared/types/brand'
import { useBrandWorkspaceStore } from '../../../stores/brandWorkspace'

/**
 * „BRANDINGS" — die echte Übersicht (Plan §3d Hauptansicht 1, Route §3e).
 *
 * Die OPTIK ist die des abgenommenen Klickdummys: `BwBrandCard` in einem
 * ruhigen Kartenraster, kein Datengrid, und ein Leerzustand als Einladung.
 * Die DATEN kommen aus `GET /api/brand/profiles`.
 *
 * ── DAS 404 DES GATES IST EIN ZUSTAND, KEINE FEHLERSEITE ──────────────────
 * `requireBrandAccess` antwortet ohne Beta-Zugang mit 404 (Datentür-Muster:
 * ein 403 verriete, dass es hinter dem Pfad etwas gibt). Diese Seite zeigt
 * dann „noch kein Zugang" — sie wirft NICHT, denn die Seite selbst ist ja
 * erreichbar. Genau dieser Zweig ist auch das, was der `.playground` ohne
 * eigene Appwrite zeigt.
 *
 * ── WARUM `useRequestFetch` ───────────────────────────────────────────────
 * Beim SSR müssen die Session-Cookies mitgehen; ein nacktes `$fetch` schickte
 * sie nicht mit und die Seite hydratisierte als „kein Zugang", obwohl das
 * Konto eines hat.
 *
 * KEIN `layout: 'dashboard'` mehr (2026-09-03): Kunden-Fläche mit Wizard-Nav
 * (default-Layout); das dashboard-Layout gehört der Betreiber-Shell (admin).
 */

const { t, locale } = useI18n()
const localePath = useLocalePath()
const store = useBrandWorkspaceStore()
const request = useRequestFetch()

await useAsyncData('brand-profiles', async () => {
  await store.loadProfiles(request)
  return true
})

const newBrandOpen = ref(false)

/**
 * Grobe Restzeit. §3d verlangt „menschlich, nicht technisch" — 45 Minuten ist
 * die Zahl aus der Interaktionsbilanz (Katalog §16), der Prozentwert kommt vom
 * Server. Eine Minutenzahl auf zwei Stellen wäre eine Genauigkeit, die es
 * nicht gibt.
 */
const TOTAL_MINUTES = 45

function remaining(profile: BrandProfileSummary): string {
  const minutes = Math.max(1, Math.round(((100 - profile.progressPct) / 100) * TOTAL_MINUTES))
  return t('brand.brands.card.remaining', { minutes })
}

function stepLabel(key: string): string {
  return (BRAND_STEP_KEYS as readonly string[]).includes(key)
    ? t(`brand.steps.${key}`)
    : t('brand.steps.context')
}

/**
 * „Schritt 3 von 9" — die Zahl der FOUNDATION (Brand Design D0).
 *
 * `BRAND_STEP_KEYS` trägt seit D0 auch die sechs Kapitel von Schicht 2; die
 * Zeile hier meint aber den Weg, den diese Karte anzeigt, und der endet bei
 * `result` (`resolveProfileProgress` rechnet über dieselbe Menge).
 *
 * SO BLEIBT ES (Brand Design D1, entschieden statt vertagt): die Marken-Karte
 * ist die Karte der FOUNDATION. Schicht 2 hat ihren eigenen Fortschritt dort,
 * wo sie stattfindet — im Rail der Werkstatt („N von 6 Kapiteln"). Zwei Zahlen
 * für zwei Produkte sind ehrlicher als eine gemischte, und ein fertiges
 * Branding fiele sonst im Deploy-Moment von 100 % auf rund 70 %.
 */
function stepPosition(profile: BrandProfileSummary): string {
  const index = BRAND_FOUNDATION_STEP_KEYS.indexOf(profile.currentStepKey as BrandFoundationStepKey)
  return t('brand.brands.card.stepOf', {
    index: index < 0 ? 1 : index + 1,
    total: BRAND_FOUNDATION_STEP_KEYS.length,
  })
}

function editedAt(profile: BrandProfileSummary): string {
  const when = new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' })
    .format(new Date(profile.lastActivityAt))
  return t('brand.brands.card.edited', { when })
}

/**
 * Der leere `currentStepKey` ist kein Zustand, den die Liste versprechen
 * müsste — aber ein Profil ohne ihn hätte hier auf `/brand/<id>/` gezeigt,
 * also auf eine Route, die es nicht gibt (Audit C6). Der Einstieg ist
 * derselbe wie beim Anlegen: der erste Baustein.
 */
function workspacePath(profile: BrandProfileSummary): string {
  return localePath(`/brand/${profile.id}/${profile.currentStepKey || 'context'}`)
}

/**
 * „EUER BRANDING" WOHNT AN DER KACHEL (Runde 35, David, 2026-09-02) — nicht
 * mehr in der Werkstatt. Gesperrt mit Schloss, bis die Brand Foundation
 * abgeschlossen ist; BEWUSST kein 100-%-Gate, denn Monitoring endet nie.
 *
 * ── WORAN „ABGESCHLOSSEN" HÄNGT, OHNE EIN NEUES SERVER-FELD ──────────────
 * Die Liste liefert kein Journey-Objekt, wohl aber `currentStepKey`, und der
 * ist genau definiert (`resolveProfileProgress`): der erste Baustein auf dem
 * Weg, der `active` oder `open` ist — steht nichts mehr offen, der letzte.
 * `result` ist der letzte Baustein der Registry. `currentStepKey === 'result'`
 * heisst deshalb exakt „alles davor ist `done`", und das ist die Foundation.
 * Ein eigenes `foundationDone`-Feld wäre eine zweite Wahrheit über denselben
 * Sachverhalt.
 *
 * `result` ist zugleich das ZIEL: eine eigene Ergebnis-SEITE gibt es im Layer
 * noch nicht (der Klickdummy zeigt `/brand/demo/ergebnis`), der Baustein
 * `result` ist heute die Ergebnis-Ansicht.
 *
 * DASS `result` DER LETZTE EINTRAG IST, trägt diese ganze Rechnung — und
 * stünde er eines Tages nicht mehr dort, ginge das Schloss lautlos auf
 * (Audit C4). Ein Test in `tests/slotRegistry.test.ts` nagelt die Invariante
 * fest, statt sie hier per `.at(-1)` zu erraten: der NAME soll lesbar
 * bleiben, die Annahme prüfbar.
 */
const RESULT_STEP: BrandStepKey = 'result'

function resultPath(profile: BrandProfileSummary): string {
  return localePath(`/brand/${profile.id}/${RESULT_STEP}`)
}

function resultReady(profile: BrandProfileSummary): boolean {
  return profile.currentStepKey === RESULT_STEP
}

/**
 * DER BRAND-SCORE JE KARTE (BRAND-CHECK-SEITE §5) — GEBÜNDELT geholt.
 *
 * Eine Abfrage je Karte wäre das N+1, das `activeShareProfileIds` für die
 * geteilten Brandings schon einmal verhindert hat; `GET /api/brand/profiles/
 * scores` beantwortet die Frage für ALLE eigenen Brands in einem Zug.
 *
 * FAIL-SOFT: keine Antwort ⇒ keine Zahl. Der Score ist eine ANGABE auf einer
 * Karte, kein Recht und keine Bedingung — die Übersicht darf daran nicht
 * scheitern (dieselbe Haltung wie bei „geteilt").
 *
 * GEZEIGT WIRD DER WEBSITE-SCORE, sonst der des Fundaments. Nie beide in
 * einer Zahl: sie messen Verschiedenes (§5b), und eine Karte hat für die
 * Erklärung keinen Platz — die hat die Score-Seite.
 */
const { data: scores } = await useAsyncData<BrandProfileScoresResponse | null>(
  'brand-profile-scores',
  async () => {
    try {
      return await request<BrandProfileScoresResponse>('/api/brand/profiles/scores')
    }
    catch {
      return null
    }
  },
)

function scoreOf(profile: BrandProfileSummary): number | null {
  const entry = scores.value?.items.find(item => item.profileId === profile.id)
  return entry?.website?.score ?? entry?.document?.score ?? null
}

function scoreLine(profile: BrandProfileSummary): string {
  const score = scoreOf(profile)
  return score === null
    ? t('brand.myScores.card.empty')
    : t('brand.myScores.card.score', { score })
}

function scorePath(profile: BrandProfileSummary): string {
  return localePath(`/dashboard/brands/${profile.id}/score`)
}

/**
 * DER VERÖFFENTLICHUNGS-ZUSTAND JE KARTE (Discover §4.3: „Zustand auch auf der
 * Brands-Übersichtskarte").
 *
 * Er kommt aus DERSELBEN gebündelten Antwort wie der Score — eine eigene Route
 * je Karte wäre wieder das N+1, das diese Seite schon zweimal vermieden hat
 * (`activeShareProfileIds`, `scores`). `null` heisst „nie eingereicht", und
 * dann steht hier gar nichts: eine Zeile „nicht veröffentlicht" an jeder Kachel
 * wäre Lärm über eine Nicht-Handlung.
 *
 * Der Link führt in die LESEANSICHT und nicht auf die öffentliche Seite: dort
 * steht die Begründung einer Ablehnung, dort sind die Knöpfe, und bei „wartet
 * auf Freigabe" gibt es öffentlich noch nichts zu sehen.
 */
function publicationOf(profile: BrandProfileSummary) {
  return scores.value?.items.find(item => item.profileId === profile.id)?.publication ?? null
}

/** Ein kaputtes Datum wird zur leeren Zeile, nie zu „Invalid Date". */
function publicationDate(iso: string): string {
  const value = Date.parse(iso)
  return Number.isFinite(value)
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(value)
    : ''
}

function publicationLine(profile: BrandProfileSummary): string {
  const publication = publicationOf(profile)
  if (!publication) return ''
  switch (publication.status) {
    case 'published': return publication.publishedAt
      ? t('brand.publication.card.publicSince', { date: publicationDate(publication.publishedAt) })
      : t('brand.publication.card.public')
    case 'pending': return t('brand.publication.card.pending')
    case 'declined': return t('brand.publication.card.declined')
    case 'hidden': return t('brand.publication.card.hidden')
    // Zurückgezogen ist der Zustand NACH einer eigenen Entscheidung — die Karte
    // meldet ihn nicht, sie meldet, was gerade gilt.
    default: return ''
  }
}

function foundationPath(profile: BrandProfileSummary): string {
  return localePath(`/brand/${profile.id}/foundation`)
}

/**
 * Der Submit des Modals — seit dem Kailua-Lauf wieder eine ANLAGE (Befund 6,
 * Davids Entscheidung 2026-09-08).
 *
 * ── WAS VORHER PASSIERTE ─────────────────────────────────────────────────
 * P2.5 hatte den Submit zu einer ÜBERGABE gemacht: das Modal fragte Weiche,
 * Titel und Sprache und schickte sie als Query an `/dashboard/brands/new` —
 * wo dieselben drei Felder ein zweites Mal standen. Wer im Modal „Neue Marke"
 * gewählt und einen Arbeitstitel getippt hatte, bestätigte beides sofort
 * wieder. Der Grund dafür war echt (die Startkarte ist Pflicht), die Auflösung
 * die falsche: sie machte aus einem Formular zwei Halbe.
 *
 * ── DIE PFLEGE-SORGE VON DAMALS IST BEANTWORTET ──────────────────────────
 * „Die Startkarte im Modal zu wiederholen hiesse, dasselbe Formular an zwei
 * Stellen zu pflegen" — genau deshalb steht sie jetzt an EINER Stelle
 * (`BwNewBrandDetails`), und der Anlage-Weg ebenfalls (`useBrandCreate`).
 */
const {
  contentLocales: newBrandLocales,
  creating: newBrandCreating,
  failed: newBrandFailed,
  create: createBrand,
} = useBrandCreate()

async function createFromModal(payload: BwNewBrandSubmit): Promise<void> {
  if (await createBrand(payload)) newBrandOpen.value = false
}

useBrandTitle(() => t('brand.brands.title'))
</script>

<template>
  <div class="bw-root">
    <div class="@container mx-auto w-full max-w-(--ui-container)">
      <div class="mb-8">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold">{{ t('brand.brands.title') }}</h1>
            <p class="mt-1 text-sm" style="color: var(--bw-muted)">{{ t('brand.brands.subtitle') }}</p>
          </div>
          <UButton
            v-if="!store.denied"
            icon="i-ph-plus" :label="t('brand.brands.new')" variant="outline"
            @click="newBrandOpen = true"
          />
        </div>
      </div>

      <!-- Kein Beta-Zugang: Leerzustand statt Fehlerseite (s. Kopf). -->
      <div
        v-if="store.denied"
        class="bw-rounded-card flex flex-col items-center justify-center border border-dashed p-10 text-center"
        style="border-color: var(--bw-line-strong)"
      >
        <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
        <p class="mt-4 font-medium">{{ t('brand.workspace.noAccess.title') }}</p>
        <p class="mt-1 max-w-md text-sm" style="color: var(--bw-muted)">{{ t('brand.workspace.noAccess.description') }}</p>
        <!--
          Der Weg zur Einladungs-Seite — hier, weil genau HIER strandet, wer
          seine Adresse im zweiten Tab bestätigt und dann ins Dashboard geht
          (P1d-Abnahme, 2026-09-01): eingeloggt, verifiziert, Code im Cookie —
          und nur /invite löst ein. Ohne Cookie schadet der Knopf nicht, die
          Seite nimmt dort auch einen getippten Code.
        -->
        <UButton
          class="mt-4"
          icon="i-ph-envelope-open"
          :label="t('brand.workspace.noAccess.action')"
          variant="outline"
          :to="localePath('/invite')"
        />
      </div>

      <div
        v-else-if="!store.profiles.length"
        class="bw-rounded-card flex flex-col items-center justify-center border border-dashed p-10 text-center"
        style="border-color: var(--bw-line-strong)"
      >
        <BwIllustration variant="journey" class="mx-auto h-16 w-auto" style="color: var(--bw-ink-soft)" />
        <p class="mt-4 font-medium">{{ t('brand.brands.empty.title') }}</p>
        <p class="mt-1 max-w-md text-sm" style="color: var(--bw-muted)">{{ t('brand.brands.empty.description') }}</p>
        <UButton
          class="mt-4" icon="i-ph-plus" :label="t('brand.brands.empty.action')" variant="outline"
          @click="newBrandOpen = true"
        />
      </div>

      <!-- Die KARTE ist kein Link mehr (Audit C3): in ihr sitzen ein
           Dropdown-Auslöser und zwei Knöpfe — `button` im `a` ist ungültig,
           und ein Klick ohne `.stop` navigierte nebenbei zur Werkstatt.
           Verlinkt sind jetzt die Kachel (sie trägt den Titel) und
           „Weiterarbeiten"; die Karte bekommt ihr Ziel als Prop. -->
      <div v-else class="grid gap-x-6 gap-y-16 @sm:grid-cols-2 @lg:grid-cols-3">
        <div v-for="profile in store.profiles" :key="profile.id">
          <BwBrandCard
            :to="workspacePath(profile)"
            :gradient="brandGradientFor(profile.id)"
            :title="profile.title || t('brand.brands.card.untitled')"
            :path="t(`brand.brands.card.path.${profile.pathKind}`)"
            :step="t('brand.brands.card.currentStep', { step: stepLabel(profile.currentStepKey) })"
            :progress="stepPosition(profile)"
            :remaining="remaining(profile)"
            :edited="editedAt(profile)"
            :pct="profile.progressPct"
            :result-to="resultPath(profile)"
            :result-ready="resultReady(profile)"
          />
          <!-- Der Brand-Score (BRAND-CHECK-SEITE §5) steht UNTER der Karte und
               nicht in ihr: `BwBrandCard` ist Davids abgenommener Klickdummy,
               und seine `score`-Prop meint den Ergebnis-Ring der Foundation,
               nicht den Aussen-Check. Eine Zeile, zwei Wege — die Zahl führt
               zur Score-Seite, und wo keine Website hinterlegt ist, steht der
               fehlende Schritt daneben. -->
          <div class="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1" data-brand-score-line>
            <NuxtLink :to="scorePath(profile)" class="bw-label hover:underline" style="color: var(--bw-ink-soft)">
              {{ scoreLine(profile) }}
            </NuxtLink>
            <NuxtLink
              v-if="!profile.startCard.websiteUrl" :to="scorePath(profile)"
              class="bw-label hover:underline" style="color: var(--bw-muted)"
            >
              {{ t('brand.myScores.card.addUrl') }}
            </NuxtLink>
            <NuxtLink
              v-if="publicationLine(profile)" :to="foundationPath(profile)"
              class="bw-label hover:underline" style="color: var(--bw-muted)"
              data-brand-publication-line
            >
              {{ publicationLine(profile) }}
            </NuxtLink>
          </div>
        </div>
      </div>

    </div>

    <BwNewBrandModal
      v-model:open="newBrandOpen" mode="live"
      :content-locales="newBrandLocales" :loading="newBrandCreating" :failed="newBrandFailed"
      @submit="createFromModal"
    />
  </div>
</template>
