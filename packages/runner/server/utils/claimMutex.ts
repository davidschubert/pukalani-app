/**
 * Serialisierung des Claims (docs/archiv/AI-RUNNER.md § 5).
 *
 * Appwrite kennt KEIN Compare-and-swap: `updateRow` schreibt bedingungslos.
 * Zwischen „ältesten `queued`-Lauf lesen" und „ihn auf `claimed` setzen" liegt
 * also ein Fenster, in dem ein zweiter Poll denselben Lauf sieht — und zwei
 * Rechner arbeiten am selben Ticket.
 *
 * DIE ANNAHME, AUF DER DAS HIER RUHT: die Betreiber-Konsole läuft als EINE
 * pm2-Instanz (`apps/control`, Port 3003 — ein Prozess, kein Cluster). Nur
 * deshalb reicht eine modulweite Promise-Kette: sie serialisiert alle
 * Claim-Handler DIESES Prozesses. Wird die Konsole je mehr-instanzig oder
 * bekommt sie einen Cluster-Modus, BRICHT diese Annahme still — dann ist ein
 * Doppel-Claim wieder möglich und es braucht eine echte Sperre (Redis-Lock;
 * der Rate-Limit-Store des Core hat bereits eine Redis-Anbindung).
 *
 * Das Netz darunter bleibt in jedem Fall: `requireOwnRun` in `events`,
 * `finish` und `transcript` weist jeden Runner ab, der nicht der Eigentümer
 * ist — ein doppelter Claim würde also Arbeit verdoppeln, aber keine fremden
 * Zeilen schreiben.
 */
let chain: Promise<unknown> = Promise.resolve()

export function withClaimMutex<T>(task: () => Promise<T>): Promise<T> {
  // An die Kette hängen, egal wie der Vorgänger ausging — ein Fehler im
  // einen Claim darf die Reihe nicht für alle folgenden vergiften.
  const next = chain.then(task, task)
  // eslint-disable-next-line pukalani/no-silent-catch -- Ende einer Sperr-Kette: den Fehler bekommt der Aufrufer des Glieds, die Kette selbst darf nie abgelehnt sein
  chain = next.catch(() => {})
  return next
}
