# Runbook: Admin-Konto wiederherstellen

**Wann.** Der tägliche Aussperr-Wächter (`scripts/ops/verify-instance-admins.mjs`,
Job `server` in `production-watch.yml`) meldet eine Instanz **ohne Konto mit
Label `admin`**: im Issue `produktions-alarm` steht „Admin-Konto", im Lauf
eine Zeile mit `✖ … Admins 0`. Das Dashboard dieser Instanz kann dann niemand
mehr bedienen; ist dort zusätzlich die Registrierung zu, kommt auf der Site
überhaupt niemand mehr hinein.

**Für wen.** Nur David (oder eine Vertretung mit eigenem Zugang zur
Appwrite-Konsole, [PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md) § 5). Jeder
Schritt hier ändert Production — mit Ausnahme von § 4, der nur liest.

**Anlass.** Am 2026-11-22 wurde auf Production das einzige Admin-Konto im
Projekt `account` über „Konto löschen" gelöscht (Alarm-Issue 555 am
2026-11-23). Die Communities liefen weiter, es fehlte nur das Konto mit dem
Label. Am 2026-11-23 um 11:26 UTC meldete ein Lauf von Hand wieder ein
Admin-Konto in `account`, das Issue schloss sich selbst.

> **Regel (Lehre aus dem Vorfall).** Vor jedem Löschen im Browser zuerst
> nachsehen, WELCHES Konto angemeldet ist (Profil-Seite: Name, Anfang der
> Adresse, Labels) — trägt es `admin` oder ist es nicht das eben angelegte
> Wegwerf-Konto, wird nicht gelöscht. Wegwerf-Konten gehören in ein eigenes
> privates Fenster, nie in das Profil, in dem der Betreiber angemeldet ist.

---

## 1 · Kurzfassung

1. Im Lauf nachsehen, WELCHE Instanz betroffen ist und ob ihre Registrierung
   offen oder zu ist (§ 2).
2. **Weg A (empfohlen):** Konto neu anlegen und in der Appwrite-Konsole das
   Label `admin` setzen (§ 3).
3. Den Wächter von Hand laufen lassen; das Issue schließt sich selbst (§ 3.4).
4. Nur lesend nachsehen, was am gelöschten Konto hing (§ 4).

Weg B (Backup) nur in dem einen Fall aus § 5.

## 2 · Lage lesen (nur lesen)

- [ ] Issue `produktions-alarm` öffnen → Link „Lauf" → Job `server` →
      Schritt „Hat jede Instanz noch ein Admin-Konto?". Je Instanz eine Zeile:
      Site, Projekt, Zahl der Konten, Zahl der Admins, Registrierung
      `offen`/`zu`.
- [ ] Die Zeile mit `✖` nennt das **Projekt** (`account`, `admin`,
      `portfolio`, `branding`). Nur dort fehlt der Admin; die anderen Projekte
      sind getrennte Konten-Welten und nicht betroffen.
- [ ] Wer weiß, wie es dazu kam, schreibt es ins Issue (ein Satz, ohne Namen
      und Adressen). Steht ein fremder Zugriff im Raum, gilt zuerst
      [SICHERHEITSVORFALL.md](SICHERHEITSVORFALL.md).

## 3 · Weg A — Konto neu anlegen, Label setzen (empfohlen)

**Warum A.** Ein Label ist eine Zeile im Konto; es neu zu setzen dauert eine
Minute, ist sofort prüfbar und lässt alle anderen Daten unberührt. Was beim
Löschen des alten Kontos verloren ging (§ 4), bringt Weg B auch nicht gezielt
zurück — er setzt die ganze Datenbank aller Projekte zurück (§ 5).

### 3.1 Das Konto anlegen — einer von zwei Wegen

