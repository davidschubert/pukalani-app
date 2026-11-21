<script setup lang="ts">
/**
 * Der Gebühren-Rechner (U17, Empfehlung E9 des Wettbewerbs-Benchmarks).
 *
 * DIE FRAGE, DIE ER BEANTWORTET: fast jede Plattform im Feld nimmt einen
 * ANTEIL an dem, was die Mitglieder zahlen. Ein Anteil wächst mit der
 * Community, ein Festpreis nicht — und genau diese Schere sieht man einer
 * Preisseite nicht an. Mighty Networks stellt einen Umsatzrechner ganz oben
 * auf die eigene Startseite; die Zielgruppe rechnet also nachweislich so.
 *
 * VIER REGELN, DIE MAN NICHT „VEREINFACHEN" DARF:
 *
 * 1. ALLE ZAHLEN KOMMEN AUS `#shared/marketing` (FEE_PROVIDERS), und die
 *    stammen ausnahmslos aus dem Benchmark-Dokument vom 2026-08-10. Hier wird
 *    nichts hartkodiert, nichts geschätzt und nichts umgerechnet.
 *
 * 2. DIE GRUNDPREISE WERDEN NICHT AUFADDIERT. Sie stehen in vier Währungs-
 *    und Steuerwelten (89 $ netto, 19 € netto, 149 € brutto); eine Summe
 *    bräuchte einen Wechselkurs und einen Steuersatz, die der Benchmark nicht
 *    hergibt. Sie stehen deshalb als eigene SPALTE da, nicht als Summand —
 *    der Rechner rechnet ausschliesslich die variable Grösse.
 *
 * 3. DETERMINISTISCHER ANFANGSZUSTAND. `members`/`contribution` starten auf
 *    festen Konstanten, nie auf etwas Umgebungsabhängigem — der Server
 *    rendert damit exakt dieselbe Tabelle wie der erste Bildaufbau im
 *    Browser. Ein `Date` oder ein `localStorage`-Wert an dieser Stelle wäre
 *    ein Hydration-Mismatch mit Ansage.
 *
 * 4. GERUNDET WIRD ERST BEI DER ANZEIGE. Die Jahreszahl ist zwölf Mal der
 *    UNGERUNDETE Monatswert; würde man den gerundeten mal zwölf nehmen,
 *    stünden in der Tabelle zwei Zahlen, die nicht zueinander passen.
 *
 * Die Tabelle ist aus denselben Gründen handgeschrieben wie die in
 * `ComparisonSection.vue` (dort steht die ausführliche Begründung gegen
 * `UPricingTable` und `UTable`): sie braucht eine beschriftete erste
 * Kopfzelle, Zeilenköpfe mit `scope="row"` und genau EINE Darstellung, die
 * auf dem Handy in ihrem Container scrollt.
 */
import {
  FEE_CONTRIBUTION_MAX,
  FEE_CONTRIBUTION_MIN,
  FEE_CONTRIBUTION_STEP,
  FEE_CUMULATIVE_SOURCE,
  FEE_DEFAULT_CONTRIBUTION,
  FEE_DEFAULT_MEMBERS,
  FEE_MEMBERS_MAX,
  FEE_MEMBERS_MIN,
  FEE_MEMBERS_STEP,
  FEE_PROVIDERS,
  FEE_PUKALANI_MONTHLY,
  monthlyFee,
} from '#shared/marketing'

const props = defineProps<{
  /**
   * Schlüssel des Anbieters, um den es auf DIESER Seite geht (`/vs/<slug>`).
   * Seine Zeile wird hervorgehoben — auf `/wechseln` bleibt der Wert leer und
   * keine Zeile ist ausgezeichnet.
   */
  highlight?: string
}>()

const { t, n } = useI18n()

const members = ref(FEE_DEFAULT_MEMBERS)
const contribution = ref(FEE_DEFAULT_CONTRIBUTION)

/** Monatlicher Mitglieder-Umsatz — die Bezugsgrösse jeder Zeile. */
const revenue = computed(() => members.value * contribution.value)

