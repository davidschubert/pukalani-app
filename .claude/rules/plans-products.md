---
paths:
  - "packages/billing/**"
  - "packages/control/**"
  - "**/product.manifest.ts"
  - "**/site.manifest.ts"
  - "**/tenantPlan*"
  - "scripts/stripe/**"
  - "packages/core/server/utils/requirePlanProduct*"
---
<!-- Ausgelagert aus CLAUDE.md am 2026-11-08 (Token-Hygiene, SH1 e): lädt
     automatisch, sobald eine Datei aus `paths` gelesen wird; bei Bash-Lesen
     (cat/sed) diese Datei bewusst per Read öffnen. Wortlaut unverändert. -->

## Pläne & Produkte (P4-Rename 2026-07-26, Davids Pricing-Entscheid)
- Pool-Pläne heißen **basic / personal / pro** (vorher free/pro/business —
  normalizeTenantPlan() mappt Altwerte; Daten sind migriert). Enterprise ist
  KEIN Plan-Key: das ist das Silo-/Pukalani-Studio-Angebot. Preise: Personal
  29 €, Pro 149 €, jährlich −25 % (scripts/stripe/ensure-prices.mjs — zieht
  lookup_keys bei Betragsänderung auf neue Prices um).
- `basic` IST KEIN ANGEBOT MEHR, sondern der Zustand ohne Abo (F49, Davids
  Entscheidung 2026-08-07): ohne bezahltes Abo ist eine Community NUR-LESEND
  (M13-`billing`-Sperre) — nach der Testphase (trialSweep, rückwirkend auch
  Bestand), nach Kündigung (free-fallback SETZT die Sperre) und bei Verzug
  (unverändert 14 Tage). `plan: 'basic'` bleibt als Quota-Anker gesetzt.
  `shouldLiftBillingSuspension` hebt NUR bei `billingStatus === 'active'` auf
  (`!== 'past_due'` wäre der Gegenspieler der neuen Sperren); der Kauf öffnet
  im selben Webhook-Schreibvorgang, abuse-Sperren bleiben immer unangetastet.
  Preisseite www zeigt nur Personal + Pro (+ Enterprise-Kontakt); „kostenlos"
  ist das MITMACHEN (Konto), nie die eigene Community. Betreiber-Ausweg für
  Einzelfälle: `trialEndsAt` in die Zukunft setzen (der Sweep sperrt sonst
  binnen einer Stunde erneut, eine Betreiber-Entsperrung allein hält nicht).
