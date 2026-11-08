# Kunden-Changelog CL1 — Text zur Freigabe (2026-11-06)

> **AUSGEFÜHRT 2026-11-06** — von David freigegeben (alle 15, Offenlegungs-Satz
> bleibt) und per Upsert mit fester Row-Id nach Prod (`admin`) geschrieben;
> `admin.pukalani.app/changelog` zeigt seitdem 16 Einträge in de und en
> (seit 2026-11-08 15: der AI-Runner-Eintrag ist unveröffentlicht).
> Bericht: OPEN-ITEMS-COMPLETE „CL1".

> Ersetzt `CHANGELOG-3.0.0-ENTWURF.md`. Ziel: `admin.pukalani.app/changelog`
> zeigt mehr als den einen Eintrag vom 2026-08-19. Datenweg: Rows der Tabelle
> `changelog` im Prod-Projekt `admin` (`title`/`body` = de, `titleEn`/`bodyEn`
> = en, Markdown). 15 Einträge: 9 neu, 6 lagen seit 2026-08-14 als
> unveröffentlichte Entwürfe auf Prod (nur ihre Hilfe-Links sind korrigiert —
> de zeigte auf die englische, en auf eine Weiterleitung).

**Grundsätze**

- **Ohne Versionsnummer.** Die Sortierung stellt Einträge MIT Version immer vor
  die ohne — ein „v3.0.0" stünde sonst über allem Neueren. Alle Einträge ordnen
  sich nach Datum, wie der bestehende vom 2026-08-19.
- **Fakten aus der Hilfe** (help.pukalani.app) und den Commits, nicht aus dem
  alten Entwurf. Überholt waren dort: „sieben Schritte" (heute vier),
  `start.pukalani.app` (leitet auf account.), „Basic" als Plan (seit F49 der
  Zustand ohne Abo), Kurse/Events „im Dashboard anschalten" (Early Access, nicht
  kaufbar), Ticket-Board-Fix (Betreiber-Innenleben).
- **Bewusst weggelassen:** Kurse & Events (Early Access), Feedback-Widget,
  Kartenzahlung-only, Community stilllegen statt löschen, Gast-Schreibregel,
  alles Betreiber-Innenleben und die anderen Marken (branding.supply, Studio).
- Datum = Tag des Feature-Commits auf `main`.

## Einträge (neueste zuerst)

---

## 2026-10-27 · Fehlerbehebung · Sicherer anmelden

*Quelle: NEU · Row-Id `cl-2026-10-27-sicher-anmelden`*

- Wer die Zwei-Faktor-Anmeldung eingeschaltet hat und sich per E-Mail-Code anmeldet, wird jetzt zuverlässig nach dem zweiten Faktor gefragt. Vorher landete man ohne Hinweis wieder auf der Anmeldeseite.
- Registrierung, Anmeldung per Code und Passwort-Zurücksetzen sind besser gegen Spam und Bots geschützt: mit einer kurzen automatischen Prüfung, einem Limit pro Stunde und Anzeigenamen ohne Links (höchstens 80 Zeichen).

**EN — Safer sign-in**

- If you have two-factor sign-in turned on and sign in with an email code, you are now reliably asked for the second factor. Before, you ended up back on the sign-in page without a hint.
- Registration, sign-in by code and password reset are better protected against spam and bots: with a short automatic check, a limit per hour, and display names without links (80 characters at most).

---

## 2026-09-09 · Verbesserung · Menü mit Unterpunkten, Seiten in zwei Sprachen

*Quelle: NEU · Row-Id `cl-2026-09-09-menue-sprachen`*

- Das Menü deiner Community kann jetzt **Gruppen mit Unterpunkten** haben.
- Fehlt einer Seite die zweite Sprachfassung, sagt die Seite das offen, statt still die andere Sprache zu zeigen. Mit dem Produkt KI gibt es dazu einen **Übersetzungsvorschlag** — gespeichert wird nur, was du freigibst.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/produkte/seiten)

**EN — Menus with sub-items, pages in two languages**

- Your community's menu can now have **groups with sub-items**.
- If a page lacks its second language version, the page says so openly instead of silently showing the other language. With the AI product you also get a **translation suggestion** — only what you approve is saved.

