# Label-Abgleich (SEC-024)

Stündlicher Lauf der Platform-App, der einem Konto das Lese-Publikum einer
Community wegnimmt, wenn seine Mitgliedschaft dort entzogen ist und das Label
trotzdem noch am Konto hängt.

Code: `packages/onboarding/server/utils/labelReconcile.ts` (Logik),
`packages/control/server/utils/labelReconcileReader.ts` (Leser),
`apps/platform/server/plugins/label-reconcile.ts` (Verdrahtung, Takt).
Regel: `.claude/rules/tenant-mitglieder.md`, Absatz SITE-LABEL.

## Was der Lauf tut

- Liest alle `community_members`-Zeilen mit `status='removed'` des
  Pool-Projekts (seitenweise, höchstens 1000 je Lauf).
- Liest je Konto einmal die Labels.
- Trägt das Konto das Community-Label (`<communityId>`) oder das
  Moderations-Label (`mod<communityId>`) dieser Community, fragt er frisch
  nach, ob es für dieses Paar eine Zeile MIT Zugang gibt. Gibt es keine, ist
  das eine Abweichung.
- Im Modus `apply` entzieht er die Abweichung über den einen Schreiber für
  Konto-Labels (nachgeprüft, einmal wiederholt) und nimmt das Handle-Publikum
  dieser Community mit.

Seit SI1 b (2026-11-17) zwei weitere Fälle:

