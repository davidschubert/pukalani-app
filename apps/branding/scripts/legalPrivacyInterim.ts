/**
 * DIE VORLÄUFIGE DATENSCHUTZERKLÄRUNG VON branding.supply — der Übergangstext,
 * bis die anwaltlich geprüfte Fassung steht (Davids Entscheidung 2026-11-12).
 *
 * ── WAS DIESER TEXT IST ──────────────────────────────────────────────────
 * Eine Beschreibung dessen, was die Site HEUTE tatsächlich tut und an wen
 * Daten gehen — in einfachen Worten, als „vorläufig" gekennzeichnet, mit
 * Datum. Er ersetzt das Gerüst mit den `[AUSFÜLLEN: …]`-Markern, seit die
 * Anmeldung offen ist. Er ist KEINE Rechtsberatung und nimmt dem Anwalt nichts
 * vorweg: Rechtsgrundlagen und die Grundlage der Drittland-Übermittlung nennt
 * er bewusst nicht, sondern sagt, dass sie Teil der Prüfung sind.
 *
 * ── DIE BELEGREGEL ───────────────────────────────────────────────────────
 * Jede Aussage hat eine Stelle im Repo. Wer hier etwas ändert, prüft die
 * Stelle — und wer die Stelle ändert, ändert diesen Text UND das Datum:
 *
 *  · KI-Weg und Rechenort  → `packages/brand/server/utils/brandProviderRouting.ts`
 *    (`zdr`, `dataCollection: 'deny'`, `allowFallbacks: false`, zwei
 *    EU-Endpunkte für Text, `google-vertex/eu` für das Bilderlesen); alle
 *    Aufrufer in brand, market und insights reichen genau diese Konstanten
 *    durch. Modelle: `packages/core/app/app.config.ts` (`ai.model`),
 *    `apps/branding/app/app.config.ts` (`ai.visionModel`, `ai.imageModel`).
 *  · Bilder ERZEUGEN        → `BRAND_PROVIDER_ROUTING_VERTEX_GLOBAL` (dieselbe
 *    Datei): das Bildmodell hat bei OpenRouter nur den Endpunkt
 *    `google-vertex/global`, ohne festen Ort (`pnpm ops:ai-models` hält ihn
 *    nach); der Text sagt deshalb keine EU-Verarbeitung zu. Was in die
 *    Anfrage geht: `packages/brand/server/utils/markPrompt.ts`. Der MODELLNAME
 *    steht im Text — der Test hält ihn an `ai.imageModel` der App fest. Der
 *    Hinweis vor dem Auslösen: `BwDraftsPanel.vue` (`brand.mark.drafts.notice`).
 *  · Kommentar-Übersetzung und Moderations-Hilfe → AUS: beide hängen an
 *    `isAiConfigured()`, und `pukalani.ai.enabled` ist hier der Core-Default
 *    (`false`). Der Text nennt sie deshalb nicht. WER DEN SCHALTER EINSCHALTET,
 *    SCHREIBT ZUERST DEN ABSATZ — diese Routen rufen den Transport OHNE
 *    `providerRouting`, also ohne die drei Bedingungen und ohne EU-Ort.
 *  · Bot-Schutz             → `packages/core/server/utils/turnstile.ts`
 *    (`siteverify` mit `remoteip`), `TurnstileWidget.vue`; Pflicht-Env der Site
 *    in `scripts/ops/verify-site-env.mjs`.
 *  · Mail                   → `packages/core/server/utils/mailer.ts` über SMTP;
 *    Anbieter und Region: `docs/runbooks/DEPLOYMENT.md`,
 *    `docs/runbooks/RESEND-WEBHOOK.md`.
 *  · Google-Anmeldung       → `apps/branding/app/app.config.ts` (`auth.providers`).
 *  · Statistik              → Core-Default `analytics.enabled: false`, die App
 *    setzt nichts. WER SIE EINSCHALTET, SCHREIBT ZUERST DEN ABSATZ.
 *  · Zahlung                → kein `billing`-Layer in `apps/branding/nuxt.config.ts`.
 *  · Newsletter             → `packages/insights/app/app.config.ts`
 *    (`newsletter.enabled: false`).
 *  · Fristen                → `BRAND_CHECK_CACHE_MS`, `MARKET_RAW_TTL_MS`,
 *    `SHARE_TTL_MS`, `BRAND_EVENTS_RETENTION_MONTHS`.
 *  · Fremde Websites        → `brandSiteFetch.ts`, `brandSiteCrawl.ts`,
 *    `brandRobots.ts`, `brandTdm.ts`, `packages/market/shared/marketPii.ts`.
 *
 * ── WAS BEWUSST FEHLT ────────────────────────────────────────────────────
 * Die Anschrift des Verantwortlichen steht NICHT in dieser Datei (das Repo ist
 * öffentlich); der Text verweist auf das veröffentlichte Impressum von
 * pukalani.studio. Der Standort des Rechenzentrums und die Fristen für
 * Server-Protokolle und Sicherungskopien sind im Repo nicht belegt — der Text
 * sagt das, statt zu raten.
 *
 * ── FORM ─────────────────────────────────────────────────────────────────
 * Nur der Markdown-Umfang des Core-Parsers (`packages/core/shared/markdown.ts`):
 * Überschriften, Absätze, Listen, fett, Links (https oder interner Pfad —
 * interne Pfade lokalisiert der Renderer selbst), Zitat. Keine Tabellen, kein
 * `mailto:`. Der Wächter ist `apps/branding/tests/legalPrivacyInterim.test.ts`.
 */

