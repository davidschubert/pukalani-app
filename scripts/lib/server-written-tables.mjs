/**
 * TABELLEN, DIE NUR DER SERVER SCHREIBT (SEC-002, GA1 P13 — Davids
 * Entscheidung 2026-11-12: „künftig schreibt nur noch unser Server").
 *
 * Für jede Tabelle hier gilt im Server-Code:
 *  - geschrieben (anlegen, ändern, löschen, zählen, Rechte setzen) wird über
 *    den Admin-Client — die Datentür mit `as: 'operator'` (und `actor`, wenn
 *    ein Mitglied oder Gast handelt), in Skripten und Läufen der Schlüssel;
 *  - eine neue Zeile bekommt nur LESE-Rechte, nie `update`/`delete` für ein
 *    Konto;
 *  - WER darf, prüft die Route selbst, VOR dem Schreiben (Zugehörigkeit über
 *    die Wachen aus `tenant-isolation.md`, Urheberschaft über den Vergleich
 *    der Konto-Id) — es gibt keine zweite Prüfung dahinter.
 *
 * Gehalten von `packages/core/tests/serverWrittenTables.test.ts` (liest die
 * Routen und Hilfen aller Layer). Die Liste wächst je Etappe des Umbaus; eine
 * Tabelle kommt hierher, SOBALD ihr Code umgestellt ist.
 *
 * `constant` ist der Name, unter dem der Layer die Tabelle exportiert
 * (`shared/types/*.ts`); der Test prüft, dass beides noch zusammenpasst.
 *
 * `rights.migration` nennt die Migration, die das Schreib-Recht der TABELLE
 * nimmt und ihr Tabellenrecht seither besitzt. `pnpm check:permissions` hält
 * dagegen, dass keine andere Migration es wieder setzt.
 */
export const SERVER_WRITTEN_TABLES = [
  { table: 'community_posts', constant: 'POSTS_TABLE', layer: 'posts', rights: { migration: '024' } },
  { table: 'comments', constant: 'COMMENTS_TABLE', layer: 'comments', rights: { migration: '021' } },
]

/**
 * Stellen, an denen der Test den Zugang nicht aus dem Quelltext lesen kann —
 * je Eintrag `datei: Grund`. Ein Eintrag, der nichts mehr ausnimmt, ist rot.
 */
export const SERVER_WRITE_EXEMPT = {}
