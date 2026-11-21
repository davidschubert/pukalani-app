---
paths:
  - "packages/core/server/utils/mailer.ts"
  - "packages/core/shared/mailerSettings.ts"
  - "packages/core/shared/mailFrame.ts"
  - "packages/core/server/utils/mailBrand.ts"
  - "scripts/ops/appwrite-mail*"
  - "scripts/ops/appwrite-mail/**"
  - "packages/core/server/utils/notify.ts"
  - "packages/core/server/utils/notification*.ts"
  - "packages/core/server/utils/emailDigest.ts"
  - "packages/core/server/plugins/email-digest.ts"
  - "packages/core/shared/notification*"
  - "packages/core/server/utils/recipientMailLimit.ts"
  - "packages/core/server/utils/turnstile.ts"
  - "packages/core/shared/turnstile.ts"
  - "packages/events/shared/eventReminderJob.ts"
  - "packages/events/shared/eventReschedule.ts"
  - "packages/events/server/plugins/event-reminders.ts"
  - "packages/insights/server/utils/insightsNewsletter.ts"
  - "packages/insights/server/api/insights/public/newsletter/**"
  - "packages/comments/**"
  - "packages/moderation/**"
  - "packages/messages/server/**"
  - "packages/core/server/utils/microcache.ts"
  - "packages/core/**/pageCache.ts"
  - "packages/core/server/*/*page-cache.ts"
  - "packages/core/server/utils/frameAncestors.ts"
  - "packages/core/server/utils/auditView.ts"
  - "packages/core/server/api/auth/*.post.ts"
  - "packages/core/app/components/auth/TurnstileWidget.vue"
  - "packages/brand/server/api/brand/intro-call.post.ts"
  - "packages/brand/server/api/brand/waitlist.post.ts"
  - "packages/brand/server/utils/brandIntroCall.ts"
  - "packages/brand/server/utils/brandWaitlist.ts"
  - "packages/brand/server/utils/brandInviteMail.ts"
  - "apps/photos/server/api/contact.post.ts"
  - "apps/portfolio/server/api/intro-call.post.ts"
  - "packages/events/server/utils/eventReminders.ts"
  - "packages/events/server/api/events/*.patch.ts"
  - "packages/*/server/api/**/hide.post.ts"
  - "packages/events/server/api/events/*/redact.post.ts"
---

## E-Mail, Benachrichtigungen, Embed, Moderation, Microcache

### E-Mail und Benachrichtigungen
- VERSAND: `sendMail()` (`core/server/utils/mailer.ts`, nodemailer). Zugang:
  zuerst die Ablage `instance_secrets` (Konsole), sonst `NUXT_SMTP_*`
  (`pickMailerSettings`, `core/shared/mailerSettings.ts`); kein Host in beiden
  = Mail aus. Lokal Mailpit `localhost:1025`.
- EIN RAHMEN JE MAIL (Q06, Davids Entscheidung R6): jeder Text für
  `sendMail()` entsteht über `frameMail()` (`core/shared/mailFrame.ts`):
  „Hallo {Name}," / „Hi {Name},", Schluss-Zeile mit der Marke aus
  `resolveMailBrand(event)` (Community, sonst `pukalani.brand.publicName`/`name`;
  nie ein Name im Code), Sprache über `resolveMailLocale` (Konto, sonst
  Anfrage, sonst en). Wächter: `packages/core/tests/mailFrame.test.ts`.
- ANMELDE-MAILS VON APPWRITE: Vorlagen nur in `scripts/ops/appwrite-mail/`,
  eingespielt je Projekt mit `pnpm ops:mail-templates` (Trockenlauf; schreiben
  mit `--apply --backup`); Appwrite nimmt sie nur mit Projekt-SMTP an. Nie in
  der Konsole von Hand ändern, ohne die Datei zu ändern.
- OPT-IN: `notify()` mailt nur nach `prefs.emailNotifications`
  (`off|instant|digest`, Default `off`); Mail-Sprache `prefs.emailLocale`.
- DIGEST-SWEEP: Kandidaten aus UNGELESENEN `notifications`-Zeilen (kein
  User-Scan), höchstens eine Mail je Tag (`prefs.emailDigestLastAt` — Prefs
  MERGEN, nie ersetzen), Plugin `core/server/plugins/email-digest.ts` plus
  `POST /api/notifications/run-digest` (`system.manage`).
