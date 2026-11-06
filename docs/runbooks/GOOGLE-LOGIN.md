# Runbook: „Anmelden mit Google" einschalten (U14)

**EINGESCHALTET am 2026-08-21** (Google-Projekt „Pukalani",
`silver-area-506109-a4`, Appwrite-Projekt `account`; end-to-end bewiesen —
COMPLETE-Eintrag U14). **AUCH AUF branding.supply seit 2026-09-04** (gleicher
Client, zweite Redirect-URI `…/google/branding`; Secret war weder in Google
noch in Appwrite noch ablesbar ⇒ Davids Kopie bzw. „Add secret"-Weg, s.
Kasten in Schritt 2; ERSTE Speicherung schlug fehl —
in Appwrite versteckt sich das Secret-Feld hinter „Update Client Secret",
ein Update ohne den Klick dorthin speichert ein LEERES Secret und der
Rückweg stirbt mit `client_secret is missing`; end-to-end bewiesen
2026-09-04). Dieses Runbook bleibt das Rezept für WEITERE Projekte
(z. B. Betreiber-Konsole oder branding.supply: derselbe Client, eine weitere
Redirect-URI, die auf die Projekt-Id endet — Details im Kasten von Schritt 2).
Zwei Fallen, die beim Einschalten live gefunden wurden und im Code verdrahtet
sind: SSR-Seiten brauchen `Cache-Control: no-cache` (core-Plugin
`html-no-cache.ts`), und das Session-Cookie MUSS `sameSite: 'lax'` sein —
`strict` wird auf dem extern begonnenen OAuth-Rückweg nicht mitgeschickt und
sieht aus wie „erst nach Reload eingeloggt".

Der CODE ist gebaut und ausgeliefert. Solange die zwei Schalter unten aus
sind, erscheint **kein Knopf** und es ändert sich nichts — das ist Absicht:
der Bau konnte deshalb ohne Credentials live gehen.

Einschalten heißt: einmal Google-Console, einmal Appwrite-Console, einmal
`.env`. Danach steht der Knopf auf der Anmelde- **und** der Registrierseite.

---

## Wie der Flow läuft (in Worten)

```
Klick „Mit Google anmelden"
  → GET /api/auth/oauth?provider=google      (unser Server, Admin-Client)
      · prüft: von der App angeboten UND von der Instanz belegt? sonst 404
      · merkt sich ein evtl. `?redirect=`-Ziel in einem 10-Minuten-Cookie
      · account.createOAuth2Token({ provider, success, failure })
  → accounts.google.com                       (der Nutzer meldet sich an)
  → <Appwrite>/v1/account/sessions/oauth2/callback/google/<projekt>
      · NUR DIESE Adresse kennt Google
      · Appwrite legt beim Erstkontakt das Konto an
  → GET /api/auth/oauth/callback?userId=…&secret=…   (unser Server)
      · account.createSession({ userId, secret })
      · setSessionCookie(...)  → httpOnly a_session_<projekt> auf UNSEREM Host
      · beim Erstkontakt zusätzlich: Registrierungs-Schalter prüfen,
        A5-Beitritt, Feed-Eintrag, Mitglieder-Meilenstein
  → zurück auf das gemerkte Ziel (oder `/`)
```

Ab dem Cookie ist ein Google-Login von einem Passwort-Login nicht mehr zu
unterscheiden — es ist dieselbe `setSessionCookie()` wie in `login.post.ts`.

---

## 1 · Google Cloud Console (einmal für die ganze Plattform)

1. <https://console.cloud.google.com/> → Projekt anlegen oder wählen
   (Name ist intern, z. B. `pukalani`).
