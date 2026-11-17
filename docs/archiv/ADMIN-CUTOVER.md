# Runbook: Betreiber-Konsole `control.` → `admin.` (AH-4)

**Vorgang:** die Betreiber-Oberfläche antwortet künftig unter
`admin.pukalani.app`. Der Altname `control.pukalani.app` bleibt bestehen und
antwortet 301 — Pfad und Query unverändert.

**Davids Entscheidung 2026-08-11.** Spezifikation: docs/plans/ACCOUNT-HORIZONT.md
(AH-4). Vorlage dieses Vorgangs: docs/archiv/CONTROL-CUTOVER.md
(studio→control, 2026-07-26) — dort stehen die Fallen, die hier vermieden sind.

---

## Das Wichtigste in vier Sätzen

1. **Nur die Adresse zieht um.** ploi-Site, Verzeichnis
   `/home/ploi/control.pukalani.app/`, Release-Slot `releases/control`, der
   pm2-Prozess `controlpukalaniapp`, die certbot-Lineage und das
   Appwrite-Projekt `control` behalten alle ihren Namen. Das ist bewusst so:
   eine Site-Umbenennung war beim letzten Cutover die teuerste Falle (pm2 findet
   seinen Prozess über den NAMEN und startet bei einer Umbenennung DANEBEN —
   zwei Prozesse, ein Port, gemischte Builds).
2. **Das Zertifikat muss beide Namen tragen.** Eine 301 wird erst NACH dem
   TLS-Handshake gesprochen. Ein Zertifikat nur für `admin` macht den Altnamen
   sofort unerreichbar — samt aller Lesezeichen und Dienste, die noch dorthin
   zeigen.
3. **Stripe folgt keiner Weiterleitung.** Die Webhook-URL im Stripe-Dashboard
   gehört aktiv umgehängt. Bis das passiert ist, kommen keine Ereignisse an,
   und das sieht man an nichts, was von allein rot würde.
4. **Es wird kein Schlüssel rotiert** (bewusst — Key-Swap ist ein eigenes
   Runbook, docs/runbooks/APPWRITE-KEYS.md).

---

## Vorher prüfen

- [x] Code-Paket ist auf `main` und deployt (Branch `ah4-admin`): Middleware
      `00.legacy-console-hosts.ts` (seit AH-4b wieder entfernt, s. u.), `PROBE`-Map in
      `.github/workflows/deploy.yml`, `admin.pukalani.app` in
      `scripts/ops/verify-tls.mjs`.
- [x] `admin` steht in `RESERVED_SUBDOMAINS`
      (`packages/control/schemas/tenant.ts`) — kein Selbstbedienungs-Kunde kann
      den Namen beantragen.
- [x] Aktuellen Zustand notieren: `pm2 jlist` (Name + cwd des control-Prozesses)
      und die heutige Stripe-Webhook-URL.

---

## 1 · DNS + Alias

- [x] Cloudflare: `admin.pukalani.app` zeigt auf `49.13.211.173`.
      **Grau (nicht proxied)** wie alle Hosts außer dem Apex.
- [x] ploi → Site `control.pukalani.app` → Verwalte → **Domain aliases** →
      `admin.pukalani.app` hinzufügen. ploi pflegt `server_name` selbst und lädt
      nginx neu.
- [x] Gegenprobe, dass nginx den Namen kennt (noch ohne gültiges Zertifikat):
      `curl -sk -o /dev/null -w '%{http_code}\n' https://admin.pukalani.app/api/health`

## 2 · Zertifikat

Die Site hat eine EIGENE Lineage (`control.pukalani.app`) — sie hat mit dem
Wildcard `*.pukalani.app` nichts zu tun, und das ist der Grund, warum dieser
Schritt hier gefahrlos ist.

- [x] ploi → Site `control.pukalani.app` → SSL → Zertifikat für **beide** Namen
      anfordern: `control.pukalani.app` UND `admin.pukalani.app`.
      **DNS-01 über Cloudflare** (Port 80 antwortet nur für explizit
      konfigurierte Hosts, die HTTP-Prüfung scheitert sonst).
- [x] **NIEMALS** auf der ploi-Site `pukalani.app` ein Zertifikat anfordern —
      das überschreibt das Kunden-Wildcard (Vorfall 2026-07-27, platform + demo
      40 min tot).
- [x] Gegenprobe: `node scripts/ops/verify-tls.mjs admin.pukalani.app` und
      `node scripts/ops/verify-tls.mjs control.pukalani.app` — beide grün.

## 3 · Env-Patch

- [x] ploi → Site → Umgebung: `NUXT_PUBLIC_APP_URL=https://admin.pukalani.app`.
      Nicht kosmetisch: daraus baut `stripeWebhookUrl()` die URL, die unter
      `/dashboard/stripe` angezeigt und bei Stripe registriert wird.
- [x] Bleibt LEER (die app.config trägt die Prod-Werte bereits):
      `NUXT_PUBLIC_CONTROL_CANONICAL_HOST`, `NUXT_PUBLIC_CONTROL_LEGACY_HOSTS`.
      Nur setzen, wenn eine Umgebung ohne Deploy umgehängt werden soll.