- **Stillgelegt, Umstellung gescheitert.** Beim Stilllegen einer Community
  setzt das Control Plane alle Mitgliedschaften auf `removed`. Scheitert das
  für eine Zeile, bleibt sie `active`, der Host antwortet 404, und beim Besuch
  heilt nichts. Der Lauf liest solche Zeilen (höchstens 1000 je Lauf) und
  behandelt sie wie entfernte: beide Labels weg. Die Zugangs-Frage davor
  prüft auch, ob die Community noch stillgelegt ist; ist sie wieder an, bleibt
  das Label. Die Zeile selbst bleibt `active` — die Platform-App liest das
  Control Plane nur. **Woran man sie erkennt:** `disabledCandidates` im Log.
  Die Zahl bleibt über 0, bis die Zeilen im Control Plane auf `removed`
  stehen. Dafür gibt es seit dem 2026-11-22 einen ZWEITEN Lauf in der
  Betreiber-App (siehe unten, „Der zweite Lauf"); er zählt heute nur. `disabledStale` sagt nur, ob in diesem Lauf noch ein Label
  hing — nach dem ersten Entzug steht es auf 0, obwohl die Zeile unverändert
  ist (bis 2026-11-18 nannte dieses Runbook die falsche der zwei Zahlen).
- **Herabgestuft.** Wird ein Mitglied aus dem Moderations-Team zu einer Rolle
  ohne Moderation herabgestuft, bleibt seine Zeile `active`, und das
  Moderations-Label fiel bisher erst beim nächsten Besuch. Der Lauf liest die
  `active`-Zeilen mit einer Rolle ohne Moderation, die sich in den letzten
  26 Stunden geändert haben (höchstens 1000 je Lauf, neueste zuerst). Trägt
  das Konto das Moderations-Label dieser Community, liest er die Rolle frisch
  nach und nimmt NUR das Moderations-Label. Das Mitglieds-Label bleibt.
  Welche Rollen moderieren, sagt dieselbe Regel wie beim Besuch
  (`reports.moderate`).

## Was der Lauf nie tut

- Er vergibt nie ein Label.
- Er fasst keine Betreiber-Rollen (`admin`, `moderator`) und keine Labels
  anderer Communities an.
- Er fasst kein Label ohne Zeile an (nur `removed`, `active` in einer
  stillgelegten Community oder herabgestuft). Bestands-Mitglieder aus der
  Zeit vor A5 tragen ein Label ohne Zeile — das ist legitim.
- Er fasst kein Konto an, das inzwischen wieder eingeladen wurde, dessen
  Community wieder eingeschaltet ist oder das wieder moderiert.
- Er ändert keine Zeile im Control Plane.
- Nach einer Herabstufung nimmt er nie das Mitglieds-Label.

## Bekannte Grenzen

- Eine Herabstufung, die älter als 26 Stunden ist und in der Zeit keinen
  einzigen Lauf sah (Platform-App so lange aus), findet der Lauf nicht. Dann
  heilt weiter der nächste Besuch der Person.
- Die zwei neuen Listen haben keinen Lesezeiger. Greift ihr Deckel, sieht der
  Lauf dieselben ersten 1000 wieder; die Log-Zeile sagt es.
- Der Lesezeiger der `removed`-Zeilen lebt nur im Prozess.

## Schalter

`pukalani.community.labelReconcile` in der `app.config.ts` der App:

| Wert | Wirkung |
| --- | --- |
| `off` | kein Takt (Core-Default) |
| `dry-run` | zählt und loggt nur, schreibt nie |
| `apply` | entzieht |

Ein ungültiger Wert gilt als `off` und schreibt die Fehlerzeile
`community_label.reconcile_invalid_mode`. Die Platform-App steht seit dem
2026-11-14 auf `apply` (Davids Freigabe nach dem ersten Probelauf auf
Production: 0 Kandidaten); davor lief sie einen Tag auf `dry-run`. Umstellen
ist eine Code-Änderung in `apps/platform/app/app.config.ts` mit Deploy.

## Probelauf

- [ ] Schalter steht auf `dry-run` (oder Ops-Route mit `dryRun: true`, siehe unten).
- [ ] Nach dem Deploy rund drei Minuten warten (der erste Lauf startet versetzt
      nach dem Boot), danach stündlich.
- [ ] Im pm2-Log der Platform-App die Zeile `community_label.reconcile` lesen.

## Das Ergebnis im Log lesen

Eine Zusammenfassung je Lauf, nur Anzahlen:

| Feld | Bedeutung |
| --- | --- |
| `mode` | `dry-run` oder `apply` |
| `candidates` | gelesene `removed`-Zeilen |
| `stale` | davon mit hängendem Label und ohne Zugang |
| `revoked` | davon entzogen (nur `apply`) |
| `failed` | Konto nicht lesbar, Rückfrage oder Entzug gescheitert |
| `skipped` | Konto gelöscht, wieder eingeladen, oder Kennung ist kein Label |
| `truncated` | ein Deckel hat gegriffen (siehe Log-Zeile) |
| `disabledCandidates` | gelesene `active`-Zeilen in stillgelegten Communities — über 0 heißt: Zeilen von Hand auf `removed` stellen |
| `disabledStale` | davon in diesem Lauf noch mit hängendem Label (in `stale` mitgezählt); fällt nach dem Entzug auf 0 |
| `demotedCandidates` | gelesene geänderte Zeilen mit Rolle ohne Moderation (26 h) |
| `demotedStale` | davon mit hängendem Moderations-Label (in `stale` mitgezählt) |

Ohne Abweichung ist die Zeile `info`, sonst `warn`. Im Modus `apply` steht je
Entzug eine Zeile `community_label.reconcile_revoked` mit `userId` und
`communityId` (bei den neuen Fällen dazu `case: disabled` oder
`case: demoted`). Greift ein Deckel, steht zusätzlich
`community_label.reconcile_truncated` im Log (bei den neuen Listen mit
`list`). Scheitert das Lesen einer neuen Liste, steht
`community_label.reconcile_read_failed` mit `list` im Log, `failed` zählt eins
hoch, und der Rest läuft weiter.

`stale` > 0 im Probelauf heißt: so viele Entzüge würde `apply` machen. Ein
zweiter Lauf nach `apply` sollte `stale: 0` zeigen.

## Ops-Route

`POST /api/community/members/run-label-reconcile` auf einem Community-Host
der Platform-App, angemeldet mit Betreiber-Recht `system.manage`.

- Body `{ "dryRun": true }` (Standard): Probelauf, geht in jedem Modus.
- Body `{ "dryRun": false }`: schreibt nur, wenn der Schalter auf `apply`
  steht; sonst 409 mit `reason: label_reconcile_not_apply`.
- 503: die Control-Env (`NUXT_PLATFORM_CONTROL_*`) fehlt.
- 429: mehr als sechs Aufrufe je Minute (Bremse `community:label-reconcile`).
- Antwort: dieselben Anzahlen wie im Log.

Lokaler Beweis: Abschnitt 10 c in
`packages/onboarding/scripts/verify-site-authz.mjs`.

## Der zweite Lauf (Betreiber-App, SI1 b)

Zeit-Lauf `disabled-member-sweep` in `apps/control`
(`packages/control/server/utils/disabledMembershipSweep.ts`, stündlich, im
Takt der Testphasen-Läufe). Er liest die stillgelegten Communities und deren
`active`-Zeilen. Schalter `pukalani.control.disabledMembershipSweep`:

| Wert | Wirkung |
| --- | --- |
| `off` | meldet sich nicht an (dann die Zeile in `ops/timed-jobs.conf` löschen) |
| `dry-run` | **Vorgabe, so läuft er live:** zählt und schreibt eine Zeile, ändert nichts |
| `apply` | stellt jede Zeile auf `removed` (mit `removedAt`), nach frischem Lesen von Zeile und Community |

Log-Zeile `community_members.disabled_sweep_dry_run` (bzw. `…_applied`):
`disabledCommunities`, `affectedCommunities`, `activeRows`, `removed`,
`skipped`, `failed`, `truncated`; `warn`, sobald `activeRows` über 0 ist.

**Scharf schalten** (nur mit Davids Ja zur gezählten Zahl): in
`apps/control/app/app.config.ts` unter `control` die Zeile
`disabledMembershipSweep: 'apply'`, ausliefern, im nächsten Takt
`…_applied` mit `removed` = gezählter Zahl lesen; danach fällt
`disabledCandidates` des ersten Laufs auf 0. **Zurück:** Zeile entfernen
(dann zählt er wieder nur). Eine umgestellte Zeile kommt nur über eine neue
Einladung zurück — dieselbe Semantik wie das Stilllegen.

## Rückweg

Schalter auf `off` und deployen. Der Lauf hat keinen Zustand außer einem
Lese-Cursor im Prozess; es gibt nichts aufzuräumen. Entzogene Labels kommen
über die normale Mitgliedschaft zurück (neue Einladung).
