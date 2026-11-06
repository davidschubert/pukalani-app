# Runbook: Marktvergleich auf `branding.supply` einschalten (MV1)

**Vorgang:** das Produkt `market` geht auf der Instanz `branding` in Betrieb.
Sechs Migrationen laufen, danach kippt EIN Schalter, danach ein Rauchtest.

Plan und Begründungen: docs/archiv/BRAND-MARKTVERGLEICH.md (M1–M5, Anhänge B–F).
Instanz-Kontext: docs/runbooks/BRANDING-SUPPLY-SETUP.md.

---

## Das Wichtigste in fünf Sätzen

1. **Die Migration läuft VOR dem Code-Flip.** Der Schalter macht Seite und
   Routen sichtbar; ohne Tabellen antwortet dann jede Route mit einem
   Appwrite-404, das wie „keine Daten" aussieht. Umgekehrt ist harmlos: die
   Tabellen dürfen tagelang leer dastehen, es kommt niemand an sie heran.
2. **`pnpm migrate` gegen Produktion braucht Davids ausdrückliches Ja.** Der
   Klassifizierer blockt den Lauf; das ist die Sicherung, nicht ein Hindernis.
   Vorher zeigen, WELCHE Instanz und WELCHE Migrationen.
3. **Der Schalter ist EINE Zeile** in `apps/branding/app/app.config.ts`
   (`market: { enabled: true }`) und gehört in einen EIGENEN Commit — damit der
   Rückweg ein `git revert` ist und kein Suchen.
4. **In Produktion gibt es keinen Stub.** Ein Rauchtest-Lauf ruft echte Modelle
   und liest echte fremde Websites. Er kostet Cents und hinterlässt Spuren in
   fremden Zugriffs-Protokollen — deshalb genau EIN Lauf, gegen eine Adresse,
   die man selbst gewählt hat.
5. **Der Rückweg braucht kein Deploy.** `app_config.products.market.enabled =
   false` schaltet alle `/api/market`-Routen sofort ab (Produkt-Registry,
   `04.product-gate.ts`). Der Rohtext-Sweep läuft bewusst weiter.

---

## Vorher prüfen

> **Durchlauf 2026-09-06 (Hauptloop, mit Davids Ja):** Migrationen brand-018/019 +
> market-001…004 auf `branding` gefahren (Lauf 2 komplett `↷`), `ops:schema-parity`
> grün (branding 29/29), Gate-Flip f7bd9fe4. Schritt 4 (Rauchtest mit echtem Konto)
> macht David; die Häkchen dort bleiben offen, bis er meldet.


- [x] `main` ist grün: Test, Lint, Typecheck, E2E.
- [x] Das Code-Paket M1–M5 ist auf `main` und deployt. Beweis ist der
      Live-Build-SHA, nicht die Actions-Ansicht:
      `curl -s https://branding.supply/api/health | jq -r .build`
- [x] Der Schalter steht noch auf `false`:
      `grep -n "market:" apps/branding/app/app.config.ts`
- [x] Die Migrations-Env liegt bereit:
      `ls -l ~/.appwrite-secrets/migrations/branding.env`
      (Datei NICHT öffnen, nicht kopieren, nicht ins Repo.)
- [x] Vier Beweise sind lokal grün (Vorbedingungen in den Skript-Köpfen):
      `verify-market-fetch` · `verify-market-report` · `verify-market-ui` ·
      `verify-market-retention`.

---

## 1 · Migrationen (nur mit Davids Ja)

Sechs Migrationen auf der Instanz `branding`, in dieser Reihenfolge — der
brand-Layer zuerst, weil `market_*` an `brand_profiles` hängt:

```bash
# brand-018 (Befund-Art `market`) und brand-019 (`marketVisibility`)
pnpm migrate --env-file ~/.appwrite-secrets/migrations/branding.env --layer brand

# market-001 … market-004 (Kandidaten, Marktprofile, Berichte, Rolle `self`)
pnpm migrate --env-file ~/.appwrite-secrets/migrations/branding.env --layer market
```

- [x] brand-Lauf durch, jede Zeile `✔` oder `↷ (existiert bereits)`.
- [x] market-Lauf durch, dito.
- [x] **Zweiter Lauf zur Kontrolle:** beide Befehle noch einmal. Jetzt MUSS
      alles `↷` sein. Eine `✔`-Zeile im zweiten Lauf heisst, dass etwas nicht
      idempotent ist — dann anhalten und nachsehen, nicht weitermachen.

**Was NICHT läuft:** eine Migration für die Bewertung (`market.rating`). Sie
liegt in `brand_events`, und dessen Spalte `type` ist ein varchar, kein Enum
(Migration brand-007 sagt es im Kopf) — eine neue Ereignis-Art kostet hier
nichts. Wer die Zeile sucht: `type = "market.rating"`, `payload` trägt Note,
Satzlänge und den PII-gefilterten Satz.

---

## 2 · Schema-Parität

```bash
pnpm ops:schema-parity
```

- [x] Der Soll-Block `market` (drei Tabellen) ist auf `branding` erfüllt.
- [x] Kein Fehler bei den anderen Instanzen (der Lauf geht über alle
      ausgerollten; eine fehlende Env-Datei einer ausgerollten Instanz macht
      ihn seit 2026-08-31 ROT, nicht still).

---

## 3 · Der Schalter (eigener Commit)

`apps/branding/app/app.config.ts`:

```diff
-    market: { enabled: false },
+    market: { enabled: true },
```

- [x] Der Kommentar darüber wird MITGEZOGEN — er begründet heute das `false`
      und muss danach das `true` begründen (mit Datum des Migrations-Laufs).
