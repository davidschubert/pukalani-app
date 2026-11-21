# Eigene Domain — wie es gebaut ist

**Sorte:** Referenz (wie ist X gebaut, und warum so). Gebaut 2026-08-07/08
(Migrationen `control-035` für den Pool, `control-036` für Silo-Sites);
Freigabe, Frist und Abschalten seit 2026-11-16 (`control-040`, SEC-022/BE-014,
nur Pool).

**Was hier NICHT steht, damit es nicht doppelt gepflegt wird:**

- **Wie man es im Betrieb durchführt** — inklusive der vier Fehler des
  Erstlaufs, der Port-80-Falle und des Notfall-Rezepts für eine zerstörte
  Zertifikats-Linie: `docs/runbooks/CUSTOM-DOMAIN-ERSTAKTIVIERUNG.md`.
- **Die vier Produkt-Entscheidungen** (ab Pro · 301 statt Umzug ·
  Selbstbedienung · www+Apex automatisch): `docs/DECISION-LOG.md`, 2026-08-07.
- **Der Bau-Beleg mit Beweiszahlen und Gelernt-Zeilen:**
  `docs/OPEN-ITEMS-COMPLETE.md` (F52, F54 und der Domain-Eintrag).
- **Was der Kunde liest:** `apps/help/content/anleitung/3.produkte/10.eigene-domain.md`.
- **Wo die Hosts in der Landkarte stehen:**
  `docs/content/2.architektur/6.hosts-und-ports.md`.

---

## 1. Die eine Idee

Eine Community (oder eine Silo-Site) bekommt einen **kanonischen Host**. Ist
eine eigene Domain `active`, ist sie dieser Host; sonst bleibt es die
Pukalani-Subdomain. Jeder andere Host derselben Community **leitet dorthin um**
— die Subdomain bleibt als Rückfall bestehen, sie wird nie abgeschaltet.

Das ist bewusst KEIN Umzug: es gibt keinen Zeitpunkt, an dem alte Links tot
sind.

## 2. Zwei Wege, ein Regelwerk

Pool und Silo unterscheiden sich **nur** darin, wie der Host bei ploi hängt —
die Regeln, was erlaubt ist, teilen sie sich.

| | Pool-Community | Silo-Site |
| --- | --- | --- |
| Datenmodell | `communities.customDomain*` (control-035) | eigene Zeile je Website (control-036) |
| Bei ploi | **Tenant** an `platform.pukalani.app` | **Alias** an der eigenen Site |
| Zertifikat | eigene Lineage je Tenant | die Lineage der Site, um den Namen erweitert |
| Kunden-Oberfläche | `packages/onboarding` → `/dashboard/community/domain` | `packages/domains` → derselbe Pfad |
| Betreiber-Oberfläche | — | `admin.pukalani.app/dashboard/websites` |

`packages/domains` wird bewusst **nicht** an `apps/platform` ausgeliefert:
beide Seiten belegen denselben Pfad, und zwei Seiten auf einem Pfad wären ein
Zufallsergebnis.

## 3. Wo die Autorität liegt

Die Grenze wird **zweimal genannt und einmal durchgesetzt**:

- **Anzeige:** `pukalani.tenancy.products.customDomain: 'pro'` in
  `apps/platform/app/app.config.ts` — blendet nichts aus, sondern entscheidet,
  ob die Seite den Sperr-Hinweis oder das Formular zeigt.
- **Autorität:** `CUSTOM_DOMAIN_MIN_PLAN` in
  `packages/control/shared/customDomain.ts`. Das Control Plane besitzt die
  `communities`-Zeile und liest den Plan aus ihr; abgewiesen wird mit
  `403 plan_required` (`packages/control/server/utils/communityDomainGate.ts`).

Dass beide dieselbe Zahl nennen müssen, ist echte Doppelpflege — deshalb liest
`packages/control/tests/customDomain.test.ts` die `app.config.ts` und vergleicht.

**Seit control-040 entscheidet nicht mehr der Plan allein**, sondern EINE pure
Regel, `customDomainEntitlement(row, now)` in
`packages/control/shared/customDomain.ts` (Davids Entscheidungen vom
2026-11-16), in dieser Reihenfolge:

1. Plan nicht Pro ⇒ `plan_required`.
2. Testphase läuft (`trialEndsAt` in der Zukunft) und kein bezahltes Abo
   (`billingStatus !== 'active'`) ⇒ `trial` — die Testphase setzt den Plan auf
   `pro` und hätte das Merkmal sonst verschenkt.