- EIN Wort: „**Produkte**"/`products` — Kundensprache UND Code (E11, 2026-07-30;
  hebt die P4-Zeile „im CODE bleibt features" bewusst auf). product.manifest.ts,
  productKey, productGates, app_config.products, product_catalog,
  /api/platform/products. Das ZUSAMMENZIEHEN ist DURCH (control-025 inkl.
  idx_site_product, system-024, courses-004): alte Spalten/Tabellen und alle
  Übergangs-Spiegel/Aliasse sind entfernt — es gibt nur noch die
  product-Namen. AUSNAHMEN (bleiben `feature`): `featured` („hervorgehoben"),
  UPageFeature (Nuxt UI), Changelog-Kategorie `feature` (= „Neuerung",
  Daten-Wert), Migrations-Dateien (Protokoll).
- Produkt-Gating im Pool: pukalani.tenancy.products (Produkt-Key → Mindest-Plan,
  Plan-Ordnung = Reihenfolge der quota.plans-Keys) + requirePlanProduct(event,
  key) an den API-Einstiegen (posts = personal, ai = pro; 404 wie Datentür).
  UI-Sichtbarkeit via useTenantPlan().planAllows(); Demo-Hosts zeigen
  PlatformPlanBadge („Ab Personal/Pro") an den Produkten.
- TESTPHASE EINMAL JE KONTO (BE-015, seit 2026-11-16 — Davids Entscheidung
  „einmal je Person"): die Person ist das KONTO (Projekt + Konto-Id), nicht die
  Community. Festgehalten in `trial_claims` im Control Plane (control-039,
  keine Rechte für Konten): EINE Zeile je Konto mit fester Kennung
  (`trialClaimRowId`), das ANLEGEN ist die Vergabe (201 = Testphase, 409 = gab
  es schon) — kein „erst lesen, dann schreiben" (`claimTrial`,
  `packages/control/server/utils/trialClaims.ts`). Die Zeile hängt an keiner
  Community und überlebt Stilllegen und Löschen; sie fällt mit dem Konto
  (Auskunft und Löschung im control-Layer). Die ERSTE Community eines Kontos
  bekommt 14 Tage Pro, JEDE WEITERE entsteht ohne Testphase: `plan: 'basic'`,
  kein `trialEndsAt`, Sperre `billing` — ein Kauf öffnet sie sofort
  (unveränderter `apply-plan`-Weg). Scheitert die Anlage nach der Vergabe,
  geht die Vergabe zurück. Der Wizard sagt es VOR dem Klick
  (`GET /api/onboarding/trial`). ANLEGEN VERLANGT EINE BESTÄTIGTE ADRESSE
  (403 `email_unverified`) — sonst wäre „einmal je Konto" mit einer zweiten
  Adresse umgangen. Betreiber-Ausweg im Einzelfall: `trialEndsAt` setzen oder
  die Zeile des Kontos löschen. Bestand: jedes Konto mit einer Owner-Zeile gilt
  als „verbraucht" (`backfill-trial-claims.mjs`, zählt ohne `--apply` nur).
- EIGENE DOMAIN: EINE REGEL, WER DARF (BE-014 und Übergangsregel SEC-022, seit
  2026-11-16 — Davids Entscheidungen): `customDomainEntitlement(row, now)`
  (`packages/control/shared/customDomain.ts`) — Plan Pro UND nicht in der
  Testphase UND vom Betreiber freigegeben (`communities.customDomainApproved`,
  Schalter in der Betreiber-Tabelle, Eintrag im Protokoll). Sie gilt beim
  Eintragen, Prüfen, Freischalten und Wieder-Einschalten (403
  `plan_required` | `trial_not_included` | `approval_required`); Lesen und
  Entfernen gehen immer. Eine NEUE Stelle, die über eine eigene Domain
  entscheidet, fragt DIESE Funktion, nie den Plan allein. Zustand `paused` =
  abgeschaltet: nichts wird gelöscht, die Community antwortet unter ihrer
  Pukalani-Adresse, die eigene Domain leitet vorübergehend dorthin (302/307).
  Dorthin kommt eine Domain durch den Entzug der Freigabe (sofort) oder 14
  Tage nach dem Plan-Ende (Lauf `custom-domain-sweep`, Schalter
  `pukalani.control.customDomainSweep`: `dry-run` zählt nur, `apply`
  schreibt; zwei Hinweise an den Owner über `custom-domain-notice` in der
  Platform-App, je genau einmal). „Vergeben" ist eine Domain nur mit
  bestandenem Nachweis; ein bloßer Eintrag blockiert niemanden und verfällt
  nach 14 Tagen. Runbook: docs/runbooks/EIGENE-DOMAIN-FREIGABE.md, Bau:
  docs/referenz/EIGENE-DOMAIN.md.
- STRIPE-EINGANG LIEST FRISCH (BE-016, seit 2026-11-16): JEDES Abo-Ereignis
  (`customer.subscription.*`, `checkout.session.*`, `invoice.*`) holt den
  Stand mit `subscriptions.retrieve` — der Schnappschuss im Ereignis gilt nur
  für `deleted`, wenn Stripe das Abo nicht mehr kennt. Damit spielt die
  Reihenfolge der Zustellung keine Rolle; ein neuer Zweig im Webhook
  übernimmt NIE das Objekt aus dem Ereignis. Die API-Version steht an EINER
  Stelle (`packages/billing/shared/stripeApiVersion.ts`) und geht an jeden
  Client und an das Anlegen des Endpunkts; ein Test hält sie gleich der
  Version des installierten SDK (SDK-Sprung ⇒ Konstante bewusst nachziehen,
  Endpunkt über /dashboard/stripe neu anlegen — die Statuskarte zeigt eine
  abweichende Version).
