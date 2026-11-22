# Doku-Karte

Wo steht was — und was ist die **eine** Datei, in die offene Arbeit gehört.
Stand: 2026-11-21. Dass jede Datei der Sorten Steuerung, Referenz, Runbooks und
Pläne hier steht, hält seitdem `pnpm check:doc-links` (eine neue Datei ohne
Zeile in dieser Karte ist rot).

## Die vier Sorten

Jedes Dokument gehört zu genau einer Sorte. Wer eine neue Datei anlegt,
entscheidet zuerst die Sorte — sonst wächst wieder ein Wildwuchs, in dem
niemand weiß, ob ein Häkchen noch Arbeit bedeutet.

| Sorte | Ordner | Frage, die sie beantwortet | Veraltet sie? |
| --- | --- | --- | --- |
| **Steuerung** | `docs/` | Was tun wir als Nächstes? | ständig gepflegt |
| **Referenz** | `docs/referenz/` | Wie ist X gebaut, und warum so? | lebt mit dem Code |
| **Runbooks** | `docs/runbooks/` | Wie führe ich Y im Betrieb aus? | pro Durchlauf abgehakt |
| **Archiv** | `docs/archiv/` | Warum ist es so geworden? | nie mehr angefasst |

## ⭐ Steuerung — hier steht die Arbeit

| Datei | Inhalt |
| --- | --- |
| **[OPEN-ITEMS.md](OPEN-ITEMS.md)** | **DIE EINE offene-Punkte-Liste — und zwar NUR Offenes** (Regel von David, 2026-07-30). Sechs Schritte „Jetzt dran — in dieser Reihenfolge", je mit Tabellen (Prio, Aufwand, „Braucht David?"), darunter „Geparkt / wartet". Max. 3 Zeilen je Eintrag; Einzelheiten leben im verlinkten Plan oder je Kürzel unter [plans/offen/](plans/offen/README.md). Neue offene Punkte kommen HIERHER — nie in ein Plan-Dokument. |
| **[OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md)** | **Finales Archiv der erledigten Punkte = unser Lern-Gedächtnis.** Jeder Eintrag vollständig, mit Datum und einer Zeile **Gelernt:**, wo etwas nicht auf Anhieb ging. Ausdrücklich KEINE Arbeitsliste — hier wird nachgelesen, nicht abgearbeitet. |
| [GOALS.md](GOALS.md) | **Abgeschlossene Chronik** der `/goal`-Ära (Phasen 1–27, 09.06.–08.07.2026). Keine Arbeitsliste, keine neuen Phasen — was ansteht, steht in OPEN-ITEMS.md |
| [DECISION-LOG.md](DECISION-LOG.md) | Beschluss-Protokoll: welche Entscheidung wann, mit Begründung — neueste zuerst; eine abgelöste Entscheidung trägt die Zeile „Überholt am …" |
| [CONCEPT.md](CONCEPT.md) | Architektur-Bibel A1–A15 (Layer-Grenzen, Verträge, Invarianten, Mandanten-Architektur) |

Dazu im Repo-Wurzelverzeichnis: [../README.md](../README.md) (Einstieg +
Phasen-Statustabelle), [../CLAUDE.md](../CLAUDE.md) (die Regeln für
KI-Agenten — **die eine Quelle**, `AGENTS.md` zeigt nur darauf),
[../CHANGELOG.md](../CHANGELOG.md) (Release-Historie bis 4.0.0 — seit
2026-11-13 nicht mehr fortgeschrieben, release-please abgeschaltet).

## Referenz — wie ist es gebaut

