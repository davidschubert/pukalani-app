# AR1 — Einzelheiten

> Einzelheiten zum offenen Punkt **AR1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**AR1 — Aufräumen: Reste (aus dem Gesamtaudit, Paket P26).**
Erledigt am 2026-11-17 (COMPLETE „N06"): die zwei Lücken am Ticket-Kauf, die
drei übrigen Umzugs-Anleitungen liegen im Archiv, die READMEs von
`apps/photos` und `apps/control` beschreiben ihre App, `CLAUDE.md` nennt die
SDK-Versionen aus dem Katalog.
Erledigt am 2026-11-21 (COMPLETE „N22"): der DNS-Eintrag
`changelog.pukalani.app` ist bei Cloudflare gelöscht.

- **(d) Kleinigkeiten.** Ticket-Kauf (lebt nur in der Test-App): die
  Rückkehr-Adressen kommen weiter aus dem Host der Anfrage; die Prüfung
  „schon bezahlt" liest die 100 jüngsten Sitzungen und braucht ein
  Zeitfenster, sobald es eine Erstattung mit Rücknahme des Tickets gibt; die
  Route liest den Termin direkt und nicht über die Datentür — zu ändern,
  bevor der Ticket-Kauf in eine ausgerollte Pool-App zieht (die Prüfungen der
  Termin-Routen und eine eigene Bremse trägt er seit dem 2026-11-18, COMPLETE
  „N15").
  Auf dem Datenbank-Server liegen fünf Upgrade-Protokolle im Heimatordner
  (bewusst behalten) und vier Sicherheitskopien aus dem Backup-Paket
  (`*.vorher-p11*`, gehören zu BU1 d). Der lokale Lauf der Playwright-Suite
  braucht einen Browser-Download. Ein UptimeRobot-Monitor heißt vielleicht
  noch „studio…" (nur der Name, nicht nachgesehen).
- **(e) Abhängigkeiten: was nach der Update-Runde vom 2026-11-20 offen
  bleibt** (gemessen mit `pnpm audit`, dem Lockfile und `npm view`; die Runde
  selbst steht in der [Erledigt-Liste](../../OPEN-ITEMS-COMPLETE.md), „N19"). Keine
  der drei Stellen mit Hinweis ist eine direkte Abhängigkeit:
  - `minimatch` (mittel, Issue 374): die betroffene Ausgabe 10.2.6 hängt nur
    noch an EINEM Weg — `nitropack` 2.13.6 → `archiver` 8.0.0 → `readdir-glob`
    3.0.0. `readdir-glob` 4.0.0 verlangt `minimatch` 11, ist aber eine neue
    Hauptversion, und `archiver` 8.0.0 (die neueste Ausgabe) erlaubt nur
    `readdir-glob` 3. **Wartet auf:** eine neue Ausgabe von `archiver` oder
    `nitropack`; dann genügt ein Neuauflösen des Lockfiles. Kein erzwungener
    Sprung auf eine andere Hauptversion.
  - `zod` 3 (hoch): kommt nur über `@nuxt/content`; unser eigenes `zod` ist
    aktuell. Behoben ist es erst ab zod 4.6.6, und `@nuxt/content` verlangt
    auch in 3.17.0 zod 3. **Empfehlung:** warten, bis `@nuxt/content`
    umstellt; kein erzwungener Sprung (ein Override auf eine andere
    Hauptversion wäre ein Umbau, kein Update).
  - `esbuild` 0.27 (niedrig): kommt über `fontless` 0.2.1 in `@nuxt/fonts`
    0.14, das `@nuxt/ui` mitbringt. `@nuxt/ui` 4.13.0 (veröffentlicht am
    2026-11-18 16:51 UTC) verlangt `@nuxt/fonts` 1.2, und dessen `fontless`
    1.3 braucht `esbuild` nicht mehr. Der Hinweis schließt also mit dem
    nächsten Heben von `@nuxt/ui` (über der Frist ab dem 2026-11-21 16:51
    UTC). **Empfehlung:** als eigene Runde — es ist ein Update der Oberfläche
    für alle Apps, kein Nebenbei.
  - Zwei kleine Updates, die noch nicht gehen (`vitest` 5.1.1 und
    `@vercel/nft` 1.11.7 sind seit dem 2026-11-21 gehoben, Issues 359 und
    356, Erledigt-Liste „N23"; `@vercel/nft` 1.11.9 bis 1.11.11 kommen ohne
    eigenen Schritt mit dem nächsten Neuauflösen des Lockfiles, die jüngste
    ist über der Drei-Tage-Frist ab dem 2026-11-23 20:54 UTC):
    MariaDB 10.11.20 im CI-Verbund
    (Issue 373 — das offizielle Image gibt es noch nicht, der Tag `10.11`
    zeigt auf 10.11.19; der E2E-Lauf schreibt die laufende Version in sein
    Protokoll, mit dem neuen Image stehen ein zurückgespieltes Test-Backup und
    die Vote-Probe aus); `node-appwrite` 32.0.0 (neue Hauptversion, ändert
    die Parameter-Reihenfolge von `functions.update`; kein Issue, eigener
    Schritt).
  - **Redis und MariaDB außerhalb der CI (braucht Davids Ja).** Der
    CI-Verbund fährt seit dem 2026-11-20 Redis 7.4.12; die
    Entwicklungs-Instanz und Production stehen laut Compose-Vorlage bei
    7.4.7-alpine und `mariadb:10.11` (auf Production nicht nachgesehen). Ob
    und wann sie nachziehen, ist eine eigene Entscheidung mit Wartungsfenster
    — am einfachsten zusammen mit dem nächsten Appwrite-Upgrade.
