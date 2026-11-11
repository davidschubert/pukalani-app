# Gesamtaudit – Ablauf und Prompts

Ein Gesamtaudit prüft die ganze Plattform in zwölf Dimensionen (Code, Backend,
Sicherheit, Frontend, Performance, SEO, GEO, UI, UX/Barrierefreiheit, Branding,
Doku, Betrieb) und endet nicht bei einer Mängelliste, sondern bei Learnings, die
als Regel, Wächter oder Test ins Projekt zurückfließen. Es läuft über mehrere
Claude-Code-Sessions mit Fable 5.2 auf Effort `high`.

Grundlage ist Davids generisches „Fable 5.2 Audit-Playbook – SaaS-Plattform"
(2026-11-11). Dieses Runbook ist die an Pukalani angepasste Fassung. Die
Abweichungen vom Original stehen am Ende unter „Warum anders als das Playbook".

## Die drei Grundregeln dieses Projekts

1. **Ergebnisse liegen privat, nie im Repo.** Das Repo ist öffentlich. Alle
   Audit-Artefakte liegen im Audit-Ordner `~/Developer/Claude/Audits/pukalani-<JJJJ-MM>/`
   mit eigenem lokalem Git ohne Remote. Ins Repo kommen nur Fixes und am Ende eine
   entschärfte Zusammenfassung (siehe Phase 6).
2. **Es gibt kein Staging.** Gemessen wird gegen den lokalen Production-Build mit
   der lokalen Appwrite, die ein Spiegel von Production ist
   ([APPWRITE-PROD-SPIEGEL.md](APPWRITE-PROD-SPIEGEL.md)). Sie enthält echte
   Nutzerdaten: Evidence bleibt im Audit-Ordner. Production wird nur über
   öffentliche Seiten und `/api/health` gelesen.
3. **Bekanntes ist kein neuer Befund.** `docs/OPEN-ITEMS.md`, `DECISION-LOG.md`,
   die früheren Audits in `docs/archiv/audits/` und die Liste bewusster
   Abweichungen in `.claude/agents/audit-worker.md` (§0) sind Prüfmaßstab.

## Ablauf

| Phase | Session(s) | Effort | Ergebnis im Audit-Ordner |
| --- | --- | --- | --- |
| 1 Discovery & Charter | 1 | `high` | `00-charter.md`, `01-guidelines.md`, `02-plan.md`, `STATE.md`, Baseline |
| 2 Audit je Dimension | 2–n laut Plan | `high` (Security ggf. `xhigh`) | `findings/*.md`, `INDEX.md`, `findings.json` |
| 3 Synthese | 1 | `high` | `90-synthesis.md`, `LEARNINGS.md`, `DECISIONS.md`, `proposals/` |
| 4 Review mit David | 1, interaktiv | `medium` | `DECISIONS.md` ausgefüllt |
| 5 Umsetzung | 1 je Paket, im Repo | `high` | Branches/PRs im Repo, Status im Audit-Ordner |
| 6 Rückführung | in der letzten Umsetzungs-Session | `high` | OPEN-ITEMS, DECISION-LOG, Rules, Archiv-Zusammenfassung |
| 7 Delta-Audit | nach 2–3 Monaten | `high` | `delta-<datum>.md` |

Jede Phase ist eine neue Session (Session = Paket, [SESSION-HYGIENE.md](../referenz/SESSION-HYGIENE.md)).
Die Übergabe läuft über `STATE.md` im Audit-Ordner, nicht über den Gesprächsverlauf.

## Vorbereitung (je Durchlauf abhaken)

- [ ] Audit-Ordner `~/Developer/Claude/Audits/pukalani-<JJJJ-MM>/` anlegen: Skelett
      wie im README des Durchlaufs 2026-11, `git init`, `.gitignore` mit `.env.audit`.
- [ ] `inputs/context.md` ausfüllen (der Durchlauf 2026-11 hat eine vorbefüllte
      Fassung; alle Stellen mit **[David]** ergänzen).
- [ ] Lokale Appwrite frisch spiegeln, falls der letzte Spiegel alt ist.
- [ ] Zwei lokale Audit-Testnutzer anlegen: einen ohne Labels und Rollen
      (least privilege), einen als Owner einer Test-Community. Zugang in
      `<Audit-Ordner>/.env.audit`. Nie Production-Zugänge, nie Keys aus
      `~/.appwrite-secrets/`.
- [ ] Werkzeuge entscheiden: `gitleaks` und `lighthouse` sind nicht installiert.
      Erlaubnis oder Verbot in `inputs/context.md` eintragen, sonst fragt jede
      Session erneut.
- [ ] Rechte härten. Im Bypass-Modus wirkt nur `deny`, alle „nur nach
      Rückfrage"-Regeln im Prompt sind dort nur Bitten. Für Audit-Sessions
      deshalb **nicht** im Bypass-Modus arbeiten, oder zusätzlich `deny` auf
      `Read(~/.appwrite-secrets/**)` und auf die schreibenden Appwrite-, Ploi-
      und Resend-Werkzeuge setzen.