| Datei | Thema |
| --- | --- |
| [referenz/WORKFLOW.md](referenz/WORKFLOW.md) | **Arbeitsablauf je Vorhaben** — Strategie→Konzeption→Prototyp→Umsetzung→Audit→Testing→Deploy→Docs; gilt für ALLE Projekte |
| [referenz/SICHERHEITSMODELL.md](referenz/SICHERHEITSMODELL.md) | **Sicherheitsmodell** — die Schutzschichten auf einer Seite, mit Verweisen auf Code und Regelwerk |
| [referenz/SESSION-HYGIENE.md](referenz/SESSION-HYGIENE.md) | **Sitzungs-Hygiene** — Kontext, Nutzungslimit, Modell/Effort je Rolle, Ausgaben deckeln; 24 Video-Tipps bewertet, MCP-gegen-CLI-Vorschlag, MCP-Rechte (Sperrliste Ploi/Resend) |
| [referenz/MULTI-SITE-PLATFORM-STRATEGIE.md](referenz/MULTI-SITE-PLATFORM-STRATEGIE.md) | Produkt-Manifeste, Layer/App-Komposition |
| [referenz/PRODUKT-BILANZ.md](referenz/PRODUKT-BILANZ.md) | „Ein Konzept pro Produkt" — welche App welches Produkt montiert, wer durch die Datentür geht (ERZEUGT: `node scripts/produkt-bilanz.mjs`) |
| [referenz/G0-PRODUKTVERTRAG.md](referenz/G0-PRODUKTVERTRAG.md) | Produktvertrag: Rollen, Tarif, Umfang |
| [referenz/RBAC-CONCEPT.md](referenz/RBAC-CONCEPT.md) | Operator-Labels + Capability-Matrix |
| [referenz/MODERATION-AND-LAYER-BOUNDARIES.md](referenz/MODERATION-AND-LAYER-BOUNDARIES.md) | Moderations-Verträge über Layer-Grenzen |
| [referenz/THEMES-CONCEPT-V2.md](referenz/THEMES-CONCEPT-V2.md) | Theme-System + bewusste Ablehnungen |
| [referenz/AUTH-FORMS.md](referenz/AUTH-FORMS.md) | Warum Login/Register eigene UForms sind |
| [referenz/EXPORT-UND-LOESCHUNG.md](referenz/EXPORT-UND-LOESCHUNG.md) | Export und Löschung: der Vertrag, die Liste aller Tabellen, was „gelöscht" heißt, Fristen und ihre Läufe |
| [referenz/EMBED.md](referenz/EMBED.md) | Embed-Widget: Gates, CSP, Cookie-Verhalten |
| [referenz/EIGENE-DOMAIN.md](referenz/EIGENE-DOMAIN.md) | Kundendomains: Pool-Tenant vs. Silo-Alias, Zustandskette, kanonischer Host |
| [referenz/CHANGELOG-WORKFLOW.md](referenz/CHANGELOG-WORKFLOW.md) | Kunden-Changelog (von Hand im Dashboard; Function und Entwurfs-Werkzeug seit 2026-11-15 entfernt); Entwickler-CHANGELOG/release-please seit 2026-11-13 abgeschaltet |
| [referenz/LIVE-BEWEISE.md](referenz/LIVE-BEWEISE.md) | Welche Beweis-Skripte es gibt und wogegen sie laufen |
| [referenz/FIGMA-KORREKTURFLAECHE.md](referenz/FIGMA-KORREKTURFLAECHE.md) | Figma als Korrekturfläche: Zyklus, Token-Brücke, die vier Diff-Klassen |
| [referenz/BRAND-WIZARD-SESSION-INHALTE.md](referenz/BRAND-WIZARD-SESSION-INHALTE.md) | Lese-Fassung der Session-Inhalte der Marken-Werkstatt (ERZEUGT aus dem Code) |
| [referenz/BRANDING-SUPPLY-BILDMATERIAL.md](referenz/BRANDING-SUPPLY-BILDMATERIAL.md) | branding.supply: Bildmaterial-Register — je Kennung Ort, Format und Prompt |
| [referenz/ART-27-VERTRETER-ANBIETER.md](referenz/ART-27-VERTRETER-ANBIETER.md) | EU-Vertreter nach Art. 27 DSGVO: Anbietervergleich (Unterlage zu A27, Stand 2026-09-08) |

## Runbooks — Schritt für Schritt im Betrieb