/** Stand des Textes. Ändert sich eine Aussage, ändert sich dieses Datum mit. */
export const PRIVACY_INTERIM_DATE = '2026-11-14'

/**
 * FRÜHERE FASSUNGEN DIESES TEXTES — als SHA-256 des ganzen Textes je Sprache.
 *
 * Wofür: `seed:legal --replace-scaffold=privacy` ersetzt eine vorhandene Zeile
 * nur, wenn sie noch ein Gerüst trägt ODER wortgleich eine dieser früheren
 * Fassungen ist. So lässt sich der Übergangstext nachziehen, ohne je einen Text
 * zu überschreiben, den jemand im Dashboard bearbeitet hat: schon ein
 * geändertes Zeichen ergibt eine andere Prüfsumme, und die Zeile bleibt.
 *
 * WER DEN TEXT ÄNDERT, trägt die Prüfsumme der BISHERIGEN Fassung hier ein
 * (vor der Änderung berechnen) und zieht das Datum oben nach. Der Test prüft,
 * dass die aktuelle Fassung nicht in dieser Liste steht.
 */
export const PRIVACY_INTERIM_SUPERSEDED_SHA256: Record<'de' | 'en', readonly string[]> = {
  // Fassung vom 2026-11-12 (erste Übergangsfassung).
  de: ['6c2623eef8eababa63ec65041a5a3e34b0876a63d9561af57fc07c6a5c92f18e'],
  en: ['8ae6fa07221ac78bb421f76a303166ab0d6247796b8344f663d35ab758a3699e'],
}

/** Woran das Einspiel-Skript und der Test die Übergangsfassung erkennen. */
export const PRIVACY_INTERIM_MARKER: Record<'de' | 'en', string> = {
  de: '> **Vorläufige Fassung, Stand 14. November 2026.**',
  en: '> **Provisional version, as of 14 November 2026.**',
}