- [ ] Session im Repo-Root auf frischem `origin/main` starten (Desktop-App:
      Worktree; vorher `git fetch`), den Audit-Ordner als zusätzlichen Ordner
      freigeben (CLI: `--add-dir`), Fable 5.2 wählen, Effort `high`.
- [ ] Nach der Charter: Davids Freigabe oder Korrektur direkt in
      `00-charter.md`/`01-guidelines.md` eintragen, erst dann Session 2.

## Prompt Session 1 – Discovery & Charter

`{{AUDIT_DIR}}` durch den absoluten Pfad des Audit-Ordners ersetzen.

```text
# Rolle und Ziel
Du führst ein vollständiges, unabhängiges Audit der Pukalani-Plattform durch (dieses Repo). Geprüft werden Codebase und Architektur, Backend, Sicherheit und Datenschutz, Frontend, Performance, SEO, GEO (Sichtbarkeit in KI-Suchsystemen), UI-Design, UX und Barrierefreiheit, Branding, Dokumentation sowie Betrieb und Tests.

Das Audit läuft über mehrere Sessions. Diese erste Session ist die Discovery: Du findest heraus, was für ein Projekt das ist, und legst daraus fest, wie das Audit geprüft, dokumentiert und präsentiert wird. Ziel ist nicht nur eine Mängelliste, sondern Learnings, die ich mit dir bespreche und danach dauerhaft ins Projekt übernehme.

# Wo die Ergebnisse liegen
Alle Audit-Artefakte liegen im Audit-Ordner {{AUDIT_DIR}} (eigenes lokales Git, kein Remote). Das Repo ist öffentlich: Du schreibst nichts ins Repo, legst keinen Branch, kein Issue, keinen PR und keinen Tag an und kopierst keinen Befund in ein Werkzeug, das Daten nach außen gibt.

# Was du darfst
Ohne Rückfrage erlaubt:
- Dateien im Repo lesen und durchsuchen, git log, git blame, git diff, git fetch
- Lint, Typecheck, Tests und lokalen Build mit den vorhandenen Skripten ausführen
- pnpm audit, pnpm outdated
- Lighthouse- und Bundle-Analysen gegen localhost, sofern das Werkzeug laut {{AUDIT_DIR}}/inputs/context.md erlaubt oder vorhanden ist
- Öffentliche Seiten der Production-Hosts aus context.md und /api/health abrufen (nur lesen)
- Die lokalen Apps im Production-Build starten und mit den Audit-Testnutzern aus {{AUDIT_DIR}}/.env.audit bedienen
- Dateien unter {{AUDIT_DIR}} anlegen und ändern und dort committen
- Explore, audit-scout und audit-worker als Subagents nutzen (Regeln unten)
- Fehlgeschlagene lesende Befehle nach einer Diagnose wiederholen

Nur nach Rückfrage bei mir:
- Pakete installieren oder Lockfiles ändern (auch npx mit nicht installiertem Paket)
- Jede Änderung im Repo
- Jede Anfrage an Production, die mehr tut als öffentliche Seiten zu lesen; Anmeldungen auf Production
- Schreibzugriffe auf die lokale Appwrite außerhalb dessen, was die App als Audit-Testnutzer selbst tut
- Deployments, Push, Merge, jedes MCP-Werkzeug von Ploi, Resend oder der Appwrite-API

Verboten: Dateien unter ~/.appwrite-secrets/ lesen, Production-Keys verwenden, personenbezogene Daten aus dem Spiegel in Findings abschreiben (Fundstelle und Art der Daten genügen).

Sicherheitsprüfung ist defensiv: Du beschreibst Schwachstelle, Fundstelle, Auswirkung und Fix. Du schreibst keinen Exploit-Code, keine Angriffs-Payloads und führst keine aktiven Angriffe aus.

# Schritt 1 – Bestandsaufnahme
Lies zuerst alles unter {{AUDIT_DIR}}/inputs/. Dann im Repo: CLAUDE.md, alle .claude/rules/*.md, .claude/agents/audit-worker.md (die Liste bewusster Abweichungen in §0 ist verbindlicher Prüfmaßstab), docs/README.md, docs/CONCEPT.md (A14 Layer-Grenzen), docs/DECISION-LOG.md, docs/OPEN-ITEMS.md, die Audits in docs/archiv/audits/ und docs/OPEN-ITEMS-COMPLETE.md (per Suche, nicht komplett lesen).
Halte in der Charter den Audit-Stand fest: den SHA von origin/main, gegen den geprüft wird.
Erfasse:
- Stack und Versionen, pnpm-Katalog, Layer-Struktur (core, Produkt-Layer, blueprint, apps) und Produkt-Manifeste
- Größe je Layer und App, Einstiegspunkte, Routen und Seiten
- Server-Routes und API-Endpunkte, Appwrite-Projekte, Tables, Buckets, Functions, Permissions-Konzept (Datentür tenantDb, Row-Permissions), soweit im Code und in den Migrationen sichtbar
- Auth-Konzept, RBAC, Mandantenmodell (Pool vs. Silo, Kontroll-Hosts)
- Externe Integrationen: Stripe, Resend, OpenRouter/KI, Plausible, Turnstile, Cloudflare
- Deployment (ploi, GitHub Actions), Wächter (check:*), Tests, Monitoring, vorhandene Dokumentation

Baseline: pnpm -r lint, pnpm -r typecheck, pnpm -r test, ein lokaler Build und pnpm audit einmal ausführen (Node 22). Rohausgaben unter {{AUDIT_DIR}}/evidence/baseline/. Exit-Codes getrennt von der Ausgabe festhalten, nie über eine Pipe.

# Schritt 2 – Projekt verstehen und einordnen
- Was ist das Produkt, für wen, wie verdient es Geld? Gleiche Code, Doku und Marketing-Seiten mit context.md ab. Markiere jede Ableitung als Annahme.
- Die 5–8 kritischen User Journeys (z. B. Registrierung mit Turnstile und AGB, Community anlegen im Wizard, Kernaufgabe je Produkt, Abo abschließen, Kündigung, Datenexport und Kontolöschung).
- Datenklassen und Schutzbedarf: personenbezogene Daten, Zahlungsdaten, Mandantendaten, UGC. DSGVO gilt als gesetzt.
- Reifegrad und Teamsituation anhand der Git-Historie.
- Risikoprofil: Welche Dimensionen sind für genau dieses Projekt geschäftskritisch? Gewichte und begründe.
- Was die früheren Audits schon abgedeckt haben und was seitdem neu gebaut wurde (git log seit dem jeweiligen Audit-Datum). Neue Flächen bekommen Vorrang.

# Schritt 3 – 00-charter.md
Projektsteckbrief, Audit-Stand (SHA), Scope und Nicht-Scope, Annahmen, Risikoprofil mit Gewichtung, kritische Journeys, Datenklassen, offene Fragen an mich. In zehn Minuten lesbar.

# Schritt 4 – 01-guidelines.md (Prüfrichtlinien)
Je Dimension: Ziel, konkrete Prüffragen für dieses Projekt, Methode und Werkzeuge, Art des Belegs, Referenzstandard, was ausdrücklich nicht geprüft wird. Die Projektregeln aus CLAUDE.md und .claude/rules/ sind Prüfmaßstab; wo ein allgemeiner Standard einer bewussten Projektentscheidung widerspricht, gilt die Projektentscheidung, und du nennst den Widerspruch höchstens als Info.

Mindestkatalog – du erweiterst ihn passend zum Projekt und streichst nur mit Begründung:
1. Codebase & Architektur: Layer-Grenzen (CONCEPT.md A14, blueprint als einziger Kompositions-Layer), Produkt-Manifeste, Kopplung, Duplikate, toter Code, Typsicherheit, Fehlerbehandlung, Konventionen, Abhängigkeiten (eine Version je Kernabhängigkeit, Katalog, Lizenzen)
2. Backend & Datenmodell: API-Design, Zod-Validierung, Autorisierung je Endpunkt, Mandantentrennung über die Datentür, Permissions auf Tables, Rows und Buckets, Functions, Webhooks (Stripe, Resend: Signatur, Idempotenz), Migrationen, Rate Limiting, Logging
3. Sicherheit & Datenschutz: OWASP Top 10 und ASVS als Raster, Secrets im Repo und in der Git-Historie (öffentliches Repo!), Session- und Cookie-Handling, XSS (u. a. v-html, Markdown-Rendering), CSRF, SSRF (KI-Abrufe, Video-URLs, Favicon-Upload), Uploads, Security-Header, CORS, verwundbare Abhängigkeiten, DSGVO (Einwilligung, Datensparsamkeit, Export/Löschung über die User-Data-Contributors, Auftragsverarbeiter, KI-Anbieter und Region)
4. Frontend: Komponentenarchitektur, Pinia, SSR und Hydration, Fehler- und Ladezustände, Formulare, i18n
5. Performance: Core Web Vitals gemessen, Bundle-Größe, Code-Splitting, Bilder, Fonts, Caching, Rendering je Route, Appwrite-Abfragen (N+1, Query.limit, Indizes), Realtime-Last
6. SEO: gerendertes HTML, Meta-Daten, Canonicals, Sitemap, robots.txt, strukturierte Daten, hreflang, interne Verlinkung, Statuscodes, Kundendomains
7. GEO: KI-Crawler in robots.txt, Entitäts- und Produktbeschreibungen, zitierfähige Inhalte, strukturierte Daten; nicht standardisierte Konventionen (z. B. llms.txt) als solche kennzeichnen
8. UI-Design: Theme-Tokens, Typografie, Farbe, Abstände, Nuxt-UI-Konsistenz, Zustände, Responsive, Dark Mode
9. UX & Barrierefreiheit: kritische Journeys, Leerzustände, Fehlermeldungen, Microcopy; WCAG 2.2 AA automatisiert und per Tastatur-Stichprobe
10. Branding & Content: Produkt, Marketing-Sites und E-Mails; Wir-Stimme, Anrede, Begriffe („Produkte"); Abgleich mit Brand Book/Kit
11. Dokumentation & DX: README, Setup von null, Doku-Ordnung, Abweichungen zwischen Doku und Code
12. Betrieb & Qualität: CI/CD, Wächter, Teststrategie und Abdeckung, Monitoring und Alarm, Backups, Umgebungen, Kosten

# Schritt 5 – Ergebnisformat
Pflichtfelder je Finding: ID (Präfix je Dimension, z. B. SEC-001) · Titel · Dimension · Schweregrad (Kritisch, Hoch, Mittel, Niedrig, Info, jeweils definiert) · Konfidenz (verifiziert, wahrscheinlich, zu prüfen) · Fundstelle (Datei:Zeile, URL oder Messung in evidence/) · Beobachtung · Auswirkung · Empfehlung · Aufwand (S, M, L) · Abhängigkeiten · Verifikation · Ursache und Muster · Bezug (neu / bekannt aus OPEN-ITEMS # / Regression eines früheren Befunds) · Status.
Belegpflicht: jedes Finding braucht einen Beleg aus diesem Projekt. Allgemeine Best Practices ohne Beleg gehören in „Empfehlungen ohne Befund". Lege außerdem fest: Scorecard (0–5 je Dimension, ein Satz Begründung), findings/INDEX.md, Schema von findings.json, Aufbau von 90-synthesis.md, LEARNINGS.md und DECISIONS.md. Was gut gelöst ist, gehört zu den Learnings.

# Schritt 6 – 02-plan.md
Schneide das Audit in Sessions, die jeweils in einer Session fertig werden, Reihenfolge nach Risiko. Sicherheit und Backend schneidest du nach Layer-Gruppen (wie Audit-Runde 5 in docs/archiv/audits/AUDIT-2026-08-16.md), nicht als eine Session. Je Session: Scope, nötige Eingaben von mir, erwartete Artefakte, Effort-Level, Subagents ja/nein.

Subagents nur, wenn ein Bereich groß ist und unabhängig geprüft werden kann. Muster: audit-scout (Haiku) sammelt Kandidaten, audit-worker (Opus) beurteilt eine Scheibe, Explore für breite Suchen. Jeder Subagent bekommt den passenden Charter-Auszug, das Finding-Schema und die Belegpflicht. Du prüfst jeden Subagent-Fund selbst nach, bevor er ins Register geht.

# Schritt 7 – STATE.md und README.md
STATE.md ist die Übergabe an die nächste Session: erledigt, offen, nächster Schritt, offene Fragen an mich, Hinweise für spätere Dimensionen. STATE.md enthält Fakten und Fortschritt, keine neuen Verbote; neue Regeln schlägst du für die Charter vor, mit Grund und Geltungsbereich. Das README im Audit-Ordner gibt es schon; ergänze es nur, wenn sich die Struktur ändert.

# Kritische Funde
Findest du schon jetzt etwas Kritisches, etwa Secrets im Repo oder in der Git-Historie oder offen lesbare Kundendaten, notierst du es oben in STATE.md unter „Sofort ansehen" und nennst es in deiner Abschlussnachricht zuerst. Du behebst es nicht selbst.

# Arbeitsweise
Arbeite diese Session vollständig durch, ohne unnötig anzuhalten. Fehler, Timeouts oder fehlschlagende Befehle diagnostizierst du und arbeitest dich mit den erlaubten Mitteln durch. Bewusst gesetzte Grenzen respektierst du, meldest den Punkt und suchst einen anderen sicheren Weg. Gib alle paar Schritte eine kurze Statuszeile. Committe am Ende im Audit-Ordner.

# Checkpoint
Am Ende dieser Session hältst du an. Ich lese Charter, Richtlinien und Plan und gebe frei oder korrigiere. Vor meiner Freigabe beginnt kein Audit.

# Abschlussnachricht
Für einen klugen Leser, der deine Arbeitsschritte nicht gesehen hat. Zuerst: was für ein Projekt das ist, welche Dimensionen am riskantesten sind, was du von mir brauchst. Klare Sätze, keine selbst erfundenen Begriffe oder Abkürzungen. Deutsch; Code-Bezeichner bleiben im Original.
```