/** Euro ohne Nachkommastellen: der Rechner schätzt, er stellt keine Rechnung. */
function euro(value: number): string {
  return n(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

const revenueText = computed(() => euro(revenue.value))
const revenueYearText = computed(() => euro(revenue.value * 12))
const pukalaniPrice = computed(() => euro(FEE_PUKALANI_MONTHLY))

const rows = computed(() =>
  FEE_PROVIDERS.map((provider) => {
    const perMonth = monthlyFee(revenue.value, provider.rate)
    return {
      key: provider.key,
      name: provider.name,
      plan: provider.plan,
      base: provider.base,
      rate: n(provider.rate, { style: 'percent', maximumFractionDigits: 1 }),
      month: euro(perMonth),
      year: euro(perMonth * 12),
      highlighted: provider.key === props.highlight,
    }
  }),
)

/** Null Prozent ist eine ZAHL und wird wie jede andere lokalisiert. */
const zeroRate = computed(() => n(0, { style: 'percent', maximumFractionDigits: 1 }))
const zeroEuro = computed(() => euro(0))
</script>

<template>
  <!-- `tone-dawn-hold` wie ComparisonSection, hinter der dieser Abschnitt auf
       BEIDEN Seiten steht: die Tonleiter der Marketing-Seite läuft nur
       vorwärts, und die Startseite führt selbst fünf dawn-hold-Bänder in
       Folge — gleiche Nachbartöne sind hier die Regel, kein Versehen. -->
  <section id="gebuehren" class="mkt-section tone-dawn-hold">
    <div class="mkt-inner mkt-narrow fee-head" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.fees.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.fees.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.fees.lead') }}</p>
    </div>

    <!--
      ZWEI ZAHLENFELDER UND BEWUSST KEINE REGLER. `USlider` wäre das
      spielerischere Bauteil, ist hier aber nicht bedienbar: Nuxt UI schreibt
      dem Daumen — dem EINZIGEN fokussierbaren Element des Reglers — ein festes
      `aria-label="Thumb"` (Slider.vue, Zeile 93/95), das keine Eigenschaft
      überschreibt. Am 2026-08-12 im Browser nachgemessen: die Beschriftung aus
      `UFormField` landet per `for` auf der WURZEL, der Daumen trägt weder
      `aria-labelledby` noch einen eigenen Text — eine Vorlesehilfe sagt dort
      „Thumb, Schieberegler, 300" an. Ein Rechner, dessen Eingaben man nicht
      benennen kann, ist kein Rechner.

      `UInputNumber` rendert ein echtes `<input>`, das `UFormField` über
      `for`/`id` mit seiner Beschriftung verbindet — und es lässt die eigene
      Zahl EINGEBEN statt sie in Zehnerschritten zu suchen. Genau darum geht es
      auf dieser Seite: nicht um ein Gefühl, sondern um die eigenen Zahlen.
    -->
    <div class="mkt-inner mkt-narrow fee-controls" data-reveal>
      <UFormField :label="t('marketing.fees.membersLabel')">
        <UInputNumber
          v-model="members"
          class="w-full"
          :min="FEE_MEMBERS_MIN" :max="FEE_MEMBERS_MAX" :step="FEE_MEMBERS_STEP"
        />
      </UFormField>
      <UFormField :label="t('marketing.fees.contributionLabel')">
        <UInputNumber
          v-model="contribution"
          class="w-full"
          :min="FEE_CONTRIBUTION_MIN" :max="FEE_CONTRIBUTION_MAX" :step="FEE_CONTRIBUTION_STEP"
        />
      </UFormField>
      <p class="fee-revenue">
        {{ t('marketing.fees.revenue', { month: revenueText, year: revenueYearText }) }}
      </p>
    </div>

    <div class="fee-wrap mkt-inner" data-reveal>
      <table class="fee-table">
        <caption class="fee-caption">{{ t('marketing.fees.asOf') }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ t('marketing.fees.colProvider') }}</th>
            <th scope="col">{{ t('marketing.fees.colPlan') }}</th>
            <th scope="col">{{ t('marketing.fees.colBase') }}</th>
            <th scope="col">{{ t('marketing.fees.colRate') }}</th>
            <th scope="col">{{ t('marketing.fees.colMonth') }}</th>
            <th scope="col">{{ t('marketing.fees.colYear') }}</th>
          </tr>
        </thead>
        <tbody>
          <!-- Wir stehen oben, weil die Null der Bezugspunkt ist, gegen den
               alle anderen Zeilen gelesen werden. -->
          <tr class="row-us">
            <th scope="row">{{ t('marketing.fees.us') }}</th>
            <td>Pro</td>
            <td>{{ pukalaniPrice }}</td>
            <td>{{ zeroRate }}</td>
            <td>{{ zeroEuro }}</td>
            <td>{{ zeroEuro }}</td>
          </tr>
          <tr v-for="row in rows" :key="row.key" :class="{ 'row-mark': row.highlighted }">
            <th scope="row">{{ row.name }}</th>
            <td>{{ row.plan }}</td>
            <td>{{ row.base }}</td>
            <td>{{ row.rate }}</td>
            <td>{{ row.month }}</td>
            <td>{{ row.year }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="mkt-inner mkt-narrow fee-foot" data-reveal>
      <p class="fee-claim">{{ t('marketing.fees.claim', { price: pukalaniPrice }) }}</p>
      <p class="fee-note">{{ t('marketing.fees.baseNote') }}</p>
      <p class="fee-note">{{ t('marketing.fees.stripeNote') }}</p>
      <p class="fee-note">{{ t('marketing.fees.cumulativeNote') }}</p>
      <p class="fee-sources">
        <span>{{ t('marketing.fees.sources') }}</span>
        <a
          v-for="provider in FEE_PROVIDERS" :key="provider.key"
          :href="provider.source" rel="nofollow noopener" target="_blank"
        >{{ provider.name }}</a>
        <!-- Eigener Beleg für die kumulierte Zahl: sie stammt nicht von einer
             Anbieter-Preisseite und dürfte sonst als deren Aussage gelesen
             werden. -->
        <a
          :href="FEE_CUMULATIVE_SOURCE.href" rel="nofollow noopener" target="_blank"
        >{{ FEE_CUMULATIVE_SOURCE.name }}</a>
      </p>
    </div>
  </section>
</template>

<style scoped>
.fee-head { text-align: center; }
.fee-head .mkt-lead { margin-inline: auto; }

.fee-controls {
  display: grid;
  gap: 1.5rem 2.5rem;
  margin-top: 2.5rem;
}
@media (min-width: 48rem) {
  .fee-controls { grid-template-columns: 1fr 1fr; }
  .fee-revenue { grid-column: 1 / -1; }
}
.fee-revenue {
  margin-top: 0.25rem;
  font-size: var(--text-base);
  font-weight: 700;
  color: hsl(var(--puka-ink));
  text-align: center;
}

/* Breite Tabelle scrollt in ihrem eigenen Container — die Seite selbst nie
   (dieselbe Regel wie in ComparisonSection). */
.fee-wrap {
  margin-top: 2rem;
  overflow-x: auto;
  border-radius: 1rem;
  border: 1px solid var(--puka-card-edge);
  background: hsl(var(--puka-paper) / 0.6);
}
.fee-table {
  width: 100%;
  min-width: 42rem;
  border-collapse: collapse;
  font-size: var(--text-base);
}
.fee-caption {
  caption-side: bottom;
  padding: 0.85rem 1rem;
  font-size: var(--text-xs);
  color: hsl(var(--puka-ink-soft) / 0.75);
  text-align: left;
}
.fee-table th, .fee-table td {
  padding: 0.8rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--puka-card-edge);
}
.fee-table thead th {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(var(--puka-ink-soft) / 0.8);
  background: hsl(var(--puka-dawn) / 0.55);
}
.fee-table tbody th { font-weight: 600; color: hsl(var(--puka-ink)); }
.fee-table td { color: hsl(var(--puka-ink-soft)); }
.fee-table .row-us th, .fee-table .row-us td {
  background: hsl(var(--puka-sun) / 0.14);
  font-weight: 700;
  color: hsl(var(--puka-ink));
}
/* Die Zeile des Anbieters, um den es auf dieser Seite geht. Bewusst nur eine
   ruhige Tönung: sie soll auffindbar sein, nicht angeklagt. */
.fee-table .row-mark th, .fee-table .row-mark td {
  background: hsl(var(--puka-dawn) / 0.4);
  color: hsl(var(--puka-ink));
}
.fee-table tbody tr:last-child th,
.fee-table tbody tr:last-child td { border-bottom: 0; }

.fee-foot { margin-top: 1.5rem; }
.fee-claim {
  font-size: var(--text-base);
  font-weight: 600;
  color: hsl(var(--puka-ink));
}
.fee-note {
  margin-top: 0.7rem;
  font-size: var(--text-sm);
  color: hsl(var(--puka-ink-soft) / 0.85);
}
.fee-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.85rem;
  margin-top: 0.9rem;
  font-size: var(--text-sm);
  color: hsl(var(--puka-ink-soft) / 0.85);
}
/* Text-Akzent über das Theme-Alias, nicht über das rohe Tripel (WCAG AA —
   dieselbe Umstellung wie in ComparisonSection, 2026-08-08). */
.fee-sources a { color: var(--ui-color-primary-600); text-decoration: underline; }
</style>
