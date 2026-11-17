# MFA-Notausgang (Betreiber)

**Fall:** ein Konto hat Zwei-Faktor aktiv, das Gerät ist weg UND alle sechs
Wiederherstellungs-Codes sind verbraucht/verloren. Selbsthilfe gibt es dann
nicht mehr — das ist die bewusste Härte des Features.

**Davids Entscheidung (2026-08-13):** KEIN Reset-Knopf im admin-Dashboard —
der Fall ist selten, und ein privilegierter Reset-Pfad wäre eine eigene
Angriffsfläche. Der Weg ist der Konsolen-Eingriff durch den Betreiber, nach
ECHTER Identitätsprüfung (Antwort von der hinterlegten Mail-Adresse reicht
NICHT — die kann kompromittiert sein; Video-Ident oder ein zuvor bekannter
zweiter Kanal).

**Der Eingriff** (Appwrite-Konsole, im Projekt, in dem das Konto liegt:
`account` für Kunden-Communities, `admin` für Betreiber-Konten — bis
2026-08-18 hieß es `control` —, `portfolio`, `branding`):

1. Auth → Users → Konto öffnen.
2. Reiter „MFA": den TOTP-Authenticator LÖSCHEN (damit fällt der
   Faktor-Zwang, `updateMFA` steht noch auf true, wirkt aber ohne
   verifizierten Faktor nicht — s. U15-Teil-4-Eintrag in
   OPEN-ITEMS-COMPLETE).
3. Optional zusätzlich: alle Sessions widerrufen (die Person meldet sich neu
   an — nur mit Passwort).
4. Der Person schreiben: MFA ist AB, bitte sofort neu einrichten
   (Konto → Sicherheit).

Jeden Eingriff kurz im Ticket/Vorgang festhalten (wann, wer, wie
identifiziert). Häufen sich Fälle, wird der protokollierte Dashboard-Reset
neu bewertet (die abgelehnte Option steht im DECISION-LOG 2026-08-13).
