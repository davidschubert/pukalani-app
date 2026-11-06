# Doku-Karte

Wo steht was — und was ist die **eine** Datei, in die offene Arbeit gehört.
Stand: 2026-08-10.

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
| **[OPEN-ITEMS.md](OPEN-ITEMS.md)** | **DIE EINE offene-Punkte-Liste — und zwar NUR Offenes** (Regel von David, 2026-07-30). Eine Tabelle „Jetzt dran — in dieser Reihenfolge" mit Prio, Aufwand und „Braucht David?", darunter „Geparkt / wartet". Max. 3 Zeilen je Eintrag; Einzelheiten leben im verlinkten Plan. Neue offene Punkte kommen HIERHER — nie in ein Plan-Dokument. |
| **[OPEN-ITEMS-COMPLETE.md](OPEN-ITEMS-COMPLETE.md)** | **Finales Archiv der erledigten Punkte = unser Lern-Gedächtnis.** Jeder Eintrag vollständig, mit Datum und einer Zeile **Gelernt:**, wo etwas nicht auf Anhieb ging. Ausdrücklich KEINE Arbeitsliste — hier wird nachgelesen, nicht abgearbeitet. |
| [GOALS.md](GOALS.md) | **Abgeschlossene Chronik** der `/goal`-Ära (Phasen 1–27, 09.06.–08.07.2026). Keine Arbeitsliste, keine neuen Phasen — was ansteht, steht in OPEN-ITEMS.md |
| [DECISION-LOG.md](DECISION-LOG.md) | Beschluss-Protokoll: welche Entscheidung wann, mit Begründung |
| [CONCEPT.md](CONCEPT.md) | Architektur-Bibel A1–A15 (Layer-Grenzen, Verträge, Invarianten, Mandanten-Architektur) |

Dazu im Repo-Wurzelverzeichnis: [../README.md](../README.md) (Einstieg +
Phasen-Statustabelle), [../CLAUDE.md](../CLAUDE.md) (die Regeln für
KI-Agenten — **die eine Quelle**, `AGENTS.md` zeigt nur darauf),
[../CHANGELOG.md](../CHANGELOG.md) (Release-Historie, von release-please
gepflegt).

## Referenz — wie ist es gebaut

| Datei | Thema |
| --- | --- |
| [referenz/WORKFLOW.md](referenz/WORKFLOW.md) | **Arbeitsablauf je Vorhaben** — Strategie→Konzeption→Prototyp→Umsetzung→Audit→Testing→Deploy→Docs; gilt für ALLE Projekte |
| [referenz/SESSION-HYGIENE.md](referenz/SESSION-HYGIENE.md) | **Sitzungs-Hygiene** — Kontext, Nutzungslimit, Modell/Effort je Rolle, Ausgaben deckeln; 24 Video-Tipps bewertet, MCP-gegen-CLI-Vorschlag |
| [referenz/MULTI-SITE-PLATFORM-STRATEGIE.md](referenz/MULTI-SITE-PLATFORM-STRATEGIE.md) | Produkt-Manifeste, Layer/App-Komposition |
| [referenz/PRODUKT-BILANZ.md](referenz/PRODUKT-BILANZ.md) | „Ein Konzept pro Produkt" — welche App welches Produkt montiert, wer durch die Datentür geht (ERZEUGT: `node scripts/produkt-bilanz.mjs`) |
| [referenz/G0-PRODUKTVERTRAG.md](referenz/G0-PRODUKTVERTRAG.md) | Produktvertrag: Rollen, Tarif, Umfang |
| [referenz/RBAC-CONCEPT.md](referenz/RBAC-CONCEPT.md) | Operator-Labels + Capability-Matrix |
| [referenz/MODERATION-AND-LAYER-BOUNDARIES.md](referenz/MODERATION-AND-LAYER-BOUNDARIES.md) | Moderations-Verträge über Layer-Grenzen |
| [referenz/THEMES-CONCEPT-V2.md](referenz/THEMES-CONCEPT-V2.md) | Theme-System + bewusste Ablehnungen |
| [referenz/AUTH-FORMS.md](referenz/AUTH-FORMS.md) | Warum Login/Register eigene UForms sind |
| [referenz/EMBED.md](referenz/EMBED.md) | Embed-Widget: Gates, CSP, Cookie-Verhalten |
| [referenz/EIGENE-DOMAIN.md](referenz/EIGENE-DOMAIN.md) | Kundendomains: Pool-Tenant vs. Silo-Alias, Zustandskette, kanonischer Host |
| [referenz/CHANGELOG-WORKFLOW.md](referenz/CHANGELOG-WORKFLOW.md) | Release-Please + Kunden-Changelog |
| [referenz/LIVE-BEWEISE.md](referenz/LIVE-BEWEISE.md) | Welche Beweis-Skripte es gibt und wogegen sie laufen |
| [referenz/FIGMA-KORREKTURFLAECHE.md](referenz/FIGMA-KORREKTURFLAECHE.md) | Figma als Korrekturfläche: Zyklus, Token-Brücke, die vier Diff-Klassen |

