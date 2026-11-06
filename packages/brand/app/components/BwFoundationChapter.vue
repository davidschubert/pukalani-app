<script setup lang="ts">
import { brandChoiceDisplayLabel } from '../../shared/brandChoiceOptions'
import type { BrandFoundationChapter } from '../../shared/brandFoundation'

/**
 * EIN KAPITEL DER BRAND FOUNDATION (Konzept
 * docs/archiv/BRAND-FOUNDATION-LESEANSICHT.md §2.2/§2.5/§2.6, Paket G2).
 *
 * ── EIN RENDERER, ZWEI ANSICHTEN (§2.1) ──────────────────────────────────
 * Dieselbe Komponente rendert das Kapitel privat (`/brand/:id/foundation`) und
 * später öffentlich (`/brand/share/:token`, Paket G3). Der Unterschied ist EIN
 * Prop, kein zweiter Baum — sonst laufen die beiden Ansichten mit der Zeit
 * auseinander, und genau das soll die geteilte Regel ausschliessen.
 *
 * Was `variant: 'share'` anders macht (und NUR das):
 *  · das gesperrte Kapitel schrumpft auf EINEN Satz — kein Schloss-Zoo, keine
 *    Preisanker beim Fremdleser (§2.6);
 *  · der Vermerk „noch nicht abgenommen" und der Link zur Abnahme entfallen
 *    (im Snapshot steht ohnehin nur Bestätigtes).
 *
 * ── SIE ÜBERSETZT, DER RENDERER NICHT ────────────────────────────────────
 * `buildBrandFoundation` ist pur und schickt SCHLÜSSEL (`titleKey`,
 * `labelKey`, `columnKeys`) und stabile Ids (`element`, `optionIds`) — hier
 * werden sie zu Text. Der Grund steht im Kopf von `shared/brandFoundation.ts`:
 * die Inhaltssprache der Marke und die Sprache des Handbuchs sind verschieden.
 * Auswahl-Ids löst `brandChoiceDisplayLabel` auf, dieselbe Quelle wie im Log
 * und in `BwSessionBlock` — ein zweiter Katalog wäre ein zweiter Name für
 * denselben Archetyp.
 *
 * ── MARKDOWN NUR, WO ER STEHT ────────────────────────────────────────────
 * Nur ein Absatz mit `markdown` (heute: `e.manifesto`, der einzige
 * `richtext`-Slot) läuft durch `MarkdownContent` — den Subset-Parser aus
 * `core/shared/markdown.ts`: vnode-Ausgabe, kein `v-html`, rohes HTML bleibt
 * Text, Links nur mit sicheren Zielen (§2.8). Jeder andere Wert steht wörtlich
 * da; ALLES als Markdown zu lesen machte aus dem Sternchen einer Tagline eine
 * Kursivierung.
 *
 * Der Druck (§2.6) wohnt unten im `@media print`-Block: Seitenumbruch je
 * Kapitel, keine Knöpfe, Karten als Linien statt als Flächen.
 */
