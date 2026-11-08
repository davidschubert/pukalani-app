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
