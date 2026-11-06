<script setup lang="ts">
/** Fortschritt menschlich (§3d): "2 von 5 Entscheidungen · ~8 Min", die fünf
 *  Schichten sichtbar, künftige sichtbar-GESPERRT (= sichtbare Schranke).
 *  Runde 43 (David): keine Schmuck-Icons vorn — der STATUS führt links,
 *  hinten sitzt ein Info-Icon, das einen Erklär-Layer öffnet (was der
 *  Schritt bedeutet, welche Entscheidungen er hat, Fortschrittsbalken). */
export interface BwRailStepInfo {
  /**
   * Der Erklär-Absatz. OPTIONAL seit dem Umbau „Gespräch als Bühne"
   * (2026-09-02): der Klickdummy liefert ihn aus `demoRail`, die echte
   * Werkstatt baut ihre Info-Pakete dagegen aus der Slot-Registry und hat
   * dafür (noch) keinen geschriebenen Absatz. Weglassen ist wahr, erfinden
   * wäre es nicht — s. `BwStepInfoModal`.
   */
  description?: string
  minutes?: string
  /**
   * `affects` ist der Satz „Wofür brauchen wir das?" (§3a): wohin dieses Feld
   * später fliesst. Er kommt aus einer RECHNUNG über der Registry
   * (`sessionsAffectedBy`), nie aus einer gepflegten Liste — eine gepflegte
   * Liste ist irgendwann falsch. Optional, weil der Klickdummy ihn nicht hat.
   */
  bausteine: { label: string, note: string, done?: boolean, affects?: string }[]
}
/**
 * EIN UNTERPUNKT: die SESSION eines Kapitels (BW2 Paket 3c-i, Plan §11).
 *
 * Die Beschriftungen (Label, Umfang, Titel) reicht die SEITE übersetzt herein
 * — dieselbe Regel wie bei den Kapiteln. Die Komponente kennt nur Glyphe,
 * Sperre und Klick.
 */