## Prompt Audit-Sessions 2–n

Nummer und Dimension ersetzen, bei Bedarf einen Zusatz anhängen.

```text
# Audit-Session {{NR}} – {{DIMENSION}}
Der Audit-Ordner ist {{AUDIT_DIR}}. Lies dort STATE.md, 00-charter.md, 01-guidelines.md und 02-plan.md. Führe Session {{NR}} so durch, wie sie im Plan steht. Charter und Richtlinien sind freigegeben; meine Korrekturen stehen dort bereits.

Es gelten alle Regeln aus der Charter: nichts im Repo ändern, Ergebnisse nur im Audit-Ordner, erlaubte und rückfragepflichtige Aktionen wie in Session 1, Belegpflicht, defensive Sicherheitsprüfung, keine personenbezogenen Daten aus dem Spiegel in Findings.

Prüfe zuerst mit git fetch, ob origin/main seit dem Audit-Stand (SHA in der Charter) weitergelaufen ist. Wenn ja, prüfst du trotzdem gegen den aktuellen Stand und notierst in den Findings, wenn eine Fundstelle erst nach dem Audit-Stand entstanden ist.

# Vorgehen
1. Bestätige in einer Statuszeile Scope und Reihenfolge laut Plan.
2. Prüfe nach den Richtlinien dieser Dimension. Messungen und Rohausgaben unter {{AUDIT_DIR}}/evidence/{{dimension}}/.
3. Schreibe Findings nach dem Schema in {{AUDIT_DIR}}/findings/{{dimension}}.md. Aktualisiere findings/INDEX.md und findings.json. IDs laufen fortlaufend weiter. Was schon in docs/OPEN-ITEMS.md steht, bekommt „Bezug: bekannt" statt einer neuen Empfehlung.
4. Halte unter „Gut gelöst" fest, was in dieser Dimension gut funktioniert und erhalten bleiben soll.
5. Vergib den Dimensions-Score (0–5) mit einem Satz Begründung.
6. Auffälligkeiten aus anderen Dimensionen arbeitest du nicht aus, sondern notierst sie in STATE.md unter „Für spätere Sessions" mit Fundstelle.
7. Aktualisiere STATE.md: erledigt, offen, nächste Session, Fragen an mich. Keine neuen Verbote; Regelvorschläge gehen mit Grund an die Charter.
8. Committe im Audit-Ordner.

# Arbeitsweise
Arbeite die Session vollständig durch. Halte nur an, wenn eine Entscheidung von mir den Rest blockiert, und arbeite an allem weiter, was nicht davon abhängt. Gib alle paar Schritte eine kurze Statuszeile.

# Abschlussnachricht
Für einen Leser ohne Kontext: zuerst die drei wichtigsten Funde mit Schweregrad, dann Score, dann was offen bleibt und was du von mir brauchst.
```

