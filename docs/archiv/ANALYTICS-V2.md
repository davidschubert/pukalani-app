# Analytics v2 — Plan (Pakete 1–4 GEBAUT, nur 5/Optionales offen)

> **Archiviert am 2026-11-21 (Q19).** Die Pakete 1 bis 4 sind gebaut, der Rest (F47) ist seit dem 2026-08-15 geschlossen (Eintrag in [OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md)).
> Dieses Dokument ist Protokoll, keine Arbeitsliste.

Stand: 2026-08-04. Die v1 UND die Pakete 1+2 dieses Plans sind live —
Einträge mit Beweisen in [OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md).
Offen geführt wird der Rest (3–5) als **F47** in
[OPEN-ITEMS.md](../OPEN-ITEMS.md).

**Architektur-Pivot bei Paket 1 (Davids Entscheidung 2026-08-04):** die
Sites-API ist in der Plausible CE NICHT enthalten (Enterprise-only, am
Quellcode von v3.2.1 verifiziert — `on_ee`-Block im Router). Statt
Site-Automatik per API: **Sammel-Site + Hostname-Filter** — alle
Pool-Communities tracken in EINE Site `communities.pukalani.app`
(Script-Id `pa-nw6c94JiRWqzOc-zDcn1a`), „Aktivieren" ist ein Schalter in
`analytics_settings.enabled` (Migration analytics-002), und die Stats-Route
filtert je Community nach `event:hostname`. Eine eigene Plausible-Site (BYO,
das v1-Feld) bleibt als „Erweitert"-Option und gewinnt über den Schalter.
Stats-API-Key „pukalani-stats" liegt server-only als
`NUXT_ANALYTICS_STATS_API_KEY` in den drei Site-Envs (ops:site-env-Pflicht).

## Ehrliche Lücken der v1 (warum es eine v2 braucht)

1. **Der Weg zur Script-Id ist nicht wirklich Self-Service.** Die Registrierung
   auf plausible.hawaii.studio ist zu (richtig so) — heute legt David die Site
   an und gibt dem Kunden die Id. Das Formular macht nur den Rest.
2. **Zahlen sieht der Owner nur in Plausible** — wo er kein Konto hat. Die
   Messung läuft, ihren Wert sieht der Kunde nicht.
3. **Kein Status-Feedback** auf `/dashboard/analytics`: kein „misst seit …" /
   „noch keine Daten" — ein Tippfehler in der Id fällt nicht auf.
4. Kein Adblock-Proxy, kein Hilfe-Artikel, keine Bewerbung, Datenschutztexte
   erwähnen Analytics nicht (hängt an A1, echte Rechtstexte).

## Die Pakete — in dieser Reihenfolge, jedes macht das vorige erst wertvoll

### 1. Site-Automatik (Aufwand M) — der Gamechanger
„Aktivieren"-Knopf statt Id-Feld: die Plattform legt die Plausible-Site per
Sites-/Provisioning-API selbst an (Site-Name = Community-Host) und speichert
die Script-Id automatisch. Der Owner sieht Plausible nie.
- **Vorab klären (erster Schritt):** vergibt die CE die nötigen
  API-Key-Scopes (`sites:provision:*`) ohne Konsolen-Trick? Cloud-seitig ist
  die Sites-API Enterprise — self-hosted CE muss nachgemessen werden.
- Host-Wechsel/Custom-Domain einer Community ⇒ Site-Domain mitziehen.
- Stilllegung (C16 `disabled`) braucht nichts: der Host antwortet 404,
  es kommt schlicht nichts mehr an.

