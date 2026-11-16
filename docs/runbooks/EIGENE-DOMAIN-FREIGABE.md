# Runbook: eigene Domain einer Community freigeben, abschalten, wieder einschalten

Stand 2026-11-16 (Gesamtaudit P15, Findings BE-014 und SEC-022). Gilt für
Pool-Communities (Tabelle `communities` im Control Plane). Wie die eigene Domain
gebaut ist, steht in [EIGENE-DOMAIN.md](../referenz/EIGENE-DOMAIN.md); die erste
Aktivierung einer Kundendomain in
[CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md](CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md). Dieses
Runbook beschreibt die Handgriffe des Betreibers.

## 1. Was gilt

Eine Community darf eine eigene Domain haben, wenn alle drei Dinge stimmen
(`customDomainEntitlement`, `packages/control/shared/customDomain.ts`):

1. Plan **Pro**,
2. **nicht in der Testphase** (ein bezahltes Abo zählt nicht als Testphase),
3. vom Betreiber **freigegeben**.

Die Freigabe ist eine Übergangsregel, bis das Pukalani-Konto je Seite eine
eigene Sitzung ausstellt ([PUKALANI-KONTO.md](../plans/PUKALANI-KONTO.md),
Etappe E1). Bis dahin gilt: Wer die DNS einer Kundendomain steuert, steuert
auch, wohin die Anmeldung ihrer Mitglieder geht. Freigegeben wird deshalb nur
eine Community, deren Betreiber wir kennen.

Fehlt eine der drei Bedingungen, kann der Owner keine Domain eintragen, prüfen
oder wieder einschalten. Lesen und Entfernen gehen immer.

## 2. Freigeben

1. `admin.pukalani.app` → **Communities**.
2. In der Zeile der Community, Spalte **Eigene Domain**: Schalter
   **freigegeben** einschalten.
3. Im Protokoll (Dashboard → Admin) steht danach
   „hat die eigene Domain von … freigegeben".

Die Freigabe gehört zur Community, nicht zur Domain: Sie bleibt, wenn der Owner
seine Domain entfernt oder eine andere einträgt. Der Owner sieht auf seiner
Seite **Community-Einstellungen → Eigene Domain** ab jetzt das Eingabefeld
statt des Hinweises „Eigene Domains schalten wir zurzeit einzeln frei".

## 3. Freigabe entziehen

Schalter ausschalten. Ist die Domain gerade **aktiv**, fragt die Seite nach und
schaltet die Domain **sofort** ab (ohne Frist): Besucher der Domain landen auf
der Pukalani-Adresse, gelöscht wird nichts. Im Protokoll steht
„hat … die Freigabe für die eigene Domain entzogen", mit dem Zustand vorher
und nachher.

## 4. Was „abgeschaltet" heißt

Zustand `paused`:

- Domain, Nachweis-Eintrag, Server-Eintrag bei ploi und Zertifikat **bleiben**.
- Die Community antwortet unter ihrer Pukalani-Adresse; die Umleitung von dort
  auf die eigene Domain entfällt.
- Wer die eigene Domain aufruft (beide Formen, mit und ohne `www`), wird
  vorübergehend auf die Pukalani-Adresse geleitet (302, bei Schreibzugriffen
  307, `Cache-Control: no-store`).
- Mitglieder, die unter der eigenen Domain angemeldet waren, melden sich unter
  der Pukalani-Adresse neu an (die Anmeldung hängt an der Adresse).
- Für andere Communities bleibt die Domain vergeben.

**Wieder einschalten** kann nur der Owner: **Community-Einstellungen → Eigene
Domain → Wieder einschalten**. Das geht, sobald die drei Bedingungen aus
Abschnitt 1 wieder stimmen. Der Klick prüft DNS und Nachweis neu; stimmt etwas
nicht, bleibt die Domain abgeschaltet und die Seite sagt, woran es hängt.

## 5. Plan endet: Schonfrist und Hinweise

Endet die Testphase oder das Abo, oder wechselt die Community auf Personal,
läuft für eine aktive Domain eine Frist von **14 Tagen**:

