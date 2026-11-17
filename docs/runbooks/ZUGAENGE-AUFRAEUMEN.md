# Zugänge nach einem Projekt-Umzug aufräumen

**Wann.** Nach jedem Cutover, der ein Appwrite-Projekt ersetzt
(`studio`→`control`→`admin`, `pool`→`account`, …) — und danach gelegentlich
zur Kontrolle.

**Warum.** Ein Umzug benennt Dinge um; die Schlüssel dazu bleiben liegen, wo
sie gebraucht wurden. Am 2026-08-19 tauchten Zugänge zu längst gelöschten
Projekten an **drei** Orten auf: `/home/ploi/.env-backups/` auf dem Server
(fünf Dateien, darunter derselbe Stripe-Schlüssel wie in der Produktion), vier
`.key`-Dateien im lokalen Geheimnis-Ordner und eine eingefrorene
`.env`-Sicherung. Alle drei entstanden als verantwortungsvoller Zwischenschritt
und wurden genau dadurch zum Problem — Wochen später kannte sie niemand mehr.

> **Regel.** Wer eine `.env` sichert, legt im selben Atemzug ihr Ende fest.
> Sonst ist die Sicherung die Kopie, die niemand rotiert.

---

## 1 · Inventur

```bash
pnpm ops:stale-keys
```

Prüft jede Zugangs-Datei unter `~/.appwrite-secrets` (rekursiv, auch nackte
`<projekt>-<art>.key`) gegen die Instanz. Anderer Ordner: `--dir <pfad>`.
Werte erscheinen nirgends — nur Dateiname, Projekt und Zustand.

Und dasselbe auf dem Server:

```bash
pnpm ops:stale-keys -- --ssh
```

Das Skript kopiert sich dorthin und läuft DORT (`/home/ploi`), damit kein
Schlüssel über die Leitung zurückkommt. Anderer Server: `PUKALANI_OPS_SSH`.

**Das läuft auch von selbst:** der Workflow „Produktions-Wächter"
(`.github/workflows/production-watch.yml`, Job `server`) macht täglich um 04:17
UTC drei Blicke auf den Server (der dritte, `pnpm ops:instance-admins`, meldet
eine Instanz OHNE Admin-Konto — „Registrierung aus" ist nur so lange harmlos,
wie es noch jemanden gibt, der sie wieder anschalten kann) — erst `ops:site-env` (fehlende Variablen, F44), dann diesen
Lauf mit `--strict`. Beide laufen immer, auch wenn der erste rot wird, sonst
verdeckt ein Befund den anderen. Ein toter Zugang wird damit rot und schickt
die übliche Fehlermail. „Unklar" bleibt bewusst grün: ein Wächter, der bei jedem
Netz-Aussetzer schreit, wird nach der dritten Fehlmeldung ignoriert. Von Hand
auslösen: Actions → Produktions-Wächter → Run workflow (ohne Haken; der
Blick läuft im täglichen Teil mit).

Dort stehen nicht nur Reste, sondern die **aktiven** `.env` der Sites. Ein ✖ auf
einer laufenden Site ist deshalb kein Aufräum-Hinweis, sondern ein
Betriebs-Alarm — genau der Fall E1b, als `apps/platform/.env.production` nach
dem Account-Cutover noch auf das eingefrorene `pool` zeigte.

Die Kopfzeile nennt immer **geprüfte von gesehenen** Dateien, und ganz unten
stehen die, die ein Projekt nennen, aber keinen Schlüssel tragen (z. B. die
Marketing-Site). Diese Zeilen sind Absicht: eine Abdeckung, die man nicht
sieht, liest sich wie „alles geprüft".

## 2 · Den Befund lesen

| Ausgabe | Bedeutung |
| --- | --- |
| ✖ Projekt existiert nicht mehr | **404** — tot, unabhängig von Rechten |
| ✔ gültig (Bereich …) | lebt, wird gebraucht |
| ? kein Bereich antwortete | **kein Befund und kein Löschgrund** |

**Nur 404 beweist „tot".** Ein 401 heisst oft nur „gültig, aber nicht für den
Bereich, den du gefragt hast" — Migrations-Schlüssel tragen bewusst keinen
Nutzer-Zugriff. Das Skript hält deshalb jeden Schlüssel gegen beide Bereiche
und rät den Umfang nicht am Namen ab (`migrations/account.env` hält seinen
Schlüssel unter `NUXT_APPWRITE_KEY` — ein Name ist eine Absicht, kein Befund).

## 3 · Die zweite Frage, die das Skript nicht kann

> Steht in dieser Datei ein Wert, den es **nirgends sonst** gibt?

Jeden Schlüssel gegen die lebende `.env` halten: identisch (Sicherung
überflüssig) oder abweichend (Altwert) ⇒ Löschen verliert nichts. Erst wenn
das für JEDEN Schlüssel der Datei gilt, ist die Löschung risikofrei —
und damit Buchhaltung statt Mut.

## 4 · Löschen

```bash
rm -P <datei>      # macOS
shred -u <datei>   # Linux
```

Überschreibend, nicht nur aushängen. **Danach die Abwesenheit prüfen, nie dem
Exit-Code glauben:** in zsh zerlegt `for f in $LISTE` nicht in Wörter (anders
als in bash) — die Schleife läuft dann einmal mit allen Namen als EINEM
Dateinamen, und `rm -f` verschluckt den Fehler mit Exit 0. Eine Löschung sieht
so erfolgreich aus und ist ein No-op (2026-08-19 live erwischt).

## 5 · Gegenprobe

`pnpm ops:stale-keys` erneut, dann die betroffenen Dienste anfassen.

Bei GETEILTEN Naht-Geheimnissen gilt zusätzlich: die Kanten messen, nicht die
Konfiguration lesen. Dass drei `.env` denselben String tragen, beweist nichts.
Wie man rotiert und wie der Übergangszustand aussieht („Ablage = ALT,
Env = NEU" — nimm schon beides an, sende aber noch alt), steht ausführlich im
Kopf von
[`packages/core/server/utils/sharedSeamSecret.ts`](../../packages/core/server/utils/sharedSeamSecret.ts);
der gefahrene Durchgang samt Messwerten unter A0 in
[OPEN-ITEMS-COMPLETE.md](../OPEN-ITEMS-COMPLETE.md).
