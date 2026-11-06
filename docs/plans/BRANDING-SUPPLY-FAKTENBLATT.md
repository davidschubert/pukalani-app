# Faktenblatt branding.supply — für den Rechtstext-Generator und den Anwalt

Stand: **2026-09-08** (Zeile 13 und §3 „Webanalyse" nachgezogen: Reichweitenmessung ist
beschlossen; **Lücken 9 und 11 geschlossen** — Generator = activeMind, Kundenkreis = B2B) ·
Paket **BS1 R2** (Baubefund 1 mit **R1b** geschlossen), Entscheidungen 2, 3 und 9 in
[BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md) §9.

**Wozu dieses Blatt.** David bedient den Rechtstext-Generator selbst
(Entscheidung 2); ein Generator fragt aber nur nach dem, was er kennt —
Hosting, Cookies, Newsletter, Kontaktformular. Was branding.supply
BESONDERS macht (Kundentexte an ein Sprachmodell, Abruf fremder Websites,
öffentliche Bewertung fremder Marken), fragt er nicht. Dieses Blatt liefert
beides: die Antworten für die Generator-Maske (§3) und die drei Abschnitte,
die kein Generator kennt, als fertigen Entwurf de/en (§4).

**Dies ist keine Rechtsberatung.** Jede Einordnung hier ist eine
*Laien-Einschätzung* und mündet in eine Frage an den Anwalt (§6). Die drei
Abschnitte in §4 sind **Vorlage und Prüfpunkt**, kein fertiger Text.

**Belegregel.** Jede Tatsachenaussage trägt eine Belegstelle im Code oder in
einem Dokument. Was nicht belegbar ist, steht als **LÜCKE — David** (§7) und
wurde NICHT geraten — auch dann nicht, wenn eine plausible Antwort naheliegt.

---

## 1. Steckbrief

