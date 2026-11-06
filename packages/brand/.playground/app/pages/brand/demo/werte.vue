<script setup lang="ts">
import type { BwMessage } from '../../../../../app/components/BwGeorge.vue'
import { demoRail } from '../../../utils/demoRail'

/** Clickdummy Baustein C (Werte) — geskripteter Dialog aus der
 *  P0-Inhaltsspez (C-P3 → Kandidaten → Auswahl). Statisch, keine KI.
 *
 *  Die graue BEISPIEL-ANTWORT im Composer ist die echte aus dem Katalog
 *  (`brand.example.c.discovery3`) — die gestellte Frage IST c.discovery3,
 *  der Dummy zeigt hier also exakt das Verhalten der Werkstatt. */
const { t } = useI18n()
const messages = ref<BwMessage[]>([
  { id: 'm1', role: 'george', text: 'Zwei Dinge aus deinem Kontext klingen schon nach Werten: Du hast Verlässlichkeit betont — und dass ihr lieber absagt, als halbe Arbeit zu liefern.', help: 'Ich frage jetzt drei Dinge, dann schlage ich Wertewörter vor.' },
  { id: 'm2', role: 'george', text: 'Welches Verhalten würdest du nie dulden — auch nicht vom bestzahlenden Kunden?' },
])
const phase = ref<'ask' | 'candidates' | 'done' | 'confirmed'>('ask')
const syncState = ref<'saving' | 'offline' | 'conflict' | null>(null)
let syncTimer: ReturnType<typeof setTimeout> | undefined
function pulseSave() {
  syncState.value = 'saving'
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { syncState.value = null }, 1200)
}
/* Nach dem Abschluss zieht die Leiste nach: Werte -> fertig. */
const railLayers = computed(() => phase.value !== 'confirmed'
  ? demoRail
  : demoRail.map(layer => layer.steps
      ? { ...layer, steps: layer.steps.map(step => step.id === 'values' ? { ...step, state: 'done' as const } : step) }
      : layer))
const progressNote = computed(() => phase.value === 'confirmed' ? '14 von 21 Entscheidungen · ~18 Min' : '12 von 21 Entscheidungen · ~25 Min')
const progressPct = computed(() => phase.value === 'confirmed' ? 67 : 57)
function confirmChapter() {
  phase.value = 'confirmed'
  pulseSave()
  messages.value.push({ id: `g${Date.now()}`, role: 'george', text: 'Eure Werte stehen — und sie passen zusammen: Klartext und Verlässlichkeit stützen sich gegenseitig. Als Nächstes leite ich daraus euren Archetyp ab.', help: 'Kapitel Werte ist fertig. Archetyp & Stimme ist jetzt dran — ~6 Min.' })
}
const picked = ref<string[]>([])

const askOptions = [
  {
    id: 'a1',
    label: 'Druck, Qualität zu opfern',
    description: 'Termine schlagen nie das Handwerk.',
    recommended: true,
    why: 'Du hast zweimal betont, dass ihr lieber absagt, als halbe Arbeit zu liefern — das ist bereits gelebte Grenze, kein Wunschdenken. Und im Kaffeemarkt auf O\u02bbahu werben alle mit „Aloha“, fast niemand mit kompromissloser Qualität: genau hier hebt ihr euch ab.',
  },
  { id: 'a2', label: 'Respektlosigkeit im Ton', description: 'Egal ob Gast, Lieferant oder Team.' },
  { id: 'a3', label: 'Intransparenz bei Geld', description: 'Versteckte Preise, stille Aufschläge.' },
]

const candidateChips = [
  { id: 'handwerk', label: 'Handwerk' },
  { id: 'klartext', label: 'Klartext', recommended: true },
  { id: 'verlaesslichkeit', label: 'Verlässlichkeit' },
  { id: 'naehe', label: 'Nähe' },
  { id: 'eigensinn', label: 'Eigensinn' },
  { id: 'ruhe', label: 'Ruhe' },
]

function answer(text: string) {
  messages.value.push({ id: `u${Date.now()}`, role: 'user', text })
  pulseSave()
  if (phase.value === 'ask') {
    phase.value = 'candidates'
    messages.value.push(
      { id: 'm3', role: 'george', text: 'Das passt zu dem, was du vorhin über abgesagte Projekte gesagt hast — da steckt eine klare Grenze drin.' },
      { id: 'm4', role: 'george', text: 'Hier sind sechs Wertewörter aus deinen Antworten. Wähle 3 bis 5 — welche würdest du verteidigen, auch wenn es Geld kostet?', help: 'Jeder Vorschlag hat eine Herleitung — tippe ein Wort an, um sie zu sehen.' },
    )
  }
}
function pick(id: string) {
  picked.value = picked.value.includes(id) ? picked.value.filter(p => p !== id) : [...picked.value, id]
}
function confirmPick() {
  phase.value = 'done'
  pulseSave()
  messages.value.push(
    { id: `u${Date.now()}`, role: 'user', text: picked.value.map(p => candidateChips.find(c => c.id === p)?.label).join(', ') },
    { id: 'm5', role: 'george', text: 'Gut — ich habe für jeden Wert einen Definitions-Entwurf ins Dokument gelegt. Lies sie auf der Bühne gegen: Stimmt „Klartext" so, wie ich es formuliert habe?' },
  )
}
</script>