3. Keine Freigabe des Betreibers (`customDomainApproved !== true`) ⇒
   `approval_required` — Übergang bis zum Vorhaben „Pukalani-Konto".

Die Tür (`communityDomainGate.ts`) antwortet `403` mit `plan_required`,
`trial_not_included` bzw. `approval_required`; `state` und `remove` laufen ohne
diese Prüfung. Die Seite liest den Grund aus `entitlement` in der Antwort von
`state` (Rückfall für ältere Antworten: `planAllows`). Die FREIGABE gehört der
Community, nicht der Domain: der Betreiber schaltet sie in der
Communities-Liste (`POST /api/control/tenants/[id]/custom-domain`, Protokoll
`community.custom_domain_approved` / `…_approval_revoked`); ein Entzug schaltet
eine aktive Domain sofort ab, ohne Frist. Bestand übernimmt einmal
`packages/control/scripts/backfill-custom-domain-approval.mjs`.

**Der Reiter bleibt in jedem Plan sichtbar** (kein Plan-Gate am Tab): ein
Menüpunkt, der bei Basic verschwindet, verkauft nichts und erklärt nichts.
Verwalten darf ihn nur der Owner (`community.domain`).

## 4. Die Zustandskette

`none → pending_dns → pending_cert → pending_platform → active` (plus `error`
und, seit control-040, `paused`), definiert in
`packages/control/shared/customDomain.ts`, fail-closed auf `none`.

**`paused` = abgeschaltet.** Domain, Token, ploi-Tenant und Zertifikat
bleiben; die Domain ist nicht kanonisch. Der Resolver
(`tenantsResolver.ts`) löst ihren Host trotzdem auf, mit der Pukalani-Adresse
als kanonisch und `canonicalRedirect: 'temporary'` — `00.tenant.ts` leitet
deshalb **vorübergehend** um (302/307 mit `no-store`, nicht 301/308: die
Domain kann wieder eingeschaltet werden). Alle anderen nicht-aktiven Stufen
bleiben 404. Dorthin kommt eine Domain auf zwei Wegen: durch den Entzug der
Freigabe (sofort) und — mit dem Fristen-Lauf — 14 Tage nach dem Ende von
Testphase oder Abo (`CUSTOM_DOMAIN_GRACE_DAYS`, Ende der Frist in
`customDomainGraceEndsAt`). Den Stempel setzt und das Abschalten erledigt
der stündliche Lauf `custom-domain-sweep` der Betreiber-App
(`packages/control/server/utils/customDomainSweep.ts`, Schalter
`pukalani.control.customDomainSweep`: `dry-run` zählt nur, `apply`
schreibt); die zwei Hinweise (erster Tag, drei Tage vorher) schreibt und
verschickt der Lauf `custom-domain-notice` der Platform-App, je Hinweis genau
einmal (feste Kennung der Glocken-Zeile). Handgriffe des Betreibers:
`docs/runbooks/EIGENE-DOMAIN-FREIGABE.md`.
Gelöscht wird dabei nichts. **Wieder einschalten** ist derselbe
„Prüfen"-Klick (die Tür prüft die Berechtigung): die Kette läuft normal bis
`activate`, das Frist und Abschalt-Stempel räumt; hält sie vorher an, bleibt
die Domain `paused` mit Grund.

**Fünf Spalten** (control-040, alle optional): `customDomainApproved`
(nur `true` zählt), `customDomainApprovedAt`, `customDomainClaimedAt`
(Eintragsdatum, setzt `set`), `customDomainGraceEndsAt`, `customDomainPausedAt`.
`remove` räumt die drei Datumsspalten, nicht die Freigabe.

Vorangetrieben (Richtung `active`) wird sie **ausschließlich durch den
„Prüfen"-Klick** (`advanceCustomDomain` in
`packages/control/server/utils/customDomainService.ts`). Für diesen Weg gibt es
bewusst **keinen Hintergrund-Job und keine Benachrichtigung**: ein Kunde, der
wartet, drückt noch einmal. (Der Fristen-Lauf aus control-040 bewegt nur in
die Gegenrichtung — Frist, Abschalten, verfallene Einträge.)

Drei Messungen in dieser Reihenfolge:

1. **DNS** — TXT-Nachweis + A/CNAME. Aufgelöst über einen **eigenen** Resolver
   gegen `1.1.1.1`/`8.8.8.8` (`customDomainDns.ts`), nicht über den des
   Betriebssystems: dessen Negativ-Cache ließe einen frischen Eintrag fehlen.
   A **oder** CNAME genügt.
2. **ploi** — Tenants anlegen, Zertifikat je zeigender Form bestellen.
3. **Origin-Probe** — `GET https://<domain>/api/health`. **Jede** HTTP-Antwort
   zählt als Beweis, dass TLS getragen hat.

