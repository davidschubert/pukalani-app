<script setup lang="ts">
import type { useBrandWorkshopBenches } from '../composables/useBrandWorkshopBenches'

/**
 * DIE WERKBÄNKE ÜBER DEM GESPRÄCH — aus der Werkstatt-Seite geschnitten (WS1,
 * Rest nach Bahn C): Vorbilder und Lesung, DNA-Vorschlag, die fünf
 * Design-Werkzeuge und die drei Kapitel von Book & Kit.
 *
 * Reine Anzeige: was gezeigt wird und wohin eine Wahl geht, rechnet
 * `useBrandWorkshopBenches` in der SEITE (dort laufen auch die Beobachter nach
 * dem Mount — sie hängen nicht daran, ob diese Fläche gerade steht). Die
 * Komponente rendert nur Geschwister, kein eigenes Element: der Abstand der
 * Bühne (`gap-7`) gilt für jedes Panel wie vorher.
 */
const props = defineProps<{
  profileId: string
  benches: ReturnType<typeof useBrandWorkshopBenches>
}>()

const {
  showInspiration,
  showInspirationSkipped,
  showDnaPanel,
  showColorPanel,
  confirmedColorSlots,
  applyColorPick,
  showTypePanel,
  confirmedTypeSlots,
  applyTypePick,
  showMarkPanel,
  confirmedMarkSlots,
  applyMarkPick,
  showImageryPanel,
  confirmedImagerySlots,
  applyImageryPick,
  showMotionPanel,
  confirmedMotionSlots,
  applyMotionPick,
  kitWorkshop,
  showNomenclaturePanel,
  showAiguidePanel,
  showPresskitPanel,
  confirmedNomenclatureSlots,
  confirmedAiguideSlots,
  confirmedPresskitSlots,
  applyKitPick,
} = props.benches

const { t } = useI18n()
</script>