### Zusätze je Dimension

**Sicherheit & Backend** (Effort `high`, für die großen Layer-Gruppen `xhigh`):

```text
# Zusatz Sicherheit & Backend
Prüfe jeden Endpunkt und jede Server-Route der Scheibe auf Authentifizierung, Autorisierung (RBAC, requirePlanProduct) und Mandantentrennung (Datentür tenantDb, Kontroll-Hosts, Site-Label). Bei Appwrite: Permissions je Table, Row-Permissions, Bucket-Rechte, Scopes der API-Keys, Trennung zwischen Admin- und Session-Client, Env der Functions. Webhooks (Stripe, Resend): Signaturprüfung und Idempotenz. Produkt-Manifeste: apiPrefixes ohne registerProductManifest-Plugin sind ein Befund. GDPR: jeder Layer mit Nutzerdaten hat einen User-Data-Contributor.
Git-Historie: Das Repo ist öffentlich, ein Secret in der Historie ist also veröffentlicht. Suche mit git log -p und grep nach Mustern für Keys; gitleaks nur, wenn installiert oder in context.md erlaubt. Ein Fund wird nicht nur entfernt, sondern rotiert – das gehört in die Empfehlung.
Formuliere jeden Befund als Review: Fundstelle, warum es ein Risiko ist, wer betroffen ist, konkreter Fix. Kein Exploit-Code, keine Payloads, keine Tests gegen Production.
```