## Runbooks — Schritt für Schritt im Betrieb

| Datei | Wofür |
| --- | --- |
| [runbooks/DEPLOYMENT.md](runbooks/DEPLOYMENT.md) | Neue App/Site aufsetzen, Envs, Migrationen, ploi-Felder |
| [runbooks/STRIPE-GO-LIVE-RUNBOOK.md](runbooks/STRIPE-GO-LIVE-RUNBOOK.md) | Stripe vom Testmodus auf echtes Geld |
| [runbooks/STRIPE-TEST-WALKTHROUGH.md](runbooks/STRIPE-TEST-WALKTHROUGH.md) | Die 6 Testmodus-Proben davor |
| [runbooks/CONTROL-CUTOVER.md](runbooks/CONTROL-CUTOVER.md) | Control-Host-Umzug (+ die drei Restkrümel) |
| [runbooks/ACCOUNT-CUTOVER.md](runbooks/ACCOUNT-CUTOVER.md) | AH-1: Projekt `pool` → `account` und Host `my.`/`start.` → `account.` in EINEM Fenster |
| [runbooks/PLATFORM-CONTROL-KEY-SWAP.md](runbooks/PLATFORM-CONTROL-KEY-SWAP.md) | Appwrite-Key rotieren |
| [runbooks/APPWRITE-KEYS.md](runbooks/APPWRITE-KEYS.md) | Wer hält welchen Schlüssel im Projekt `control` — und wie man das nachmisst |
| [runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md](runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md) | Erste echte Kundendomain freischalten (Pool-Community **und** Silo-Site) |
| [runbooks/GOOGLE-LOGIN.md](runbooks/GOOGLE-LOGIN.md) | „Anmelden mit Google" scharfschalten (Google-Console, Appwrite-Console, die zwei Schalter) |
| [runbooks/MARKTVERGLEICH-EINFUEHRUNG.md](runbooks/MARKTVERGLEICH-EINFUEHRUNG.md) | Produkt `market` auf `branding` einschalten: sechs Migrationen, ein Schalter, Rauchtest (Durchlauf 2026-09-06 abgehakt) |
| [runbooks/PRODUKTIONS-ALARM.md](runbooks/PRODUKTIONS-ALARM.md) | Produktions-Wächter + Alarmweg (Issue/Mail/Heartbeat), Probealarm, Davids Klickliste, was bei einem Alarm zu tun ist |
| [runbooks/MARKTVERGLEICH-BIBLIOTHEK.md](runbooks/MARKTVERGLEICH-BIBLIOTHEK.md) | Bibliotheks-Einträge rechnen und von Hand prüfen (bezahlter Lauf, Handzeichen, Auffrischung nach 90 Tagen) |

Die Häkchen in Runbooks sind **echt** — sie werden pro Durchlauf abgehakt und
gehören dort hin.

## Pläne — noch nicht gebaut