export interface BwRailSession {
  /** Slot-Id der Session (`a.origin`) — sie reist als `?s=` in die Adresse. */
  id: string
  label: string
  /** „~3 Min" aus der Registry (`effort.minutes`). */
  effort?: string
  /**
   * `deferred` ist KEIN Zustand der Zustandsmaschine, sondern ein Merkzeichen
   * daneben (`answers.allowDefer`, §3a). Er steht hier trotzdem in derselben
   * Liste, weil die LEISTE genau eine Glyphe je Zeile zeigt und „vertagt" die
   * Auskunft ist, die der Mensch dann sucht.
   */
  state: 'locked' | 'open' | 'active' | 'done' | 'stale' | 'deferred'
  /** Der gesperrte Platzhalter „Finale Abnahme" (Funken-Glyphe, Paket 3c-ii). */
  kind?: 'acceptance'
  /**
   * DER GRUPPEN-TRENNER ÜBER DIESER ZEILE („Daraus abgeleitet", 2026-09-09).
   *
   * Er steht AM Eintrag und nicht als eigener Listen-Typ: eine Liste aus zwei
   * Sorten zwänge jeden Leser (Leiste, Abnahme, Tests) zu einer Fallunter-
   * scheidung für eine Überschrift. Gesetzt wird er von genau einer Regel
   * (`brandDerivedDividerSlot`) an genau einer Zeile je Kapitel — und nur,
   * wenn das Kapitel sauber in Fragen und Ableitungen zerfällt.
   */
  groupLabel?: string
  /** Gesperrt heisst NICHT anklickbar — kein 409 für den Menschen (3a-Befund 3). */
  disabled?: boolean
  /**
   * HERVORGEHOBEN, OHNE ANKLICKBAR ZU SEIN: die Finale Abnahme, sobald das
   * Kapitel vollständig ist (§11). Ein eigener Schalter statt `state:
   * 'active'`, weil „aktiv" die Session meint, in der der Mensch GERADE
   * steht — zwei Zeilen mit demselben Zeichen wären eine Frage zu viel.
   */
  highlight?: boolean
  /** Erklärt die Sperre beim Überfahren (`title`), z. B. „kommt als Nächstes". */
  title?: string
  /**
   * DER GRUND, SICHTBAR (Testlauf-Befund M, 2026-09-09) — eine kleine Zeile
   * UNTER dem Eintrag statt eines Hover-`title`.
   *
   * Ein Tooltip erreicht weder Touch noch Tastatur, und die Finale Abnahme ist
   * der eine Eintrag, der lange gesperrt dasteht: „Frei, sobald alle Felder
   * dieses Kapitels bestätigt sind" ist die halbe Anleitung. Die Sidebar hängt
   * die Zeile zusätzlich per `aria-describedby` an den Knopf, damit ein
   * Screenreader sie mit der Sperre zusammen vorliest.
   */
  note?: string
  /**
   * An dieser Session hängt ein OFFENER Befund (§8, Paket 5) — ein
   * bernsteinfarbenes Merkzeichen HINTER der Beschriftung.
   *
   * Ein eigener Schalter statt eines Zustands, aus demselben Grund wie
   * `highlight`: die Zeile zeigt genau EINE Glyphe, und die sagt, wie es um die
   * Arbeit steht („bestätigt", „veraltet", „vertagt"). Ein Befund ist eine
   * ZWEITE Auskunft daneben — beratend, nie sperrend.
   */
  finding?: boolean
}
export interface BwRailStep {
  id: string
  label: string
  icon: string
  /**
   * `locked` kam mit dem Audit dazu (A9): die Werkstatt bildete den
   * gesperrten Zustand der Journey auf `open` ab, und das Schloss des Plans
   * erschien in der Leiste nie — obwohl der Log es an derselben Stelle zeigt.
   * `open` heisst „betretbar, aber noch nichts drin", `locked` heisst „der
   * Vorgänger ist noch offen".
   */
  state: 'done' | 'active' | 'open' | 'locked'
  slots?: string
  minutes?: string
  info?: BwRailStepInfo
  /* Runde 78 (David): 'result' = Ergebnis-Ansicht der Schicht — letzter
   * Punkt der Gruppe, verlinkt statt Info-Icon, gesperrt bis alles fertig.
   *
   * 'document' = „Euer Branding" (BW2 Paket 7, §10): der letzte Eintrag UNTER
   * den Kapiteln, mit eigener Adresse (`to`) und IMMER klickbar — Lesen ist
   * immer erlaubt, und ein Dokument, das erst am Ende aufgeht, sähe man nie
   * wachsen. Es ist bewusst KEIN 'result': das ist die gesperrte Ergebnis-Kachel
   * der Übersicht (R35), eine andere Sache mit einer anderen Regel.
   *
   * 'extra' = ein Eintrag, den ein ANDERER Layer angemeldet hat (MV1 M4,
   * `pukalani.brand.workspaceNavExtras`) — z. B. „Markt". Er trägt seine
   * eigene Glyphe in `icon` (die anderen Arten lassen das Feld leer und
   * bekommen ihre Glyphe aus dem Zustand) und darf als EINZIGER `locked`
   * sein, ohne dass ein Kapitel davor läge: seine Sperre ist eine
   * PRODUKT-Freischaltung, keine Wegstrecke. */
  kind?: 'result' | 'document' | 'extra'
  to?: string
  /**
   * DIE SESSIONS DIESES KAPITELS (§11) — nur die Sidebar rendert sie, und nur
   * für das AKTIVE Kapitel. `BwProgressRail` (der Klickdummy-Vorfahr) ignoriert
   * das Feld bewusst: dort gibt es keine Unterpunkte, und eine zweite
   * Darstellung derselben Liste wäre eine zweite Stelle zum Altern.
   */
  sessions?: BwRailSession[]
  /** Die Zähl-Zeile eines Kapitels („7 von 11 bestätigt · 2 neu besprechen"). */
  counter?: string
  /**
   * Die RESTzeit des AUFGEKLAPPTEN Kapitels („~9 Min") — sie hängt hinten an
   * `counter` (Testlauf-Befund 7, 2026-09-09). Vorher stand hier der
   * Registry-Umfang, und er ERSETZTE den Zähler: die eine Zeile der Leiste, die
   * sich beim Arbeiten nie bewegte.
   */
  effort?: string
}
export interface BwRailLayer {
  id: string
  label: string
  locked?: boolean
  lockedNote?: string
  /* Runde 90 (David): Subline auch für entsperrte Gruppen. */
  note?: string
  /* Runde 82 (David): auch gesperrte Schichten erklären sich — der
   * Info-Layer zeigt, welche Schritte dort warten. */
  info?: BwRailStepInfo
  steps?: BwRailStep[]
}
defineProps<{ layers: BwRailLayer[] }>()

