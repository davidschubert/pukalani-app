# Auth-Formulare — UAuthForm als Vorlage, eigene Implementierung

Stand: 2026-07-02. Entscheidung aus dem Gesamtcheck-Follow-up: Die Auth-
Formulare **orientieren sich an `UAuthForm`** (Nuxt UI 4: Card-Layout, Titel/
Icon, Provider-Buttons, OR-Separator, Footer-Links), sind aber bewusst **eigene
`UForm`-Implementierungen**. Der Grund: die gemeinsam optimierten Flows gehen
über das hinaus, was `UAuthForm` als geschlossene Komponente abbildet — ein
Rück-Refactor würde Funktionalität kosten, ohne etwas zu gewinnen.

## Warum nicht (mehr) UAuthForm?

`UAuthForm` bündelt Felder + Submit in einer Prop-getriebenen API. Unsere
Formulare brauchen Kontrolle über Dinge, die dort nicht (oder nur über
Workarounds) vorgesehen sind:

| Erweiterung | Wo | Was UAuthForm nicht bietet |
|---|---|---|
| Zwei-Schritt-OTP-Flow (E-Mail → 6-stelliger Code) mit eigenem Step-State | `OtpLoginForm` | Schritt-Wechsel innerhalb EINER Komponente inkl. Zurück |
| Security-Phrase (Phishing-Schutz: Phrase aus Mail wird in der UI angezeigt) | `OtpLoginForm` | Kein Slot an der passenden Stelle im Code-Schritt |
| Resend mit 30s-Cooldown-Countdown | `OtpLoginForm` | Kein Resend-Konzept |
| Register-Variante per Prop (`register`): Name-Feld + AGB-Pflicht im selben Flow | `OtpLoginForm` | Feld-Zusammensetzung ist statisch |
| Flow-übergreifend geteilte Eingaben (`useState('pukalani-auth-email'/'-name')`) — E-Mail/Name überleben den Wechsel Login ⇄ Registrieren ⇄ OTP | alle drei | Kein geteilter State zwischen Instanzen |
| AGB-Checkbox config-gated (`pukalani.auth.termsUrl`), UI-only-Felder (terms, passwordConfirm) vor dem Submit gestrippt | `RegisterForm`, `OtpLoginForm` | Bedingte Felder + Payload-Trennung |
| Live-Passwortstärke (`AuthPasswordStrengthMeter`) unter dem Passwortfeld | `RegisterForm` | Kein Feld-Suffix-Slot pro Feld |
| E-Mail-Policy-UX (Appwrite 422 → freundliche i18n-Meldung) + generisches Fehler-Mapping ohne Appwrite-Leaks | alle drei | Fehlerbehandlung liegt beim Aufrufer, aber Feld-nahe Darstellung braucht Zugriff auf die Feld-Slots |
| `:validate-on="[]"` (Validierung erst beim Submit, nicht beim Tippen) | alle drei | Prop existiert, aber zusammen mit obigen Punkten irrelevant |

**Übernommen aus der UAuthForm-Vorlage** (und beibehalten):
Provider-Buttons config-gated aus `pukalani.auth.providers` mit
`USeparator :label="or"` (LoginForm), Card-artiges zentriertes Layout im
auth-Layout, Titel/Untertitel/Footer-Link-Struktur, Zod-Schema-Validierung
(`createLoginSchema(t)` u. a. als Factories mit i18n-Meldungen).

## Zustimmung: der Server prüft sie (SEC-008, seit 2026-11-16)

Die Häkchen „AGB" (`pukalani.auth.termsUrl`) und „Unternehmer"
(`pukalani.auth.businessOnly`) sind keine reine Formularvalidierung mehr:

- `RegisterForm` schickt `terms`/`business` mit; `signup.post.ts` lehnt ohne
  sie mit 400 `terms_required` bzw. `business_required` ab, bevor ein Konto
  entsteht.
- `OtpLoginForm` schickt sie im register-Modus an `otp/verify`; ohne sie
  gelingt die Anmeldung, es entsteht nur kein Nachweis.
- Der Google-Knopf (`AuthOauthButtons :consent-kinds`) legt die gesetzten
  Häkchen beim Klick als Merkzeichen `pk_consent` (10 min) ab; die Rückkehr
  vom Anbieter hält sie fest.
- Wem eine Zustimmung fehlt, der sieht einmal je Besuch die Nachfrage
  `CoreConsentPrompt` (Texte `auth.consent.*`) und kann bis dahin lesen, aber
  nicht schreiben. Nachweis und Tür: `.claude/rules/appwrite.md`, Abschnitt
  ZUSTIMMUNG.

## Namen, Ausfüllen, Ansagen (Q08, seit 2026-11-21)

- **Jedes Feld nennt `autocomplete`.** `UInput` setzt sonst `off`. Login:
  E-Mail `username`, Passwort `current-password`; neues Passwort überall
  `new-password`; Name `name`; E-Mail sonst `email`; Codes `one-time-code`.
- **Der Fehlerkasten trägt `role="alert"`** (`UAlert` hat von sich aus keine
  Rolle), jedes `UForm` hängt `@error="focusFirstFormError"` an
  (`app/utils/formFocus.ts`): der Fokus geht ins erste fehlerhafte Feld.
- **Nichts Anklickbares in `#hint`** eines `UFormField`: der Platz liegt im
  Quelltext vor dem Feld und stiehlt den Tab-Schritt.
- Wächter: `apps/comments/e2e/auth-forms.spec.ts`. Ein neues Feld auf einer
  Anmelde-Seite braucht dort eine Zeile.

## Regel (ersetzt „UAuthForm für Auth!")

- **Neue, simple Auth-Ansichten**: erst prüfen, ob `UAuthForm` reicht — wenn
  ja, nutzen (weniger Code, konsistente Optik).
- **Bestehende Formulare** (`LoginForm`, `RegisterForm`, `OtpLoginForm`):
  bleiben eigene `UForm`-Implementierungen. Bei Änderungen die UAuthForm-
  Optik als Referenz nehmen (Spacing, Separator, Button-Hierarchie), damit
  beide Welten visuell deckungsgleich bleiben.
- Gemeinsame Bausteine (Provider-Buttons, Strength-Meter, geteilter
  E-Mail-State) leben als eigene Komponenten/Composables im Core und werden
  NICHT pro Formular dupliziert.
