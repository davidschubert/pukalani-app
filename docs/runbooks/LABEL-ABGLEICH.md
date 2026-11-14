# Label-Abgleich (SEC-024)

Stündlicher Lauf der Platform-App, der einem Konto das Lese-Publikum einer
Community wegnimmt, wenn seine Mitgliedschaft dort entzogen ist und das Label
trotzdem noch am Konto hängt.

Code: `packages/onboarding/server/utils/labelReconcile.ts` (Logik),
`packages/control/server/utils/labelReconcileReader.ts` (Leser),
`apps/platform/server/plugins/label-reconcile.ts` (Verdrahtung, Takt).
Regel: `.claude/rules/tenant-isolation.md`, Absatz SITE-LABEL.

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

## Was der Lauf nie tut

- Er vergibt nie ein Label.
- Er fasst keine Betreiber-Rollen (`admin`, `moderator`) und keine Labels
  anderer Communities an.
- Er fasst kein Label ohne `removed`-Zeile an. Bestands-Mitglieder aus der
  Zeit vor A5 tragen ein Label ohne Zeile — das ist legitim.
- Er fasst kein Konto an, das inzwischen wieder eingeladen wurde.

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
| `truncated` | Deckel gegriffen — der nächste Lauf macht dahinter weiter |

Ohne Abweichung ist die Zeile `info`, sonst `warn`. Im Modus `apply` steht je
Entzug eine Zeile `community_label.reconcile_revoked` mit `userId` und
`communityId`. Greift der Deckel, steht zusätzlich
`community_label.reconcile_truncated` im Log.

`stale` > 0 im Probelauf heißt: so viele Entzüge würde `apply` machen. Ein
zweiter Lauf nach `apply` sollte `stale: 0` zeigen.

## Ops-Route

`POST /api/community/members/run-label-reconcile` auf einem Community-Host
der Platform-App, angemeldet mit Betreiber-Recht `system.manage`.

- Body `{ "dryRun": true }` (Standard): Probelauf, geht in jedem Modus.
- Body `{ "dryRun": false }`: schreibt nur, wenn der Schalter auf `apply`
  steht; sonst 409 mit `reason: label_reconcile_not_apply`.
- 503: die Control-Env (`NUXT_PLATFORM_CONTROL_*`) fehlt.
- Antwort: dieselben Anzahlen wie im Log.

Lokaler Beweis: Abschnitt 10 c in
`packages/onboarding/scripts/verify-site-authz.mjs`.

## Rückweg

Schalter auf `off` und deployen. Der Lauf hat keinen Zustand außer einem
Lese-Cursor im Prozess; es gibt nichts aufzuräumen. Entzogene Labels kommen
über die normale Mitgliedschaft zurück (neue Einladung).