**Performance:**

```text
# Zusatz Performance
Miss gegen den lokalen Production-Build (nicht den Dev-Server), mobil und Desktop, je Route mindestens drei Läufe, berichte den Median. Production-Hosts nur mit öffentlichen Seiten und nur lesend. Bundle mit nuxi analyze. Liegen Felddaten in inputs/ (Plausible, Search Console, CrUX), haben sie Vorrang vor Labordaten. Prüfe Appwrite-Zugriffe auf N+1, fehlendes Query.limit, fehlende Indizes und Realtime-Abos, die ohne Grund öffnen (pukalani.realtime, startWhenHostResolves).
```

**SEO & GEO:**

```text
# Zusatz SEO & GEO
Prüfe das ausgelieferte HTML jeder Seitenvorlage per HTTP-Abruf ohne JavaScript, auf den Production-Hosts aus context.md (öffentliche Seiten) und auf localhost. Meta-Daten, Canonicals (Kundendomain vs. technischer Host), Sitemap, robots.txt, strukturierte Daten, hreflang (de/en, localePath), og:image, Statuscodes inklusive der Altnamen. GEO: welche KI-Crawler sind erlaubt oder gesperrt, und ist das eine bewusste Entscheidung? Sind Produkt, Zielgruppe und Nutzen öffentlich klar und zitierfähig beschrieben? Maßnahmen ohne etablierten Standard als solche kennzeichnen. Maßstab: .claude/rules/i18n-seo.md.
```

**UI-Design, UX, Barrierefreiheit & Branding:**