- EIN ZEITPUNKT IN EINER BENACHRICHTIGUNG IST EIN ROHWERT (BE-018, Davids
  Entscheidung): `notifications.body` trägt nie fertigen Uhrzeit-Text, sondern
  `encodeNotificationWhen(zeitpunkt, zone)` (`core/shared/notificationWhen.ts`).
  Formatiert wird beim LESEN: Glocke in Sprache und Zone des Lesers; Mails in
  der Sprache des Empfängers und in seiner Zone (`prefs.timezone`), sonst der
  des Termins, sonst UTC (`notificationWhenMailZone`). Das Zonen-Kürzel steht
  IMMER dabei. Alte Zeilen mit fertigem Text bleiben, wie sie sind.
- ERINNERN JE EMPFÄNGER GENAU EINMAL: `notify({ rowId })` mit
  `eventReminderRowId` (Termin, Empfänger, Beginn); der Merker am Termin kommt
  NACH dem Versand und nur ohne Störung (Fehlende holt ein späterer Takt nach,
  der Rest läuft in die Dublette). Nur der stündliche Zeit-Lauf
  `event-reminders` stößt an, nie ein Seitenaufruf.
- VERSCHOBEN NACH DER ERINNERUNG ⇒ NOCH EINMAL (KK1, Davids Entscheidung):
  ändert `PATCH /api/events/:id` den Beginn eines erinnerten Termins, fällt der
  Merker (`rescheduleClearsReminder`, `events/shared/eventReschedule.ts`,
  verglichen wird der Zeitpunkt).
- UNERREICHBARE COMMUNITY (SE1 d, gebaut, NICHT SCHARF): der Lauf fragt je Takt
  einmal `resolveUnreachableCommunities()` (Regel in `tenant-mitglieder.md`),
  nur im Pool und nur bei fälligem Termin. `EVENT_REMINDER_UNREACHABLE_MODE`
  (`events/shared/eventReminderJob.ts`) steht auf `count`: erinnert weiter und
  zählt. `skip`: keine Erinnerung und KEIN Merker für stillgelegte oder wegen
  Missbrauchs gesperrte Communities. Zahlungs-Sperre zählt nicht; ohne Antwort
  wird erinnert. Scharf erst nach einer GESEHENEN Antwort — ein Takt ohne
  fälligen Termin fragt nicht, „0" belegt nichts (Zählzeile `gefragt=`;
  OPEN-ITEMS „SE1" d).

### Öffentliches Formular, das eine Mail auslöst (SEC-018, Davids Entscheidung)
Drei Dinge, immer zusammen:
- (1) BOT-PRÜFUNG: `requireTurnstile(event, aktion, body.turnstileToken)` nach
  dem Honigtopf, vor Datenbank und Mail; Aktion in `TURNSTILE_ACTIONS`
  (`core/shared/turnstile.ts`); das Formular zeigt `AuthTurnstileWidget` mit
  derselben Aktion und setzt es nach jedem Fehlschlag zurück (Muster
  `comments/app/components/GuestCommentForm.vue`). Ohne Schlüssel ein No-op —
  trotzdem braucht JEDER Einstieg in dieselbe Route das Widget, sonst lehnt der
  Server ab, sobald Schlüssel gesetzt sind.
- (2) GRENZE JE EMPFÄNGER: `allowRecipientMail(event, bereich, adresse)`
  (`core/server/utils/recipientMailLimit.ts`, `RECIPIENT_MAIL_MAX` je Adresse,
  Bereich und 24 h, im Schlüssel nur ein Hash) vor der Mail an die
  EINGETRAGENE Adresse. `false` ⇒ keine Mail, KEIN neuer Link (sonst entwertet
  ein Fremder den echten), Antwort wortgleich zum Erfolg — auch in den WERTEN
  (Code-Anforderung: `userId`). Anmelde-Mails: `AUTH_MAIL_RECIPIENT_LIMIT`
  (Bereiche `auth:otp`, `auth:recovery`). „E-Mail bestätigen"
  (`POST /api/auth/verification`, `auth:verification`) sagt die Grenze OFFEN
  (429 `rate_limited`) — es fragt das eigene Konto.
- (3) KEIN FREIER TEXT DES ABSENDERS in einer Mail an eine frei eingetragene
  Adresse: Name durch `displayNameProblem`, Nachricht nie zitiert. BEWUSSTE
  TEIL-BESETZUNGEN: Newsletter-Anmeldung (insights) nur die Grenze;
  Erstgespräch (portfolio) und Kontakt (photos) nur die Bot-Prüfung — sie
  mailen nur an den Betreiber. Die Meldung an
  den BETREIBER (feste Adresse) hat keine eigene Grenze; davor stehen
  Bot-Prüfung und Drossel je Leitung.

