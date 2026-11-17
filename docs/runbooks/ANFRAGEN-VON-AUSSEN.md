# Anfragen von außen: Rechtsverstoß, Löschung, Auskunft

**Wann.** Jemand schreibt per Mail, Brief oder Formular: „Auf Ihrer Seite
steht …", „Löschen Sie meine Daten", „Welche Daten haben Sie über mich" —
oder es kommt ein Schreiben einer Behörde oder Kanzlei.

**Was dieses Runbook ist.** Es sagt, WO eine solche Anfrage ankommt und mit
welchen Handgriffen der Betreiber sie bearbeitet. Es ist keine Rechtsberatung:
ob und wie zu antworten ist, entscheidet David, im Zweifel mit dem Anwalt.
Wie Export und Löschung gebaut sind, steht in
[EXPORT-UND-LOESCHUNG.md](../referenz/EXPORT-UND-LOESCHUNG.md).

> **Regel.** Erst den Eingang festhalten und bestätigen, dann prüfen, WER
> fragt — und erst danach handeln. Eine Löschung lässt sich nicht
> zurücknehmen, eine Herausgabe an die falsche Person auch nicht.

---

## 1 · Wo Anfragen ankommen

| Weg | Wohin er führt |
| --- | --- |
| Formular „Missbrauch melden" (öffentlich, ohne Konto; auf `account.pukalani.app` und jedem Community-Host) | Zeile in der Betreiber-Konsole: `https://admin.pukalani.app/dashboard/abuse`. Dazu ein Hinweis in der Glocke jedes Kontos mit der Rolle `admin` und, wenn `NUXT_ALERT_EMAIL` gesetzt ist, eine Mail. **Eine Meldung sperrt nichts von selbst** — erst die Entscheidung des Betreibers (`packages/control/shared/abuseReports.ts`) |
| „Melden" an einem Beitrag, Kommentar oder einer Nachricht INNERHALB einer Community | Die Moderation dieser Community, nicht der Betreiber ([MODERATION-AND-LAYER-BOUNDARIES.md](../referenz/MODERATION-AND-LAYER-BOUNDARIES.md)) |
| Kontaktadresse von branding.supply (Entfernung, Sperre, Datenschutz) | Projekt-Postfach; die Adresse steht in `apps/branding/app/app.config.ts` |
| Kontakt auf pukalani.app und pukalani.studio | Davids Postfach |
| Korrektur zu einem Insights-Artikel, Meldung zu einem Eintrag im Verzeichnis | nur das Dashboard von branding.supply, keine Mail |
| Brief, Behörde, Kanzlei | Davids Anschrift |

## 2 · Bei jedem Eingang

- [ ] **Datum und Weg festhalten** (wann, worüber, von wem). Fristen laufen
      ab dem Eingang, nicht ab dem Lesen.
- [ ] **Eingang bestätigen, nichts zusagen:** „Ihre Nachricht ist am … bei
      uns eingegangen. Wir prüfen sie und melden uns."
- [ ] Wer nicht David ist: David Bescheid geben; bei Behörde oder Kanzlei
      auch dem Anwalt. Nichts selbst löschen, nichts herausgeben.

## 3 · Jemand meldet einen Inhalt

1. Die Meldung in `/dashboard/abuse` lesen (Zustände: offen, gesperrt,
   verworfen). Kam sie per Mail, den Inhalt selbst aufsuchen.
2. Liegt der Inhalt in einer Kunden-Community: Zuerst ist deren Leitung
   zuständig; sie hat die Werkzeuge der Moderation (ausblenden, entfernen).
   Der Betreiber greift ein, wenn die Community nicht handelt oder selbst das
   Problem ist.
