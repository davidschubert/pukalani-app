# UX- und Struktur-Review: die Reise von der Landing zur ersten Community

**Datum:** 2026-08-10 · **Stand:** `main` @ `f475db0e` · **Art:** konzeptioneller
UX-Review, nur gelesen, nichts geändert.

**Gegenstand:** `apps/marketing` → `packages/core` (Auth) → `packages/onboarding`
(Wizard, my./start.) → erste Minuten in der neuen Community
(`apps/platform`, `packages/admin`).

**Nicht Gegenstand:** Sicherheit, Bugs, Performance. Alle Sicherheits-Narben
(Handoff-Siegel, `?host=`-Übernahme, Präfix-Segmentgrenze) sind sichtbar
gepflegt und werden hier nur erwähnt, wo sie das Erlebnis formen.

**Belege:** jede Behauptung mit Datei:Zeile. Wo Laufzeitverhalten nur mit
Session sichtbar wäre, steht das ausdrücklich dort.

---

## 1 · Reise-Karte

| # | Schritt | Was tatsächlich passiert | Bewertung |
|---|---|---|---|
| 0 | **Landing** `www.pukalani.app` | H1 „Deine Community. Deine Kurse. Deine Regeln." (`apps/marketing/i18n/locales/de.json:54`). Sub nennt „Beiträge, Kurse, Events und Kommentare" (`:55`). Trust-Reihe: in Deutschland gehostet, kein Werbe-Tracking, Privacy by Design, Modular (`:59-62`). | Stark, klar, deutsch. **Aber:** 3 der 4 namentlich beworbenen Produkte sind Early Access (`apps/marketing/shared/marketing.ts:182` → `beitraege`, `kurse`, `events`). |
| 1 | **CTA „Kostenlos starten"** | `HeroSection.vue:9` → `useProductLinks().start` → `https://my.pukalani.app/register` (`apps/marketing/nuxt.config.ts:86`). | Ziel richtig. Versprechen („kostenlos", „60 Sekunden", `de.json:89`) hält nicht — siehe K1. |
| 1b | **CTA „Personal holen" / „Pro holen" / „Interesse anmelden"** | `PricingSection.vue:41` und `:68` → `signIn` → `https://my.pukalani.app/**login**` (`nuxt.config.ts:87`). | **Bruch.** Kaufabsicht landet im Login-Formular. |
| 1c | **CTA „Early Access anfragen"** (Produktseiten) | `apps/marketing/app/pages/produkte/[slug].vue:103` → `signIn` → `/login`. | **Bruch.** Die dafür gebaute Seite `/anfragen` wird von der Marketing-Seite **nirgends** verlinkt (Grep über `apps/marketing/app` + i18n: null Treffer). |
| 2 | **Registrierung** `my.pukalani.app/register` | `packages/core/app/pages/register/index.vue`. Pflicht: Name, E-Mail, starkes Passwort, Passwort-Wiederholung (`packages/core/schemas/auth.ts:38-67`). AGB-Checkbox nur wenn `pukalani.auth.termsUrl` gesetzt — in `apps/platform` **nicht** gesetzt. OTP-Alternative sichtbar (`register/index.vue:55-68`). | Sauberes Formular. **Kein Wort über Early Access** — obwohl DECISION-LOG 2026-07-27 Punkt 4 genau das zusagt („Übergang: ehrlicher Hinweis auf der Register-Seite", `docs/DECISION-LOG.md:790-791`). |
| 3 | **Nach Registrierung** | `RegisterForm.vue:42` → `afterAuthTarget()` → ohne `?redirect=` → `localePath('/')` (`useAuthRedirect.ts`). Auf `my.*` leitet `control-center.global.ts:29-36` nach `/communities`. Dort: 0 Communities ⇒ `navigateTo('/start', {replace:true})` (`communities.vue:52-56`). | Mechanik korrekt und durchdacht. |
| 4 | **Die Wand** `/start` | Einladungs-Code-Tor. „Pukalani ist im Early Access — du brauchst einen Einladungs-Code." (`packages/onboarding/i18n/locales/de.json:147`). | **Hier verliert man den Neukunden.** Erste Erwähnung des Codes im gesamten Trichter. Siehe K1/K2. |
| 5 | **Wizard** `/start/community` | 7 Schritte: basics (Name+Adresse+Zweck) · size · category · description · goal · vibe · summary (`packages/onboarding/shared/wizardSteps.ts:9`). Entwurf in sessionStorage, Schritt in der URL, nichts wird vor Schritt 7 angelegt (`start/community.vue:26-33`). | **Handwerklich das Beste am ganzen Trichter.** Adress-Prüfung entprellt, Prüffehler blockiert bewusst nicht (`wizardSteps.ts:50-54`), Beschreibung überspringbar, KI-Vorschlag optional und ehrlich etikettiert (`de.json:228`). |
| 6 | **Anlegen** | `POST /api/onboarding/site` → Control Plane. Plan `pro` für 14 Tage ohne Karte (`packages/control/shared/onboarding.ts:110-112`). Danach `seedHomePage` / `seedLegalPages` / `seedGuidelinesPage` — alle **best effort**, Fehler nur ins Log (`packages/onboarding/server/api/onboarding/site.post.ts:44-96`). | Idempotent über den Hostnamen, Fehlertexte sagen jeweils, was jetzt zu tun ist (`start/community.vue:203-211`). Gut. |
| 7 | **`/start/done`** | Bestätigung, Adresse aus der geprüften Mitgliedschaftsliste, Knopf „Community öffnen" mit 60-s-Handoff-Siegel, Fallback ohne Siegel führt trotzdem hin (`start/done.vue:62-78`). Drei Hinweise: öffentlich · Testphase · Einstellungen. | Solide. Kein Bestätigungs-Mail (Grep über den ganzen Provisioning-Pfad: kein `sendMail`/`notify`). |
| 8 | **Ankunft** `<slug>.pukalani.app/dashboard` | `packages/admin/app/pages/dashboard/index.vue`. Begrüßung „Willkommen **zurück**, {name}" beim allerersten Besuch. Alle Kennzahlen 0. „Nichts zu moderieren 🎉" (`:309`). Letzte Aktivität: `—` (`:334`, ohne i18n-Schlüssel). | **Der zweite große Verlustpunkt.** Kein Willkommensfenster, keine Checkliste, kein nächster Schritt. Der Code weiß es selbst: „Das Willkommensfenster IN der Community … ist eigener Bau — O6" (`start/done.vue:6-10`) — O6 existiert nirgends im Repo. |
| 9 | **Produkte einstellen** | `/dashboard/community/products` ist eine **Liste**, kein Schalter (`products.vue:10-18`, ausführlich begründet). Gesperrte Produkte tragen `CorePlanBadge` („Ab Personal"/„From Personal", `packages/core/i18n/locales/de.json` → `demo.planBadge`) und einen gemeinsamen Knopf „Tarif ansehen" → `/dashboard/community/plan`. | Die Begründung („ein Schalter wäre ein Versprechen, das die Route nicht halten kann") ist richtig. **Aber** der Owner findet die Seite nur, wenn er den Community-Reiter durchklickt — im Menü fehlen gesperrte Produkte spurlos. |
| 10 | **Plan wählen** | `/dashboard/community/plan` zeigt **drei** Karten: `basic`, `personal`, `pro` (`plan.vue:79`). Basic mit 0 € und ohne Kaufknopf (`plan.vue:156`). Status ohne Abo: „Kein Abo – Free Plan". | Widerspricht der Preisseite (dort **kein** Basic, `PricingSection.vue:8-12`) und F49. Siehe G5. |
| 11 | **Kontenbereich** `my.pukalani.app` | 0 Communities ⇒ Wizard · 1..n ⇒ Kartenliste mit Rolle, Plan, Testphasen-/Sperr-Zeile, Sprung per Handoff auf `<host>/dashboard` (`communities.vue:147-216`). | **Sehr gut.** Die Begründung, warum hier Karten statt `UTable` stehen (`communities.vue:19-30`), ist vorbildlich — bewusste Abweichung von Regel B6, dokumentiert. |
| 11b | **`start.pukalani.app`** | `/` geht immer in den Wizard, `?code=` schlägt alles (`packages/core/shared/controlCenter.ts:82-91`). | Richtig und sauber getrennt. |

