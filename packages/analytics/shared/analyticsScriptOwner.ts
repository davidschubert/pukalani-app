/**
 * WEM GEHÖRT EINE ZÄHL-KENNUNG? — pur, ohne h3, ohne fetch (BE-022).
 *
 * Davids Entscheidung: „Die Zähl-Kennung wird beim Speichern gegen die eigene
 * Seite geprüft." Bis dahin prüfte `PATCH /api/analytics/settings` nur die
 * FORM der Kennung (`isPlausibleScriptId`). Die Kennung jeder Community steht
 * aber öffentlich im HTML ihrer Seiten; eine Kennung, die zu einer ANDEREN
 * Seite unserer Instanz gehört, ließ die eigenen Besucher in deren Statistik
 * zählen.
 *
 * WOHER DIE ANTWORT KOMMT: die öffentliche Zähl-Datei `<instanz>/js/<kennung>.js`
 * nennt die Seite, zu der sie gehört. Am 2026-11-17 an unserer Instanz gemessen
 * und im Quelltext des Herstellers nachgelesen: sie enthält genau EIN
 * Konfigurations-Objekt der Form
 *   {endpoint:"https://…/api/event",domain:"communities.pukalani.app",formSubmissions:!0,…}
 * — Schlüssel ohne Anführungszeichen, Text-Werte JSON-kodiert, Reihenfolge der
 * Schlüssel nicht fest, `true` als `!0`, `false` fehlt. `domain` ist die
 * Adresse der Seite. Abgeholt wird die Datei in
 * `server/utils/verifyAnalyticsScriptOwner.ts`; hier stehen nur die Regeln.
 */

/**
 * `domain:"…"` als Schlüssel eines Objekts: davor `{`, `,` oder Leerraum (damit
 * `subdomain:` kein Treffer ist), der Schlüssel optional in Anführungszeichen,
 * der Wert ein vollständiges JSON-Zeichenketten-Literal.
 */
const DOMAIN_ENTRY_RE = /(?:^|[{,\s])"?domain"?\s*:\s*("(?:[^"\\\n]|\\.)*")/g

/**
 * PURE (unit-getestet): eine Seiten-Adresse vergleichbar machen —
 * Kleinschreibung, Leerraum und Punkt am Ende weg. Der Port bleibt: eine
 * Plausible-Seite hat keinen, und ein Host mit Port ist eine andere Adresse.
 */
export function normalizeSiteHost(value: string): string {
  const trimmed = value.trim().toLowerCase()
  return trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed
}

/**
 * PURE (unit-getestet): die Adresse der Seite, die die Zähl-Datei nennt.
 *
 * Der Wert wird mit `JSON.parse` des Literals dekodiert — nie von Hand: ein
 * maskiertes Zeichen (`.`) sähe ein Textvergleich nicht, und ein
 * kaputtes Literal wirft dort, statt einen halben Wert zu liefern.
 *
 * `null` heißt „nicht prüfbar": keine Adresse, ein leerer oder kaputter Wert,
 * oder mehrere VERSCHIEDENE `domain`-Treffer. Mehrdeutig ist nicht „irgendeine
 * davon passt" — sonst reichte eine zweite Zeichenkette in der Datei, um jede
 * Prüfung zu bestehen. Dieselbe Adresse zweimal ist eindeutig.
 */
export function scriptSiteDomain(source: string): string | null {
  const found = new Set<string>()
  for (const match of source.matchAll(DOMAIN_ENTRY_RE)) {
    let decoded: unknown
    try {
      decoded = JSON.parse(match[1]!)
    }
    catch {
      return null
    }
    if (typeof decoded !== 'string') return null
    const domain = normalizeSiteHost(decoded)
    if (!domain) return null
    found.add(domain)
  }
  if (found.size !== 1) return null
  return [...found][0]!
}

/** Das führende `www.` zählt nicht — www- und Apex-Adresse sind dieselbe Community. */
function withoutWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host
}

/**
 * PURE (unit-getestet): gehört die Seite `domain` zu dieser Community?
 *
 * `ownHosts` sind die Adressen, unter denen die Community läuft (Host der
 * Anfrage, dazu ihre eigene Domain). Verglichen wird nach Normalisierung und
 * ohne führendes `www.` auf beiden Seiten: das www-/Apex-Geschwister einer
 * eigenen Domain löst auf dieselbe Community auf. Sonst nur GLEICHHEIT — kein
 * Suffix-Vergleich, eine Unter- oder Nachbar-Adresse ist eine andere Seite.
 */
export function scriptBelongsToCommunity(domain: string, ownHosts: string[]): boolean {
  const target = withoutWww(normalizeSiteHost(domain))
  if (!target) return false
  return ownHosts.some((host) => {
    const own = withoutWww(normalizeSiteHost(host))
    return own !== '' && own === target
  })
}