| Datei | Zustand |
| --- | --- |
| [archiv/BRAND-WIZARD-SESSIONS.md](archiv/BRAND-WIZARD-SESSIONS.md) | Branding-Atome (BW2): Pakete 1–8 ausgeführt 2026-09-04/05 — Lese-Fassung der 68 Session-Inhalte: [referenz/BRAND-WIZARD-SESSION-INHALTE.md](referenz/BRAND-WIZARD-SESSION-INHALTE.md) (generiert) |
| [archiv/BRAND-MARKTVERGLEICH.md](archiv/BRAND-MARKTVERGLEICH.md) | Marktvergleich (MV1): **ausgeführt** — M0–M6b live seit 2026-09-06; offen nur noch Davids Rechts-Check und die Handprüfung der Rest-Entwürfe (OPEN-ITEMS Zeile 9) |
| [archiv/BRAND-DESIGN.md](archiv/BRAND-DESIGN.md) | Brand Design (Produkt 02, BD1): Strategie, Konzept, Prototyp, Pakete D0–D9 + Audit — **ausgeführt und abgenommen 2026-09-09**, live auf branding.supply; Audit: [archiv/audits/BRAND-DESIGN-AUDIT-2026-09-09.md](archiv/audits/BRAND-DESIGN-AUDIT-2026-09-09.md) |
| [plans/PRIVATE-NACHRICHTEN-KONZEPT.md](plans/PRIVATE-NACHRICHTEN-KONZEPT.md) | Stufe 1 komplett (inkl. F56, 2026-08-13); ungebaut nur Stufen 2/3 — bewusst keine offenen Punkte |
| [plans/DASHBOARD-IA.md](plans/DASHBOARD-IA.md) | Schritt 3 + Community-Hub gebaut; **12 der 14 Schritt-4-Seiten fehlen** — als U15 jetzt in OPEN-ITEMS geführt |
| [plans/ANALYTICS-V2.md](plans/ANALYTICS-V2.md) | Pakete 1–4 live; Rest = Optionales (F47) |
| [archiv/DISCOVER-BRANDS.md](archiv/DISCOVER-BRANDS.md) | Discover Brands (DB1): AUSGEFÜHRT 2026-09-08/09 — D0–D5 live (Galerie, Anatomie, Freigabe, Betreiber-Seite, Beispiel Kailua, Sitemap + OG-Bild); Konzept + acht Entscheidungen als Rezept. (Vorher: D0 (Prototyp am Dummy) wartet auf Abnahme |
| [plans/BRAND-BOOK-KIT.md](plans/BRAND-BOOK-KIT.md) | Brand Book & Kit (Produkt 03, BK1): Strategie freigegeben + **Konzeption geschrieben 2026-09-09** (§1.11 acht + §2.20 sechs Entscheidungen: ein Produkt, dritte Schicht in `brand`, DTCG-Kit mit `brand.md`/`brand.json`, Lieferseite, Freischaltung „Ableitung", 149 € netto via BS1) — Prototyp (§2.15) wartet auf die Konzept-Freigabe |
| [plans/BRAND-INSIGHTS.md](plans/BRAND-INSIGHTS.md) | Brand Insights (BI1): Redaktionskonzept entschieden 2026-09-07 (Davids zwölf Entscheidungen) — Strategie-/Konzeptrunde folgt nach DB1 |
| [plans/BRAND-INSIGHTS-KURATION.md](plans/BRAND-INSIGHTS-KURATION.md) | Brand Insights Fortsetzung (BI2): Kanalliste bearbeitbar, Cluster erweitert, Filter/Sortierung, eigene Fundstück-Liste per YouTube-Link, Dreifach-Urteil, KI-Brief aus Video, Kommentare nach I3 — **Konzept geschrieben 2026-09-09, drei Entscheidungsfragen offen (A/B/C)** |
| [plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md](plans/BRANDING-SUPPLY-RECHT-UND-BEZAHLUNG.md) | branding.supply — Rechtstexte + Bezahlweg (BS1): Strategie + Konzept geschrieben 2026-09-07, acht Entscheidungsfragen offen; Vorbedingung fürs Öffnen der Beta |
| [plans/F7-PAYMENTS-CONNECT.md](plans/F7-PAYMENTS-CONNECT.md) | Entscheidungsvorlage, nichts gebaut (F7) |
| [plans/CHANGELOG-3.0.0-ENTWURF.md](plans/CHANGELOG-3.0.0-ENTWURF.md) | fertiger Kundentext — **ob er eingefügt ist, muss David nachsehen** |

**Regel:** Sobald ein Plan ausgeführt ist, wandert er nach `archiv/` und seine
Reste nach `OPEN-ITEMS.md`. Ein Plan-Dokument ist nie eine To-do-Liste.

## Archiv — ausgeführt, nur noch Historie

`archiv/` enthält 38 abgearbeitete Pläne (M1–M10, Phase 17, Themes-Vollausbau,
Embed-Widget, Landingpage, SaaS-Roadmap, zuletzt das
[Discussions-Konzept](archiv/DISCUSSIONS-KONZEPT.md) und den [Pool/Silo-Blueprint](archiv/HORIZONT-3-POOL-SILO-BLUEPRINT.md), …) und `archiv/audits/` die sechs
Audits (Gesamtaudit 05.07., Pool-Audit 27.07., Dashboard-Audit 28.07. sowie
die drei Berichte vom 09.08.: [UX-Trichter](archiv/audits/2026-08-09-ux-trichter.md),
[UX-Dashboard](archiv/audits/2026-08-09-ux-dashboard.md),
[Wettbewerbsvergleich](archiv/audits/2026-08-09-wettbewerb-benchmark.md) — ihre
Pakete stehen als U1–U15 in [OPEN-ITEMS.md](OPEN-ITEMS.md)).

Sie sind wertvoll als **Begründung** („warum liegt das so?") und als **Rezept**
(der nächste Server folgt Phase 17 wieder) — aber niemand muss sie lesen, um zu
wissen, was zu tun ist. Ihre offenen Kästchen sind bewusst zu Aufzählungen
entschärft, damit sie nicht als Arbeit gelesen werden.

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