```text
# Zusatz UI, UX & Branding
Screenshots der kritischen Journeys auf localhost mit dem vorhandenen Playwright, in 375, 768 und 1440 px, hell und dunkel, angemeldet als Audit-Testnutzer, unter {{AUDIT_DIR}}/evidence/ui/. Bevorzuge Seiten, auf denen nur Testdaten zu sehen sind; zeigt ein Screenshot echte Personen aus dem Spiegel, bleibt er im Audit-Ordner und wird im Finding nur beschrieben. Ohne passenden Playwright-Aufbau fragst du vor einer Installation.
Prüfe Konsistenz gegen Theme-Tokens, app.config.ts und Nuxt UI; UTable als Standard für Datenlisten, CoreEmptyState für leere Zustände. Barrierefreiheit: automatisierte Prüfung plus Tastatur-Stichprobe der Journeys. Branding: Produkt, Marketing-Sites und E-Mail-Templates; Maßstab sind Brand Book/Kit, Wir-Stimme und Anrede-Regeln. Trenne Geschmacksurteile klar von belegbaren Inkonsistenzen.
```

**Dokumentation & DX:**

```text
# Zusatz Dokumentation & DX
Folge dem README in einem frischen Klon in einem temporären Ordner außerhalb des Repos (Node 22). Notiere jeden Schritt, der fehlt, falsch ist oder Vorwissen voraussetzt. Prüfe die Doku-Ordnung (.claude/rules/docs-ordnung.md): Offenes nur in OPEN-ITEMS, keine zweite Liste, Pläne ohne Erledigtes. Vergleiche Referenz-Doku und docs/content stichprobenartig mit dem Code und melde Abweichungen mit Fundstelle.
```

## Prompt Synthese-Session

```text
# Synthese
Der Audit-Ordner ist {{AUDIT_DIR}}. Lies dort STATE.md, die Charter, die Richtlinien, alle Dateien unter findings/ und findings.json. Alle Audit-Sessions laut Plan sind abgeschlossen. Es gelten die Regeln der Charter; du änderst nichts im Repo.

# 1. Konsolidieren
Führe Dubletten zusammen und verweise auf die ursprünglichen IDs. Prüfe Schweregrade über alle Dimensionen auf einheitliche Maßstäbe und korrigiere Ausreißer mit Begründung. Findings mit Konfidenz „zu prüfen" prüfst du nach, soweit das mit den erlaubten Mitteln geht.

# 2. Ursachen-Muster finden
Gruppiere nach gemeinsamer Ursache, nicht nach Dimension. Ein Muster braucht mindestens zwei Findings als Beleg. Prüfe bei jedem Muster, ob es schon einen Wächter (check:*), eine Lint-Regel oder eine Rule-Datei gibt, die es hätte fangen sollen, und warum sie es nicht tat.

# 3. 90-synthesis.md
- Executive Summary: eine Seite, ohne technisches Vorwissen verständlich. Gesamtbild, drei größte Risiken, drei größte Stärken.
- Scorecard: Dimension, Score 0–5, Gewichtung aus der Charter, ein Satz Begründung. Wo frühere Audits vergleichbare Aussagen machen, die Entwicklung nennen.
- Top-Risiken: die zehn wichtigsten Findings nach Schweregrad und Geschäftsrelevanz.
- Quick Wins: hohe Wirkung bei Aufwand S.
- Impact-Aufwand-Matrix als Mermaid-quadrantChart mit den Finding-IDs.
- Roadmap in drei Stufen (Jetzt, Als Nächstes, Später). Bündele Findings zu Arbeitspaketen, die jeweils in einem Branch und PR umsetzbar sind. Je Paket: Ziel, IDs, Aufwand, Abhängigkeiten, Risiko bei Nichtumsetzung, und ob es Sicherheitsbefunde enthält (dann gilt beim Umsetzen die Regel für neutrale Commit- und PR-Texte).

# 4. LEARNINGS.md
Je Muster: was passiert ist (IDs), Ursache, Regel für die Zukunft, wie die Regel abgesichert wird (Wächter check:*, Lint-Regel, Typ, Test, Template oder Konvention). Dazu „Beibehalten" mit dem, was gut funktioniert.
Schlage am Ende Ergänzungen als Diff-Vorschlag in proposals/ vor. Ziel ist die bestehende Ordnung: Domänen-Regeln nach .claude/rules/<name>.md, Wissen nach docs/referenz/, in den Kern von CLAUDE.md nur, was in jede Runde gehört, und dort kurz (Regel, ein Satz Warum, Verweis). Jede Regel nennt Grund und Geltungsbereich. Du wendest nichts an.

# 5. DECISIONS.md vorbereiten
Tabelle je Finding oder Paket: ID, Empfehlung in einem Satz, Entscheidung (leer), Begründung (leer), Paket, Zieltermin (leer), Grundsatzentscheidung ja/nein (ja = gehört später ins DECISION-LOG).

# Kommunikation
Für einen klugen Leser, der die Audit-Sessions nicht gesehen hat. Kernaussagen zuerst, ganze Sätze, aktive Sprache, für dieselbe Sache immer dasselbe Wort. Keine im Audit erfundenen Begriffe. Fließtext, wo Gedanken zusammenhängen.

Arbeite die Synthese vollständig durch und committe im Audit-Ordner. Die Abschlussnachricht nennt die drei wichtigsten Pakete und was ich als Erstes entscheiden sollte.
```

