---
paths:
  - "packages/billing/**"
  - "packages/control/**"
  - "**/product.manifest.ts"
  - "**/site.manifest.ts"
  - "**/tenantPlan*"
  - "packages/core/app/composables/useTenantPlan*"
  - "scripts/stripe/**"
---

## Pläne & Produkte (P4, Davids Pricing-Entscheid)
- Pool-Pläne heißen **basic / personal / pro**; `normalizeTenantPlan()` mappt
  Altwerte. Enterprise ist KEIN Plan-Key: das ist das Silo-/Studio-Angebot.
  Preise: Personal 29 €, Pro 149 €, jährlich −25 % — Beträge und lookup_keys
  stehen in `packages/control/shared/stripePriceCatalog.ts`;
  `scripts/stripe/ensure-prices.mjs` zieht die lookup_keys bei
  Betragsänderung auf neue Prices um.
- `basic` IST KEIN ANGEBOT, sondern der Zustand ohne Abo (F49, Davids
  Entscheidung): ohne bezahltes Abo ist eine Community NUR-LESEND
  (M13-`billing`-Sperre) — nach der Testphase (trialSweep, auch Bestand), nach
  Kündigung (free-fallback SETZT die Sperre) und bei Verzug (nach
  `PAST_DUE_GRACE_DAYS`). `plan: 'basic'` bleibt als Quota-Anker gesetzt.
  `shouldLiftBillingSuspension` hebt NUR bei `billingStatus === 'active'` auf
  (`!== 'past_due'` wäre der Gegenspieler der Sperren); der Kauf öffnet im
  selben Webhook-Schreibvorgang, abuse-Sperren bleiben immer unangetastet.
  Preisseite zeigt nur Personal + Pro (+ Enterprise-Kontakt); „kostenlos" ist
  das MITMACHEN (Konto), nie die eigene Community. Betreiber-Ausweg im
  Einzelfall: `trialEndsAt` in die Zukunft setzen (der stündliche Sweep sperrt
  sonst erneut, eine Entsperrung allein hält nicht).