| Datei | Wofür |
| --- | --- |
| [runbooks/DEPLOYMENT.md](runbooks/DEPLOYMENT.md) | Betrieb heute (was wo läuft, Ausliefern, **schlechter Stand live: Rückweg**) · neue App/Site aufsetzen, Envs, Migrationen, ploi-Felder |
| [runbooks/NEUE-SITE.md](runbooks/NEUE-SITE.md) | Neue Site auf dem App-Server: nginx aus der Vorlage (`ops/nginx/`), Pflicht-Zeilen, Kundendomain, neuer oder entfernter Zeitplan (`ops/cron.conf`) |
| [runbooks/STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) | Stripe vom Testmodus auf echtes Geld |
| [runbooks/STRIPE-TEST-WALKTHROUGH.md](runbooks/STRIPE-TEST-WALKTHROUGH.md) | Die 6 Testmodus-Proben davor |
| [runbooks/CI-SCHLUESSEL-TAUSCHEN.md](runbooks/CI-SCHLUESSEL-TAUSCHEN.md) | Die zwei SSH-Schlüssel der CI (Ausliefern, Wächter): wo sie liegen, was sie dürfen, tauschen ohne Stillstand, Tor-Skript auf appwrite-prod |
| [runbooks/APPWRITE-KEYS.md](runbooks/APPWRITE-KEYS.md) | Schlüssel im Betreiber-Projekt `admin`: Messung vom 2026-08-03 (damals `control`), welcher Schlüssel was darf, wie man nachmisst. Der einmalige Tausch des Lese-Schlüssels für `platform` liegt als Protokoll im Archiv: [PLATFORM-CONTROL-KEY-SWAP](archiv/PLATFORM-CONTROL-KEY-SWAP.md) |
| [runbooks/APPWRITE-WIEDERHERSTELLUNG.md](runbooks/APPWRITE-WIEDERHERSTELLUNG.md) | **Appwrite-Server weg:** aus dem nächtlichen Backup auf der Storage Box und dem einen Schlüssel zurück zur laufenden Instanz — Schritt für Schritt, dazu Betrieb des Backups, Übung, Protokoll |
| [runbooks/DOCKER-APPS-WIEDERHERSTELLUNG.md](runbooks/DOCKER-APPS-WIEDERHERSTELLUNG.md) | **Docker-Server weg oder ein Dienst dort kaputt** (Plausible, Chatwoot, Umami, Shlink): aus dem täglichen Backup zurück — je Dienst Schritt für Schritt, dazu Betrieb des Backups, Übung, Protokoll |
| [runbooks/APPWRITE-PROD-SPIEGEL.md](runbooks/APPWRITE-PROD-SPIEGEL.md) | Prod-Appwrite 1:1 in die lokale OrbStack-Appwrite spiegeln (Skript, was lokal bewusst anders ist, Rückweg) |
| [runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md](runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md) | Erste echte Kundendomain freischalten (Pool-Community **und** Silo-Site) |
| [runbooks/EIGENE-DOMAIN-FREIGABE.md](runbooks/EIGENE-DOMAIN-FREIGABE.md) | Eigene Domain einer Pool-Community freigeben, abschalten, wieder einschalten; Schonfrist-Lauf (zählt nur / scharf), Einzelfälle |
| [runbooks/AI-RUNNER-BETRIEB.md](runbooks/AI-RUNNER-BETRIEB.md) | AI-Runner im Betrieb: einen Testbefehl auf dem Rechner freigeben, was bei „nicht erlaubt“ zu tun ist, wann ein Auftrag als geprüft gilt, Fristen für Protokolle und Ereignisse |
| [runbooks/GOOGLE-LOGIN.md](runbooks/GOOGLE-LOGIN.md) | „Anmelden mit Google" scharfschalten (Google-Console, Appwrite-Console, die zwei Schalter) |
| [runbooks/MARKTVERGLEICH-EINFUEHRUNG.md](runbooks/MARKTVERGLEICH-EINFUEHRUNG.md) | Produkt `market` auf `branding` einschalten: sechs Migrationen, ein Schalter, Rauchtest (Durchlauf 2026-09-06 abgehakt) |
| [runbooks/ANMELDE-REGELN.md](runbooks/ANMELDE-REGELN.md) | Appwrites Regeln für Passwort, Adresse und Sitzung: Soll-Liste, Prüf-Skript, Datenleck-Abgleich, bekanntes Gerät, Notfall-Knöpfe |
| [runbooks/PRODUKTIONS-ALARM.md](runbooks/PRODUKTIONS-ALARM.md) | **Der Einstieg bei jeder Störung:** Produktions-Wächter + Alarmweg (Issue/Mail/Heartbeat), Probealarm, Davids Klickliste, was bei einem Alarm zu tun ist (je Störfall ein Absatz, Not-Aus), Vertretung und zweite Alarm-Adresse (§ 5) |
| [runbooks/SICHERHEITSVORFALL.md](runbooks/SICHERHEITSVORFALL.md) | Verdacht auf fremden Zugriff: aufschreiben, eindämmen, Schlüssel tauschen (Zeiger auf jedes Tausch-Rezept), Spuren, Melden — und was fehlt |
| [runbooks/ANFRAGEN-VON-AUSSEN.md](runbooks/ANFRAGEN-VON-AUSSEN.md) | Jemand meldet einen Rechtsverstoß oder verlangt Löschung oder Auskunft: wo es ankommt, Identität prüfen, die Handgriffe im Dashboard |
| [runbooks/MFA-NOTAUSGANG.md](runbooks/MFA-NOTAUSGANG.md) | Zwei-Faktor-Anmeldung eines Kontos zurücksetzen, wenn Gerät und Codes weg sind (nur nach echter Identitätsprüfung) |
| [runbooks/ZUGAENGE-AUFRAEUMEN.md](runbooks/ZUGAENGE-AUFRAEUMEN.md) | Zugänge zu gelöschten Projekten finden und entfernen (`pnpm ops:stale-keys`; nur 404 beweist „tot") |
| [runbooks/RESEND-WEBHOOK.md](runbooks/RESEND-WEBHOOK.md) | Mail-Versand über Resend: Webhook für Bounces und Beschwerden, Tagesbudget, der Sende-Schlüssel an fünf Stellen, Tausch |
| [runbooks/APPWRITE-2-7-UPGRADE.md](runbooks/APPWRITE-2-7-UPGRADE.md) | Appwrite 2.6.2 → 2.7.1, 2.7.1 → 2.7.3 und 2.7.3 → 2.7.4 (der heutige Stand auf dev, CI und prod, seit 2026-11-20). Die Sprünge davor: [2.0](runbooks/APPWRITE-2-0-UPGRADE.md), [2.2](runbooks/APPWRITE-2-2-UPGRADE.md), [2.6](runbooks/APPWRITE-2-6-UPGRADE.md) |
| [runbooks/BRANDING-SUPPLY-SETUP.md](runbooks/BRANDING-SUPPLY-SETUP.md) | branding.supply einrichten (Projekt, Site, Zertifikat; Durchlauf 2026-09-01) |
| [runbooks/MARKTVERGLEICH-BIBLIOTHEK.md](runbooks/MARKTVERGLEICH-BIBLIOTHEK.md) | Bibliotheks-Einträge rechnen und von Hand prüfen (bezahlter Lauf, Handzeichen, Auffrischung nach 90 Tagen) |
| [runbooks/NEWSLETTER-ABMELDE-LINKS.md](runbooks/NEWSLETTER-ABMELDE-LINKS.md) | Eigenes Geheimnis der Abmelde-Links auf branding.supply (SEC-020): setzen, wechseln, was bei einem Tausch des API-Schlüssels passiert |
| [runbooks/LABEL-ABGLEICH.md](runbooks/LABEL-ABGLEICH.md) | Stündlicher Label-Abgleich (SEC-024): was er tut und nie tut, Schalter, Probelauf, Log lesen, Ops-Route, Rückweg |
| [runbooks/GESAMTAUDIT.md](runbooks/GESAMTAUDIT.md) | Gesamtaudit über alle zwölf Dimensionen mit Fable 5.2: Ablauf, Prompts je Phase, Rückführung; Ergebnisse liegen PRIVAT außerhalb des Repos |

Die Häkchen in Runbooks sind **echt** — sie werden pro Durchlauf abgehakt und
gehören dort hin.

## Pläne — noch nicht (ganz) gebaut

Jede Datei trägt oben die Zeile **Plan-Status** mit festem Wortlaut (nicht
gebaut · teils gebaut — offen: … · Unterlage zu …); `pnpm check:doc-links`
verlangt sie. Offene Punkte stehen trotzdem nur in [OPEN-ITEMS.md](OPEN-ITEMS.md).

| Datei | Zustand |
| --- | --- |
| [plans/PUKALANI-KONTO.md](plans/PUKALANI-KONTO.md) | Pukalani-Konto (PK1): ein Konto für alle Seiten — Konzept geschrieben und entschieden 2026-11-12, nichts gebaut; Bau erst nach dem Gesamtaudit |
| [plans/PUKALANI-KONTO-E1.md](plans/PUKALANI-KONTO-E1.md) | Pukalani-Konto, Etappe 1 (Eintrittskarte je Seite, mit dem Beweis E0): Konzept 2026-11-22, nichts gebaut; wartet auf sechs Entscheidungen
| [plans/ACCOUNT-HORIZONT.md](plans/ACCOUNT-HORIZONT.md) | Account-Horizont (AH-1 … AH-7): teils gebaut; die Fortsetzung ist das Pukalani-Konto |
| [plans/WIEDERHERSTELLUNG.md](plans/WIEDERHERSTELLUNG.md) | Gelöschtes zurückholen (WH1): nicht gebaut, wartet auf die Freigabe des Prototyps |
| [plans/KI-TEXTMODELL-WECHSEL.md](plans/KI-TEXTMODELL-WECHSEL.md) | Günstigeres Textmodell (KM1): Aufstellung der Proben vom 2026-11-19, nichts gebaut |
| [plans/BRAND-BOOK-KIT.md](plans/BRAND-BOOK-KIT.md) | Brand Book & Kit (Produkt 03, BK1): K0 bis K6 gebaut; offen K7, K8 und Davids Blicke |
| [plans/BRAND-INSIGHTS.md](plans/BRAND-INSIGHTS.md) | Brand Insights (BI1): I0 bis I5 und I6 Stufe 1 gebaut; offen I6 Stufe 2, Anwaltsantworten, Newsletter-Schalter. Die Fortsetzung BI2 (Kuration) ist gebaut: [archiv/BRAND-INSIGHTS-KURATION.md](archiv/BRAND-INSIGHTS-KURATION.md) |
| [plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md) | branding.supply — Rechtstexte und Bezahlweg (BS1): entschieden 2026-09-07, teils gebaut; offen R2, R2c, R3, Z1 |
| [plans/BRANDING-SUPPLY-FAKTENBLATT.md](plans/BRANDING-SUPPLY-FAKTENBLATT.md) | Unterlage zu BS1: Faktenblatt für den Rechtstext-Generator und den Anwalt |
| [plans/BRANDING-SUPPLY-RECHTSTEXTE-ENTWURF.md](plans/BRANDING-SUPPLY-RECHTSTEXTE-ENTWURF.md) | Unterlage zu BS1: Erstfassung der Rechtstexte aus dem Generator — Entwurf, ungeprüft |
| [plans/STUDIO-ERSTGESPRAECH-FUNNEL.md](plans/STUDIO-ERSTGESPRAECH-FUNNEL.md) | Studio-Funnel: der Erstgespräch-Wizard ist live; offen die Reste aus W2 bis W4 |
| [plans/PRIVATE-NACHRICHTEN-KONZEPT.md](plans/PRIVATE-NACHRICHTEN-KONZEPT.md) | Private Nachrichten: Stufe 1 live; ungebaut der Rest von Stufe 2 und Stufe 3 — bewusst keine offenen Punkte |
| [plans/F7-PAID-COMMUNITIES-KONZEPT.md](plans/F7-PAID-COMMUNITIES-KONZEPT.md) | Bezahlte Mitgliedschaften (F7): Konzept, vier Entscheidungen gefallen (2026-08-15), nichts gebaut |
| [plans/F7-PAYMENTS-CONNECT.md](plans/F7-PAYMENTS-CONNECT.md) | F7, Geldfluss 2: Entscheidungsvorlage vom 2026-08-01, nichts gebaut |
| [plans/offen/](plans/offen/README.md) | **Einzelheiten je offenem Punkt** (eine Datei je Kürzel, seit 2026-11-21): was bis dahin im Anhang von OPEN-ITEMS.md stand. Keine zweite Liste |

**Regel:** Sobald ein Plan ausgeführt ist, wandert er nach `archiv/` und seine
Reste nach `OPEN-ITEMS.md`. Ein Plan-Dokument ist nie eine To-do-Liste.

## Archiv — ausgeführt, nur noch Historie

Erledigte Umzugs-Anleitungen liegen hier, nicht mehr bei den Runbooks (Davids
Entscheidung 2026-11-16): [CONTROL-CUTOVER](archiv/CONTROL-CUTOVER.md)
(studio → control, 2026-07-26), [ACCOUNT-CUTOVER](archiv/ACCOUNT-CUTOVER.md)
(AH-1: Projekt `pool` → `account`), [ADMIN-CUTOVER](archiv/ADMIN-CUTOVER.md)
(AH-4: `control.` → `admin.`), [ADMIN-PROJEKT-CUTOVER](archiv/ADMIN-PROJEKT-CUTOVER.md)
und [F3-CUTOVER](archiv/F3-CUTOVER.md). Sie bleiben als Protokoll und Rezept;
ihre Befehle und Pfade beschreiben den Tag des Umzugs, nicht den heutigen Stand.

Erledigte Betriebs-Skripte (Appwrite-Upgrades) liegen unter
[archiv/skripte/](archiv/skripte/README.md) — dort steht auch die Regel, wann
ein Skript archiviert und wann es gelöscht wird.

`archiv/` enthält die abgearbeiteten Pläne (M1–M10, Phase 17, Themes-Vollausbau,
Embed-Widget, Landingpage, SaaS-Roadmap, das
[Discussions-Konzept](archiv/DISCUSSIONS-KONZEPT.md), den
[Pool/Silo-Blueprint](archiv/HORIZONT-3-POOL-SILO-BLUEPRINT.md), die Pläne der
Marken-Werkstatt wie [Brand-Wizard Phase 1](archiv/BRAND-WIZARD-PHASE-1.md),
[Branding-Atome](archiv/BRAND-WIZARD-SESSIONS.md),
[Marktvergleich](archiv/BRAND-MARKTVERGLEICH.md),
[Brand Design](archiv/BRAND-DESIGN.md) und
[Discover Brands](archiv/DISCOVER-BRANDS.md), den
[Infra-Plan für branding.supply](archiv/BRANDING-SUPPLY-INFRA.md), dazu
[AI-Runner](archiv/AI-RUNNER.md), [Analytics v2](archiv/ANALYTICS-V2.md) und die
[Dashboard-Informationsarchitektur](archiv/DASHBOARD-IA.md), …). Die Karte zählt
sie nicht einzeln auf — ins Archiv kommt man über einen Verweis, nicht über
eine Liste.

`archiv/audits/` enthält die Audits: Gesamtaudit 05.07., Pool-Audit 27.07.,
Dashboard-Audit 28.07., die drei Berichte vom 09.08.
([UX-Trichter](archiv/audits/2026-08-09-ux-trichter.md),
[UX-Dashboard](archiv/audits/2026-08-09-ux-dashboard.md),
[Wettbewerbsvergleich](archiv/audits/2026-08-09-wettbewerb-benchmark.md)), die
Audits vom 15. und 16.08., das Audit der Session-Inhalte (04.09.) und das
[Brand-Design-Audit](archiv/audits/BRAND-DESIGN-AUDIT-2026-09-09.md) (09.09.).
Das Gesamtaudit 2026-11 liegt bewusst nicht im Repo
([runbooks/GESAMTAUDIT.md](runbooks/GESAMTAUDIT.md)).

Sie sind wertvoll als **Begründung** („warum liegt das so?") und als **Rezept**
(der nächste Server folgt Phase 17 wieder) — aber niemand muss sie lesen, um zu
wissen, was zu tun ist. Ihre offenen Kästchen sind bewusst zu Aufzählungen
entschärft, damit sie nicht als Arbeit gelesen werden (ein offenes Kästchen im
Archiv ist in `pnpm check:doc-links` rot).

## Doku-Site (`docs/content/`)

`content/` ist **Produkt**, kein Planungsdokument: die interne, durchsuchbare
Doku-Site (Nuxt UI + Nuxt Content nach dem Vorbild des
[Nuxt-Docs-Templates](https://docs-template.nuxt.dev/)), live hinter
Operator-Login auf `admin.pukalani.app/docs`.

Bewusst **kein** Pukalani-Layer und keine App unter `apps/` — der Manifest-Check
verlangt dort Site-Manifest + Appwrite-Setup, und die Docs brauchen beides
nicht.

```bash
pnpm dev:docs      # → http://localhost:4000
```

- Neue Seite: Markdown unter `content/<n>.<kapitel>/` mit Frontmatter
  (`title`, `description`, `navigation.icon`) — Navigation und Suche entstehen
  automatisch.
- Neues Kapitel: Ordner mit `.navigation.yml` (`title`, `icon: false`).
- Statischer Export: `pnpm --filter @pukalani/docs generate`.
- Änderungen unter `content/` lösen einen Deploy aus (der control-Build bettet
  sie ein).

Die **kundenseitige** Hilfe ist etwas anderes: `apps/help/content/` →
`help.pukalani.app`.