const props = withDefaults(defineProps<{
  chapter: BrandFoundationChapter
  /**
   * Anzeige-Nummer — die Zählung folgt der REIHENFOLGE, nicht der Registry-Id:
   * ein Kapitel ohne Weg (Markenarchitektur, Name) entfällt ohne Lücke (§2.2).
   */
  index: number
  variant?: 'private' | 'share'
  /**
   * Ziel des Vermerks „Zur Abnahme" — die Seite baut es (sie kennt Profil-Id
   * und Locale-Pfad). `null` heisst: kein Sprung anbieten.
   */
  acceptanceTo?: string | null
  /**
   * Ziel von „Richtung wählen" (Paket G4) — die Ergebnis-Session der
   * Werkstatt. `null` heisst: das Kapitel liegt noch nicht auf dem Weg, der
   * Knopf steht sichtbar da und ist AUS (mit Begründung darunter). Ein Knopf,
   * der ins Leere führte, wäre schlimmer als ein grauer.
   */
  directionTo?: string | null
  /**
   * Ziel von „Brand Design starten" (Konzept §2.10, Paket D1) — das erste
   * Kapitel von Schicht 2. `null` heisst: für diese Marke ist Brand Design
   * nicht offen, und dann steht hier weiter das ANGEBOT (Erstgespräch), denn
   * genau das ist der Weg zur Freischaltung.
   *
   * Die Seite entscheidet es über die pure Regel (`canEnter('dna')`) und damit
   * über BEIDE Bedingungen aus §2.1 — Freischaltung UND fertige Foundation.
   * Ein Knopf, der auf die Sperr-Fläche führte, wäre schlimmer als keiner.
   */
  designTo?: string | null
  /** Für den Satz „Freigeschaltet vom Studio am …". Leer = kein Datum nennen. */
  designUnlockedAt?: string | null
  /**
   * Ziel von „Als eigene Ansicht öffnen" am vollen Kapitel 10 (Paket D8) —
   * `/brand/:id/design`. `null` heisst: kein Sprung anbieten (Share-Ansicht
   * und Beispiel-Seite haben diese Route nicht).
   */
  designBoardTo?: string | null
  /** „Stand …" im Ergebnis-Board. Leer = kein Datum nennen. */
  designStand?: string
}>(), {
  variant: 'private',
  acceptanceTo: null,
  directionTo: null,
  designTo: null,
  designUnlockedAt: null,
  designBoardTo: null,
  designStand: '',
})

const { t, te, locale } = useI18n()

const isPrivate = computed(() => props.variant === 'private')
const num = computed(() => String(props.index).padStart(2, '0'))

/**
 * Der ERKLÄR-Satz unter der Überschrift. Optional: nur die Kapitel, die sich
 * erklären müssen (die Schranke, der KI-Rahmen), haben einen — `te` fragt,
 * statt einen Schlüssel als Text auszugeben.
 */
/** Steht in diesem Kapitel das volle Brand Design? (Paket D8) */
const hasDesign = computed(() => props.chapter.blocks.some(block => block.kind === 'design'))

/**
 * Der Erklär-Satz von Kapitel 10 ist ein ANDERER, sobald das Preset steht:
 * „entsteht erst im Brand Design" wäre dann eine Auskunft über die
 * Vergangenheit. Ein zweiter Schlüssel statt einer Verzweigung im Satz — beide
 * Sätze stehen so vollständig im Katalog und sind einzeln übersetzbar.
 */
/**
 * Dieselbe Weiche für Kapitel 11 (Paket K4, §2.20 Nr. 6): mit den Guidelines
 * ist der Satz „ein fester Rahmen" eine Auskunft über die Vergangenheit. Die
 * Frage stellt der BLOCK und nicht der Titel — `prompt` gibt es nur mit
 * abgenommenem `aiguide`.
 */
const hasGuidelines = computed(() => props.chapter.blocks.some(block => block.kind === 'prompt'))

const noteKey = computed(() => {
  if (hasDesign.value) return 'brand.foundation.note.visuellDone'
  if (props.chapter.id === 'ki-texte' && hasGuidelines.value) return 'brand.foundation.note.kiTexteGuidelines'
  return `brand.foundation.note.${props.chapter.id}`
})
const note = computed(() => (te(noteKey.value) ? t(noteKey.value) : ''))

/**
 * WARUM DIESES KAPITEL ZU IST (Paket K4, §2.5) — `null` an Kapitel 10, das
 * seinen einen Grund seit jeher im Markup trägt (Brand Design).
 *
 * Die drei Anwendungs-Kapitel haben ZWEI Gründe („Book & Kit ist Teil der
 * Ableitung" bzw. „kommt mit Brand Design"), und sie führen zu verschiedenen
 * Knöpfen. Ein gemeinsamer Satz wäre in der häufigsten Lage — freigeschaltet,
 * Design fehlt noch — schlicht falsch.
 */
const lockReason = computed(() => props.chapter.lockReason ?? null)

/**
 * KOPIEREN (§2.3 `n.prompts`): eine Vorlage wird übernommen, nicht gelesen —
 * deshalb ist der Knopf echt. Der Merker hält den Index der zuletzt kopierten
 * Vorlage, damit bei drei Blöcken nur der geklickte „Kopiert" zeigt.
 */
const copiedPrompt = ref<number | null>(null)