<template>
    <!-- DAS INSTRUMENT `uploads` (Brand Design D2a, §2.2 Schritt 2) — die
         Vorbilder. Es steht ÜBER dem Gespräch und nicht als Antwort-Modul
         darunter, weil `g.inspiration` `type: 'special'` ist: es beantwortet
         keine Frage, es nimmt entgegen (`sessionContent.ts`: „das Instrument
         fragt nicht"). Sichtbar wird es erst nach der Weiche — s.
         `showInspiration`. -->
    <BwUploadsEditor v-if="showInspiration" :profile-id="profileId" />
    <!-- DIE LESUNG (`g.reading`, D2b) steht DIREKT unter dem Instrument und
         unter derselben Bedingung: sie liest genau die Bilder darüber, und
         ohne Vorbilder gibt es nichts zu lesen. Kein Chat — dieser
         Abschnitt ist ein LAUF (s. Kopf der Komponente). -->
    <BwReadingPanel v-if="showInspiration" :profile-id="profileId" />
    <p v-else-if="showInspirationSkipped" class="bw-pending">
      {{ t('brand.inspiration.skipped') }}
    </p>

    <!-- DER DNA-VORSCHLAG (`g.dna`, D2c) — er steht unter der Lesung und
         auf BEIDEN Wegen: ohne Vorbilder leitet Frida ihn aus der
         Foundation allein ab (§2.2 Schritt 4). Kein Chat, sondern ein
         LAUF, wie die Lesung darüber. -->
    <BwDnaPanel
      v-if="showDnaPanel"
      :profile-id="profileId"
      :with-inspiration="showInspiration"
    />

    <!-- DIE FARBWELT (Kapitel `color`, D3) — sechs Abschnitte auf EINER
         Werkbank. Sie steht ÜBER dem Gespräch wie der DNA-Vorschlag: was
         hier passiert, ist kein Zug, sondern eine Rechnung, die man
         ansieht. Bestätigt wird jede der sechs Sessions unten auf ihrer
         Karte (`RENDERED_ABOVE`). -->
    <BwColorPanel
      v-if="showColorPanel"
      :confirmed="confirmedColorSlots"
      @pick="applyColorPick"
    />

    <!-- DIE TYPOGRAFIE (Kapitel `type`, D4) — Paar, Hierarchie, Regeln
         auf EINER Werkbank, mit den echten Schriften. Sie steht wie die
         Farbwelt ÜBER dem Gespräch: was hier passiert, ist kein Zug,
         sondern eine Wahl, die man sofort sieht. Bestätigt wird jede der
         drei Sessions unten auf ihrer Karte (`RENDERED_ABOVE`). -->
    <BwTypePanel
      v-if="showTypePanel"
      :confirmed="confirmedTypeSlots"
      @pick="applyTypePick"
    />

    <!-- DAS ZEICHEN (Kapitel `mark`, D5a/D5b) — Richtung, Briefing und die
         gesetzten Beispiele auf EINER Werkbank. Wie Farbwelt und
         Typografie steht sie ÜBER dem Gespräch; bestätigt wird jede
         Session unten auf ihrer Karte (`RENDERED_ABOVE`). Stufe 3 (die
         KI-Entwürfe, D5c) hängt als eigene Komponente darunter. -->
    <BwMarkPanel
      v-if="showMarkPanel"
      :profile-id="profileId"
      :confirmed="confirmedMarkSlots"
      @pick="applyMarkPick"
    />

    <!-- DIE BILDSPRACHE (Kapitel `imagery`, D6) — Prinzip, Illustration,
         Icons und das gerechnete Do & Don't auf EINER Werkbank. Wie die
         drei Kapitel davor steht sie ÜBER dem Gespräch; bestätigt wird
         jede Session unten auf ihrer Karte (`RENDERED_ABOVE`). Keine
         Fotos, keine KI-Bilder — §1.4. -->
    <BwImageryPanel
      v-if="showImageryPanel"
      :confirmed="confirmedImagerySlots"
      @pick="applyImageryPick"
    />

    <!-- DIE BEWEGUNG (Kapitel `motion`, D7) — Tempo, Übergangs-Tokens,
         kinetisches Zeichen und die Regeln auf EINER Werkbank. Wie die
         vier Kapitel davor steht sie ÜBER dem Gespräch; bestätigt wird
         jede Session unten auf ihrer Karte (`RENDERED_ABOVE`). Die drei
         Tempos spielen als drei Szenen gleichzeitig — Tempo liest man
         nicht (§2.7). -->
    <BwMotionPanel
      v-if="showMotionPanel"
      :confirmed="confirmedMotionSlots"
      @pick="applyMotionPick"
    />

    <!-- DIE NOMENKLATUR (Kapitel `nomenclature`, K5) — Typen, Muster und
         Regeln auf EINER Werkbank. Wie die Design-Kapitel steht sie ÜBER
         dem Gespräch; bestätigt wird jede Session unten auf ihrer Karte
         (`RENDERED_ABOVE`). Die Züge darüber sind GEORGES Sätze über Otto
         — keine zweite Stimme. -->
    <template v-if="showNomenclaturePanel">
      <BwKitMoves chapter="nomenclature" :count="3" />
      <BwKitPatternsPanel
        :architecture-rule="kitWorkshop.architectureRule.value"
        :confirmed="confirmedNomenclatureSlots"
        @pick="applyKitPick"
      />
    </template>

    <!-- DIE AI-GUIDELINES (Kapitel `aiguide`, K5). Umfang und Freigabe
         sind Katalog-Wahlen und laufen über das Karten-Instrument der
         Bühne; die LEITPLANKEN entwirft Nikas Technik auf ihrer Karte.
         Hier steht nur, was PUR gerechnet ist: die drei Vorlagen. -->
    <template v-if="showAiguidePanel">
      <BwKitMoves chapter="aiguide" :count="3" />
      <BwKitPromptsPanel
        :prompts="kitWorkshop.prompts.value"
        :pending="kitWorkshop.pending.value"
        :confirmed="confirmedAiguideSlots"
        @pick="applyKitPick"
      />
    </template>

    <!-- DAS PRESSEKIT (Kapitel `presskit`, K5) — hier entsteht nichts
         Neues; zwei Dinge muss trotzdem ein Mensch sagen (Fakten-Freigabe,
         Ansprechperson), das dritte ist die Vorschau. -->
    <template v-if="showPresskitPanel">
      <BwKitMoves chapter="presskit" :count="2" />
      <BwKitFactsPanel
        :facts="kitWorkshop.facts.value"
        :pending="kitWorkshop.pending.value"
        :confirmed="confirmedPresskitSlots"
        @pick="applyKitPick"
      />
      <BwKitContactPanel
        :templates="kitWorkshop.contactTemplates.value"
        :pending="kitWorkshop.pending.value"
        :confirmed="confirmedPresskitSlots"
        @pick="applyKitPick"
      />
      <BwKitSummaryPanel
        :summary="kitWorkshop.summary.value"
        :pending="kitWorkshop.pending.value"
        :confirmed="confirmedPresskitSlots"
        @pick="applyKitPick"
      />
    </template>
</template>
