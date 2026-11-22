# Semantische Suche – neue Prüfung (VDB1)

> **Plan-Status (2026-11-22):** nicht gebaut — Prüfung und Empfehlung, wartet auf Davids Strategie-Freigabe ([OPEN-ITEMS](../OPEN-ITEMS.md) „VDB1“).

Stand: 2026-11-22. Nur Dokument, nichts gebaut, nichts bezahlt. Davids Wort
vom 2026-11-21: „Doch weiter verfolgen". Die erste Prüfung vom 2026-11-06
(„lohnt jetzt nicht") steht in [plans/offen/VDB1.md](offen/VDB1.md).

## Was „semantische Suche" hier heißt

Ein Text wird zu einer Zahlenreihe (Vektor, „Embedding"), die seinen Sinn
trägt. Die Suche vergleicht dann Sinn statt Wörter: „Logo zu verspielt" findet
auch einen Beitrag über „kindliche Bildmarke". Heute sucht die Plattform über
den Volltext von MariaDB (`posts`, `comments`, `events`, `admin`), das findet
nur gleiche Wörter.

## Was sich seit dem 2026-11-06 geändert hat — und was nicht

| Frage | 2026-11-06 | 2026-11-22 |
| --- | --- | --- |
| Appwrite-Version | 2.6.2 | **2.7.4** auf dev, CI und Production |
| VectorsDB self-hosted | braucht ein eigenes Postgres (`appwrite/postgres`) und für eingebaute Embeddings den Container `appwrite/embedding` | **unverändert**: beide stehen im offiziellen Compose von 2.7.x, wir fahren sie nicht (Runbook APPWRITE-2-7-UPGRADE) |
| Eingebaute Modelle | `nomic-embed-text`, `all-minilm` — nur Englisch | **unverändert**; das mehrsprachige `embedding-gemma` steht in der Doku weiter auf „coming soon" und antwortet mit 400 |
| Filter neben der Vektor-Suche | `metadata` je Eintrag | Doku: eine Vektor-Abfrage je Anfrage, kombinierbar mit Abfragen auf `metadata`. **Nicht dokumentiert:** ob der Filter VOR oder NACH der HNSW-Suche greift — greift er danach, fallen kleine Communities aus den Treffern |
| Mehrsprachige Embeddings in der EU | nicht geprüft | `mistralai/mistral-embed-2312` hat beim Vermittler einen Endpunkt `mistral/eu` (0,11 $ je Million Tokens, Liste der Europa-Adresse, gelesen 2026-11-22). Andere mehrsprachige Modelle (bge-m3, multilingual-e5, Gemini) haben dort KEINEN Europa-Endpunkt |
| Insights-Basis | eine Handvoll Beiträge | nicht gemessen — Production lesen braucht Davids Ja |

Die Auslöser von damals („mehrsprachiges Modell in Appwrite" UND „Basis mit
einigen hundert Einträgen") sind beide nicht eingetreten.

## Die harte Bedingung: Suche trifft nie über Communities hinweg

Im Pool teilen sich viele Communities eine Datenbank. Jede Zeile trägt
`tenantId`, und die Datentür `tenantDb` setzt den Filter bei JEDEM Zugriff
selbst (Regel `tenant-isolation.md`). `tenantDb` kennt nur TablesDB.

- **VectorsDB** läge AUSSERHALB dieser Tür: `tenantId` müsste in `metadata`,
  dazu eine eigene Tür, ein ESLint-Wächter und Rollen-Tests für jede Route,
  die sucht — ein neuer Vertrag nach CONCEPT A14. Und der Filter-Zeitpunkt
  oben ist ungeklärt.
- **Vektor als Spalte in der eigenen Tabelle** (Variante C unten) bleibt
  INNERHALB der Tür: geladen werden nur die Zeilen der eigenen Community, die
  Grenze hält von selbst.

## Kosten und Betrieb

- **Vektoren erzeugen ist billig.** Mit `mistral-embed` in der EU:
  1.000 Einträge × 1.500 Tokens = 1,5 Mio. Tokens ≈ **0,17 $ einmalig**;
  danach nur Neues und Geändertes. Jede Suchanfrage braucht einen Vektor der
  Frage (rund 20 Tokens, praktisch nichts). Der eingebaute Weg von Appwrite
  rechnet self-hosted auf der eigenen CPU (kein Geld, aber Last auf
  appwrite-prod) — und kann nur Englisch.
- **Betrieb VectorsDB:** ein zweites Postgres je Appwrite-Instanz, im
  Backup und bei jedem Upgrade mitzudenken, mehr Speicher auf appwrite-prod,
  dazu ein Embedding-Container. Der Migrations-Runner kennt keine
  VectorsDB-Sammlungen (neue Schritte, neue Ziel-Prüfung). Je Silo-Instanz
  dasselbe noch einmal.
- **Betrieb Variante C:** eine Spalte (MEDIUMTEXT, Vektor als Zahlenliste)
  per gewöhnlicher Migration, kein neuer Dienst. Gesucht wird im Server:
  Vektoren der Community laden, Abstand rechnen, sortieren. Bei 1.024 Zahlen
  je Eintrag sind 5.000 Einträge rund 20 MB — trägt bis in die niedrigen
  Zehntausend je Community, darüber braucht es einen Index.
- **Datenschutz:** Beiträge von Kundinnen und Kunden gingen an einen
  Embedding-Anbieter. Es zählt der ORT; `mistral/eu` muss vor dem ersten
  Aufruf so geprüft werden wie die Text-Endpunkte (`zdr`, EU-Ort, kein
  Ausweichen), und der Datenschutztext nennt den Weg.

## Drei Varianten

| | A — weiter nicht | B — VectorsDB self-hosted | C — Vektor als Spalte, Embeddings über die EU |
| --- | --- | --- | --- |
| Was | Volltext bleibt | Postgres + Embedding-Container, VectorsDB-Sammlungen | eine Spalte je Tabelle, `mistral-embed` über `mistral/eu`, Abstand im Server |
| Mehrsprachig | — | nein (bis `embedding-gemma` kommt) oder eigene Vektoren | ja |
| Mandanten-Grenze | hält | neuer Vertrag, Filter-Zeitpunkt offen | hält über `tenantDb` |
| Betrieb | nichts | zweite Datenbank je Instanz, Backup, Upgrade, Runner | eine Migration je Tabelle |
| Grenze | findet nur Wörter | groß | einige Zehntausend Einträge je Community |
| Aufwand bis zur ersten Suche | 0 | 3–4 Sessions + Server-Arbeit | 2 Sessions |

## Empfehlung

**A jetzt, C als erster Bau, sobald es einen Bedarf gibt; B nicht.** Ein
Bedarf ist: die Insights-Basis hat einige hundert Beiträge und der
Markenberater soll aus ihr zitieren (RAG), oder Kundschaft fragt nach einer
Suche, die mehr als gleiche Wörter findet. B lohnt erst, wenn Appwrite ein
mehrsprachiges Modell liefert UND eine Community so groß ist, dass C nicht
mehr trägt — beides ist heute nicht absehbar.

## Kleinster sinnvoller erster Schritt (wenn David Ja sagt)

**Eine Mess-Session, kein Produkt-Bau (1 Session).** Ein Skript nach Art von
`scripts/ki-modell-probe.mjs`: es nimmt die Insights-Beiträge aus der
lokalen Datenbank, rechnet ihre Vektoren mit `mistral-embed` über
`mistral/eu` (unter 0,05 $), und vergleicht für 20 von Hand geschriebene
Fragen die Treffer der Vektor-Suche mit denen des Volltexts, nebeneinander
zum Lesen. Dazu eine Probe-Anfrage, die zeigt, dass der Endpunkt mit
`zdr: true` und ohne Ausweichen antwortet. Erst wenn die Treffer sichtbar
besser sind, folgt Variante C für eine Tabelle (eine weitere Session).

## Was davon Davids Klick braucht

- **Strategie-Freigabe:** A bleiben oder die Mess-Session starten.
- **Einen neuen Anbieter-Ort** (Mistral in der EU) für Kundendaten — erst für
  die Messung nur mit Insights-Beiträgen (redaktionell, keine Kundendaten),
  für Communities danach eigens, mit Datenschutztext.
- **Production-Daten lesen**, falls die Messung mit dem echten Bestand statt
  dem lokalen Spiegel laufen soll.
- Kosten: die Messung bleibt unter 1 €, braucht also kein eigenes Ja über
  die Freigabe hinaus.
