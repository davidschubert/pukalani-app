# Abmelde-Links des Newsletters: das eigene Geheimnis

Gilt für `branding.supply` (nur diese App hat den `insights`-Layer und damit
einen Newsletter). Stand: 2026-11-15, Gesamtaudit Paket P25 (SEC-020).

## Worum es geht

Jede Newsletter-Mail trägt einen Abmelde-Link. Der Link enthält die Kennung
der Zeile und eine Signatur; die Signatur beweist, dass der Link von uns
stammt. Bis 2026-11-15 wurde mit dem API-Schlüssel der App signiert. Ein Tausch
dieses Schlüssels machte jeden verschickten Link ungültig, und die Seite
zeigte trotzdem „abgemeldet".

Seit 2026-11-15:

- Signiert wird mit `NUXT_INSIGHTS_NEWSLETTER_SECRET`.
- Geprüft wird gegen drei Schlüssel, in dieser Reihenfolge: das aktuelle
  Geheimnis, das vorherige (`NUXT_INSIGHTS_NEWSLETTER_SECRET_PREVIOUS`) und den
  API-Schlüssel der App. Links aus der Zeit vor dem eigenen Geheimnis gelten
  damit ohne Frist weiter (Davids Entscheidung vom 2026-11-15).
- Fehlt das eigene Geheimnis, signiert die App wie bisher mit dem
  API-Schlüssel. Die Seite läuft also auch ohne den neuen Wert.
- Ein Link, den kein Schlüssel bestätigt, antwortet 400 mit dem Grund
  `unsubscribe_link_invalid`. Die Seite zeigt „Nicht abgemeldet" und nennt den
  Weg: den Link aus der neuesten Mail nehmen oder auf eine Mail antworten.

Die Regel steht in `insightsNewsletterSecrets`
(`packages/insights/server/utils/insightsNewsletter.ts`), mit Tests in
`packages/insights/tests/insightsNewsletter.test.ts`.

## Den Wert setzen (einmalig)

Der Wert ist eine Server-Einstellung und braucht Davids Ja. Er wird auf dem
Server erzeugt und nie ausgegeben.

1. Auf dem App-Server in der `.env` von `branding.supply` nachsehen, dass der
   Name noch nicht vorkommt (nur zählen, keine Werte lesen):
   `grep -c '^NUXT_INSIGHTS_NEWSLETTER_SECRET=' .env` muss `0` ergeben.
2. Den Wert anhängen, ohne ihn anzuzeigen:
   `printf 'NUXT_INSIGHTS_NEWSLETTER_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env`
   Vorher prüfen, dass die Datei mit einem Zeilenumbruch endet.
3. Die Datei strukturell gegenlesen: Namen und Längen der Werte, nie die Werte
   selbst. Kein Name darf doppelt vorkommen (die letzte Zeile gewinnt).
4. Die App neu laden: `pm2 startOrReload <Ecosystem-Datei der App> --update-env`
   und `pm2 save`. Ein `pm2 reload <name> --update-env` liest die `.env` nicht.
5. Prüfen: `/api/health` antwortet `ok: true`, und `pm2 jlist` nennt den Namen
   in der Umgebung des Prozesses (nur Name und Länge ansehen).
6. Erst jetzt den Namen in die Pflichtliste von
   `scripts/ops/verify-site-env.mjs` aufnehmen. Der Wächter läuft täglich; ein
   Eintrag vor dem Setzen öffnet jeden Tag einen Alarm.

## Das Geheimnis wechseln

1. Den bisherigen Wert in `NUXT_INSIGHTS_NEWSLETTER_SECRET_PREVIOUS` umbenennen
   (eine vorhandene `…_PREVIOUS`-Zeile vorher löschen).
2. Einen neuen Wert wie oben anhängen.
3. Neu laden und prüfen wie oben.

Links, die mit dem bisherigen Wert gebaut sind, melden weiter ab. Es gibt nur
EINEN Platz für einen vorherigen Wert: Nach zwei Wechseln sind die Links aus
der Zeit des ersten Werts ungültig. Sie zeigen dann den ehrlichen Hinweis.

## Wenn der API-Schlüssel der App getauscht wird

Links, die noch mit dem API-Schlüssel gebaut sind (vor dem eigenen Geheimnis),
werden damit ungültig und zeigen den Hinweis „Nicht abgemeldet". Bis zum
2026-11-15 gab es keine verschickte Ausgabe, nur einzelne Bestätigungs-Mails.

## Was nicht dazugehört

Die gehashte Leitungs-Kennung der öffentlichen Insights-Routen
(`insightsIpHash`) salzt weiter mit dem API-Schlüssel. Ein Tausch dort beginnt
nur die Zähler des laufenden Tages neu; ein Link geht dabei nicht kaputt.