export const PRIVACY_INTERIM_BODY: Record<'de' | 'en', string> = {
  de: `${PRIVACY_INTERIM_MARKER.de} Dieser Text beschreibt, was auf branding.supply heute tatsächlich mit deinen Daten geschieht und an wen sie gehen. Er ist noch nicht anwaltlich geprüft und nennt deshalb noch keine Rechtsgrundlagen. Die geprüfte Fassung ersetzt ihn.

## Verantwortlicher

Verantwortlich für branding.supply ist David Schubert — Pukalani Studio, ein Einzelunternehmen mit Sitz in den USA. Die vollständige Anschrift steht im [Impressum von Pukalani Studio](https://pukalani.studio/de/imprint).

Für Fragen zum Datenschutz und alle Anliegen zu deinen Daten schreibst du an hello@branding.supply.

## Vertreter in der Union (Art. 27 DSGVO)

Einen Vertreter in der Europäischen Union haben wir bisher nicht benannt. Ob wir einen benennen müssen, klärt gerade unser Anwalt. Bis dahin erreichst du uns direkt unter der Adresse oben.

## Was wir verarbeiten

- **Konto.** E-Mail-Adresse, Anzeigename und Passwort; das Passwort liegt bei uns nur als Prüfwert, nie im Klartext. Meldest du dich mit Google an, erhalten wir von Google deinen Namen, deine E-Mail-Adresse und eine Kennung. Dazu halten wir fest, welcher Fassung der AGB du zugestimmt hast und dass du als Unternehmen oder selbstständig handelst.
- **Sitzungen.** IP-Adresse, Browserkennung und der daraus abgeleitete ungefähre Ort, damit du unter [Einstellungen, Sitzungen](/dashboard/settings/sessions) siehst, wo du angemeldet bist. Den Ort schlagen wir in einer Datenbank auf unserem eigenen Server nach; dafür geht keine Anfrage nach außen.
- **Deine Markeninhalte.** Alles, was du in der Werkstatt schreibst oder hochlädst: Antworten, das Gespräch mit dem Markenberater, Entwürfe, bestätigte Kapitel, Vorbilder (Bilder) und die Ergebnisse daraus.
- **Brand-Check.** Die geprüfte Adresse, das Ergebnis und ein täglich wechselnder Prüfwert aus deiner IP-Adresse, der nur das Tageslimit zählt. Die IP-Adresse selbst speichern wir dabei nicht. Der Brand-Check funktioniert ohne Konto.
- **Marktvergleich.** Die Adressen, die du vergleichst, und die Auswertung dazu.
- **Teilen und Veröffentlichen.** Teilst du ein Ergebnis per Link, speichern wir einen Schnappschuss der bestätigten Kapitel, nie das Gespräch und nie Entwürfe. Wer den Link hat, kann ihn lesen. Reichst du deine Marke für Discover ein, wird sie nach unserer Freigabe öffentlich.
- **Kommentare.** Unter den Insights-Artikeln: dein Kommentar und dein Anzeigename, beides öffentlich. Wer ohne Konto kommentiert, gibt nur einen Anzeigenamen an; Kontaktdaten erheben wir dabei nicht.
- **Erstgespräch-Anfrage.** Name, E-Mail-Adresse, Nachricht und, wenn du sie angibst, Firma und Telefonnummer.
- **Warteliste und Einladungen.** Aus der Zeit der geschlossenen Beta: E-Mail-Adresse und Status.
- **E-Mails an dich.** Mails zu Konto und Anmeldung (zum Beispiel Adresse bestätigen, Passwort zurücksetzen), Einladungen, die Quittung einer Erstgespräch-Anfrage und, nur wenn du sie einschaltest, Benachrichtigungen.
- **Nutzungsereignisse.** Welche Schritte in der Werkstatt benutzt wurden, mit Konto- und Marken-Kennung, aber ohne deinen Text. Eine Ausnahme: Beginnst du einen Schritt neu, heben wir den bisherigen Text als Protokoll auf.
- **Server-Protokolle.** IP-Adresse, Zeitpunkt, aufgerufene Adresse und Browserkennung jedes Seitenaufrufs.
- **Cookies.** Ein Cookie hält deine Anmeldung, weitere merken sich Sprache und Farbwelt. Keines dient der Analyse oder der Werbung.

## KI-Verarbeitung deiner Markentexte

Der Markenberater, die Entwürfe, der Prüfblick, das Urteil im Brand-Check und die Auswertung im Marktvergleich arbeiten mit Sprachmodellen. Dafür gehen deine Markentexte an einen Modellanbieter: was du im Gespräch schreibst, deine Entwürfe und Kapitel, und im Brand-Check und Marktvergleich der Text der geprüften Website.

**Der Weg.** Jede Anfrage läuft über den Vermittlungsdienst OpenRouter (Sitz in den USA), der sie an den Modellanbieter weiterreicht.

**Wo gerechnet wird.**

- **Texte:** ausschließlich auf einem von zwei Endpunkten in der EU, bei Amazon Bedrock (Region eu-west-1, Irland) oder bei Google Cloud Vertex AI (Europa). Voreingestellt ist ein Claude-Modell von Anthropic, das bei diesen beiden Anbietern läuft.
- **Hochgeladene Bilder lesen:** ein Gemini-Modell von Google, ausschließlich auf dem EU-Endpunkt von Google Cloud Vertex AI.
- **Zeichen-Entwürfe erzeugen:** das Bildmodell Gemini 2.5 Flash Image von Google, bei Google Cloud Vertex AI. Für dieses Modell gibt es bei OpenRouter nur einen Endpunkt ohne festen Rechenort („global“). Eine Verarbeitung in der EU können wir hier deshalb nicht zusagen. In die Anfrage gehen Markenname, Briefing, Farben und Schriftname, keine hochgeladenen Bilder und keine Kontodaten. Der Schritt ist freiwillig: Vor dem Erzeugen steht ein Hinweis auf das Modell, und das Kapitel lässt sich ohne Entwürfe abschließen.

**Drei feste Einstellungen.** Sie gelten für jede Anfrage aus der Werkstatt, dem Brand-Check und dem Marktvergleich:

- Zugelassen sind nur Anbieter, die die Anfrage nicht speichern („Zero Data Retention").
- Zugelassen sind nur Anbieter, die Inhalte nicht für eigene Zwecke sammeln, also auch nicht zum Training verwenden.
- Es gibt kein Ausweichen: Ist kein zugelassener Endpunkt erreichbar, schlägt die Anfrage fehl, und die Funktion ist vorübergehend nicht verfügbar.

**Was bei uns bleibt.** Das Ergebnis, also dein Entwurf oder deine Bewertung, speichern wir auf unserem eigenen Server, damit du damit weiterarbeiten kannst.

Bitte gib in der Werkstatt keine sensiblen Angaben über Personen ein, etwa zu Gesundheit, Herkunft oder politischer Haltung, und keine Daten Dritter, die dort nicht hingehören.

Die rechtliche Einordnung dieser Übermittlung, auch der in die USA, ist Teil der anwaltlichen Prüfung.

## Abruf fremder Websites

Für den Brand-Check und den Marktvergleich rufen unsere Server öffentlich zugängliche Seiten der angegebenen Adresse ab. Der fremde Server sieht dabei, wie bei jedem Seitenaufruf, unsere IP-Adresse und unsere Absenderkennung: PukalaniBrandCheck beim Brand-Check, PukalaniMarketBot beim Marktvergleich. Was wir lesen, was wir nicht lesen und wie man uns aussperrt, steht dauerhaft unter [Methodik des Brand-Checks](/brand-check/methodik) und [Market-Bot](/market-bot).

- Wir halten uns an die robots.txt der Website und an maschinenlesbare Vorbehalte gegen Text- und Data-Mining. Liegt ein Verbot vor, werten wir die Seite nicht aus.
- Im Marktvergleich rufen wir Seiten mit Personenbezug gar nicht erst ab: Team, Impressum, Kontakt, Datenschutz, AGB, Anmeldung, Konto und Warenkorb.
- Was auf den übrigen Seiten steht, läuft vor dem Sprachmodell durch einen Filter für E-Mail-Adressen, Telefonnummern und Personennamen.
- Den abgerufenen Rohtext löschen wir nach höchstens 24 Stunden automatisch. Es bleibt eine Zusammenfassung mit kurzen Belegzitaten von höchstens 200 Zeichen und der Quelladresse.

Trägst du in der Werkstatt deine eigene Website ein, rufen wir auch sie ab.

## Öffentliche Bewertung fremder Marken

Der Brand-Check misst einen öffentlich zugänglichen Webauftritt an einem festen Kriterienkatalog und vergibt einen Brand Score von 0 bis 100 sowie acht Kategoriewerte. Jeder Wert stützt sich auf einen Beleg aus dem Auftritt selbst; die [Methodik](/brand-check/methodik) ist öffentlich.

- Ein Ergebnis ist zunächst privat. Im öffentlichen Ranking erscheint es nur, wenn die prüfende Person das beim Start ausdrücklich gewählt hat.
- Zu jedem Ergebnis kann jede Person ohne Konto und kostenlos eine Korrektur vorschlagen. Eine Kontaktadresse ist dabei freiwillig.
- Auf Anfrage entfernen wir ein Ergebnis aus dem öffentlichen Ranking. Die Entfernung ist dauerhaft, auch wenn jemand dieselbe Adresse erneut prüft.
- Unsere Bibliothek zeigt Wortnamen und Kategorie bekannter Marken und kurze Belegzitate von deren eigenen Auftritten, keine Logos und keine Bildmarken.

## Empfänger

An diese Stellen gehen Daten, und nur an diese:

- **Hetzner** (Hetzner Online GmbH, Deutschland) betreibt die Server, auf denen die Anwendung und die Datenbank laufen. Dort liegen alle oben genannten Daten, auch die nächtliche Sicherungskopie der Datenbank.
- **Ploi** (ploi.io) ist das Werkzeug, mit dem wir diese Server verwalten.
- **OpenRouter** (USA) und dahinter **Amazon Web Services** und **Google Cloud** für die KI-Verarbeitung, wie im Abschnitt oben beschrieben.
- **Resend** (USA) versendet unsere E-Mails, über seine Versandregion in der EU (Irland). Resend erhält dafür deine E-Mail-Adresse und den Inhalt der Mail.
- **Cloudflare** (USA) liefert den Bot-Schutz „Turnstile" in den Formularen für Registrierung, Passwort zurücksetzen und Kommentare ohne Konto. Dein Browser lädt dafür ein Skript von Cloudflare; Cloudflare sieht dabei deine IP-Adresse und Angaben zu deinem Browser. Unser Server lässt das Ergebnis anschließend bei Cloudflare prüfen und sendet dafür deine IP-Adresse mit.
- **Google**, nur wenn du „Mit Google anmelden" wählst: Google erfährt, dass du dich bei uns anmeldest. Wir fragen dort nur Name und E-Mail-Adresse ab, keine Kontakte und keinen Zugriff auf dein Google-Konto.
- **Die Öffentlichkeit**, soweit du selbst etwas veröffentlichst: Kommentare, geteilte Links, einen Eintrag im Ranking oder in Discover.

## Was nicht stattfindet

- **Keine Statistik.** Wir messen keine Seitenaufrufe und binden kein Analyse-Werkzeug ein.
- **Keine Werbung.** Kein Werbenetzwerk, kein Pixel, kein Profil zu Werbezwecken.
- **Keine Zahlung.** branding.supply ist in der Beta kostenlos. Wir erheben keine Zahlungsdaten und haben keinen Zahlungsanbieter angebunden.
- **Kein Newsletter.** Wir versenden derzeit keine Serienmails.
- **Keine fremden Inhalte auf unseren Seiten.** Außer dem Bot-Schutz in den genannten Formularen laden unsere Seiten nichts von Servern anderer Anbieter: keine eingebetteten Videos, keine Karten, keine Social-Media-Knöpfe. Auch die Schriften kommen von unserem eigenen Server.
- **Kein Cookie-Banner**, weil kein Cookie der Analyse oder Werbung dient.

## Speicherdauer

- **Konto und Markeninhalte:** bis du die Marke oder das Konto löschst.
- **Sitzungen:** bis du dich abmeldest oder die Sitzung abläuft.
- **Brand-Check:** Ein Ergebnis wird sieben Tage lang für dieselbe Adresse wiederverwendet. Gespeichert bleibt es, bis wir es auf Anfrage entfernen.
- **Marktvergleich:** Rohtext höchstens 24 Stunden, die Auswertung bis zur Löschung der Marke oder des Kontos.
- **Geteilte Links:** 30 Tage; du kannst sie jederzeit widerrufen.
- **Nutzungsereignisse:** 24 Monate, danach löschen wir sie automatisch.
- **Server-Protokolle und Sicherungskopien:** Dafür nennen wir die Fristen mit der geprüften Fassung.

## Deine Rechte

Je nachdem, wo du lebst, hast du Rechte an deinen Daten. Nach der DSGVO sind das Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit, Widerspruch und die Beschwerde bei einer Aufsichtsbehörde.

- Export und Löschung erledigst du selbst unter [Einstellungen, Daten](/dashboard/settings/data). Löschst du dein Konto, entfernen wir deine Marken, die Gespräche, geteilte Links, Nutzungsereignisse und die Daten deiner Marktvergleiche. Einladungen bleiben als Nachweis bestehen, aber ohne deine E-Mail-Adresse.
- Ergebnisse eines Brand-Checks ohne Konto und Einträge der Warteliste hängen an keinem Konto. Wir entfernen sie auf Anfrage von Hand.
- Für alles andere genügt eine Mail an hello@branding.supply.

## Änderungen

Stand: 14. November 2026. Ändert sich etwas an den Empfängern oder an dem, was wir verarbeiten, ändern wir diesen Text und das Datum.`,

  en: `${PRIVACY_INTERIM_MARKER.en} This text describes what actually happens to your data on branding.supply today and who receives it. It has not been reviewed by our lawyer yet, which is why it does not name legal bases yet. The reviewed version will replace it.

## Controller

The controller for branding.supply is David Schubert — Pukalani Studio, a sole proprietorship based in the USA. The full postal address is in the [Pukalani Studio imprint](https://pukalani.studio/imprint).

For privacy questions and any request about your data, write to hello@branding.supply.

## Representative in the Union (Art. 27 GDPR)

We have not appointed a representative in the European Union so far. Whether we have to is with our lawyer right now. Until then you reach us directly at the address above.

## What we process

- **Account.** Email address, display name and password; we only hold the password as a hash, never in plain text. If you sign in with Google, we receive your name, your email address and an identifier from Google. We also record which version of the terms you agreed to and that you act as a business or as self-employed.
- **Sessions.** IP address, user agent and the approximate location derived from it, so that you can see where you are signed in under [Settings, Sessions](/dashboard/settings/sessions). We look the location up in a database on our own server; no request leaves our server for this.
- **Your brand content.** Everything you write or upload in the workshop: answers, the conversation with the brand advisor, drafts, confirmed chapters, your references (images) and the results built from them.
- **Brand check.** The checked address, the result and a daily rotating hash of your IP address that only counts the daily limit. We do not store the IP address itself here. The brand check works without an account.
- **Market comparison.** The addresses you compare and the analysis of them.
- **Sharing and publishing.** If you share a result by link, we store a snapshot of the confirmed chapters, never the conversation and never drafts. Anyone with the link can read it. If you submit your brand to Discover, it becomes public once we have approved it.
- **Comments.** Under the Insights articles: your comment and your display name, both public. If you comment without an account, you only give a display name; we collect no contact details for this.
- **Intro call request.** Name, email address, message and, if you provide them, company and phone number.
- **Waiting list and invitations.** From the time of the closed beta: email address and status.
- **Emails to you.** Emails about your account and sign-in (for example confirming your address, resetting your password), invitations, the receipt for an intro call request and, only if you switch them on, notifications.
- **Usage events.** Which steps of the workshop were used, with account and brand identifiers but without your text. One exception: if you restart a step, we keep the previous text as a record.
- **Server logs.** IP address, time, requested address and user agent of every page request.
- **Cookies.** One cookie keeps you signed in, others remember language and colour theme. None is used for analytics or advertising.

## AI processing of your brand texts

The brand advisor, the drafts, the review, the verdict of the brand check and the analysis in the market comparison work with language models. For this, your brand texts go to a model provider: what you write in the conversation, your drafts and chapters, and in the brand check and market comparison the text of the checked website.

**The route.** Every request goes through the routing service OpenRouter (based in the USA), which passes it on to the model provider.

**Where it is computed.**

- **Text:** only on one of two endpoints in the EU, at Amazon Bedrock (region eu-west-1, Ireland) or at Google Cloud Vertex AI (Europe). The default is a Claude model by Anthropic that runs at these two providers.
- **Reading uploaded images:** a Gemini model by Google, only on the EU endpoint of Google Cloud Vertex AI.
- **Generating mark drafts:** the image model Gemini 2.5 Flash Image by Google, at Google Cloud Vertex AI. OpenRouter offers only one endpoint for this model, without a fixed processing location (“global”). We therefore cannot promise processing in the EU here. The request contains the brand name, briefing, colours and typeface name, no uploaded images and no account data. This step is optional: a notice about the model appears before generating, and the chapter can be completed without drafts.

**Three fixed settings.** They apply to every request from the workshop, the brand check and the market comparison:

- Only providers that do not retain the request are permitted ("zero data retention").
- Only providers that do not collect content for their own purposes are permitted, which excludes training on it.
- There is no fallback: if no permitted endpoint is available, the request fails and the feature is temporarily unavailable.

**What stays with us.** We store the result, meaning your draft or your score, on our own server so that you can keep working with it.

Please do not enter sensitive details about people in the workshop, such as health, origin or political views, or third-party data that does not belong there.

The legal assessment of this transfer, including the transfer to the USA, is part of the review by our lawyer.

## Fetching third-party websites

For the brand check and the market comparison, our servers fetch publicly available pages of the address provided. As with any page request, the other server sees our IP address and our user agent: PukalaniBrandCheck for the brand check, PukalaniMarketBot for the market comparison. What we read, what we do not read and how to block us is explained permanently under [brand check methodology](/brand-check/methodik) and [market bot](/market-bot).

- We follow the website's robots.txt and machine-readable reservations against text and data mining. If either forbids it, we do not analyse the page.
- In the market comparison we do not fetch pages that relate to people at all: team, imprint, contact, privacy, terms, sign-in, account and cart.
- What the remaining pages contain passes a filter for email addresses, phone numbers and personal names before it reaches the language model.
- We delete the fetched raw text automatically after 24 hours at most. What remains is a summary with short supporting quotes of at most 200 characters and the source address.

If you enter your own website in the workshop, we fetch it as well.

## Public scoring of third-party brands

The brand check measures a publicly available web presence against a fixed catalogue of criteria and assigns a brand score from 0 to 100 plus eight category values. Every value rests on evidence from the presence itself; the [methodology](/brand-check/methodik) is public.

- A result is private at first. It only appears in the public ranking if the person running the check explicitly chose that at the start.
- Anyone can suggest a correction to any result, free of charge and without an account. A contact address is optional.
- On request we remove a result from the public ranking. The removal is permanent, even if someone checks the same address again.
- Our library shows word marks and categories of well-known brands and short supporting quotes from their own presences, no logos and no figurative marks.

## Recipients

Data goes to these parties, and only to these:

- **Hetzner** (Hetzner Online GmbH, Germany) operates the servers that run the application and the database. All data named above is stored there, including the nightly backup of the database.
- **Ploi** (ploi.io) is the tool we use to manage these servers.
- **OpenRouter** (USA) and behind it **Amazon Web Services** and **Google Cloud** for AI processing, as described in the section above.
- **Resend** (USA) sends our emails, through its sending region in the EU (Ireland). For this, Resend receives your email address and the content of the email.
- **Cloudflare** (USA) provides the bot protection "Turnstile" in the forms for sign-up, password reset and comments without an account. Your browser loads a script from Cloudflare for this; Cloudflare sees your IP address and details about your browser. Our server then has the result verified by Cloudflare and sends your IP address along for that.
- **Google**, only if you choose "Sign in with Google": Google learns that you sign in with us. We only request name and email address there, no contacts and no access to your Google account.
- **The public**, as far as you publish something yourself: comments, shared links, an entry in the ranking or in Discover.

## What does not happen

- **No analytics.** We do not count page views and do not embed any analytics tool.
- **No advertising.** No ad network, no pixel, no profile for advertising purposes.
- **No payment.** branding.supply is free during the beta. We collect no payment data and have no payment provider connected.
- **No newsletter.** We do not send bulk emails at present.
- **No third-party content on our pages.** Apart from the bot protection in the forms named above, our pages load nothing from other providers' servers: no embedded videos, no maps, no social media buttons. The fonts come from our own server too.
- **No cookie banner**, because no cookie is used for analytics or advertising.

## Retention

- **Account and brand content:** until you delete the brand or the account.
- **Sessions:** until you sign out or the session expires.
- **Brand check:** a result is reused for the same address for seven days. It stays stored until we remove it on request.
- **Market comparison:** raw text for 24 hours at most, the analysis until the brand or the account is deleted.
- **Shared links:** 30 days; you can revoke them at any time.
- **Usage events:** 24 months, after which we delete them automatically.
- **Server logs and backups:** we will state these periods with the reviewed version.

## Your rights

Depending on where you live, you have rights over your data. Under the GDPR these are access, rectification, erasure, restriction of processing, data portability, objection and a complaint to a supervisory authority.

- You handle export and deletion yourself under [Settings, Data](/dashboard/settings/data). If you delete your account, we remove your brands, the conversations, shared links, usage events and the data of your market comparisons. Invitations remain as a record, but without your email address.
- Results of a brand check without an account and waiting list entries are not tied to an account. We remove them by hand on request.
- For everything else, an email to hello@branding.supply is enough.

## Changes

As of 14 November 2026. If the recipients or what we process change, we change this text and the date.`,
}
