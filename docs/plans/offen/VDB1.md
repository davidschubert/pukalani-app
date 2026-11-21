# VDB1 — Einzelheiten

> Einzelheiten zum offenen Punkt **VDB1** in [OPEN-ITEMS.md](../../OPEN-ITEMS.md).
> Die Liste dort bleibt die EINE Liste; hier steht nur die Tiefe dazu.
> Ist der Punkt erledigt, zieht der Eintrag nach
> [OPEN-ITEMS-COMPLETE.md](../../OPEN-ITEMS-COMPLETE.md) und diese Datei wird gelöscht.

**VDB1 — Appwrite VectorsDB für semantische Suche.** Geprüft am 2026-11-06
anhand der Doku, des 2.6.2-Quellcodes (`app/init/registers.php`,
`docker-compose.yml`, `.env`) und von node-appwrite 29. Live probiert wurde
nichts, OrbStack war aus.

- **Was passt:** `VectorsDB` und `Embeddings.createTextEmbeddings` sind seit
  node-appwrite 29.0.0 im SDK, also kein Bump nötig. Suche per
  `Query.vectorCosine` mit `$distance`, beliebige `metadata` je Eintrag,
  Berechtigungen je Eintrag, Dimension der Sammlung frei wählbar.
- **Server:** VectorsDB läuft nicht auf MariaDB. Es braucht ein eigenes
  Postgres (`appwrite/postgres:0.1.0`, `_APP_DB_*_VECTORSDB`, Standard-Host
  `postgresql:5432`), dazu für die eingebauten Embeddings den Container
  `appwrite/embedding:0.3.1` (Profil `embedding`, CPU-Rechnung, Volume
  `appwrite-models`) und `_APP_EMBEDDING=enabled` (Standard aus). Das ist eine
  zweite Datenbank im Backup, mehr RAM auf appwrite-prod und mehr Fläche für
  das Upgrade-Werkzeug. Den Alt-Container haben wir am 2026-09-08 bewusst
  entfernt (APPWRITE-2-0-UPGRADE).
- **Sprache:** eingebaut sind `nomic-embed-text` (768) und `all-minilm` (384),
  beide nur Englisch. Das mehrsprachige `embedding-gemma` steht auf „coming
  soon" und antwortet bis dahin mit 400. Vektoren selbst rechnen ginge, dann
  stellt sich aber die ZDR-ist-nicht-EU-Frage wie bei OpenRouter (AI1).
- **Mandanten-Trennung:** `tenantDb` deckt nur TablesDB. Im Pool bräuchte
  jeder Eintrag `tenantId` in `metadata` plus eine eigene Datentür,
  ESLint-Wächter und VectorsDB-Schritte im Migrations-Runner, also ein
  Eingriff nach CONCEPT A14.
- **Bedarf heute:** Volltext über MariaDB trägt `posts`, `comments`, `events`
  und `admin`. Der eine echte Kandidat ist George-RAG über die
  Insights-Basis (BRAND-WIZARD-PHASE-1, „RAG + Embeddings"), und die hat erst
  eine Handvoll Beiträge.

Wieder anfassen, wenn BEIDES zutrifft: ein mehrsprachiges Modell ist in
Appwrite verfügbar, und die Insights-Basis ist so groß, dass Volltext nicht
mehr reicht (grob einige hundert Einträge). Dann in derselben Strategie-Runde
VectorsDB gegen pgvector im eigenen Postgres und gegen einen externen
Embedding-Dienst abwägen.