Die Anmelde-Wege der Datenbank für Aufrufe ohne Schlüssel sind auf Production
aus ([ANMELDE-REGELN.md](ANMELDE-REGELN.md), „Anmelde-Wege"). Das betrifft
weder unsere Registrierung (unser Server ruft mit Schlüssel) noch die
Appwrite-Konsole. Darum gibt es zwei Wege, beide gehen:

**(1) Über die Site — wenn die Registrierung `offen` ist (Normalfall bei
`account` und `branding`).**

- [ ] Ein privates Browser-Fenster öffnen (keine alte Sitzung, kein falsches
      Konto).
- [ ] Die Site der Instanz öffnen (für `account`: der Kundenbereich
      `account.pukalani.app`) → **Registrieren** → Name, Adresse, Passwort,
      Haken bei den Bedingungen.
- [ ] Sichtbar danach: die Seite bittet um Bestätigung der Adresse; die Mail
      kommt, der Link bestätigt. Die Zustimmung zu den Bedingungen ist damit
      festgehalten.
- Die Passwort-Regeln aus [ANMELDE-REGELN.md](ANMELDE-REGELN.md) gelten auch
  hier (ein Passwort aus einem bekannten Datenleck wird abgelehnt).

**(2) In der Appwrite-Konsole — wenn die Registrierung `zu` ist (`admin`,
`portfolio`).**

- [ ] Appwrite-Konsole (nur in Davids Browser angemeldet) → das Projekt aus
      § 2 → **Auth** → **Users** → **Create user** → Name, Adresse, Passwort →
      **Create**.
- [ ] Sichtbar danach: das Konto steht in der Liste. Im Konto bei der Adresse
      **Verify** klicken, sonst gilt sie als unbestätigt.
- Ein so angelegtes Konto hat keine festgehaltene Zustimmung; die Site fragt
  beim ersten Besuch einmal danach (`.claude/rules/appwrite.md`,
  „ZUSTIMMUNG"). Das ist gewollt.

Gab es das alte Konto unter derselben Adresse, ist die Adresse nach dem
Löschen wieder frei. Das neue Konto hat trotzdem eine **neue Kennung** —
nichts, was an der alten Kennung hing, geht auf es über (§ 4).

### 3.2 Das Label setzen

Das ist der Weg, der immer offen bleibt: er hängt nicht am Dashboard, das
gerade niemand bedienen kann.

- [ ] Appwrite-Konsole → dasselbe Projekt → **Auth** → **Users** → das neue
      Konto über die Suche öffnen.
- [ ] Vorher abgleichen: Adresse und Anlage-Zeitpunkt passen zu dem Konto
      aus 3.1 (kein fremdes Konto mit ähnlichem Namen).
- [ ] Feld **Labels** → `admin` eintragen (klein, genau so) → **Update**.
- [ ] Sichtbar danach: in der Nutzerliste steht beim Konto das Label `admin`.

Weitere Labels nicht von Hand setzen: Labels für einzelne Communities vergibt
der Server selbst beim Beitritt ([LABEL-ABGLEICH.md](LABEL-ABGLEICH.md)).

### 3.3 In der Site prüfen

- [ ] Auf der Site mit dem neuen Konto anmelden (Sitzung von vor dem Label:
      einmal ab- und wieder anmelden). Das Dashboard zeigt jetzt den
      Bereich **Admin** (Einstellungen, Produkte, Nutzer).
- [ ] **Zwei-Faktor gleich einrichten** (Konto → Sicherheit) und die
      Wiederherstellungs-Codes sicher ablegen — das alte Konto hatte seine
      eigenen, sie gelten nicht mehr.
- [ ] Unter **Nutzer** steht das Konto mit Label `admin`; Konten und Zahl
      passen ungefähr zur Zeile des Wächters.

### 3.4 Den Alarm schließen

Der Wächter schließt das Issue selbst, sobald der tägliche Teil in einem Lauf
grün war. Der Halbstunden-Lauf prüft ihn nicht, darum von Hand:

```bash
gh workflow run production-watch.yml
```

- [ ] Im Lauf, Job `server`, Schritt „Hat jede Instanz noch ein
      Admin-Konto?": die Zeile des Projekts zeigt `✔ … Admins 1` und die
      Schlusszeile „… jede hat mindestens ein Admin-Konto".
- [ ] Am Issue erscheint der Kommentar „✅ Entwarnung", das Issue ist zu.
      Ist es noch offen, ist ein ANDERER Blick des Laufs rot — dessen Absatz
      in [PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md) § 4 lesen.
- [ ] Ins Issue einen Satz: wie es dazu kam, welcher Weg, wann geprüft.

## 4 · Was am gelöschten Konto hing — nur lesen

Gelöscht über „Konto löschen" in der Site (der übliche Fall) heißt: der
Server hat vor dem Konto alle Personendaten nach
[EXPORT-UND-LOESCHUNG.md](../referenz/EXPORT-UND-LOESCHUNG.md) entfernt —
Kommentare als leere Platzhalter, Beiträge geleert, private Nachrichten,
Stimmen und Reaktionen gelöscht, Rollen in Communities entfernt. **Das kommt
mit Weg A nicht zurück und ist auch nicht mehr dem neuen Konto zuzuordnen.**
Gelöscht in der Appwrite-Konsole heißt dagegen: nur das Konto ist weg, die
Zeilen tragen weiter die alte Kennung (dann zählt § 4.3 umso mehr).

Nachsehen, ohne etwas zu ändern:

1. - [ ] **Die Kopie vor dem Löschen.** Jede Löschung über die Site legt 30
   Tage lang eine Kopie für den Betreiber ab (Bucket `gdpr-exports`). In der
   Site der Instanz → Dashboard → **Admin** → **DSGVO-Exporte**: die Zeile mit
   dem Zeitpunkt der Löschung. Herunterladen verlangt eine frische Anmeldung
   und schreibt einen Eintrag ins Betreiber-Protokoll (das ist gewollt, keine
   Änderung an Daten). Die Kopie zeigt je Produkt, was dem Konto gehörte.
   **Frist:** 30 Tage nach der Löschung ist sie automatisch weg — beim Vorfall
   vom 2026-11-22 also um den 2026-12-22. Die Datei nicht ins Repo, in ein
   Issue oder einen Chat legen.
2. - [ ] **Communities, deren letzter Owner das Konto war.** Diese Rolle wird
   beim Löschen bewusst NICHT entfernt: die Mitglieds-Zeile bleibt mit der
   alten Kennung, nur die Adresse wird geleert. Zwei Stellen zum Nachsehen:
   das Server-Log der Site (pm2-Log der Platform) nennt die Communities in
   der Zeile `gdpr.community_owner_retained`; und in der Appwrite-Konsole,
   Projekt `admin` → **Databases** → Tabelle `community_members`, nach Rolle
   `owner` gefiltert, ist es die Zeile mit der alten Kennung und leerer
   Adresse (nur ansehen, nichts bearbeiten). Die Betreiber-Konsole zeigt
   Owner heute nicht an. Gibt es für eine solche Community keine zweite
   Owner-Zeile, hat sie keinen erreichbaren Owner mehr. **Einen Weg, den Besitz
   dann neu zu vergeben, gibt es im Produkt heute nicht** (der Besitz geht
   nur vom Owner selbst über, `community.transfer`). Betroffene Communities
   notieren (Namen nur dort, nie ins Repo) und als offenen Punkt melden.
3. - [ ] **Andere Rollen in Communities** (Admin, Moderation, Redaktion): sind
   mit dem Konto weg. Das neue Konto braucht dafür eine neue Einladung durch
   einen Owner.
4. - [ ] **Abos und Verträge** hängen an der Community, nicht am Konto, und
   bleiben ([EXPORT-UND-LOESCHUNG.md](../referenz/EXPORT-UND-LOESCHUNG.md),
   „Bewusst ausgenommen"). Nachsehen in der Betreiber-Konsole → **Stripe** bzw.
   **Communities**, Spalte Plan.
5. - [ ] **Betreiber-Protokoll:** Einträge des alten Kontos behalten seine
   Kennung als Nachweis, Name und IP sind geleert.

## 5 · Weg B — aus dem nächtlichen Backup (nur im Ausnahmefall)

Das Backup ([APPWRITE-WIEDERHERSTELLUNG.md](APPWRITE-WIEDERHERSTELLUNG.md))
ist ein Dump der **ganzen** Appwrite-Datenbank, jede Nacht um 03:30 UTC, mit
allen Projekten und allen Kunden darin. Es gibt kein Werkzeug, ein einzelnes
Konto daraus zu holen. Zwei Arten, es trotzdem zu nutzen, beide schlecht:

- **Alles zurückspielen:** setzt jede Community, jedes Konto und jeden
  Beitrag aller Projekte auf den Stand der letzten Nacht zurück. Alles
  zwischen 03:30 UTC und dem Zurückspielen ist verloren — für alle Kunden.
  Nicht für ein einzelnes Konto.
- **Nur das Konto herausziehen:** den Lauf auf einem Wegwerf-Server
  zurückspielen (§ 4 dort) und die Zeilen des Kontos von Hand in die
  laufende Datenbank kopieren (Konto, Anmelde-Ziele, Sitzungen, Zwei-Faktor,
  Mitgliedschaften — Appwrites eigene, nicht dokumentierte Tabellen). Nie
  geübt, ohne Werkzeug, und die Inhalte, die beim Löschen geleert wurden
  (§ 4), kämen damit nicht zurück, weil sie in den Produkt-Tabellen stehen.

**Nur dann erwägen**, wenn am alten Konto etwas Unersetzliches hängt, das mit
einer neuen Kennung nicht wieder herzustellen ist — und auch dann zuerst
fragen, ob die Kopie aus § 4.1 reicht. Entscheidung und Ausführung nur durch
David, mit eigenem Ja; vorher Weg A, damit die Instanz wieder bedienbar ist.

## 6 · Vorbeugen

- Die Regel oben (vor dem Löschen prüfen, welches Konto angemeldet ist).
- Eine Vertretung oder ein zweites Betreiber-Konto mit Label `admin` je
  Instanz hielte das Dashboard auch nach einem solchen Fehler bedienbar
  (offen unter „VT1" in [OPEN-ITEMS](../OPEN-ITEMS.md)).
- Der Schutz im Produkt selbst — „das letzte Admin-Konto lässt sich nicht
  löschen" — ist eine eigene Arbeit am Code, nicht Teil dieses Runbooks.

## Protokoll

| Datum | Projekt | Weg | Wer | Ergebnis |
| --- | --- | --- | --- | --- |
| 2026-11-23 | `account` | nicht im Repo festgehalten | David | Lauf von Hand 11:26 UTC: `Admins 1`, Issue 555 um 11:28 UTC selbst geschlossen |