2. **APIs & Services → OAuth consent screen**
   - User Type: **External**, dann **Create**
   - App name: `Pukalani` · User support email: deine Adresse
   - **App domain**: `https://pukalani.app` · Privacy policy + Terms of
     service: die echten Seiten eintragen (Google prüft sie bei der
     Veröffentlichung)
   - Authorized domain: `pukalani.app`
   - **Scopes**: nur die Voreinstellung — `email`, `profile`, `openid`.
     Nichts hinzufügen: mehr Rechte hieße ein Google-Review und wäre auch
     inhaltlich falsch (wir holen nur Name und Adresse).
   - **Publishing status**: „In production" veröffentlichen. Im Test-Modus
     lässt Google nur eingetragene Testnutzer durch.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Pukalani Appwrite`
   - **Authorized redirect URIs** — GENAU EINE Zeile, und sie zeigt auf
     **Appwrite**, nicht auf einen unserer App-Hosts:

     ```
     https://api.pukalani.app/v1/account/sessions/oauth2/callback/google/account
     ```

     (`account` ist die Projekt-Id; für die Betreiber-Konsole heisst sie
     **`admin`**, lokal `pool`. NICHT `control` — dieses Projekt ist seit dem
     2026-08-19 gelöscht, eine Redirect-URI darauf schickt den Anmeldeversuch
     ins Leere. Appwrite zeigt die fertige Zeile in Schritt 2 unten selbst an
     — von dort kopieren ist sicherer als tippen.)
   - **Authorized JavaScript origins** bleibt leer (wir starten den Flow
     serverseitig, nicht aus dem Browser).
4. **Client ID** und **Client secret** notieren.

> **Warum nur eine Redirect-URI?** Google sieht in unserer Architektur
> ausschließlich die Appwrite-Adresse. Kunden-Hosts (`kunde-a.pukalani.app`
> oder eine eigene Domain) tauchen hier NIE auf — deshalb muss auch nie ein
> Kunde bei Google eingetragen werden. Das ist der Unterschied zu Circle, wo
> Social-Login auf eigener Kundendomain dauerhaft ausfällt.

---

## 2 · Appwrite Console (je Projekt, das Google anbieten soll)

Für jedes Projekt einzeln: `account` (Kundenbereich + alle Pool-Communities),
`admin` (Betreiber-Konsole), `branding` (branding.supply). Der EINE Google-
Client bedient dabei ALLE Projekte (Korrektur 2026-09-03 — hier stand vorher
„jedes Projekt braucht einen eigenen Client", das ist falsch): ein OAuth-Client
erlaubt mehrere Redirect-URIs, je Projekt kommt also nur eine weitere Zeile in
Schritt 1.3 dazu (die URI trägt die Projekt-Id). ABER: der Consent-Screen
(App-Name „Pukalani") hängt am Google-Cloud-PROJEKT und gilt für alle seine
Clients — eine eigene Marke mit eigenem Namen im Zustimmungsdialog (etwa
„Branding Supply") bräuchte ein eigenes Google-Cloud-Projekt, nicht nur einen
eigenen Client.

1. Console → Projekt wählen → **Auth → Settings**
2. In der Liste **Google** öffnen
3. Schalter auf **an**
4. **App ID** = Google Client ID · **App Secret** = Google Client Secret
5. Die im Dialog angezeigte **Redirect-URI** mit der aus Schritt 1.3
   vergleichen — sie muss zeichengleich sein.
6. Speichern.

### Der Schritt, den man leicht übersieht: Web-Platforms

Appwrite prüft die `success`/`failure`-Adressen gegen die **Web-Platforms** des
Projekts. Steht ein Host dort nicht, antwortet `createOAuth2Token` mit
`Invalid redirect` (gemessen 2026-08-12 gegen die Dev-Instanz).

- **Projekt `account`**: das Wildcard `*.pukalani.app` deckt den Kundenbereich
  und jeden Mandanten-Host automatisch ab — nichts zu tun.
- **Eigene Kunden-Domain**: wird bereits automatisch als Web-Platform angelegt
  (Statusstufe `pending_platform`, eingeführt für Realtime/F45). Social-Login
  erbt das geschenkt. Solange eine Domain dort hängt, ist der Knopf nicht
  kaputt — er führt auf die Anmeldeseite zurück mit „hat nicht geklappt".
- **Lokal**: die Dev-Appwrite kennt nur `localhost`, nicht `localhost:3001` —
  ein vollständiger Durchlauf ist auf dem Rechner deshalb nur mit einer
  passenden Platform zu haben.

---

## 3 · `.env` der Site (der zweite Schalter)

```
NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google
```

Dazu in der `app.config.ts` der App:

```ts
pukalani: { auth: { providers: ['google'] } }
```

**Beides muss stehen.** Die `app.config` sagt „diese App bietet Google an",
die Env sagt „diese Instanz hat die Credentials". Fehlt eines, erscheint kein
Knopf — und genau das verhindert einen toten Knopf auf Dev, CI und
Playground, die dieselbe `app.config` erben.

Danach die Site neu ausrollen (Env-Variablen wirken erst beim Neustart).

---

## 4 · Gegenprobe nach dem Einschalten

1. `/login` und `/register` zeigen den Knopf „Mit Google anmelden", darunter
   die Datenschutz-Zeile.
2. Ein Klick landet bei Google, nicht auf `/login?error=oauth_unavailable`.
3. Nach der Zustimmung: zurück auf der Seite, angemeldet; im Konto-Menü steht
   der Google-Name.
4. Auf einem MANDANTEN-Host: der neue Nutzer steht danach unter
   `/dashboard/members` in der Liste (A5-Beitritt) und im Feed unter „ist der
   Community beigetreten".
5. `?redirect=`-Probe: `/login?redirect=/dashboard` → nach dem Google-Login
   landet man auf `/dashboard`, nicht auf `/`.

### Wenn es nicht klappt

Der Gast sieht immer nur „hat nicht geklappt, nimm E-Mail und Passwort" — der
GRUND steht im Server-Log:

```
{"event":"auth.oauth_start_failed","provider":"google","gap":…,"message":…}
{"event":"auth.oauth_exchange_failed","message":…}
```

- `gap: "method_disabled"` → Provider in der Appwrite-Console nicht an
- `message: "Invalid redirect"` → Host fehlt als Web-Platform (s. o.)
- `redirect_uri_mismatch` (bei Google) → die URI aus Schritt 1.3 stimmt nicht

---

## Was bewusst NICHT gebaut ist

- **Apple.** Davids Entscheidung 2026-08-10: nur Google. Apple verlangt ein
  kostenpflichtiges Developer-Programm und erzwingt „Sign in with Apple"
  überall dort, wo ein anderer Social-Login steht.
- **Konten zusammenführen.** Wer sich erst per Passwort und später per Google
  mit derselben Adresse anmeldet, bekommt von Appwrite dieselbe Identität
  (Appwrite verknüpft über die verifizierte E-Mail). Eine eigene UI dafür
  („verknüpfte Anmeldearten") gibt es nicht.
- **Ein zweiter Weg über einen Kontroll-Host.** War als Antwort auf die
  Circle-Falle angedacht und ist nicht nötig — s. Schritt 1, Kasten.