- [x] Commit: `feat(branding): Marktvergleich freigeschaltet (MV1)`.
- [x] Push auf `main`, vier Checks abwarten.
- [ ] Deploy: er feuert per `workflow_run` auf Test UND E2E, startet also
      ZWEIMAL — einer der Läufe endet per Concurrency „cancelled", das ist KEIN
      Fehler.
- [ ] **Live-Build-SHA prüfen** — der einzige Prod-Beweis:
      `curl -s https://branding.supply/api/health | jq -r .build`

---

## 4 · Rauchtest in Produktion (Davids Konto)

> **2026-09-06: von David durchgeführt und als „passt" gemeldet** (Build 92b39f14).

Vorbedingung: ein Branding mit **abgenommenem Kapitel B** (Purpose, Vision,
Mission). Ohne das ist die Seite absichtlich gesperrt (§2.4).

- [x] `https://branding.supply/market-bot` und `/de/market-bot` antworten 200.
      (Diese Seite hängt NICHT am Schalter und war schon vorher erreichbar —
      hier wird nur bestätigt, dass sie es geblieben ist.)
- [x] In der Werkstatt steht links der Eintrag **„Markt"** und ist klickbar.
- [x] Die Seite `/brand/<id>/market` lädt: Kopf, ehrliche Grenze
      („nicht, wie erfolgreich sie damit sind"), Kandidatenliste, Schranke.
- [x] EINEN Kandidaten eintragen. **Eine eigene Adresse nehmen** — die eigene
      alte Website oder eine Marke, deren Betreiber man kennt. Kein fremdes
      Unternehmen für einen Rauchtest.
- [x] **Ein Lauf.** Erwartung: 20–60 Sekunden, bis acht Seiten gelesen, eine
      Extraktion, ein Vergleich; **Kosten im niedrigen Cent-Bereich** (§2.8:
      0,10–0,30 € bei fünf Wettbewerbern, hier also deutlich weniger).
      Es gibt in Produktion **keinen Stub** — `MARKET_DEV_STUB` ist eine
      Dev-Variable und steht auf dem Server nicht.
- [x] Die Gegenüberstellung, die drei Listen und mindestens ein Befund-Chip
      erscheinen. Ein Befund sperrt nichts (nur `conflict` tut das).
- [x] Der zweite Klick auf „Erneut vergleichen" ist **billig**: gleicher Stand
      ⇒ derselbe `revisionKey` ⇒ kein Modell-Aufruf.
- [x] Die Frage „War der Vergleich brauchbar?" steht unter dem Bericht.
      Beantworten — und danach ist sie weg.
- [x] Danach im Log nachsehen: `market.run`, `market.report`, `market.rating`.
      Alle drei tragen ZAHLEN, keinen Inhalt.

### Am nächsten Tag

- [ ] `market_competitors` in der Appwrite-Konsole öffnen: `rawText` der
      Testzeile ist LEER, `rawExpiresAt` ist weg, `market_profiles` trägt die
      Felder mit Zitat und Quell-Adresse weiter. Das ist der Sweep.
      (Sofort prüfen geht auch: `POST /api/market/ops/sweep` mit einem Konto,
      das `system.manage` hat — er räumt nur, was schon fällig ist.)

---

## 5 · Rückweg

**Sofort und ohne Deploy** (Notabschaltung, Betreiber-Konsole →
Produkte → `market` aus, schreibt `app_config.products.market.enabled = false`):

- Jede `/api/market`-Route antwortet 404, die Seite ebenso.
- Der **Rohtext-Sweep läuft weiter** — das ist Absicht: eine
  Aufbewahrungsfrist ist kein Produktmerkmal, und ein abgeschaltetes Produkt
  darf die Lebensdauer schon gesammelten fremden Seitentextes nicht verlängern
  (Begründung im Kopf von `packages/market/server/plugins/raw-text-sweep.ts`).
- Der Betreiber-Knopf `POST /api/market/ops/sweep` fällt mit der
  Notabschaltung weg (er hängt unter `/api/market`); wer nach dem Abschalten
  sofort aufräumen will, macht das VOR dem Abschalten.

**Dauerhaft:** den Schalter-Commit aus Schritt 3 revertieren und deployen.

**Die Daten bleiben in beiden Fällen liegen.** Sie fallen mit ihrem Branding
(Profil-Kaskade + GDPR-Contributor des market-Layers) — es gibt bewusst kein
Skript, das sie beim Abschalten löscht.

---

## Wenn etwas schiefgeht

| Symptom | Ursache | Was tun |
| --- | --- | --- |
| Seite „Markt" 404 trotz Deploy | Schalter noch `false`, oder Build-SHA alt | `api/health` prüfen, dann `app.config.ts` |
| Seite 200, aber jede Aktion 404 | Notabschaltung an (`app_config.products.market`) | in der Konsole wieder einschalten |
| „wartet auf Kapitel B" | Kapitel B nicht abgenommen — kein Fehler | Kapitel abschliessen |
| Lauf endet 429 | Tages-Eimer (3 Läufe je Branding) | morgen, oder `pukalani.market.runDailyInstanceCap` prüfen |
| Lauf meldet „KI ist aus" | `app_config.brandAiEnabled` false oder kein Schlüssel | Kill-Switch und `NUXT_AI_KEY` prüfen |
| Kandidat `excluded / robots` oder `/ tdm` | Die fremde Website untersagt es | Nichts tun. Das ist die Zusage, die eingehalten wird. |
| Migration bricht mit `column_not_available` | Appwrites Metadaten-Cache | Migration erneut laufen lassen (`indexRetry` stösst den Cache an) |