- NEUE STELLE, die einen Link in eine Mail legt ⇒ `resolveSiteLinkBase(event)`
  statt `config.public.appUrl` (`hosts-ops.md`, „Herkunft und Links").

### Newsletter-Abmelde-Links (SEC-020)
- Signiert mit `NUXT_INSIGHTS_NEWSLETTER_SECRET` (nur branding); beim Wechsel
  wandert der alte Wert nach `…_PREVIOUS` und prüft weiter. Links von davor
  (API-Schlüssel) gelten ohne Frist (Davids Entscheidung). Ohne Geheimnis
  startet die Seite trotzdem.
- Ein Geheimnis NIE für einen zweiten Zweck wiederverwenden — ein Tausch
  entwertet sonst still etwas Drittes.
- Ein Link, den kein Schlüssel bestätigt ⇒ 400 `unsubscribe_link_invalid`,
  die Seite sagt „nicht abgemeldet" (keine stille 200). Runbook:
  `docs/runbooks/NEWSLETTER-ABMELDE-LINKS.md`.

### Embed (`docs/referenz/EMBED.md`)
- Gate `pukalani.comments.embed` (enabled/allowedOrigins, Default aus) ⇒
  `/embed` + `comments/public/embed.js`. `frame-ancestors` nur über
  `registerEmbeddableRoute` (Default `'self'` auf ALLEN SSR-Seiten). Die
  Herkunftsprüfung `core/server/middleware/03.csrf-origin.ts` ist immer an
  (`hosts-ops.md`, „HERKUNFTSPRÜFUNG").
- Transparenter Hintergrund NUR bei `theme=auto`. `localhost:PORT↔PORT` ist
  same-SITE — echtes Cross-Site-Gastverhalten braucht echte Domains.
- LOKALE EINBETTER (BE-023) stehen in KEINER `app.config.ts`:
  `comments/server/utils/embedStaticOrigins.ts` hängt sie nur im Dev-Server
  (`import.meta.dev`) oder mit `NUXT_COMMENTS_EMBED_LOCAL_ORIGINS=true` an — die
  Variable auf keinem Server setzen.

### Moderation
- Zweiphasen-Hide + Cascade gehören comments
  (`comments/server/utils/commentModeration.ts`); admin-Routen und Auto-Hide
  teilen sie. Eskalation über `registerReportEscalationHandler` (moderation
  zählt, Owner reagiert); `pukalani.comments.autoHideReports` (0 = aus,
  Meldungen bleiben offen). `resolveReportsForTarget`/`openReportsForTarget`
  sind die Verträge für Resolve/Assist/Bulk.
- ZURÜCKZIEHEN NUR, SOLANGE OFFEN (BE-020): erledigte Meldung ⇒ 409
  `report_resolved`, die Entscheidung bleibt im Verlauf.
- KOMMENTAR-LESERECHTE NUR AUS EINER FUNKTION
  (`comments/server/utils/commentReadPermissions.ts`): Anlegen und BEIDE Wege
  des Wiederherstellens; ein Kommentar an einem Betreiber-Ziel
  (`pukalani.comments.operatorTargets`) bekommt nur Betreiber-Leserechte. Jeder
  weitere Weg, der Leserechte setzt, ruft dieselbe Funktion.
- GEMELDETE PRIVATE NACHRICHTEN (SEC-033, Davids Entscheidung): Text nur,
  solange eine Meldung OFFEN ist — Liste und Einzel-Ansicht über
  `moderatorVisibleBody` (gebündelt `openReportCountsForTargets`); jede Einsicht
  entprellt im Betreiber-Protokoll (`recordAuditView`). 90 Tage nach der
  letzten Erledigung leert ein Lauf NUR `reportedBody`/`reportedAt` — das
  Gespräch und die Meldung bleiben (Schalter
  `pukalani.messages.reportEvidenceSweep` off/count/apply, Stand je Nachricht
  nur in ihrer Community über `reportEvidenceStateForTarget`); `docs/referenz/EXPORT-UND-LOESCHUNG.md`.

### Microcache
- `createMicrocache()` NUR für user-agnostische GETs (z. B. Gast-Kommentare
  Seite 1, öffentlicher Changelog — beim Schreiben invalidiert —, `/api/stats`
  nur ohne Mandant, mit Mandant 404, BE-023). NIE Antworten
  mit Session-Daten; kein SSR-Seiten-SWR (Session-State steckt im HTML).
- AUSNAHME SEITEN FERTIG HALTEN (Q22, Davids Entscheidung R3): NUR Sites
  ohne Konten (`marketing`, `help`, `portfolio` nur Layout `site`) halten
  Seiten 60 s, eingeschaltet über `pukalani.pageCache` (Core AUS), Regeln in
  `core/shared/pageCache.ts` — nie für Communities, Kundenbereich, Konsole
  oder branding.supply; Formulare mit Bot-Prüfung bleiben frisch.