## Prompt Review mit David

```text
# Review
Der Audit-Ordner ist {{AUDIT_DIR}}. Lies dort 90-synthesis.md, LEARNINGS.md und DECISIONS.md. Wir gehen die Pakete gemeinsam durch, Reihenfolge wie in der Roadmap.
Stelle mir je Paket vor: Ziel, enthaltene Findings in je zwei bis drei Sätzen, Aufwand und Risiko bei Nichtumsetzung. Dann frag mich mit AskUserQuestion nach der Entscheidung (annehmen, ablehnen, später) und warte.
Trage Entscheidung und Begründung in DECISIONS.md ein. Wenn ich nachfrage, antwortest du mit Beleg aus evidence/ oder Fundstelle im Code.
In dieser Session änderst du nichts im Repo. Keine GitHub-Issues: das Repo ist öffentlich, die eine Liste offener Punkte ist docs/OPEN-ITEMS.md und wird erst in der Rückführung befüllt.
Am Ende: Liste der angenommenen Pakete in Umsetzungsreihenfolge, im Audit-Ordner committet.
```

## Prompt Umsetzung je Paket

Läuft im Repo, nach den normalen Projektregeln (CLAUDE.md, Git-Abschnitt: erst `main` prüfen).

```text
# Umsetzung Paket {{PAKET}}
Der Audit-Ordner ist {{AUDIT_DIR}}. Lies dort DECISIONS.md, das Paket in 90-synthesis.md und die enthaltenen Findings. Setze nur angenommene Findings um.

Vorher: git fetch, docs/OPEN-ITEMS.md und OPEN-ITEMS-COMPLETE.md auf origin/main prüfen, ob eine andere Session das schon erledigt hat.

Du darfst ohne Rückfrage: einen Branch claude/audit-{{paket}} von origin/main anlegen, Projektdateien dort ändern, Lint, Typecheck, Tests und Build ausführen, pro Finding committen, Dateien im Audit-Ordner ändern.
Nur nach Rückfrage: Pakete installieren oder entfernen, Appwrite-Schema ändern oder Migrationen fahren, Push, Merge, Deployments.

Arbeitsteilung: Die Umsetzung je Finding delegierst du an einen Opus-Subagenten mit präzisem, selbständigem Auftrag (Dateien, Ursache, gewünschte Änderung, kein Commit). Du prüfst danach selbst im Hauptloop und committest.

Je Finding:
1. Umsetzen lassen und den Diff selbst lesen.
2. Den Verifikationsschritt aus dem Finding ausführen und das Ergebnis unter {{AUDIT_DIR}}/evidence/fixes/ ablegen.
3. Die Absicherung aus LEARNINGS.md einbauen, wenn sie zu diesem Finding gehört (Test, Lint-Regel, Wächter).
4. Status in findings.json und INDEX.md auf „umgesetzt" setzen, mit Commit-Hash.

Gates vor jedem Push: pnpm -r test, pnpm -r lint, pnpm lint:scripts, pnpm -r typecheck, pnpm check:i18n-keys, pnpm check:single-copy, pnpm check:bilanz.

Öffentliches Repo: Enthält das Paket Sicherheitsbefunde, beschreiben Commit-Nachrichten, PR-Titel und PR-Text nur die Änderung (z. B. „fix(core): Autorisierung für X ergänzen"), nicht den Angriffsweg, und zitieren nichts aus dem Audit-Ordner. Die Finding-ID darf genannt werden.

Ändere nur, was das Paket verlangt. Weitere Probleme notierst du im Audit-Ordner in STATE.md unter „Neue Funde", statt sie nebenbei zu beheben.

Abschluss: Liste aller geänderten Dateien je Finding, Ergebnis jeder Verifikation, offene Punkte. Nenne auch kleine Änderungen.
```

Für Pakete, die bewusst umbauen sollen (Duplikate zusammenführen, Struktur bereinigen),
den Satz „Ändere nur, was das Paket verlangt …" ersetzen durch:

```text
Dieser Teil der Codebasis ist in diesem Paket deiner: Wie er gebaut ist, entscheidest du, und du baust weiter auf ihm auf. Ziel ist die Struktur, die das Paket beschreibt.
```

Dann den Diff prüfen, nicht nur die Zusammenfassung: Das Modell ändert in diesem
Modus auch Dinge, um die niemand gebeten hat.

## Rückführung ins Projekt (Phase 6)

Erst dadurch wirkt das Audit auf jede spätere Session. Je Durchlauf abhaken:

- [ ] Angenommene, noch nicht umgesetzte Pakete stehen als je ein Eintrag in
      `docs/OPEN-ITEMS.md` (einfach erklärt, max. 3 Zeilen). Bei Sicherheitspaketen
      neutral formuliert, ohne Fundstelle.
- [ ] Grundsatzentscheidungen aus `DECISIONS.md` stehen in `docs/DECISION-LOG.md`.
- [ ] Angenommene Vorschläge aus `proposals/` sind in `.claude/rules/`,
      `docs/referenz/` oder (kurz) `CLAUDE.md` übernommen, jede Regel mit Grund
      und Geltungsbereich. Wo möglich als Wächter, Lint-Regel oder Test, nicht nur
      als Text.