### 2. Zahlen im Dashboard (Aufwand M)
Kacheln auf `/dashboard/analytics` über die Stats-API (`POST /api/v2/query`,
server-seitiger API-Key, NIE an den Client; Microcache): Besucher +
Seitenaufrufe 30 Tage, Verlaufskurve, Top-Seiten, Quellen. Löst Davids
ursprüngliche Frage („Analytics-Daten im Dashboard der jeweiligen Website")
ein. Nebenbei fällt Lücke 3 ab: „zuletzt gemessen: vor N Minuten".
- Zwischenschritt, falls schneller gewünscht: Shared-Link-iframe-Embed —
  weniger schön, ein Nachmittag.

### 3. Bewerbung (Aufwand S, Texte MIT David)
Landing-Produktseite `/products/analytics` (+ `/de/produkte/analytics`),
Pricing-Highlight „Besucherstatistik ohne Cookies", Demo-Badge „Ab Personal"
(PlatformPlanBadge). Erst nach 1+2 — dann bewirbt man ein rundes Produkt.

### 4. Hilfe + Recht (Aufwand S)
Hilfe-Artikel in apps/help (de/en); ein Satz zu Plausible in den
Datenschutz-Vorlagen der Communities (gemeinsam mit A1 abarbeiten).

### 5. Optional (je nach Lust, unpriorisiert)
- **Adblock-Proxy**: Script + `/api/event` über den eigenen Community-Host
  proxyen (offiziell dokumentiert, „Bypass adblockers") — spürbar genauere
  Zahlen, etwas nginx-/Nitro-Arbeit.
- ~~**Vordefinierte Events/Goals** der Plattform~~ → als **U18** vorgezogen
  und gebaut, siehe den Abschnitt „Trichter-Ereignisse" unten.
- **Plausible-E-Mail-Reports** (weekly/monthly) je Site aktivieren.

## Grobe Rechnung
Pakete 1+2 zusammen ≈ ein solides Wochenpaket · 3+4 ≈ ein Nachmittag plus
Text-Abnahme · 5 nach Bedarf.

---

## Trichter-Ereignisse (U18, gebaut 2026-08-10)

Damit die UX-Pakete U1–U4 einen Vorher-Wert haben, meldet der Anmelde-Trichter
jetzt sieben benannte Ereignisse. Sie sind **Custom Events**; die **Goals**
dazu legt David in der Plausible-Oberfläche je Site von Hand an (die CE hat
keine Sites-API — s. o.). Der Name muss dabei WÖRTLICH übereinstimmen.

**Wie es misst:** `useFunnelEvent()` (`packages/core/app/composables/`) ruft
ausschließlich das `plausible()` des schon eingebundenen Scripts auf. Kein
eigener Transport, kein eigener `fetch` — was das doppelte Gate aus
`core/app/plugins/analytics.ts` (`pukalani.analytics.enabled` + ggf.
`pukalani.consent`) nicht geladen hat, meldet auch nichts. Fehlt das Script,
tut der Helfer still gar nichts. Die Namensliste steht einmal in
`packages/core/shared/funnelEvents.ts` und ist per Unit-Test festgenagelt.

| Ereignis | Feuert bei | Datei | Empfangende Site |
| --- | --- | --- | --- |
| `funnel_cta_start` | Klick auf den Haupt-CTA („Kostenlos starten") in Hero **oder** Kopfleiste | `apps/marketing/app/components/HeroSection.vue`, `MarketingHeader.vue` | `pukalani.app` |
| `funnel_cta_plan` | Klick auf den CTA einer Preiskarte — Eigenschaft `plan` = `personal` \| `pro` | `apps/marketing/app/components/PricingSection.vue` | `pukalani.app` |
| `funnel_register_done` | Registrierung erfolgreich (Passwort **und** Code-Weg), nur auf Kontroll-Hosts | `packages/core/app/components/auth/RegisterForm.vue`, `OtpLoginForm.vue` | *(noch keine — s. u.)* |
| `funnel_gate_no_code` | Die Code-Wand `/start` ohne Code im Link erreicht | `packages/onboarding/app/pages/start/index.vue` | *(noch keine)* |
| `funnel_code_redeemed` | Einladungs-Code erfolgreich geprüft | `packages/onboarding/app/pages/start/index.vue` | *(noch keine)* |
| `funnel_site_created` | Wizard durch, Community angelegt (beim Anlegen, nicht auf `/start/done`) | `packages/onboarding/app/pages/start/community.vue` | *(noch keine)* |
| `funnel_request_submitted` | Zugangs-Anfrage vom Server angenommen | `packages/onboarding/app/pages/anfragen.vue` | *(noch keine)* |

**Offene Voraussetzung — die Kontroll-Hosts messen heute gar nichts.**
`apps/platform` bindet das Plausible-Script bewusst nur über die
Selbstbedienung ein (`instance` ohne `src`), und `GET /api/analytics/config`
antwortet auf einem Kontroll-Host per Entwurf leer (`event.context.controlCenter`
⇒ `EMPTY`, sonst käme dort die Id einer fremden Community heraus). Auf
`my.pukalani.app` und `start.pukalani.app` gibt es also kein `window.plausible`
— die fünf Ereignisse des Kundenbereichs laufen ins Leere, bis eine eigene
Plausible-Site dafür existiert. Die zwei Marketing-Ereignisse messen sofort.

Zwei Wege, wenn die fünf Zahlen gebraucht werden (beide brauchen David):
1. **Eigene Site** `my.pukalani.app` in Plausible anlegen und ihre Script-Id
   auf den Kontroll-Hosts ausliefern (eine Fallunterscheidung in
   `packages/analytics/server/api/analytics/config.get.ts` statt des heutigen
   `EMPTY`). Sauberste Trennung, ein Handgriff mehr.
2. **Sammel-Site mitbenutzen** (`communities.pukalani.app`): die Zahlen je
   Community bleiben trotzdem sauber, weil die Stats-Route ohnehin auf
   `event:hostname` filtert und `my.`/`start.` zu keiner Community gehören.
   Kostet keine neue Site, mischt aber die Gesamtsumme dieser Site.