<template>
  <BwWorkspace :progress-pct="progressPct" :progress-note="progressNote" :sync-state="syncState" progress-to="/brand/demo/ergebnis" :score="74" content-locale="en">
    <template #brand>
      <BwBrandSwitcher :current="{ title: 'Kailua Coffee Co.', path: 'Neue Marke', flag: 'i-circle-flags-us' }" :others="[{ title: 'Schubert UX Studio', path: 'Marken-Relaunch', flag: 'i-circle-flags-de', to: '/brand/demo/archetyp' }]" />
    </template>

    <template #rail>
      <BwProgressRail :layers="railLayers" />
    </template>

    <template #default>
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">Brand Foundation</p>
      <h1 class="mt-1 text-4xl leading-tight">Kailua Coffee Co.</h1>

      <BwChapter title="Purpose" state="confirmed">
        <p style="color: var(--bw-ink-soft)">We exist so that busy people on Oʻahu get one honest, quiet moment a day — a cup that was grown, roasted and served by people they can name.</p>
        <BwSlotList
          :slots="[
            { id: 'purpose', label: 'Purpose-Satz', value: 'One honest, quiet moment a day.', state: 'done' },
            { id: 'why', label: 'Warum es euch gibt', value: 'Kaffee mit nachvollziehbarer Herkunft — Anbau, Röstung, Ausschank aus einer Hand.', state: 'done' },
            { id: 'anti', label: 'Anti-Purpose (was ihr nie sein wollt)', state: 'open' },
          ]"
        />
      </BwChapter>

      <BwChapter title="Werte" :state="phase === 'confirmed' ? 'confirmed' : phase === 'done' ? 'draft' : 'active'" @confirm="confirmChapter">
        <template v-if="phase === 'done' || phase === 'confirmed'">
          <ul class="space-y-2.5">
            <li><strong>Klartext</strong> → Wir sagen Preise, Herkunft und Grenzen, bevor jemand fragt.</li>
            <li><strong>Handwerk</strong> → Lieber eine Röstung perfekt als fünf Sorten mittelmäßig.</li>
            <li><strong>Nähe</strong> → Unsere Gäste kennen den Namen der Person, die ihre Bohnen geröstet hat.</li>
          </ul>
        </template>
        <template v-else>
          <p class="bw-pending">George stellt dir gerade die Werte-Fragen — dieses Kapitel füllt sich, sobald ihr die Kandidaten habt.</p>
          <BwSlotList
            :slots="[
              { id: 'cand', label: 'Wertekandidaten', value: 'Handwerk, Klartext, Verlässlichkeit, Nähe, Eigensinn, Ruhe', state: 'done' },
              { id: 'core', label: 'Kernwerte (3–5)', state: 'open' },
              { id: 'rules', label: 'Verhaltensregeln', state: 'open' },
              { id: 'anti', label: 'Anti-Werte', state: 'open' },
              { id: 'proof', label: 'Beweise', state: 'open' },
            ]"
          />
        </template>
      </BwChapter>

      <BwChapter title="Archetyp & Stimme" state="stale" stale-note="Deine Purpose-Änderung von gestern betrifft dieses Kapitel — George rechnet es nach der Bestätigung neu.">
        <p class="bw-pending">Wartet auf die neue Werte-Grundlage.</p>
      </BwChapter>
    </template>

    <template #george>
      <BwGeorge :messages="messages" :placeholder="phase === 'ask' ? t('brand.example.c.discovery3') : ''" @send="answer">
        <template #chips>
          <div v-if="phase === 'ask'" class="pl-9">
            <BwOptionCards
              :options="askOptions"
              own-placeholder="Oder beschreib es mit eigenen Worten …"
              @pick="(id) => answer(askOptions.find(o => o.id === id)!.label)"
              @own="answer"
              @dont-know="answer('Weiß ich nicht')"
            />
          </div>
          <div v-else-if="phase === 'candidates'" class="space-y-3 pl-9">
            <BwChips :options="candidateChips" :selected="picked" :show-dont-know="false" multi @pick="pick" />
            <UButton v-if="picked.length >= 3" size="sm" icon="i-ph-check" :label="`${picked.length} Werte übernehmen`" @click="confirmPick" />
            <p v-else class="bw-label" style="color: var(--bw-muted)">Wähle mindestens 3.</p>
          </div>
        </template>
      </BwGeorge>
    </template>
  </BwWorkspace>
</template>