- [x] Dienste, die die Konsole von außen ANSPRECHEN, mitziehen — eine 301 ist
      für einen Dienst-Aufruf kein Ersatz:
      - [x] `apps/platform` → `NUXT_ONBOARDING_CONTROL_URL=https://admin.pukalani.app`
      - [x] weitere Fundstellen prüfen: `pnpm ops:site-env`

      > ⚠️ **Nachtrag 2026-08-12: dieser Punkt war abgehakt, aber live NICHT
      > geschehen** — platform (391312) UND portfolio (390041) trugen weiter
      > `https://control.pukalani.app`. Die Folge war unsichtbar, bis der
      > erste Deploy nach dem Cutover die 301-Middleware aktivierte: `fetch`
      > macht beim Folgen einer 301 aus dem Naht-**POST** ein **GET**, jede
      > Naht-Route antwortete „Page not found" (404) — auf allen
      > Pool-Communities waren Eigene Domain und Mitglieder-Verwaltung tot
      > (erster Melder: freelancer, „Domain lässt sich nicht speichern").
      > Beide Envs am 2026-08-12 über das ploi-Panel korrigiert + Deploy.
      > **Lehre: ein Env-Häkchen gilt erst nach `pnpm ops:site-env`-Gegenprobe
      > gegen die LIVE-Datei, nicht nach dem Editieren.**
- [x] `pm2 reload` (bzw. der Deploy in Schritt 4) übernimmt die Env
      (`--update-env`).

## 4 · Deploy + 301

- [x] Deploy laufen lassen (CI). Die Serien-Probe fragt jetzt
      `https://admin.pukalani.app/api/health` — sie ist damit selbst der erste
      Beweis, dass der neue Name lebt.
- [x] Falls die Probe rot wird und pm2 zwei Prozesse am Port 3003 zeigt:
      `pm2 delete controlpukalaniapp` und Deploy erneut (die Falle aus dem
      studio→control-Umzug; hier NICHT zu erwarten, weil der Prozessname
      unverändert bleibt).

## 5 · Stripe-Webhook umhängen

Der Geldweg. Stripe folgt **keiner** 301.

- [x] Stripe-Dashboard → Entwickler → Webhooks → bestehenden Endpunkt öffnen.
- [x] URL ändern auf `https://admin.pukalani.app/api/stripe/webhook`.
      Ereignisliste unverändert lassen (alle neun, s.
      docs/runbooks/STRIPE-GO-LIVE-RUNBOOK.md).
- [x] **Signing-Secret prüfen:** bleibt es beim Ändern der URL gleich, ist
      nichts zu tun. Vergibt Stripe ein neues, gehört es unter
      `/dashboard/stripe` (bzw. `NUXT_STRIPE_WEBHOOK_SECRET`) hinterlegt —
      sonst laufen alle Ereignisse in eine Signaturprüfung, die scheitert.
- [x] Denselben Schritt im **Testmodus** wiederholen
      (docs/runbooks/STRIPE-TEST-WALKTHROUGH.md).

---

## Verifikation

- [x] `curl -s -o /dev/null -w '%{http_code}\n' https://admin.pukalani.app/api/health`
      → **200**, und `jq .build` meldet den erwarteten Commit.
- [x] `/docs` lebt: Login auf `https://admin.pukalani.app/docs` (Betreiber-Auth),
      Inhalt erscheint.
- [x] **301 mit Pfad UND Query** — das ist der eigentliche Beweis:
      ```
      curl -sI 'https://control.pukalani.app/dashboard/stripe?tab=keys' | head -3
      ```
      Erwartung: `HTTP/2 301` und
      `location: https://admin.pukalani.app/dashboard/stripe?tab=keys`.
- [x] Auch für eine API-Adresse (die 301 gilt bewusst für alles):
      `curl -sI https://control.pukalani.app/api/health | head -3`
- [x] Keine Schleife: `curl -sIL https://control.pukalani.app/ | grep -c '^HTTP'`
      → genau zwei Antworten (301, dann 200).
- [x] Stripe: im Dashboard **Testereignis senden** an den neuen Endpunkt →
      Antwort 200. Danach unter `/dashboard/stripe` prüfen, dass der zuletzt
      empfangene Zeitstempel frisch ist.
- [x] `node scripts/ops/verify-tls.mjs` → alle Hosts grün (admin UND control).
- [x] Anmeldung auf `admin.pukalani.app` funktioniert und das Konto-Menü zeigt
      **`/dashboard/settings`** (nicht `/settings`) — die Gegenprobe darauf,
      dass die Konsole nicht versehentlich als Kundenbereich gilt.
- [x] Glocke oben in der Seitenleiste zeigt weiterhin die kontobezogenen
      Meldungen.

## Danach

- [x] `docs/OPEN-ITEMS.md`: AH-4 raus, vollständiger Eintrag mit Datum und einer
      fetten **Gelernt:**-Zeile nach `docs/OPEN-ITEMS-COMPLETE.md`.
- [x] UptimeRobot: Monitor auf `https://admin.pukalani.app/api/health` umstellen
      (Friendly-Name mitziehen — die alte „studio…"-Zeile hat 2026-07-26
      wochenlang falsch geheißen).
- [x] Lesezeichen/Passwortmanager auf den neuen Namen ziehen.
- [x] Den Altnamen NICHT abschalten. Er bleibt als 301 stehen und in
      `RESERVED_SUBDOMAINS` gesperrt — ein zurückgegebener Plattform-Name ist
      der beste Phishing-Köder, den es gibt.
      *(Überholt durch AH-4b, s. Nachtrag unten: seit 2026-08-18 antwortet der
      Altname bewusst 404; gesperrt bleibt er weiterhin.)*


---

## Ergebnis des Laufs vom 2026-08-12

- Alias admin. an Site 392163, Zertifikat per acme.sh/DNS-01 (Cloudflare-Token
  in ~/.appwrite-secrets/cloudflare-dns.token; ploi-HTTP-01 scheiterte zweimal
  fuer den Alias — dokumentierte Falle bestaetigt). Custom-Cert per ploi-API
  eingespielt (Cloudflare vor ploi.io blockt python-urllib mit Error 1010 —
  curl mit Browser-UA geht). SAN jetzt control+admin, der alte studio-SAN ist
  damit weg (Alt-Kruemel geschlossen).
- VERLAENGERUNG AUTOMATISIERT: acme.sh-Cron + /home/ploi/renew-control-cert.sh
  (laedt bei jeder Erneuerung per ploi-API hoch; Probelauf 201).
- Envs (APP_URL/I18N_BASE_URL → admin.) vor dem Deploy gepatcht (Backups
  .ah4-backup), Deploy 6694bf88 (Gate-Skip trat zum DRITTEN Mal auf — einer
  der Doppel-Laeufe; der zweite deployte), Stripe-Webhook per API auf
  admin.…/api/stripe/webhook umgehaengt (enabled).
- Serien-Probe 3/3: admin/login 200 · control → 301 mit Pfad+Query · TLS-Waechter gruen.

---

## Nachtrag AH-4b — echte Site-Umbenennung + 301-Verzicht (2026-08-18)

David hat die ploi-Site 392163 im Panel von `control.pukalani.app` auf
`admin.pukalani.app` umbenannt und ein neues Let's-Encrypt-Zertifikat (nur
`admin`) angefordert. Damit ist die AH-4-Grundannahme „nur die Adresse ändert
sich, die Infra behält den Namen" ÜBERHOLT — und die 301 des Altnamens war
tot (der Host fiel in die Wildcard-Site `platform` → 404), ohne dass ein
Wächter es sah: der TLS-Wächter prüft SAN-Deckung, und die Wildcard deckt.