[Read more in the help center](https://help.pukalani.app/anleitung/produkte/seiten)

---

## 2026-08-23 · Neuerung · Eigene Domain, Statistik und dein Auftritt

*Quelle: NEU · Row-Id `cl-2026-08-23-domain-statistik`*

- **Eigene Domain** (ab Pro): deine Community unter deiner eigenen Adresse, mit Zertifikat. Einrichten darf sie der Owner.
- **Analytics** (ab Personal): Besucher, Seitenaufrufe, Top-Seiten und Quellen — cookielos gemessen, ohne Zustimmungs-Banner.
- **Dein Auftritt:** ein eigenes Favicon und ein eigenes Vorschaubild für geteilte Links.
- **Sichtbarkeit:** öffentlich lesbar oder nur für Mitglieder. Neue Communities starten öffentlich.
- **Mitglieder** im Dashboard auf einer Weltkarte und mit eigener Detailseite.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/produkte)

**EN — Custom domain, analytics and your presence**

- **Custom domain** (from Pro): your community at your own address, with a certificate. The owner sets it up.
- **Analytics** (from Personal): visitors, page views, top pages and sources — measured without cookies, no consent banner.
- **Your presence:** your own favicon and your own preview image for shared links.
- **Visibility:** publicly readable or members only. New communities start public.
- **Members** in the dashboard on a world map and with their own detail page.

[Read more in the help center](https://help.pukalani.app/anleitung/produkte)

---

## 2026-08-20 · Neuerung · Ein Konto für alles — und Anmelden mit Google

*Quelle: NEU · Row-Id `cl-2026-08-20-konto-google`*

- Unter **account.pukalani.app** liegen dein Profil, deine Aktivität und deine Abrechnung — für alle Communities, in denen du mitmachst.
- Anmelden geht jetzt auch **mit Google**, zusätzlich zum Code per E-Mail.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/dein-konto)

**EN — One account for everything — and sign in with Google**

- **account.pukalani.app** holds your profile, your activity and your billing — for every community you take part in.
- You can now also sign in **with Google**, in addition to the email code.

[Read more in the help center](https://help.pukalani.app/anleitung/dein-konto)

---

## 2026-08-18 · Neuerung · Übersetzen auf Knopfdruck

*Quelle: NEU · Row-Id `cl-2026-08-18-uebersetzen`*

Beiträge, Kommentare, Umfragen, Termine und Kurse haben jetzt einen Knopf **Übersetzen**: ein Klick, und der Text erscheint in der Sprache der Leserin oder des Lesers.

- Einmal übersetzt, für alle gespeichert — die nächste Person bekommt die Übersetzung sofort.
- Für die Nutzung gilt ein großzügiges Tageskontingent pro Konto.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/produkte/uebersetzungen)

**EN — Translate with one click**

Posts, comments, polls, events and courses now have a **Translate** button: one click, and the text appears in the reader's language.

- Translated once, saved for everyone — the next person gets the translation instantly.
- A generous daily allowance per account applies.

[Read more in the help center](https://help.pukalani.app/anleitung/produkte/uebersetzungen)

---

## 2026-08-14 · Neuerung · Emoji-Reaktionen und Verweise zwischen Themen

*Quelle: Prod-Entwurf vom 2026-08-14 (nur Hilfe-Links korrigiert) · Row-Id `6a820633002e0ab50669`*

Zwei Dinge, die Gespräche leichter machen:

- **Reaktionen.** Unter jedem Thema und unter jeder Antwort steht jetzt eine
  Leiste mit acht Emoji: 😂 🎉 🤔 👀 😢 🔥 🙏 💡. Sie sind reiner Ausdruck —
  Score, Sortierung und Abzeichen bleiben von ihnen unberührt. Daumen und Herz
  fehlen bewusst: Zustimmung gibt es hier schon, als Hochstufe.
- **Verweise auf andere Themen.** Ein `#` in der Schreibfläche öffnet ein Menü
  über die Themen deiner Community. Das verlinkte Thema zeigt darunter
  „Verlinkt von" — der Verweis wirkt also in beide Richtungen, ohne dass jemand
  etwas nachtragen muss. Und er überlebt das Umbenennen.

Dazu zwei neue Abzeichen: **Erste Reaktion** und **Erster Themen-Verweis**.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/produkte/diskussionen)