- [ ] Neue Erkenntnisse über das Arbeiten mit Agenten: `.claude/agents/audit-worker.md`
      (§0, Invarianten) und `audit-scout.md` (Suchmuster) nachgezogen.
- [ ] Sobald alle Sicherheitsfixes live sind: entschärfte Zusammenfassung nach
      `docs/archiv/audits/GESAMTAUDIT-<JJJJ-MM>.md` (Scorecard, Muster, Learnings,
      PASS-Listen; keine Fundstellen offener Lücken).
- [ ] Im Audit-Ordner Tag `audit-<JJJJ-MM>` setzen. Im Repo kein Tag nötig: der
      Audit-Stand steht als SHA in der Charter.

## Prompt Delta-Audit (nach zwei bis drei Monaten)

```text
# Delta-Audit
Der Audit-Ordner ist {{AUDIT_DIR}}. Lies dort STATE.md, die Charter (Audit-Stand-SHA), findings.json, LEARNINGS.md und DECISIONS.md. Es gelten die Regeln der Charter. Prüfe:
1. Jedes Finding mit Status „umgesetzt" erneut gegen seinen Verifikationsschritt. Regressionen bekommen ein neues Finding mit Verweis.
2. Alle Commits seit dem Audit-Stand gegen die Regeln aus LEARNINGS.md. Wo wurde eine Regel gebrochen, und fehlt dort die Absicherung?
3. Abgelehnte und verschobene Findings: Gilt die Begründung in DECISIONS.md noch?
Ergebnis: delta-{{datum}}.md im Audit-Ordner, mit Scorecard im Vergleich zum ersten Audit und einer kurzen Liste neuer Funde. Nichts im Repo ändern; neue Pakete gehen über das Review in OPEN-ITEMS.
```

## Hinweise zu Fable 5.2

- **Effort:** Discovery, Audit, Synthese und Umsetzung auf `high`; `xhigh` nur für
  Security-Tiefenprüfungen, wenn `high` sichtbar Lücken lässt; Review auf `medium`.
- **Freigaben wörtlich:** Fable 5.2 wendet Erlaubnislisten genau so an, wie sie
  dastehen. Fehlt etwas, die Liste im Prompt ergänzen statt „handle freier" zu
  schreiben. Weiter mit konkreter Freigabe („Charter ist freigegeben, starte
  Session 2 laut Plan"), nicht mit „weiter".
- **Gehäufte Vorsicht:** Regeln aus CLAUDE.md, Rules, Memory und Prompt summieren
  sich. Darum enthält `STATE.md` nur Fakten, keine neuen Verbote.
- **Zusammenfassung vs. Diff:** Die Abschlussnachricht lässt kleine Änderungen oft
  weg. Bei der Umsetzung immer den Diff lesen.
- **Security-Klassifikatoren:** Den Sicherheitsteil als defensives Review
  formulieren (Fundstelle, Risiko, Fix). So stehen die Prompts oben.
- **Kosten:** Die teuren Sessions (Sicherheit, Synthese) nicht direkt
  hintereinander legen; Sessions über mehrere Tage verteilen.

## Warum anders als das Playbook

| Playbook | Hier | Grund |
| --- | --- | --- |
| `audit/` im Repo, Branch `audit/<datum>`, Tag | privater Audit-Ordner mit eigenem Git | Repo ist öffentlich (seit 2026-08-03); Befunde mit Fundstelle wären veröffentlicht |
| Staging-URL + Testaccount | lokaler Production-Build gegen den Prod-Spiegel, lokale Audit-Testnutzer | Es gibt kein Staging; der Spiegel hat echte Daten, darum bleibt Evidence privat |
| eigene Listen `DECISIONS.md`, Issues aus `findings.json` | während des Audits privat, danach OPEN-ITEMS + DECISION-LOG | Doku-Ordnung: eine offene-Punkte-Liste, keine Doppelpflege; Issues wären öffentlich |
| Vorschläge für `CLAUDE.md` | `.claude/rules/`, `docs/referenz/`, CLAUDE.md nur kurz | Token-Hygiene: CLAUDE.md ist der Kern, Domänen-Regeln laden nur bei Bedarf |
| Fable setzt selbst um | Opus-Subagent setzt um, Fable prüft | Davids Arbeitsteilung seit 2026-07-30 |
| „Nur nach Rückfrage" als Schutz | zusätzlich kein Bypass-Modus oder `deny` | Im Bypass-Modus wirkt nur `deny` (gemessen 2026-11-09) |
| allgemeiner Prüfkatalog | Projektregeln, §0 des audit-worker und frühere Audits als Maßstab | Bewusste Abweichungen sind sonst Fehlalarme; Bekanntes nicht neu melden |

## Durchläufe

| Durchlauf | Audit-Ordner | Stand |
| --- | --- | --- |
| 2026-11 | `~/Developer/Claude/Audits/pukalani-2026-11/` | angelegt 2026-11-11, `context.md` vorbefüllt, Session 1 offen |