| Feld | Antwort | Beleg |
| --- | --- | --- |
| **Anbieter (Name, Rechtsform, Anschrift)** | **LÜCKE — David.** Nicht aus dem Repo belegbar: die Rechtstexte von pukalani.studio leben als CMS-Zeilen auf der `portfolio`-Instanz, nicht im Code (`apps/portfolio/app/pages/[slug].vue` ist die Hülle des `pages`-Layers). Im Repo steht nur die **Vorlage** mit `[AUSFÜLLEN: …]`-Markern; die Marketing-Site sagt es sogar ausdrücklich: „Name, Anschrift und Rechtsform des Anbieters folgen mit den verbindlichen Texten." | `packages/pages/shared/legalTemplates.ts:62-79` · `apps/marketing/i18n/locales/de.json:789` |
| **Verantwortlicher sitzt** | in den **USA** (bei DACH-Ausrichtung) — daraus folgen Art. 27 DSGVO und die Umsatzsteuerfrage | Plan §3.5, §1.6 (a) |
| **Domain / Host** | `branding.supply` (+ `www.` → 301 auf den Apex), eigene ploi-Site **402929**, Server `app-prod` **49.13.211.173** (Hetzner CX23), App-Port 3007 | `docs/runbooks/BRANDING-SUPPLY-SETUP.md` §4/§5 · `docs/content/2.architektur/6.hosts-und-ports.md:16` |
| **Angebot in einem Absatz** | branding.supply ist eine **Werkstatt für Markenfundamente**: im Gespräch mit einem KI-Markenberater entstehen Purpose, Werte, Archetyp, Positionierung und Stimme als zusammenhängendes Dokument („Brand Foundation"); dazu ein **kostenloser Brand-Check**, der eine beliebige Website in Sekunden auf acht Kategorien misst und einen Brand Score 0–100 vergibt, und ein **Marktvergleich**, der bis zu fünf Wettbewerber-Websites liest und dem eigenen Fundament gegenüberstellt. Das Fundament ist frei, die Ableitung (Marktvergleich, später Book & Kit) wird bezahlt. | `apps/branding/site.manifest.ts` · Plan §3.2 · `docs/archiv/BRAND-CHECK.md`, `docs/archiv/BRAND-MARKTVERGLEICH.md` |
| **Betriebsstatus** | **Beta, Zugang nur auf Einladung** (`brandAdmissionMode: 'invite'`): Warteliste mit Double-Opt-in → Einladungscode (mail-gebunden, 30 Tage) → Konto. Öffentlich und ohne Konto erreichbar sind: Startseite, About, Team, Beispielseite, **Brand-Check + Ranking**, `/market-bot`. | `packages/brand/shared/brandAccess.ts` · `packages/system/scripts/migrations/038-brand-flags.ts` · Runbook §6 |
| **Sprachen** | **de + en**. EN ohne Präfix, DE unter `/de/*` (Monorepo-Konvention `prefix_except_default`) | `apps/branding/nuxt.config.ts` (i18n) · `packages/core/nuxt.config.ts:109-125` |
| **Zielgruppe / Kundenkreis** | Selbstständige und kleine Unternehmen im **DACH-Raum**. **Seit dem 2026-09-08 ausschliesslich B2B:** Kunden sind **nur Unternehmen und Selbstständige**, Verbraucher sind kein Kundenkreis (Davids Entscheidung). Folgen in §5 Nr. 8/9/13/14, §6 Block 2 und §7 Lücke 11 | Plan §9 Zeile 9 (die alte Formulierung „Verbraucher sind nicht ausgeschlossen" aus §3.5 ist damit überholt) |
| **Konten** | ja — E-Mail + Passwort mit Verifizierungs-Mail; „Anmelden mit Google" ist im Design-Schalter vorbereitet, erscheint aber erst mit Server-Env + Google-Client im Appwrite-Projekt | `apps/branding/app/app.config.ts` (`auth.providers`) · `docs/runbooks/GOOGLE-LOGIN.md` |
| **Bezahlung heute** | **keine.** Kein Stripe, kein `billing`-Layer, kein Preis im Produkt; der einzige Conversion-Weg zeigt derzeit auf das Erstgespräch von pukalani.studio | Plan §3.1 · `apps/branding/app/app.config.ts` (`completionCta`) |

---

## 2. Verarbeitungsverzeichnis (Vorarbeit — Rechtsgrundlagen sind KANDIDATEN)

Die Spalte „Rechtsgrundlage" ist ein **Kandidat, keine Feststellung**. Sie ist
die Vorarbeit für den Anwalt.

| # | Verarbeitung | Zweck | Datenarten | Betroffene | Empfänger / Auftragsverarbeiter | Drittland + Grundlage | Speicherdauer | Rechtsgrundlage (Kandidat) | Beleg |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Konto / Registrierung** | Zugang zur Beta und zur Werkstatt | E-Mail, Anzeigename, Passwort-Hash bzw. Google-Kennung, Registrierungszeitpunkt | Kunden | Appwrite self-hosted auf eigenem Server (Hetzner); **nur bei Google-Login** zusätzlich Google | USA nur bei Google-Login — **Grundlage LÜCKE** | bis Löschung des Kontos | Art. 6 I b | `docs/runbooks/BRANDING-SUPPLY-SETUP.md` §1 · `apps/branding/app/app.config.ts` |
| 2 | **Sitzungen + Standort** | Anmeldung halten, Sitzungsliste unter `/dashboard/settings/sessions` | IP-Adresse, User-Agent, **Land** (Appwrite-Session). **Stadt/Region NUR**, wenn `NUXT_GEO_CITY_DB_PATH` gesetzt ist — auf branding ist der Pfad heute **nicht gesetzt**, die Liste zeigt dort also nur das Land (und zwar ehrlich: `formatSessionLocation` fällt auf das Land zurück, nicht auf „Unbekannt"). Seit BS1 R1b ist er im Env-Wächter **Pflicht**, der Lauf am 2026-09-07 meldet ihn als fehlend — mit dem Setzen wird aus der Zeile „Land" ein „Stadt, Region · Land" | Kunden | keiner (lokale MMDB, kein Abruf nach außen) | — | bis Abmeldung bzw. Ablauf der Session | Art. 6 I b / f | `packages/core/server/utils/geoCity.ts:27,90` · `scripts/ops/verify-site-env.mjs:341-347` |
| 3 | **Wizard-Inhalte** | das Produkt selbst | Antworten, Gesprächsverlauf, Entwürfe, bestätigte Kapitel (`brand_profiles`, `brand_steps`, `brand_messages`, `brand_findings`) | Kunden | keiner (server-only Tabellen, `permissions: []`) | — | bis Löschung des Kontos oder des Brandings | Art. 6 I b | `packages/brand/scripts/migrations/001-003,011,014` |
| 4 | **KI-Verarbeitung von Kundentexten** | Entwürfe, Rückfragen, Prüfblick, Brand-Check-Urteil, Markt-Extraktion | alles, was der Kunde über seine Marke schreibt; Website-Text Dritter (PII-gefiltert) | Kunden; mittelbar fremde Website-Betreiber | **OpenRouter** als Router → Modellanbieter | **USA — Grundlage LÜCKE (AVV / SCC nicht geprüft)**. Technische Schutzmaßnahme belegt: `zdr: true` (nur Anbieter mit Zero-Data-Retention), `dataCollection: 'deny'`, `allowFallbacks: false` — bei Last lieber „gerade nicht verfügbar" als ein Anbieter außerhalb dieser Bedingungen | beim Anbieter laut ZDR keine Speicherung; **das Ergebnis bei uns dauerhaft** | Art. 6 I b | `packages/brand/server/utils/brandProviderRouting.ts` |
| 5 | **Abruf fremder Websites** | Brand-Check und Marktvergleich | öffentlich abrufbare Marketing-Texte; unser Abruf hinterlässt beim fremden Server **unsere IP und unseren Absender** | fremde Website-Betreiber | — | — | s. #6/#7 | Art. 6 I f | `packages/market/server/utils/marketFetch.ts` · `packages/brand/server/utils/brandSiteFetch.ts` |
| 6 | **Brand-Check (Score)** | kostenloser Einstieg + Marketing | geprüfte URL, acht Kategorie-Werte, 40 Kriterien mit Beleg (≤ 160 Zeichen), drei Befunde, `textHash`, **`ipHash`** (sha256 aus IP + täglich wechselndem Salz, ausschließlich für den 3/Tag-Deckel — die rohe IP wird nie geschrieben und nie geloggt) | Prüfende (auch ohne Konto); bewertete Marken | keiner außer #4 | s. #4 | **Ergebnis-Cache 7 Tage je URL**; Ranking-Eintrag bis Entfernen | Art. 6 I b (eigene Marke) / Art. 6 I f (fremde) | `packages/brand/scripts/migrations/016-brand-checks.ts` · `check.post.ts` |
| 6b | **Öffentliches Ranking + Korrekturvorschlag** | Sichtbarkeit + Gegenrecht | `rankingOptIn` (gesetzt vom **Prüfenden**), `hidden` (gesetzt vom **Betreiber** nach einem Entfernungswunsch); Korrekturvorschlag mit Feld, Vorschlag, Begründung und **freiwilliger** E-Mail | bewertete Marken; Melder | keiner | — | Vorschlag bis Bearbeitung; Ranking-Eintrag bis Entfernen | Art. 6 I f | `017-brand-check-ranking.ts` · `check/[id]/correction.post.ts` · `check/ranking.get.ts` |
| 7 | **Marktvergleich** | Vergleich der eigenen Marke gegen das Feld | Rohtext fremder Seiten (PII-gefiltert, gedeckelt), Marktprofile mit **Belegzitaten ≤ 200 Zeichen**, Quell-URL, Ausschlussgründe | fremde Website-Betreiber; Kunden | keiner außer #4 | s. #4 | **Rohtext ≤ 24 h** (Sweep alle 30 min, erster Lauf 45 s nach dem Start); **Marktprofil dauerhaft** | Art. 6 I f | `packages/market/server/utils/marketRawSweep.ts` · `server/plugins/raw-text-sweep.ts` |
| 8 | **Bibliothek** | Vergleichs-Maßstäbe ohne eigenen Lauf | Wortname und Kategorie fremder Marken, belegte Felder, Prüfdatum — **keine Logos, keine Bildmarken, keine Favicons** (als Erlaubnisliste im Beweis gesichert) | fremde Markeninhaber | keiner | — | dauerhaft, bis Entfernen | Art. 6 I f | `docs/archiv/BRAND-MARKTVERGLEICH.md` Anhang G |
| 9 | **Share-Links** | ein Ergebnis teilen | Token-**Hash** (sha256, der rohe Token steht nur im Link), eingefrorener Schnappschuss der bestätigten Kapitel — nie Chats, nie Entwürfe, nie Metriken | Kunden; Empfänger des Links | jeder, der den Link hat | — | **30 Tage** (`SHARE_TTL_MS`), Widerruf jederzeit; Erneuern = neue Zeile, alte gestempelt | Art. 6 I b | `packages/brand/server/api/brand/profiles/[id]/share.post.ts:80` · `004-brand-shares.ts` |
| 10 | **Mailversand** | Verifizierung, Einladung, Warteliste-Bestätigung, Betreiber-Meldung | E-Mail-Adresse, Mailinhalt | Kunden, Wartende | **SMTP-Anbieter laut Server-`.env`** — im Monorepo ist das durchgängig **Resend** (`smtp.resend.com`) | **LÜCKE — bestätigen, dass auch branding.supply Resend nutzt**; Drittland/AVV ungeprüft | Zustellprotokoll beim Anbieter | Art. 6 I b | `docs/runbooks/DEPLOYMENT.md:36,201` · `scripts/ops/verify-site-env.mjs:310-314` |
| 11 | **Warteliste** | Beta-Zugang vergeben | E-Mail (Original + kleingeschrieben), Status, Token-Hash, Bestätigungszeitpunkt | Interessenten | SMTP-Anbieter (#10) | s. #10 | bis Einladung oder Löschung; **unbestätigte Zeilen bleiben bewusst liegen** (Token nach 24 h wertlos), Löschung ist ein Handgriff des Betreibers | Art. 6 I a (Einwilligung, **Double-Opt-in**) | `012-brand-waitlist.ts:20-23` · `015-brand-waitlist-doi.ts` |
| 12 | **Betreiber-Ereignisse (Funnel)** | Messung des Trichters | Ereignistyp, Branding-Id, User-Id, kleine Nutzlast — **nie der getippte Text und nie die Antwort**; EINE benannte Ausnahme: `step.restarted` trägt den Slot-Text (≤ 4096 Zeichen) als Audit-Eintrag | Kunden | intern | — | **24 Monate ab dem Ereignis — seit BS1 R1b (2026-09-07) mit Mechanik:** Sweep täglich (erster Lauf 60 s nach dem Start), er LÖSCHT die Zeile; Frist als EINE Konstante `BRAND_EVENTS_RETENTION_MONTHS`. Bis dahin stand die Zahl nur als Kommentar in der Migration und war faktisch unbefristet | Art. 6 I f | `packages/brand/shared/brandEventsRetention.ts` · `packages/brand/server/utils/brandEventsSweep.ts` · `server/plugins/brand-events-sweep.ts` · `packages/brand/server/utils/brandEvents.ts:45-63` |
| 13 | **Reichweitenmessung** | Seitenaufrufe zählen (Davids Reichweiten-Ziel aus BI1) | **Seitenaufruf, Adresse, Verweisquelle, grobe Herkunft, Gerätetyp — kein Cookie, keine IP-Speicherung, keine Wiedererkennung über Besuche hinweg** | alle Besucher | **selbst gehostetes Plausible** unter `plausible.hawaii.studio` (eigener Server, kein fremder Anbieter) | — | Aggregat dauerhaft; kein Personenbezug, der zu löschen wäre | Art. 6 I f | **BESCHLOSSEN, NOCH NICHT EINGESCHALTET** (David, 2026-09-08 — [BRAND-INSIGHTS.md](BRAND-INSIGHTS.md) §11 Frage 3). Heute misst branding.supply nichts (Core-Default `analytics.enabled: false`, die App setzt nichts): `apps/branding/app/app.config.ts` · `packages/core/app/app.config.ts:223`. Eingeschaltet wird es als Paket **R2c**, **nach** dem Datenschutz-Abschnitt aus R2 — cookielos und ohne Banner, wie `apps/portfolio/app/app.config.ts` es für pukalani.studio fährt. **LÜCKE — David:** die neue Plausible-Site für `branding.supply` anlegen (die CE-Ausgabe hat keine Sites-API) ⇒ Script-Id `pa-…` |
| 14 | **Fehler-Telemetrie** | — | — | — | — | — | **aus.** `pukalani.observability` ist Core-Default `enabled: false` / `clientErrors: false` und wird von branding nicht gesetzt; `POST /api/telemetry/error` bekommt also nichts | — | `packages/core/app/app.config.ts:564-571` |
| 15 | **Server-Protokolle** | Betrieb, Sicherheit | nginx/ploi-Zugriffsprotokolle mit IP, Zeit, Adresse, Browserkennung | alle Besucher | Hetzner (Serverbetrieb), ploi.io (Verwaltung) | Server in Deutschland — **genauer Standort LÜCKE** | **offen — kein logrotate konfiguriert** (derselbe Befund wie für pukalani.app) | Art. 6 I f | Plan §1.2 Zeile 10 · `docs/runbooks/DEPLOYMENT.md` |
| 16 | **Backups** | Wiederherstellbarkeit | vollständige MariaDB-Dumps aller Appwrite-Projekte | alle Betroffenen | Hetzner **Storage Box `pukalani-backup`** (Offsite) | Standort und Aufbewahrungsdauer **LÜCKE** | LÜCKE | Art. 6 I f | `docs/runbooks/DEPLOYMENT.md:37-39` |
| 17 | **Auskunft, Export, Löschung** | Betroffenenrechte | alles zu einem Konto | Kunden | — | — | Löschung auf Wunsch | Art. 15/17 DSGVO | `packages/brand/server/utils/brandUserData.ts`, `packages/market/server/utils/marketUserData.ts` |
| 18 | **Zahlungsdaten** | — | — | — | **Stripe (geplant, Paket Z1)** | USA — offen | — | Art. 6 I b (künftig) | Plan §7 Z1, §9 Frage 4 |

**Zwei Eigenheiten von #17, die in den Text gehören:** Der automatische Export
und die automatische Löschung hängen an einer **User-Id**. `brand_waitlist` und
`brand_checks` tragen keine — dort ist die Löschung heute ein **Handgriff des
Betreibers in der Appwrite-Konsole**, und genau so sollte es die
Datenschutzerklärung sagen (`012-brand-waitlist.ts:20-23`,
`016-brand-checks.ts`). Und: **Einladungen werden anonymisiert, nicht gelöscht**
— die Zeile ist der Nachweis, dass ein Code ausgegeben wurde; aus der Adresse
wird `deleted@invalid` (`brandUserData.ts`).

**Was NICHT stattfindet** — gehört ausdrücklich in den Text, weil es Vertrauen
schafft und jede dieser Aussagen belegbar ist:

- kein Werbenetzwerk, kein Retargeting, kein Profiling zu Werbezwecken;
- **kein eingebetteter Drittinhalt** (keine YouTube-Videos, keine Karten, keine
  Social-Buttons, keine externen Kommentar-Widgets);
- **keine fremden Schriften** — Schriften sind selbst gehostet
  (`@nuxt/fonts`, build-prozessiert, nie aus `public/`),
  `packages/themes/nuxt.config.ts:13`;
- **kein Cookie-Banner**, weil es nichts einzuwilligen gibt: heute läuft gar
  keine Messung (`consent.enabled: false`, `analytics.enabled: false`), und die
  beschlossene Reichweitenmessung (Zeile 13) ist **cookielos** — sie ändert an
  dieser Aussage nichts, wohl aber am Datenschutz-Text, der sie nennen muss;
- **kein Training fremder Modelle mit Kundentexten** (`zdr`,
  `dataCollection: 'deny'`);
- **keine Personendaten aus fremden Websites**: Team-, Impressums-, Kontakt-,
  Datenschutz-, AGB-, Login-, Konto- und Warenkorb-Pfade werden **gar nicht
  erst geholt** (Pfad-Sperrliste), und was auf anderen Seiten übrig bleibt,
  läuft vor dem Modell durch einen PII-Filter (E-Mail, Telefon, Namensmuster
  nahe „Geschäftsführer/CEO/Gründer") — `packages/market/shared/marketPii.ts`,
  `marketCrawlRules.ts`.

---

## 3. Antworten für die typischen Generator-Fragen

Reihenfolge und Wortwahl orientieren sich an den Masken von eRecht24,
Datenschutz-Generator.de und activeMind. **Entschieden am 2026-09-08 (Plan §9
Zeile 2): die Erstfassung kommt von activeMind (kostenlos)**, der Wechsel auf
**eRecht24 Premium** folgt mit R3/Fassung 2 oder spätestens vor dem Öffnen der
Beta. **Bedingung des kostenlosen Wegs: activeMind verlangt eine Quellennennung
mit Link im Text** — am Generator selbst prüfen und einhalten, solange die
Erstfassung steht.

| Frage des Generators | Antwort für branding.supply |
| --- | --- |
| **Kundenkreis / Vertragspartner** | **Nur Unternehmen und Selbstständige (B2B).** Verbraucher sind kein Kundenkreis (Davids Entscheidung 2026-09-08, Plan §9 Zeile 9). Für die Maske heißt das: **kein Verbraucher-Widerruf**, **keine Verbraucherstreitbeilegung** (§ 36 VSBG entfällt inhaltlich; der Satz „wir nehmen an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle nicht teil" darf stehen bleiben), **Preise netto zzgl. USt**. Die Unternehmereigenschaft wird **bei der Registrierung per Häkchen bestätigt** und am Konto gespeichert (Paket **R1c**) — ob die Selbstauskunft trägt, ist Anwaltsfrage (§6 Block 2). |
| **Hosting-Anbieter** | Eigener Server bei **Hetzner**, verwaltet über **ploi.io**. Die Anwendung läuft auf `49.13.211.173`, die Datenbank (Appwrite, self-hosted) auf `188.245.61.155`. **Standort des Rechenzentrums: LÜCKE — David** (Hetzner betreibt Standorte in DE und FI; im Repo steht nur „Hetzner"). |
| **Content-Delivery-Network / Proxy** | **Keines.** `branding.supply` und `www.branding.supply` sind im DNS „grau" (nicht proxied) — der Browser spricht direkt mit unserem Server. Nur der fremde Apex `pukalani.app` läuft proxied über Cloudflare; branding.supply ist davon nicht berührt. Cloudflare ist damit — wenn die Zone dort liegt — **DNS-Dienst ohne Datenfluss**. *Belegt: „grau (nicht proxied)" im Runbook; **LÜCKE — David:** wo die Zone `branding.supply` verwaltet wird und wer Registrar ist.* |
| **Cookies — Liste** | (1) **`a_session_branding`** — Anmeldung; httpOnly, secure, sameSite; technisch notwendig; Laufzeit = Sitzungsdauer der Appwrite-Session. (2) **`i18n_redirected`** — merkt die gewählte Sprache. (3) **`pukalani-theme`**, **`pukalani-theme-variant`**, **`pukalani-neutral`** — Farbwelt/Variante/Grundton der Oberfläche, `maxAge` 365 Tage, `sameSite: 'lax'`. (4) Hell/Dunkel über `@nuxtjs/color-mode` (kommt mit Nuxt UI) — der Speicherort ist im Monorepo **nicht** konfiguriert, es gilt der Modul-Default; **kleine LÜCKE: vor Veröffentlichung im Browser nachsehen**. Alle genannten sind **notwendig oder reine Komforteinstellungen; keiner dient der Analyse oder Werbung.** |
| **Webanalyse / Statistik** | **Heute: findet nicht statt.** Kein Google Analytics, kein Matomo. **Beschlossen für die Fassung, die live geht** (David, 2026-09-08 — [BRAND-INSIGHTS.md](BRAND-INSIGHTS.md) §11 Frage 3): **selbst gehostetes Plausible** unter `plausible.hawaii.studio`, auf eigenem Server, **cookielos und ohne Banner** — dieselbe Einrichtung, die pukalani.studio schon fährt. Gemessen werden Seitenaufruf, Adresse, Verweisquelle, grobe Herkunft und Gerätetyp; **kein Cookie, keine IP-Speicherung, keine Wiedererkennung über Besuche hinweg**, deshalb keine Einwilligung nötig (Art. 6 I f) — **im Text aber ausdrücklich nennen**, samt Widerspruchsmöglichkeit. Reihenfolge: der Abschnitt steht, BEVOR das Script eingebunden wird (Paket R2c). |
| **Newsletter** | **Nein.** Es gibt eine **Warteliste** mit Double-Opt-in; sie dient ausschließlich der Vergabe von Beta-Zugängen, nicht dem Versand von Werbung. Wer bestätigt, bekommt eine Einladung — keine Serienmail. |
| **Kontaktformular** | Auf branding.supply selbst **derzeit keines**. Der Knopf „Erstgespräch" führt heute auf das Formular von **pukalani.studio** (mit Herkunftsvermerk `?source=branding-supply`). Dessen Felder: Ziele (Mehrfachauswahl), Projektart, Branche (frei, ≤ 200), Budget, Teamgröße, Markt (frei, ≤ 200), aktuelle Technik, Zeitrahmen, Nachricht (≤ 5000), **Name (Pflicht)**, **Firma (Pflicht)**, **E-Mail (Pflicht)**, Telefon (freiwillig, ≤ 40), Sprache. Eine eigene Seite auf branding.supply ist als Paket **Z0** geplant. |
| **Registrierung / Nutzerkonto** | **Ja.** E-Mail + Passwort mit Bestätigungs-Mail; Beta-Zugang nur mit Einladungscode. „Anmelden mit Google" ist vorbereitet, aber erst aktiv, wenn Server-Env und Google-Client gesetzt sind — **im Text nur erwähnen, wenn er live geht** (sonst steht dort eine Datenübermittlung an Google, die es nicht gibt). |
| **Zahlungsanbieter** | **Heute keiner.** Geplant: **Stripe** (Einmalpreis je Branding, Paket Z1) — mit Rechnung, Steuerberechnung und Kundenportal. Der Abschnitt gehört als **leerer, benannter Platz** vorgebaut, damit er später ein eingesetzter Satz ist und kein Umbau. |
| **KI-Dienste** | **Ja** — der Kern des Produkts. Router: **OpenRouter**; dahinter wechselnde Modellanbieter, **beschränkt auf solche mit Zero-Data-Retention**. Eingesetzt für: Gespräch und Entwürfe („George"), Prüfblick/Review, Urteil des Brand-Checks, Extraktion beim Marktvergleich. Drittland **USA**. Technische Zusagen: `zdr: true`, `dataCollection: 'deny'`, `allowFallbacks: false`. |
| **Social Media / Embeds** | **Nein.** Keine Buttons, keine Pixel, keine eingebetteten Inhalte. YouTube-Auswertung ist **geplant** (BI1) und dann eigens zu behandeln. |
| **Schriften** | **Selbst gehostet.** Keine Verbindung zu Google Fonts oder einem Font-CDN; `@nuxt/fonts` lädt die Dateien beim Build und liefert sie vom eigenen Server. |
| **Karten** | **Nein.** |
| **Bewertungen / Inhalte Dritter** | **Ja, und das ist der ungewöhnliche Teil**: der Brand-Check bewertet fremde Websites mit einem Score 0–100; mit Häkchen des Prüfenden erscheint das Ergebnis in einem **öffentlichen Ranking**; die **Bibliothek** zeigt Wortnamen und kurze Belegzitate fremder Marken. Dafür gibt es einen Korrekturweg und einen Entfernungsweg (§4c). |
| **Auftragsverarbeiter / Subprozessoren** | Hetzner (Server, Backups) · ploi.io (Server-Verwaltung) · OpenRouter und die dahinter tatsächlich zugelassenen Modellanbieter · der SMTP-Anbieter (voraussichtlich Resend) · **nur beim Google-Login** Google · **künftig** Stripe. Als eigener Abschnitt der Datenschutzerklärung führen. |
| **Betroffenenrechte / Löschung** | Konto-Löschung entfernt Brandings, Schritte, Nachrichten, Share-Links, Funnel-Ereignisse und die Marktvergleichs-Daten daran; Einladungen werden **anonymisiert** statt gelöscht. Warteliste und Brand-Check-Ergebnisse hängen an keiner User-Id und werden auf Anfrage **von Hand** entfernt. |

---

## 4. Die drei Sonderabschnitte — Textentwurf de/en

**Alle drei sind Prüfpunkte für den Anwalt** (Entscheidung 2). Sie sind
sachlich formuliert, ohne Rechtsberatung, und beschreiben ausschließlich, was
der Code belegbar tut.

### 4a. KI-Verarbeitung von Kundentexten

> **Verarbeitung durch ein Sprachmodell**
>
> Was Sie in der Werkstatt schreiben — Antworten im Gespräch, Notizen,
> Entwürfe —, wird zur Erzeugung Ihrer Ergebnisse an ein Sprachmodell
> übermittelt. Der Weg dorthin führt über den Vermittlungsdienst OpenRouter mit
> Sitz in den USA, der die Anfrage an einen Modellanbieter weiterreicht.
>
> Wir haben diesen Weg technisch eingeschränkt, und zwar bei jeder einzelnen
> Anfrage: Es werden ausschließlich Anbieter zugelassen, die sich zur
> **Nichtspeicherung der Anfrage verpflichtet haben** („Zero Data Retention"),
> und die Verwendung Ihrer Inhalte **zu Trainingszwecken ist untersagt**. Steht
> kein solcher Anbieter zur Verfügung, wird die Anfrage **nicht** an einen
> anderen weitergereicht, sondern schlägt fehl — die Funktion ist dann
> vorübergehend nicht verfügbar.
>
> Das Ergebnis der Verarbeitung (Ihr Entwurf, Ihre Bewertung) speichern wir bei
> uns, damit Sie damit weiterarbeiten können. Die Verarbeitung ist zur
> Erfüllung unseres Vertrags mit Ihnen erforderlich (Art. 6 Abs. 1 lit. b
> DSGVO). Bitte geben Sie in der Werkstatt keine besonderen Kategorien
> personenbezogener Daten und keine Daten Dritter ein, die dort nicht
> hingehören.
>
> *[PRÜFPUNKT ANWALT: Rolle bei dieser Verarbeitung (Verantwortlicher oder
> Auftragsverarbeitung), Grundlage der Drittlandsübermittlung, Notwendigkeit
> eines AVV mit Firmenkunden.]*

> **Processing by a language model**
>
> What you write in the workshop — answers in the conversation, notes, drafts —
> is sent to a language model in order to produce your results. It travels via
> the routing service OpenRouter, based in the USA, which forwards the request
> to a model provider.
>
> We have restricted this path technically, on every single request: only
> providers that commit to **not retaining the request** ("zero data
> retention") are permitted, and the use of your content **for training is
> denied**. If no such provider is available, the request is **not** handed to
> another one — it fails, and the feature is temporarily unavailable.
>
> We store the result of the processing (your draft, your score) so that you
> can keep working with it. The processing is necessary to perform our contract
> with you (Art. 6(1)(b) GDPR). Please do not enter special categories of
> personal data, or third-party data that does not belong there.
>
> *[LAWYER CHECKPOINT: controller vs. processor, basis for the transfer, DPA
> for business customers.]*

### 4b. Abruf fremder Websites

> **Abruf öffentlich zugänglicher Websites**
>
> Für den Brand-Check und den Marktvergleich rufen unsere Server öffentlich
> zugängliche Seiten der angegebenen Adresse ab. Dabei sieht der Server der
> abgerufenen Website — wie bei jedem Seitenaufruf — unsere IP-Adresse und
> unsere Absenderkennung. Es sind **zwei**, weil es zwei Vorgänge sind:
> `PukalaniBrandCheck/1.0 (+https://branding.supply/brand-check/methodik)` für
> den Brand-Check (eine Seite) und
> `PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)` für den
> Marktvergleich (mehrere Seiten). Unter beiden Adressen erklären wir dauerhaft,
> was wir lesen, was wir nicht lesen, wie lange wir es behalten und wie man uns
> aussperrt — jeden Vorgang einzeln.
>
> Wir halten uns dabei an folgende Regeln:
>
> - Wir lesen nur **öffentlich zugängliche Marketing-Seiten**. Keine
>   Login-Bereiche, keine Formulare, keine Downloads.
> - Wir werten **`robots.txt`** aus und halten uns daran — bei **beiden**
>   Vorgängen, und je Absenderkennung getrennt.
> - Wir respektieren maschinenlesbare **Nutzungsvorbehalte** für Text- und
>   Data-Mining (§ 44b UrhG) in den gängigen Formen: `TDM-Reservation`-Header,
>   `/.well-known/tdmrep.json`, `tdm-reservation`-Meta sowie `noai`/`noimageai`
>   in den robots-Metas. Liegt ein Vorbehalt vor, wird die Seite **nicht**
>   ausgewertet; der Nutzer erhält eine ehrliche Meldung.
> - **Seiten mit Personenbezug rufen wir gar nicht erst ab**: Team-,
>   Impressums-, Kontakt-, Datenschutz-, AGB-, Login-, Konto- und
>   Warenkorbseiten sind gesperrt.
> - Was auf den übrigen Seiten steht, durchläuft vor jeder weiteren
>   Verarbeitung einen **Filter für E-Mail-Adressen, Telefonnummern und
>   Personennamen**.
> - Der abgerufene **Rohtext wird höchstens 24 Stunden gespeichert** und danach
>   automatisch gelöscht. Was bleibt, ist eine strukturierte Zusammenfassung mit
>   **kurzen Belegzitaten (höchstens 200 Zeichen)** und der Quelladresse.
>
> Rechtsgrundlage ist unser berechtigtes Interesse an einer belegten
> Marktbetrachtung (Art. 6 Abs. 1 lit. f DSGVO). Betreiber, die nicht gelesen
> werden möchten, sperren uns über `robots.txt` aus oder schreiben uns an.
>
> *[PRÜFPUNKT ANWALT: Bindungswirkung der Bot-Seite; Reichweite von § 44b UrhG
> bei einmaliger Auswertung ohne Training; Zitatzweck bei mehreren Zitaten
> derselben Quelle.]*

> **Retrieval of publicly available websites**
>
> For the brand check and the market comparison, our servers retrieve publicly
> available pages of the address you provide. In doing so, the website's server
> sees — as with any page view — our IP address and our user agent. There are
> **two**, because there are two operations:
> `PukalaniBrandCheck/1.0 (+https://branding.supply/brand-check/methodik)` for
> the brand check (one page) and
> `PukalaniMarketBot/1.0 (+https://branding.supply/market-bot)` for the market
> comparison (several pages). Both pages permanently explain what we read, what
> we do not read, how long we keep it and how to block us — for each operation
> separately.
>
> We follow these rules: we read only **publicly available marketing pages**
> (no login areas, no forms, no downloads); we fetch and **honour
> `robots.txt`** for both operations, per user agent; we respect machine-readable **text and data mining
> reservations** (§ 44b UrhG) in their common forms (`TDM-Reservation` header,
> `/.well-known/tdmrep.json`, `tdm-reservation` meta, `noai`/`noimageai`) and
> exclude the site if one is present; we **never fetch** team, imprint,
> contact, privacy, terms, login, account or cart pages; everything else passes
> a **filter for e-mail addresses, phone numbers and personal names** before any
> further processing; and the retrieved **raw text is stored for at most 24
> hours** and then deleted automatically, leaving only a structured summary with
> **short supporting quotes (max. 200 characters)** and the source URL.
>
> The legal basis is our legitimate interest in an evidence-based market view
> (Art. 6(1)(f) GDPR). Operators who prefer not to be read can block us via
> `robots.txt` or contact us.

### 4c. Öffentliche Bewertung fremder Marken

> **Brand Score, Ranking und Bibliothek**
>
> Der Brand-Check misst einen öffentlich zugänglichen Webauftritt anhand eines
> festen Kriterienkatalogs und vergibt einen **Brand Score zwischen 0 und
> 100** sowie acht Kategoriewerte. Jeder Wert stützt sich auf einen **Beleg aus
> dem Auftritt selbst**; die vollständige **Methodik ist öffentlich einsehbar**
> und von jedem Ergebnis aus verlinkt.
>
> Ein Ergebnis ist zunächst **privat**. Es erscheint nur dann in unserem
> öffentlichen Ranking, wenn die prüfende Person dies beim Start ausdrücklich
> gewählt hat. Uns ist bewusst, dass die prüfende Person nicht immer der
> Markeninhaber ist. Deshalb gilt:
>
> - **Korrekturweg:** Zu jedem Ergebnis kann **ohne Konto und kostenlos** ein
>   Korrekturvorschlag eingereicht werden — mit Angabe des betroffenen Feldes,
>   des Vorschlags und einer Begründung. Eine Kontaktadresse ist freiwillig.
> - **Entfernungsweg:** Auf begründete Anfrage entfernen wir ein Ergebnis aus
>   dem öffentlichen Ranking. Diese Entfernung ist dauerhaft und wird nicht
>   dadurch aufgehoben, dass jemand anderes dieselbe Adresse erneut prüft.
> - **Kein Werturteil über den Anbieter:** Der Score beschreibt, wie klar ein
>   Auftritt seine Marke ausdrückt. Er ist keine Aussage über Qualität,
>   Zahlungsfähigkeit oder Seriosität eines Unternehmens; Vergleiche werden
>   **beschreibend** dargestellt, nicht herabsetzend.
> - In unserer **Bibliothek** zeigen wir Wortnamen und Kategorie bekannter
>   Marken sowie kurze Belegzitate von deren eigenen Auftritten — **keine
>   Logos, keine Bildmarken, keine Favicons**. Jeder Eintrag ist von Hand
>   geprüft und mit Prüfdatum versehen.
>
> Rechtsgrundlage ist unser berechtigtes Interesse an einer nachvollziehbar
> belegten, öffentlich überprüfbaren Einordnung (Art. 6 Abs. 1 lit. f DSGVO).
>
> *[PRÜFPUNKT ANWALT: Genügen offengelegte Methodik + Korrekturweg + freiwilliges
> Opt-in des Prüfenden, oder braucht es eine Anhörung des Bewerteten bzw. eine
> Beschränkung auf die eigene Marke? § 824 BGB, § 6 UWG,
> Unternehmenspersönlichkeitsrecht.]*

> **Brand score, ranking and library**
>
> The brand check measures a publicly available web presence against a fixed
> catalogue of criteria and assigns a **brand score between 0 and 100** plus
> eight category values. Every value is backed by **evidence taken from the
> presence itself**; the full **methodology is public** and linked from every
> result.
>
> A result is **private by default**. It appears in our public ranking only if
> the person running the check explicitly chose so. We are aware that this
> person is not always the brand owner. Therefore: anyone can submit a
> **correction — free of charge and without an account**; on a substantiated
> request we **remove** a result from the public ranking permanently, and that
> removal is not undone by someone else checking the same address again; the
> score describes **how clearly a presence expresses its brand** and is not a
> statement about a company's quality, solvency or integrity; and our
> **library** shows word marks, categories and short supporting quotes from the
> brands' own presences — **no logos, no figurative marks, no favicons** — each
> entry verified by hand and dated.
>
> The legal basis is our legitimate interest in a transparent, evidence-based
> classification (Art. 6(1)(f) GDPR).

**Verweis-Ziel (ERLEDIGT 2026-09-07, Paket R2a):** Die **Methodik-Seite**, auf
die dieser Abschnitt zweimal verweist, ist **gebaut** und steht unter
**`/brand-check/methodik`** (de: `/de/brand-check/methodik`) — öffentlich, ohne
Konto, ohne Produkt-Gate, indexierbar. Verlinkt ist sie als vierter Reiter des
Brand-Checks (damit auch von jeder Ergebnisseite) und zusätzlich im Lesefluss
von Startseite, Ranking und Ergebnis. Damit ist der frühere Befund 2 — „eine
Zusage ohne Ziel, wie die drei Footer-Wörter" — geschlossen; der Absatz darf
live gehen.

**Der Befund, den die Seite mitbrachte — ERLEDIGT mit BS1 R2b (2026-09-08,
Davids Entscheidung):** Der Einseiten-Abruf des Brand-Checks wertete **weder
`robots.txt` noch einen TDM-Nutzungsvorbehalt** aus; begründet war das mit „der
Betreiber trägt seine eigene Startseite ein", und bei einer FREMDEN Adresse
trägt diese Begründung nicht. Seit R2b holt der Check vor jedem Abruf die
`robots.txt` und prüft den Vorbehalt in allen vier anerkannten Formen — mit
DENSELBEN Regeln wie der Marktvergleich (`packages/brand/shared/brandRobots.ts`
und `brandTdm.ts`, aus dem market-Layer dorthin gezogen) und unter einem
EIGENEN Absender `PukalaniBrandCheck/1.0
(+https://branding.supply/brand-check/methodik)`, den ein Betreiber getrennt
vom Marktvergleich aussperren kann. Verbietet eines von beidem die Auswertung,
antwortet die Route 409 `site_blocked`: kein Score, **keine gespeicherte
Zeile**, nur ein Log-Ereignis mit dem Grund. Die Methodik-Seite sagt das zu,
zeigt die Aussperr-Zeile und nennt die verbliebene Grenze. **Ausgenommen bleibt
bewusst der Wizard-Weg** (`profiles/:id/analyze`): dort trägt ein eingeloggter
Betreiber seine EIGENE Website ein. Die Zusatzfrage für den Anwaltstermin R3,
Block (3) („genügt die Sperre auf Zuruf?") ist damit gegenstandslos; offen
bleibt dort nur die allgemeine Frage 16 zu § 44b UrhG.
Beweise: `packages/brand/scripts/verify-brand-check-robots.mjs` (29/29, mit
Mutations-Gegenprobe), `packages/brand/tests/brandCheckRobots.test.ts`.

---

## 5. AGB — die Punkte, die branding.supply braucht

Liste für Generator und Anwalt. Reihenfolge = Gliederungsvorschlag.

1. **Vertragsgegenstand und Leistungsumfang.** Was das Fundament ist (frei) und
   was die Ableitung ist (bezahlt) — Davids Entscheidung 2026-08-27 „frei
   bauen, bezahlt anwenden".
2. **Beta-Betrieb.** Die Software befindet sich in Erprobung; Funktionen können
   sich ändern oder entfallen, es gibt **keine Verfügbarkeitszusage**, und
   Ergebnisse sollten gesichert werden. Ausdrücklicher Abschnitt, weil aus
   einer kostenlosen Beta ein bezahltes Angebot wird.
3. **Beta-Konten dauerhaft frei** (Entscheidung 6). Wörtlich zu regeln: die
   Zusage gilt **je Konto**, nicht als unbegrenzte Zahl von Brandings; die
   bestehenden Nutzungsgrenzen (u. a. drei Läufe je Tag und Branding) bleiben;
   der Betreiber kann die Zusage **bei Missbrauch je Konto widerrufen**.
4. **KI-Ergebnisse ohne Gewähr.** Entwürfe eines Sprachmodells können falsch,
   unvollständig oder unpassend sein; sie ersetzen keine Rechts-, Marken- oder
   Steuerberatung. Der Kunde prüft vor Verwendung — insbesondere auf
   Markenrechte Dritter.
5. **Nutzungsrechte an den Ergebnissen.** *Empfehlung (Laien-Einschätzung, zu
   prüfen): dem Kunden ein umfassendes, zeitlich und räumlich unbeschränktes
   Nutzungsrecht an seinem Fundament einräumen; im Gegenzug ein Recht des
   Anbieters, das Ergebnis anonymisiert zur Verbesserung des Dienstes und —
   nur mit ausdrücklicher Freigabe — öffentlich zu zeigen.* Der zweite Teil ist
   die AGB-Seite von **Discover** (`publicationVisibility`, Opt-in je Brand,
   Default `private`) und von `marketVisibility` — **eine Zustimmung gilt nur
   für das, wofür sie gegeben wurde**.
6. **Pflichten des Kunden.** Keine rechtswidrigen Inhalte; keine Daten Dritter
   ohne Grundlage; keine Umgehung der Nutzungsgrenzen; keine automatisierte
   Massennutzung.
7. **Abruf fremder Websites durch den Kunden veranlasst.** Klarstellen, dass
   der Kunde eine Adresse benennt und wir abrufen — und welche Grenzen dabei
   gelten (§4b).
8. ~~**Digitale Inhalte und Widerruf (§ 356 Abs. 5 BGB).**~~ **ENTFÄLLT
   INHALTLICH seit dem 2026-09-08** (Plan §9 Zeile 9): das Widerrufsrecht der
   §§ 355 ff. BGB steht **Verbrauchern** zu, und Verbraucher sind kein
   Kundenkreis von branding.supply. Was an seine Stelle tritt, steht in Nr. 14.
   *Der ursprüngliche Zuschnitt (Widerrufsbelehrung mit ausdrücklicher
   Zustimmung zum sofortigen Beginn der Ausführung und Kenntnisnahme des
   Erlöschens) bleibt hier als Protokoll stehen — er wird gebraucht, falls der
   Anwalt die Selbstauskunft nicht genügen lässt oder David den Kundenkreis
   später öffnet.*
9. **Preise, Steuern, Rechnung.** Platzhalter — **LÜCKE: Name des
   Kaufgegenstands und Betrag** (§7 Lücke 10). **Seit dem 2026-09-08 netto:**
   weil der Kundenkreis B2B ist, dürfen und sollen die Preise **netto zzgl.
   USt** ausgewiesen werden — der eigene Katalog aus Z1 setzt dafür
   `tax_behavior: 'exclusive'`. Das `'inclusive'` im Code gilt für die
   **Community-Preise** und ist dort unverändert; zwei Kataloge, zwei
   Verhalten. `automatic_tax` bleibt aktiv; die **Erhebung der USt-ID
   (`tax_id_collection`) ist nicht gebaut** und wird mit dem B2B-Zuschnitt zur
   Bauarbeit in Z1, nicht mehr zur Frage.
10. **Laufzeit, Kündigung, Löschung.** Konto jederzeit kündbar; was bei
    Kündigung mit Inhalten geschieht; Frist bis zur Löschung.
11. **Änderungen der AGB** und wie zugestimmt wird. **Baubefund:** Der Core
    speichert die Zustimmung heute **nicht** — `terms` ist ausdrücklich „reiner
    UI-Belang" (`packages/core/schemas/auth.ts:53`), es gibt weder
    `termsAcceptedAt` noch `termsVersion`. Weil das Häkchen zunächst auf einen
    **Entwurf** gesetzt wird, ist die Fassungsnummer am Konto keine Kür
    (Paket R1).
12. **Haftung.** Einschränkung im gesetzlich zulässigen Rahmen; Datenverlust in
    der Beta ausdrücklich ansprechen.
13. **Anwendbares Recht, Gerichtsstand, Verbraucherstreitbeilegung
    (§ 36 VSBG).** **Seit dem 2026-09-08 entfällt § 36 VSBG inhaltlich** —
    die Pflicht trifft Unternehmer, die Verträge mit **Verbrauchern**
    schliessen, und das tun wir nicht. Ein Satz „wir nehmen an einem
    Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle nicht
    teil" **darf stehen bleiben** und ist der einfachere Weg: er kostet
    nichts und beantwortet die Frage, bevor sie jemand stellt. Anwendbares
    Recht und Gerichtsstand bleiben zu regeln (bei reinem B2B ist eine
    Gerichtsstandsvereinbarung überhaupt erst möglich — Anwaltspunkt). Der
    **Vertreter nach Art. 27 DSGVO** in der Datenschutzerklärung bleibt ein
    **benannter leerer Abschnitt** (Entscheidung 3); die Anbieterwahl läuft als
    eigener Punkt `A27`, s. §7 Lücke 8.

14. **Unternehmereigenschaft — Selbstauskunft bei der Registrierung.** *(neu
    2026-09-08)* Der Kundenkreis ist B2B, und das steht nicht nur in den AGB:
    beim Anlegen des Kontos bestätigt der Kunde per Pflicht-Häkchen
    „Ich handle als Unternehmer/in oder Selbstständige/r"; die
    Bestätigung wird **am Konto gespeichert wie die AGB-Fassung** (Paket
    **R1c**). In den AGB gehört dazu ein Absatz, der (a) den Kundenkreis
    benennt, (b) auf die Bestätigung Bezug nimmt und (c) die Folge einer
    falschen Angabe regelt. **Ob die Selbstauskunft rechtlich trägt, ist
    Anwaltsfrage** (§6 Block 2, Frage 14).

---

## 6. Anwaltsfragen — drei Blöcke für EINEN Termin

### Block 1 — Studio-Rest (aus A1/A1b, hier erneut zu stellen)

1. **Art. 27 DSGVO:** Braucht ein Verantwortlicher mit Sitz in den USA, der
   sich an DACH-Kunden richtet, einen Vertreter in der EU — und ab wann?
2. **Drittland:** Auf welcher Grundlage darf aus den USA auf die in Deutschland
   gespeicherten Kundendaten zugegriffen werden?
3. **§ 5 DDG / § 18 Abs. 2 MStV:** Welche Impressumsangaben schuldet dieses
   Angebot, und wird es durch die geplanten redaktionellen Inhalte (BI1)
   journalistisch-redaktionell?
4. **§ 36 VSBG:** Muss zur Teilnahme an einer Verbraucherschlichtung Stellung
   genommen werden — auch schon ohne Bezahlfunktion? *Für branding.supply seit
   dem 2026-09-08 nur noch die halbe Frage: mit reinem B2B entfällt die Pflicht
   inhaltlich, offen ist, ob der Satz "wir nehmen nicht teil" trotzdem stehen
   soll. Für pukalani.studio/pukalani.app bleibt sie ganz offen.*
5. **Umsatzsteuer:** Wie ist ein US-Anbieter mit digitalen Leistungen an
   DACH-Kunden zu behandeln (Kleinunternehmerregelung und OSS setzen eine
   EU-Ansässigkeit bzw. -Registrierung voraus)?

### Block 2 — die branding.supply-Texte

6. **Rolle bei der KI-Verarbeitung:** Verarbeiten wir Kundentexte als
   Verantwortlicher zur Vertragserfüllung, oder ist es Auftragsverarbeitung mit
   AVV-Pflicht gegenüber Firmenkunden? *(Laien-Einschätzung: der Kunde
   beauftragt keine Verarbeitung fremder Endnutzerdaten — spricht gegen
   Auftragsverarbeitung; belastbar ist das nicht.)*
7. **Prüfpunkt 4a:** Trägt der Abschnitt zur KI-Verarbeitung, oder fehlt eine
   Angabe (Drittland-Grundlage, Empfängerliste, Widerspruchsrecht)?
8. **Prüfpunkt 4b:** Ist die Bot-Seite `/market-bot` eine **bindende Zusage**,
   und muss sie aus der Datenschutzerklärung verlinkt sein?
9. **Prüfpunkt 4c:** Genügen offengelegte Methodik, Korrekturweg und Opt-in des
   Prüfenden — oder braucht es eine Anhörung des Bewerteten bzw. eine
   Beschränkung auf die eigene Marke?
10. **Beta ohne Entgelt:** Braucht eine unentgeltliche Beta AGB, und was muss
    darin über Verfügbarkeit, Datenverlust, Kündigung und den Übergang in ein
    bezahltes Angebot stehen?
11. **Nutzungsrechte:** Ist die Zuordnung aus §5 Nr. 5 tragfähig — insbesondere
    die Trennung zwischen „Kunde nutzt frei" und „Veröffentlichung nur mit
    ausdrücklicher Freigabe je Marke"?
12. **Entwurfs-Häkchen-Praxis:** Ist ein AGB-Häkchen auf einen sichtbar als
    Entwurf gekennzeichneten Text wirksam — und genügt es, die zugestimmte
    Fassung am Konto zu speichern und nach der Prüfung erneut zustimmen zu
    lassen?
13. **Widerruf digitaler Inhalte (§ 356 Abs. 5 BGB):** Reicht die geplante
    Gestaltung (ausdrückliche Zustimmung + Kenntnisnahme beim Kauf)? *Der
    zweite Teil der Frage — ob Verbraucher überhaupt kaufen dürfen — ist am
    2026-09-08 entschieden (**nein, B2B**); er lebt als Frage 14 weiter. Die
    Belehrung bleibt trotzdem eine Frage: sie wird gebraucht, falls Frage 14
    verneint wird oder David den Kundenkreis später öffnet.*
14. **Unternehmer-Selbstauskunft (Kundenkreis B2B, seit 2026-09-08):** Reicht die
    **Selbstauskunft per Häkchen** bei der Registrierung („Ich handle als
    Unternehmer/in oder Selbstständige/r", am Konto gespeichert wie die
    AGB-Fassung), um den Kundenkreis wirksam auf Unternehmer zu beschränken —
    oder bleibt ein Vertrag mit einem Verbraucher trotz falscher Angabe ein
    Verbrauchervertrag (mit Widerrufsrecht)? Was müsste zusätzlich vorliegen:
    Abfrage von Firma und USt-IdNr., ein ausdrücklicher Ausschluss in den AGB,
    ein Hinweis vor dem Kauf? *(Ersetzt den zweiten Teil der alten Frage 13 —
    dort war noch offen, OB auf Unternehmer beschränkt wird; das ist jetzt
    entschieden, offen ist nur noch das WIE WIRKSAM.)*

### Block 3 — Anhang G (Marktvergleich) und BI1 §4.3

15. **(a) Fremde Markennamen:** Bleibt die referenzierende Benutzung zulässig,
    wenn die Namen (1) in einem **kostenpflichtigen** Produkt erscheinen und
    (2) im **Marketing** als Beispiel-Paare genannt würden?
16. **(b) Zitate ≤ 200 Zeichen:** Trägt der Zitatzweck auch, wenn dieselbe
    Seite **zehn Zitate derselben Quelle** zeigt — und genügt der Link als
    Quellenangabe nach § 63 UrhG?
17. **(c) TDM-Vorbehalt (§ 44b UrhG):** Ist der BGH entschieden
    (I ZR 281/25), und ändert das etwas für Vorbehalte in **natürlicher
    Sprache** (AGB/Impressum), die wir heute nicht auswerten? Greift § 44b
    überhaupt, wenn wir nicht trainieren, sondern einmalig auswerten und
    zitieren?
18. **(d) § 6 UWG:** Wäre die Nennung realer Marken im Marketing
    („Beispiel: adidas gegen Nike") vergleichende Werbung, obwohl wir mit
    keiner der beiden im Wettbewerb stehen?
19. **(e) DSGVO beim Abruf:** Reicht der PII-Filter, oder braucht ein
    dauerhaft sichtbarer **Bibliothekseintrag** eine zusätzliche Zusage
    gegenüber dem Website-Betreiber — etwa eine Widerspruchsmöglichkeit, die
    über „schreibt uns an" hinausgeht?
20. **(f) Datenbank-Herstellerrecht (§ 87b UrhG):** Kippt die Einordnung, wenn
    wir dieselben Kandidaten regelmäßig auffrischen und die Bibliothek dadurch
    zu einer laufend gepflegten Sammlung wird?
21. **BI1-1 Presse- und Wikipedia-Zitate:** Trägt § 51 UrhG auch im
    redaktionellen Beitrag eines **gewerblichen** Anbieters, der auf das eigene
    Bezahlprodukt führt — und färbt **CC BY-SA** auf unseren Beitrag ab?
22. **BI1-2 YouTube-Kommentare:** Ist die aggregierte Auswertung über die Data
    API als Marktforschung zulässig (Art. 6 I f), wenn Nutzernamen nie
    gespeichert werden — und was verlangen die API-Bedingungen
    (Speicherfristen, abgeleitete Datensätze)? Genügt die reguläre Einbettung
    des Quellvideos?
23. **BI1-3 Score fremder Marken:** identisch mit Frage 9 — hier ist er
    **schon heute live**, nicht erst mit BI1.
24. **BI1-4 Wir-Stimme ohne Autor:** Genügt ein Redaktions-Impressum
    („Verantwortlich i. S. d. § 18 Abs. 2 MStV: …"), wenn unter den Beiträgen
    nur die namenlose Wir-Stimme steht?

---

## 7. Lücken — David

Nichts davon wurde geraten. Jede Zeile ist eine Eingabe, die nur David liefern
kann; ohne sie bleibt die entsprechende Stelle im Text ein Platzhalter.

| # | Lücke | Wofür gebraucht | Blockiert |
| --- | --- | --- | --- |
| 1 | **Anbieterblock:** Name, Rechtsform, ladungsfähige Anschrift, E-Mail, Telefon, ggf. Register/USt-IdNr., Vertretungsberechtigte | Impressum (§ 5 DDG), Kopf der Datenschutzerklärung, Stripe-Portal | R2 komplett |
| 2 | **Standort des Rechenzentrums** (Hetzner: welcher Standort für `app-prod` und `appwrite-prod`?) | Abschnitt „Hosting" | §3 Zeile 1 |
| 3 | **DNS/Registrar der Zone `branding.supply`** — liegt die Zone bei Cloudflare (die Runbook-Wörter „grau/nicht proxied" sind Cloudflare-Begriffe)? Wer ist Registrar? | Subprozessoren-Liste | §3 Zeile 2 |
| 4 | **SMTP-Anbieter dieser Site bestätigen** (im Monorepo überall Resend — für `branding` steht in der Server-`.env` nur, DASS Host/User/Pass gesetzt sind) + **AVV** | Subprozessoren-Liste, Mail-Abschnitt | Zeile 10 der Tabelle |
| 5 | **OpenRouter: Vertragsstand** — AVV/DPA vorhanden? Welche Modellanbieter sind faktisch zugelassen? | KI-Abschnitt, Subprozessoren-Liste | §4a |
| 6 | **Aufbewahrung der Backups** auf der Storage Box (Frist, Standort, Verschlüsselung) | Abschnitt „Speicherdauer" | Zeile 16 |
| 7 | **Aufbewahrung der Server-Protokolle** — heute kein logrotate; eine Frist muss gesetzt UND umgesetzt werden | Abschnitt „Server-Protokolle" | Zeile 15 |
| 8 | ~~**Art.-27-Vertreter jetzt beauftragen oder auf die Anwaltsantwort warten?**~~ **ENTSCHIEDEN 2026-09-08: verschoben.** Das OB beantwortet der Anwalt (Block 1 Frage 1); die **Anbieterwahl** wird parallel vorbereitet — Vergleich und differenzierte Empfehlungen in [referenz/ART-27-VERTRETER-ANBIETER.md](../referenz/ART-27-VERTRETER-ANBIETER.md). Verfolgt als eigener Punkt **`A27`** in [OPEN-ITEMS.md](../OPEN-ITEMS.md) | Impressum + Datenschutz — bis dahin **benannter leerer Abschnitt** | nichts mehr: der Text kann ohne diese Angabe als Entwurf stehen |
| 9 | ~~**Welcher Generator** die Grundfassung liefert~~ **ERLEDIGT 2026-09-08: activeMind** (kostenlos) für die Erstfassung, **Wechsel zu eRecht24 Premium** mit R3/Fassung 2 oder spätestens vor dem Öffnen der Beta. **Bedingung des kostenlosen Wegs: activeMind verlangt Quellennennung mit Link im Text** — am Generator prüfen und einhalten | die drei Zusatz-Abschnitte (§4) und der B2B-Absatz müssen in die activeMind-Gliederung passen | nichts mehr — R2 kann anfangen, sobald Lücke 1 (Anbieterblock) da ist ODER mit Platzhaltern gearbeitet wird |
| 10 | **Name des Kaufgegenstands** und **Betrag** (ein Preis je Branding oder je Produkt getrennt) | AGB §5 Nr. 9, Preis-Katalog Z1 | Z1 |
| 11 | ~~**Verbraucher zulassen — ja oder nein?**~~ **ERLEDIGT 2026-09-08: nein — nur Unternehmen und Selbstständige (B2B).** Folgen: kein Verbraucher-Widerruf (§5 Nr. 8), keine Verbraucherstreitbeilegung (§5 Nr. 13), Preise netto zzgl. USt (§5 Nr. 9), Unternehmer-Bestätigung bei der Registrierung (§5 Nr. 14, Paket **R1c**) | AGB, Preisangaben, Z1-Katalog | nichts mehr — offen bleibt nur die Anwaltsfrage 14, ob die Selbstauskunft trägt |
| 12 | **Steuernummer / USt-Behandlung** (Kleinunternehmer und OSS setzen EU-Ansässigkeit voraus) | Rechnung, Impressum | Z1, Frage 5 |
| 13 | **Plausible-Site für `branding.supply` anlegen** (die CE-Ausgabe hat keine Sites-API — das ist ein Klick in der Oberfläche) ⇒ Script-Id `pa-…` | Abschnitt „Reichweitenmessung", Einbindung in `apps/branding/app/app.config.ts` | Zeile 13 der Tabelle, Paket **R2c** |

### Zwei Baubefunde, die vor der Veröffentlichung zu klären sind

- ~~**Die 24-Monats-Frist der Funnel-Ereignisse existiert nur als Kommentar.**~~
  **ERLEDIGT mit BS1 R1b (2026-09-07):** die Frist hat ihre Mechanik — pure
  Regel `packages/brand/shared/brandEventsRetention.ts`
  (`BRAND_EVENTS_RETENTION_MONTHS`, die EINE Zahl, von Migrationskopf und
  Verzeichnis-Zeile 12 zitiert), Sweep `server/utils/brandEventsSweep.ts`,
  Takt `server/plugins/brand-events-sweep.ts`, Betreiber-Handgriff
  `POST /api/brand/ops/events-sweep`. Beweis mit Gegenprobe:
  `packages/brand/scripts/verify-brand-events-sweep.mjs` (15/15) — eine Zeile
  mit 25 Monaten fällt, eine mit 23 Monaten bleibt. Der Satz im Text darf jetzt
  „24 Monate" sagen.
- ~~**Die Methodik-Seite für den Brand Score fehlt**~~ (BI1 §4.2, Plan §2.2
  Nr. 6). **ERLEDIGT mit BS1 R2a (2026-09-07):** `/brand-check/methodik`
  (`packages/brand/app/pages/brand-check/methodik.vue`) steht in de und en —
  was der Score ist und was nicht, was gelesen wird und was nicht, die acht
  Kategorien mit Gewicht und Kriterienzahl, gerechnet gegen beurteilt,
  Modell-Bedingungen, Fundament-Reife als zweite Zahl, Korrektur- und
  Entfernungsweg, Grenzen. Keine Zahl ist abgetippt: Kriterien, Kategorien,
  Gewichte, Bandgrenzen, Zeichendeckel, Zwischenspeicher-Frist und
  Korrektur-Drossel kommen aus den Verträgen, die Locale-Texte tragen
  Platzhalter. Beweis mit Gegenprobe:
  `packages/brand/tests/brandCheckMethod.test.ts`. §4c darf damit live gehen.
