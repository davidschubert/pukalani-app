# DT1 — Einzelheiten

> Einzelheiten zum offenen Punkt **DT1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**DT1 — Datenschutztexte nachziehen (ein Durchgang nach dem Anwaltstermin).**
Jede Zeile ist ein Satz oder Abschnitt, der in die Erklärungen gehört;
freigegeben wird von David, nach der Antwort des Anwalts.

- **KI** (aus KI1 b, KI1 selbst ist seit dem 2026-11-25 geschlossen) — was
  die Texte über Speicherung, Training und den Ort der Verarbeitung sagen
  dürfen. Stand im Code: Übersetzung, Moderations-Hilfe, Ticket-Einordnung,
  Seiten-Übersetzung und Markenberater lassen den Anbieter nichts speichern,
  nicht damit trainieren und in Europa rechnen (Amazon Bedrock in Irland oder
  Google Vertex in Europa, vermittelt über OpenRouter). Die EINE Ausnahme ist
  das Erzeugen der Zeichen-Entwürfe (kein fester Ort, steht schon im Text von
  branding.supply).
- **Fristen** — Kopie gelöschter Konten, Prüfergebnisse, Melder-Adresse,
  Protokoll ([EL1 b](EL1.md)). Dazu, seit dem 2026-11-17 gebaut und
  eingeschaltet, aber noch in keinem Text: Warteliste (nie bestätigt 30
  Tage, eingeladen oder abgelehnt 90 Tage, wartend höchstens 12 Monate),
  Gesprächsanfragen 12 Monate (branding.supply und pukalani.studio),
  Konto-Protokoll 12 Monate (der Satz „die Konto-Kennung bleibt als Nachweis
  stehen" gilt dann nur noch für diese Zeit), hochgeladene Profilbilder ohne
  Profil 7 Tage.
- **Bot-Prüfung** — Erstgespräch und Warteliste von branding.supply im Text
  ergänzen ([SR1 b](SR1.md)).
- **Resend** — der Mail-Dienst ist nach dem EU-US Data Privacy Framework
  zertifiziert und sendet aus der EU-Region ([RS1](RS1.md)).
- **Cookie-Satz** — die Anmelde-Regeln aus P29
  ([ANMELDE-REGELN.md](../../runbooks/ANMELDE-REGELN.md)).
- **Drei alte Stellen, an denen die Aussage dem Code widerspricht** (Stand
  der Erhebung 2026-08-14, gehören mir, nicht dem Anwalt): (1) „Plausible
  speichert keine personenbezogenen Daten" stand in Kunden-Vorlage,
  Entwurfs-Datenschutzseite und `/gdpr`, der Analytics-Proxy leitet aber IP
  und User-Agent weiter. (2) `/gdpr` wirbt mit „Community starten –
  kostenlos", seit F49 ist eine Community ohne Abo nach 14 Tagen nur-lesend.
  (3) Die Hilfeseite führte Basic als Plan mit „0 €". **Nachgesehen am
  2026-11-16:** (2) steht noch so in `apps/marketing/i18n/locales/de.json`;
  (1) und (3) habe ich im Wortlaut nicht mehr gefunden — **unklar, prüfen**.
