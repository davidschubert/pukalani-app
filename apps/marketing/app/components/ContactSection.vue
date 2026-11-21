<script setup lang="ts">
/**
 * Szene 14 — Kontakt (Davids Entscheidung 2026-08-09).
 *
 * WOFÜR: die Studio-Karte der Preistabelle ist das Angebot NACH MASS und kein
 * Selbstbedienungs-Kauf (F49-Nachtrag) — ihr Knopf zeigte trotzdem auf die
 * Anmeldung, also auf einen Trichter, in dem es kein Studio zu kaufen gibt.
 * Diese Sektion ist das Ziel, das dort gefehlt hat (`#kontakt`).
 *
 * BEWUSST KEIN FORMULAR. Die Landing-Site hat KEIN `NUXT_SMTP_*` (nachgemessen
 * 2026-08-09) — ein Formular nähme die Anfrage entgegen und verwürfe sie
 * still, und genau das ist die F44-Falle („eine fehlende Env-Variable wird
 * nicht rot"): die Seite sähe funktionsfähig aus, während jede Anfrage ins
 * Leere ginge. Ein `mailto:` kann das nicht — es öffnet das Postfach des
 * Besuchers, und ob die Mail rausgeht, sieht er selbst. Sobald `NUXT_SMTP_*`
 * auf dieser Site liegt, kann ein Formular hier andocken (Route + `sendMail()`
 * aus dem Core); bis dahin ist der direkte Weg der ehrliche.
 *
 * DIE ADRESSE STEHT IM CODE, NICHT IN i18n. Zwei Gründe: sie ist in beiden
 * Sprachen dieselbe (wie die Theme-Namen), und `@` ist in vue-i18n ein
 * Sonderzeichen für verknüpfte Meldungen — in einem Message-WERT müsste sie
 * als {'@'} maskiert werden. Übersetzt wird nur der BETREFF.
 *
 * TON: `tone-ink`, also derselbe dunkelwarme Peak wie der Abschluss-CTA und der
 * Fuß. Die Kette aus marketing.css endet auf ink; eine hellere Fläche hier
 * risse das Band zwischen CTA und Fuß auf (§6.3 „das Licht hellt monoton auf").
 */
const { t } = useI18n()

/** Das Postfach hinter dem Studio-Angebot. */
const CONTACT_MAIL = 'mail@davidschubert.com'

/** Mit vorbelegtem Betreff, damit die Anfrage im Postfach sofort einsortiert ist. */
const mailHref = computed(
  () => `mailto:${CONTACT_MAIL}?subject=${encodeURIComponent(t('marketing.contact.mailSubject'))}`,
)
</script>

<template>
  <section id="kontakt" class="mkt-section contact-section tone-ink">
    <div class="mkt-inner mkt-narrow contact-inner" data-reveal>
      <p class="mkt-kicker">{{ t('marketing.contact.kicker') }}</p>
      <h2 class="mkt-h2">{{ t('marketing.contact.title') }}</h2>
      <p class="mkt-lead">{{ t('marketing.contact.lead') }}</p>

      <UButton
        :to="mailHref"
        color="primary"
        size="xl"
        icon="i-ph-envelope-simple"
        class="mt-7"
      >
        {{ t('marketing.contact.cta') }}
      </UButton>

      <!-- Die Adresse zusätzlich als Text: wer lieber im eigenen Programm
           schreibt (oder wem kein Mail-Programm eingerichtet ist), soll sie
           kopieren können statt auf einen Knopf angewiesen zu sein. -->
      <p class="contact-address">
        {{ t('marketing.contact.addressLabel') }}
        <a :href="`mailto:${CONTACT_MAIL}`" class="contact-mail">{{ CONTACT_MAIL }}</a>
      </p>

      <p class="contact-note">{{ t('marketing.contact.note') }}</p>
    </div>
  </section>
</template>

<style scoped>
.contact-inner { text-align: center; }
.contact-inner .mkt-lead { margin-inline: auto; }

/*
 * Der Kicker steht hier auf dem DUNKLEN Band. `.mkt-kicker` färbt sich in
 * marketing.css mit `--ui-color-primary-600` — im Hellmodus ist das puka-800
 * (dunkles Orange) und auf `--puka-deep` nicht lesbar. Deshalb dieselbe Farbe,
 * die Abschluss-CTA und Fuß auf `tone-ink` schon benutzen. Als CSS-Regel und
 * nicht als `text-primary`-Utility: marketing.css ist UNGESCHICHTET und schlägt
 * jede Tailwind-Utility aus @layer (dieselbe Falle wie bei `.mkt-inner`).
 */
.contact-section .mkt-kicker { color: var(--ui-primary); }

.contact-address {
  margin-top: 1.4rem;
  font-size: var(--text-base);
  color: hsl(var(--puka-onink) / 0.8);
}
.contact-mail {
  font-weight: 600;
  color: hsl(var(--puka-onink));
  text-decoration: underline;
  text-underline-offset: 0.2em;
}
.contact-mail:hover { color: var(--ui-primary); }

.contact-note {
  margin-top: 0.6rem;
  font-size: var(--text-sm);
  color: hsl(var(--puka-onink) / 0.6);
}
</style>