async function copyPrompt(index: number, value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
  }
  catch {
    /* Ohne Erlaubnis (oder ohne sicheren Kontext) gibt es keine Zwischenablage.
     * Die Rückmeldung steht trotzdem: der Text ist sichtbar und markierbar,
     * und ein stiller Fehlschlag wäre die unehrlichere der beiden Auskünfte. */
  }
  copiedPrompt.value = index
  window.setTimeout(() => { copiedPrompt.value = null }, 1600)
}

/**
 * DER WEG ZUM ERSTGESPRÄCH — AUS DER CONFIG, NICHT GETIPPT (BS1 R0).
 *
 * Hier stand die Studio-Adresse als Konstante, während die Schranke des
 * Marktvergleichs dieselbe Adresse aus `pukalani.brand.completionCta` las:
 * zwei Wahrheiten über EINEN Conversion-Weg. Jetzt beide über
 * `useBrandCompletionCta()` — `to` ist fertig (intern mit Sprach-Präfix,
 * extern ohne), `target`/`rel` kommen mit.
 */
const callCta = useBrandCompletionCta()

/** Auswahl-Ids in der Sprache der OBERFLÄCHE (s. Kopf). */
function choiceLabels(slotId: string, optionIds: readonly string[]): string[] {
  return optionIds.map(id => brandChoiceDisplayLabel(slotId, id, locale.value))
}

/** Steht in diesem Kapitel schon eine gewählte Richtung? (Paket G4) */
const hasDirection = computed(() => props.chapter.blocks.some(block => block.kind === 'direction'))

/**
 * Das Freischalt-Datum in der Sprache des LESERS. Leer, wenn es keins gibt
 * oder es unlesbar ist — dann steht der Satz ohne Datum da statt mit einem
 * „Invalid Date".
 */
const designUnlockedDate = computed(() => {
  const parsed = Date.parse(props.designUnlockedAt ?? '')
  return Number.isFinite(parsed)
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'long' }).format(parsed)
    : ''
})

/**
 * WAS DER FREMDLESER VON DER SCHRANKE SIEHT (§2.6, seit G4 zweigeteilt): die
 * gewählte RICHTUNG ja — sie ist eine Festlegung dieser Marke —, der Zoo aus
 * fünf gesperrten Elementen nein. Statt seiner steht ein Satz (s. Markup).
 */
const renderedBlocks = computed(() => (props.chapter.state === 'locked' && !isPrivate.value
  ? props.chapter.blocks.filter(block => block.kind !== 'locked' && block.kind !== 'lockedUsage')
  : props.chapter.blocks))
</script>

