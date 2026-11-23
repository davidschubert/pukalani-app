# Pukalani-Konto, Etappe 2 — die zentrale Anmeldung

> **Plan-Status (2026-11-23):** nicht gebaut — Konzept, wartet auf Davids Entscheidungen (§ 12) und auf Schritt B von E1 ([OPEN-ITEMS](../OPEN-ITEMS.md) „PK1“).

**Sorte:** Plan (noch nicht gebaut). **Stand: 2026-11-23 · Status: Konzept
geschrieben, keine Entscheidung gefallen, nichts gebaut, nichts an
Production.**

Dieses Dokument vertieft die **zweite** Etappe des Gesamtkonzepts
[PUKALANI-KONTO.md](PUKALANI-KONTO.md) und baut auf der ersten auf
([PUKALANI-KONTO-E1.md](PUKALANI-KONTO-E1.md)). Davids zehn Antworten vom
2026-11-12 (Gesamtkonzept § 10) und seine Antworten zu E1 (E1 § 12, § 13.3,
§ 13.4) gelten unverändert und werden hier nicht neu gestellt. Neu sind nur
die Fragen, die erst beim Zuschnitt dieser Etappe auftauchen.

---

## 1. Ziel in einfachen Worten

**Das Passwort gibt man nur noch an einer Stelle ein: auf
`account.pukalani.app`.** Wer auf einer Community „Anmelden" klickt, landet
dort — mit Namen und Farben dieser Community („Anmelden bei X") — und kommt
danach angemeldet zurück, mit einer Eintrittskarte nur für diese Community.
Wer dort schon angemeldet ist, kommt auf einer zweiten Community ohne neues
Passwort hinein.

Und: **Was das ganze Konto betrifft, gibt es nur noch dort** — Passwort,
E-Mail, Zwei-Faktor, Geräte, Export, Konto löschen.

Warum das zählt: Nach E1 ist die Karte einer Seite außerhalb dieser Seite
wertlos. Aber das **Passwort** wird weiter auf jeder Seite eingetippt — auch
unter einer eigenen Domain, die dem Kunden gehört. Wer eine solche Adresse
umleitet, kann ein falsches Anmeldeformular zeigen. Mit E2 gibt es auf einer
fremden Adresse nichts mehr, wo ein Passwort hingehört; ein Formular dort ist
dann von selbst verdächtig.

## 2. Was heute ist (nach E1, am Code belegt)

| Was | Heute | Beleg |
| --- | --- | --- |
| Anmeldeformulare | auf **jeder** Seite: Anmelden, Registrieren, Code, Passwort vergessen, Zurücksetzen, Bestätigen | `packages/core/app/pages/login/`, `register/`, `forgot-password.vue`, `reset-password.vue`, `verify.vue` |
| Anmelde-Routen | antworten auf jedem Host, auch unter eigener Domain (dort ausdrücklich erlaubt) | `packages/core/server/api/auth/login.post.ts`, `signup.post.ts`, `otp*`, `oauth/*`, `mfa/challenge.post.ts`; Erlaubnisliste `packages/core/shared/customDomainScope.ts` |
| Was nach der Anmeldung im Cookie liegt | im Modus `write`: eine Karte nur für diesen Host und diese Community; im Modus `read` (Production heute): noch Klartext | `packages/core/server/utils/siteCard.ts`, [PK1-EINSCHALTEN.md](../runbooks/PK1-EINSCHALTEN.md) |
| Wechsel vom Kundenbereich in eine Community | ein Siegel, 60 s, an den Ziel-Host gebunden; das Ziel stellt eine **eigene** Sitzung aus (Zwei-Faktor-Konten: Kopie im Umschlag) | `packages/core/server/utils/sessionHandoff.ts`, `api/auth/site-session.get.ts` |
| Kontoweites | unter einer eigenen Domain im Modus `write` gesperrt; unter `*.pukalani.app` weiter in jedem Community-Dashboard | `customDomainScope.ts`; `password.put.ts`, `mfa/*`, `sessions/*`, `export.get.ts`, `account.delete.ts` |
| Google | Rückkehr auf den Host, der begonnen hat; jeder Host braucht Appwrite-seitig eine erlaubte Adresse | `oauth/index.get.ts`, `oauth/callback.get.ts`, [GOOGLE-LOGIN.md](../runbooks/GOOGLE-LOGIN.md) |
| Einbettung (Kommentare auf fremden Seiten) | Anmelden im Popup des Pukalani-Hosts, danach eine abgetrennte Sitzung | `embed-handoff.post.ts`, `embed-session.post.ts` |
| Mails von Appwrite (Bestätigen, Passwort, Code) | Links zeigen auf den Host, auf dem die Handlung begann | `verification.post.ts`, `recovery.post.ts`; Regel `.claude/rules/hosts-ops.md` (Mail-Links) |
| Konto löschen | sofort und endgültig, nach frischer Anmeldung; 30 Tage nur eine Kopie für den Betreiber | `account.delete.ts`, [EXPORT-UND-LOESCHUNG.md](../referenz/EXPORT-UND-LOESCHUNG.md) |
| Auf Production | Modus `read`, Schritt B (`write`) vorbereitet, wartet | [OPEN-ITEMS](../OPEN-ITEMS.md) „PK1-EIN" |

## 3. Was sich ändert

**Für Mitglieder**

- „Anmelden" und „Registrieren" auf einer Community führen kurz zu
  `account.pukalani.app`, im Kleid der Community (Name, Logo, Farbwelt). Danach
  ist man zurück auf derselben Seite, an derselben Stelle.
- Wer dort schon angemeldet ist, klickt auf einer zweiten Community nur noch
  „Weiter als …" — kein zweites Passwort. Zwei-Faktor fragt die zentrale
  Stelle einmal, nicht jede Seite.
- „Passwort vergessen", Anmelde-Code und Google laufen ebenfalls dort. Die
  Links in den Mails zeigen auf `account.pukalani.app`.
- Unter einer eigenen Domain verlässt man für die Anmeldung kurz die Adresse
  des Kunden (wie bei jedem großen Anbieter).
- Passwort, E-Mail, Zwei-Faktor, Geräte, Export und „Konto löschen" stehen nur
  noch im Kundenbereich; in den Einstellungen einer Community steht dort ein
  Link „Konto verwalten".
- Wann man einer Community **beitritt**, ändert sich in E2 **nicht**: wer sich
  auf einer Community registriert, ist ihr beigetreten (A5); auf einer
  zweiten bleibt es wie heute. Der Beitritt mit sichtbarem Ja kommt in E3.
- „Abmelden" auf einer Seite beendet weiter nur diese Seite; „Überall
  abmelden" gibt es im Kundenbereich.

**Für Owner**

- Nichts Neues beim Verwalten: das Dashboard bleibt unter der
  Pukalani-Adresse der Community (seit E1).
- Plan und Zahlung: ob sie in E2 an die zentrale Stelle ziehen, ist
  Entscheidung 4 (§ 12). Ohne diese Entscheidung bleiben sie, wo sie sind.
- Einladungen funktionieren wie bisher; wer eine Einladung annimmt und kein
  Konto hat, registriert sich an der zentralen Stelle und kommt in die
  Community zurück.

**Für den Betreiber:** die Konsole (`admin.pukalani.app`) behält ihre eigenen
Konten und ihre eigenen Formulare (Gesamtkonzept § 10 Nr. 10). Sie ist der
Ort, von dem aus man eine gestörte zentrale Anmeldung repariert.

**Silos:** branding.supply und pukalani.studio ändern sich in E2 nicht; sie
hängen sich in E4 an.

## 4. Was E2 von Schritt B (E1 auf `write`) braucht

E2 setzt auf, was E1 erst im Modus `write` wirklich tut. Darum **beginnt der
Bau erst, wenn Schritt B auf der Platform gelaufen und geprüft ist**:

| Was E2 braucht | Warum | Woran man es sieht |
| --- | --- | --- |
| Die Platform schreibt Karten (`write`) | Die Rückkehr von der zentralen Stelle stellt eine **Karte** aus. Im Modus `read` gäbe es nur Klartext — dann trüge E2 das kontoweite Geheimnis wieder auf jede Seite. | `/api/health`: `siteCard.mode: write`, `cards: true` |
| Eigene Sitzung je Seite ist auf Production bewiesen | Die Rückkehr nutzt denselben Weg wie der Wechsel aus dem Kundenbereich (Siegel → eigene Sitzung). Was dort hakt, hakt in E2 bei jeder Anmeldung. | Klick-Probe aus Schritt B 1 bestanden |
| Live-Verbindung unter eigenen Domains läuft | Nach der Rückkehr verbindet die Seite live über unseren Server; ohne ihn wären Mitglieder unter eigenen Domains nur Gast. | `liveRelay: true` |
| Die Sitzungs-Obergrenze ist gelesen und passt | E2 bringt je Gerät **eine Sitzung mehr** (die zentrale). | Wert im Protokoll von PK1-EINSCHALTEN § 2 |
| Der einmalige Abmelde-Lauf (Schritt C) | Nicht zwingend vor dem Bau, aber vor dem Einschalten von E2: sonst leben kopierte Alt-Sitzungen weiter, und „überall abmelden" an der zentralen Stelle wirkt auf sie nicht so, wie die Seite es sagt. | Werkzeug fehlt noch (PK1-EIN) |
| Ein Admin-Konto im Projekt `account` | Schritt B wartet darauf; ohne Admin lässt sich auch E2 nicht bedienen und nicht prüfen. | Aussperr-Wächter grün ([ADMIN-KONTO-WIEDERHERSTELLEN.md](../runbooks/ADMIN-KONTO-WIEDERHERSTELLEN.md)) |

Das **Konzept** und der **Prototyp** (Gesamtkonzept § 8: vor jeder Etappe ein
Prototyp und Davids Freigabe) hängen nicht an Schritt B und können vorher
fertig werden.

## 5. Die Lösung — drei Varianten

Alle drei teilen den Grundsatz aus E1: **Auf einem Host, der nicht uns
gehört, liegt nie ein Wert, der woanders gilt** — und neu: **dort wird nie ein
Passwort eingegeben.**

### Variante A — Zentrale Seite mit Rücksprung (Empfehlung)

- **Ablauf:** Die Seite schickt den Browser zu
  `account.pukalani.app/login` und nennt nur, **welche Community** zurück
  will. Wohin zurück gesprungen wird, bestimmt die zentrale Stelle selbst aus
  der Auflösung der Community (kanonischer Host), nie aus einer Adresse im
  Aufruf — sonst wäre die Anmeldung ein offener Umleiter.
- **Nach der Anmeldung:** die zentrale Stelle hat ihre eigene Sitzung (für
  das Wiedererkennen) und stellt für die Community ein Siegel aus, 60 s, an
  Host und Community gebunden, nur einmal einlösbar — derselbe Baustein wie
  beim Wechsel aus dem Kundenbereich, nur in die Gegenrichtung. Die Seite löst
  es ein (`site-session`) und bekommt ihre Karte.
- **Formulare:** die Seiten-Formulare leiten um; die Routen dahinter
  antworten auf Community-Hosts nicht mehr (wie die kontoweiten unter eigener
  Domain seit E1, nur jetzt für alle Community-Hosts). Ein Schalter je App
  lässt sie bis E5 zurückholen.
- **Google:** nur noch eine Rückkehr-Adresse, die der zentralen Stelle.
- **Einbettung:** das Popup zeigt künftig die zentrale Seite.
- **Datenbank:** keine neue Tabelle, keine Migration.
- **Aufwand:** L.

### Variante B — Zentrale Anmeldung im Fenster über der Seite

- Die zentrale Seite öffnet sich als Popup oder eingebetteter Rahmen über der
  Community; das Ergebnis geht per Nachricht an die Seite zurück.
- **Vorteil:** man verlässt die Seite nicht sichtbar.
- **Nachteile:** Popups werden geblockt; ein eingebetteter Rahmen zeigt keine
  Adresszeile — genau das, was eine gefälschte Anmeldung auch täte, und das
  Ziel „man sieht, wo man sein Passwort eingibt" fällt. Cookies im Rahmen
  sind in vielen Browsern abgetrennt (wie bei der Einbettung heute), das
  Wiedererkennen trägt dann nicht. Mehr bewegliche Teile als A.
- **Aufwand:** L–XL. Sinnvoll nur für die Einbettung, die heute schon so
  arbeitet.

### Variante C — Nur unter eigenen Domains zentral

- Unter `*.pukalani.app` bleiben die Formulare auf der Seite; nur eigene
  Domains leiten zur zentralen Stelle.
- **Vorteil:** klein (M), schließt das Passwort-Loch unter fremden Adressen.
- **Nachteile:** widerspricht Davids Entscheidung „Passwort immer auf
  `account.pukalani.app`" (Gesamtkonzept § 10 Nr. 2); zwei Anmelde-Wege
  bleiben dauerhaft nebeneinander, kein Wiedererkennen zwischen Communities.
- **Wann sinnvoll:** nur als Zwischenschritt, falls die erste Kundendomain
  live geht, bevor A fertig ist.

**Empfehlung: Variante A.** Sie trifft Davids Entscheidung ganz, nutzt den
Baustein, den E1 schon auf Production bringt, braucht keine Tabelle und keine
Migration, und die Adresszeile zeigt bei jeder Anmeldung die echte Stelle.
B passt nur für die Einbettung; C ist eine Teilmenge von A.

## 6. Was an Datenbank, Env und Server nötig wäre

Jeder Punkt mit „**Klick**" braucht Davids ausdrückliches Ja in der bauenden
Session. Einzeln:

| # | Was | Wo | Klick? |
| --- | --- | --- | --- |
| 1 | **Keine Migration** (Variante A). Bei Entscheidung 5 „ja" (Bedenkzeit): eine Spalte oder Zeile „Löschung vorgemerkt" — dann eine Migration auf Production. | — | bei 5 **Klick** |
| 2 | **Schalter** für die zentrale Anmeldung (Name im Bau, z. B. `NUXT_CENTRAL_LOGIN_MODE`: `off` · `on`, Core-Vorgabe `off`), je App mit Anmeldung. Zurück ohne Ausliefern. | `.env` der Platform auf Production | **Klick** |
| 3 | **Google:** die Rückkehr-Adresse der zentralen Stelle in der Google-Console und in Appwrite eintragen (meist schon da, weil `account.pukalani.app` heute ein Host der Platform ist — vorher nachsehen); erst nach dem Einschalten die übrigen entfernen. | Google-Console, Appwrite-Konsole Projekt `account` | **Klick** |
| 4 | **Sitzungs-Obergrenze** im Projekt `account` mit der zentralen Sitzung neu rechnen (eine je Gerät mehr); steht sie auf `0`, nichts tun. | Appwrite-Konsole | **Klick** nur, wenn sie geändert werden muss |
| 5 | **Bot-Prüfung (Turnstile):** die zentrale Stelle braucht den Hostnamen `account.pukalani.app` im Widget; vorher nachsehen, ob er schon drin ist. | Cloudflare | **Klick** nur, wenn er fehlt |
| 6 | **Mail-Vorlagen von Appwrite** (Bestätigen, Passwort, Code): Links zeigen auf die zentrale Stelle. Der Link entsteht in unserem Code; die Vorlagen selbst ändern sich nur, wenn ein Text „auf dieser Seite" sagt. | `scripts/ops/appwrite-mail/templates/` | **Klick** nur bei Text-Änderung (Einspielen je Projekt) |
| 7 | **nginx, TLS, DNS:** nichts — `account.pukalani.app` ist schon ein Host der Platform. | — | nein |
| 8 | **Klick-Probe** in Davids Browser nach dem Einschalten (§ 9). | Production | **Klick** |

## 7. Was vor dem Bau zu klären ist (E2-Beweis, lokal)

1. **Zwei-Faktor an der zentralen Stelle:** die zentrale Sitzung ist voll
   bestätigt. Die Karte einer Seite entsteht wie in E1 — für
   Zwei-Faktor-Konten als Kopie im Umschlag (Davids Wahl E1 § 13.4 (a)). Zu
   messen: trägt die Kopie der zentralen Sitzung auf jede Seite, und was heißt
   dann „auf einer Seite abmelden" für die zentrale Sitzung?
2. **Frische Anmeldung** (`requireRecentAuth`) für Löschen und Export: gilt
   künftig nur noch an der zentralen Stelle — prüfen, dass keine Seite mehr
   eine frische Anmeldung braucht.
3. **Rücksprung unter eigener Domain:** das Siegel reist in der Adresse der
   Rückkehr (60 s, einmal). Prüfen, dass es nicht im Protokoll eines
   Webservers landet, der dem Kunden gehört — sonst kürzer oder als Formular
   statt als Adresse.
4. **Einladungs-Links und Bestätigungs-Mails**, die heute auf einen
   Community-Host zeigen: kommen sie über die zentrale Stelle an die richtige
   Community zurück?
5. **Wiedererkennen auf einem geteilten Rechner** (Entscheidung 2).
6. **Kosten:** eine Umleitung mehr je Anmeldung, keine mehr je Anfrage.

## 8. Wie man zurückgeht

- **Schalter zurück auf `off`**, App neu laden: die Formulare der Seiten sind
  wieder da, die Routen antworten wieder. Wer angemeldet ist, bleibt es (die
  Karten aus E1 gelten weiter). Die zentrale Sitzung stört nicht.
- **Bedenkzeit beim Löschen** (falls Entscheidung 5 „ja"): zurück heißt
  „sofort endgültig wie heute"; vorgemerkte Konten werden dann sofort
  gelöscht oder zurückgeholt — das entscheidet David je Fall, nie ein Lauf.
- **Zahlung zentral** (falls Entscheidung 4 „in E2"): die Weiterleitung vom
  alten Plan-Reiter bleibt; zurück heißt Plan-Reiter wieder im Dashboard.
- Die alten Formulare bleiben bis E5 im Code — erst dann ist der Rückweg ein
  Rückbau.

## 9. Wie man es beweist

**Lokal (Worktree, eigene Ports):**

- Unit-Tests: Rücksprung-Ziel nur aus der Auflösung der Community (eine
  fremde Adresse im Aufruf wird ignoriert), Siegel einmal einlösbar, falscher
  Host / falsche Community / abgelaufen ⇒ abgewiesen.
- Rollen-Tests (OPS-009) für jede neue Route; der Wächter über alle Routen:
  auf einem Community-Host antworten Anmelden, Registrieren, Code und
  Kontoweites im Modus `on` nicht mehr.
- Wächter-Test „kein Passwort-Feld außerhalb der zentralen Stelle" (über die
  Seiten der Apps mit Anmeldung, Konsole ausgenommen).

**Auf der Bühne** (`pnpm buehne up`, kunde-a und kunde-b, eine mit gestellter
eigener Domain):

- Anmelden auf kunde-a über die zentrale Stelle ⇒ zurück auf kunde-a,
  angemeldet, Cookie ist eine Karte.
- Danach kunde-b ⇒ „Weiter als …", ohne Passwort; zwei Seiten-Sitzungen plus
  die zentrale in der Geräte-Liste.
- Siegel von kunde-a auf kunde-b eingelöst ⇒ abgewiesen.
- Unter der gestellten eigenen Domain: kein Formular, Anmelden führt zur
  zentralen Stelle und zurück.
- Registrieren auf kunde-a ⇒ Konto und Beitritt zu kunde-a (A5), nicht zu
  kunde-b.
- Playwright-Lauf der Anmelde-, Registrier- und Einladungs-Pfade
  (`--reporter=dot`), Einbettungs-E2E.

**Live (nach dem Einschalten):**

- `curl https://<host>/api/health` → `.build` = Spitze von `main`, Schalter
  sichtbar.
- Klick-Probe in Davids Browser, im **privaten Fenster mit einem eigenen
  Probe-Konto** (Lehre aus dem Vorfall vom 2026-11-22): auf
  `demo.pukalani.app` anmelden ⇒ Adresszeile zeigt `account.pukalani.app`,
  zurück angemeldet; zweite Community ohne Passwort; auf der ersten abmelden ⇒
  die zweite bleibt; „Passwort vergessen" ⇒ Mail-Link zeigt auf die zentrale
  Stelle; Google einmal durchklicken.

## 10. Risiken

| Risiko | Gegenmittel |
| --- | --- |
| Die zentrale Stelle ist gestört ⇒ niemand kann sich irgendwo anmelden. | Wer angemeldet ist, bleibt es (Karten gelten weiter); Schalter zurück auf `off` holt die Formulare der Seiten ohne Ausliefern zurück; die Konsole hat eigene Konten. |
| Offener Umleiter: die Anmeldung schickt nach einer fremden Adresse zurück. | Rücksprung-Ziel nie aus dem Aufruf, nur aus der Auflösung der Community; Unit-Test mit fremder Adresse. |
| Das Siegel landet im Protokoll eines fremden Webservers. | 60 s, einmal einlösbar, an Host und Community gebunden; § 7 Punkt 3 misst, ob es als Formular statt in der Adresse reisen muss. |
| Mitglieder halten die Umleitung für einen Angriff. | Kleid der Community auf der zentralen Seite, klarer Satz „Anmelden bei X über dein Pukalani-Konto"; Hilfe-Text. |
| Sitzungs-Obergrenze wirft Menschen raus (eine Sitzung mehr je Gerät). | Wert lesen, wenn nötig anheben (§ 6 Punkt 4); das Aufräumen verwaister Seiten-Sitzungen (PK1-EIN) vorher bauen. |
| Einladungs- oder Mail-Links führen ins Leere. | § 7 Punkt 4; Bühnen-Pfad für Einladung ohne Konto. |
| Einbettung bricht. | Einbettungs-E2E vor dem Einschalten. |
| Ein geteilter Rechner bleibt an der zentralen Stelle angemeldet. | Entscheidung 2. |

## 11. Grobe Größe

| Schritt | Inhalt | Sessions |
| --- | --- | --- |
| E2-Prototyp | zentrale Seite im Kleid einer Community, „Weiter als …", Link „Konto verwalten" — mit echten Nuxt-UI-Bausteinen, zur Freigabe | 1 |
| E2a | Beweis § 7, Rücksprung-Siegel, Schalter, zentrale Seite (Anmelden, Code, Zwei-Faktor, Google) | 1 |
| E2b | Registrieren, Passwort vergessen, Bestätigen, Einladungen und Mail-Links über die zentrale Stelle; Einbettung umgehängt | 1 |
| E2c | Kontoweites nur zentral auch unter `*.pukalani.app`, Links in den Dashboards, Wächter-Tests, Bühne, Runbook-Teil zum Einschalten | 1 |
| (E2d) | nur bei Entscheidung 5 „ja": Bedenkzeit beim Löschen samt Fristen-Lauf und Texten | 1 |
| (E2e) | nur bei Entscheidung 4 „in E2": Plan und Zahlung an die zentrale Stelle, Weiterleitung für die Rückkehr von Stripe | 1–2 |

**Zusammen 4 Sessions** (Größe L), mit beiden Zusätzen bis 7. Jede mit
eigenem Pull Request; Einschalten erst danach, mit Davids Ja.

## 12. Entscheidungen für David

Bereits entschieden und hier nicht neu gefragt: Weg (a), „Passwort immer auf
`account.pukalani.app`", „Heikles nur zentral", mitmachen ja und verwalten
nein unter eigenen Domains, die Konsole mit eigenen Konten (Gesamtkonzept
§ 10); Zwei-Faktor-Konten mit Kopie im Umschlag (E1 § 13.4).

| # | Frage | Empfehlung | Folge |
| --- | --- | --- | --- |
| 1 | Welche Variante für die zentrale Anmeldung? | **A — zentrale Seite mit Rücksprung.** | Man sieht bei jeder Anmeldung `account.pukalani.app` in der Adresszeile; keine Tabelle, keine Migration. B nur für die Einbettung; C ließe zwei Wege dauerhaft stehen. |
| 2 | Wie lange bleibt man an der zentralen Stelle wiedererkannt? | **So lange wie eine Sitzung heute, mit Kästchen „Auf diesem Gerät angemeldet bleiben" (an); ohne Haken endet die zentrale Sitzung, wenn der Browser schließt.** | Bequem auf dem eigenen Gerät, sicher auf einem geteilten. Die Seiten-Karten sind davon unabhängig — wer sich zentral abmeldet, bleibt auf den Seiten angemeldet, bis er dort oder unter „Überall abmelden" abmeldet. |
| 3 | Fallen Passwort, Zwei-Faktor, Geräte, Export und „Konto löschen" in E2 auch aus den Dashboards unter `*.pukalani.app` (nur noch Link „Konto verwalten")? | **Ja, in E2.** | Setzt „Heikles nur zentral" ganz um, ein Klick mehr für diese seltenen Handlungen. Sprache und Benachrichtigungen bleiben bei der Seite (E3 macht sie je Seite). |
| 4 | Ziehen Plan und Zahlung der Communities schon in E2 an die zentrale Stelle? | **Nein, eigener Schritt nach E2** (vor oder mit E3). | E2 bleibt eine reine Anmelde-Etappe und einzeln rückholbar. Owner zahlen bis dahin weiter im Dashboard ihrer Community; die Rückkehr von Stripe bleibt unverändert. |
| 5 | Bekommt „Konto löschen" mit dem Umzug an die zentrale Stelle eine **Bedenkzeit von 30 Tagen** (Gesamtkonzept § 8, [WIEDERHERSTELLUNG.md](WIEDERHERSTELLUNG.md) „Für später")? | **Ja, in E2** — der Vorfall vom 2026-11-22 zeigt, wie teuer ein endgültiges Löschen im falschen Moment ist. | Ein Schritt mehr (E2d), eine Migration auf Production, Datenschutz- und Lösch-Texte ändern sich (Anwalt). Ein Weg „jetzt endgültig" bleibt. Der letzte Owner einer Community und der Kunde bei Stripe brauchen dabei eigene Regeln. |
| 6 | Wann darf der Bau beginnen? | **Prototyp sofort; Bau nach Schritt B auf der Platform mit bestandener Klick-Probe; Einschalten erst nach Schritt C und einer Woche ohne Befund.** | E2 baut auf einer bewiesenen Karte auf; der Prototyp kann David vorher gezeigt werden. Bis Schritt B läuft, wartet E2. |