| Wann | Was |
| --- | --- |
| erster Lauf nach dem Plan-Ende | `customDomainGraceEndsAt` wird gesetzt; der Owner bekommt die erste Mail und einen Eintrag in der Glocke |
| drei Tage vor dem Ende | zweite Mail und zweiter Eintrag |
| am Ende der Frist | Zustand `paused` (Abschnitt 4) |
| Pro kommt in der Frist zurück | die Frist wird gelöscht, nichts weiter geschieht |

Zwei stündliche Läufe erledigen das:

- **`custom-domain-sweep`** in der Betreiber-App stempelt und schaltet ab. Er
  lässt außerdem Einträge ohne bestandenen Nachweis nach 14 Tagen verfallen.
- **`custom-domain-notice`** in der Platform-App liest die Stempel und meldet.
  Jede Meldung hat eine feste Kennung aus Community, Frist-Ende, Art und Konto;
  sie geht genau einmal. Die Mail geht auch an Owner, die Benachrichtigungen
  abgeschaltet haben (es ist ein Hinweis zum Vertrag).

### Der Lauf zählt zuerst nur

Schalter `pukalani.control.customDomainSweep` in
`apps/control/app/app.config.ts`:

| Wert | Wirkung |
| --- | --- |
| `dry-run` | zählt und schreibt eine Protokoll-Zeile `custom_domain.sweep_dry_run`; ändert nichts |
| `apply` | stempelt, schaltet ab, lässt verfallen; eine Zeile je Handgriff |
| `off` | der Lauf ist nicht angemeldet |

Die Zahlen stehen jederzeit auf `admin.pukalani.app` → **Communities** → Karte
**Eigene Domains: Schonfrist-Lauf** (Knopf „Neu zählen"). Die Karte zählt
immer nur, auch wenn der Lauf scharf ist.

**Scharf schalten** ist ein eigener kleiner Pull Request (Wert auf `apply`),
nach einem Blick auf die Karte. Solange der Lauf nur zählt, gibt es keine
Stempel, also verschickt auch die Platform-App nichts.

### Einzelfälle

- **Frist verlängern:** `customDomainGraceEndsAt` der Zeile von Hand in die
  Zukunft setzen (Appwrite-Konsole, Projekt `admin`). Die Erinnerung geht dann
  drei Tage vor dem neuen Ende noch einmal hinaus.
- **Sofort wieder aktiv, ohne dass der Owner klickt:** nicht vorgesehen. Die
  Prüfung von DNS und Nachweis gehört zum Wieder-Einschalten.
- **Eine Domain steht bei der falschen Community:** Der Owner entfernt sie,
  oder der Betreiber leert die Domain-Felder der Zeile. Ein Eintrag ohne
  Nachweis blockiert niemanden und verfällt nach 14 Tagen von selbst.

## 6. Was man im Protokoll sieht

| Zeile | Bedeutung |
| --- | --- |
| `custom_domain.sweep_dry_run` | Zählung, nichts geändert |
| `custom_domain.grace_started` / `.grace_cleared` | Frist gesetzt oder gelöscht |
| `custom_domain.paused` | abgeschaltet nach Ablauf der Frist |
| `custom_domain.claim_stamped` / `.claim_expired` | Eintragsdatum nachgetragen, Eintrag verfallen |
| `custom_domain.sweep_failed` | eine Community ließ sich nicht bearbeiten; der Lauf zählt als gescheitert |
| `custom_domain.notice_mail_failed` | der Eintrag in der Glocke steht, die Mail ging nicht hinaus (kein zweiter Versuch) |
| `community.custom_domain_denied` / `…_plan_denied` | ein Owner wurde an einer der drei Bedingungen abgewiesen |

Bleibt ein Lauf aus, meldet es der tägliche Blick „In die App hinein"
([PRODUKTIONS-ALARM.md](PRODUKTIONS-ALARM.md)).

## 7. Verwandt: die Testphase

Die Testphase gibt es einmal je Konto (Tabelle `trial_claims` im Control
Plane, eine Zeile je Konto). Soll ein Konto im Einzelfall eine weitere
bekommen: entweder `trialEndsAt` der neuen Community in die Zukunft setzen und
die Sperre aufheben, oder die Zeile des Kontos in `trial_claims` löschen,
bevor es die nächste Community anlegt.