### Zwei Sicherungen, die man nicht entfernen darf

- **Erfolg wird an der schlüssellosen Origin-Probe gemessen, nicht an der
  Appwrite-Projects-API** (F54, 2026-08-08). Die Produktions-Keys haben deren
  Scope nicht — der letzte Schritt scheiterte in Produktion **immer** und lief
  lokal mit einem Dev-Key durch. Eingetragen wird weiterhin versucht; gemessen
  wird die Probe (`401` = Origin akzeptiert, `403` = unbekannt).
- **`certificateOrderDecision`** (`packages/control/server/utils/ploi.ts`, F52)
  liest vor jeder Bestellung die ploi-Liste: deckt ein Eintrag den Namen und
  ist er nicht `active`, wird **nicht** nachbestellt. Grund ist eine harte
  Grenze bei Let's Encrypt — fünf gleiche Zertifikate je Woche; der sechste
  Klick während der Ausstellung sperrt den Kunden sieben Tage aus. Ist die
  Liste unlesbar, wird bewusst **fail-open** bestellt.

### Wem gehört die Domain? (seit control-040)

Ein bloßer Eintrag blockiert niemanden mehr: eine fremde **Community**-Zeile
zählt als „vergeben" nur mit Nachweis (`customDomainHasProof`: `pending_cert`,
`pending_platform`, `active`, `paused` —
`packages/control/server/utils/customDomainOwnership.ts`). Ein Eintrag ohne
Nachweis (`pending_dns`/`error`) verfällt nach `CUSTOM_DOMAIN_CLAIM_DAYS` (14)
ab `customDomainClaimedAt` (`customDomainClaimExpired`; ein fehlendes Datum
verfällt nicht). Weil damit zwei Communities dieselbe Domain unbewiesen halten
können, fragt `advanceCustomDomain` im Moment des eigenen Nachweises noch
einmal, VOR jeder Bestellung bei ploi: der erste Nachweis gewinnt, der zweite
bleibt `pending_dns` und bekommt `409 domain_taken`. **Silo-Zeilen**
(`websites`) zählen weiter in jedem Zustand, und für Silo-Aufrufer zählt auch
jede Community-Zeile — der Silo-Weg fragt beim Nachweis nicht noch einmal.

## 5. Welche Form gewinnt

Die **eingetragene** Form ist kanonisch, die Geschwisterform wird automatisch
mit eingerichtet und leitet auf sie um (`customDomainForms`). Die Umleitung
selbst ist pur: `canonicalRedirectTarget` in `packages/core/shared/canonicalHost.ts`,
verdrahtet in `packages/core/server/middleware/00.tenant.ts`.

Drei Feinheiten mit Grund:

- **301 für GET/HEAD, 308 sonst.** Ein 301 erlaubt Browsern, ein POST zu einem
  GET zu degradieren — der Rumpf wäre still weg. Für eine abgeschaltete Domain
  (`paused`) dieselbe Unterscheidung vorübergehend: 302/307.
- **`Cache-Control: no-store`** an der Umleitung, damit ein späteres Abgeben der
  Domain nicht an einem gemerkten 301 hängen bleibt. Vollständig verhindern
  lässt sich das nicht.
- **Kein www-Paar ohne Public-Suffix-Liste.** `beispiel.co.uk` sieht aus wie
  eine Unterdomain; geraten wird nicht. Der Weg ist, die **www-Form**
  einzutragen — dann kommt der Apex als Geschwister dazu.

## 6. Bekannte Grenzen

- ~~Der Konto-WebSocket fällt auf einer Kundendomain auf den 30-Sekunden-Poll
  zurück.~~ Seit RT2 (2026-11-08) entfallen: der `account`-Channel läuft wie
  Row-Streams, Presence und Live-Theme über den JWT-Socket, die Sofort-
  Abmeldung funktioniert damit auf jeder Domain.
- **Das Sitzungs-Cookie hängt am Host.** Nach der Umstellung meldet man sich
  auf der neuen Adresse neu an; ein Cookie auf eine fremde Domain mitzunehmen
  gibt es nicht und soll es nicht geben. Der Cookie-WERT dagegen gilt für das
  ganze Konto — Appwrite kennt keine Sitzung je Host (SEC-022).
- **Entfernen über die Betreiber-Konsole lässt die Appwrite-Web-Platforms der
  Site stehen** — das Control Plane hat in jenem Projekt keinen Schlüssel.
  Über die Seite der Site selbst wird aufgeräumt.