**EN — Emoji reactions and links between topics**

Two things that make conversations easier:

- **Reactions.** Every topic and every reply now carries a bar of eight emoji:
  😂 🎉 🤔 👀 😢 🔥 🙏 💡. They are pure expression — score, sorting and badges
  are untouched by them. Thumbs and hearts are deliberately missing: approval
  already exists here, as an upvote.
- **Links to other topics.** Typing `#` in the editor opens a menu of your
  community's topics. The linked topic then shows a "Linked from" section — so a
  reference works in both directions, without anyone having to maintain it. And
  it survives renaming.

Two new badges come with it: **First Reaction** and **First Link**.

[Read more in the help](https://help.pukalani.app/anleitung/produkte/diskussionen)

---

## 2026-08-14 · Neuerung · Mitglieder dürfen jetzt selbst einladen

*Quelle: Prod-Entwurf vom 2026-08-14 (nur Hilfe-Links korrigiert) · Row-Id `6a820634002ec0ee2916`*

Bisher lud nur das Team ein. Ab sofort kann **jedes Mitglied** Menschen
dazuholen — fünf pro Woche, immer als Leserin oder Leser.

- Der Schalter dafür steht unter **Dashboard → Community → Allgemein**
  („Mitglieder dürfen einladen") und lässt sich jederzeit umlegen.
- Owner und Admins bleiben unbegrenzt und vom Schalter unberührt.
- Rollen zu vergeben bleibt eine Team-Entscheidung: eine Mitglieder-Einladung
  macht immer eine Leser-Rolle, nie mehr.

Neu sind auch die Abzeichen **Promoter** (jemand hat deine Einladung
angenommen), **Campaigner** und **Champion** (deine Eingeladenen steigen in den
Vertrauensstufen auf).

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/mitglieder-und-rollen)

**EN — Members can now invite people themselves**

Until now only the team could invite. From today **every member** can bring
people in — five per week, always as a reader.

- The switch sits under **Dashboard → Community → General** ("Members can
  invite") and can be flipped at any time.
- Owners and admins stay unlimited and untouched by the switch.
- Handing out roles remains a team decision: a member's invitation always makes
  a reader, never more.

Three new badges come with it: **Promoter** (someone accepted your invitation),
**Campaigner** and **Champion** (the people you invited climb the trust levels).

[Read more in the help](https://help.pukalani.app/anleitung/mitglieder-und-rollen)

---

## 2026-08-14 · Neuerung · Ein Tages-Limit für Zustimmungen — gestaffelt nach Vertrauensstufe

*Quelle: Prod-Entwurf vom 2026-08-14 (nur Hilfe-Links korrigiert) · Row-Id `6a820635000e8a8c71db`*

Zustimmungen (Hochstufen) haben jetzt eine Obergrenze pro Tag und Community.
Wie viele, hängt an der Vertrauensstufe:

- Stufe 0 und 1: **50** am Tag
- Stufe 2 (Mitglied): **75**
- Stufe 3 (Stammgast) und höher: **100**

Im Alltag merkt das niemand — die Grenze bremst den Massen-Klick, nicht das
Mitlesen. Sie trifft bewusst am stärksten den, über den die Community noch
nichts weiß, und lockert für den, der lange verlässlich mitmacht.

Ist das Kontingent aufgebraucht, sagt Pukalani das ausdrücklich; am nächsten Tag
geht es weiter. Zurücknehmen gibt eine Stimme nicht ins Kontingent zurück,
Runterstufen kostet nichts.

Dazu drei Abzeichen für die fleißigen Tage: **Out of Love**, **Higher Love**,
**Crazy in Love**.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/produkte/diskussionen)

**EN — A daily limit on approvals — scaled by trust level**

Approvals (upvotes) now have a daily cap per community. How many depends on the
trust level:

- Levels 0 and 1: **50** per day
- Level 2 (Member): **75**
- Level 3 (Regular) and above: **100**

In everyday use nobody notices — the limit slows down bulk clicking, not
reading. It deliberately bites hardest for the person the community knows
nothing about yet, and loosens for those who have taken part reliably for a long
time.

When the allowance is used up, Pukalani says so explicitly; the next day it
starts over. Taking a vote back does not return it to the allowance, and
downvotes cost nothing.

Three badges come with it for the busy days: **Out of Love**, **Higher Love**,
**Crazy in Love**.

[Read more in the help](https://help.pukalani.app/anleitung/produkte/diskussionen)

---

## 2026-08-14 · Neuerung · Menü, Sucheintrag und Weiterleitungen selbst in der Hand

*Quelle: Prod-Entwurf vom 2026-08-14 (nur Hilfe-Links korrigiert) · Row-Id `6a820635002b6ac1b06a`*

Drei neue Reiter unter **Dashboard → Community**:

- **Navigation.** Menüpunkte ausblenden, umordnen, umbenennen — und eigene
  Links ergänzen, auf eine Seite deiner Community oder auf eine externe Adresse.
  Mit Vorschau in der Reihenfolge, die Besucher sehen.
- **Sucheintrag.** Die Beschreibung, mit der deine Startseite im Suchergebnis
  steht, ein Schalter „aus Suchmaschinen raushalten" und eine Vorschau —
  Suchergebnis und geteilte Link-Karte nebeneinander.
- **Weiterleitungen.** Alte Adressen führen wieder wohin: ein Pfad, ein Ziel,
  bis zu 100 Regeln. Die deutsche Fassung ist mitgefangen, angehängte Parameter
  reisen mit.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/community-einstellungen)

**EN — Navigation, search listing and redirects in your own hands**

Three new tabs under **Dashboard → Community**:

- **Navigation.** Hide, reorder and rename menu entries — and add your own
  links, to a page of your community or to an external address. With a preview
  in the order visitors will see.
- **Search listing.** The description your home page shows in a search result, a
  switch to keep the community out of search engines, and a preview — search
  result and shared link card side by side.
- **Redirects.** Old addresses lead somewhere again: one path, one target, up to
  100 rules. The German version is caught as well, and query parameters travel
  along.

[Read more in the help](https://help.pukalani.app/anleitung/community-einstellungen)

---

## 2026-08-14 · Neuerung · Community-Export: nimm alles mit

*Quelle: Prod-Entwurf vom 2026-08-14 (nur Hilfe-Links korrigiert) · Row-Id `6a820636000a7b151c3e`*

Der Reiter **Export** unter Dashboard → Community lädt herunter, was in deiner
Community steht — Beiträge, Kommentare, Seiten, Termine, den Aufbau deiner Kurse
und dein Team mit Name und Rolle, als eine einzige JSON-Datei.

Nicht dabei sind die Mitgliederliste, E-Mail-Adressen, private Nachrichten und
Meldungen aus der Moderation: Inhalte tragen den Namen ihrer Autorin oder ihres
Autors, die Kontaktdaten deiner Mitglieder bleiben deren Daten. Das Bündel sagt
selbst, was es weglässt.

Der Export ändert nichts an deiner Community und steht allein dem Owner offen.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/community-einstellungen)

**EN — Community export: take everything with you**

The **Export** tab under Dashboard → Community downloads what is in your
community — posts, comments, pages, events, the structure of your courses and
your team with name and role, as one single JSON file.

Not included are the member list, email addresses, private messages and
moderation reports: content carries its author's name, but your members' contact
details remain their data. The bundle states what it leaves out.

Exporting changes nothing in your community and is open to the owner alone.

[Read more in the help](https://help.pukalani.app/anleitung/community-einstellungen)

---

## 2026-08-14 · Neuerung · Zwei-Faktor-Anmeldung, Zeitzone und ein Name fürs ganze Konto

*Quelle: Prod-Entwurf vom 2026-08-14 (nur Hilfe-Links korrigiert) · Row-Id `6a8206360026f2fad14c`*

Drei Neuerungen in deinen Konto-Einstellungen:

- **Zwei-Faktor-Anmeldung.** Unter Einstellungen → Sicherheit einschalten:
  Code aus einer Authenticator-App zusätzlich zum Passwort, dazu
  Wiederherstellungs-Codes für den Fall der Fälle. Sie gilt für die Anmeldung
  mit Passwort — meldest du dich über Google an, prüft Google die Faktoren.
- **Zeitzone.** Datum und Uhrzeit in deiner Zone statt in der des Geräts, mit
  Suche und einer Zeile, die die Wirkung sofort zeigt.
- **Ein Name für Erwähnungen, konto-weit.** Dein `@name` gilt jetzt in allen
  deinen Communities statt in jeder einzeln. Alte Erwähnungen bleiben heil:
  benennst du dich um, bleibt der alte Name für dich reserviert.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/dein-konto)

**EN — Two-factor sign-in, time zone and one name for your whole account**

Three additions to your account settings:

- **Two-factor sign-in.** Switch it on under Settings → Security: a code from an
  authenticator app on top of your password, plus recovery codes for the worst
  case. It applies to password sign-in — if you sign in with Google, Google
  verifies your factors.
- **Time zone.** Dates and times in your zone rather than your device's, with a
  search field and a line that shows the effect right away.
- **One name for mentions, account-wide.** Your `@name` now applies across all
  your communities instead of in each one separately. Old mentions stay intact:
  if you rename yourself, the old name stays reserved for you.

[Read more in the help](https://help.pukalani.app/anleitung/dein-konto)

---

## 2026-08-12 · Verbesserung · Schneller zur eigenen Community

*Quelle: NEU · Row-Id `cl-2026-08-12-einrichtung`*

Das Einrichten ist kürzer geworden.

- Der Assistent stellt nur noch die Fragen, die am Anfang zählen: Name und Adresse, worum es bei dir geht, welche Stimmung passt. Alles ist später änderbar.
- Danach wartet im Dashboard eine Willkommens-Checkliste, und eine Mail bestätigt: deine Community steht.
- Pukalani ist im Early Access — neue Communities entstehen mit einem Einladungs-Code. Ohne Code kannst du Zugang anfragen.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/erste-schritte)

**EN — A faster way to your own community**

Setting up got shorter.

- The assistant now only asks what matters at the start: name and address, what your community is about, which mood fits. Everything can be changed later.
- Afterwards a welcome checklist waits in the dashboard, and an email confirms: your community is live.
- Pukalani is in early access — new communities are created with an invitation code. Without a code you can request access.

[Read more in the help center](https://help.pukalani.app/anleitung/erste-schritte)

---

## 2026-08-07 · Verbesserung · Zwei Pläne: Personal und Pro

*Quelle: NEU · Row-Id `cl-2026-08-07-plaene`*

Die Preise sind einfacher geworden.

- **Personal** für 29 € und **Pro** für 149 € im Monat, Endpreise inklusive MwSt. Wer jährlich zahlt, bekommt drei Monate geschenkt.
- Jede neue Community startet mit **14 Tagen Pro** — ohne Zahlungsdaten, ohne Kündigung.
- Ohne Abo bleibt eine Community **lesbar und vollständig erhalten**. Geschrieben wird darin wieder, sobald ein Abo läuft.
- Im Dashboard wechselst du oben links zwischen deinen Communities.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/abrechnung)

**EN — Two plans: Personal and Pro**

Pricing got simpler.

- **Personal** for €29 and **Pro** for €149 a month, final prices including VAT. Pay yearly and get three months free.
- Every new community starts with **14 days of Pro** — no payment details, nothing to cancel.
- Without a subscription a community stays **readable and fully intact**. Writing resumes as soon as a subscription is active.
- In the dashboard you switch between your communities at the top left.

[Read more in the help center](https://help.pukalani.app/anleitung/abrechnung)

---

## 2026-08-05 · Neuerung · Diskussionen, Erwähnungen und private Nachrichten

*Quelle: NEU · Row-Id `cl-2026-08-05-diskussionen`*

Deine Community bekommt einen geordneten Ort für Gespräche.

- **Diskussionen.** Die Beiträge deiner Community nach Kategorien geordnet — mit Zuständen wie *angeheftet* oder *geschlossen*, mit Filtern, Suche und Verhaltensregeln.
- **Abzeichen und Vertrauensstufen.** Wer lange und verlässlich mitmacht, steigt auf und bekommt mehr Rechte. Eine Galerie zeigt, welche Abzeichen es gibt.
- **Erwähnungen.** Mit `@name` holst du jemanden ins Gespräch — die Person wird benachrichtigt.
- **Private Nachrichten.** 1:1-Gespräche zwischen Mitgliedern. Ab Werk ausgeschaltet: du entscheidest, ob deine Community sie nutzt.

Diskussionen und private Nachrichten gehören ab Plan Personal dazu.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/produkte/diskussionen)

**EN — Discussions, mentions and private messages**

Your community gets an orderly place for conversations.

- **Discussions.** Your community's posts sorted into categories — with states such as *pinned* or *closed*, with filters, search and a code of conduct.
- **Badges and trust levels.** Members who take part reliably over time level up and gain more rights. A gallery shows which badges exist.
- **Mentions.** Type `@name` to bring someone into the conversation — they get notified.
- **Private messages.** One-to-one conversations between members. Off by default: you decide whether your community uses them.

Discussions and private messages are included from the Personal plan.

[Read more in the help center](https://help.pukalani.app/anleitung/produkte/diskussionen)

---

## 2026-07-28 · Neuerung · Deine eigene Community — in Minuten statt in Wochen

*Quelle: NEU · Row-Id `cl-2026-07-28-eigene-community`*

Ab jetzt richtest du deine Community selbst ein.

- **Selbst loslegen.** Ein Assistent fragt nach Name, Adresse und Erscheinungsbild — am Ende steht deine Community unter `deinname.pukalani.app`. Kein Warten, kein Ticket.
- **Dein Team.** Hol Menschen dazu und gib ihnen eine von fünf Rollen: Viewer, Editor, Moderator, Admin oder Owner. Jede Rolle sieht genau die Bereiche, die sie braucht.
- **Deine Farben.** 26 Farbwelten mit je elf Abstufungen, dazu eigene Schriften. Was du wählst, sehen deine Mitglieder sofort — ohne Neuladen.
- **Eigene Seiten.** Startseite, Regeln, Impressum, Datenschutz: im Dashboard geschrieben, auf Deutsch und auf Englisch.
- **Offene Registrierung als Schalter.** Du entscheidest, ob sich jede Person anmelden darf oder nur Eingeladene.
- **Hilfe zum Nachlesen.** Unter help.pukalani.app steht eine Anleitung — von den ersten Schritten bis zur Abrechnung.

**Außerdem:** Geteilte Links, Suchmaschinen und Fehlerseiten tragen Namen und Farben deiner Community. Einladungs-Links führen nach der Anmeldung dorthin, wohin sie zeigen. Und die Zugriffsprüfung der Moderations-Ansichten sitzt jetzt an einer einzigen Stelle — vorher konnte dort in seltenen Fällen ein Eintrag einer anderen Community auftauchen.

[Nachlesen in der Hilfe](https://help.pukalani.app/de/anleitung/erste-schritte)

**EN — Your own community — in minutes, not weeks**

From now on you set up your community yourself.

- **Get started on your own.** An assistant asks for a name, an address and a look — at the end your community lives at `yourname.pukalani.app`. No waiting, no ticket.
- **Your team.** Bring people in and give them one of five roles: Viewer, Editor, Moderator, Admin or Owner. Each role sees exactly the areas it needs.
- **Your colors.** 26 color worlds with eleven shades each, plus your own fonts. What you choose, your members see right away — no reload.
- **Your own pages.** Home page, rules, imprint, privacy policy: written in the dashboard, in German and in English.
- **Open registration as a switch.** You decide whether anyone may sign up or only people you invite.
- **Help to read up on.** help.pukalani.app has a guide — from the first steps to billing.

**Also:** Shared links, search engines and error pages carry your community's name and colors. Invitation links now take you where they point after you sign in. And access checks for the moderation views now sit in one single place — before, an entry from another community could show up there in rare cases.

[Read more in the help center](https://help.pukalani.app/anleitung/erste-schritte)