3. Eine ganze Community vom Netz nehmen ist die Entscheidung „gesperrt" an
   der Meldung: Die Sperre wegen Missbrauchs lässt den Host 404 antworten,
   Seite und API (`.claude/rules/tenant-isolation.md`, „DIE SPERRE FRIERT NUR
   INHALTE EIN" — dort stehen beide Stufen). Gelöscht wird dabei nichts, und
   es lässt sich zurücknehmen.
4. War nichts dran: „verworfen". Die Adresse des Melders verschwindet nach
   90 Tagen von selbst.

## 4 · Jemand verlangt Auskunft

Der einfache Weg ist der eigene: Wer ein Konto hat, lädt seine Daten
angemeldet selbst herunter (`GET /api/auth/export`, im Konto-Bereich). Darauf
zuerst hinweisen.

Geht das nicht (kein Zugang mehr, Anfrage per Brief):

1. **Identität prüfen.** Eine Antwort von derselben Mail-Adresse beweist
   nichts — die Adresse kann übernommen sein. Maßstab wie in
   [MFA-NOTAUSGANG.md](MFA-NOTAUSGANG.md): ein zweiter, vorher bekannter Weg.
2. Im Dashboard der Site, auf der das Konto liegt: `/dashboard/users` → Konto
   → „Export". Verlangt eine frische Anmeldung (10 Minuten) und schreibt
   VORHER einen Eintrag ins Betreiber-Protokoll; ohne Eintrag gibt die Route
   nichts heraus (503 `audit_unavailable`).
3. Der Betreiber-Export enthält bewusst keinen Text privater Nachrichten
   (Inhalte Dritter). Steht in einem Abschnitt `{ "unavailable": true }`, war
   ein Teil nicht erreichbar — dann wiederholen, nicht so verschicken.
4. Konten gibt es je Site getrennt (Kunden-Communities, Betreiber-Seite,
   pukalani.studio, branding.supply). Wer „alles" verlangt, wird auf jeder
   gesucht.

## 5 · Jemand verlangt Löschung

Auch hier zuerst der eigene Weg: Das Konto löscht die Person angemeldet
selbst (Konto-Bereich; `DELETE /api/auth/account`).

Sonst, nach derselben Identitätsprüfung wie in § 4:

1. `/dashboard/users` → Konto → „Account löschen" (frische Anmeldung). Der
   Ablauf schreibt eine Kopie, sperrt das Konto, ruft jeden Layer auf und
   löscht das Konto erst, wenn JEDER Erfolg gemeldet hat.
2. Meldet die Oberfläche „Nur teilweise gelöscht — der Account ist gesperrt":
   nichts ist verloren, der Lauf lässt sich wiederholen. Grund im pm2-Log
   suchen, dann noch einmal.
3. Was danach noch da ist und wie lange (Kopie 30 Tage, einzelne Reste 90
   Tage, leere Platzhalter in Gesprächsfäden): die Tabellen „Was ‚gelöscht'
   heißt" und „Fristen" in
   [EXPORT-UND-LOESCHUNG.md](../referenz/EXPORT-UND-LOESCHUNG.md). Diese
   Angaben gehören in die Antwort an die Person.
4. **Ein gelöschtes Konto kommt nicht zurück.** Im Zweifel erst blockieren
   („Blockieren" löscht nichts) und klären.

Daten ohne Konto (ein Prüfergebnis auf branding.supply, ein
Newsletter-Abo, eine Zugangs-Anfrage): die Wege stehen je Produkt in
derselben Referenz; ein Newsletter-Abo endet über den Link in jeder Ausgabe.

## 6 · Was fehlt

- **Keine aufgeschriebenen Fristen und Pflichten.** Wo die DSGVO gilt, ist
  auf Auskunft und Löschung binnen eines Monats zu antworten (Art. 12); was
  am Sitz des Betreibers und in den übrigen Märkten gilt und wie mit Meldungen
  rechtswidriger Inhalte umzugehen ist, gehört in den Anwaltstermin
  (OPEN-ITEMS, „Ein Anwaltstermin für alles").
- **Kein Postfach mit Vertretung.** Anfragen per Mail liest heute nur David
  (PRODUKTIONS-ALARM.md, § 5).
- **Impressum und Datenschutz von pukalani.app** nennen noch keine Adresse
  (OPEN-ITEMS „A1").
- **Die Kunden-Hilfe** beschreibt das Löschen und Herunterladen des eigenen
  Kontos nicht.