/* Die INHALTE der Leiste (Schicht- und Schritt-Beschriftungen, Info-Texte)
 * reicht die Seite bereits übersetzt herein — hier stehen nur die
 * Rahmen-Texte der Komponente selbst (aria-Beschriftungen, „Übersicht",
 * „Entscheidungen", die Fortschrittszeile). */
const { t } = useI18n()

/** Gesperrt ist ein Punkt durch seine SCHICHT oder durch sich selbst (A9). */
function isLocked(layer: BwRailLayer, step: BwRailStep): boolean {
  return layer.locked === true || step.state === 'locked'
}

const infoStep = ref<{ step: BwRailStep, layerLabel: string } | null>(null)
/* Der Erklär-Layer selbst wohnt seit 2026-09-02 in `BwStepInfoModal` — er
 * stand vorher wörtlich auch in der Klickdummy-Sidebar, und mit der neuen
 * `BwWorkspaceSidebar` wäre daraus eine dritte Kopie geworden. */
const infoOpen = computed({
  get: () => infoStep.value !== null,
  set: (v: boolean) => { if (!v) infoStep.value = null },
})
</script>

<template>
  <nav :aria-label="t('brand.workspace.rail.progressNav')">
    <div class="bw-rail-full space-y-10">
      <div v-for="layer in layers" :key="layer.id">
        <!-- Runde 85 (David): auch gesperrte Schichten zeigen ihre Pills
             komplett — mit Schloss im Status-Kreis statt versteckter Liste. -->
          <div class="flex items-start justify-between gap-2 pr-2">
            <div :style="layer.locked ? 'color: var(--bw-muted)' : ''">
              <div class="bw-label uppercase tracking-wider" :style="layer.locked ? '' : 'color: var(--bw-ink-soft)'">{{ layer.label }}</div>
              <p v-if="layer.locked ? layer.lockedNote : layer.note" class="mt-0.5 text-xs" style="color: var(--bw-muted)">{{ layer.locked ? layer.lockedNote : layer.note }}</p>
            </div>
            <!-- Echter Knopf statt `role="button" tabindex=0` (Audit B7/A14):
                 Leertaste und Enter funktionieren nativ, die Rolle ist keine
                 Behauptung mehr. -->
            <button
              v-if="layer.info"
              type="button"
              class="bw-info-btn grid size-7 flex-none place-items-center rounded-full"
              :aria-label="t('brand.workspace.rail.whatsIn', { label: layer.label })"
              @click="infoStep = { step: { id: layer.id, label: layer.label, icon: '', state: 'open', info: layer.info }, layerLabel: layer.lockedNote ?? '' }"
            >
              <UIcon name="i-ph-info" class="size-4.5" />
            </button>
          </div>
          <ul v-if="layer.steps" class="mt-2.5 space-y-1">
          <li v-for="step in layer.steps" :key="step.id" class="relative">
            <button
              v-if="step.kind === 'result'"
              class="flex w-full items-center gap-3 rounded-full py-2.5 pl-2 pr-2 text-left text-sm"
              :disabled="step.state !== 'done'"
              :style="step.state === 'done' ? 'background: var(--bw-surface); color: var(--bw-ink)' : 'background: var(--bw-surface); color: var(--bw-muted)'"
              @click="step.to && navigateTo(step.to)"
            >
              <span class="grid size-7 flex-none place-items-center rounded-full" :style="step.state === 'done' ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-surface-hi)'">
                <UIcon name="i-ph-sparkle" class="size-4" :style="step.state === 'done' ? 'color: var(--bw-accent)' : 'color: var(--bw-muted)'" />
              </span>
              <span class="min-w-0 flex-1">{{ step.label }}</span>
              <span class="grid size-7 flex-none place-items-center rounded-full">
                <UIcon :name="step.state === 'done' ? 'i-ph-arrow-right' : 'i-ph-lock-simple'" class="size-4" :style="step.state === 'done' ? 'color: var(--bw-ink-soft)' : 'color: var(--bw-muted)'" />
              </span>
            </button>
            <button
              v-else
              class="flex w-full items-center gap-3 rounded-full py-2.5 pl-2 pr-2 text-left text-sm"
              :disabled="isLocked(layer, step) || step.state === 'open'"
              :style="!isLocked(layer, step) && step.state === 'active' ? 'background: var(--bw-surface-hi); color: var(--bw-ink); font-weight: 600; box-shadow: var(--bw-shadow-card)' : 'background: var(--bw-surface); color: ' + (isLocked(layer, step) || step.state === 'open' ? 'var(--bw-muted)' : 'var(--bw-ink-soft)')"
            >
              <span class="grid size-7 flex-none place-items-center rounded-full" :style="!isLocked(layer, step) && step.state === 'done' ? 'background: var(--bw-accent-soft)' : 'background: var(--bw-surface-hi)'">
                <UIcon :name="isLocked(layer, step) ? 'i-ph-lock-simple' : step.state === 'done' ? 'i-ph-check' : step.state === 'active' ? 'i-ph-circle-half-fill' : 'i-ph-circle'" class="size-4" :style="!isLocked(layer, step) && step.state === 'done' ? 'color: var(--bw-accent)' : !isLocked(layer, step) && step.state === 'active' ? 'color: var(--bw-ink)' : 'color: var(--bw-muted)'" />
              </span>
              <span class="min-w-0 flex-1">{{ step.label }}</span>
              <!-- Abstandhalter: der echte Knopf liegt als Geschwister darüber
                   (Audit B6) — die Zeile behält ihre Maße. -->
              <span v-if="step.info" class="size-7 flex-none" aria-hidden="true" />
            </button>
            <!-- AUSSERHALB der Zeile: sie ist bei `open`/`locked` deaktiviert,
                 und ein Knopf IM deaktivierten Knopf bekommt keinen Klick —
                 die Erklärung war genau dort tot, wo man sie braucht. -->
            <button
              v-if="step.info && step.kind !== 'result'"
              type="button"
              class="bw-info-btn absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full"
              :aria-label="t('brand.workspace.rail.whatMeans', { label: step.label })"
              @click="infoStep = { step, layerLabel: layer.label }"
            >
              <UIcon name="i-ph-info" class="size-4.5" />
            </button>
          </li>
          </ul>

      </div>
    </div>
    <div class="bw-rail-mini flex flex-col items-center gap-3 pt-1">
      <template v-for="layer in layers" :key="layer.id">
        <UIcon v-if="layer.locked" name="i-ph-lock-simple" style="color: var(--bw-muted)" />
        <button
          v-for="step in (layer.steps ?? []).filter(st => st.kind !== 'result')" v-else :key="step.id"
          class="grid place-items-center" :aria-label="t('brand.workspace.rail.whatMeans', { label: step.label })"
          :disabled="!step.info" @click="step.info && (infoStep = { step, layerLabel: layer.label })"
        >
          <UIcon
            :name="step.state === 'locked' ? 'i-ph-lock-simple' : step.state === 'done' ? 'i-ph-check-circle-fill' : step.state === 'active' ? 'i-ph-circle-half-fill' : 'i-ph-circle'"
            :style="`color: var(--bw-${step.state === 'active' ? 'accent' : 'muted'})`"
          />
        </button>
      </template>
    </div>

    <BwStepInfoModal
      v-model:open="infoOpen"
      :step="infoStep?.step ?? null"
      :layer-label="infoStep?.layerLabel ?? ''"
    />
  </nav>
</template>