<template>
  <section :id="chapter.anchor" class="fd-chapter scroll-mt-6">
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <p class="bw-label uppercase tracking-widest" style="color: var(--bw-muted)">
        {{ t('brand.foundation.chapterNumber', { num }) }}
      </p>
      <span
        v-if="chapter.state === 'pending' && isPrivate"
        class="bw-state bw-state--draft"
      >{{ t('brand.foundation.pending') }}</span>
      <span v-else-if="chapter.state === 'locked'" class="bw-state">
        <UIcon name="i-ph-lock-simple" class="size-3.5" />
        {{ t(lockReason ? 'brand.foundation.usage.follows' : 'brand.foundation.visual.follows') }}
      </span>
    </div>
    <h2 class="mt-1 text-[26px] font-extralight leading-tight tracking-tight">{{ t(chapter.titleKey) }}</h2>
    <p v-if="note" class="bw-label mt-1.5" style="color: var(--bw-muted)">{{ note }}</p>

    <!-- DAS ANGEBOT AN DER SCHRANKE (§11 c, Davids Entscheidung: KEIN PREIS).
         Brand Design ist Studio-Arbeit, das Erstgespräch ist der Weg — eine
         Zahl ohne Selbstbedienung dahinter wäre ein Versprechen, das dieses
         Produkt heute nicht einlösen kann. Nur privat: der Fremdleser bekommt
         seinen einen Satz unten. -->
    <p
      v-if="chapter.state === 'locked' && isPrivate"
      class="mt-4 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
    >{{ t(lockReason === 'derivation'
      ? 'brand.foundation.usage.lockedDerivation'
      : lockReason === 'design'
        ? 'brand.foundation.usage.lockedDesign'
        : 'brand.foundation.visual.offer') }}</p>

    <div class="mt-5 flex flex-col gap-7">
      <template v-for="(block, i) in renderedBlocks" :key="`${chapter.id}-${i}`">
        <!-- Leitsatz: der eine Satz, der gross stehen darf. -->
        <div v-if="block.kind === 'lead'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <p class="mt-2 text-[22px] font-extralight leading-snug tracking-tight">{{ block.text }}</p>
        </div>

        <!-- Fließtext. Markdown nur mit Marke (s. Kopf). -->
        <div v-else-if="block.kind === 'text'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <MarkdownContent
            v-if="block.markdown"
            :source="block.text" class="bw-doc-text" :class="block.labelKey ? 'mt-2' : ''"
          />
          <p v-else class="bw-doc-text" :class="block.labelKey ? 'mt-2' : ''">{{ block.text }}</p>
        </div>

        <!-- Aufzählung. -->
        <div v-else-if="block.kind === 'list'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <ul class="mt-2 flex flex-col gap-1.5">
            <li
              v-for="(item, n) in block.items" :key="n"
              class="flex items-start gap-2.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
            >
              <span class="mt-2 size-1 flex-none rounded-full" style="background: var(--bw-line-strong)" />
              <span class="min-w-0">{{ item }}</span>
            </li>
          </ul>
        </div>

        <!-- Karten: Segmente, Werte, Boilerplates, Kernbotschaften. -->
        <div v-else-if="block.kind === 'cards'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <div class="mt-3 flex flex-col gap-3">
            <div
              v-for="(item, n) in block.items" :key="n"
              class="fd-box rounded-2xl px-5 py-4" style="background: var(--bw-surface)"
            >
              <p class="text-sm font-medium">{{ item.title }}</p>
              <p v-if="item.text" class="mt-1.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ item.text }}</p>
              <p v-if="item.note" class="bw-label mt-2.5" style="color: var(--bw-muted)">{{ item.note }}</p>
            </div>
          </div>
        </div>

        <!-- TON-WÖRTER MIT PROBE (Boston.gov-Muster, §1.5): ein Chip allein
             sagt nicht, wie er klingt — deshalb steht die Stimmprobe darunter. -->
        <div v-else-if="block.kind === 'chips'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <div class="mt-3 flex flex-col gap-3.5">
            <div v-for="(item, n) in block.items" :key="n">
              <span class="bw-chip inline-block" style="cursor: default">{{ item.word }}</span>
              <p
                v-if="item.sample"
                class="mt-1.5 text-sm italic leading-relaxed" style="color: var(--bw-ink-soft)"
              >{{ item.sample }}</p>
            </div>
          </div>
        </div>

        <!-- GESPEICHERTE AUSWAHL (Archetyp, Architektur-Modell): Ids kommen
             herein, Namen gehen hinaus (s. Kopf). -->
        <div v-else-if="block.kind === 'choice'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <span
              v-for="(label, n) in choiceLabels(block.slotId, block.optionIds)" :key="n"
              class="bw-chip inline-block" style="cursor: default"
            >{{ label }}</span>
          </div>
        </div>

        <!-- Do & Don't — aus Wort-Leitfaden und Tabu-Wörtern (§2.4). -->
        <div v-else-if="block.kind === 'dodont'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <div class="mt-3 flex flex-col gap-2">
            <div
              v-for="(pair, n) in block.pairs" :key="n"
              class="fd-box grid gap-x-4 gap-y-2 rounded-2xl px-5 py-4 sm:grid-cols-2"
              style="background: var(--bw-surface)"
            >
              <p v-if="pair.doText" class="flex items-start gap-2 text-sm leading-relaxed">
                <UIcon name="i-ph-check-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-accent)" />
                <span class="min-w-0">{{ pair.doText }}</span>
              </p>
              <span v-else />
              <p v-if="pair.dontText" class="flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-muted)">
                <UIcon name="i-ph-x-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-stale)" />
                <span class="min-w-0 line-through">{{ pair.dontText }}</span>
              </p>
            </div>
          </div>
        </div>

        <!-- Tabelle (Namens-Kandidaten, Prüfung). Waagerecht scrollbar in der
             eigenen Hülle — der Seitenkörper scrollt nie quer. -->
        <div v-else-if="block.kind === 'table'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <div class="mt-2.5 overflow-x-auto">
            <table class="w-full min-w-[28rem] border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th
                    v-for="col in block.columnKeys" :key="col"
                    class="bw-label border-b px-0 pb-2 pr-4 font-normal uppercase tracking-wider"
                    style="color: var(--bw-muted); border-color: var(--bw-line)"
                  >{{ t(col) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, r) in block.rows" :key="`row-${r}`">
                  <td
                    v-for="(cell, c) in row" :key="`cell-${r}-${c}`"
                    class="border-b py-2.5 pr-4 align-top leading-relaxed"
                    :style="`border-color: var(--bw-line); color: ${c === 0 ? 'var(--bw-ink)' : 'var(--bw-ink-soft)'}`"
                  >{{ cell }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- REGELN (Paket K4, §2.5): nummeriert, weil man sie zitiert — „Regel
             3" ist im Team eine Adresse. Das Gegenbeispiel steht UNTER der
             Regel und nicht daneben: es ist ihre Begründung, kein zweiter
             Wert. Zwei Beschriftungen, zwei Herkünfte (s. Kopf der Block-Art):
             der Rahmen kommt aus dem Katalog, die Gruppen-Überschrift von der
             Marke. -->
        <div v-else-if="block.kind === 'rules'">
          <p v-if="block.labelKey || block.label" class="bw-label" style="color: var(--bw-muted)">
            {{ [block.labelKey ? t(block.labelKey) : '', block.label ?? ''].filter(Boolean).join(' · ') }}
          </p>
          <ol class="mt-2.5 flex flex-col gap-2.5">
            <li v-for="(rule, r) in block.items" :key="`rule-${r}`" class="flex items-start gap-3">
              <span class="bw-label mt-0.5 flex-none tabular-nums" style="color: var(--bw-muted)">
                {{ String(r + 1).padStart(2, '0') }}
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm leading-relaxed">{{ rule.text }}</span>
                <span
                  v-if="rule.dont"
                  class="mt-1 flex items-start gap-2 text-sm leading-relaxed" style="color: var(--bw-muted)"
                >
                  <UIcon name="i-ph-x-circle-fill" class="mt-0.5 size-4 flex-none" style="color: var(--bw-stale)" />
                  <span class="min-w-0">{{ rule.dont }}</span>
                </span>
              </span>
            </li>
          </ol>
        </div>

        <!-- VORLAGE ZUM KOPIEREN (§2.3 `n.prompts`): Mono, Zeilenumbrüche
             erhalten — sie wird nicht gelesen, sie wird übernommen. Der Knopf
             schreibt echt in die Zwischenablage und verschwindet im Druck. -->
        <div
          v-else-if="block.kind === 'prompt'"
          class="fd-box rounded-2xl px-5 py-4" style="background: var(--bw-surface)"
        >
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
            <UButton
              class="fd-noprint ms-auto rounded-full"
              size="xs" color="neutral" variant="outline"
              :icon="copiedPrompt === i ? 'i-ph-check' : 'i-ph-copy'"
              :label="t(copiedPrompt === i ? 'brand.foundation.usage.copied' : 'brand.foundation.usage.copy')"
              style="background: var(--bw-surface-hi)"
              @click="copyPrompt(i, block.text)"
            />
          </div>
          <p class="mt-1 text-sm font-medium">{{ block.title }}</p>
          <pre class="fd-prompt mt-3">{{ block.text }}</pre>
          <p class="bw-pending mt-3">{{ t('brand.foundation.usage.promptHint') }}</p>
        </div>

        <!-- ANSPRECHPERSON (§2.4 `p.contact`): der Vermerk „reist öffentlich"
             steht AM Block und nicht im Kleingedruckten — genau das ist die
             Zusage, die der Mensch vor der Abnahme gesehen hat. -->
        <div
          v-else-if="block.kind === 'contact'"
          class="fd-box rounded-2xl px-5 py-4" style="background: var(--bw-surface)"
        >
          <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.label.pressContact') }}</p>
          <p v-if="block.name" class="mt-2 text-sm font-medium">{{ block.name }}</p>
          <p v-if="block.role" class="text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ block.role }}</p>
          <!-- KEIN `mailto:` — die Seite wird auch geteilt und gedruckt, und
               eine Adresse zum Abschreiben ist in beiden Fällen das, was
               gebraucht wird. -->
          <p v-if="block.email" class="mt-1 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">
            {{ block.email }}
          </p>
          <p class="bw-pending mt-3">{{ t('brand.foundation.usage.contactPublic') }}</p>
        </div>

        <!-- DIE SCHRANKE DER ANWENDUNGS-KAPITEL (Paket K4, §2.5) — dieselbe
             Fläche wie an Kapitel 10, andere Liste und anderes Produkt. -->
        <div
          v-else-if="block.kind === 'lockedUsage'"
          class="fd-box flex items-start gap-3 rounded-2xl px-5 py-4"
          style="background: var(--bw-surface)"
        >
          <UIcon name="i-ph-lock-simple" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium" style="color: var(--bw-ink-soft)">
              {{ t(`brand.foundation.usage.${block.topic}.title`) }}
            </p>
            <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-muted)">
              {{ t(`brand.foundation.usage.${block.topic}.text`) }}
            </p>
          </div>
          <p class="bw-label flex-none max-sm:hidden" style="color: var(--bw-muted)">
            {{ t('brand.foundation.usage.product') }}
          </p>
        </div>

        <!-- DIE SICHTBARE SCHRANKE (§2.5): was dort entsteht, woraus — und
             welches Produkt es liefert. Ehrlich beschriftet statt weggelassen. -->
        <div
          v-else-if="block.kind === 'locked'"
          class="fd-box flex items-start gap-3 rounded-2xl px-5 py-4"
          style="background: var(--bw-surface)"
        >
          <UIcon name="i-ph-lock-simple" class="mt-0.5 size-4 flex-none" style="color: var(--bw-muted)" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium" style="color: var(--bw-ink-soft)">
              {{ t(`brand.foundation.visual.${block.element}.title`) }}
            </p>
            <p class="mt-1 text-sm leading-relaxed" style="color: var(--bw-muted)">
              {{ t(`brand.foundation.visual.${block.element}.text`) }}
            </p>
          </div>
          <p class="bw-label flex-none max-sm:hidden" style="color: var(--bw-muted)">
            {{ t('brand.foundation.visual.product') }}
          </p>
        </div>

        <!-- DIE GEWÄHLTE RICHTUNG (Paket G4): Name, Begründung, Schriftpaar —
             und ein Streifen der Farbwelt, damit „Warm & Editorial" nicht nur
             ein Wort ist. Die Ausarbeitung bleibt darunter gesperrt: gewählt
             ist eine Welt, gebaut wird sie in Brand Design. -->
        <div v-else-if="block.kind === 'direction'">
          <p class="bw-label" style="color: var(--bw-muted)">{{ t('brand.foundation.direction.chosen') }}</p>
          <div
            class="fd-dir-strip mt-2 h-8 rounded-xl"
            :style="`background: linear-gradient(90deg, ${block.gradient[2]}, ${block.gradient[1]} 60%, ${block.gradient[0]})`"
          />
          <p class="mt-3 text-[22px] font-extralight leading-snug tracking-tight">{{ t(block.nameKey) }}</p>
          <p class="mt-1.5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)">{{ t(block.reasonKey) }}</p>
          <p class="bw-label mt-3" style="color: var(--bw-muted)">
            {{ t('brand.foundation.direction.fontsLabel') }}: {{ block.fonts.heading }} · {{ block.fonts.body }}
          </p>
        </div>

        <!-- Farbrampe der gewählten Richtung — die ROLLE ist ein Schlüssel
             (sie steht in der Sprache des Lesers), der Hex-Wert ist der Wert
             (ihn schreibt jemand ab). -->
        <div v-else-if="block.kind === 'swatches'">
          <p v-if="block.labelKey" class="bw-label" style="color: var(--bw-muted)">{{ t(block.labelKey) }}</p>
          <div class="mt-3 flex flex-wrap gap-5">
            <div v-for="color in block.items" :key="color.hex" class="flex flex-col gap-1.5">
              <div class="bw-swatch rounded-full" :style="`background: ${color.hex}; width: 2.75rem; height: 2.75rem`" />
              <p class="bw-label" style="color: var(--bw-ink-soft)">{{ t(color.roleKey) }}</p>
              <p class="bw-label font-mono" style="color: var(--bw-muted)">{{ color.hex }}</p>
            </div>
          </div>
        </div>

        <!-- DAS VOLLE KAPITEL 10 (Brand Design D8, §2.8): eine Vitrine, kein
             Text — deshalb eine eigene Komponente (s. deren Kopf). Sie steht
             an der Stelle, an der sonst die Schranke stünde. -->
        <BwDesignChapterBody
          v-else-if="block.kind === 'design'"
          :preset="block.preset" :title="block.title" :kept-drafts="block.keptDrafts"
          :stand="designStand" :board-to="designBoardTo"
        />

        <!-- DER FESTE KI-RAHMEN (§2.4): drei Zeilen, gefüllt aus Ton-Wörtern,
             Tabu-Wörtern und Werten. Keine Generierung, kein Cache. -->
        <div v-else-if="block.kind === 'aiRules'" class="fd-box rounded-2xl px-5 py-5" style="background: var(--bw-surface)">
          <p v-if="block.tone.length" class="text-sm leading-relaxed">
            <span class="font-medium">{{ t('brand.foundation.ai.tone') }}</span>
            <span style="color: var(--bw-ink-soft)"> {{ block.tone.join(' · ') }}</span>
          </p>
          <p v-if="block.avoid.length" class="mt-2.5 text-sm leading-relaxed">
            <span class="font-medium">{{ t('brand.foundation.ai.avoid') }}</span>
            <span style="color: var(--bw-ink-soft)"> {{ block.avoid.join(' · ') }}</span>
          </p>
          <p v-if="block.stands.length" class="mt-2.5 text-sm leading-relaxed">
            <span class="font-medium">{{ t('brand.foundation.ai.stands') }}</span>
            <span style="color: var(--bw-ink-soft)"> {{ block.stands.join(' · ') }}</span>
          </p>
          <p class="bw-pending mt-4">{{ t('brand.foundation.ai.hint') }}</p>
        </div>
      </template>
    </div>

    <!-- GESPERRT BEIM FREMDLESER: ein Satz, kein Angebot (§2.6). Er steht
         seit G4 UNTER der Richtung, nicht mehr an ihrer Stelle: „was gilt"
         gehört ihm, „was das kostet" nicht. -->
    <p
      v-if="chapter.state === 'locked' && !isPrivate"
      class="mt-5 text-sm leading-relaxed" style="color: var(--bw-ink-soft)"
    >{{ t(lockReason ? 'brand.foundation.usage.shareLine' : 'brand.foundation.visual.shareLine') }}</p>

    <!-- Der Vermerk am offenen Kapitel — NUR privat, und der EINZIGE Knopf im
         Text: korrigiert und abgenommen wird in der Werkstatt, nie hier (§2.6). -->
    <p v-if="chapter.state === 'pending' && isPrivate" class="fd-noprint mt-5 flex flex-wrap items-center gap-2">
      <span class="bw-pending">{{ t('brand.foundation.pendingNote') }}</span>
      <NuxtLink
        v-if="acceptanceTo" :to="acceptanceTo"
        class="bw-label underline" style="color: var(--bw-ink-soft)"
      >{{ t('brand.foundation.toAcceptance') }}</NuxtLink>
    </p>

    <!-- EIN CTA-PAAR je Schranken-Kapitel, nicht je Abschnitt — und nur privat.
         OHNE PREISANKER: der Schranken-Text mit Preis ist Davids Gate (Paket
         G4), und ein erfundener Preis wäre teurer als eine fehlende Zahl. -->
    <!-- DIE ANWENDUNGS-KAPITEL (Paket K4, §2.5): EIN Knopf, kein Preis. Bei
         `derivation` ist das Erstgespräch der einzige Weg (die Ableitung wird
         freigeschaltet, nicht gekauft); bei `design` führt derselbe Knopf
         weiter, den Kapitel 10 anbietet — dorthin, wo die Farbwelt entsteht. -->
    <div v-if="chapter.state === 'locked' && isPrivate && lockReason" class="fd-noprint mt-5 flex flex-wrap items-center gap-2">
      <UButton
        v-if="lockReason === 'design' && designTo"
        :to="designTo"
        class="rounded-full" trailing-icon="i-ph-arrow-right"
        :label="t('brand.foundation.visual.ctaDesign')"
      />
      <UButton
        v-else
        :to="callCta.to" :target="callCta.target" :rel="callCta.rel" :external="callCta.external"
        class="rounded-full" trailing-icon="i-ph-arrow-right"
        :label="t('brand.foundation.visual.ctaCall')"
      />
      <p class="bw-label basis-full" style="color: var(--bw-muted)">
        {{ t('brand.foundation.usage.product') }}
      </p>
    </div>

    <div v-else-if="chapter.state === 'locked' && isPrivate" class="fd-noprint mt-5 flex flex-wrap items-center gap-2">
      <UButton
        v-if="directionTo"
        :to="directionTo"
        class="rounded-full" trailing-icon="i-ph-arrow-right"
        :label="t(hasDirection ? 'brand.foundation.direction.change' : 'brand.foundation.direction.choose')"
      />
      <UButton
        v-else
        class="rounded-full" trailing-icon="i-ph-arrow-right" disabled
        :label="t('brand.foundation.direction.choose')"
      />
      <!-- FREIGESCHALTET: der EINSTIEG statt des ANGEBOTS (§2.10, D1). Das
           Erstgespräch ist der Weg ZUR Freischaltung — wer sie hat, braucht
           kein zweites Mal danach zu fragen. Der Kapitel-INHALT bleibt bis D8
           die Schranken-Liste: „was hier entsteht" ist auch freigeschaltet
           eine wahre Auskunft, solange nichts entschieden ist. -->
      <UButton
        v-if="designTo"
        :to="designTo"
        class="rounded-full" trailing-icon="i-ph-arrow-right"
        :label="t('brand.foundation.visual.ctaDesign')"
      />
      <UButton
        v-else
        :to="callCta.to" :target="callCta.target" :rel="callCta.rel" :external="callCta.external"
        color="neutral" variant="outline" class="rounded-full" style="background: var(--bw-surface-hi)"
        :label="t('brand.foundation.visual.ctaCall')"
      />
      <p class="bw-label basis-full" style="color: var(--bw-muted)">
        {{ designTo
          ? (designUnlockedDate
            ? t('brand.foundation.visual.unlockedOn', { date: designUnlockedDate })
            : t('brand.foundation.visual.unlocked'))
          : directionTo ? t('brand.foundation.visual.product') : t('brand.foundation.direction.lockedHint') }}
      </p>
    </div>
  </section>
</template>

<style scoped>
/* DRUCK (§2.6): Seitenumbruch je Kapitel, keine Knöpfe, keine Karten-Flächen
 * — Papier braucht Linien, keine Tiefe. Die Kopfzeile mit Marke und Stand
 * setzt die SEITE, nicht das Kapitel. */
/* Die Vorlage steht in Mono mit erhaltenen Umbrüchen und bricht lange Zeilen
 * um — ein Prompt-Block, der quer scrollt, lässt den Seitenkörper mitscrollen. */
.fd-prompt {
  font-family: var(--bw-font-mono);
  font-size: 12px;
  line-height: 20px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--bw-ink-soft);
  margin: 0;
}

@media print {
  .fd-chapter { break-before: page; break-inside: auto; }
  .fd-chapter:first-child { break-before: auto; }
  .fd-noprint { display: none !important; }
  .fd-box { background: transparent !important; border: 1px solid #ddd; border-radius: 8px; }
  /* Tabellen der Anwendungs-Kapitel nicht über den Seitenrand reißen (§2.5):
   * eine Rollen-Tabelle, die auf zwei Seiten zerfällt, verliert ihren Kopf. */
  .fd-chapter table { break-inside: avoid; }
}
</style>