---

## 2 · Befunde nach Schwere

**Zählung: 3 KRITISCH · 7 GROSS · 9 MITTEL · 7 KLEIN = 26 Befunde.**

---

### KRITISCH — verliert Neukunden

#### K1 · Die Einladungs-Wand steht hinter der Registrierung, nicht davor

**Ort:** `apps/marketing/i18n/locales/de.json:56` („Kostenlos starten") ·
`de.json:89` („In 60 Sekunden deine eigene Community.") ·
`packages/core/app/pages/register/index.vue` (kein Early-Access-Hinweis) ·
`packages/onboarding/i18n/locales/de.json:147` (erste Erwähnung).

**Was stört:** Der Trichter verspricht zweimal ausdrücklich Sofortigkeit
(„Kostenlos starten", „In 60 Sekunden deine eigene Community"), führt durch eine
vollständige Kontoanlage mit starkem Passwort — und teilt dem Nutzer **erst
danach** mit, dass er ohne Einladungs-Code nicht weiterkommt. Er hat zu diesem
Zeitpunkt ein Konto, eine Adresse hinterlassen, ein Passwort erfunden, und steht
vor einem Formularfeld, das er nicht ausfüllen kann.

Das Early-Access-Modell selbst ist Davids Entscheidung und steht nicht zur
Debatte. Was hier fehlt, ist die **Reihenfolge**: die eigene Doktrin des
Projekts steht bereits im Code — „Schritt 0 ist das Early-Access-Tor: der
Einladungs-Code wird HIER geprüft, nicht am Ende. Sieben Schritte auszufüllen
und dann abgewiesen zu werden wäre die schlechteste mögliche erste Erfahrung"
(`packages/onboarding/app/pages/start/index.vue:5-7`). Genau dieses Prinzip ist
eine Ebene höher nicht angewandt: die Registrierung ist der Wizard, und das Tor
steht dahinter. `docs/DECISION-LOG.md:790-791` verlangt sogar explizit den
„ehrlichen Hinweis auf der Register-Seite" — er ist nicht gebaut.

Die Preisseite sagt es im Nebensatz (`de.json:667`: „Aktuell im Early Access mit
Einladung"), aber unterhalb der Kaufknöpfe und weit weg vom Hero-CTA.

**Vorschlag:**
1. Hero-CTA und Header-CTA umbeschriften: „Kostenlos starten" → „Zugang
   anfragen" **oder** einen zweiten, gleichrangigen Weg anbieten
   („Ich habe einen Code" → `start.pukalani.app`).
2. Auf `/register` (Kontroll-Host) einen Hinweis-Block über dem Formular:
   „Pukalani ist im Early Access. Zum **Mitmachen** brauchst du nur ein Konto —
   für eine **eigene Community** einen Einladungs-Code." Dieselbe Unterscheidung
   trifft die FAQ bereits richtig (`de.json:711`).
3. Optional: Code-Feld direkt auf der Register-Seite anbieten, damit der
   Eingeladene ihn nicht erst nach der Anmeldung sieht.

**Aufwand:** S (Texte + ein Hinweis-Block).

---

#### K2 · Die Code-Wand ist eine Sackgasse ohne jeden Ausgang

**Ort:** `packages/onboarding/app/pages/start/index.vue:112-114` ·
`packages/onboarding/i18n/locales/de.json:153` ·
`packages/onboarding/app/layouts/onboarding.vue:14-25`.

**Was stört:** Wer keinen Code hat, liest:

> „Keinen Code? Schreib uns, wofür du Pukalani nutzen willst — wir laden laufend
> neue Communities ein." (`de.json:153`)

Das ist **reiner Text**. Kein Link, keine E-Mail-Adresse, kein Knopf:

```vue
<p class="text-sm text-dimmed">
  {{ t('onboarding.gate.noCode') }}
</p>
```

Die Seite, die genau dafür gebaut wurde, existiert — `/anfragen`
(`packages/onboarding/app/pages/anfragen.vue`) — und verlinkt sogar in die
**Gegenrichtung** („Du hast schon einen Code? Hier einlösen", `anfragen.vue:101-104`).
Der Rückweg fehlt.

Verschärfend: das `onboarding`-Layout hat weder Navigation noch Abmelden. Der
Kommentar sagt „Der einzige Ausgang ist der Fortschritt (oder das Konto-Menü,
sobald es mehrere Communities gibt)" (`onboarding.vue:5-7`) — ein Konto-Menü
gibt es dort aber nicht, nur die E-Mail-Adresse als statischen Text
(`onboarding.vue:22-24`). Und `/communities` würde denselben Nutzer sofort
wieder nach `/start` werfen (0 Communities, `communities.vue:52-56`).

**Ein frisch registrierter Nutzer ohne Code sitzt also in einer Seite fest, aus
der kein Link herausführt.**

**Vorschlag:** `noCode` in einen Link auf `localePath('/anfragen')` verwandeln
(exakt spiegelbildlich zu `anfragen.vue:101-104`). Zusätzlich im
`onboarding`-Layout die E-Mail-Zeile zu einem kleinen Menü mit „Abmelden"
machen.

**Aufwand:** S (zwei Zeilen Template + ein Menü).

---

#### K3 · Jede Kaufabsicht landet im Login-Formular; `/anfragen` ist unverlinkt

**Ort:** `apps/marketing/app/components/PricingSection.vue:41` (Personal/Pro),
`:68` (Enterprise) · `apps/marketing/app/pages/produkte/[slug].vue:103`
(Early Access) · `apps/marketing/nuxt.config.ts:87`
(`marketingSignInUrl: 'https://my.pukalani.app/login'`).

**Was stört:** Fünf der wichtigsten Konversions-Knöpfe der Seite zeigen auf
`/login`:

| Knopf (de/en) | Ziel |
|---|---|
| „Personal holen" / „Get Personal" | `my.pukalani.app/login` |
| „Pro holen" / „Get Pro" | `my.pukalani.app/login` |
| „Interesse anmelden" / „Register interest" (Studio) | `my.pukalani.app/login` |
| „Early Access anfragen" / „Request early access" | `my.pukalani.app/login` |

Ein Besucher ohne Konto sieht ein Passwortfeld. Bei „Interesse anmelden" und
„Early Access anfragen" ist es schlimmer als eine Umleitung: der Nutzer wollte
**etwas hinterlassen**, und bekommt eine Anmeldung. Es gibt auf `/login`
keinerlei Bezug zum Klick, den er gerade getan hat.

`anfragen.vue:5-6` behauptet: „Liegt auf dem Kundenbereich-Host … die
Marketing-Seite verlinkt hierher." Ein Grep über `apps/marketing/app`,
`apps/marketing/i18n` und `nuxt.config.ts` nach `anfragen` / `request-access`
liefert **null Treffer**. Es gibt auch keine `marketingRequestUrl` in der
runtimeConfig (`nuxt.config.ts:83-89` kennt nur `start`, `signIn`, `demo`).

Zusätzlich: `marketing.nav.signIn` („Anmelden"/„Sign in", `de.json:10`/`en.json:10`)
ist definiert, wird aber von **keiner** Komponente gerendert — es gibt auf der
gesamten Marketing-Seite keinen sichtbaren Anmelde-Link für Bestandskunden.

**Vorschlag:**
1. Vierte Runtime-URL `marketingRequestUrl = 'https://my.pukalani.app/anfragen'`
   einführen; „Early Access anfragen" und „Interesse anmelden" dorthin.
2. Preis-Knöpfe auf `start` (`/register`) statt `signIn` — solange Early Access
   gilt, ebenfalls auf `/anfragen`.
3. `marketing.nav.signIn` in Header oder Footer tatsächlich rendern.

**Aufwand:** S.

---

### GROSS

#### G1 · Der Wizard verspricht eine Auswertung, die es nicht gibt

**Ort:** `packages/onboarding/i18n/locales/de.json:199` / `en.json:199` ·
`packages/control/shared/onboarding.ts:257-286` (`parseSiteProfile`) ·
`packages/control/server/utils/onboardingProvision.ts:207`.

**Was stört:** Schritt 5 sagt wörtlich:

> DE: „Wähle das Wichtigste. **Wir nutzen die Antwort, um dir die richtigen
> nächsten Schritte zu zeigen.**"
> EN: „Pick what matters most. We use it to show you the right next steps."

`goal`, `category`, `memberRange` und `purpose` wandern als serialisiertes JSON
in `communities.profile` (`onboardingProvision.ts:207`). Die Lesefunktion
`parseSiteProfile` existiert (`onboarding.ts:257-286`) und wird **nirgends
aufgerufen** — toter Code. Ein Repo-Grep nach `nextSteps` / „nächste Schritte"
liefert nichts. Es gibt keinen Mechanismus, der aus `goal` irgendetwas ableitet.

Damit sind vier der sieben Wizard-Schritte reine Marktforschung, für die der
Nutzer bezahlt (mit Zeit und Aufmerksamkeit) und nichts zurückbekommt. Ähnlich,
aber schwächer: Schritt 3 sagt immerhin ehrlich „Es bestimmt keine Funktionen"
(`de.json:191`).

**Vorschlag:** Entweder (a) die Zusage einlösen — das ist ohnehin der beste
Kandidat für den fehlenden Willkommens-Zustand (G2): eine Checkliste, deren
Reihenfolge aus `goal` kommt („Events veranstalten" ⇒ erst Termin anlegen,
dann einladen). Oder (b) den Satz auf das reduzieren, was stimmt: „Hilft uns zu
verstehen, was du vorhast." Variante (a) macht aus zwei Befunden einen Gewinn.

**Aufwand:** (a) M · (b) S.

---

#### G2 · Die Ankunft im Dashboard ist leer, gratuliert und sagt „willkommen zurück"

**Ort:** `packages/admin/app/pages/dashboard/index.vue:227` (Begrüßung),
`:309` („Nichts zu moderieren 🎉"), `:334` (`—`) ·
`packages/onboarding/app/pages/start/done.vue:6-10` (O6, nie gebaut).

**Was stört:** Der Owner klickt „Community öffnen" und landet auf einem
Dashboard, das

- ihn mit **„Willkommen zurück, {name}"** / „Welcome **back**, {name}" begrüßt —
  beim allerersten Login,
- Kennzahlen mit lauter Nullen zeigt (registrierte Nutzer, Kommentare gesamt,
  inkl. Delta-Pfeilen gegen ein nicht existierendes Gestern),
- ihm für den leeren Moderationsstapel **gratuliert**: „Nichts zu moderieren 🎉",
- unter „Letzte Aktivität" einen nackten Gedankenstrich rendert (`:334`, ohne
  i18n-Schlüssel),
- und ihm **nirgends** sagt, was jetzt zu tun ist.

Das ist der Moment, in dem der Nutzer zum ersten Mal sein Produkt sieht. Er hat
gerade sieben Fragen beantwortet, und die Antwort des Produkts ist ein leeres
Cockpit. Discourse, Circle und Ghost setzen hier alle einen geführten
Startzustand (Checkliste, „first post", Einladen-Karte); der Code weiß, dass er
das auch will — `done.vue:6-10` nennt es „Willkommensfenster … eigener Bau —
O6" —, es wurde nur nie gebaut.

Der Anknüpfungspunkt ist vorhanden: `dashboard/index.vue:233` hat bereits einen
Slot für „Hinweise registrierter Layer (M13)", in dem heute nur
`CommunityTrialNotice` und `CommunitySuspensionNotice` hängen.

**Vorschlag:** Eine `CoreGettingStarted`-Karte, die im Slot lebt und
verschwindet, sobald erledigt. Vier Schritte reichen und decken genau die
Zusagen aus `done.vue`:
1. Startseite ansehen/bearbeiten (existiert bereits, gesät)
2. Erste Mitglieder einladen (`/dashboard/community/members`)
3. Farbwelt prüfen (`/dashboard/community/branding`)
4. Sichtbarkeit entscheiden (`/dashboard/community` — öffentlich/nur Mitglieder)

Reihenfolge aus `goal` (G1). Zusätzlich `admin.overview.greeting` in eine
Erst-/Wiederkehr-Variante spalten.

**Aufwand:** M.

---

#### G3 · Deutsch führt drei Wörter für dieselbe Sache: Plan / Tarif / Abo

**Ort:** siehe Tabelle in Abschnitt 3. Der schärfste Einzelfall:

- Der **Reiter** heißt „**Plan**" (`packages/onboarding/i18n/locales/de.json:312`).
- Der **Knopf, der genau dorthin führt**, heißt „**Tarif** ansehen"
  (`de.json:327`, `de.json:338`).
- Die **Seite selbst** heißt „**Abo** & Rechnung" (`de.json:355`).
- Der **Knopf darauf** heißt „**Plan** wählen" (`de.json:365`).

Englisch ist durchgängig „plan" / „Subscription & billing" — der Bruch ist rein
deutsch. Ein Nutzer, der „Tarif ansehen" klickt, landet auf einem Reiter „Plan"
in einer Seite „Abo & Rechnung". Drei Wörter, ein Ziel, ein Klick.

**Vorschlag:** **„Plan"** als das eine Wort festlegen (es ist bereits der
Reitername und der Code-Begriff, und es ist bei Circle/Ghost/Notion Standard).
„Tarif" überall ersetzen. „Abo" nur dort behalten, wo tatsächlich der
Vertragszustand gemeint ist („Es läuft noch ein Abo", `de.json:36`) — das ist
eine echte, andere Bedeutung.

**Aufwand:** S (reine Textänderung, ~8 Schlüssel).

---

#### G4 · Englisch nennt Produkte „blocks" — die E11-Entscheidung ist halb vollzogen

**Ort:** `apps/marketing/i18n/locales/en.json:111` („One platform, many
**blocks**. You decide which."), `:112` („Every **block** can be switched on or
off."), `:323` („This **block** is built and running"), `:371` (Glossar: „A
**block** that exists but isn't released"), `:99` („Name your **site**") ·
gegenüber `en.json:110` („The **products**") und dem Routennamen `/products/*`.

**Was stört:** CLAUDE.md erklärt E11 (2026-07-30) für abgeschlossen: „EIN Wort:
‚**Produkte**'/`products` — Kundensprache UND Code". Im Deutschen stimmt das
(„Die Produkte", „Produkte wählen"). Im **Englischen** steht direkt daneben
„blocks" — im selben Abschnitt: Kicker „The products", Titel „many blocks", Lead
„Every block". Der englische Besucher lernt zwei Wörter für dieselbe Sache, und
zwar in drei aufeinanderfolgenden Zeilen.

Der Weg dorthin ist erkennbar: „Baustein" war das deutsche Wort vor der
Umbenennung, das Deutsche wurde umgestellt, das Englische nicht — dasselbe
Muster wie „Umbenennung lässt Pfade zurück".

**Vorschlag:** `en.json` durchgängig auf „product(s)" ziehen. Der Abschnitts-
Anker `#bausteine` und der Komponentenname `BlocksSection.vue` dürfen bleiben
(interne Namen), der sichtbare Text nicht.

**Aufwand:** S.

---

#### G5 · Der Plan-Reiter verkauft ein „Free Plan"-Paket, das es seit F49 nicht gibt

**Ort:** `packages/onboarding/app/pages/dashboard/community/plan.vue:79`
(`PLAN_KEYS = ['basic','personal','pro']`) ·
`packages/onboarding/i18n/locales/de.json:362` („Kein Abo – **Free Plan**") ·
`de.json:387-395` (Karte „Basic", „0 €") · gegenüber
`apps/marketing/app/components/PricingSection.vue:8-12`.

**Was stört:** Die Preisseite hat aus gutem Grund keine Basic-Spalte —
`PricingSection.vue:8-12` begründet das ausführlich: „ein ‚für immer kostenlos'
als dritte Preisspalte wäre damit schlicht falsch". Im Produkt steht die dritte
Spalte trotzdem: eine Karte „Basic" mit „0 €" neben Personal und Pro, und der
Statustext heißt „Kein Abo – **Free Plan**".

`plan.vue:38-44` argumentiert, „Free Plan" allein verspräche zu viel und stehe
deshalb neben dem Nur-lesen-Satz. Das ist ein Pflaster: der Nutzer sieht
zuerst eine Preistabelle mit einer 0-€-Spalte. Genau das Missverständnis, das
F49 auf der Preisseite beseitigt hat, wird im Dashboard neu aufgebaut.

**Vorschlag:** Die Basic-**Karte** aus der Preistabelle nehmen (`PLAN_KEYS` auf
`['personal','pro']`) und den Zustand ohne Abo dort erklären, wo er hingehört:
als Status-Zeile über der Tabelle, mit dem bereits vorhandenen
`readOnlyNote`-Text. Beschriftung „Kein Abo – Free Plan" → „Kein Abo — nur zum
Lesen" (die Karte `basic` trägt genau diese Aussage schon als ersten Bullet,
`de.json:392`).

**Aufwand:** S.

---

#### G6 · Die Community entsteht, und niemand schreibt eine Mail

**Ort:** kein `sendMail`/`notify` in
`packages/control/server/utils/onboardingProvision.ts`,
`packages/onboarding/server/api/onboarding/site.post.ts`,
`packages/pages/server/utils/seed*.ts`.

**Was stört:** Der einzige Beleg, dass die Community existiert, ist die Seite
`/start/done` im offenen Tab. Wer sie schließt, hat keine Adresse mehr — den
Hostnamen hat er einmal gesehen und nirgends bestätigt bekommen. Er müsste
raten, dass `my.pukalani.app` sein Kundenbereich ist (das steht nirgends in der
Reise). Zum Vergleich: für Einladungen, Early-Access-Anfragen und
Missbrauchsmeldungen gibt es jeweils eine Mail
(`packages/control/server/utils/communityInviteMail.ts`, `inviteRequests.ts:274`,
`abuseReports.ts`) — ausgerechnet der wichtigste Moment hat keine.

**Vorschlag:** Eine „Deine Community steht"-Mail mit (1) der Adresse, (2) dem
Link ins Dashboard, (3) dem Link auf `my.pukalani.app`, (4) dem Enddatum der
Testphase. Die Infrastruktur (`sendMail`, Locale aus `prefs.emailLocale`) ist da.

**Aufwand:** S.

---

#### G7 · Eine Ratenbegrenzung sagt „Passwort falsch" und lädt zum Wiederholen ein

**Ort:** `packages/core/server/middleware/05.rate-limit.ts:203` (wirft `429`
ohne `data.reason`) · `packages/core/app/components/auth/LoginForm.vue:52`,
`RegisterForm.vue:47-51`, `OtpLoginForm.vue:97-105` (keiner verzweigt auf 429).

**Was stört:** Wer zu oft einen Code anfordert oder sich vertippt, bekommt

> „Anmeldung fehlgeschlagen — bitte E-Mail und Passwort prüfen."
> (`packages/core/i18n/locales/de.json:7`)

bzw. „Code konnte nicht angefordert werden — **bitte erneut versuchen**."
(`de.json:94`). Beide Sätze sind falsch und beide fordern genau die Handlung,
die erneut geblockt wird. Ein Nutzer, der seine Zugangsdaten für falsch hält,
läuft in die Passwort-Zurücksetzen-Schleife.

**Vorschlag:** Ein Zweig `status === 429` mit eigenem Text: „Zu viele Versuche.
Warte eine Minute und versuch es dann noch einmal." — dieselbe Stelle in allen
drei Formularen, oder gebündelt in einem Helfer.

**Aufwand:** S.

---

### MITTEL

#### M1 · Sieben Schritte, davon vier für uns

`packages/onboarding/shared/wizardSteps.ts:9`. Der Nutzer beantwortet Name +
Adresse (braucht das Produkt), Zweck, Größe, Kategorie, Ziel (braucht das
Produkt **nicht**, siehe G1), Beschreibung (wird zur Startseite — echter
Gegenwert), Stimmung (wird zum Theme — echter Gegenwert). Vier von sieben
Schritten liefern dem Nutzer nichts.

Zum Vergleich: Ghost fragt drei Dinge, Circle vier. Der Wizard rechtfertigt die
Länge mit „In 60 Sekunden" (Marketing) — realistisch sind sieben Auswahlseiten
eher zwei Minuten.

**Vorschlag:** `size` + `category` + `goal` zu **einem** Schritt zusammenlegen
(drei Auswahlfelder auf einer Seite) oder hinter „Optional — hilft uns"
sammeln. Verkürzt auf 5 Schritte, ohne ein einziges Datum zu verlieren.
**Aufwand:** M.

#### M2 · `guest`-Middleware verwirft das `?redirect=`-Ziel

`packages/core/app/middleware/guest.ts:4-8` schickt jeden Angemeldeten
bedingungslos nach `/`. Ein bereits angemeldeter Nutzer, der einem Link
`/login?redirect=/join?token=…` folgt (genau das Muster aus der Einladungsmail,
`redirectTarget.ts:4-9`), landet auf der Startseite statt bei seiner Einladung.
`safeRedirectTarget` liegt daneben und wird im Erfolgsfall benutzt.
**Vorschlag:** In `guest.ts` denselben `safeRedirectTarget(route.query.redirect)`
lesen. **Aufwand:** S.

#### M3 · `/verify` verweist auf ein Banner, das dort nicht steht

`packages/core/app/pages/verify.vue` · `packages/core/i18n/locales/de.json`
(`auth.verification.invalidMessage`): „Fordere über **das Banner** einen neuen
Bestätigungslink an." Die Seite hat kein Banner und keinen Resend-Knopf; die
einzige Aktion ist „Zur Startseite". Der Nutzer muss raten, wo das Banner ist.
**Vorschlag:** Auf `/verify` bei `invalid` denselben Resend-Knopf zeigen wie im
Banner. **Aufwand:** S.

#### M4 · Die versprochene Startseite entsteht in genau einer Sprache — oder gar nicht

`packages/onboarding/server/api/onboarding/site.post.ts:51` sät `home` nur für
`site.locale ?? 'de'`; `apps/platform/app/pages/index.vue:19-23` liest sie für
die **aktuelle UI-Locale**. Ein Besucher in der anderen Sprache sieht den
Platzhalter („Diese Community ist gerade im Aufbau", `apps/platform/i18n/locales/de.json`),
obwohl eine Startseite existiert. Zusätzlich ist die Saat best effort: schlägt
sie fehl, erfährt es nur das Log (`site.post.ts:57-63`), und der Owner sieht den
Platzhalter, ohne zu wissen, dass er einen Text geschrieben hat.
**Vorschlag:** Denselben Body in beide Locales säen (die Beschreibung ist
Nutzertext, keine Übersetzung nötig), oder beim Lesen auf die vorhandene Locale
zurückfallen. **Aufwand:** S.

#### M5 · Deutsch/Englisch mischen sich in den URLs des Kundenbereichs

`/start` · `/communities` · `/anfragen` (`anfragen.vue:13`:
`de: '/anfragen', en: '/request-access'`) · `/join` ·
`/dashboard/community/plan` · `/dashboard/settings`.

Die Marketing-Seite lokalisiert ihre Pfade konsequent (`/produkte` ↔
`/products`, `/wechseln` ↔ `/switch`, `nuxt.config.ts:24-76`). Der
Kundenbereich tut es genau **einmal** (`/anfragen`) und lässt alles andere
englisch. Ein deutscher Nutzer sieht also `my.pukalani.app/de/communities` und
`my.pukalani.app/de/anfragen` nebeneinander.
**Vorschlag:** Eine Regel festlegen und aufschreiben — Empfehlung: **Dashboard-
und Kundenbereichs-Pfade bleiben englisch** (sie sind Werkzeug-Oberfläche, kurz,
stabil, und `defineI18nRoute` für jede Dashboard-Seite wäre dauerhafte
Pflegelast), also `/anfragen` → `/request-access` in beiden Sprachen. Nur die
öffentliche Marketing-Seite lokalisiert. **Aufwand:** S (+ 301).

#### M6 · Header und Footer meinen mit „Geschichte" zwei verschiedene Ziele

`apps/marketing/app/components/MarketingHeader.vue:96` → `{path:'/', hash:'#geschichte'}` ·
`MarketingFooter.vue:223` → `localePath('/')`. Gleiches Label, verschiedenes
Ziel; der Footer-Klick sieht aus wie ein toter Link. **Aufwand:** S.

#### M7 · Drei der ersten leeren Zustände bieten keinen nächsten Schritt

`packages/posts/app/pages/dashboard/posts.vue:237` („Keine Beiträge" / „Keine
Beiträge.") · `packages/comments/app/pages/dashboard/comments.vue:548` ·
`packages/posts/app/components/DiscussionTopics.vue:353`. `CoreEmptyState`
kann eine Aktion (`packages/core/app/components/core/EmptyState.vue:17-29`);
diese drei übergeben keine. Bei den Moderationsstapeln ist das vertretbar
(nichts zu tun ist gut), bei „Keine Beiträge" im Beitrags-Dashboard nicht — dort
gehört „Beitrag schreiben" hin, wie es `my-posts.vue:190` bereits vormacht.
Nebenbei: `posts.moderation.empty` ist der Titel noch einmal mit Punkt
(„Keine Beiträge." unter „Keine Beiträge") — eine leere Beschreibung.
**Aufwand:** S.

#### M8 · Marketing sagt „Site", wo es „Community" meint

`apps/marketing/i18n/locales/de.json:99` („Deine **Site** benennen" / en:
„Name your **site**"), `:203`, `:433`, `:558`. Überall sonst heißt dasselbe
Ding „Community" (85 Treffer je Sprache). Und ein **drittes** Wort, „Website",
meint konsequent etwas anderes: die fremde Seite des Kunden, in die man
einbettet (`de.json:217`, `:355`, `:707`). Der Schritt-2-Text im wichtigsten
Erklärabschnitt der Seite benutzt ausgerechnet die Ausnahme.
**Vorschlag:** „Deine Site benennen" → „Deine Community benennen" (4 Stellen).
Das Wort „Website" bleibt der externen Seite vorbehalten. **Aufwand:** S.

#### M9 · Die AGB-Checkbox fehlt genau dort, wo registriert wird

`packages/core/app/components/auth/RegisterForm.vue:15-17` macht die
AGB-Pflicht von `pukalani.auth.termsUrl` abhängig. Gesetzt ist der Wert nur in
`apps/control/app/app.config.ts:14` — **nicht** in `apps/platform`, also nicht
auf `my.pukalani.app`, wo jeder Kunde sich registriert. AGB und Datenschutz
existieren (`/agb`, `/datenschutz` auf der Marketing-Seite, außerdem als
CMS-Seiten je Community). Zusätzlich: der Server prüft die Zustimmung ohnehin
nicht (`packages/core/schemas/auth.ts:38-43` kennt kein `terms`) — das ist
bewusst eine reine UI-Hürde, aber wenn sie fehlt, fehlt sie ganz.
Ebenso dunkel: die OAuth-Provider-Knöpfe sind gebaut
(`LoginForm.vue:21-30`), aber keine App setzt `pukalani.auth.providers`.
**Vorschlag:** `termsUrl` in `apps/platform` setzen, sobald A1 (echte
Rechtstexte) steht — gehört in dieselbe Runde. **Aufwand:** S.

---

### KLEIN

| # | Ort | Was |
|---|---|---|
| S1 | `apps/marketing/i18n/locales/de.json:323` | „**Dieser** Produkt ist gebaut und läuft" — Grammatikfehler, Rückstand aus „Dieser Baustein". Steht auf drei Produktseiten. |
| S2 | `apps/marketing/i18n/locales/de.json:10` / `en.json:10` | `marketing.nav.signIn` („Anmelden"/„Sign in") existiert, wird nirgends gerendert (vgl. K3). |
| S3 | `packages/core/i18n/locales/de.json:72` | `auth.verification.bannerTitle` („Bitte bestätige deine E-Mail-Adresse") wird nie benutzt — `EmailVerifyBanner.vue:52` rendert nur `bannerMessage`. |
| S4 | `packages/admin/app/pages/dashboard/index.vue:309` | „Nichts zu moderieren 🎉" — Emoji in einem Zustand, der für einen Neukunden nichts Erfreuliches bedeutet. |
| S5 | `packages/admin/app/pages/dashboard/index.vue:334` | Leere Aktivitätsliste rendert `—` als Literal, ohne i18n-Schlüssel und ohne `CoreEmptyState`. |
| S6 | `packages/onboarding/i18n/locales/de.json:295` | Schlüssel heißt `done.hints.**private**`, der Text sagt das Gegenteil („Öffentlich gestartet: eure Inhalte sind für alle lesbar"). Rückstand aus der C18-Kehrtwende (`docs/DECISION-LOG.md:322-328`) — nur der Name blieb. |
| S7 | `packages/onboarding/i18n/locales/de.json:318-319` | „Hier gibt es keinen Tarif" — der einzige `noTenant`-Text im Layer, der „Tarif" statt „Plan" sagt (vgl. G3). |
| S8 | `apps/marketing/i18n/locales/de.json:75` vs. `en.json:75` | DE „14 Tage kostenlos testen" (Verb), EN „14-day free trial" (Substantiv) — sonst überall parallel gebaut. Kosmetisch. |

---

## 3 · Naming-Inkonsistenzen

| Begriff | Variante A | Variante B | Variante C | Empfehlung |
|---|---|---|---|---|
| **Preisstufe (DE)** | „Plan" — Reiter `onboarding/de.json:312`, „Plan wählen" `:365`, „Aktueller Plan" `:359` | „Tarif" — „Tarif ansehen" `:327` u. `:338`, „In deinem Tarif enthalten" `:320`, „Nicht in deinem Tarif" `:325`, „Hier gibt es keinen Tarif" `:318` | „Abo" — „Abo & Rechnung" `:355`, „Kein Abo" `:362`, „Es läuft noch ein Abo" `:36` | **„Plan"** für die Stufe. **„Abo"** nur für den Vertragszustand. **„Tarif" streichen.** |
| **Preisstufe (EN)** | „plan" durchgängig (`onboarding/en.json`) | — | „Subscription" nur im Seitentitel `en.json:172` | Bereits konsistent, unverändert lassen. |
| **Produkt (DE)** | „Produkt(e)" — `marketing/de.json:110-112`, `onboarding/de.json:313,317` | „Baustein" nur noch in Code-Kommentaren (`products.vue:29,136` — dort korrekt: UI-Baustein, nicht Produkt) | — | Bereits konsistent. |
| **Produkt (EN)** | „product(s)" — `marketing/en.json:110`, Route `/products/*` | **„block(s)"** — `en.json:111`, `:112`, `:163`, `:323`, `:371`, `:608`, Schritt 3 „Pick your **blocks**" `:105` | — | **„product(s)"** überall. E11 im Englischen nachziehen (G4). |
| **Der Kunden-Raum** | „Community" — dominant, 85× je Sprache in marketing, durchgängig in onboarding | „Site" — `marketing/de.json:99` („Deine Site benennen"), `:203`, `:433`, `:558`; Tab-Id `site-subscription` (`onboarding/app.config.ts:123`) | „Instanz" — `marketing/de.json:692` (Enterprise), `onboarding/de.json:42`, `:358`, `branding.noTenantText` `:466` | **„Community"** in Kundentexten. „Instanz" nur im Enterprise-/Silo-Kontext (dort ist es korrekt und trennscharf). „Site" aus Kundentexten streichen. |
| **Die fremde Seite** | „Website" — `marketing/de.json:217`, `:355`, `:707` | — | — | Korrekt und trennscharf, unverändert lassen. Aber: `docs/archiv/DASHBOARD-IA.md:56` nennt die **Betreiber**-Objekte ebenfalls „Websites" — zwei Bedeutungen, getrennte Zielgruppen, akzeptabel. |
| **Testphase** | DE „14 Tage kostenlos testen" (`marketing/de.json:667`, `:75`), „Testphase" (`onboarding/de.json:137`, `:278`, `:361`) | EN „trial" durchgängig | — | DE: **„Testphase"** als Substantiv auch im Marketing (heute nur im Produkt). |
| **Mitglied** | Personen in der Community (`onboarding/de.json:493` Rolle `viewer` = „Mitglied") | Zugangsstufe für Kurse („für Mitglieder", `marketing/de.json:143`, `:285`, `:538`) | Sichtbarkeit („Nur für Mitglieder", `onboarding/de.json:13`) | Alle drei sind derselbe Begriff in verschiedenen Rollen — vertretbar. Nur die Rolle `viewer` = „Mitglied" ist heikel, weil jeder Beigetretene Mitglied ist; **„Leser/in"** wäre trennschärfer. |
| **Anmelden** | Marketing hat den Schlüssel (`de.json:10`), rendert ihn nicht | Produkt: „Anmelden" | — | Schlüssel rendern (K3). |

---

## 4 · Nahtstellen zum Dashboard

Was ein Dashboard-Review von hier mitnehmen muss:

1. **Der Übergabepunkt ist ein Sprung über eine Host-Grenze.**
   `communities.vue:95-113` und `done.vue:62-78` siegeln beim **Klick** ein
   60-Sekunden-Token und springen auf `<host>/api/auth/site-session`. Scheitert
   es, führt der Link trotzdem hin — dann mit Login. Das Dashboard darf also
   **nie** annehmen, dass ein Ankommender eingeloggt ist.

2. **Das Dashboard ist der erste Ort, an dem der Trichter seine Zusagen
   einlösen müsste** — und tut es an drei Stellen nicht: kein Willkommens-
   Zustand (G2), keine Auswertung von `goal` (G1), keine Bestätigung der
   erzeugten Startseite (M4). Alle drei gehören in denselben Slot
   (`packages/admin/app/pages/dashboard/index.vue:233`, „Hinweise registrierter
   Layer").

3. **Der Community-Reiter ist der einzige Ort, an dem gesperrte Produkte
   überhaupt sichtbar sind.** Im Menü fehlen sie spurlos
   (`packages/core/shared/dashboardNav.ts:180-190`, `planOn`-Filter); eine
   geratene URL endet in einem nackten 404
   (`packages/core/server/utils/tenantPlanProducts.ts:44-57`, bewusst „404 wie
   Datentür"). Die Entscheidung ist begründet und richtig — der **Preis** ist,
   dass ein Personal-Kunde nie erfährt, dass es Kurse gibt, wenn er nicht auf
   `/dashboard/community/products` klickt. Der Dashboard-Review sollte prüfen,
   ob ein einzelner, ruhiger Einstiegspunkt („Was gibt es noch?") fehlt.

4. **Owner-Rechte ≠ Betreiber-Rechte, und das ist an einer Stelle spürbar:**
   Der Owner sieht die Speicher-Karte auf `/dashboard` nicht
   (`dashboard/index.vue:79-83`, `storage.manage` fehlt seiner Site-Rolle),
   aber den Reiter `/dashboard/community/storage` sehr wohl. Zwei Orte,
   ein Thema, verschiedene Sichtbarkeit.

5. **Die Sprache der Pfade wechselt an der Dashboard-Grenze** (M5): davor teils
   deutsch (`/anfragen`), danach durchgehend englisch. Eine Regel gehört
   festgeschrieben, bevor Schritt 4 aus `DASHBOARD-IA.md` neue Seiten anlegt.

6. **`DASHBOARD-IA.md` Schritt 4 ist offen** (`docs/archiv/DASHBOARD-IA.md:160-162`),
   und die Liste „Existiert nirgends" (`:102-105`) enthält mit *Navigation*,
   *SEO* und *Defaults* genau die Dinge, die ein frischer Owner nach dem Wizard
   als Nächstes sucht. Der Willkommens-Zustand (G2) sollte deshalb **nicht** auf
   Seiten verweisen, die es noch nicht gibt — die vier vorgeschlagenen Schritte
   dort sind bewusst alle vorhanden.

7. **Der Community-Switcher** (`packages/onboarding/shared/communitySwitcher.ts`,
   `packages/admin/app/components/DashboardCommunityMenu.vue`) bietet „Communities
   verwalten" → `my.pukalani.app` und schließt den Kreis zurück in den
   Kundenbereich. Das ist die einzige Rückverbindung — sie ist nur im Dashboard
   sichtbar, nicht auf der öffentlichen Seite der Community.

---

## 5 · Was bewusst so ist (nicht anmahnen)

Zur Abgrenzung, damit der Bericht nicht gegen getroffene Entscheidungen liest:

- **Early Access mit Einladungs-Code fürs Gründen** — `docs/DECISION-LOG.md:790`.
  K1/K2 kritisieren nicht das Modell, sondern die Stelle im Ablauf und die
  fehlenden Ausgänge.
- **Kein Basic auf der Preisseite** — F49, `PricingSection.vue:8-12`. G5
  kritisiert, dass das Produkt es *anders* macht als die Preisseite.
- **Wizard vor Zahlung, Testphase ohne Karte** — `docs/DECISION-LOG.md:93-96`,
  ausdrücklich gegen die Variante „Karte zuerst".
- **Produkte-Reiter ohne Schalter** — `products.vue:10-18`, ausführlich und
  überzeugend begründet.
- **404 statt 403 bei fehlendem Plan-Produkt** — `tenantPlanProducts.ts:44-45`,
  dieselbe Doktrin wie die Datentür.
- **Community entsteht öffentlich** — C18, `docs/DECISION-LOG.md:322-328`.
- **Karten statt `UTable` auf `/communities`** — `communities.vue:19-30`, drei
  spezifische Gründe, vorbildlich dokumentierte Abweichung von Regel B6.
- **Eigene `UForm`-Auth-Formulare statt `UAuthForm`** — `docs/referenz/AUTH-FORMS.md`.
- **`onboarding`-Layout ohne Navigation** — `onboarding.vue:4-7`. Richtig für
  den Wizard; K2 betrifft nur den Fall „steckengeblieben ohne Code".

---

## 6 · Die fünf Änderungen mit dem besten Verhältnis Wirkung/Aufwand

| # | Änderung | Wirkung | Aufwand |
|---|---|---|---|
| **1** | **`noCode` verlinken auf `/anfragen`** (`start/index.vue:112-114`) + „Abmelden" ins `onboarding`-Layout. | Beseitigt die einzige echte Sackgasse des Trichters. Jeder Neukunde ohne Code ist heute verloren, danach ist er ein Lead. | **S** — zwei Zeilen Template. |
| **2** | **Early Access ehrlich vor die Registrierung ziehen:** Hinweisblock auf `/register`, Hero-CTA zweigleisig („Zugang anfragen" / „Ich habe einen Code"), Kauf- und EA-Knöpfe von `/login` auf `/register` bzw. `/anfragen` umhängen (`nuxt.config.ts:83-89`, `PricingSection.vue:41,68`, `produkte/[slug].vue:103`). | Löst K1 und K3 gemeinsam. Setzt die eigene Doktrin „nicht erst hinterher abweisen" (`start/index.vue:5-7`) eine Ebene höher um und erfüllt die Zusage aus `DECISION-LOG.md:790`. | **S** — Texte + vier Link-Ziele + ein Config-Wert. |
| **3** | **Willkommens-Karte im Dashboard**, gefüttert aus `goal`, mit vier existierenden Schritten (Startseite · Einladen · Farbwelt · Sichtbarkeit); Begrüßung „Willkommen zurück" nur für Wiederkehrer. | Löst G1 und G2 zusammen und macht aus vier Wizard-Fragen ohne Gegenwert eine eingelöste Zusage. Der Slot dafür existiert bereits (`dashboard/index.vue:233`). | **M** — eine Komponente, keine neue Route, kein Schema. |
| **4** | **Ein Wort je Sache:** DE „Tarif" → „Plan" (8 Schlüssel), EN „block(s)" → „product(s)" (6 Schlüssel), „Deine Site benennen" → „Deine Community benennen" (4 Stellen), „Dieser Produkt" korrigieren. | Der Trichter spricht heute in beiden Sprachen an je einer Stelle zwei Wörter für dasselbe — genau dort, wo der Nutzer die Sprache erst lernt. Vollzieht E11 zu Ende. | **S** — reine Textänderung, kein Code. |
| **5** | **„Deine Community steht"-Mail** nach dem Anlegen: Adresse, Dashboard-Link, `my.pukalani.app`, Ende der Testphase. | Der wichtigste Moment der Reise hinterlässt heute keine Spur außerhalb eines offenen Tabs. Die Infrastruktur ist da, alle anderen Ereignisse haben ihre Mail. | **S** — eine Vorlage, ein `sendMail`. |

Reihenfolge ist Absicht: 1 und 2 halten Nutzer, die heute verloren gehen; 3 hält
die, die drin sind; 4 und 5 sind billig und wirken sofort.