**Davids Entscheidung (2026-08-18): die 301 wird NICHT wiederhergestellt.**
Der Altname war rein betreiber-intern, der Stripe-Webhook zeigt seit AH-4 auf
`admin`. `control.pukalani.app` antwortet seither bewusst 404 und bleibt in
`RESERVED_SUBDOMAINS` gesperrt sowie im TLS-Wächter beobachtet.

Nachgezogen wurde am selben Tag:

- `ops/ecosystem-control.config.cjs`: `ENV_FILE` → `/home/ploi/admin.pukalani.app/.env`
  (ploi benennt das Server-Verzeichnis beim Site-Rename MIT — der alte Pfad
  existiert nicht mehr; ohne den Fix wäre der nächste `pm2 startOrReload` an
  ENOENT gestorben) und pm2-Name → `adminpukalaniapp`.
- `ops/pm2-heal.sh`: räumt den Vorgänger-Prozess `controlpukalaniapp` einmalig
  weg, bevor `startOrReload` läuft (sonst zwei Prozesse auf Port 3003 — die
  studio→control-Falle).
- `deploy.yml`: `SITE[control]=admin.pukalani.app` — SITE und PROBE sind
  wieder für alle Apps identisch.
- Die 301-Middleware `00.legacy-console-hosts.ts`, ihre `adminConsole`-Config
  und die `NUXT_PUBLIC_CONTROL_*`-Runtime-Keys sind entfernt.
- Die acme.sh-Automatik dieses Runbooks (Cron + `renew-control-cert.sh`,
  Zertifikat `control+admin`) ist vom Server entfernt — sie hätte Davids neues
  Panel-Zertifikat bei der nächsten Erneuerung still überschrieben. Die
  Verlängerung macht jetzt wieder ploi (Standard-LE der Site).
- Wächter/Doku: `verify-tls.mjs` (control-Eintrag = „bewusst 404"),
  `verify-site-env.mjs` (`dir: admin.pukalani.app`), CLAUDE.md, DEPLOYMENT.md,
  hosts-und-ports.

**Gelernt:** Ein Panel-Rename in ploi benennt Site, Verzeichnis UND
Deploy-Script um, lässt aber alles außerhalb ploi's Sicht zurück: CI-Pfade,
pm2-Prozessnamen, `ENV_FILE`-Pfade in Ecosystem-Dateien, Fremd-Automatiken
(acme.sh) — und eine 301, die in der App des alten Hosts wohnt, stirbt still,
weil der Host die App nie mehr erreicht.