- EIN Wort: „**Produkte**"/`products` — Kundensprache UND Code (E11):
  product.manifest.ts, productKey, productGates, app_config.products,
  product_catalog, /api/platform/products. Es gibt nur noch die product-Namen,
  keine alten Spalten, Tabellen oder Aliasse. AUSNAHMEN (bleiben `feature`):
  `featured` („hervorgehoben"), UPageFeature (Nuxt UI), Changelog-Kategorie
  `feature` (Daten-Wert), Migrations-Dateien (Protokoll).
- PRODUKT-GATING im Pool: `pukalani.tenancy.products` (Produkt-Key →
  Mindest-Plan; die Zuordnung IST `apps/platform/app/app.config.ts`;
  Plan-Ordnung = Reihenfolge der quota.plans-Keys) + `requirePlanProduct(event,
  key)` (`packages/core/server/utils/tenantPlanProducts.ts`) an den
  API-Einstiegen — 404 wie die Datentür. UI-Sichtbarkeit via
  `useTenantPlan().planAllows()`; Demo-Hosts zeigen `CorePlanBadge`
  („Ab Personal/Pro", `packages/core/app/components/core/PlanBadge.vue`) an den
  Produkten.
- TESTPHASE EINMAL JE KONTO (BE-015, Davids Entscheidung): die Person ist das
  KONTO (Projekt + Konto-Id), nicht die Community. Festgehalten in
  `trial_claims` im Control Plane (control-039, keine Rechte für Konten): EINE
  Zeile je Konto mit fester Kennung (`trialClaimRowId`), das ANLEGEN ist die
  Vergabe (201 = Testphase, 409 = gab es schon) — kein „erst lesen, dann
  schreiben" (`claimTrial`, `packages/control/server/utils/trialClaims.ts`).
  Die Zeile hängt an keiner Community, überlebt Stilllegen und Löschen und
  fällt mit dem Konto (Auskunft und Löschung im control-Layer). Die ERSTE
  Community eines Kontos bekommt `TRIAL_DAYS` Pro, JEDE WEITERE entsteht ohne
  Testphase: `plan: 'basic'`, kein `trialEndsAt`, Sperre `billing` — ein Kauf
  öffnet sie sofort (`apply-plan`-Weg). Scheitert die Anlage nach der Vergabe,
  geht die Vergabe zurück. Der Wizard sagt es VOR dem Klick
  (`GET /api/onboarding/trial`). ANLEGEN VERLANGT EINE BESTÄTIGTE ADRESSE (403
  `email_unverified`) — sonst wäre „einmal je Konto" mit einer zweiten Adresse
  umgangen. Betreiber-Ausweg: `trialEndsAt` setzen oder die Zeile des Kontos
  löschen. Bestand: jedes Konto mit einer Owner-Zeile gilt als verbraucht
  (`packages/control/scripts/backfill-trial-claims.mjs`, ohne `--apply` nur
  zählen).
- EIGENE DOMAIN, EINE REGEL, WER DARF (BE-014, SEC-022, Davids Entscheidungen):
  `customDomainEntitlement(row, now)` (`packages/control/shared/customDomain.ts`)
  — Plan Pro UND nicht in der Testphase UND vom Betreiber freigegeben
  (`communities.customDomainApproved`, Schalter in der Betreiber-Tabelle,
  Eintrag im Protokoll). Die FREIGABE-PFLICHT ENTFÄLLT (PK1 K6) nur mit
  `approvalWaived` aus `customDomainApprovalWaived()`
  (`control/server/utils/customDomainApprovalWaiver.ts`): Konsole auf `write`
  mit Schlüssel UND Platform bestätigt `write` über `/api/health`, sonst
  bleibt sie (fail-closed); die Testphase bleibt immer gesperrt. Sie gilt beim Eintragen, Prüfen, Freischalten und
  Wieder-Einschalten (403 `plan_required` | `trial_not_included` |
  `approval_required`); Lesen und Entfernen gehen immer. Eine NEUE Stelle, die
  über eine eigene Domain entscheidet, fragt DIESE Funktion, nie den Plan
  allein. Zustand `paused` = abgeschaltet: nichts wird gelöscht, die Community
  antwortet unter ihrer Pukalani-Adresse, die eigene Domain leitet
  vorübergehend dorthin (302/307). Dorthin kommt eine Domain durch den Entzug
  der Freigabe (sofort) oder `CUSTOM_DOMAIN_GRACE_DAYS` nach dem Plan-Ende (Lauf
  `custom-domain-sweep`, Schalter `pukalani.control.customDomainSweep`: `off` |
  `dry-run` zählt nur | `apply` schreibt; zwei Hinweise an den Owner über
  `custom-domain-notice` in der Platform-App, je genau einmal). „Vergeben" ist
  eine Domain nur mit bestandenem Nachweis; ein bloßer Eintrag blockiert
  niemanden und verfällt nach `CUSTOM_DOMAIN_CLAIM_DAYS`. Runbook:
  `docs/runbooks/EIGENE-DOMAIN-FREIGABE.md`, Bau: `docs/referenz/EIGENE-DOMAIN.md`.
- STRIPE-EINGANG LIEST FRISCH (BE-016): JEDES Abo-Ereignis
  (`customer.subscription.*`, `checkout.session.*`, `invoice.*`) holt den Stand
  mit `subscriptions.retrieve` — der Schnappschuss im Ereignis gilt nur für
  `deleted`, wenn Stripe das Abo nicht mehr kennt. Ein neuer Zweig im Webhook
  übernimmt NIE das Objekt aus dem Ereignis. Die API-Version steht an EINER
  Stelle (`packages/billing/shared/stripeApiVersion.ts`) und geht an jeden
  Client und an das Anlegen des Endpunkts; ein Test hält sie gleich der Version
  des installierten SDK (SDK-Sprung ⇒ Konstante bewusst nachziehen, Endpunkt
  über `/dashboard/stripe` neu anlegen — die Statuskarte zeigt eine abweichende
  Version).
