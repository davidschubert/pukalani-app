/**
 * Beweis für BW2 Paket 3a — „Gespräch je Session" gegen einen echten Server.
 *
 * Geprüft werden die sieben Zusagen, die keine pure Funktion belegen kann,
 * weil sie an Route, Schema und Ablage hängen:
 *
 *  1. ERÖFFNUNGSZUG: der erste Aufruf einer Session bekommt einen Strom,
 *     der zweite `{ conversed: false, skipped: true }` — die Idempotenz, ohne
 *     die jedes Öffnen einer Session einen neuen ersten Satz kostete.
 *  2. FREMDE SESSION: ein Schlüssel aus einem anderen Kapitel wird mit 400
 *     `session_foreign` abgewiesen — VOR jeder Wirkung.
 *  3. GESPERRTE SESSION: eine Session, deren Eingaben unbestätigt sind, wird
 *     mit 409 `session_locked` abgewiesen.
 *  4. VERLAUF JE SESSION: `?session=` liefert genau den Faden dieser Session.
 *  5. BESTANDS-REGEL: eine Zeile mit LEEREM `sessionKey` (der Kapitel-Verlauf
 *     von vor BW2) zählt zum Fenster der ERSTEN Session des Kapitels — und zu
 *     keinem anderen. Mit GEGENPROBE.
 *  6. SAMMEL-SESSION: `a.facts` sammelt drei Teile nacheinander; der Wert
 *     entsteht erst nach dem dritten und trägt die Form seines Schemas.
 *  7. STEP-DETAIL: `sessions` trägt Zustand, Umfang, Vertraulichkeit und die
 *     Frage „wohin fliesst das später".
 *
 * Seit Paket 3b (BW2 §5a) kommen die vier Zusagen der FINALEN ABNAHME dazu:
 *
 *  8. ABNAHME-FLUSS: bestätigen ⇒ abnehmen ⇒ `acceptance.ready` ⇒ `complete`.
 *     Und die Gegenprobe davor: ohne Abnahme weist `complete` mit
 *     `acceptance_incomplete` ab.
 *  9. RESTART-HÜLLE: ohne bestätigte spätere Kapitel `count: 0`; sobald in
 *     einem späteren Kapitel etwas bestätigt ist, > 0.
 * 10. RESTART-SCHUTZ: ohne Ack 409 `restart_unacknowledged`.
 * 11. RESTART: mit Ack ⇒ Schnappschuss-Ereignis, leere Slots, `restartedAt`,
 *     abgeschnittener Verlauf — und die abhängige Session eines SPÄTEREN
 *     Kapitels steht danach auf `stale`, ohne dass ihre Zeile angefasst wurde.
 *
 * Seit Paket 4 (BW2 §7/§8) kommen die drei Zusagen des SPEZIALISTEN dazu:
 *
 * 12. SCHLIESSEN: `POST …/sessions/:id/close` schreibt Urteil und Notizen
 *     (`reviewed: true`) und antwortet mit dem ADAPTIVEN Wegweiser — der
 *     Ersatz nennt die LETZTE offene Session, die Grundfassung wäre die
 *     erste. Ein zweiter Klick bewegt nichts (Idempotenz).
 * 13. KONFLIKT: ein Befund aus dem Schliess-Aufruf sperrt die Finale Abnahme
 *     (`ready: false`, Blocker `conflict`); das Ablehnen MIT Grund öffnet sie
 *     wieder und hängt den Grund als Notiz an die Quell-Session.
 * 14. KAPITEL-BLICK: `POST …/review` prüft dieselbe Fassung genau einmal —
 *     mit GEGENPROBE (nach einer neuen Fassung läuft er wieder).
 *
 * Seit Paket 6 (BW2 §9) kommen die drei Zusagen der KORREKTUR-REGEL dazu:
 *
 * 15. IMPACT UND ACK: `GET …/sessions/:id/impact` nennt die bestätigten
 *     Abhängigen; der PATCH, der die Bestätigung aufhebt, wird OHNE passendes
 *     `impactAck` mit 409 abgewiesen — mit GEGENPROBE (fremder Hash). Danach
 *     stehen die Abhängigen in der Warteschlange, und „Gilt weiter"
 *     (`restamp`) holt GENAU EINE davon zurück, ohne ihren Wert anzufassen.
 * 16. EINGRENZUNG: wird das Feld erneut bestätigt, läuft der Schliess-Aufruf
 *     im `correct`-Modus. Mit `?stub=affected` bleibt genau ein Feld veraltet
 *     und bekommt seinen Befund; der Rest wird neu gestempelt.
 * 17. INVARIANTEN: `c.final` mit zwei Einträgen ⇒ 409 `invariant_violated`,
 *     dieselben drei Werte in EINER Zeile ⇒ 200 (die Sache zählt, nicht die
 *     Schreibweise — Paket-1-Befund (a)).
 *
 * Seit Paket 7 (BW2 §10) kommen die zwei Zusagen des DOKUMENTS dazu:
 *
 * 18. DAS DOKUMENT: `GET …/document` liefert alle Kapitel des WEGES (die
 *     übersprungenen fehlen), je Kapitel dieselben Blöcke wie die Finale
 *     Abnahme — und `review.unreviewed` nennt genau die bestätigten Sessions
 *     ohne Urteil. Mit GEGENPROBE (eine gegengelesene steht nicht darin).
 * 19. DER PRÜFBLICK: `POST …/review` holt die ungeprüften Sessions nach
 *     (`caughtUp`), hinterlässt mit `?stub=conflict` einen Dokument-Befund und
 *     schweigt beim ZWEITEN Klick auf denselben Stand (`ran: false`) — mit
 *     GEGENPROBE (nach einer neuen Fassung läuft er wieder).
 *
 * Seit Paket 9 (Davids Entscheidung 2026-09-05) kommt die Zusage der SEITEN
 * dazu — die einzige hier, die HTML statt JSON misst:
 *
 * 20. FREMD ODER UNBEKANNT ⇒ 404: die WERKSTATT (`/de/brand/:id/:step`) und
 *     ihre Abnahme-Ansicht (`?s=acceptance`) antworten ohne Anmeldung, mit
 *     einem fremden Konto und für eine erfundene Profil-Id mit HTTP 404 statt
 *     einer Hülle „Namenloses Branding" mit 200; der Besitzer bekommt seine
 *     Seite. Mit zwei GEGENPROBEN: ein GESPERRTER Baustein bleibt die ruhige
 *     Fläche (200 — er ist erklärbar), und dieselbe Regel gilt für das
 *     Dokument (Paket 8).
 *
 * Seit Brand Book & Kit K5 (§2.2–§2.4) kommen die drei WERKSTATT-KAPITEL der
 * dritten Schicht dazu. Sie stehen als DREI Zusagen und nicht als eine, weil
 * sie drei verschiedene Dinge belegen — eine Auskunft, eine Sperre und eine
 * Reise-Regel:
 *
 * 31. DIE WERKSTATT-QUELLEN: `GET …/kit/workshop` liefert dem Besitzer die
 *     vier puren Quellen (Kontakt-Vorlagen, `a.facts`-Einträge, drei
 *     Prompt-Vorlagen, Pressekit-Vorschau) mit `private, no-store`. Die
 *     Vorlage „Konto-Inhaber" ist immer dabei und trägt NIE eine
 *     Telefonnummer. Fremdes Konto ⇒ 404 (Datentür), ohne Freischaltung ⇒ 403
 *     `derivation_locked` — beide mit GEGENPROBE am freigeschalteten
 *     Eigentümer.
 * 32. DIE REISE-REGEL DER FAKTEN (§2.12 Nr. 2): `a.facts` steht ROH in KEINER
 *     Kit-Datei — weder in `brand.md` noch in `brand.json`. Nur die in
 *     `p.facts` gewählten Einträge reisen. Mit GEGENPROBE: der gewählte
 *     Eintrag steht wirklich drin, sonst wäre der Beweis auch ohne `p.facts`
 *     grün.
 * 33. WER ENTWIRFT UND WER NICHT: `POST …/aiguide/generate` auf `n.scope`
 *     antwortet 400 `slot_not_generated` (eine Katalog-Wahl hat keinen
 *     Entwurf), `m.patterns` OHNE `m.types` antwortet 409 `not_ready` — und
 *     mit gewählten Typen läuft derselbe Aufruf durch. Otto und Nika hängen
 *     dabei am gewöhnlichen Slot-Eimer; ein eigener Eimer entsteht nicht
 *     (§2.11).
 *
 * Seit Brand Design D2b (§2.2 Schritt 3) kommen die Zusagen der LESUNG dazu:
 *
 * 23. DER LAUF: `POST …/inspiration/read` liest alle Vorbilder, schreibt je
 *     Bild eine geklemmte Lesung (Vokabular-Ids, Urteil, Foundation-Anker,
 *     Begründung), legt Fazit und Lauf-Zeile als Slot-Wert von `g.reading` ab
 *     (unbestätigt) und nennt das Rest-Kontingent. Der VIERTE Lauf am selben
 *     Tag ⇒ 429; ein neues oder ein entferntes Bild macht die Lesung `stale`;
 *     ohne Vorbild ⇒ 409; fremdes Konto ⇒ 404; und der Schnappschuss trägt
 *     die Lesung NICHT — mit Anlauf (der Slot wird von Hand bestätigt).
 *     Er braucht `BRAND_DEV_STUB_VISION=1`, sonst kostete jeder Lauf Geld;
 *     ohne die Variable prüft der Abschnitt stattdessen die 503
 *     `vision_unavailable`.
 *
 * Seit Brand Design D2c (§2.2 Schritte 4–5) kommt der DNA-VORSCHLAG dazu:
 *
 * 24. DER VORSCHLAG: `POST …/dna/propose` schreibt zehn geklemmte Zeilen als
 *     Slot-Wert von `g.dna` (unbestätigt) und nennt das Rest-Kontingent. Auf
 *     dem Weg „Frida schlägt vor" ist `g.dna` OFFEN, obwohl es nie eine Lesung
 *     gab (die bedingte Quelle, `conditionalInputCounts`) und jede Zeile trägt
 *     `foundation` — mit GEGENPROBE: mit Vorbildern wartet dieselbe Session
 *     wieder. Mit Lesung trägt mindestens eine Zeile `both` samt Vorbild-Satz,
 *     und KEINE trägt `inspiration` allein. Danach ist das Kapitel bis zur
 *     Abnahme durchlaufbar und `color` geht auf; der Schnappschuss trägt die
 *     DNA, aber weder Lesung noch Vorbilder noch den Board-Vorrat.
 *     Er braucht `BRAND_DEV_STUB_DNA=1`, sonst kostete jeder Lauf Geld; ohne
 *     die Variable prüft der Abschnitt stattdessen die 503 `dna_unavailable`.
 *
 * Seit Brand Design D5a/D5b (§2.5 Stufen 1 und 2) kommt das ZEICHEN dazu:
 *
 * 27. RICHTUNG, BRIEFING, SETZUNGEN: die Bühne von `mark` bekommt DNA,
 *     Farbwelt UND Schriftpaar aus drei fremden Kapiteln; die Seite liefert
 *     die gesetzte Wortmarke als SVG mit den BESTÄTIGTEN Farben, der
 *     bestätigten Schrift und den bestätigten Schrift-Regeln aus (nicht nur
 *     Namen). Eine erfundene Richtung ⇒ 409 `invariant_violated`, dieselbe
 *     Antwort für eine erfundene Setzungs-Wahl. `POST …/mark/brief` schreibt
 *     sechs Blöcke als unbestätigten Slot-Wert von `j.brief` und nennt das
 *     Rest-Kontingent — die ZWEI gerechneten Blöcke (Schutzraum, Varianten)
 *     stehen dabei wörtlich so da, wie die Regel sie rechnet, egal was der
 *     Lauf geantwortet hat. Fremdes Konto ⇒ 404. Danach ist das Kapitel bis
 *     zur Abnahme durchlaufbar und `imagery` geht auf.
 *     Er braucht `BRAND_DEV_STUB_MARK=1`, sonst kostete jeder Lauf Geld; ohne
 *     die Variable prüft der Abschnitt stattdessen die 503
 *     `mark_brief_unavailable`.
 *
 * Seit Brand Design D6 (§2.6) kommt die BILDSPRACHE dazu:
 *
 * 28. PRINZIP, ILLUSTRATION, ICONS, DO & DON'T: die Bühne von `imagery`
 *     bekommt Farbwelt UND Schriftpaar aus zwei fremden Kapiteln; die Seite
 *     zeichnet die drei Prinzip-Skizzen AUS der bestätigten Farbwelt (kein
 *     `img`, kein Bild-Pfad — §1.4) und markiert genau das Prinzip, das die
 *     DNA-Bildwelt vorgibt. Die Strichstärke jedes Icon-Satzes steht als
 *     echtes `stroke-width` im Dokument, die Regel dazu nennt Zahl und
 *     Schriftfamilie — und sie SPERRT nichts: ein zu kräftiger Satz lässt sich
 *     bestätigen und bekommt trotzdem seinen Hinweis. Ein anderes Prinzip
 *     dreht das Do & Don't mit (mit GEGENPROBE: die alten Zeilen sind weg).
 *     Eine erfundene Icon- oder Illustrations-Wahl ⇒ 409
 *     `invariant_violated`. Danach ist das Kapitel bis zur Abnahme
 *     durchlaufbar und `motion` geht auf. KEIN Stub nötig: dieses Kapitel
 *     rechnet jeden seiner vier Werte.
 *
 * ── WAS DIESER BEWEIS NICHT BEWEIST ──────────────────────────────────────
 * Den Anbieter. Ohne `NUXT_AI_KEY` wirft `aiCompleteStream` (503), die Route
 * schickt `generation.failed` mit `provider_error` — und genau das ist hier
 * unwichtig: geprüft wird, was VOR und NEBEN dem Modell passiert (Sperren,
 * Schlüssel, Ablage). Wo ein Zug des Beraters gebraucht wird (Zusage 1 und 4),
 * legt das Skript ihn selbst an, statt ihn zu erwürfeln.
 *
 * ── VORBEDINGUNGEN ───────────────────────────────────────────────────────
 * Lokale Dev-Appwrite mit den `brand_*`-Tabellen (Migration bis brand-013)
 * und ein Dev-Server der branding-App AUS DEM WORKTREE. Einen Seed für den
 * brand-Layer gibt es nicht — dieses Skript legt Konto, Beta-Zugang und
 * Branding selbst an und räumt am Ende alles weg (auch `app_config`, falls es
 * das KI-Flag umstellen musste).
 *
 * Der Dev-Server braucht seit Paket 4 den ERSATZ-SPEZIALISTEN, sonst gäbe es
 * ohne KI-Schlüssel kein Urteil (fail-soft, §7) — `BRAND_DEV_STUB_REVIEW=1`
 * schaltet ihn ein und wirkt NUR dort (`server/utils/brandReview.ts`):
 *
 *   BRAND_DEV_STUB_REVIEW=1 BRAND_DEV_STUB_VISION=1 BRAND_DEV_STUB_DNA=1 \
 *     BRAND_DEV_STUB_MARK=1 BRAND_DEV_STUB_IMAGE=1 \
 *     pnpm --filter branding exec nuxi dev --port 3016
 *   BRANDING_PORT=3016 node --env-file=apps/branding/.env \
 *     packages/brand/scripts/verify-brand-sessions.mjs
 */
import { createHash, randomBytes } from 'node:crypto'
import { request } from 'node:http'
import { Client, ID, Query, Storage, TablesDB, Users } from 'node-appwrite'
import { InputFile } from 'node-appwrite/file'

const PORT = Number(process.env.BRANDING_PORT || 3016)
const HOST = process.env.BRANDING_HOST || 'localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const projectId = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const databaseId = process.env.NUXT_PUBLIC_APPWRITE_DATABASE_ID
const apiKey = process.env.NUXT_APPWRITE_MIGRATIONS_KEY || process.env.NUXT_APPWRITE_KEY

if (!endpoint || !projectId || !databaseId || !apiKey) {
  console.error('✗ Env unvollständig — Aufruf mit --env-file=apps/branding/.env')
  process.exit(1)
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
const tablesDB = new TablesDB(client)
const storage = new Storage(client)
const users = new Users(client)

let pass = 0
let fail = 0
const cleanup = { users: [], profiles: [], access: [], messages: [], inspiration: [], drafts: [], aiFlag: null }

function check(label, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`  ✔ ${label}`)
  }
  else {
    fail++
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/**
 * Nitro hört auf `[::1]`; Node's `fetch` verwirft einen eigenen Host-Header
 * (CLAUDE.md, „Beweise"). Deshalb node:http über ::1 mit gesetztem Host.
 */
function call(path, { method = 'GET', body, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host: HOST,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* SSE oder HTML */ }
        resolve({
          status: res.statusCode,
          contentType: String(res.headers['content-type'] ?? ''),
          json,
          text,
        })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/**
 * DERSELBE WEG WIE `call`, nur mit einem multipart-Rumpf — gebraucht von
 * Zusage 22 (Vorbild-Upload). Er wird VON HAND gebaut und nicht über
 * `FormData`: Node's `fetch` scheidet hier aus (es verwirft einen eigenen
 * Host-Header, s. Kopf von `call`), und `node:http` nimmt nur Bytes.
 *
 * `file: null` schickt KEIN Dateifeld — genau das braucht die Gegenprobe
 * „Datei fehlt".
 */
function callUpload(path, { method = 'POST', fields = {}, file = null, cookie } = {}) {
  const boundary = `----pukalani${Math.random().toString(16).slice(2)}`
  const parts = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    ))
  }
  if (file) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n`
      + `Content-Type: ${file.type}\r\n\r\n`,
    ))
    parts.push(file.data)
    parts.push(Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  const payload = Buffer.concat(parts)

  return new Promise((resolve, reject) => {
    const req = request({
      host: '::1',
      port: PORT,
      path,
      method,
      headers: {
        host: HOST,
        'content-type': `multipart/form-data; boundary=${boundary}`,
        'content-length': payload.length,
        ...(cookie ? { cookie } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* kein JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, json, text })
      })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

/**
 * Ein Bild-Abruf, der die BYTES behält — `call` sammelt Text und macht aus
 * einem PNG Unsinn. Gebraucht für „das Bild kommt beim Besitzer wirklich an".
 */
function callBinary(path, { cookie } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({
      host: '::1', port: PORT, path, method: 'GET',
      headers: { host: HOST, ...(cookie ? { cookie } : {}) },
    }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * DIE ZEHN DIMENSIONEN DER VISUAL DNA (Brand Design D2c) — als Liste, damit
 * Abschnitt 24 die Antwort des Laufs gegen den KATALOG prüfen kann und nicht
 * gegen sich selbst (Beweis-Regel 1: Erwartungswerte nie aus der geprüften
 * Antwort ableiten).
 *
 * Abgeschrieben aus `shared/brandDesignVocab.ts` statt importiert: die Datei
 * hat relative Importe ohne Endung, und Node löst die aus einem `.mjs` heraus
 * nicht auf (dieselbe Grenze, die `verify-market-report.mjs` in seinem Kopf
 * beschreibt). Läuft sie auseinander, wird dieser Abschnitt rot — das ist der
 * gewollte Wächter, kein stiller Durchlauf.
 */
const DNA_DIMENSIONS = [
  'style', 'era', 'form', 'typography', 'color',
  'imagery', 'composition', 'materiality', 'motion', 'mood',
]

/**
 * DREI ECHTE BILDER — 1 × 1 Pixel, je Format. Sie stehen hier als Bytes und
 * nicht als Datei im Repo: der Beweis soll ohne Anhänge laufen, und die
 * Magic-Bytes sind genau das, was geprüft wird.
 */
const TINY = {
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  ),
  jpg: Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwc'
    + 'KDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAA'
    + 'AAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64',
  ),
  webp: Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64'),
}

/**
 * EIN NEUES DROSSEL-FENSTER ABWARTEN. `05.rate-limit.ts` zählt je IP und
 * Minute (`WINDOW_MS`); der Eimer `brand:inspiration` lässt 12 Schreibvorgänge
 * durch, und dieser Beweis braucht mehr. Gewartet wird deshalb EINMAL, an der
 * Stelle, an der es sonst 429 statt der fachlichen Antwort gäbe — die Drossel
 * abzuschalten hiesse, sie nicht mehr zu beweisen.
 */
function waitForRateWindow() {
  return new Promise(resolve => setTimeout(resolve, 62_000))
}

const stamp = Date.now()

/**
 * Ein Konto MIT Beta-Zugang. `tag` trennt die Adressen: Zusage 20 braucht ein
 * ZWEITES Konto, das ebenfalls Zugang hat — nur so beweist ein 404 dort den
 * BESITZ und nicht bloss das geschlossene Tor.
 */
async function makeAccount(tag = 'owner', { labels } = {}) {
  const user = await users.create({
    userId: ID.unique(),
    email: `bw2-sessions-${stamp}-${tag}@example.test`,
    password: `Pw-${ID.unique()}`,
    name: 'BW2-Sessions-Beweis',
  })
  cleanup.users.push(user.$id)
  // Der Zugang hängt an einer verifizierten Adresse (`decideBrandAccess`).
  await users.updateEmailVerification({ userId: user.$id, emailVerification: true })
  // `labels: ['admin']` macht daraus einen BETREIBER (`users.manage` liegt im
  // Wildcard der admin-Rolle) — gebraucht von Zusage 21, wo eine
  // Betreiber-Handlung geprüft wird. Ohne das Argument bleibt es ein
  // gewöhnliches Beta-Konto, und genau das ist die Gegenprobe.
  if (labels) await users.updateLabels({ userId: user.$id, labels })
  const access = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_access',
    rowId: ID.unique(),
    data: { userId: user.$id, grantedVia: 'operator', inviteId: '', revokedAt: null },
  })
  cleanup.access.push(access.$id)
  const session = await users.createSession({ userId: user.$id })
  return { id: user.$id, cookie: `a_session_${projectId}=${encodeURIComponent(session.secret)}` }
}

/** Die KI muss AN sein, sonst antwortet die Route `{ conversed: false }`. */
async function ensureAiEnabled() {
  let row = null
  try {
    row = await tablesDB.getRow({ databaseId, tableId: 'app_config', rowId: 'global' })
  }
  catch { /* keine Zeile */ }
  if (row?.brandAiEnabled === true) return
  cleanup.aiFlag = row ? { existed: true, before: row.brandAiEnabled ?? null } : { existed: false }
  if (row) {
    await tablesDB.updateRow({
      databaseId, tableId: 'app_config', rowId: 'global', data: { brandAiEnabled: true },
    })
  }
  else {
    await tablesDB.createRow({
      databaseId, tableId: 'app_config', rowId: 'global', data: { brandAiEnabled: true },
    })
  }
}

/** Eine Verlaufs-Zeile von Hand — der Beweis darf kein Modell brauchen. */
async function seedMessage(profileId, stepKey, sessionKey, role, body) {
  const row = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_messages',
    rowId: ID.unique(),
    data: { profileId, stepKey, sessionKey, role, body, parts: '', generationId: '' },
  })
  cleanup.messages.push(row.$id)
  return row.$id
}

/** Slots einer Kapitel-Zeile setzen — ohne die Route, damit nichts verdeckt wird. */
async function setSlots(profileId, stepKey, slots) {
  await tablesDB.updateRow({
    databaseId,
    tableId: 'brand_steps',
    rowId: `${profileId}_${stepKey}`,
    data: { slots: JSON.stringify(slots) },
  })
}

async function setStepState(profileId, stepKey, state) {
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_${stepKey}`, data: { state },
  })
}

/** Die Fassung einer Kapitel-Zeile bewegen — ohne Route, für die Gegenprobe zu 14. */
async function bumpRevision(profileId, stepKey, revision) {
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_${stepKey}`, data: { revision },
  })
}

try {
  await ensureAiEnabled()
  const account = await makeAccount()

  const created = await call('/api/brand/profiles', {
    method: 'POST',
    cookie: account.cookie,
    body: {
      title: 'Kailua Coffee',
      contentLocale: 'de',
      pathKind: 'new',
      hasName: true,
      team: 'solo',
      industry: 'Kaffeerösterei',
      about: 'Wir rösten Kaffee in kleinen Mengen.',
      audience: 'Cafés auf Maui.',
    },
  })
  if (created.status !== 201 && created.status !== 200) {
    console.error(`✗ Branding konnte nicht angelegt werden (${created.status}): ${created.text.slice(0, 300)}`)
    process.exit(1)
  }
  const profileId = created.json?.profile?.id ?? created.json?.id
  if (!profileId) {
    console.error(`✗ Keine Profil-Id in der Antwort: ${created.text.slice(0, 300)}`)
    process.exit(1)
  }
  cleanup.profiles.push(profileId)
  const base = `/api/brand/profiles/${profileId}`

  console.log('\n1 · Der Eröffnungszug ist idempotent')
  const opening = await call(`${base}/steps/context/converse`, {
    method: 'POST',
    cookie: account.cookie,
    body: { opening: true, sessionKey: 'a.origin' },
  })
  check('erster Eröffnungszug ⇒ 200 mit Strom', opening.status === 200
    && opening.contentType.includes('text/event-stream'),
  `${opening.status} ${opening.contentType}`)

  // Ohne Anbieter-Schlüssel schreibt die Route keine Berater-Zeile (der Zug
  // endet als `provider_error`). Für die Idempotenz zählt genau diese Zeile —
  // also legt der Beweis sie an, statt sie zu erwürfeln.
  await seedMessage(profileId, 'context', 'a.origin', 'george', 'Womit fangen wir an?')

  const again = await call(`${base}/steps/context/converse`, {
    method: 'POST',
    cookie: account.cookie,
    body: { opening: true, sessionKey: 'a.origin' },
  })
  check('zweiter Eröffnungszug ⇒ skipped statt zweitem Zug',
    again.status === 200 && again.json?.skipped === true && again.json?.conversed === false,
    `${again.status} ${again.text.slice(0, 120)}`)
  check('… und ohne Strom', !again.contentType.includes('text/event-stream'), again.contentType)

  console.log('\n2 · Eine Session gehört ihrem Kapitel')
  const foreign = await call(`${base}/steps/context/converse`, {
    method: 'POST',
    cookie: account.cookie,
    body: { text: 'Wir haben 2019 angefangen.', sessionKey: 'b.purpose' },
  })
  check('fremde Session ⇒ 400 session_foreign',
    foreign.status === 400 && foreign.json?.reason === 'session_foreign',
    `${foreign.status} ${foreign.text.slice(0, 160)}`)

  const unknown = await call(`${base}/steps/context/converse`, {
    method: 'POST',
    cookie: account.cookie,
    body: { text: 'Wir haben 2019 angefangen.', sessionKey: 'a.erfunden' },
  })
  check('unbekannte Session ⇒ dieselbe Antwort',
    unknown.status === 400 && unknown.json?.reason === 'session_foreign',
    `${unknown.status}`)

  console.log('\n3 · Eine gesperrte Session ist nicht besprechbar')
  // Damit der BAUSTEIN erreichbar ist (sonst käme 403 aus der Journey), sind
  // seine Vorgänger abgeschlossen; `c.candidates` liest sieben bestätigte
  // Felder, von denen keines steht.
  for (const stepKey of ['context', 'pvm', 'architecture']) {
    await setStepState(profileId, stepKey, 'done')
  }
  const locked = await call(`${base}/steps/values/converse`, {
    method: 'POST',
    cookie: account.cookie,
    body: { text: 'Verlässlichkeit, glaube ich.', sessionKey: 'c.candidates' },
  })
  check('gesperrte Session ⇒ 409 session_locked',
    locked.status === 409 && locked.json?.reason === 'session_locked',
    `${locked.status} ${locked.text.slice(0, 160)}`)
  for (const stepKey of ['context', 'pvm', 'architecture']) {
    await setStepState(profileId, stepKey, 'open')
  }

  console.log('\n4 · Der Verlauf hängt an der Session')
  await seedMessage(profileId, 'context', 'a.customerPraise', 'user', 'Sie loben die Röstung.')
  await seedMessage(profileId, 'context', '', 'user', 'Alter Kapitel-Zug ohne Session.')

  const ownThread = await call(`${base}/messages?stepKey=context&session=a.customerPraise`, {
    cookie: account.cookie,
  })
  const ownBodies = (ownThread.json?.messages ?? []).map(entry => entry.body)
  check('`?session=` liefert genau diesen Faden',
    ownThread.status === 200 && ownBodies.length === 1 && ownBodies[0] === 'Sie loben die Röstung.',
    `${ownThread.status} ${JSON.stringify(ownBodies)}`)
  check('jede Zeile trägt ihren Schlüssel',
    (ownThread.json?.messages ?? []).every(entry => typeof entry.sessionKey === 'string'),
    JSON.stringify(ownThread.json?.messages?.[0] ?? null))

  const wholeChapter = await call(`${base}/messages?stepKey=context`, { cookie: account.cookie })
  check('ohne `?session=` kommt das ganze Kapitel',
    (wholeChapter.json?.messages ?? []).length === 3,
    String((wholeChapter.json?.messages ?? []).length))

  console.log('\n5 · Bestand: der leere Schlüssel gehört der ERSTEN Session')
  // `a.pitch` ist die erste Session des Kapitels — ihr Prompt-Fenster nimmt
  // die Alt-Zeile mit. Nachweisbar an der Leseroute ist die REGEL nicht (die
  // filtert exakt), also wird sie an der Ablage geprüft: die Alt-Zeile trägt
  // wirklich '' und keine erfundene Id.
  const legacy = (wholeChapter.json?.messages ?? [])
    .find(entry => entry.body === 'Alter Kapitel-Zug ohne Session.')
  check('die Alt-Zeile trägt den LEEREN Schlüssel', legacy?.sessionKey === '',
    JSON.stringify(legacy ?? null))
  const firstThread = await call(`${base}/messages?stepKey=context&session=a.pitch`, {
    cookie: account.cookie,
  })
  check('GEGENPROBE: die Leseroute filtert EXAKT (kein Alt-Zug bei a.pitch)',
    (firstThread.json?.messages ?? []).length === 0,
    String((firstThread.json?.messages ?? []).length))

  console.log('\n6 · Die Sammel-Session schreibt EINEN Wert aus drei Teilen')
  const parts = ['3 fest, 2 auf Saison', '2021', 'Landkreis und Wochenmarkt']
  for (const [index, text] of parts.entries()) {
    const turn = await call(`${base}/steps/context/converse`, {
      method: 'POST',
      cookie: account.cookie,
      body: { text, sessionKey: 'a.facts' },
    })
    check(`Teil ${index + 1} angenommen`, turn.status === 200, String(turn.status))
    const detail = await call(`${base}/steps/context`, { cookie: account.cookie })
    const collected = detail.json?.sessions?.['a.facts']?.collected ?? {}
    check(`… ${index + 1} Teil(e) gesammelt`, Object.keys(collected).length === index + 1,
      JSON.stringify(collected))
    const value = detail.json?.slots?.['a.facts']?.latestDraft ?? null
    if (index < parts.length - 1) {
      check('… und noch KEIN Wert', value === null, String(value))
    }
    else {
      check('… nach dem letzten Teil steht der Wert', value === [
        '## Team', '3 fest, 2 auf Saison', '',
        '## Seit', '2021', '',
        '## Märkte', 'Landkreis und Wochenmarkt',
      ].join('\n'), JSON.stringify(value))
      check('… als unbestätigter Entwurf',
        detail.json?.slots?.['a.facts']?.confirmed === null,
        JSON.stringify(detail.json?.slots?.['a.facts'] ?? null))
    }
  }

  console.log('\n7 · Der Baustein liefert den Stand JE Session')
  await setSlots(profileId, 'context', {})
  const detail = await call(`${base}/steps/context`, { cookie: account.cookie })
  const sessions = detail.json?.sessions ?? {}
  check('jede Session des Kapitels steht drin',
    Object.keys(sessions).length === 11, String(Object.keys(sessions).length))
  check('a.origin ist offen (keine Slot-Eingaben)', sessions['a.origin']?.state === 'open',
    JSON.stringify(sessions['a.origin'] ?? null))
  check('Umfang, Vertraulichkeit und Arbeitsform reisen mit',
    sessions['a.facts']?.kind === 'collect'
    && sessions['a.facts']?.sensitivity === 'internal'
    && typeof sessions['a.facts']?.effort?.minutes === 'number',
    JSON.stringify(sessions['a.facts'] ?? null))
  // 29 Felder in 7 Kapiteln — auch nach Brand Design D0: die Registry zählt
  // seither 55 in 13 (26 Design-Sessions hängen an `c.final`, `d.primary`,
  // `d.toneWords`, `result.direction`), aber der HINWEIS nennt nur erreichbare
  // Kapitel (`affectsView`), und diese Marke ist nicht freigeschaltet.
  check('„wohin fliesst das später" ist gerechnet, nicht gepflegt',
    sessions['a.customerPraise']?.affects?.count === 29
    && (sessions['a.customerPraise']?.affects?.steps ?? []).length === 7,
    JSON.stringify(sessions['a.customerPraise']?.affects ?? null))
  check('GEGENPROBE: ein Feld ganz unten berührt nichts',
    sessions['a.challenge']?.affects?.count === 0,
    JSON.stringify(sessions['a.challenge']?.affects ?? null))

  // ── 8 · Die Finale Abnahme (BW2 §5a, Paket 3b) ────────────────────────
  //
  // Gearbeitet wird im Kapitel `values`: es hat neun Sessions, davon acht
  // Pflicht und eine optionale — genug, damit „Pflicht zählt, optional ohne
  // Wert nicht" auch wirklich etwas beweist.
  console.log('\n8 · Abnehmen: bestätigen, abnehmen, abschliessen')
  for (const stepKey of ['context', 'pvm', 'architecture']) {
    await setStepState(profileId, stepKey, 'done')
  }
  const valuesRequired = [
    'c.discovery1', 'c.discovery2', 'c.discovery3', 'c.candidates',
    'c.final', 'c.definitions', 'c.livedExamples', 'c.conflictRule',
  ]
  await setSlots(profileId, 'values', Object.fromEntries(
    valuesRequired.map(id => [id, { firstDraft: 'steht', latestDraft: 'steht', confirmed: 'steht' }]),
  ))
  await setStepState(profileId, 'values', 'active')

  const valuesBase = `${base}/steps/values`
  let page = await call(`${valuesBase}/acceptance`, { cookie: account.cookie })
  check('die Abnahme-Seite listet jede Session des Kapitels',
    page.status === 200 && (page.json?.sessions ?? []).length === 9,
    `${page.status} ${(page.json?.sessions ?? []).length}`)
  check('… mit Beispiel in BEIDEN Sprachen und der Frage „wohin fliesst das"',
    (page.json?.sessions ?? []).every(entry => Array.isArray(entry.example?.de)
      && Array.isArray(entry.example?.en)
      && typeof entry.affects?.count === 'number'),
    JSON.stringify((page.json?.sessions ?? [])[0] ?? null))
  check('… und sagt: bestätigt ist NICHT abgenommen',
    page.json?.acceptance?.ready === false
    && page.json?.acceptance?.accepted === 0
    && page.json?.acceptance?.total === 8
    && (page.json?.acceptance?.blockers ?? []).every(b => b.reason === 'unaccepted'),
    JSON.stringify(page.json?.acceptance ?? null))

  const tooEarly = await call(`${valuesBase}/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('GEGENPROBE: `complete` weist ohne Abnahme mit `acceptance_incomplete` ab',
    tooEarly.status === 400 && tooEarly.json?.reason === 'acceptance_incomplete',
    `${tooEarly.status} ${tooEarly.text.slice(0, 160)}`)

  let revision = page.json?.revision ?? 0
  for (const slotId of valuesRequired) {
    const taken = await call(`${valuesBase}/sessions/${slotId}/accept`, {
      method: 'POST', cookie: account.cookie, body: { revision },
    })
    if (taken.status !== 200) {
      check(`Abnahme ${slotId}`, false, `${taken.status} ${taken.text.slice(0, 160)}`)
      break
    }
    revision = taken.json?.revision ?? revision
  }
  check('alle acht Pflicht-Sessions abgenommen ⇒ ready', await (async () => {
    page = await call(`${valuesBase}/acceptance`, { cookie: account.cookie })
    return page.json?.acceptance?.ready === true && page.json?.acceptance?.accepted === 8
  })(), JSON.stringify(page.json?.acceptance ?? null))

  const unknownSession = await call(`${valuesBase}/sessions/a.pitch/accept`, {
    method: 'POST', cookie: account.cookie, body: { revision },
  })
  check('GEGENPROBE: eine fremde Session gibt es an dieser Adresse nicht (404)',
    unknownSession.status === 404, String(unknownSession.status))

  const deferNotAllowed = await call(`${valuesBase}/sessions/c.final/defer`, {
    method: 'POST', cookie: account.cookie, body: { revision },
  })
  check('GEGENPROBE: vertagen nur, wo die Session es erlaubt',
    deferNotAllowed.status === 400 && deferNotAllowed.json?.reason === 'defer_not_allowed',
    `${deferNotAllowed.status} ${deferNotAllowed.text.slice(0, 160)}`)

  const completed = await call(`${valuesBase}/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('… und JETZT schliesst das Kapitel ab',
    completed.status === 200 && completed.json?.storedState === 'done',
    `${completed.status} ${completed.text.slice(0, 160)}`)

  // ── 9 · Was „Nochmal von vorn" kostet ────────────────────────────────
  console.log('\n9 · Die Restart-Hülle wächst mit den späteren Kapiteln')
  let impact = await call(`${valuesBase}/restart-impact`, { cookie: account.cookie })
  check('ohne bestätigte spätere Kapitel berührt der Restart nichts',
    impact.status === 200 && impact.json?.downstream?.count === 0,
    `${impact.status} ${JSON.stringify(impact.json?.downstream ?? null)}`)
  check('… zählt aber, was IM Kapitel verloren geht',
    impact.json?.chapter?.values === 8 && impact.json?.chapter?.accepted === 8,
    JSON.stringify(impact.json?.chapter ?? null))

  // `d.voiceSamples` schöpft aus `c.final` — bestätigt MIT dem Quellen-Hash,
  // den der Autosave stempelt (sonst wäre der `stale`-Beweis unten wertlos).
  await setStepState(profileId, 'archetype', 'active')
  const voiceValue = 'Ein Satz, wie die Marke klingt.'
  const voicePatch = await call(`${base}/steps/archetype`, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: 0, slots: { 'd.voiceSamples': { value: voiceValue, confirmed: true } } },
  })
  check('eine Session des SPÄTEREN Kapitels ist bestätigt', voicePatch.status === 200,
    `${voicePatch.status} ${voicePatch.text.slice(0, 160)}`)
  // Das spätere Kapitel wird ABGESCHLOSSEN gesetzt: ein gespeichertes `done`
  // bleibt betretbar, auch wenn sein Vorgänger nach dem Restart wieder offen
  // ist („zurück ist immer erlaubt", brandJourney.ts) — nur so ist der
  // `stale`-Nachweis unten überhaupt lesbar.
  await setStepState(profileId, 'archetype', 'done')

  const archetypeBefore = await call(`${base}/steps/archetype`, { cookie: account.cookie })
  check('… und steht auf `done` (ihr Quellen-Hash passt zum Stand)',
    archetypeBefore.json?.sessions?.['d.voiceSamples']?.state === 'done',
    JSON.stringify(archetypeBefore.json?.sessions?.['d.voiceSamples'] ?? null))

  impact = await call(`${valuesBase}/restart-impact`, { cookie: account.cookie })
  check('jetzt meldet die Hülle das spätere Feld',
    impact.json?.downstream?.count > 0
    && (impact.json?.downstream?.byStep?.archetype ?? []).includes('d.voiceSamples'),
    JSON.stringify(impact.json?.downstream ?? null))

  // ── 10/11 · Der Schutz und der Neubeginn ─────────────────────────────
  console.log('\n10 · „Nochmal von vorn" braucht eine Bestätigung')
  await seedMessage(profileId, 'values', 'c.discovery1', 'george', 'Wovon erzählst du?')
  const before = await call(`${base}/messages?stepKey=values&session=c.discovery1`, {
    cookie: account.cookie,
  })
  check('der Verlauf des Kapitels ist da', (before.json?.messages ?? []).length === 1,
    String((before.json?.messages ?? []).length))

  const restartRevision = impact.json?.revision ?? 0
  const noAck = await call(`${valuesBase}/restart`, {
    method: 'POST',
    cookie: account.cookie,
    body: { revision: restartRevision, acknowledge: false, impactAck: impact.json?.ack ?? '' },
  })
  check('ohne `acknowledge` ⇒ 409 restart_unacknowledged',
    noAck.status === 409 && noAck.json?.reason === 'restart_unacknowledged',
    `${noAck.status} ${noAck.text.slice(0, 160)}`)

  const staleAck = await call(`${valuesBase}/restart`, {
    method: 'POST',
    cookie: account.cookie,
    body: { revision: restartRevision, acknowledge: true, impactAck: 'stand-von-gestern' },
  })
  check('mit falschem Ack dieselbe Abweisung',
    staleAck.status === 409 && staleAck.json?.reason === 'restart_unacknowledged',
    `${staleAck.status}`)

  console.log('\n11 · Der Neubeginn: leer, geschnitten, veraltet')
  const restarted = await call(`${valuesBase}/restart`, {
    method: 'POST',
    cookie: account.cookie,
    body: {
      revision: restartRevision,
      acknowledge: true,
      impactAck: impact.json?.ack ?? '',
    },
  })
  check('mit Ack ⇒ 200 und ein Zeitstempel',
    restarted.status === 200 && Boolean(restarted.json?.restartedAt),
    `${restarted.status} ${restarted.text.slice(0, 200)}`)
  check('… und der Wegweiser zeigt auf die erste Session',
    restarted.json?.next?.sessionKey === 'c.discovery1',
    JSON.stringify(restarted.json?.next ?? null))

  const afterDetail = await call(`${base}/steps/values`, { cookie: account.cookie })
  check('die Slots des Kapitels sind leer',
    Object.keys(afterDetail.json?.slots ?? {}).length === 0,
    JSON.stringify(Object.keys(afterDetail.json?.slots ?? {})))
  check('… der Zustand ist wieder `active`, ohne Konfidenz',
    afterDetail.json?.storedState === 'active' && afterDetail.json?.confidence === null,
    `${afterDetail.json?.storedState} / ${afterDetail.json?.confidence}`)
  // Appwrite normalisiert den Zeitstempel beim Speichern (`+00:00` statt `Z`)
  // — verglichen wird deshalb der ZEITPUNKT, nicht die Schreibweise.
  check('… und `restartedAt` steht in der Antwort',
    new Date(afterDetail.json?.restartedAt ?? 0).getTime()
    === new Date(restarted.json?.restartedAt ?? 1).getTime(),
    `${afterDetail.json?.restartedAt} vs ${restarted.json?.restartedAt}`)

  const afterMessages = await call(`${base}/messages?stepKey=values&session=c.discovery1`, {
    cookie: account.cookie,
  })
  check('der Verlauf des Kapitels ist abgeschnitten',
    (afterMessages.json?.messages ?? []).length === 0,
    String((afterMessages.json?.messages ?? []).length))
  const otherChapter = await call(`${base}/messages?stepKey=context`, { cookie: account.cookie })
  check('GEGENPROBE: ein ANDERES Kapitel behält seinen Verlauf',
    (otherChapter.json?.messages ?? []).length > 0,
    String((otherChapter.json?.messages ?? []).length))

  const events = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_events',
    queries: [Query.equal('profileId', profileId), Query.equal('type', 'step.restarted'), Query.limit(5)],
  })
  check('der Schnappschuss liegt als Ereignis vor', events.rows.length === 1,
    String(events.rows.length))
  const payload = events.rows[0] ? JSON.parse(events.rows[0].payload || '{}') : {}
  check('… und trägt den Stand VOR dem Löschen',
    payload.stepKey === 'values' && payload.values === 8 && payload.accepted === 8,
    JSON.stringify(payload).slice(0, 200))

  const archetypeAfter = await call(`${base}/steps/archetype`, { cookie: account.cookie })
  check('die abhängige Session des SPÄTEREN Kapitels ist jetzt `stale`',
    archetypeAfter.json?.sessions?.['d.voiceSamples']?.state === 'stale',
    JSON.stringify(archetypeAfter.json?.sessions?.['d.voiceSamples'] ?? null))
  check('… und ihr Wert steht unangetastet da (nichts wurde gelöscht)',
    archetypeAfter.json?.slots?.['d.voiceSamples']?.confirmed === voiceValue,
    JSON.stringify(archetypeAfter.json?.slots?.['d.voiceSamples'] ?? null))

  // ── 12 · Der Spezialist beim Schliessen (BW2 Paket 4, §7) ────────────
  console.log('\n12 · Schliessen: Urteil, Notizen und der ADAPTIVE Wegweiser')
  // Nur EIN bestätigtes Feld ⇒ zwei offene Sessions. Nur so lassen sich der
  // Vorschlag des Spezialisten (letzte offene) und die Grundfassung (erste
  // offene) überhaupt auseinanderhalten.
  await setSlots(profileId, 'values', {
    'c.discovery1': { firstDraft: 'steht', latestDraft: 'steht', confirmed: 'steht' },
  })
  let valuesDetail = await call(`${base}/steps/values`, { cookie: account.cookie })
  const closeRevision = valuesDetail.json?.revision ?? 0

  const closed = await call(`${valuesBase}/sessions/c.discovery1/close`, {
    method: 'POST', cookie: account.cookie, body: { revision: closeRevision },
  })
  check('der Schliess-Aufruf läuft und meldet ein Urteil',
    closed.status === 200 && closed.json?.reviewed === true && closed.json?.reviewedBy === 'stage1',
    `${closed.status} ${closed.text.slice(0, 200)}`)
  check('… die Notiz landet an der Session',
    (closed.json?.review?.notes ?? []).length > 0,
    JSON.stringify(closed.json?.review ?? null))
  check('… und der Wegweiser folgt dem Vorschlag, NICHT der Grundfassung',
    closed.json?.next?.sessionKey === 'c.discovery3',
    JSON.stringify(closed.json?.next ?? null))
  check('… die Fassung ist gestiegen', closed.json?.revision === closeRevision + 1,
    `${closed.json?.revision} statt ${closeRevision + 1}`)

  valuesDetail = await call(`${base}/steps/values`, { cookie: account.cookie })
  check('… und die Session trägt `reviewed` samt Notiz',
    valuesDetail.json?.sessions?.['c.discovery1']?.reviewed === true
    && typeof valuesDetail.json?.sessions?.['c.discovery1']?.notes === 'string',
    JSON.stringify(valuesDetail.json?.sessions?.['c.discovery1'] ?? null))

  const closedAgain = await call(`${valuesBase}/sessions/c.discovery1/close`, {
    method: 'POST', cookie: account.cookie, body: { revision: closed.json?.revision ?? 0 },
  })
  check('GEGENPROBE: der zweite Klick bewegt nichts (Idempotenz)',
    closedAgain.status === 200
    && closedAgain.json?.reviewed === true
    && closedAgain.json?.revision === closed.json?.revision,
    `${closedAgain.status} ${closedAgain.json?.revision}`)

  const unconfirmed = await call(`${valuesBase}/sessions/c.discovery2/close`, {
    method: 'POST', cookie: account.cookie, body: { revision: closedAgain.json?.revision ?? 0 },
  })
  check('GEGENPROBE: eine unbestätigte Session ⇒ 409 not_confirmed',
    unconfirmed.status === 409 && unconfirmed.json?.reason === 'not_confirmed',
    `${unconfirmed.status} ${unconfirmed.text.slice(0, 160)}`)

  // ── 13 · Ein offener Konflikt sperrt die Abnahme (§5a Schritt 3) ─────
  console.log('\n13 · Der Konflikt sperrt — und das Ablehnen mit Grund öffnet')
  await setSlots(profileId, 'values', Object.fromEntries(
    valuesRequired.map(id => [id, {
      firstDraft: 'steht', latestDraft: 'steht', confirmed: 'steht', accepted: true,
    }]),
  ))
  await setStepState(profileId, 'values', 'active')

  page = await call(`${valuesBase}/acceptance`, { cookie: account.cookie })
  check('vor dem Befund ist die Abnahme bereit', page.json?.acceptance?.ready === true,
    JSON.stringify(page.json?.acceptance ?? null))

  const withConflict = await call(
    `${valuesBase}/sessions/c.final/close?stub=conflict`,
    { method: 'POST', cookie: account.cookie, body: { revision: page.json?.revision ?? 0 } },
  )
  check('der Schliess-Aufruf legt den Befund an',
    withConflict.status === 200 && (withConflict.json?.findings ?? []).length === 1,
    `${withConflict.status} ${withConflict.text.slice(0, 200)}`)

  page = await call(`${valuesBase}/acceptance`, { cookie: account.cookie })
  check('… und die Abnahme ist gesperrt, mit dem Grund `conflict`',
    page.json?.acceptance?.ready === false
    && (page.json?.acceptance?.blockers ?? []).some(entry => entry.reason === 'conflict'),
    JSON.stringify(page.json?.acceptance ?? null))
  check('… der Chip-Datensatz hängt am Block (Paket 5 rendert ihn)',
    (page.json?.sessions ?? []).some(entry => (entry.findings ?? []).length > 0),
    JSON.stringify((page.json?.sessions ?? []).map(entry => (entry.findings ?? []).length)))

  const blockedComplete = await call(`${valuesBase}/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('… und `complete` weist ab',
    blockedComplete.status === 400 && blockedComplete.json?.reason === 'acceptance_incomplete',
    `${blockedComplete.status} ${blockedComplete.text.slice(0, 160)}`)

  const openFindings = await call(`${base}/findings?status=open`, { cookie: account.cookie })
  check('die Befund-Liste zeigt genau den einen offenen',
    openFindings.status === 200 && (openFindings.json?.findings ?? []).length === 1
    && openFindings.json.findings[0].kind === 'conflict'
    && openFindings.json.findings[0].slots.length === 2,
    `${openFindings.status} ${openFindings.text.slice(0, 200)}`)
  const findingId = openFindings.json?.findings?.[0]?.id
  const sourceSession = openFindings.json?.findings?.[0]?.sourceSession

  const noReason = await call(`${base}/findings/${findingId}`, {
    method: 'POST', cookie: account.cookie, body: { status: 'dismissed' },
  })
  check('GEGENPROBE: ablehnen OHNE Grund wird abgewiesen', noReason.status === 400,
    `${noReason.status} ${noReason.text.slice(0, 160)}`)

  const dismissed = await call(`${base}/findings/${findingId}`, {
    method: 'POST',
    cookie: account.cookie,
    body: { status: 'dismissed', dismissReason: 'Das ist bei uns Absicht.' },
  })
  check('mit Grund geht es — und der Befund ist entschieden',
    dismissed.status === 200 && dismissed.json?.finding?.status === 'dismissed',
    `${dismissed.status} ${dismissed.text.slice(0, 200)}`)

  valuesDetail = await call(`${base}/steps/values`, { cookie: account.cookie })
  check('… der Grund hängt als Notiz an der QUELL-Session',
    (valuesDetail.json?.sessions?.[sourceSession]?.notes ?? '').includes('Das ist bei uns Absicht.'),
    JSON.stringify(valuesDetail.json?.sessions?.[sourceSession] ?? null))

  page = await call(`${valuesBase}/acceptance`, { cookie: account.cookie })
  check('… und die Abnahme ist wieder bereit', page.json?.acceptance?.ready === true,
    JSON.stringify(page.json?.acceptance ?? null))

  // ── 14 · Der Kapitel-Blick läuft einmal je Fassung (§5a) ─────────────
  console.log('\n14 · Der Kapitel-Blick: einmal je Fassung')
  const firstLook = await call(`${valuesBase}/review`, { method: 'POST', cookie: account.cookie })
  check('der erste Blick läuft',
    firstLook.status === 200 && firstLook.json?.reviewed === true,
    `${firstLook.status} ${firstLook.text.slice(0, 200)}`)
  const beforeSecond = (firstLook.json?.findings ?? []).length

  const secondLook = await call(`${valuesBase}/review?stub=conflict`, {
    method: 'POST', cookie: account.cookie,
  })
  check('derselbe Stand wird NICHT ein zweites Mal geprüft',
    secondLook.status === 200 && (secondLook.json?.findings ?? []).length === beforeSecond,
    `${secondLook.status} ${(secondLook.json?.findings ?? []).length} statt ${beforeSecond}`)

  await bumpRevision(profileId, 'values', (secondLook.json?.revision ?? 0) + 1)
  const thirdLook = await call(`${valuesBase}/review?stub=conflict`, {
    method: 'POST', cookie: account.cookie,
  })
  check('GEGENPROBE: eine NEUE Fassung wird wieder geprüft',
    thirdLook.status === 200 && (thirdLook.json?.findings ?? []).length > beforeSecond,
    `${thirdLook.status} ${(thirdLook.json?.findings ?? []).length} statt > ${beforeSecond}`)

  // ── 15 · Die Korrektur-Regel: Hülle, Ack, Warteschlange (Paket 6, §9) ──
  //
  // Der Aufbau ist die halbe Zusage: `a.customerPraise` (Kapitel A) ist die
  // Quelle von `b.mission` (Kapitel B) und `c.candidates` (Kapitel C). Beide
  // werden über die ROUTE bestätigt und nicht von Hand geschrieben — nur so
  // trägt ihre Zeile den `sourcesHash`, den der Server selbst gestempelt hat.
  // Ein von Hand gesetzter Hash bewiese nur, dass zwei Zeichenketten gleich
  // sind. Und zwei KAPITEL, weil das Stempeln über Kapitelgrenzen geht.
  console.log('\n15 · Korrektur: die Hülle, das Ack und die Warteschlange')
  const contextBase = `${base}/steps/context`
  await setStepState(profileId, 'values', 'active')
  // Der Block steht auf EIGENEN Füssen: was die Blöcke davor bestätigt haben,
  // gehörte zu ihren Zusagen und würde hier nur die Hülle vergrössern.
  for (const stepKey of ['context', 'pvm', 'values', 'archetype']) {
    await setSlots(profileId, stepKey, {})
  }

  async function stepRevision(stepKey) {
    const detail = await call(`${base}/steps/${stepKey}`, { cookie: account.cookie })
    return detail.json?.revision ?? 0
  }

  /** Ein Feld über die Route schreiben — mit dem Stempel, den der Server setzt. */
  async function saveVia(stepKey, slots, extra = {}) {
    return call(`${base}/steps/${stepKey}`, {
      method: 'PATCH',
      cookie: account.cookie,
      body: { revision: await stepRevision(stepKey), slots, ...extra },
    })
  }

  await setStepState(profileId, 'context', 'active')
  const praise = await saveVia('context', {
    'a.customerPraise': { value: 'Ihr habt uns nie hängen lassen.', confirmed: true },
  })
  check('die Quelle ist bestätigt und gestempelt', praise.status === 200
    && typeof praise.json?.slots?.['a.customerPraise']?.confirmed === 'string',
  `${praise.status} ${praise.text.slice(0, 160)}`)

  await setStepState(profileId, 'context', 'done')
  await setStepState(profileId, 'pvm', 'active')
  await saveVia('pvm', {
    'b.mission': { value: 'Wir bringen guten Kaffee auf jeden Tisch.', confirmed: true },
  })
  for (const stepKey of ['pvm', 'architecture']) await setStepState(profileId, stepKey, 'done')
  await saveVia('values', {
    'c.candidates': { value: '- Mut\n- Klarheit\n- Geduld\n- Ruhe', confirmed: true },
  })

  let pvmState = await call(`${base}/steps/pvm`, { cookie: account.cookie })
  let valuesState = await call(`${base}/steps/values`, { cookie: account.cookie })
  check('zwei abhängige Felder in ZWEI Kapiteln stehen bestätigt und aktuell',
    pvmState.json?.sessions?.['b.mission']?.state === 'done'
    && valuesState.json?.sessions?.['c.candidates']?.state === 'done',
    JSON.stringify([
      pvmState.json?.sessions?.['b.mission']?.state,
      valuesState.json?.sessions?.['c.candidates']?.state,
    ]))

  const hull = await call(`${contextBase}/sessions/a.customerPraise/impact`, {
    cookie: account.cookie,
  })
  check('die Hülle nennt genau diese beiden',
    hull.status === 200 && hull.json?.count === 2
    && JSON.stringify(hull.json?.transitive) === JSON.stringify(['b.mission', 'c.candidates']),
    `${hull.status} ${hull.text.slice(0, 240)}`)
  check('… je Kapitel eines, und der Ack ist da',
    (hull.json?.byStep?.pvm ?? []).length === 1 && (hull.json?.byStep?.values ?? []).length === 1
    && typeof hull.json?.ack === 'string' && hull.json.ack.length === 64,
    JSON.stringify(hull.json?.byStep ?? null))

  const contextRevision = await stepRevision('context')
  const withoutAck = await call(`${contextBase}`, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: contextRevision, slots: { 'a.customerPraise': { confirmed: false } } },
  })
  check('OHNE Ack: 409 impact_unacknowledged',
    withoutAck.status === 409 && withoutAck.json?.reason === 'impact_unacknowledged',
    `${withoutAck.status} ${withoutAck.text.slice(0, 200)}`)

  const foreignAck = await call(`${contextBase}`, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: contextRevision,
      slots: { 'a.customerPraise': { confirmed: false } },
      impactAck: 'f'.repeat(64),
    },
  })
  check('GEGENPROBE: ein fremder Ack wird ebenso abgewiesen',
    foreignAck.status === 409 && foreignAck.json?.reason === 'impact_unacknowledged',
    `${foreignAck.status}`)

  const corrected = await call(`${contextBase}`, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: contextRevision,
      slots: { 'a.customerPraise': { confirmed: false } },
      impactAck: hull.json?.ack,
    },
  })
  check('MIT Ack geht die Korrektur durch',
    corrected.status === 200 && corrected.json?.slots?.['a.customerPraise']?.confirmed === null,
    `${corrected.status} ${corrected.text.slice(0, 200)}`)

  valuesState = await call(`${base}/steps/values`, { cookie: account.cookie })
  check('das AUFHEBEN allein bewegt noch nichts — der Wortlaut ist ja derselbe',
    valuesState.json?.sessions?.['c.candidates']?.state === 'done',
    JSON.stringify(valuesState.json?.sessions?.['c.candidates'] ?? null))

  // ERST DER NEUE WORTLAUT macht die Abhängigen veraltet: „veraltet" ist eine
  // Aussage über die QUELLE, nicht über einen Knopfdruck.
  const rewritten = await saveVia('context', {
    'a.customerPraise': { value: 'Ihr habt uns nie im Stich gelassen.' },
  })
  check('der neue Wortlaut ist gespeichert', rewritten.status === 200,
    `${rewritten.status} ${rewritten.text.slice(0, 160)}`)

  pvmState = await call(`${base}/steps/pvm`, { cookie: account.cookie })
  valuesState = await call(`${base}/steps/values`, { cookie: account.cookie })
  check('… und beide abhängigen Felder stehen jetzt in der Warteschlange',
    pvmState.json?.sessions?.['b.mission']?.state === 'stale'
    && valuesState.json?.sessions?.['c.candidates']?.state === 'stale',
    JSON.stringify([
      pvmState.json?.sessions?.['b.mission']?.state,
      valuesState.json?.sessions?.['c.candidates']?.state,
    ]))

  const keepValid = await call(`${valuesBase}/sessions/c.candidates/restamp`, {
    method: 'POST',
    cookie: account.cookie,
    body: { revision: valuesState.json?.revision ?? 0 },
  })
  check('„Gilt weiter" stempelt neu', keepValid.status === 200,
    `${keepValid.status} ${keepValid.text.slice(0, 200)}`)

  pvmState = await call(`${base}/steps/pvm`, { cookie: account.cookie })
  valuesState = await call(`${base}/steps/values`, { cookie: account.cookie })
  check('… genau diese eine ist wieder aktuell, die andere bleibt bernstein',
    valuesState.json?.sessions?.['c.candidates']?.state === 'done'
    && pvmState.json?.sessions?.['b.mission']?.state === 'stale',
    JSON.stringify([
      valuesState.json?.sessions?.['c.candidates']?.state,
      pvmState.json?.sessions?.['b.mission']?.state,
    ]))
  check('… und der Wert steht dabei unangetastet da',
    valuesState.json?.slots?.['c.candidates']?.confirmed === '- Mut\n- Klarheit\n- Geduld\n- Ruhe',
    JSON.stringify(valuesState.json?.slots?.['c.candidates'] ?? null))

  // ── 16 · Die Eingrenzung durch den Spezialisten (§9, `correct`) ────────
  console.log('\n16 · Die Eingrenzung: nur das Getroffene bleibt veraltet')
  // Der neue Wortlaut UND die Bestätigung in einem Zug — so sieht das Ende
  // einer Korrektur aus. Beide Abhängigen sind damit wieder veraltet: der
  // eine, weil er nie gestempelt wurde, der andere, weil sich die Quelle ein
  // zweites Mal bewegt hat.
  const reconfirmed = await saveVia('context', {
    'a.customerPraise': { value: 'Ihr wart immer da, wenn es eng wurde.', confirmed: true },
  })
  check('das korrigierte Feld ist wieder bestätigt', reconfirmed.status === 200,
    `${reconfirmed.status} ${reconfirmed.text.slice(0, 160)}`)

  const closedCorrect = await call(
    `${contextBase}/sessions/a.customerPraise/close?stub=affected`,
    { method: 'POST', cookie: account.cookie, body: { revision: reconfirmed.json?.revision ?? 0 } },
  )
  check('der Schliess-Aufruf läuft im Korrektur-Modus und grenzt ein',
    closedCorrect.status === 200
    && JSON.stringify(closedCorrect.json?.correction?.affected) === JSON.stringify(['b.mission'])
    && JSON.stringify(closedCorrect.json?.correction?.restamped) === JSON.stringify(['c.candidates']),
    `${closedCorrect.status} ${JSON.stringify(closedCorrect.json?.correction ?? null)}`)

  pvmState = await call(`${base}/steps/pvm`, { cookie: account.cookie })
  valuesState = await call(`${base}/steps/values`, { cookie: account.cookie })
  check('… genau eine bleibt veraltet, die andere ist wieder fertig',
    pvmState.json?.sessions?.['b.mission']?.state === 'stale'
    && valuesState.json?.sessions?.['c.candidates']?.state === 'done',
    JSON.stringify([
      pvmState.json?.sessions?.['b.mission']?.state,
      valuesState.json?.sessions?.['c.candidates']?.state,
    ]))

  const affectedFindings = await call(`${base}/findings?status=open`, { cookie: account.cookie })
  const affectedFound = (affectedFindings.json?.findings ?? []).filter(entry => entry.kind === 'affected')
  check('… und das getroffene Feld trägt seinen Befund',
    affectedFound.length === 1 && JSON.stringify(affectedFound[0]?.slots) === JSON.stringify(['b.mission']),
    `${affectedFindings.status} ${JSON.stringify(affectedFound).slice(0, 200)}`)

  // ── 17 · Die Invarianten sind scharf (§3a Nr. 6) ──────────────────────
  console.log('\n17 · Die Invariante zählt — und lässt jede Schreibweise gelten')
  const three = await saveVia('values', {
    'c.final': { value: '- Mut\n- Klarheit\n- Geduld', confirmed: true },
  })
  check('drei Werte in `c.final` gehen durch', three.status === 200,
    `${three.status} ${three.text.slice(0, 200)}`)

  const freed = await saveVia('values', { 'c.final': { confirmed: false } })
  check('das Feld ist zum Korrigieren offen (leere Hülle ⇒ kein Ack)',
    freed.status === 200 && freed.json?.slots?.['c.final']?.confirmed === null,
    `${freed.status} ${freed.text.slice(0, 200)}`)

  const tooFew = await saveVia('values', {
    'c.final': { value: '- Mut\n- Klarheit', confirmed: true },
  })
  check('zwei Werte in `c.final` ⇒ 409 invariant_violated',
    tooFew.status === 409 && tooFew.json?.reason === 'invariant_violated',
    `${tooFew.status} ${tooFew.text.slice(0, 200)}`)

  const inline = await saveVia('values', {
    'c.final': { value: 'Mut, Klarheit und Geduld', confirmed: true },
  })
  check('drei Werte in EINER Zeile gelten ebenso — die Sache zählt, nicht die Form',
    inline.status === 200 && inline.json?.slots?.['c.final']?.confirmed === 'Mut, Klarheit und Geduld',
    `${inline.status} ${inline.text.slice(0, 200)}`)

  // ── 18 · Das Dokument (Paket 7, §10) ──────────────────────────────────
  //
  // Auf EIGENEN Füssen: die Blöcke davor haben in fünf Kapiteln Werte
  // hinterlassen, und die Zusage hier ist eine über eine ÜBERSCHAUBARE Menge —
  // „alle Kapitel des Weges" prüft man nicht an einem Haufen.
  console.log('\n18 · Das Dokument: alle Kapitel des Weges, mit ihren Werten')
  for (const stepKey of [
    'context', 'pvm', 'architecture', 'values', 'archetype', 'manifesto', 'verbal', 'naming', 'result',
  ]) {
    await setSlots(profileId, stepKey, {})
  }
  await setSlots(profileId, 'context', {
    'a.origin': { confirmed: 'Wir wollten Kaffee, den man zurückverfolgen kann.', reviewed: true },
    'a.customerPraise': { confirmed: 'Ihr wart immer da, wenn es eng wurde.' },
  })
  await setSlots(profileId, 'values', {
    'c.discovery1': { confirmed: 'Wir servieren nur Bohnen von Farmen, die wir kennen.' },
  })

  const doc = await call(`${base}/document`, { cookie: account.cookie })
  const docChapters = (doc.json?.chapters ?? []).map(entry => entry.stepKey)
  check('das Dokument nennt die Kapitel des Weges in Registry-Reihenfolge',
    doc.status === 200 && JSON.stringify(docChapters) === JSON.stringify([
      'context', 'pvm', 'values', 'archetype', 'manifesto', 'verbal', 'result',
    ]),
    `${doc.status} ${JSON.stringify(docChapters)}`)
  check('… übersprungene Kapitel fehlen (architecture, naming)',
    !docChapters.includes('architecture') && !docChapters.includes('naming'),
    JSON.stringify(docChapters))

  const docContext = (doc.json?.chapters ?? []).find(entry => entry.stepKey === 'context')
  const docPraise = (docContext?.sessions ?? []).find(entry => entry.slotId === 'a.customerPraise')
  check('… je Kapitel dieselben Blöcke wie die Abnahme, mit vollem Wert',
    docPraise?.value === 'Ihr wart immer da, wenn es eng wurde.'
    && docPraise?.confirmed === true && typeof docContext?.revision === 'number',
    JSON.stringify(docPraise ?? null))

  const unreviewed = doc.json?.review?.unreviewed ?? []
  check('… `unreviewed` nennt genau die bestätigten Sessions OHNE Urteil',
    JSON.stringify(unreviewed) === JSON.stringify(['a.customerPraise', 'c.discovery1']),
    JSON.stringify(unreviewed))
  check('GEGENPROBE: die gegengelesene Session steht NICHT darin',
    !unreviewed.includes('a.origin'), JSON.stringify(unreviewed))

  // ── 19 · Der Prüfblick (Paket 7, §10/§16) ─────────────────────────────
  console.log('\n19 · Der Prüfblick: nachholen, prüfen, beim zweiten Klick schweigen')
  const look = await call(`${base}/review?stub=conflict`, { method: 'POST', cookie: account.cookie })
  check('er läuft und holt genau die ungeprüften Sessions nach',
    look.status === 200 && look.json?.ran === true
    && JSON.stringify(look.json?.caughtUp) === JSON.stringify(unreviewed),
    `${look.status} ${JSON.stringify(look.json?.caughtUp ?? null)}`)
  check('… und nichts bleibt liegen (der Deckel greift hier nicht)',
    (look.json?.stillUnreviewed ?? []).length === 0,
    JSON.stringify(look.json?.stillUnreviewed ?? null))

  const docAfter = await call(`${base}/document`, { cookie: account.cookie })
  check('… die nachgeholten Urteile stehen an ihren Zeilen',
    (docAfter.json?.review?.unreviewed ?? []).length === 0,
    JSON.stringify(docAfter.json?.review?.unreviewed ?? null))

  const documentFinding = (look.json?.findings ?? []).find(entry => entry.kind === 'conflict')
  check('… der Ersatz-Blick hinterlässt einen Dokument-Befund an SEINEM Feld',
    Boolean(documentFinding) && documentFinding.slots.length === 2
    && documentFinding.sourceSession === documentFinding.slots[0],
    JSON.stringify(documentFinding ?? null))

  const documentAgain = await call(`${base}/review?stub=conflict`, {
    method: 'POST', cookie: account.cookie,
  })
  check('derselbe Stand wird NICHT ein zweites Mal geprüft',
    documentAgain.status === 200 && documentAgain.json?.ran === false,
    `${documentAgain.status} ${documentAgain.text.slice(0, 200)}`)
  check('… die Auskunft kommt trotzdem vollständig aus der Tabelle',
    (documentAgain.json?.findings ?? []).length === (look.json?.findings ?? []).length
    && documentAgain.json?.revisionKey === look.json?.revisionKey,
    `${(documentAgain.json?.findings ?? []).length} statt ${(look.json?.findings ?? []).length}`)

  const valuesRevision = (docAfter.json?.chapters ?? [])
    .find(entry => entry.stepKey === 'values')?.revision ?? 0
  await bumpRevision(profileId, 'values', valuesRevision + 1)
  const documentThird = await call(`${base}/review`, { method: 'POST', cookie: account.cookie })
  check('GEGENPROBE: eine NEUE Fassung wird wieder geprüft',
    documentThird.status === 200 && documentThird.json?.ran === true
    && documentThird.json?.revisionKey !== look.json?.revisionKey,
    `${documentThird.status} ${documentThird.json?.ran}`)

  // ── 20 · Die Seiten: fremd oder unbekannt ⇒ 404 (Paket 9) ──────────────
  //
  // Hier wird als einziges Mal die SEITE gemessen, nicht die Route: die Route
  // antwortete schon immer 404 — der Fehler lebte im Browser-Zustand. Der
  // Profil-Abruf setzte „nicht gefunden", und der Listen-Abruf für den
  // Marken-Wähler nahm es einem eingeloggten Menschen sofort wieder weg;
  // übrig blieb „Namenloses Branding" mit HTTP 200. Deshalb prüft dieser
  // Block den STATUS der ausgelieferten Seite.
  console.log('\n20 · Die Seiten: fremdes oder unbekanntes Branding ⇒ 404')
  const stranger = await makeAccount('stranger')
  // Eine wohlgeformte, aber nie vergebene Row-Id (20 Zeichen, wie Appwrite).
  const inventedId = 'aaaaaaaabbbbccccdddd'

  for (const [label, suffix] of [['Werkstatt', ''], ['Abnahme-Ansicht', '?s=acceptance']]) {
    const own = await call(`/de/brand/${profileId}/context${suffix}`, { cookie: account.cookie })
    check(`${label}: der Besitzer bekommt seine Seite (200, mit dem Namen der Marke)`,
      own.status === 200 && own.text.includes('Kailua Coffee'),
      `${own.status} ${own.text.length} Zeichen`)

    const guest = await call(`/de/brand/${profileId}/context${suffix}`)
    check(`${label}: ohne Anmeldung 404`, guest.status === 404, String(guest.status))

    const foreign = await call(`/de/brand/${profileId}/context${suffix}`, { cookie: stranger.cookie })
    check(`${label}: ein FREMDES Konto mit eigenem Beta-Zugang 404`,
      foreign.status === 404, String(foreign.status))
    check(`${label}: … und bekommt keine Hülle „Namenloses Branding" zu sehen`,
      !foreign.text.includes('Namenloses Branding'), foreign.text.slice(0, 120))

    const invented = await call(`/de/brand/${inventedId}/context${suffix}`, { cookie: account.cookie })
    check(`${label}: eine erfundene Profil-Id 404`, invented.status === 404, String(invented.status))
  }

  // Der zweite Zustand bleibt bewusst eine FLÄCHE: `naming` ist für dieses
  // Profil übersprungen (Name steht), die Route antwortet 403 mit Grund — und
  // ein erklärbarer Zustand ist keine Fehlerseite.
  const lockedStep = await call(`/de/brand/${profileId}/naming`, { cookie: account.cookie })
  check('GEGENPROBE: ein übersprungener Baustein bleibt die ruhige Fläche (200)',
    lockedStep.status === 200 && lockedStep.text.includes('Dieses Kapitel ist noch nicht offen'),
    `${lockedStep.status} ${lockedStep.text.length} Zeichen`)

  // Und die Nachbarseite hält, was Paket 8 versprochen hat.
  const docForeign = await call(`/de/brand/${profileId}/document`, { cookie: stranger.cookie })
  const docOwn = await call(`/de/brand/${profileId}/document`, { cookie: account.cookie })
  check('GEGENPROBE: das Dokument antwortet genauso (fremd 404, Besitzer 200)',
    docForeign.status === 404 && docOwn.status === 200,
    `${docForeign.status}/${docOwn.status}`)

  /**
   * 21 · BRAND DESIGN: DIE FREISCHALTUNG (Konzept §2.10, Paket D1).
   *
   * Geprüft wird die GANZE Kette an einer echten Marke: gesperrt mit eigenem
   * Satz · die Betreiber-Route hinter ihrer Capability · die Gegenprobe „ohne
   * fertige Foundation bleibt zu" · freigeschaltet öffnet GENAU das erste
   * Kapitel · die Rücknahme schliesst wieder · die Ereignis-Zeilen stehen da.
   *
   * DIE GEGENPROBE IST DER KERN: eine Prüfung, die nur „gesperrt" und
   * „offen" kennt, wäre auch für eine Regel grün, die nur EINE der beiden
   * Bedingungen aus §2.1 liest.
   */
  console.log('\n21 · Brand Design: Freischaltung, Rücknahme und die zwei Bedingungen')

  const designStep = () => call(`${base}/steps/dna`, { cookie: account.cookie })
  const colorStep = () => call(`${base}/steps/color`, { cookie: account.cookie })

  const lockedDna = await designStep()
  check('ohne Freischaltung: `dna` antwortet 403 mit EIGENEM Grund `design_locked`',
    lockedDna.status === 403 && lockedDna.json?.reason === 'design_locked',
    `${lockedDna.status} ${JSON.stringify(lockedDna.json?.reason ?? null)}`)

  const lockedPage = await call(`/de/brand/${profileId}/dna`, { cookie: account.cookie })
  check('… und die Seite zeigt den Satz für Brand Design, nicht „Schließ das Kapitel davor ab"',
    lockedPage.status === 200
    && lockedPage.text.includes('Brand Design ist noch nicht freigeschaltet')
    && !lockedPage.text.includes('Schließ das Kapitel davor ab'),
    `${lockedPage.status} ${lockedPage.text.length} Zeichen`)

  const lockedJourney = await call(base, { cookie: account.cookie })
  const journeyEntry = key => (lockedJourney.json?.journey ?? []).find(e => e.stepKey === key)
  check('die Journey nennt alle sechs Kapitel gesperrt mit `design_locked`',
    ['dna', 'color', 'type', 'mark', 'imagery', 'motion']
      .every(key => journeyEntry(key)?.state === 'locked'
        && journeyEntry(key)?.reason === 'design_locked'),
    JSON.stringify((lockedJourney.json?.journey ?? []).slice(9)))

  // ── Die Betreiber-Route hängt an ihrer Capability ────────────────────────
  const adminPath = `/api/brand/admin/profiles/${profileId}/design-unlock`
  const guestUnlock = await call(adminPath, { method: 'POST' })
  check('ohne Anmeldung: die Betreiber-Route antwortet 401', guestUnlock.status === 401,
    String(guestUnlock.status))

  const strangerUnlock = await call(adminPath, { method: 'POST', cookie: stranger.cookie })
  check('ein FREMDES Konto ohne Betreiber-Label: 403 (kein `users.manage`)',
    strangerUnlock.status === 403, String(strangerUnlock.status))

  const ownerUnlock = await call(adminPath, { method: 'POST', cookie: account.cookie })
  check('auch der EIGENTÜMER kann sich Brand Design nicht selbst freischalten: 403',
    ownerUnlock.status === 403, String(ownerUnlock.status))

  const operator = await makeAccount('design-operator', { labels: ['admin'] })

  // ── GEGENPROBE: Freischalten OHNE fertige Foundation ─────────────────────
  const unlockTooEarly = await call(adminPath, { method: 'POST', cookie: operator.cookie })
  check('GEGENPROBE: Freischalten vor dem Foundation-Ergebnis ⇒ 409 `foundation_incomplete`',
    unlockTooEarly.status === 409 && unlockTooEarly.json?.reason === 'foundation_incomplete',
    `${unlockTooEarly.status} ${JSON.stringify(unlockTooEarly.json?.reason ?? null)}`)
  const stillLocked = await designStep()
  check('… und `dna` bleibt gesperrt', stillLocked.status === 403
    && stillLocked.json?.reason === 'design_locked', String(stillLocked.status))

  // Das Ergebnis-Kapitel von Hand auf `done` — der Weg dorthin ist Zusage 1–20,
  // hier geht es um die zweite Bedingung und nicht um den Weg.
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_result`, data: { state: 'done' },
  })

  const unlocked = await call(adminPath, { method: 'POST', cookie: operator.cookie })
  check('mit fertiger Foundation: die Freischaltung greift (200, Datum gesetzt)',
    unlocked.status === 200 && typeof unlocked.json?.item?.designUnlockedAt === 'string'
    && unlocked.json.item.designUnlockedAt.length > 0,
    `${unlocked.status} ${JSON.stringify(unlocked.json?.item?.designUnlockedAt ?? null)}`)
  check('… und sie nennt den Betreiber, nicht den Eigentümer',
    unlocked.json?.item?.designUnlockedBy === operator.id,
    `${unlocked.json?.item?.designUnlockedBy} ≠ ${operator.id}`)

  const openDna = await designStep()
  check('jetzt ist `dna` offen (200)', openDna.status === 200, String(openDna.status))
  const lockedColor = await colorStep()
  check('… und `color` wartet auf den Vorgänger, nicht auf die Freischaltung',
    lockedColor.status === 403 && lockedColor.json?.reason === 'locked',
    `${lockedColor.status} ${JSON.stringify(lockedColor.json?.reason ?? null)}`)

  const openJourney = await call(base, { cookie: account.cookie })
  const openEntry = key => (openJourney.json?.journey ?? []).find(e => e.stepKey === key)
  check('die Journey: `dna` offen, `color` `awaiting_previous`',
    openEntry('dna')?.state === 'open'
    && openEntry('color')?.state === 'locked'
    && openEntry('color')?.reason === 'awaiting_previous',
    JSON.stringify([openEntry('dna'), openEntry('color')]))

  // Kapitel 10 der Leseansicht trägt jetzt den EINSTIEG statt des Angebots.
  const foundationPage = await call(`/de/brand/${profileId}/foundation`, { cookie: account.cookie })
  check('Kapitel 10 der Leseansicht zeigt „Brand Design starten" statt des Erstgesprächs',
    foundationPage.status === 200
    && foundationPage.text.includes('Brand Design starten')
    && foundationPage.text.includes('Freigeschaltet vom Studio am'),
    `${foundationPage.status} ${foundationPage.text.length} Zeichen`)

  // Der zweite Klick ist kein Fehler und kein neues Datum.
  const unlockAgain = await call(adminPath, { method: 'POST', cookie: operator.cookie })
  check('zweiter Klick: 200 mit UNVERÄNDERTEM Datum (keine wandernde Zahl)',
    unlockAgain.status === 200
    && unlockAgain.json?.item?.designUnlockedAt === unlocked.json?.item?.designUnlockedAt,
    `${unlockAgain.json?.item?.designUnlockedAt} ≠ ${unlocked.json?.item?.designUnlockedAt}`)

  // ── Die Rücknahme ───────────────────────────────────────────────────────
  const relocked = await call(`/api/brand/admin/profiles/${profileId}/design-lock`, {
    method: 'POST', cookie: operator.cookie,
  })
  check('die Rücknahme leert BEIDE Spalten',
    relocked.status === 200 && relocked.json?.item?.designUnlockedAt === null
    && relocked.json?.item?.designUnlockedBy === '',
    `${relocked.status} ${JSON.stringify(relocked.json?.item ?? null)}`)
  const lockedAgain = await designStep()
  check('… und `dna` ist wieder gesperrt, mit demselben Grund',
    lockedAgain.status === 403 && lockedAgain.json?.reason === 'design_locked',
    `${lockedAgain.status} ${JSON.stringify(lockedAgain.json?.reason ?? null)}`)

  // ── Die Ereignis-Zeilen ─────────────────────────────────────────────────
  const designEvents = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_events',
    queries: [Query.equal('profileId', profileId), Query.limit(200)],
  }).catch(() => ({ rows: [] }))
  const types = designEvents.rows.map(row => row.type)
  check('beide Handlungen stehen im Funnel — genau einmal je Klick',
    types.filter(type => type === 'design.unlocked').length === 1
    && types.filter(type => type === 'design.locked').length === 1,
    JSON.stringify(types.filter(type => type.startsWith('design.'))))
  const unlockedEvent = designEvents.rows.find(row => row.type === 'design.unlocked')
  check('… und die Ereignis-Zeile trägt den Betreiber und keinen Inhalt',
    unlockedEvent?.userId === operator.id
    && !String(unlockedEvent?.payload ?? '').includes('Kailua'),
    `${unlockedEvent?.userId} · ${unlockedEvent?.payload}`)

  // Die Liste des Betreibers sieht dieselbe Marke — und ein Fremder gar nichts.
  const list = await call('/api/brand/admin/design-unlocks', { cookie: operator.cookie })
  const listed = (list.json?.items ?? []).find(item => item.id === profileId)
  check('die Betreiber-Liste führt die Marke mit fertiger Foundation und gesperrtem Design',
    list.status === 200 && listed?.foundationDone === true && listed?.designUnlockedAt === null,
    `${list.status} ${JSON.stringify(listed ?? null)}`)
  const listForeign = await call('/api/brand/admin/design-unlocks', { cookie: stranger.cookie })
  check('GEGENPROBE: ohne `users.manage` bleibt die Liste zu (403)',
    listForeign.status === 403, String(listForeign.status))

  console.log('\n22 · Brand Design: die Weiche und die Vorbilder (D2a)')

  // Zusage 21 hat am Ende ZURÜCKGENOMMEN — für dieses Kapitel muss wieder
  // aufgeschlossen sein. Ohne das antwortet jede Vorbild-Route 404, und der
  // Beweis wäre grün aus dem falschen Grund.
  await call(adminPath, { method: 'POST', cookie: operator.cookie })

  const inspBase = `${base}/inspiration`
  const upload = (fields, file, cookie = account.cookie) =>
    callUpload(inspBase, { fields, file, cookie })

  // ── Die Weiche `g.source` ────────────────────────────────────────────────
  const dnaStep = await call(`${base}/steps/dna`, { cookie: account.cookie })
  const sourceSaved = await call(`${base}/steps/dna`, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: dnaStep.json?.step?.revision ?? 0,
      slots: { 'g.source': { value: 'inspiration', confirmed: true } },
    },
  })
  check('die Weiche `g.source` nimmt die Id „inspiration" und bestätigt sie',
    sourceSaved.status === 200 && sourceSaved.json?.slots?.['g.source']?.confirmed === 'inspiration',
    `${sourceSaved.status} ${JSON.stringify(sourceSaved.json?.slots?.['g.source'] ?? null)}`)

  // Die Werkstatt-Seite zeigt daraufhin das Instrument. Sie wird HIER geprüft
  // und nicht nur im Browser: der Haken hängt am handelnden Element
  // (`data-brand-inspiration`), nicht an einer Überschrift.
  const dnaPage = await call(`/de/brand/${profileId}/dna`, { cookie: account.cookie })
  check('… und die Werkstatt zeigt das Upload-Instrument',
    dnaPage.status === 200 && dnaPage.text.includes('data-brand-inspiration'),
    `${dnaPage.status} ${dnaPage.text.length} Zeichen`)

  // ── Die drei zugesagten Formate ──────────────────────────────────────────
  const up1 = await upload({ area: 'composition', note: 'Ruhig, viel Weißraum.' },
    { name: 'roesterei.png', type: 'image/png', data: TINY.png })
  check('PNG: 201, Nummer 1, Bereich und Notiz stehen',
    up1.status === 201 && up1.json?.item?.number === 1
    && up1.json?.item?.area === 'composition'
    && up1.json?.item?.note === 'Ruhig, viel Weißraum.',
    `${up1.status} ${JSON.stringify(up1.json?.item ?? null)}`)

  const up2 = await upload({ area: 'type', note: '' },
    { name: 'verlag.jpg', type: 'image/jpeg', data: TINY.jpg })
  check('JPEG: 201, Nummer 2', up2.status === 201 && up2.json?.item?.number === 2,
    `${up2.status} ${JSON.stringify(up2.json?.item ?? null)}`)

  const up3 = await upload({ area: 'color', note: 'Warm und einladend.' },
    { name: 'cafe.webp', type: 'image/webp', data: TINY.webp })
  check('WebP: 201, Nummer 3', up3.status === 201 && up3.json?.item?.number === 3,
    `${up3.status} ${JSON.stringify(up3.json?.item ?? null)}`)

  for (const id of (up3.json?.items ?? []).map(item => item.id)) cleanup.inspiration.push(id)

  // ── Der Slot-Wert zieht mit — und wird NIE bestätigt ─────────────────────
  const dnaRow = await tablesDB.getRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
  })
  const dnaSlots = JSON.parse(dnaRow.slots || '{}')
  const inspSlot = dnaSlots['g.inspiration'] ?? null
  check('der Slot `g.inspiration` trägt die Auswahl als beschriftete Blöcke',
    typeof inspSlot?.latestDraft === 'string'
    && inspSlot.latestDraft.startsWith('## 1 · Komposition')
    && inspSlot.latestDraft.includes('## 2 · Typografie')
    && inspSlot.latestDraft.includes('Ohne Notiz.'),
    JSON.stringify(inspSlot?.latestDraft ?? null))
  check('… und er ist NICHT bestätigt — sonst reiste er über `confirmedSlotValues` ins Dokument',
    !inspSlot?.confirmed, JSON.stringify(inspSlot?.confirmed ?? null))

  // ── Die Gegenproben der Annahme ──────────────────────────────────────────
  const fake = await upload({ area: 'color' },
    { name: 'trojaner.png', type: 'image/png', data: Buffer.from('<svg>kein Bild</svg>') })
  check('GEGENPROBE Magic-Bytes: Text als .png ⇒ 415, nicht 201',
    fake.status === 415 && fake.json?.reason === 'inspiration_unsupported_type',
    `${fake.status} ${JSON.stringify(fake.json?.reason ?? null)}`)

  const tooBig = Buffer.concat([TINY.png, Buffer.alloc(5_000_001 - TINY.png.length, 0x20)])
  const big = await upload({ area: 'color' },
    { name: 'gross.png', type: 'image/png', data: tooBig })
  check('GEGENPROBE Grösse: über 5 MB ⇒ 413',
    big.status === 413 && big.json?.reason === 'inspiration_too_large',
    `${big.status} ${JSON.stringify(big.json?.reason ?? null)}`)

  const noArea = await upload({ note: 'ohne Bereich' },
    { name: 'x.png', type: 'image/png', data: TINY.png })
  check('GEGENPROBE Bereich: ohne Bereich ⇒ 400',
    noArea.status === 400 && noArea.json?.reason === 'inspiration_area_invalid',
    `${noArea.status} ${JSON.stringify(noArea.json?.reason ?? null)}`)

  const badArea = await upload({ area: 'motion' },
    { name: 'x.png', type: 'image/png', data: TINY.png })
  check('… und ein Bereich AUSSERHALB des Vokabulars ebenso (400)',
    badArea.status === 400 && badArea.json?.reason === 'inspiration_area_invalid',
    `${badArea.status} ${JSON.stringify(badArea.json?.reason ?? null)}`)

  const noFile = await upload({ area: 'color' }, null)
  check('… und ohne Datei ⇒ 400', noFile.status === 400
    && noFile.json?.reason === 'inspiration_missing_file',
    `${noFile.status} ${JSON.stringify(noFile.json?.reason ?? null)}`)

  const listAfterRejects = await call(inspBase, { cookie: account.cookie })
  check('… und keine dieser Ablehnungen hat eine Zeile hinterlassen (weiter 3)',
    listAfterRejects.status === 200 && listAfterRejects.json?.items?.length === 3,
    `${listAfterRejects.status} ${listAfterRejects.json?.items?.length}`)

  // ── Ändern ───────────────────────────────────────────────────────────────
  const firstId = up1.json.item.id
  const patched = await call(`${inspBase}/${firstId}`, {
    method: 'PATCH', cookie: account.cookie, body: { area: 'imagery', note: 'Echte Menschen.' },
  })
  check('Bereich und Notiz lassen sich ändern',
    patched.status === 200 && patched.json?.item?.area === 'imagery'
    && patched.json?.item?.note === 'Echte Menschen.',
    `${patched.status} ${JSON.stringify(patched.json?.item ?? null)}`)

  const longNote = await call(`${inspBase}/${firstId}`, {
    method: 'PATCH', cookie: account.cookie, body: { note: 'x'.repeat(241) },
  })
  check('GEGENPROBE: eine Notiz über 240 Zeichen ⇒ 400',
    longNote.status === 400 && longNote.json?.reason === 'inspiration_note_too_long',
    `${longNote.status} ${JSON.stringify(longNote.json?.reason ?? null)}`)

  // ── Die Auslieferung: nur der Besitzer, und nie aus dem Zwischenspeicher ──
  const image = await callBinary(`${inspBase}/${firstId}/image`, { cookie: account.cookie })
  check('das Bild kommt beim Besitzer an — 200, image/png, Bytes identisch',
    image.status === 200
    && String(image.headers['content-type']).startsWith('image/png')
    && image.body.equals(TINY.png),
    `${image.status} ${image.headers['content-type']} ${image.body.length} Bytes`)
  check('… mit `Cache-Control: private, no-store` (Fremdwerk, §2.13)',
    String(image.headers['cache-control']) === 'private, no-store',
    String(image.headers['cache-control']))

  // ── Ein fremdes Konto sieht NICHTS — dreimal 404 ─────────────────────────
  const foreignList = await call(inspBase, { cookie: stranger.cookie })
  check('fremdes Konto: die Liste antwortet 404 (Datentür, nicht 403)',
    foreignList.status === 404, String(foreignList.status))
  const foreignImage = await callBinary(`${inspBase}/${firstId}/image`, { cookie: stranger.cookie })
  check('… das Bild ebenso (404)', foreignImage.status === 404, String(foreignImage.status))
  const foreignDelete = await call(`${inspBase}/${firstId}`, {
    method: 'DELETE', cookie: stranger.cookie,
  })
  check('… und Löschen ebenso (404)', foreignDelete.status === 404, String(foreignDelete.status))
  const guestImage = await callBinary(`${inspBase}/${firstId}/image`)
  check('… ohne Anmeldung: 401/404, nie ein Bild',
    guestImage.status === 401 || guestImage.status === 404, String(guestImage.status))

  // ── Der Deckel bei zwölf ─────────────────────────────────────────────────
  //
  // DIE NEUN FEHLENDEN BILDER ENTSTEHEN OHNE ROUTE — wie `setSlots` weiter
  // oben und aus demselben Grund: geprüft wird der DECKEL, nicht der Upload
  // (den beweisen die drei Formate schon). Über die Route gefüllt liefe der
  // Beweis ausserdem in die eigene Drossel (`brand:inspiration`, 12/min je
  // IP) und meldete 429 statt 409 — eine Zeitüberschreitung an beliebiger
  // Stelle statt der echten Ursache (CLAUDE.md, „Tests").
  for (let i = 4; i <= 12; i++) {
    const fileId = ID.unique()
    await storage.createFile({
      bucketId: 'brand-inspiration',
      fileId,
      file: InputFile.fromBuffer(TINY.png, `f${i}.png`),
    })
    await tablesDB.createRow({
      databaseId,
      tableId: 'brand_inspiration',
      rowId: fileId,
      data: { profileId, area: 'color', note: '', number: i, filename: `f${i}.png` },
    })
    cleanup.inspiration.push(fileId)
  }
  const listFull = await call(inspBase, { cookie: account.cookie })
  check('zwölf Bilder liegen da', listFull.json?.items?.length === 12,
    String(listFull.json?.items?.length))

  // Die Drossel schützt den Server, nicht den Beweis: ein neues Fenster, damit
  // die letzten drei Aufrufe die FACHLICHEN Antworten zeigen (409, 200, 200)
  // und nicht die 429 der eigenen Bremse.
  await waitForRateWindow()

  const thirteenth = await upload({ area: 'color' },
    { name: 'dreizehn.png', type: 'image/png', data: TINY.png })
  check('GEGENPROBE Deckel: das dreizehnte ⇒ 409 `inspiration_limit_reached`',
    thirteenth.status === 409 && thirteenth.json?.reason === 'inspiration_limit_reached',
    `${thirteenth.status} ${JSON.stringify(thirteenth.json?.reason ?? null)}`)

  // ── LEITPLANKE c: Bilder sind Eingabe, nie Ausgabe ───────────────────────
  //
  // GEGENPROBE MIT ANLAUF: der Slot wird von Hand BESTÄTIGT — genau der
  // Fehler, den ein künftiges Kapitel (D8) machen könnte. Bliebe der Wert
  // danach im Schnappschuss stehen, wäre die Zusage „reist nie" eine
  // Behauptung. Ohne diesen Anlauf wäre der Test tautologisch grün, weil der
  // Server `confirmed` gar nicht erst schreibt.
  const leakSlots = JSON.parse((await tablesDB.getRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
  })).slots || '{}')
  leakSlots['g.inspiration'] = {
    ...leakSlots['g.inspiration'],
    confirmed: leakSlots['g.inspiration']?.latestDraft ?? '',
  }
  leakSlots['g.source'] = { ...leakSlots['g.source'], confirmed: 'inspiration' }
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
    data: { slots: JSON.stringify(leakSlots) },
  })
  check('Vorprobe: der bestätigte Wert steht wirklich in der Zeile',
    String(leakSlots['g.inspiration'].confirmed).includes('Echte Menschen.'),
    String(leakSlots['g.inspiration'].confirmed).slice(0, 60))

  const shared = await call(`${base}/share`, { method: 'POST', cookie: account.cookie, body: {} })
  check('der Share-Link lässt sich veröffentlichen', shared.status === 200 || shared.status === 201,
    `${shared.status} ${shared.text.slice(0, 120)}`)
  const shareRows = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_shares',
    queries: [Query.equal('profileId', profileId), Query.limit(5)],
  }).catch(() => ({ rows: [] }))
  const snapshot = shareRows.rows.map(row => String(row.snapshot ?? '')).join('\n')
  check('LEITPLANKE c: der Schnappschuss trägt WEDER den Slot NOCH die Notiz',
    snapshot.length > 0
    && !snapshot.includes('g.inspiration')
    && !snapshot.includes('g.source')
    && !snapshot.includes('Echte Menschen.')
    && !snapshot.includes('Ohne Notiz.'),
    `${snapshot.length} Zeichen`)

  // ── Entfernen nimmt die DATEI mit ────────────────────────────────────────
  const removed = await call(`${inspBase}/${firstId}`, { method: 'DELETE', cookie: account.cookie })
  check('Entfernen: 200 und die Liste ist um eines kürzer',
    removed.status === 200 && removed.json?.items?.length === 11,
    `${removed.status} ${removed.json?.items?.length}`)
  const fileGone = await storage
    .getFile({ bucketId: 'brand-inspiration', fileId: firstId })
    .then(() => false)
    .catch(error => error?.code === 404)
  check('… und die DATEI ist wirklich weg (Bucket antwortet 404)', fileGone === true,
    String(fileGone))
  const rowGone = await tablesDB
    .getRow({ databaseId, tableId: 'brand_inspiration', rowId: firstId })
    .then(() => false)
    .catch(error => error?.code === 404)
  check('… die Zeile ebenso', rowGone === true, String(rowGone))

  // ── Die Ereignisse: Kennzahlen, kein Inhalt ──────────────────────────────
  const inspEvents = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_events',
    queries: [Query.equal('profileId', profileId), Query.limit(200)],
  }).catch(() => ({ rows: [] }))
  const added = inspEvents.rows.filter(row => row.type === 'design.inspiration.added')
  const removedEvents = inspEvents.rows.filter(row => row.type === 'design.inspiration.removed')
  // DREI, nicht zwölf: die neun Füll-Zeilen sind an der Route vorbei entstanden
  // (s. o.) und haben deshalb zu Recht kein Ereignis.
  check('jeder Upload UND jedes Entfernen über die Route steht im Funnel',
    added.length === 3 && removedEvents.length === 1,
    `${added.length} hinzugefügt · ${removedEvents.length} entfernt`)
  check('… und keine Ereignis-Zeile trägt Dateiname oder Notiz',
    added.every(row => !String(row.payload ?? '').includes('roesterei')
      && !String(row.payload ?? '').includes('Weißraum')),
    JSON.stringify(added[0]?.payload ?? null))

  console.log('\n23 · Brand Design: die Lesung der Vorbilder (D2b)')

  /**
   * ── WARUM DIESER ABSCHNITT MIT DEM ERSATZ LÄUFT ───────────────────────────
   * Ein echter Lauf schickt bis zu zwölf Bilder an ein multimodales Modell und
   * kostet Geld. `BRAND_DEV_STUB_VISION=1` liefert stattdessen eine
   * deterministische Lesung AUS DEM VOKABULAR — Ids, die die Klemmung
   * durchlässt, und je Bereich ein anderes Urteil, damit `fits`, `tension` und
   * `off` alle drei vorkommen. Dieselbe Bauform wie `BRAND_DEV_STUB_REVIEW`
   * (s. Kopf).
   *
   * Der Ersatz BUCHT die Drossel mit (anders als der Entwurfs-Stub) — nur
   * deshalb lässt sich der vierte Lauf des Tages überhaupt prüfen.
   */
  const readPath = `${inspBase}/read`

  /**
   * ZWEI BILDER BEKOMMEN EINEN ANDEREN BEREICH — direkt in der Zeile, an der
   * Route vorbei (wie die neun Füll-Zeilen oben und aus demselben Grund: die
   * eigene Drossel `brand:inspiration` würde 429 statt der fachlichen Antwort
   * liefern).
   *
   * Er ist die STELLSCHRAUBE des Ersatzes: sein Urteil hängt am Bereich, und
   * ohne diesen Griff trügen alle elf Bilder `color` oder `type` — der Lauf
   * ergäbe elfmal `fits`, und die Zusage „alle drei Urteile kommen vor" wäre
   * unbewiesen (mit einem grünen Haken davor).
   */
  const spreadIds = (await call(inspBase, { cookie: account.cookie })).json?.items ?? []
  for (const [index, area] of [[1, 'mark'], [2, 'composition']]) {
    const target = spreadIds[index]?.id
    if (!target) continue
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_inspiration', rowId: target, data: { area },
    }).catch(() => {})
  }

  // Elf Bilder liegen noch da (zwölf minus das eine entfernte). Der Lauf soll
  // sie alle lesen.
  const beforeRun = await call(inspBase, { cookie: account.cookie })
  const beforeCount = beforeRun.json?.items?.length ?? 0
  check('vor dem Lauf: die Bilder liegen da und NICHTS ist gelesen',
    beforeCount > 0 && beforeRun.json?.reading?.state === 'none'
    && (beforeRun.json?.items ?? []).every(item => item.reading === null),
    `${beforeCount} Bilder · ${beforeRun.json?.reading?.state}`)

  /**
   * OB DER ERSATZ LÄUFT, SAGT DER SERVER — nicht `process.env` DIESES
   * Prozesses: `BRAND_DEV_STUB_VISION` wirkt im DEV-SERVER, und das Skript
   * spricht ihn über HTTP an. Die eigene Umgebung abzufragen hiesse, eine
   * Variable zu prüfen, die für die Antwort gar nicht zuständig ist — beim
   * ersten Lauf stand der Zweig deshalb genau falsch herum (200 statt der
   * erwarteten 503, und der Beweis meldete einen Fehlschlag, den es nicht gab).
   *
   * 503 `vision_unavailable` ist die vollständige, richtige Antwort einer
   * Instanz OHNE Vision-Modell (Leitplanke „Stufe 1+2 pur") — und damit selbst
   * eine geprüfte Zusage, keine Ausrede.
   */
  const run1 = await call(readPath, { method: 'POST', cookie: account.cookie })
  const readingStub = run1.status === 200
  if (!readingStub) {
    check('ohne Vision-Modell antwortet der Lauf ruhig mit 503 `vision_unavailable`',
      run1.status === 503 && run1.json?.reason === 'vision_unavailable',
      `${run1.status} ${JSON.stringify(run1.json?.reason ?? null)}`)
  }
  else {
    check('der Lauf antwortet 200 und nennt das Rest-Kontingent',
      run1.status === 200 && run1.json?.quota?.limit === 3 && run1.json?.quota?.remaining === 2,
      `${run1.status} ${JSON.stringify(run1.json?.quota ?? null)}`)

    check('… jedes Bild hat danach eine Lesung mit Vokabular-Ids, Urteil, Anker und Begründung',
      (run1.json?.items ?? []).length === beforeCount
      && (run1.json?.items ?? []).every(item => item.reading
        && item.reading.observed.length >= 1
        && item.reading.observed.every(o => typeof o.dimension === 'string' && typeof o.value === 'string')
        && ['fits', 'tension', 'off'].includes(item.reading.verdict)
        && item.reading.anchor.length > 0
        && item.reading.reason.length > 0),
      JSON.stringify((run1.json?.items ?? [])[0]?.reading ?? null))

    check('… und der Zustand ist `read`, das Fazit steht in zwei Listen',
      run1.json?.reading?.state === 'read'
      && (run1.json?.reading?.summary?.keeps ?? []).length > 0
      && (run1.json?.reading?.summary?.improves ?? []).length > 0
      && String(run1.json?.reading?.runLine ?? '').includes('gelesen'),
      `${run1.json?.reading?.state} · ${JSON.stringify(run1.json?.reading?.runLine ?? null)}`)

    // Der Ersatz vergibt das Urteil nach dem BEREICH — die Vorbilder tragen
    // `color` (fits) und `composition` (off), also müssen beide vorkommen.
    const verdicts = new Set((run1.json?.items ?? []).map(item => item.reading?.verdict))
    check('… die Urteile sind nicht alle gleich — fits, tension UND off in EINEM Lauf',
      verdicts.has('fits') && verdicts.has('tension') && verdicts.has('off'),
      JSON.stringify([...verdicts]))

    // ── Der Slot-Wert von `g.reading` ─────────────────────────────────────
    const readSlots = JSON.parse((await tablesDB.getRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
    })).slots || '{}')
    const readingSlot = readSlots['g.reading'] ?? null
    check('der Slot `g.reading` trägt Fazit und Lauf als beschriftete Blöcke',
      typeof readingSlot?.latestDraft === 'string'
      && readingSlot.latestDraft.startsWith('## Trägt schon · ')
      && readingSlot.latestDraft.includes('## Geht besser · ')
      && readingSlot.latestDraft.includes('## Lauf'),
      JSON.stringify(readingSlot?.latestDraft ?? null))
    check('… und er ist noch NICHT bestätigt — das tut der Mensch (Derivation)',
      !readingSlot?.confirmed, JSON.stringify(readingSlot?.confirmed ?? null))

    // ── Die Werkstatt zeigt den Abschnitt ─────────────────────────────────
    const readingPage = await call(`/de/brand/${profileId}/dna`, { cookie: account.cookie })
    check('die Werkstatt zeigt den Lesungs-Abschnitt',
      readingPage.status === 200 && readingPage.text.includes('data-brand-reading'),
      `${readingPage.status} ${readingPage.text.length} Zeichen`)

    // ── Ein neues Bild macht die Lesung VERALTET ──────────────────────────
    const staleId = ID.unique()
    await storage.createFile({
      bucketId: 'brand-inspiration',
      fileId: staleId,
      file: InputFile.fromBuffer(TINY.png, 'neu.png'),
    })
    await tablesDB.createRow({
      databaseId,
      tableId: 'brand_inspiration',
      rowId: staleId,
      data: { profileId, area: 'color', note: '', number: 99, filename: 'neu.png' },
    })
    cleanup.inspiration.push(staleId)
    const afterAdd = await call(inspBase, { cookie: account.cookie })
    check('ein NEUES Bild macht die Lesung veraltet (`stale`)',
      afterAdd.json?.reading?.state === 'stale', String(afterAdd.json?.reading?.state))

    // … und ein ENTFERNTES ebenso: der Lauf war grösser als der heutige Stand.
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_inspiration', rowId: staleId })
      .catch(() => {})
    await storage.deleteFile({ bucketId: 'brand-inspiration', fileId: staleId }).catch(() => {})
    const removedOne = (afterAdd.json?.items ?? []).find(item => item.reading)?.id
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_inspiration', rowId: removedOne })
      .catch(() => {})
    await storage.deleteFile({ bucketId: 'brand-inspiration', fileId: removedOne }).catch(() => {})
    const afterRemove = await call(inspBase, { cookie: account.cookie })
    check('… ein ENTFERNTES Bild ebenso — der Lauf war grösser als der Stand',
      afterRemove.json?.reading?.state === 'stale'
      && (afterRemove.json?.items ?? []).every(item => item.reading),
      `${afterRemove.json?.reading?.state} · ${afterRemove.json?.items?.length} Bilder`)

    // ── Die Drossel: drei Läufe je Marke und Tag ──────────────────────────
    const run2 = await call(readPath, { method: 'POST', cookie: account.cookie })
    const run3 = await call(readPath, { method: 'POST', cookie: account.cookie })
    check('zweiter und dritter Lauf gehen — und das Kontingent zählt herunter',
      run2.status === 200 && run2.json?.quota?.remaining === 1
      && run3.status === 200 && run3.json?.quota?.remaining === 0,
      `${run2.status}/${run2.json?.quota?.remaining} · ${run3.status}/${run3.json?.quota?.remaining}`)

    const run4 = await call(readPath, { method: 'POST', cookie: account.cookie })
    check('GEGENPROBE Drossel: der VIERTE Lauf am selben Tag ⇒ 429 `brand_reading_limit`',
      run4.status === 429 && run4.json?.reason === 'brand_reading_limit',
      `${run4.status} ${JSON.stringify(run4.json?.reason ?? null)}`)

    // ── Die Ereignisse: Kennzahlen, kein Inhalt ───────────────────────────
    const runEvents = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_events',
      queries: [Query.equal('profileId', profileId), Query.equal('type', 'design.reading.run'), Query.limit(20)],
    }).catch(() => ({ rows: [] }))
    check('jeder Lauf steht im Funnel — drei Läufe, drei Zeilen',
      runEvents.rows.length === 3, String(runEvents.rows.length))
    check('… und keine Zeile trägt Anker, Begründung oder ein Bild',
      runEvents.rows.every(row => {
        const payload = String(row.payload ?? '')
        return payload.includes('model')
          && !payload.includes('Ersatz-Lesung')
          && !payload.includes('base64')
      }),
      JSON.stringify(runEvents.rows[0]?.payload ?? null))
  }

  // ── LEITPLANKE c gilt auch für die LESUNG ────────────────────────────────
  //
  // GEGENPROBE MIT ANLAUF wie bei den Bildern: der Slot wird von Hand
  // BESTÄTIGT — genau der Fehler, den D8 machen könnte. Reiste er danach in
  // den Schnappschuss, wäre „die Lesung bleibt intern" eine Behauptung.
  const leakReading = JSON.parse((await tablesDB.getRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
  })).slots || '{}')
  leakReading['g.reading'] = {
    ...leakReading['g.reading'],
    latestDraft: leakReading['g.reading']?.latestDraft ?? '## Trägt schon · 1\nErsatz-Fazit.',
    confirmed: leakReading['g.reading']?.latestDraft ?? '## Trägt schon · 1\nErsatz-Fazit.',
  }
  await tablesDB.updateRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
    data: { slots: JSON.stringify(leakReading) },
  })
  const sharedAgain = await call(`${base}/share`, { method: 'POST', cookie: account.cookie, body: {} })
  check('Vorprobe: der Share-Link lässt sich neu veröffentlichen',
    sharedAgain.status === 200 || sharedAgain.status === 201,
    `${sharedAgain.status} ${sharedAgain.text.slice(0, 120)}`)
  const shareRows2 = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_shares',
    queries: [Query.equal('profileId', profileId), Query.limit(5)],
  }).catch(() => ({ rows: [] }))
  const snapshot2 = shareRows2.rows.map(row => String(row.snapshot ?? '')).join('\n')
  check('LEITPLANKE: der Schnappschuss trägt WEDER `g.reading` NOCH eine Lesung',
    snapshot2.length > 0
    && !snapshot2.includes('g.reading')
    && !snapshot2.includes('Trägt schon')
    && !snapshot2.includes('Ersatz-Lesung'),
    `${snapshot2.length} Zeichen`)

  // ── Ein fremdes Konto sieht auch hier NICHTS ─────────────────────────────
  const foreignRead = await call(readPath, { method: 'POST', cookie: stranger.cookie })
  check('fremdes Konto: der Lauf antwortet 404 (Datentür, nicht 403)',
    foreignRead.status === 404, String(foreignRead.status))
  const guestRead = await call(readPath, { method: 'POST' })
  check('… ohne Anmeldung: 401/404, nie ein Lauf',
    guestRead.status === 401 || guestRead.status === 404, String(guestRead.status))

  // ── OHNE VORBILD gibt es nichts zu lesen ─────────────────────────────────
  //
  // DIE PRÜFREIHENFOLGE IST DER PUNKT: die Bilder-Frage steht in der Route VOR
  // der Drossel, also antwortet dieselbe Marke mit ERSCHÖPFTEM Tageskontingent
  // trotzdem 409 und nicht 429. Genau deshalb braucht diese Gegenprobe keine
  // zweite Marke — der erste Anlauf legte eine an und bekam 429 aus der
  // Anlege-Drossel, also die falsche Ablehnung für die falsche Frage.
  //
  // Geleert wird an der Route vorbei (`brand:inspiration`, 12/min).
  const restRows = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_inspiration',
    queries: [Query.equal('profileId', profileId), Query.limit(50)],
  }).catch(() => ({ rows: [] }))
  for (const row of restRows.rows) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_inspiration', rowId: row.$id })
      .catch(() => {})
    await storage.deleteFile({ bucketId: 'brand-inspiration', fileId: row.$id }).catch(() => {})
  }
  const bareRead = await call(readPath, { method: 'POST', cookie: account.cookie })
  check('GEGENPROBE: ohne ein einziges Vorbild ⇒ 409 `reading_no_images` (nicht 429)',
    bareRead.status === 409 && bareRead.json?.reason === 'reading_no_images',
    `${bareRead.status} ${JSON.stringify(bareRead.json?.reason ?? null)}`)

  console.log('\n24 · Brand Design: der DNA-Vorschlag, die Boards und der Mix (D2c)')

  /**
   * ── WAS DIESER ABSCHNITT PRÜFT — UND WAS ER BEWUSST NICHT PRÜFT ──────────
   * Er prüft, was an Route, Zustandsmaschine und Ablage hängt: dass `g.dna`
   * auf BEIDEN Wegen aufgeht (mit und ohne Vorbilder), dass der Lauf zehn
   * geklemmte Zeilen schreibt, dass die Herkunft am Weg hängt und nicht am
   * Modell, dass der Slot-Wert die Form des Layers trägt und UNBESTÄTIGT
   * bleibt, und dass das Kapitel danach vollständig durchlaufbar ist.
   *
   * Er prüft NICHT den INHALT von `g.boards` und `g.mix`. Beide entstehen im
   * BROWSER (die Seite rechnet sie aus `g.dna` und schreibt sie über den
   * Autosave, s. `useBrandDnaBoards`); ein HTTP-Skript ohne Browser kann sie
   * nicht auslösen. Ihre Regeln — drei Boards, deterministisch, vier bis sechs
   * Unterschiede, Hin- und Rückweg des Slot-Wertes, festgehaltene Dimensionen
   * bleiben beim Neu-Vorschlagen stehen — sind vollständig in
   * `tests/brandDesignDna.test.ts` belegt, und dass die SEITE sie schreibt, im
   * Klick-Beweis. Hier stehen deshalb Platzhalter-Werte: geprüft wird die
   * Kette darum herum.
   *
   * Der Lauf braucht `BRAND_DEV_STUB_DNA=1`, sonst kostete jeder Vorschlag
   * Geld; ohne die Variable prüft der Abschnitt stattdessen die 503
   * `dna_unavailable` — dieselbe Bauform wie bei der Lesung.
   */
  const dnaPath = `${base}/dna/propose`

  /** Den Slot-Zustand des Kapitels frisch lesen. */
  const dnaSessions = async () =>
    (await call(`${base}/steps/dna`, { cookie: account.cookie })).json?.sessions ?? {}

  /** Slots der Kapitel-Zeile direkt schreiben (an Route und Drossel vorbei). */
  const writeDnaSlots = async (mutate) => {
    const row = await tablesDB.getRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
    })
    const slots = JSON.parse(row.slots || '{}')
    mutate(slots)
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
      data: { slots: JSON.stringify(slots), revision: (row.revision ?? 0) + 1 },
    })
  }

  /**
   * ── DIE VIER FOUNDATION-STELLEN, GEGEN DIE ABGELEITET WIRD ──────────────
   * `g.dna` schöpft aus `c.final`, `d.primary`, `d.toneWords` und
   * `result.direction` — BESTÄTIGT, nicht als Entwurf. Diese Marke hat die vier
   * nicht: Abschnitt 11 hat mit „Nochmal von vorn" den halben Weg geleert, und
   * Abschnitt 21 prüft nur, dass die KAPITEL abgeschlossen sind.
   *
   * Ohne sie stünde `g.dna` auf `locked` und die Route antwortete 409
   * `dna_no_foundation` — beides richtig, aber beides eine Aussage über die
   * fehlende Foundation und nicht über den Vorschlag. Geschrieben wird direkt
   * in die Kapitel-Zeilen (an Route und Drossel vorbei, wie überall in diesem
   * Abschnitt).
   */
  const seedConfirmed = async (stepKey, values) => {
    const rowId = `${profileId}_${stepKey}`
    const row = await tablesDB.getRow({ databaseId, tableId: 'brand_steps', rowId })
    const slots = JSON.parse(row.slots || '{}')
    for (const [slotId, value] of Object.entries(values)) {
      slots[slotId] = { ...slots[slotId], latestDraft: value, confirmed: value }
    }
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_steps', rowId,
      data: { slots: JSON.stringify(slots), revision: (row.revision ?? 0) + 1 },
    })
  }
  await seedConfirmed('values', { 'c.final': '- Klartext\n- Handwerk\n- Nähe' })
  await seedConfirmed('archetype', { 'd.primary': 'sage', 'd.toneWords': '- ruhig\n- fundiert\n- warm' })
  await seedConfirmed('result', { 'result.direction': 'warm-editorial' })

  /**
   * ── ERST DEN STAND VON ABSCHNITT 23 ZURÜCKNEHMEN ────────────────────────
   * Dort wurde `g.reading` von Hand BESTÄTIGT (die Leitplanken-Gegenprobe).
   * Liefe die Weichen-Prüfung darauf, wäre sie tautologisch grün: `g.dna`
   * ginge auch ohne die neue Regel auf, weil seine Quelle zufällig bestätigt
   * ist. Beweis-Regel 1 (CLAUDE.md): Erwartungswerte nie aus dem Zustand
   * ableiten, den man gerade prüft.
   */
  await writeDnaSlots((slots) => {
    slots['g.reading'] = { ...slots['g.reading'], confirmed: undefined }
    delete slots['g.reading'].confirmed
    delete slots['g.dna']
  })

  // ── WEG 1: „Frida schlägt vor" — ohne Vorbilder, ohne Lesung ────────────
  //
  // DIE WEICHE WIRD DIREKT UMGELEGT und nicht über den PATCH: `g.source` ist
  // seit Abschnitt 22 BESTÄTIGT, und ein bestätigter Slot ist zu (Davids
  // Entscheidung 2026-09-02) — der Autosave weist ihn ohne `impactAck` ab, und
  // der erste Anlauf dieses Beweises stand deshalb still auf „inspiration",
  // während die Prüfung „foundation" behauptete. Die Korrektur-Kette hat ihren
  // eigenen Beweis (Abschnitt 15); hier geht es um den Weg DAHINTER.
  await writeDnaSlots((slots) => {
    slots['g.source'] = { ...slots['g.source'], latestDraft: 'foundation', confirmed: 'foundation' }
  })
  const foundationStates = await dnaSessions()
  check('Weg OHNE Vorbilder: `g.dna` ist OFFEN, obwohl es nie eine Lesung gab',
    foundationStates['g.dna']?.state === 'open'
    && foundationStates['g.reading']?.state !== 'done',
    `g.dna=${foundationStates['g.dna']?.state} · g.reading=${foundationStates['g.reading']?.state}`
    + ` · g.source=${foundationStates['g.source']?.state}`)

  const run1Dna = await call(dnaPath, { method: 'POST', cookie: account.cookie })
  const dnaStub = run1Dna.status === 200
  if (!dnaStub) {
    check('ohne Text-Modell antwortet der Lauf ruhig mit 503 `dna_unavailable`',
      run1Dna.status === 503 && run1Dna.json?.reason === 'dna_unavailable',
      `${run1Dna.status} ${JSON.stringify(run1Dna.json?.reason ?? null)}`)
  }
  else {
    check('der Lauf antwortet 200, nennt das Rest-Kontingent und sagt „ohne Vorbilder"',
      run1Dna.json?.entries?.length === 10
      && run1Dna.json?.hasInspiration === false
      && run1Dna.json?.quota?.limit === 10,
      `${run1Dna.status} ${JSON.stringify(run1Dna.json?.quota ?? null)} · ${run1Dna.json?.entries?.length} Zeilen`)

    check('… jede der zehn Zeilen trägt eine Vokabular-Id, eine Herkunft und eine Begründung',
      (run1Dna.json?.entries ?? []).every(entry =>
        DNA_DIMENSIONS.includes(entry.dimension)
        && typeof entry.value === 'string' && entry.value.length > 0
        && ['foundation', 'both'].includes(entry.origin)
        && typeof entry.reason === 'string' && entry.reason.length > 0)
      && new Set((run1Dna.json?.entries ?? []).map(e => e.dimension)).size === 10,
      JSON.stringify((run1Dna.json?.entries ?? [])[0] ?? null))

    check('… und OHNE Vorbilder ist JEDE Zeile `foundation`, ohne Vorbild-Satz',
      (run1Dna.json?.entries ?? []).every(entry =>
        entry.origin === 'foundation' && !entry.inspirationReason),
      JSON.stringify((run1Dna.json?.entries ?? []).map(e => e.origin)))

    const dnaSlotsAfter = JSON.parse((await tablesDB.getRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_dna`,
    })).slots || '{}')
    const dnaSlot = dnaSlotsAfter['g.dna'] ?? null
    check('der Slot `g.dna` trägt zehn beschriftete Blöcke',
      typeof dnaSlot?.latestDraft === 'string'
      && dnaSlot.latestDraft.startsWith('## ')
      && dnaSlot.latestDraft.split('\n\n').length === 10,
      `${(dnaSlot?.latestDraft ?? '').split('\n\n').length} Blöcke`)
    check('… und er ist noch NICHT bestätigt — das tut der Mensch (Derivation)',
      !dnaSlot?.confirmed, JSON.stringify(dnaSlot?.confirmed ?? null))
  }

  // ── GEGENPROBE ZUR WEICHE: mit Vorbildern wartet `g.dna` wieder ─────────
  await writeDnaSlots((slots) => {
    slots['g.source'] = { ...slots['g.source'], confirmed: 'inspiration', latestDraft: 'inspiration' }
    delete slots['g.reading'].confirmed
  })
  const inspirationStates = await dnaSessions()
  check('GEGENPROBE: mit „wir haben Vorbilder" wartet `g.dna` wieder auf die Lesung',
    inspirationStates['g.dna']?.state === 'locked',
    `g.dna=${inspirationStates['g.dna']?.state}`)

  // ── WEG 2: mit Vorbildern und einer Lesung ─────────────────────────────
  //
  // Zwei Zeilen MIT fertiger Lesung, direkt geschrieben: die Lese-Route hat
  // ihr Tageskontingent in Abschnitt 23 aufgebraucht (drei Läufe), und ein
  // vierter käme als 429 zurück. Geprüft wird hier ohnehin der VORSCHLAG,
  // nicht die Lesung.
  const readingJson = (dimension, value, verdict) => JSON.stringify({
    v: 1,
    observed: [{ dimension, value }],
    verdict,
    anchor: 'Beweis-Anker aus der Foundation',
    reason: 'Beweis-Lesung.',
    at: new Date().toISOString(),
    runSize: 2,
  })
  for (const [index, spec] of [
    ['color', 'earthy', 'fits'],
    ['composition', 'calm', 'tension'],
  ].entries()) {
    const fileId = ID.unique()
    await storage.createFile({
      bucketId: 'brand-inspiration',
      fileId,
      file: InputFile.fromBuffer(TINY.png, `dna-${index}.png`),
    })
    await tablesDB.createRow({
      databaseId,
      tableId: 'brand_inspiration',
      rowId: fileId,
      data: {
        profileId,
        area: index === 0 ? 'color' : 'composition',
        note: '',
        number: 90 + index,
        filename: `dna-${index}.png`,
        reading: readingJson(spec[0], spec[1], spec[2]),
      },
    })
    cleanup.inspiration.push(fileId)
  }
  await writeDnaSlots((slots) => {
    slots['g.reading'] = {
      ...slots['g.reading'],
      latestDraft: slots['g.reading']?.latestDraft ?? '## Trägt schon · 1\nBeweis.',
      confirmed: slots['g.reading']?.latestDraft ?? '## Trägt schon · 1\nBeweis.',
    }
  })
  const readStates = await dnaSessions()
  check('… und mit bestätigter Lesung geht `g.dna` auf demselben Weg wieder auf',
    readStates['g.dna']?.state === 'open' || readStates['g.dna']?.state === 'stale',
    `g.dna=${readStates['g.dna']?.state}`)

  if (dnaStub) {
    const run2Dna = await call(dnaPath, { method: 'POST', cookie: account.cookie })
    check('der Lauf MIT Vorbildern sagt es — und das Kontingent zählt herunter',
      run2Dna.status === 200 && run2Dna.json?.hasInspiration === true
      && run2Dna.json?.quota?.remaining === 8,
      `${run2Dna.status} ${JSON.stringify(run2Dna.json?.quota ?? null)}`)
    check('… mindestens EINE Zeile kommt aus beidem und nennt ein Vorbild',
      (run2Dna.json?.entries ?? []).some(entry =>
        entry.origin === 'both'
        && typeof entry.inspirationReason === 'string'
        && entry.inspirationReason.length > 0),
      JSON.stringify((run2Dna.json?.entries ?? []).filter(e => e.origin === 'both')))
    check('… und KEINE Zeile trägt `inspiration` allein — die Foundation bleibt der Massstab',
      (run2Dna.json?.entries ?? []).every(entry => entry.origin !== 'inspiration'),
      JSON.stringify(new Set((run2Dna.json?.entries ?? []).map(e => e.origin))))

    // Die Ereignisse: Kennzahlen, kein Inhalt.
    const dnaEvents = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_events',
      queries: [Query.equal('profileId', profileId), Query.equal('type', 'design.dna.run'), Query.limit(20)],
    }).catch(() => ({ rows: [] }))
    check('jeder Lauf steht im Funnel — zwei Läufe, zwei Zeilen',
      dnaEvents.rows.length === 2, String(dnaEvents.rows.length))
    check('… und keine Zeile trägt eine Begründung',
      dnaEvents.rows.every(row => {
        const payload = String(row.payload ?? '')
        return payload.includes('model') && !payload.includes('Foundation-Stelle')
      }),
      JSON.stringify(dnaEvents.rows[0]?.payload ?? null))
  }

  // ── Die Werkstatt zeigt den Abschnitt ──────────────────────────────────
  const dnaPageView = await call(`/de/brand/${profileId}/dna`, { cookie: account.cookie })
  check('die Werkstatt zeigt den DNA-Abschnitt',
    dnaPageView.status === 200 && dnaPageView.text.includes('data-brand-dna'),
    `${dnaPageView.status} ${dnaPageView.text.length} Zeichen`)

  // ── Fremd und ohne Anmeldung ───────────────────────────────────────────
  const foreignDna = await call(dnaPath, { method: 'POST', cookie: stranger.cookie })
  check('fremdes Konto: der Lauf antwortet 404 (Datentür, nicht 403)',
    foreignDna.status === 404, String(foreignDna.status))
  const guestDna = await call(dnaPath, { method: 'POST' })
  check('… ohne Anmeldung: 401/404, nie ein Lauf',
    guestDna.status === 401 || guestDna.status === 404, String(guestDna.status))

  // ── DAS KAPITEL LÄSST SICH ZU ENDE GEHEN ───────────────────────────────
  //
  // Die Werte von `g.boards` und `g.mix` sind hier PLATZHALTER (s. Kopf des
  // Abschnitts): geprüft wird, dass die Kette aufgeht — bestätigen ⇒ nächste
  // Session offen ⇒ Kapitel abnehmbar ⇒ `color` offen.
  const placeholder = ['style', 'era', 'form'].map(id => `## ${id}\nPlatzhalter`).join('\n\n')
  await writeDnaSlots((slots) => {
    const dnaValue = slots['g.dna']?.latestDraft ?? placeholder
    slots['g.dna'] = { ...slots['g.dna'], latestDraft: dnaValue, confirmed: dnaValue }
  })
  const afterDna = await dnaSessions()
  check('bestätigtes `g.dna` öffnet die drei Boards',
    afterDna['g.boards']?.state === 'open', `g.boards=${afterDna['g.boards']?.state}`)

  await writeDnaSlots((slots) => {
    slots['g.boards'] = { latestDraft: placeholder, confirmed: placeholder }
    slots['g.board'] = { latestDraft: 'calmer', confirmed: 'calmer' }
  })
  const afterBoard = await dnaSessions()
  check('… die Wahl eines Boards öffnet Mix & Match',
    afterBoard['g.mix']?.state === 'open', `g.mix=${afterBoard['g.mix']?.state}`)

  await writeDnaSlots((slots) => {
    slots['g.mix'] = { latestDraft: placeholder, confirmed: placeholder }
  })
  const acceptance = await call(`${base}/steps/dna/acceptance`, { cookie: account.cookie })
  const dnaPending = (acceptance.json?.sessions ?? []).filter(entry => entry.required && !entry.confirmed)
  check('… und danach steht keine Pflicht-Session des Kapitels mehr offen',
    acceptance.status === 200 && dnaPending.length === 0,
    `${acceptance.status} · offen: ${JSON.stringify(dnaPending.map(entry => entry.slotId))}`)

  /**
   * ABNEHMEN UND SCHLIESSEN — erst danach lässt `canEnterBrandStep` das
   * nächste Kapitel zu. Bestätigen ist die Session, ABNEHMEN das Kapitel
   * (§5a): ohne den zweiten Schritt antwortet `color` mit 403 `step_locked`,
   * und das wäre kein Befund über D2c, sondern der normale Weg.
   */
  let dnaRevision = acceptance.json?.revision ?? 0
  for (const entry of (acceptance.json?.sessions ?? []).filter(row => row.confirmed && !row.accepted)) {
    const taken = await call(`${base}/steps/dna/sessions/${entry.slotId}/accept`, {
      method: 'POST', cookie: account.cookie, body: { revision: dnaRevision },
    })
    if (taken.status !== 200) {
      check(`Abnahme ${entry.slotId}`, false, `${taken.status} ${taken.text.slice(0, 160)}`)
      break
    }
    dnaRevision = taken.json?.revision ?? dnaRevision
  }
  const dnaDone = await call(`${base}/steps/dna/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('das Kapitel `dna` lässt sich abnehmen und schliessen',
    dnaDone.status === 200, `${dnaDone.status} ${dnaDone.text.slice(0, 160)}`)

  const nextChapter = await call(`${base}/steps/color`, { cookie: account.cookie })
  check('das nächste Kapitel `color` ist danach erreichbar und seine erste Session offen',
    nextChapter.status === 200 && nextChapter.json?.sessions?.['h.base']?.state === 'open',
    `${nextChapter.status} h.base=${nextChapter.json?.sessions?.['h.base']?.state}`)

  /**
   * LEITPLANKE (seit D9 GESCHÄRFT): AUS DIESEM KAPITEL REIST GAR NICHTS ROH.
   *
   * Bis D8 stand hier „die DNA DARF reisen" — `g.dna` ist `public` und
   * Festlegung, also liess der Slot-Filter sie durch. Seit Davids Entscheidung
   * vom 2026-09-09 fällt das ganze KAPITEL aus `chapters`
   * (`isBrandChapterShareable`): die DNA erreicht den Leser als Teil des
   * `design`-Presets, sobald die Schicht fertig ist — und hier ist sie es
   * nicht, es gibt also nichts zu zeigen und folglich nichts zu übertragen.
   *
   * Die NEGATIVE Hälfte (Lesung, Vorbilder, Weiche, Board-Vorrat) bleibt
   * wörtlich stehen: sie hing nie am Kapitel, sondern am Slot-Filter, und beide
   * Netze sollen einzeln halten.
   *
   * KEINE „nicht einfach leer"-Gegenprobe an dieser Stelle: diese Prüf-Marke
   * hat gar keine bestätigte Foundation (gemessen: `chapters: []`), die Zusage
   * wäre also unerfüllbar. Hohl ist die Prüfung trotzdem nicht — die Zeile
   * darunter behauptete bis D9 wörtlich das GEGENTEIL und war grün. Die
   * positive Hälfte steht dort, wo eine Marke Inhalte hat: Abschnitt 10 von
   * `verify-brand-share.mjs` und Abschnitt 8 von `verify-brand-design.mjs`.
   */
  const shared3 = await call(`${base}/share`, { method: 'POST', cookie: account.cookie, body: {} })
  check('Vorprobe: der Share-Link lässt sich ein drittes Mal veröffentlichen',
    shared3.status === 200 || shared3.status === 201,
    `${shared3.status} ${shared3.text.slice(0, 120)}`)
  const shareRows3 = await tablesDB.listRows({
    databaseId,
    tableId: 'brand_shares',
    queries: [Query.equal('profileId', profileId), Query.limit(5)],
  }).catch(() => ({ rows: [] }))
  const snapshot3 = shareRows3.rows.map(row => String(row.snapshot ?? '')).join('\n')
  check('der Schnappschuss trägt die DNA NICHT mehr roh (D9) — und das Kapitel gar nicht',
    snapshot3.length > 0
    && !snapshot3.includes('g.dna')
    && !snapshot3.includes('"stepKey":"dna"'),
    `${snapshot3.length} Zeichen`)
  check('… auch WEDER die Lesung NOCH die Vorbilder NOCH den Vorrat der Boards',
    snapshot3.length > 0
    && !snapshot3.includes('g.reading')
    && !snapshot3.includes('g.inspiration')
    && !snapshot3.includes('g.source')
    && !snapshot3.includes('g.boards')
    && !snapshot3.includes('Beweis-Lesung'),
    `${snapshot3.length} Zeichen`)


  // ══ 25 · Farbwelt: das Kapitel `color` (Brand Design D3, §2.3) ═══════════
  //
  // ── WAS DIESER ABSCHNITT PRÜFT — UND WAS NICHT ─────────────────────────
  // Die Farb-MATHEMATIK gehört der Themes-Engine, die Regeln darüber
  // (Kandidaten, AA-Gate, Abstands-Regel, Rollen, Kontrast-Urteil, Rundlauf
  // der drei Slot-Werte) sind vollständig in `tests/brandDesignColor.test.ts`
  // belegt. HIER wird geprüft, was ein Unit-Test nicht sehen kann: dass die
  // BÜHNE dieselben Zahlen zeigt, dass ein von Hand hineingeschriebener Satz
  // als Basisfarbe abgewiesen wird — und dass das Kapitel bis zur Abnahme
  // durchläuft.
  //
  // Die VORBELEGUNG entsteht im Browser (die Seite schreibt sie über den
  // Autosave, s. `useBrandColorWorld`); ein HTTP-Skript ohne Browser kann sie
  // nicht auslösen. Sichtbar ist sie trotzdem: SSR RECHNET sie und malt sie
  // hin, und genau daran hängen die Prüfungen unten.
  console.log('\n25 · Brand Design: die Farbwelt (D3)')

  const colorBase = `${base}/steps/color`

  const colorDetail = await call(colorBase, { cookie: account.cookie })
  check('das Kapitel `color` steht offen und seine erste Session auch',
    colorDetail.status === 200 && colorDetail.json?.sessions?.['h.base']?.state === 'open',
    `${colorDetail.status} h.base=${colorDetail.json?.sessions?.['h.base']?.state}`)
  check('… und die Bühne bekommt ihre zwei fremden Quellen (DNA + Richtung)',
    typeof colorDetail.json?.sourceValues?.['g.mix'] === 'string'
    && colorDetail.json?.sourceValues?.['result.direction'] === 'warm-editorial',
    JSON.stringify(Object.keys(colorDetail.json?.sourceValues ?? {})))

  /** Die Seite so lesen, wie ein Besucher sie bekommt. */
  const colorPage = async () => call(`/de/brand/${profileId}/color`, { cookie: account.cookie })

  const firstView = await colorPage()
  const hexesIn = text => new Set((text.match(/#[0-9a-f]{6}/gi) ?? []).map(hex => hex.toLowerCase()))
  check('die Werkstatt zeigt den Farbwelt-Abschnitt',
    firstView.status === 200 && firstView.text.includes('data-brand-color'),
    `${firstView.status} ${firstView.text.length} Zeichen`)
  check('… mit der VORBELEGUNG aus der Richtung `warm-editorial` (Tiefe = #4a3123)',
    firstView.text.includes('#4a3123'), 'Basisfarbe der Richtung nicht gefunden')
  check('… und mit gerechneten Rampen: weit über 22 Farbwerte auf der Seite',
    hexesIn(firstView.text).size > 22, String(hexesIn(firstView.text).size))
  check('… und mit einem WCAG-Urteil an den zwei Szenen',
    firstView.text.includes('AAA') || firstView.text.includes('AA'),
    'kein Urteil in der Seite')

  // ── EIN EIGENER HEX GILT ───────────────────────────────────────────────
  const OWN_BASE = '#2f4a3a'
  const ownBase = await call(colorBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('color'), slots: { 'h.base': { value: OWN_BASE, confirmed: true } } },
  })
  check('eine eigene Basisfarbe lässt sich schreiben UND bestätigen',
    ownBase.status === 200, `${ownBase.status} ${ownBase.text.slice(0, 160)}`)

  const ownView = await colorPage()
  /* Die Kandidaten-Karten zeigen weiterhin die Töne der Richtung — sie sind
   * der VORRAT, nicht die Wahl. Was sich ändern MUSS, sind die gerechneten
   * Farben: zwei Rampen, die Neutral-Rampe, fünf Rollen, sechs Paare. */
  const firstHexes = hexesIn(firstView.text)
  const ownHexes = hexesIn(ownView.text)
  const fresh = [...ownHexes].filter(hex => !firstHexes.has(hex))
  check('… und die ganze Seite rechnet mit ihr weiter (Rampen, Rollen, Paare neu)',
    ownView.text.includes(OWN_BASE) && fresh.length > 15,
    `eigene Farbe: ${ownView.text.includes(OWN_BASE)} · neue Farbwerte: ${fresh.length}`)

  // ── EIN SATZ IST KEINE FARBE (Invariante `hex`, D3) ────────────────────
  //
  // Die Korrektur-Kette zuerst: `h.base` ist gerade bestätigt, und ein
  // bestätigter Slot ist zu (409 `slot_confirmed`).
  const reopen = await call(colorBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('color'), slots: { 'h.base': { confirmed: false } } },
  })
  check('Vorprobe: „Korrigieren" öffnet die Basisfarbe wieder',
    reopen.status === 200, `${reopen.status} ${reopen.text.slice(0, 200)}`)

  const prose = await call(colorBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('color'),
      slots: { 'h.base': { value: 'Das warme Braun unserer Röstung', confirmed: true } },
    },
  })
  check('ein SATZ als Basisfarbe wird abgewiesen — 409 `invariant_violated`',
    prose.status === 409 && prose.json?.reason === 'invariant_violated',
    `${prose.status} ${prose.text.slice(0, 200)}`)
  const afterProse = await call(colorBase, { cookie: account.cookie })
  check('… und der bestätigte Stand bleibt der alte, nicht der Satz',
    afterProse.json?.slots?.['h.base']?.confirmed !== 'Das warme Braun unserer Röstung',
    JSON.stringify(afterProse.json?.slots?.['h.base']?.confirmed ?? null))

  // ── DIE ZWEI REGELN, DIE MAN SEHEN MUSS ────────────────────────────────
  //
  // Basisfarbe = Crema (der Mittelton der Richtung). Damit steht der erste
  // Akzent-Kandidat auf DERSELBEN Farbe: die Abstands-Regel muss greifen und
  // es SAGEN — genau der Fall, den der Prototyp mitführt.
  const cremaSet = await call(colorBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('color'), slots: { 'h.base': { value: '#b98a5e' } } },
  })
  check('Vorprobe: die Basisfarbe steht auf dem Mittelton der Richtung',
    cremaSet.status === 200, `${cremaSet.status} ${cremaSet.text.slice(0, 160)}`)
  const cremaView = await colorPage()
  check('DIE ABSTANDS-REGEL steht auf der Seite: „zu nah an eurer Basisfarbe"',
    cremaView.text.includes('Zu nah an eurer Basisfarbe'), 'Hinweis nicht gefunden')

  /*
   * Und jetzt ein Akzent, der den Knopf-Text nicht trägt: die Kontrast-Prüfung
   * fällt durch, sagt WELCHES Paar es ist — und `h.contrast` bleibt leer, ist
   * also nicht bestätigbar (§2.3: „wird gar nicht erst angeboten").
   *
   * ES IST EIN MITTELTON, seit D9 die Schriftfarbe auf dem Akzent RECHNET
   * (`brandAccentInk`): ein HELLER Akzent trägt jetzt dunkle Schrift und
   * besteht — genau das war der Widerspruch zwischen Tabelle und Szene, den D9
   * aufgelöst hat. Durch fällt, was weder helle noch dunkle Schrift trägt.
   */
  const lightAccent = await call(colorBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('color'),
      slots: { 'h.base': { value: '#4a3123' }, 'h.accent': { value: '#408080' } },
    },
  })
  check('Vorprobe: ein Mittelton als Akzent lässt sich eintragen',
    lightAccent.status === 200, `${lightAccent.status} ${lightAccent.text.slice(0, 160)}`)
  const failView = await colorPage()
  check('DIE KONTRAST-REGEL steht auf der Seite und nennt das Paar',
    failView.text.includes('So lässt sich die Prüfung nicht bestätigen')
    && failView.text.includes('Knopf-Text auf Akzent'),
    'Absage oder Paar-Name nicht gefunden')
  const contrastSlot = (await call(colorBase, { cookie: account.cookie })).json?.slots?.['h.contrast']
  check('… und `h.contrast` trägt dabei KEINEN Wert (leer heisst: nicht bestätigbar)',
    !(contrastSlot?.value ?? contrastSlot?.confirmed ?? ''),
    JSON.stringify(contrastSlot ?? null))

  /*
   * DIE GEGENPROBE ZUM MITTELTON (D9): derselbe Weg mit einem HELLEN Akzent —
   * die Absage verschwindet, weil die Matrix jetzt dieselbe dunkle Schrift
   * misst, die die Szene daneben setzt. Ohne diese zwei Zeilen könnte die
   * Prüfung darüber auch für die alte Regel („immer Papier") grün sein, und
   * die wies JEDEN hellen Akzent ab.
   */
  const brightAccent = await call(colorBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('color'),
      slots: { 'h.base': { value: '#4a3123' }, 'h.accent': { value: '#e8d3b8' } },
    },
  })
  check('Vorprobe: ein HELLER Akzent lässt sich eintragen', brightAccent.status === 200,
    `${brightAccent.status} ${brightAccent.text.slice(0, 160)}`)
  const brightView = await colorPage()
  check('GEGENPROBE: mit hellem Akzent besteht die Prüfung — dunkle Schrift trägt ihn',
    !brightView.text.includes('So lässt sich die Prüfung nicht bestätigen'),
    'die Absage steht noch da, obwohl die Szene lesbaren Text zeigt')

  // ── DAS KAPITEL LÄSST SICH ZU ENDE GEHEN ───────────────────────────────
  //
  // Die abgeleiteten Werte schreibt sonst der Browser (s. Kopf); hier stehen
  // Platzhalter in der FORM, die die Regeln erzeugen — geprüft wird die Kette
  // darum herum, nicht ihr Inhalt.
  const rampPlaceholder = '## Hell\n50 #ffffff · 950 #000000\n\n## Dunkel\n50 #ffffff · 950 #000000'
  const rolesPlaceholder = ['Grund & Text', 'Wärme & Flächen', 'Helle Flächen', 'Akzent & Signal', 'Papier & Ruhe']
    .map(label => `## ${label}\n#4a3123 · Rampe 900 · Platzhalter`).join('\n\n')
  const contrastPlaceholder = ['Fließtext auf Papier', 'Überschrift auf Papier']
    .map(label => `## ${label}\n#4a3123 · #ffffff · 13,5:1 · AAA`).join('\n\n')
  await seedConfirmed('color', {
    'h.base': '#4a3123',
    'h.ramp': rampPlaceholder,
    'h.neutral': 'warm',
    'h.accent': '#22392f',
    'h.roles': rolesPlaceholder,
    'h.contrast': contrastPlaceholder,
  })

  const colorAcceptance = await call(`${colorBase}/acceptance`, { cookie: account.cookie })
  const colorPending = (colorAcceptance.json?.sessions ?? []).filter(entry => entry.required && !entry.confirmed)
  check('nach den sechs Bestätigungen steht keine Pflicht-Session mehr offen',
    colorAcceptance.status === 200 && colorPending.length === 0,
    `${colorAcceptance.status} · offen: ${JSON.stringify(colorPending.map(entry => entry.slotId))}`)

  let colorRevision = colorAcceptance.json?.revision ?? 0
  for (const entry of (colorAcceptance.json?.sessions ?? []).filter(row => row.confirmed && !row.accepted)) {
    const taken = await call(`${colorBase}/sessions/${entry.slotId}/accept`, {
      method: 'POST', cookie: account.cookie, body: { revision: colorRevision },
    })
    if (taken.status !== 200) {
      check(`Abnahme ${entry.slotId}`, false, `${taken.status} ${taken.text.slice(0, 160)}`)
      break
    }
    colorRevision = taken.json?.revision ?? colorRevision
  }
  const colorDone = await call(`${colorBase}/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('das Kapitel `color` lässt sich abnehmen und schliessen',
    colorDone.status === 200, `${colorDone.status} ${colorDone.text.slice(0, 160)}`)

  const typeChapter = await call(`${base}/steps/type`, { cookie: account.cookie })
  check('… und das nächste Kapitel `type` ist danach erreichbar',
    typeChapter.status === 200 && typeChapter.json?.sessions?.['i.pair']?.state === 'open',
    `${typeChapter.status} i.pair=${typeChapter.json?.sessions?.['i.pair']?.state}`)

  // ══ 26 · Typografie: das Kapitel `type` (Brand Design D4, §2.4) ══════════
  //
  // ── WAS DIESER ABSCHNITT PRÜFT — UND WAS NICHT ─────────────────────────
  // Die REGELN (Vorbelegung aus der DNA, Hierarchie-Faktoren, Grenzen der
  // Stellschrauben, Rundlauf des `i.rules`-Wertes, Drei-Schriften-Invariante)
  // sind vollständig in `tests/brandDesignType.test.ts` belegt. HIER wird
  // geprüft, was ein Unit-Test nicht sehen kann: dass die Bühne die fertige
  // FARBWELT des Kapitels davor bekommt, dass die Seite die ECHTEN
  // Schrift-Stacks ausliefert (und nicht nur Schrift-NAMEN wie G4), dass ein
  // Satz als Paar-Id abgewiesen wird — und dass das Kapitel durchläuft.
  //
  // Wie in Abschnitt 25 gilt: die VORBELEGUNG schreibt der Browser (Autosave,
  // s. `useBrandTypeWorld`). Ein HTTP-Skript ohne Browser kann sie nicht
  // auslösen; SSR RECHNET sie aber und malt sie hin, und daran hängen die
  // Prüfungen unten.
  console.log('\n26 · Brand Design: die Typografie (D4)')

  const typeBase = `${base}/steps/type`
  const typePage = async () => call(`/de/brand/${profileId}/type`, { cookie: account.cookie })

  /**
   * DER KATALOG STEHT HIER NOCH EINMAL — und das ist Absicht.
   *
   * Dieses Skript ist `.mjs` und importiert den TypeScript-Katalog nicht.
   * Es KÖNNTE ihn über jiti holen; dann prüfte es aber die Seite gegen die
   * Liste, aus der die Seite gebaut ist — eine Prüfung, die eine Umbenennung
   * mitmacht, statt sie zu melden. Sechs Ids und sechs Stacks von Hand sind
   * der Preis dafür, dass eine Änderung am Katalog hier auffällt.
   */
  const TYPE_PAIRS = [
    { id: 'editorial', stack: "'Source Serif 4', Georgia, 'Times New Roman', serif" },
    { id: 'humanist', stack: "'Source Sans 3', 'Helvetica Neue', Arial, sans-serif" },
    { id: 'inter', stack: "Inter, 'Helvetica Neue', Arial, sans-serif" },
    { id: 'geometric', stack: "Sora, 'Avenir Next', 'Helvetica Neue', Arial, sans-serif" },
    { id: 'classic', stack: "'PT Serif', Georgia, 'Times New Roman', serif" },
    { id: 'contrast', stack: "Sora, 'Avenir Next', 'Helvetica Neue', Arial, sans-serif" },
  ]

  check('die Bühne bekommt die DNA UND die drei Werte der Farbwelt',
    typeof typeChapter.json?.sourceValues?.['g.mix'] === 'string'
    && typeChapter.json?.sourceValues?.['h.base'] === '#4a3123'
    && typeChapter.json?.sourceValues?.['h.neutral'] === 'warm'
    && typeChapter.json?.sourceValues?.['h.accent'] === '#22392f',
    JSON.stringify(typeChapter.json?.sourceValues ?? {}).slice(0, 200))

  const typeView = await typePage()
  check('die Werkstatt zeigt den Typografie-Abschnitt',
    typeView.status === 200 && typeView.text.includes('data-brand-type'),
    `${typeView.status} ${typeView.text.length} Zeichen`)
  check('… mit allen sechs Paaren des Katalogs',
    TYPE_PAIRS.every(pair => typeView.text.includes(`data-type-pair="${pair.id}"`)),
    TYPE_PAIRS.filter(pair => !typeView.text.includes(`data-type-pair="${pair.id}"`)).map(p => p.id).join(', '))
  check('… und mit einem markierten Vorschlag aus der DNA (genau einer)',
    typeView.text.split('Aus eurer DNA').length - 1 === 1,
    `${typeView.text.split('Aus eurer DNA').length - 1}× gefunden`)

  /**
   * DER UNTERSCHIED ZU G4, GEMESSEN: die Seite liefert die ECHTEN
   * Schrift-STACKS aus, nicht nur die Namen. Der Richtungs-Katalog zeigt
   * bewusst nur Namen („eine Richtung, kein Rendering-Beweis") — hier wird
   * eine Schrift entschieden, also muss der Stack im Markup stehen.
   */
  /* Im Markup stehen die Stacks HTML-maskiert (`&#39;` statt `'`) — sie
   * stecken in einem `style`-Attribut. Wer hier ohne Maskierung sucht,
   * bekommt eine Prüfung, die IMMER rot ist (beim Bau erwischt: 0 von 6). */
  const escaped = value => value.replaceAll("'", '&#39;')
  const stacksInPage = TYPE_PAIRS.filter(pair => typeView.text.includes(escaped(pair.stack))).length
  check('… und mit den ECHTEN Schrift-Stacks jedes Paares (nicht nur Namen)',
    stacksInPage === TYPE_PAIRS.length, `${stacksInPage} von ${TYPE_PAIRS.length}`)

  // ── EIN ANDERES PAAR ÄNDERT DAS SPECIMEN ───────────────────────────────
  const pickPair = await call(typeBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('type'), slots: { 'i.pair': { value: 'geometric', confirmed: true } } },
  })
  check('ein anderes Paar lässt sich wählen UND bestätigen',
    pickPair.status === 200, `${pickPair.status} ${pickPair.text.slice(0, 160)}`)

  const geometricView = await typePage()
  check('… und die Seite setzt das Specimen wirklich um (Sora · Nunito Sans)',
    geometricView.text.includes('Specimen · Geometrisch (Sora · Nunito Sans)'),
    'Specimen-Zeile des gewählten Paares nicht gefunden')

  // ── EIN SATZ IST KEINE PAAR-ID (Invariante `oneOf`, D4) ────────────────
  const reopenPair = await call(typeBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('type'), slots: { 'i.pair': { confirmed: false } } },
  })
  check('Vorprobe: „Korrigieren" öffnet das Paar wieder',
    reopenPair.status === 200, `${reopenPair.status} ${reopenPair.text.slice(0, 200)}`)

  const prosePair = await call(typeBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('type'),
      slots: { 'i.pair': { value: 'Eine warme Serif mit humanistischer Grotesk', confirmed: true } },
    },
  })
  check('eine erfundene Paar-Id wird abgewiesen — `invariant_violated`',
    prosePair.status >= 400 && prosePair.json?.reason === 'invariant_violated',
    `${prosePair.status} ${prosePair.text.slice(0, 200)}`)
  const afterProsePair = await call(typeBase, { cookie: account.cookie })
  const confirmedPair = String(afterProsePair.json?.slots?.['i.pair']?.confirmed ?? '')
  check('… und der bestätigte Stand ist keine Prosa',
    confirmedPair === '' || TYPE_PAIRS.some(pair => pair.id === confirmedPair),
    JSON.stringify(confirmedPair))

  const proseScale = await call(typeBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('type'), slots: { 'i.scale': { value: 'gigantisch', confirmed: true } } },
  })
  check('dasselbe für eine erfundene Hierarchie',
    proseScale.status >= 400 && proseScale.json?.reason === 'invariant_violated',
    `${proseScale.status} ${proseScale.text.slice(0, 200)}`)

  // ── DIE REGELN: derselbe Wert, den die Bühne schreibt ──────────────────
  /* Wörtlich die Form, die `brandTypeRulesSlotValue` erzeugt (s. Kopf des
   * Katalogs oben): vier beschriftete Blöcke, je Wert · Erklärung. */
  const rulesValue = [
    '## Überschrift-Gewicht\n600 · Gilt für Überschriften und die Wortmarke; der Fliesstext bleibt im Normalschnitt.',
    '## Laufweite\n-0,5 px · Feinkorrektur der Überschrift. Der Fliesstext wird nie gesperrt.',
    '## Versalien\nNein · Versalien sind eine Ausnahme, kein Stil — sie kosten Lesbarkeit.',
    "## Mono-Rolle\n'Geist Mono', ui-monospace, SFMono-Regular, monospace · Fest: Herkunftsangaben, Preise, Zahlen und Code — sonst nirgends.",
  ].join('\n\n')
  const saveRules = await call(typeBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('type'),
      slots: {
        'i.pair': { value: 'editorial', confirmed: true },
        'i.scale': { value: 'calm', confirmed: true },
        'i.rules': { value: rulesValue, confirmed: true },
      },
    },
  })
  check('Paar, Hierarchie und Regeln lassen sich zusammen bestätigen',
    saveRules.status === 200, `${saveRules.status} ${saveRules.text.slice(0, 200)}`)

  const rulesView = await typePage()
  check('die Seite zeigt die Regeln als Wirkung, nicht als Text (Gewicht 600)',
    rulesView.text.includes('font-weight: 600') && rulesView.text.includes('letter-spacing: -0.5px'),
    'Gewicht oder Laufweite nicht im Markup')
  const storedRules = String(
    (await call(typeBase, { cookie: account.cookie })).json?.slots?.['i.rules']?.confirmed ?? '')
  check('… und der gespeicherte Wert kommt unverändert zurück (vier Blöcke)',
    storedRules === rulesValue && storedRules.split('\n\n').length === 4,
    `${storedRules.length} Zeichen, ${storedRules.split('\n\n').length} Blöcke`)

  // ── DAS KAPITEL LÄSST SICH ZU ENDE GEHEN ───────────────────────────────
  const typeAcceptance = await call(`${typeBase}/acceptance`, { cookie: account.cookie })
  const typePending = (typeAcceptance.json?.sessions ?? []).filter(entry => entry.required && !entry.confirmed)
  check('nach den drei Bestätigungen steht keine Pflicht-Session mehr offen',
    typeAcceptance.status === 200 && typePending.length === 0,
    `${typeAcceptance.status} · offen: ${JSON.stringify(typePending.map(entry => entry.slotId))}`)

  let typeRevision = typeAcceptance.json?.revision ?? 0
  for (const entry of (typeAcceptance.json?.sessions ?? []).filter(row => row.confirmed && !row.accepted)) {
    const taken = await call(`${typeBase}/sessions/${entry.slotId}/accept`, {
      method: 'POST', cookie: account.cookie, body: { revision: typeRevision },
    })
    if (taken.status !== 200) {
      check(`Abnahme ${entry.slotId}`, false, `${taken.status} ${taken.text.slice(0, 160)}`)
      break
    }
    typeRevision = taken.json?.revision ?? typeRevision
  }
  const typeDone = await call(`${typeBase}/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('das Kapitel `type` lässt sich abnehmen und schliessen',
    typeDone.status === 200, `${typeDone.status} ${typeDone.text.slice(0, 160)}`)

  const markChapter = await call(`${base}/steps/mark`, { cookie: account.cookie })
  check('… und das nächste Kapitel `mark` ist danach erreichbar',
    markChapter.status === 200 && markChapter.json?.sessions?.['j.kind']?.state === 'open',
    `${markChapter.status} j.kind=${markChapter.json?.sessions?.['j.kind']?.state}`)

  // ══ 27 · Das Zeichen: das Kapitel `mark` (Brand Design D5a/D5b, §2.5) ════
  //
  // ── WAS DIESER ABSCHNITT PRÜFT — UND WAS NICHT ─────────────────────────
  // Die REGELN (Vorbelegung der Richtung, Klemmung des Briefings, beide
  // Slot-Werte hin und zurück, der SVG-Satz Zeichen für Zeichen) sind
  // vollständig in `tests/brandDesignMark.test.ts` belegt. HIER wird geprüft,
  // was ein Unit-Test nicht sehen kann: dass die Bühne DREI fremde Kapitel
  // zugeliefert bekommt, dass die Seite die gesetzte Wortmarke mit den
  // BESTÄTIGTEN Farben und der BESTÄTIGTEN Schrift ausliefert, dass die
  // Invarianten an der Route greifen, dass der Briefing-Lauf einen
  // unbestätigten Slot-Wert schreibt — und dass das Kapitel durchläuft.
  //
  // Wie in 25 und 26 gilt: die VORBELEGUNG schreibt der Browser (Autosave,
  // s. `useBrandMarkWorld`). SSR RECHNET sie aber und malt sie hin, und daran
  // hängen die Prüfungen unten.
  //
  // DIE ERWARTETEN FARBEN STEHEN HIER ALS LITERAL und werden nicht aus der
  // Antwort abgeleitet (Beweis-Regel 1): `#4a3123` (Abschnitt 25) ergibt über
  // die Themes-Rampe die Tinte `#352217`, die warme Neutral-Rampe das Papier
  // `#fcfaf9`. Rechnet der Layer anders, soll das hier auffallen.
  console.log('\n27 · Brand Design: das Zeichen (D5a/D5b)')

  const markBase = `${base}/steps/mark`
  const markPage = async () => call(`/de/brand/${profileId}/mark`, { cookie: account.cookie })
  const markInk = '#352217'
  const markPaper = '#fcfaf9'
  const markKinds = ['word', 'pictorial', 'combination', 'monogram']

  check('die Bühne bekommt DNA, Farbwelt UND Schriftpaar aus drei fremden Kapiteln',
    typeof markChapter.json?.sourceValues?.['g.mix'] === 'string'
    && markChapter.json?.sourceValues?.['h.base'] === '#4a3123'
    && markChapter.json?.sourceValues?.['h.neutral'] === 'warm'
    && markChapter.json?.sourceValues?.['h.accent'] === '#22392f'
    && markChapter.json?.sourceValues?.['i.pair'] === 'editorial'
    && String(markChapter.json?.sourceValues?.['i.rules'] ?? '').includes('600'),
    JSON.stringify(markChapter.json?.sourceValues ?? {}).slice(0, 240))

  const markView = await markPage()
  check('die Werkstatt zeigt den Zeichen-Abschnitt',
    markView.status === 200 && markView.text.includes('data-brand-mark'),
    `${markView.status} ${markView.text.length} Zeichen`)
  check('… mit allen vier Richtungen des Katalogs',
    markKinds.every(kind => markView.text.includes(`data-mark-kind="${kind}"`)),
    markKinds.filter(kind => !markView.text.includes(`data-mark-kind="${kind}"`)).join(', '))
  check('… und mit genau einem markierten Vorschlag',
    markView.text.split('Aus eurer DNA').length - 1 === 1,
    `${markView.text.split('Aus eurer DNA').length - 1}× gefunden`)

  /**
   * DER UNTERSCHIED ZU EINER BESCHREIBUNG, GEMESSEN: die Seite liefert die
   * gesetzte Wortmarke als SVG aus — mit der bestätigten Schrift, den
   * gerechneten Farben und den bestätigten Schrift-Regeln aus Kapitel 3.
   */
  check('die Setzung steht als SVG auf der Seite — mit der bestätigten Schrift',
    markView.text.includes('Source Serif 4') && markView.text.includes('<text'),
    'kein <text> in der Überschriften-Schrift gefunden')
  check('… mit den gerechneten Farben der bestätigten Farbwelt',
    markView.text.includes(markInk) && markView.text.includes(markPaper),
    `Tinte ${markView.text.includes(markInk)} · Papier ${markView.text.includes(markPaper)}`)
  check('… und mit den bestätigten Schrift-Regeln (Gewicht 600, Laufweite -0,5)',
    markView.text.includes('font-weight="600"') && markView.text.includes('letter-spacing="-0.5"'),
    'Gewicht oder Laufweite nicht in der Setzung')
  check('… der Schutzraum ist GEZEICHNET, nicht beschrieben',
    markView.text.includes('stroke-dasharray="4 4"'), 'keine Schutzraum-Linie gefunden')

  // ── EINE ANDERE RICHTUNG ÄNDERT DIE VORBELEGUNG DER WAHL ───────────────
  const pickKind = await call(markBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('mark'), slots: { 'j.kind': { value: 'monogram', confirmed: true } } },
  })
  check('eine andere Richtung lässt sich wählen UND bestätigen',
    pickKind.status === 200, `${pickKind.status} ${pickKind.text.slice(0, 160)}`)
  const monogramView = await markPage()
  check('… und die Seite zeigt sie als gewählt',
    monogramView.text.includes('data-mark-kind="monogram" aria-pressed="true"')
    || /data-mark-kind="monogram"[^>]*aria-pressed="true"/.test(monogramView.text),
    'die Monogramm-Karte ist nicht als gewählt markiert')

  // ── EIN SATZ IST KEINE RICHTUNG (Invariante `oneOf`, D5a) ──────────────
  const reopenKind = await call(markBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('mark'), slots: { 'j.kind': { confirmed: false } } },
  })
  check('Vorprobe: „Korrigieren" öffnet die Richtung wieder',
    reopenKind.status === 200, `${reopenKind.status} ${reopenKind.text.slice(0, 200)}`)
  const proseKind = await call(markBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('mark'),
      slots: { 'j.kind': { value: 'Eine Wortmarke mit einem Wellenpunkt über dem i', confirmed: true } },
    },
  })
  check('eine erfundene Richtung wird abgewiesen — `invariant_violated`',
    proseKind.status >= 400 && proseKind.json?.reason === 'invariant_violated',
    `${proseKind.status} ${proseKind.text.slice(0, 200)}`)
  const proseSetting = await call(markBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('mark'), slots: { 'j.pick': { value: 'die linke', confirmed: true } } },
  })
  check('dasselbe für eine erfundene Setzungs-Wahl',
    proseSetting.status >= 400 && proseSetting.json?.reason === 'invariant_violated',
    `${proseSetting.status} ${proseSetting.text.slice(0, 200)}`)

  // ── DER BRIEFING-LAUF ──────────────────────────────────────────────────
  const briefPath = `${base}/mark/brief`
  const runBrief = await call(briefPath, { method: 'POST', cookie: account.cookie })
  const briefStub = runBrief.status === 200
  if (!briefStub) {
    check('ohne Text-Modell antwortet der Lauf ruhig mit 503 `mark_brief_unavailable`',
      runBrief.status === 503 && runBrief.json?.reason === 'mark_brief_unavailable',
      `${runBrief.status} ${JSON.stringify(runBrief.json?.reason ?? null)}`)
  }
  else {
    const brief = runBrief.json?.brief ?? {}
    check('der Lauf antwortet 200, nennt das Rest-Kontingent und liefert sechs Felder',
      Object.keys(brief).length === 6 && runBrief.json?.quota?.limit === 10,
      `${runBrief.status} ${JSON.stringify(runBrief.json?.quota ?? null)} · ${Object.keys(brief).length} Felder`)
    check('… die vier geschriebenen Felder tragen Text',
      ['character', 'formLanguage', 'noGos', 'places']
        .every(field => typeof brief[field] === 'string' && brief[field].length > 0),
      JSON.stringify(brief).slice(0, 200))

    /**
     * DIE ZWEI GERECHNETEN FELDER — die Zusage von D5a: was das Modell zu
     * Schutzraum und Varianten sagt, wird VERWORFEN. Der Ersatz schreibt sie
     * gar nicht erst; hier steht trotzdem, was dann dort stehen MUSS.
     */
    check('… Schutzraum und Mindestgrössen sind GERECHNET, nicht geschrieben',
      String(brief.clearSpace ?? '').includes('Versal-K')
      && brief.clearSpace.includes('96 px')
      && brief.clearSpace.includes('24 mm')
      && brief.clearSpace.includes('24 px'),
      String(brief.clearSpace ?? '').slice(0, 200))
    check('… und die Varianten kommen aus dem Vokabular (alle vier)',
      ['Primär', 'Invertiert', 'Einfarbig', 'Icon-Fläche']
        .every(label => String(brief.variants ?? '').includes(label)),
      String(brief.variants ?? '').slice(0, 200))

    const markSlotsAfter = JSON.parse((await tablesDB.getRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_mark`,
    })).slots || '{}')
    const briefSlot = markSlotsAfter['j.brief'] ?? null
    check('der Slot `j.brief` trägt sechs beschriftete Blöcke',
      typeof briefSlot?.latestDraft === 'string'
      && briefSlot.latestDraft.startsWith('## ')
      && briefSlot.latestDraft.split('\n\n').length === 6,
      `${(briefSlot?.latestDraft ?? '').split('\n\n').length} Blöcke`)
    check('… und er ist noch NICHT bestätigt — das tut der Mensch',
      !briefSlot?.confirmed, JSON.stringify(briefSlot?.confirmed ?? null))
    const briefView = await markPage()
    check('… die Werkstatt zeigt das Briefing Feld für Feld',
      ['character', 'formLanguage', 'clearSpace', 'variants', 'noGos', 'places']
        .every(field => briefView.text.includes(`data-mark-brief="${field}"`)),
      'nicht alle sechs Briefing-Felder auf der Seite')
  }

  // ── Fremd und ohne Anmeldung ───────────────────────────────────────────
  const foreignBrief = await call(briefPath, { method: 'POST', cookie: stranger.cookie })
  check('fremdes Konto: der Lauf antwortet 404 (Datentür, nicht 403)',
    foreignBrief.status === 404, String(foreignBrief.status))
  const guestBrief = await call(briefPath, { method: 'POST' })
  check('… ohne Anmeldung: 401/404, nie ein Lauf',
    guestBrief.status === 401 || guestBrief.status === 404, String(guestBrief.status))

  // ── DAS KAPITEL LÄSST SICH ZU ENDE GEHEN ───────────────────────────────
  //
  // `j.examples` schreibt sonst der Browser (s. Kopf); hier steht ein
  // Platzhalter in der FORM, die die Regel erzeugt — sechs Blöcke.
  const examplesPlaceholder = [
    '## Setzungen\nWortmarke: Kailua Coffee · Monogramm: K · Schrift: Source Serif 4',
    `## Primär\nTinte ${markInk} · Grund ${markPaper} · Schutzraum-Linie #a9836e`,
    `## Invertiert\nTinte ${markPaper} · Grund ${markInk} · Schutzraum-Linie #c8a694`,
    '## Einfarbig\nTinte #0c0a09 · Grund #ffffff · Schutzraum-Linie #aba49c',
    `## Icon-Fläche\nTinte ${markPaper} · Grund #5f4130 · Schutzraum-Linie #e8e6e3`,
    '## Maße\nSchutzraum = Höhe des Versal-K · Wortmarke mind. 96 px / 24 mm · Monogramm mind. 24 px · Eckenradius 18 %',
  ].join('\n\n')
  await seedConfirmed('mark', {
    'j.kind': 'word',
    'j.brief': [
      '## Charakter\nRuhig, handwerklich, überprüfbar.',
      '## Formsprache\nWeiche Kanten, eine Idee statt einer Szene.',
      '## Schutzraum & Mindestgrößen\nSchutzraum ringsum = Höhe des Versal-K. Mindestbreite der Wortmarke 96 px digital, 24 mm im Druck; das Monogramm nie unter 24 px.',
      '## Varianten\nPrimär, Invertiert, Einfarbig, Icon-Fläche.',
      '## No-Gos\nNicht verzerren, nicht schräg stellen, keinen Schatten.',
      '## Einsatzorte\nLadenschild, Tüte, Website-Kopf, Rechnung.',
    ].join('\n\n'),
    'j.examples': examplesPlaceholder,
    'j.pick': 'wordmark',
  })

  const markAcceptance = await call(`${markBase}/acceptance`, { cookie: account.cookie })
  const markPending = (markAcceptance.json?.sessions ?? []).filter(entry => entry.required && !entry.confirmed)
  check('nach den vier Bestätigungen steht keine Pflicht-Session mehr offen',
    markAcceptance.status === 200 && markPending.length === 0,
    `${markAcceptance.status} · offen: ${JSON.stringify(markPending.map(entry => entry.slotId))}`)

  let markRevision = markAcceptance.json?.revision ?? 0
  for (const entry of (markAcceptance.json?.sessions ?? []).filter(row => row.confirmed && !row.accepted)) {
    const taken = await call(`${markBase}/sessions/${entry.slotId}/accept`, {
      method: 'POST', cookie: account.cookie, body: { revision: markRevision },
    })
    if (taken.status !== 200) {
      check(`Abnahme ${entry.slotId}`, false, `${taken.status} ${taken.text.slice(0, 160)}`)
      break
    }
    markRevision = taken.json?.revision ?? markRevision
  }
  const markDone = await call(`${markBase}/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('das Kapitel `mark` lässt sich abnehmen und schliessen',
    markDone.status === 200, `${markDone.status} ${markDone.text.slice(0, 160)}`)

  const imageryChapter = await call(`${base}/steps/imagery`, { cookie: account.cookie })
  check('… und das nächste Kapitel `imagery` ist danach erreichbar',
    imageryChapter.status === 200 && imageryChapter.json?.sessions?.['k.photo']?.state === 'open',
    `${imageryChapter.status} k.photo=${imageryChapter.json?.sessions?.['k.photo']?.state}`)

  // ══ 28 · Die Bildsprache: das Kapitel `imagery` (Brand Design D6, §2.6) ══
  //
  // ── WAS DIESER ABSCHNITT PRÜFT — UND WAS NICHT ─────────────────────────
  // Die REGELN (Vorbelegung aus der DNA, die vier Achsen mit ihren
  // Gegenstücken, beide Slot-Werte hin und zurück, die Strichstärke-Rechnung)
  // sind vollständig in `tests/brandDesignImagery.test.ts` belegt. HIER wird
  // geprüft, was ein Unit-Test nicht sehen kann: dass die Bühne Farbwelt UND
  // Schriftpaar zugeliefert bekommt, dass die drei Skizzen wirklich aus der
  // BESTÄTIGTEN Farbwelt gezeichnet werden (und keine Bilddatei laden), dass
  // die Strichstärke als `stroke-width` im Dokument steht, dass die
  // Invarianten an der Route greifen — und dass das Kapitel durchläuft.
  //
  // Wie in 25 bis 27 gilt: die VORBELEGUNG schreibt der Browser (Autosave,
  // s. `useBrandImageryWorld`). SSR RECHNET sie aber und malt sie hin, und
  // daran hängen die Prüfungen unten.
  //
  // DIE ERWARTETEN WERTE STEHEN ALS LITERAL und werden nicht aus der Antwort
  // abgeleitet (Beweis-Regel 1): die Tinte der Skizzen ist dieselbe `#352217`
  // wie in Abschnitt 27, und der Linien-Satz hat 1,5 px.
  console.log('\n28 · Brand Design: die Bildsprache (D6)')

  const imageryBase = `${base}/steps/imagery`
  const imageryPage = async () => call(`/de/brand/${profileId}/imagery`, { cookie: account.cookie })
  const sketchInk = '#352217'
  const principles = ['daylight', 'contrast', 'closeup']

  /**
   * ERST EINE ECHTE DNA, DANN DIE VORBELEGUNG PRÜFEN.
   *
   * `g.mix` steht seit Abschnitt 24 als PLATZHALTER in der Ablage (drei Blöcke
   * „Platzhalter") — für die Ketten davor reichte das, weil sie nur `stale`
   * und Zustände prüfen. Hier nicht: die Vorbelegung dieses Kapitels HÄNGT an
   * der Bildwelt, und gegen einen Platzhalter fiele jede Karte auf den
   * Rückfall zurück. Ein Beweis, der das nicht merkt, prüft den Rückfall und
   * nennt ihn DNA. Deshalb steht hier ein echter Mix-Wert (Kailua: Bildwelt
   * „Nah am Handwerk", Formsprache „Weich gerundet") — geschrieben wie in
   * Abschnitt 24 direkt in die Ablage, weil das Kapitel `dna` längst
   * abgeschlossen ist.
   */
  const realMix = [
    '## Visueller Stil\nRedaktionell · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Ästhetische Epoche\nZeitlos · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Formsprache\nWeich gerundet · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Typografie-Charakter\nBuchhafte Serif · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Farb-Charakter\nErdig gedämpft · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Bildwelt\nNah am Handwerk · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Komposition\nRuhig und luftig · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Materialität\nPapier, matt · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Bewegungs-Charakter\nRuhig · Eine Stufe ruhiger · Aus eurer Foundation',
    '## Grundstimmung\nWarm einladend · Eine Stufe ruhiger · Aus eurer Foundation',
  ].join('\n\n')
  await writeDnaSlots((slots) => {
    slots['g.mix'] = { ...slots['g.mix'], latestDraft: realMix, confirmed: realMix }
  })

  const imageryDetail = await call(imageryBase, { cookie: account.cookie })
  check('die Bühne bekommt Farbwelt UND Schriftpaar aus zwei fremden Kapiteln',
    String(imageryDetail.json?.sourceValues?.['g.mix'] ?? '').includes('Nah am Handwerk')
    && imageryDetail.json?.sourceValues?.['h.base'] === '#4a3123'
    && imageryDetail.json?.sourceValues?.['h.neutral'] === 'warm'
    && imageryDetail.json?.sourceValues?.['h.accent'] === '#22392f'
    && imageryDetail.json?.sourceValues?.['i.pair'] === 'editorial',
    JSON.stringify(imageryDetail.json?.sourceValues ?? {}).slice(0, 240))

  const imageryView = await imageryPage()
  check('die Werkstatt zeigt den Bildsprache-Abschnitt',
    imageryView.status === 200 && imageryView.text.includes('data-brand-imagery'),
    `${imageryView.status} ${imageryView.text.length} Zeichen`)
  check('… mit allen drei Prinzipien des Katalogs',
    principles.every(id => imageryView.text.includes(`data-imagery-principle="${id}"`)),
    principles.filter(id => !imageryView.text.includes(`data-imagery-principle="${id}"`)).join(', '))

  /**
   * Der Ausschnitt EINER Karte: von ihrem Haken bis zum nächsten
   * `data-imagery-`. Ohne diese Grenze fände ein `includes` den Chip
   * irgendwo auf der Seite und nicht auf DIESER Karte.
   */
  const cardChunk = (html, id) => {
    const start = html.indexOf(`data-imagery-principle="${id}"`)
    if (start < 0) return ''
    const next = html.indexOf('data-imagery-', start + 1)
    return html.slice(start, next < 0 ? html.length : next)
  }

  /**
   * DIE VORBELEGUNG AUS DER DNA: Bildwelt „Nah am Handwerk" ⇒ Prinzip
   * `closeup`, Formsprache „Weich gerundet" ⇒ Icon-Satz `regular`. Der Chip
   * steht dreimal auf der Seite — einmal je Abschnitt (Prinzip, Illustration,
   * Icons), nicht einmal insgesamt.
   */
  check('… und mit genau drei markierten Vorschlägen — einer je Abschnitt',
    imageryView.text.split('Aus eurer DNA').length - 1 === 3,
    `${imageryView.text.split('Aus eurer DNA').length - 1}× gefunden`)
  check('der Vorschlag ist das Prinzip der DNA-Bildwelt („Nah am Handwerk" ⇒ `closeup`)',
    cardChunk(imageryView.text, 'closeup').includes('Aus eurer DNA')
    && !cardChunk(imageryView.text, 'daylight').includes('Aus eurer DNA'),
    'der Chip steht nicht auf der Karte „closeup"')

  /**
   * KEINE FOTOS, SONDERN GEZEICHNETE FLÄCHEN (§1.4) — und sie tragen die
   * gerechneten Farben der BESTÄTIGTEN Farbwelt, nicht die Notfarbe.
   */
  check('die Skizzen sind gezeichnet, nicht geladen — kein `img`, kein Bild-Pfad',
    imageryView.text.includes('viewBox="0 0 160 100"')
    && !/data-brand-imagery[\s\S]*?<img/.test(imageryView.text),
    'ein Bild-Element im Bildsprache-Abschnitt')
  check('… und sie sind in der gerechneten Tinte der bestätigten Farbwelt gezeichnet',
    imageryView.text.includes(sketchInk), `Tinte ${sketchInk} nicht gefunden`)

  // ── DIE STRICHSTÄRKE IST MESSBAR, NICHT BEHAUPTET ──────────────────────
  check('jeder Icon-Satz trägt seine Probe mit echtem `stroke-width`',
    imageryView.text.includes('data-imagery-stroke="regular"')
    && imageryView.text.includes('stroke-width="1.5"')
    && imageryView.text.includes('stroke-width="2.25"'),
    'keine Probe mit 1.5 und 2.25 gefunden')
  check('die Strichstärke-Regel steht auf der Seite und nennt die Schrift',
    imageryView.text.includes('data-imagery-stroke-rule')
    && imageryView.text.includes('Source Serif 4')
    && imageryView.text.includes('1,5 px'),
    'Regel, Familie oder Zahl fehlen')

  // ── EIN ANDERES PRINZIP ÄNDERT DIE KARTEN UND DAS DO & DON'T ───────────
  //
  // Die Zeile „Gestellte Gruppenbilder mit Daumen hoch" gehört zur Achse
  // „Menschen" von `daylight`; unter `closeup` steht dort etwas anderes.
  const dodontBefore = imageryView.text.includes('Menschen als Staffage neben dem Produkt')
  check('Vorprobe: das Do & Don’t zeigt die Achsen des vorbelegten Prinzips',
    dodontBefore, 'die Don’t-Zeile von „closeup" fehlt')

  const pickPrinciple = await call(imageryBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('imagery'),
      slots: { 'k.photo': { value: [
        '## Prinzip\nTageslicht, nichts gestellt · Aus der Bildwelt „dokumentarisch": weiches Fensterlicht zeigt, was da ist — Studioblitz zeigt, was inszeniert wurde.',
        '## Licht\nWeiches Seitenlicht, sichtbare Schatten, keine Aufheller.',
        '## Ausschnitt\nWeiter Ausschnitt, Raum um das Motiv.',
        '## Menschen\nMenschen bei der Arbeit, nie in die Kamera lächelnd.',
        '## Farbigkeit\nGedämpfte Töne aus eurer Farbwelt, der Akzent sparsam.',
      ].join('\n\n') } },
    },
  })
  check('ein anderes Prinzip lässt sich wählen',
    pickPrinciple.status === 200, `${pickPrinciple.status} ${pickPrinciple.text.slice(0, 160)}`)
  const daylightView = await imageryPage()
  check('… die Seite zeigt es als gewählt',
    /data-imagery-principle="daylight"[^>]*aria-pressed="true"/.test(daylightView.text),
    'die Karte „daylight" ist nicht als gewählt markiert')
  check('… und das Do & Don’t hat sich mitgedreht',
    daylightView.text.includes('Gestellte Gruppenbilder mit Daumen hoch')
    && !daylightView.text.includes('Menschen als Staffage neben dem Produkt'),
    'die Zeilen des neuen Prinzips fehlen oder die alten stehen noch da')

  // ── DIE REGEL IST EINE AUSKUNFT, KEIN TOR (§2.6) ───────────────────────
  const heavyIcons = await call(imageryBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('imagery'), slots: { 'k.icons': { value: 'bold', confirmed: true } } },
  })
  check('ein kräftiger Icon-Satz lässt sich wählen UND bestätigen',
    heavyIcons.status === 200, `${heavyIcons.status} ${heavyIcons.text.slice(0, 160)}`)
  const heavyView = await imageryPage()
  check('… die Seite meldet die Strichstärke gegen die Schrift, ohne zu sperren',
    heavyView.text.includes('Kräftiger als eure Schrift') && heavyView.text.includes('2,25 px'),
    'der Hinweis zur zu kräftigen Strichstärke fehlt')

  // ── EINE ERFUNDENE ID IST KEINE WAHL (Invariante `oneOf`, D6) ──────────
  const reopenIcons = await call(imageryBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('imagery'), slots: { 'k.icons': { confirmed: false } } },
  })
  check('Vorprobe: „Korrigieren" öffnet die Icon-Wahl wieder',
    reopenIcons.status === 200, `${reopenIcons.status} ${reopenIcons.text.slice(0, 200)}`)
  const proseIcons = await call(imageryBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('imagery'),
      slots: { 'k.icons': { value: 'Feine Linien, wie in der Schrift', confirmed: true } },
    },
  })
  check('eine erfundene Icon-Wahl wird abgewiesen — `invariant_violated`',
    proseIcons.status >= 400 && proseIcons.json?.reason === 'invariant_violated',
    `${proseIcons.status} ${proseIcons.text.slice(0, 200)}`)
  const proseIllustration = await call(imageryBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('imagery'),
      slots: { 'k.illustration': { value: 'gezeichnet, aber sparsam', confirmed: true } },
    },
  })
  check('dasselbe für eine erfundene Illustrations-Sprache',
    proseIllustration.status >= 400 && proseIllustration.json?.reason === 'invariant_violated',
    `${proseIllustration.status} ${proseIllustration.text.slice(0, 200)}`)

  // ── DAS KAPITEL LÄSST SICH ZU ENDE GEHEN ───────────────────────────────
  //
  // `k.photo` und `k.dodont` schreibt sonst der Browser (s. Kopf); hier stehen
  // Werte in der FORM, die die Regeln erzeugen — fünf Blöcke und sechs Zeilen.
  const dodontPlaceholder = [
    'Weiches Seitenlicht, sichtbare Schatten, keine Aufheller. — Don’t: Studioblitz und ausgeleuchtete Flächen ohne einen einzigen Schatten.',
    'Weiter Ausschnitt, Raum um das Motiv. — Don’t: Enge Ausschnitte, die den Ort verschweigen.',
    'Menschen bei der Arbeit, nie in die Kamera lächelnd. — Don’t: Gestellte Gruppenbilder mit Daumen hoch.',
    'Gedämpfte Töne aus eurer Farbwelt, der Akzent sparsam. — Don’t: Farbfilter und Sättigungs-Regler, die eure Töne verschieben.',
    'Feine Konturzeichnungen in EINER Strichstärke. — Don’t: Zeichnungen aus fremden Bibliotheken mit anderem Strich.',
    'Icons als Linie, 1,5 px stark — dieselbe Stärke überall. — Don’t: Icons aus zwei Sätzen auf einer Seite.',
  ].map(line => `- Do: ${line}`).join('\n')
  await seedConfirmed('imagery', {
    'k.photo': [
      '## Prinzip\nNah am Handwerk · Textur statt Szene: Material, Werkzeug, Spur der Arbeit.',
      '## Licht\nDiffuses, gleichmäßiges Licht ohne Drama.',
      '## Ausschnitt\nSehr nah: das Detail füllt das Bild.',
      '## Menschen\nHände im Bild, Gesicht optional.',
      '## Farbigkeit\nNur Töne aus eurer Farbwelt, keine Fremdfarbe.',
    ].join('\n\n'),
    'k.illustration': 'line',
    'k.icons': 'regular',
    'k.dodont': dodontPlaceholder,
  })

  const imageryAcceptance = await call(`${imageryBase}/acceptance`, { cookie: account.cookie })
  const imageryPending = (imageryAcceptance.json?.sessions ?? []).filter(entry => entry.required && !entry.confirmed)
  check('nach den vier Bestätigungen steht keine Pflicht-Session mehr offen',
    imageryAcceptance.status === 200 && imageryPending.length === 0,
    `${imageryAcceptance.status} · offen: ${JSON.stringify(imageryPending.map(entry => entry.slotId))}`)

  let imageryRevision = imageryAcceptance.json?.revision ?? 0
  for (const entry of (imageryAcceptance.json?.sessions ?? []).filter(row => row.confirmed && !row.accepted)) {
    const taken = await call(`${imageryBase}/sessions/${entry.slotId}/accept`, {
      method: 'POST', cookie: account.cookie, body: { revision: imageryRevision },
    })
    if (taken.status !== 200) {
      check(`Abnahme ${entry.slotId}`, false, `${taken.status} ${taken.text.slice(0, 160)}`)
      break
    }
    imageryRevision = taken.json?.revision ?? imageryRevision
  }
  const imageryDone = await call(`${imageryBase}/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('das Kapitel `imagery` lässt sich abnehmen und schliessen',
    imageryDone.status === 200, `${imageryDone.status} ${imageryDone.text.slice(0, 160)}`)

  const motionChapter = await call(`${base}/steps/motion`, { cookie: account.cookie })
  check('… und das letzte Kapitel `motion` ist danach erreichbar',
    motionChapter.status === 200 && motionChapter.json?.sessions?.['l.tempo']?.state === 'open',
    `${motionChapter.status} l.tempo=${motionChapter.json?.sessions?.['l.tempo']?.state}`)

  // ══ 29 · Das Zeichen, Stufe 3: die KI-Entwürfe (Brand Design D5c, §2.5) ══
  //
  // ── WARUM DIESER ABSCHNITT MIT DEM ERSATZ LÄUFT ────────────────────────
  // Ein echter Lauf sind VIER Bild-Aufrufe an ein Bildmodell und kostet Geld.
  // `BRAND_DEV_STUB_IMAGE=1` erzeugt stattdessen vier ECHTE, deterministische
  // PNGs aus der bestätigten Farbwelt (`brandMarkDraftStubPng`) — echte Bytes
  // und kein Platzhalter, weil sonst genau die Kette ungeprüft bliebe, um die
  // es geht: Klemmung, Bucket, Zeile, Ausliefer-Route.
  //
  // Der Ersatz BUCHT die Drossel mit (anders als der Entwurfs-Stub) — nur
  // deshalb lässt sich der vierte Lauf des Tages überhaupt prüfen.
  //
  // ── WAS EIN UNIT-TEST NICHT SEHEN KANN ─────────────────────────────────
  // Die REGELN (Slot-Wert, Prompt-Hash, Namen, die Interna der Session) sind
  // in `tests/brandMarkDrafts.test.ts` belegt. HIER wird geprüft, was nur eine
  // laufende Kette zeigt: dass vier Dateien wirklich im Bucket liegen, dass
  // sie NUR beim Besitzer ankommen und mit `private, no-store`, dass die
  // Herkunft an der Zeile steht, dass „Behalten" den Slot bewegt und ihn NIE
  // bestätigt — und dass von alldem NICHTS in den Schnappschuss reist.
  console.log('\n29 · Brand Design: die KI-Entwürfe des Zeichens (D5c)')

  const draftsBase = `${base}/mark/drafts`

  const draftsEmpty = await call(draftsBase, { cookie: account.cookie })
  check('vor dem ersten Lauf: die Liste ist leer und nennt den Deckel',
    draftsEmpty.status === 200 && (draftsEmpty.json?.items ?? []).length === 0
    && draftsEmpty.json?.max === 12,
    `${draftsEmpty.status} ${JSON.stringify(draftsEmpty.json ?? null)}`)

  /**
   * OB DER ERSATZ LÄUFT, SAGT DER SERVER — nicht `process.env` DIESES
   * Prozesses: `BRAND_DEV_STUB_IMAGE` wirkt im DEV-SERVER, und das Skript
   * spricht ihn über HTTP an (dieselbe Falle wie in Abschnitt 23).
   *
   * 503 `image_unavailable` ist die vollständige, richtige Antwort einer
   * Instanz OHNE Bild-Modell (§2.19 Frage 1: „bis dahin Stufe 3 hinter dem
   * Config-Gate aus — das Kapitel funktioniert ohne sie") und damit selbst
   * eine geprüfte Zusage, keine Ausrede.
   */
  const draftRun1 = await call(draftsBase, { method: 'POST', cookie: account.cookie })
  const draftsStub = draftRun1.status === 200
  if (!draftsStub) {
    check('ohne Bild-Modell antwortet der Lauf ruhig mit 503 `image_unavailable`',
      draftRun1.status === 503 && draftRun1.json?.reason === 'image_unavailable',
      `${draftRun1.status} ${JSON.stringify(draftRun1.json?.reason ?? null)}`)
    check('… und die Liste bleibt leer — das Kapitel läuft mit Stufe 1 und 2 weiter',
      ((await call(draftsBase, { cookie: account.cookie })).json?.items ?? []).length === 0,
      'es liegen doch Entwürfe da')
  }
  else {
    const firstItems = draftRun1.json?.items ?? []
    for (const item of firstItems) cleanup.drafts.push(item.id)

    check('der Lauf antwortet 200, legt VIER Entwürfe an und nennt das Rest-Kontingent',
      draftRun1.json?.created === 4 && firstItems.length === 4
      && draftRun1.json?.quota?.limit === 3 && draftRun1.json?.quota?.remaining === 2,
      `${draftRun1.json?.created} · ${firstItems.length} · ${JSON.stringify(draftRun1.json?.quota ?? null)}`)

    // DIE HERKUNFT IST DIE LEITPLANKE (§1.11 b) — sie steht an der ZEILE, nicht
    // nur im Ereignis-Funnel, und alle vier tragen denselben Prompt-Hash: sie
    // stammen aus EINEM Lauf, und genau das soll die Karte sagen können.
    const hashes = new Set(firstItems.map(item => item.promptHash))
    check('… jeder Entwurf trägt Modell, Prompt-Hash und einen Namen',
      firstItems.every(item => item.model === 'dev-stub'
        && /^[0-9a-f]{16}$/.test(String(item.promptHash))
        && /^Entwurf \d+$/.test(String(item.title))
        && item.kept === false
        && typeof item.createdAt === 'string' && item.createdAt.length > 0),
      JSON.stringify(firstItems[0] ?? null))
    check('… und alle vier denselben Hash — sie stammen aus EINEM Lauf',
      hashes.size === 1, `${hashes.size} verschiedene Hashes`)

    // ── VIER ZEILEN, VIER DATEIEN ─────────────────────────────────────────
    const draftRows = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_mark_drafts',
      queries: [Query.equal('profileId', profileId), Query.limit(50)],
    }).catch(() => ({ rows: [] }))
    check('vier Zeilen stehen in `brand_mark_drafts`', draftRows.rows.length === 4,
      String(draftRows.rows.length))

    let filesFound = 0
    for (const item of firstItems) {
      const file = await storage.getFile({ bucketId: 'brand-drafts', fileId: item.id })
        .catch(() => null)
      if (file) filesFound += 1
    }
    check('… und vier Dateien im Bucket `brand-drafts`', filesFound === 4, String(filesFound))

    // ── DIE AUSLIEFERUNG: NUR DER BESITZER, UND NIE AUS DEM CACHE ─────────
    const firstDraft = firstItems[0]
    const imagePath = `${draftsBase}/${firstDraft.id}/image`
    const ownImage = await callBinary(imagePath, { cookie: account.cookie })
    check('das Bild kommt beim Besitzer an — als PNG, mit `private, no-store`',
      ownImage.status === 200
      && String(ownImage.headers['content-type']).startsWith('image/png')
      && String(ownImage.headers['cache-control']) === 'private, no-store'
      && ownImage.body.length > 0
      && ownImage.body.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47])),
      `${ownImage.status} ${ownImage.headers['content-type']} · ${ownImage.headers['cache-control']} · ${ownImage.body.length} Bytes`)

    const strangerImage = await callBinary(imagePath, { cookie: stranger.cookie })
    check('fremdes Konto: 404 (Datentür, nicht 403)', strangerImage.status === 404,
      String(strangerImage.status))
    const guestImage = await callBinary(imagePath)
    check('ohne Anmeldung: 401/404, nie ein Bild',
      guestImage.status === 401 || guestImage.status === 404, String(guestImage.status))
    const inventedImage = await callBinary(`${draftsBase}/${inventedId}/image`, { cookie: account.cookie })
    check('eine erfundene Entwurfs-Id: 404', inventedImage.status === 404,
      String(inventedImage.status))

    // ── „BEHALTEN" IST DIE EINZIGE ENTSCHEIDUNG — UND SIE BEWEGT DEN SLOT ──
    const keepRes = await call(`${draftsBase}/${firstDraft.id}`, {
      method: 'PATCH', cookie: account.cookie, body: { kept: true },
    })
    check('„Behalten" wird angenommen und steht danach an der Zeile',
      keepRes.status === 200 && keepRes.json?.item?.kept === true
      && (keepRes.json?.items ?? []).filter(item => item.kept).length === 1,
      `${keepRes.status} ${JSON.stringify(keepRes.json?.item ?? null)}`)

    const renameRes = await call(`${draftsBase}/${firstDraft.id}`, {
      method: 'PATCH', cookie: account.cookie, body: { title: '  Bogen \n über  Grundlinie ' },
    })
    check('… ein Name lässt sich setzen und wird auf EINE Zeile geklemmt',
      renameRes.status === 200 && renameRes.json?.item?.title === 'Bogen über Grundlinie',
      `${renameRes.status} ${JSON.stringify(renameRes.json?.item?.title ?? null)}`)

    const emptyPatch = await call(`${draftsBase}/${firstDraft.id}`, {
      method: 'PATCH', cookie: account.cookie, body: {},
    })
    check('GEGENPROBE: ein PATCH ohne Feld ⇒ 400, nicht 200',
      emptyPatch.status === 400, String(emptyPatch.status))

    const markRow = await tablesDB.getRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_mark`,
    })
    const draftSlot = JSON.parse(markRow.slots || '{}')['j.drafts'] ?? null
    check('der Slot `j.drafts` nennt den behaltenen Entwurf mit seiner Herkunft',
      typeof draftSlot?.latestDraft === 'string'
      && draftSlot.latestDraft.includes('## Behalten 1 · Bogen über Grundlinie')
      && draftSlot.latestDraft.includes('Modell: dev-stub')
      && draftSlot.latestDraft.includes('Prompt: '),
      JSON.stringify(draftSlot?.latestDraft ?? null))
    check('… und er ist NICHT bestätigt — sonst reiste er über `confirmedSlotValues` ins Dokument',
      !draftSlot?.confirmed, JSON.stringify(draftSlot?.confirmed ?? null))
    check('… und er trägt WEDER ein Bild NOCH eine Adresse',
      !String(draftSlot?.latestDraft ?? '').includes('data:')
      && !String(draftSlot?.latestDraft ?? '').includes('http')
      && !String(draftSlot?.latestDraft ?? '').includes('brand-drafts'),
      'im Slot-Wert steht eine Adresse oder ein Bild')

    // ── DIE WERKSTATT ZEIGT DIE FLÄCHE — MIT BEIDEN HINWEISEN ─────────────
    const markWithDrafts = await call(`/de/brand/${profileId}/mark`, { cookie: account.cookie })
    check('die Werkstatt zeigt den Entwürfe-Abschnitt',
      markWithDrafts.status === 200 && markWithDrafts.text.includes('data-brand-drafts'),
      `${markWithDrafts.status} ${markWithDrafts.text.length} Zeichen`)
    /**
     * DER MARKENRECHTS-HINWEIS STEHT IM SSR — ER HÄNGT AN KEINER KARTE.
     *
     * Der Vermerk „Entwurf, kein geprüftes Logo" hängt dagegen an JEDER Karte,
     * und die Karten entstehen erst nach dem Laden der Liste im Browser
     * (`onMounted`). Er ist deshalb NICHT im SSR-Text und wird im eigenen
     * Klick geprüft, nicht hier — eine Prüfung, die ihn im SSR suchte, wäre
     * entweder rot oder zwänge dazu, den Satz aus der Karte zu lösen, an die
     * er gehört. Was das SSR sehr wohl trägt, ist die Nicht-Behauptung im
     * Einleitungssatz („kein fertiges Logo, keine Prüfung, kein Anspruch auf
     * Schutzfähigkeit") — und die wird hier mitgeprüft.
     */
    check('… mit dem Markenrechts-Hinweis und der Nicht-Behauptung im Einleitungssatz',
      markWithDrafts.text.includes('data-drafts-trademark')
      && markWithDrafts.text.includes('kein fertiges Logo')
      && markWithDrafts.text.includes('Schutzfähigkeit'),
      'einer der zwei Pflicht-Sätze fehlt auf der Seite')

    // ── LEITPLANKE §1.11 b: ENTWÜRFE REISEN NICHT ────────────────────────
    //
    // GEGENPROBE MIT ANLAUF wie bei der Lesung (Abschnitt 23): der Slot wird
    // von Hand BESTÄTIGT — genau der Fehler, den D8 machen könnte. Reiste er
    // danach in den Schnappschuss, wäre „Entwürfe bleiben privat" eine
    // Behauptung.
    const leakRow = await tablesDB.getRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_mark`,
    })
    const leakSlots = JSON.parse(leakRow.slots || '{}')
    leakSlots['j.drafts'] = {
      ...leakSlots['j.drafts'],
      confirmed: leakSlots['j.drafts']?.latestDraft ?? '## Behalten 1 · Bogen über Grundlinie',
    }
    await tablesDB.updateRow({
      databaseId, tableId: 'brand_steps', rowId: `${profileId}_mark`,
      data: { slots: JSON.stringify(leakSlots) },
    })
    const sharedWithDrafts = await call(`${base}/share`, {
      method: 'POST', cookie: account.cookie, body: {},
    })
    check('Vorprobe: der Share-Link lässt sich neu veröffentlichen',
      sharedWithDrafts.status === 200 || sharedWithDrafts.status === 201,
      `${sharedWithDrafts.status} ${sharedWithDrafts.text.slice(0, 120)}`)
    const shareRows3 = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_shares',
      queries: [Query.equal('profileId', profileId), Query.limit(5)],
    }).catch(() => ({ rows: [] }))
    const snapshot3 = shareRows3.rows.map(row => String(row.snapshot ?? '')).join('\n')
    check('LEITPLANKE: der Schnappschuss trägt WEDER `j.drafts` NOCH einen Entwurf',
      snapshot3.length > 0
      && !snapshot3.includes('j.drafts')
      && !snapshot3.includes('Bogen über Grundlinie')
      && !snapshot3.includes('dev-stub')
      && !firstItems.some(item => snapshot3.includes(item.id)),
      `${snapshot3.length} Zeichen`)

    // Auch das DOKUMENT der Werkstatt zeigt keinen Entwurf.
    const documentWithDrafts = await call(`${base}/document`, { cookie: account.cookie })
    check('… und das Dokument ebenso wenig',
      documentWithDrafts.status === 200
      && !documentWithDrafts.text.includes('Bogen über Grundlinie')
      && !documentWithDrafts.text.includes('dev-stub'),
      `${documentWithDrafts.status} ${documentWithDrafts.text.length} Zeichen`)

    // ── VERWERFEN LÖSCHT WIRKLICH — ZEILE UND DATEI ──────────────────────
    const doomed = firstItems[3]
    const discarded = await call(`${draftsBase}/${doomed.id}`, {
      method: 'DELETE', cookie: account.cookie,
    })
    check('Verwerfen antwortet 200 und die Liste ist einen kürzer',
      discarded.status === 200 && (discarded.json?.items ?? []).length === 3,
      `${discarded.status} ${(discarded.json?.items ?? []).length}`)
    const goneFile = await storage.getFile({ bucketId: 'brand-drafts', fileId: doomed.id })
      .catch(error => ({ code: error?.code ?? 0 }))
    check('… und die DATEI ist aus dem Bucket weg (404)', goneFile?.code === 404,
      JSON.stringify(goneFile?.code ?? 'existiert noch'))

    // ── DIE DROSSEL: DREI LÄUFE JE MARKE UND TAG ─────────────────────────
    const draftRun2 = await call(draftsBase, { method: 'POST', cookie: account.cookie })
    for (const item of draftRun2.json?.items ?? []) cleanup.drafts.push(item.id)
    const draftRun3 = await call(draftsBase, { method: 'POST', cookie: account.cookie })
    for (const item of draftRun3.json?.items ?? []) cleanup.drafts.push(item.id)
    check('zweiter und dritter Lauf gehen — und das Kontingent zählt herunter',
      draftRun2.status === 200 && draftRun2.json?.quota?.remaining === 1
      && draftRun3.status === 200 && draftRun3.json?.quota?.remaining === 0,
      `${draftRun2.status}/${draftRun2.json?.quota?.remaining} · ${draftRun3.status}/${draftRun3.json?.quota?.remaining}`)

    /**
     * DIE PRÜFREIHENFOLGE IST DER PUNKT: der Platz-Deckel steht in der Route
     * VOR der Drossel. Nach drei Läufen liegen elf Entwürfe, für einen vierten
     * Lauf ist kein Platz — die Antwort ist deshalb 409 und nicht 429, obwohl
     * auch das Tageskontingent erschöpft ist.
     */
    const noRoom = await call(draftsBase, { method: 'POST', cookie: account.cookie })
    check('GEGENPROBE Platz-Deckel: kein Raum für vier weitere ⇒ 409 `drafts_limit_reached`',
      noRoom.status === 409 && noRoom.json?.reason === 'drafts_limit_reached',
      `${noRoom.status} ${JSON.stringify(noRoom.json?.reason ?? null)}`)

    // Geleert wird AN DER ROUTE VORBEI (der eigene Eimer `brand:drafts` lässt
    // 12 Schreibvorgänge je Minute, und dieser Beweis braucht seine für die
    // Läufe). Danach ist Platz — und nur der Tages-Deckel steht noch im Weg.
    const leftovers = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_mark_drafts',
      queries: [Query.equal('profileId', profileId), Query.limit(50)],
    }).catch(() => ({ rows: [] }))
    for (const row of leftovers.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_mark_drafts', rowId: row.$id })
        .catch(() => {})
      await storage.deleteFile({ bucketId: 'brand-drafts', fileId: row.$id }).catch(() => {})
    }
    const draftRun4 = await call(draftsBase, { method: 'POST', cookie: account.cookie })
    check('GEGENPROBE Drossel: der VIERTE Lauf am selben Tag ⇒ 429 `brand_drafts_limit`',
      draftRun4.status === 429 && draftRun4.json?.reason === 'brand_drafts_limit',
      `${draftRun4.status} ${JSON.stringify(draftRun4.json?.reason ?? null)}`)

    // ── DIE EREIGNISSE: KENNZAHLEN, KEIN INHALT ──────────────────────────
    const draftEvents = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_events',
      queries: [Query.equal('profileId', profileId), Query.equal('type', 'design.drafts.run'), Query.limit(20)],
    }).catch(() => ({ rows: [] }))
    check('jeder Lauf steht im Funnel — drei Läufe, drei Zeilen',
      draftEvents.rows.length === 3, String(draftEvents.rows.length))
    check('… und keine Zeile trägt einen Prompt, ein Bild oder ein Briefing-Feld',
      draftEvents.rows.every((row) => {
        const payload = String(row.payload ?? '')
        return payload.includes('model')
          && payload.includes('promptHash')
          && !payload.includes('base64')
          && !payload.includes('Charakter')
          && !payload.includes('logo draft')
      }),
      JSON.stringify(draftEvents.rows[0]?.payload ?? null))
  }

  // ── EIN FREMDES KONTO SIEHT AUCH HIER NICHTS ───────────────────────────
  const foreignDrafts = await call(draftsBase, { method: 'POST', cookie: stranger.cookie })
  check('fremdes Konto: der Lauf antwortet 404 (Datentür, nicht 403)',
    foreignDrafts.status === 404, String(foreignDrafts.status))
  const guestDrafts = await call(draftsBase, { method: 'POST' })
  check('… ohne Anmeldung: 401/404, nie ein Lauf',
    guestDrafts.status === 401 || guestDrafts.status === 404, String(guestDrafts.status))
  const foreignDraftList = await call(draftsBase, { cookie: stranger.cookie })
  check('… und die Liste ebenso: 404 für ein fremdes Konto',
    foreignDraftList.status === 404, String(foreignDraftList.status))

  // ══ 30 · Die Bewegung: das Kapitel `motion` (Brand Design D7, §2.7) ══════
  //
  // ── WAS DIESER ABSCHNITT PRÜFT — UND WAS NICHT ─────────────────────────
  // Die REGELN (Vorbelegung aus der DNA, die vier Tokens, beide Slot-Werte hin
  // und zurück, die sechs Sätze mit ihrem gerechneten Deckel) sind vollständig
  // in `tests/brandDesignMotion.test.ts` belegt. HIER wird geprüft, was ein
  // Unit-Test nicht sehen kann: dass die Bühne die GANZE Marke zugeliefert
  // bekommt (Farbwelt, Paar UND `i.rules` — die Wortmarke im Kopf der Szene),
  // dass die Szene wirklich mit der gerechneten Dauer läuft (`--ds-dur` steht
  // im Markup), dass ein Tempo-Wechsel jede Zahl auf der Seite mitzieht, dass
  // die Invarianten an der Route greifen — und dass das SECHSTE Kapitel
  // durchläuft und die Schicht damit „6 von 6" steht.
  //
  // Wie in 25 bis 28 gilt: die VORBELEGUNG schreibt der Browser (Autosave, s.
  // `useBrandMotionWorld`). SSR RECHNET sie aber und malt sie hin.
  //
  // DIE ERWARTETEN WERTE STEHEN ALS LITERAL und werden nicht aus der Antwort
  // abgeleitet (Beweis-Regel 1): ruhig ist 240 ms (120/240/384/60), knapp ist
  // 120 ms (60/120/192/60) — dieselben Zahlen wie im Katalog von D0.
  console.log('\n30 · Brand Design: die Bewegung (D7)')

  const motionBase = `${base}/steps/motion`
  const motionPage = async () => call(`/de/brand/${profileId}/motion`, { cookie: account.cookie })

  const motionDetail = await call(motionBase, { cookie: account.cookie })
  check('die Bühne bekommt die ganze Marke aus drei fremden Kapiteln',
    String(motionDetail.json?.sourceValues?.['g.mix'] ?? '').includes('Bewegungs-Charakter')
    && motionDetail.json?.sourceValues?.['h.base'] === '#4a3123'
    && motionDetail.json?.sourceValues?.['i.pair'] === 'editorial'
    && String(motionDetail.json?.sourceValues?.['i.rules'] ?? '').includes('600'),
    JSON.stringify(motionDetail.json?.sourceValues ?? {}).slice(0, 240))

  const motionView = await motionPage()
  check('die Werkstatt zeigt den Bewegungs-Abschnitt',
    motionView.status === 200 && motionView.text.includes('data-brand-motion'),
    `${motionView.status} ${motionView.text.length} Zeichen`)
  check('… mit allen drei Tempos des Katalogs',
    ['calm', 'lively', 'snappy'].every(id => motionView.text.includes(`data-motion-tempo="${id}"`)),
    'ein Tempo fehlt auf der Seite')

  /**
   * DIE VORBELEGUNG AUS DER DNA: Bewegungs-Charakter „Ruhig" (Abschnitt 28
   * hat den echten Mix geschrieben) ⇒ Tempo `calm` UND ein stillstehendes
   * Zeichen. Der Chip steht deshalb zweimal auf der Seite — einmal am Tempo,
   * einmal an der Zeichen-Antwort.
   */
  /**
   * DER AUSSCHNITT EINER KARTE — vom eigenen Merkmal bis zum nächsten Merkmal
   * DERSELBEN Art, spätestens aber bis `stop`.
   *
   * ZWEI FALLEN, beide beim Bau am eigenen Lauf gefunden: (1) bis zum nächsten
   * `data-motion-` zu schneiden ergäbe drei Zeichen — auf der Tempo-Karte folgt
   * sofort `data-motion-base`; (2) die LETZTE Karte hätte ohne `stop` den Rest
   * der Seite geschluckt, und die Gegenprobe „auf dieser Karte steht der Chip
   * NICHT" fände ihn im nächsten Abschnitt wieder.
   */
  const motionChunk = (html, attr, id, stop) => {
    const start = html.indexOf(`${attr}="${id}"`)
    if (start < 0) return ''
    const sibling = html.indexOf(`${attr}=`, start + 1)
    const limit = html.indexOf(stop, start + 1)
    const ends = [sibling, limit].filter(index => index > 0)
    return html.slice(start, ends.length ? Math.min(...ends) : html.length)
  }
  check('der Vorschlag ist das Tempo der DNA („Ruhig" ⇒ `calm`)',
    motionChunk(motionView.text, 'data-motion-tempo', 'calm', 'data-motion-token').includes('Aus eurer DNA')
    && !motionChunk(motionView.text, 'data-motion-tempo', 'snappy', 'data-motion-token').includes('Aus eurer DNA'),
    'der Chip steht nicht auf der Karte „calm"')
  check('… und das stillstehende Zeichen ist der Vorschlag dazu',
    motionChunk(motionView.text, 'data-motion-logo', 'no', 'data-motion-rules').includes('Aus eurer DNA')
    && !motionChunk(motionView.text, 'data-motion-logo', 'yes', 'data-motion-rules').includes('Aus eurer DNA'),
    'der Chip steht nicht auf der Karte „nein"')

  // ── DIE SZENE LÄUFT MIT DER GERECHNETEN DAUER, NICHT MIT EINER ZAHL AUS
  //    DEM MARKUP ──────────────────────────────────────────────────────────
  //
  // `--ds-dur` ist der Wert, mit dem die Szene wirklich rechnet (s.
  // `BwDesignScene`): steht dort 240ms, läuft dort auch 240 ms.
  /**
   * DIE GROSSE SZENE ist die im GEWÄHLTEN Tempo; die drei Karten darüber
   * behalten je ihre eigene Dauer (das ist ihr ganzer Zweck). Geprüft wird
   * deshalb ihr Ausschnitt und nicht die Seite — sonst stünde „240ms" auch
   * dann noch da, wenn die Wahl längst eine andere ist.
   */
  const bigScene = (html) => {
    const start = html.indexOf('data-motion-scene')
    return start < 0 ? '' : html.slice(start, start + 4000)
  }
  check('die Szene trägt die Grunddauer des ruhigen Tempos als `--ds-dur`',
    bigScene(motionView.text).includes('--ds-dur:240ms')
    && bigScene(motionView.text).includes('--ds-stagger:60ms'),
    'Dauer oder Versatz stehen nicht im Markup')
  check('… und die Schrift-Regeln des Kapitels davor sind mitgekommen',
    motionView.text.includes('--ds-heading-weight:600')
    && motionView.text.includes('--ds-heading-tracking:-0.5px'),
    'Gewicht oder Laufweite fehlen in der Szene')

  // ── DIE TOKEN-TABELLE IST DIE RECHNUNG, NICHT EINE ZWEITE MEINUNG ──────
  const tokenRow = (html, id) => {
    const start = html.indexOf(`data-motion-token="${id}"`)
    if (start < 0) return ''
    const next = html.indexOf('data-motion-token=', start + 1)
    return html.slice(start, next < 0 ? Math.min(html.length, start + 1200) : next)
  }
  check('die vier Tokens stehen mit den Zahlen des ruhigen Tempos da',
    tokenRow(motionView.text, 'fast').includes('data-motion-duration="120"')
    && tokenRow(motionView.text, 'base').includes('data-motion-duration="240"')
    && tokenRow(motionView.text, 'slow').includes('data-motion-duration="384"')
    && tokenRow(motionView.text, 'stagger').includes('data-motion-duration="60"'),
    '120/240/384/60 nicht vollständig in der Tabelle')
  check('… jedes mit seinem Namen und seinem Zweck',
    motionView.text.includes('motion.slow') && motionView.text.includes('Seitenwechsel, große Flächen.'),
    'Token-Name oder Zweck fehlen')

  // ── DIE REGELN FOLGEN AUS DEN ZWEI ENTSCHEIDUNGEN ──────────────────────
  check('die sechs Regeln stehen auf der Seite — mit dem gerechneten Deckel',
    motionView.text.includes('data-motion-rules')
    && motionView.text.includes('federt nie')
    && motionView.text.includes('Nichts läuft länger als 384 ms'),
    'Kurven-Regel oder Dauer-Deckel fehlen')
  check('… und der Satz zu „weniger Bewegung" ist immer dabei',
    motionView.text.includes('Endzustand sofort') && motionView.text.includes('Ersatz-Animation'),
    'der reduced-motion-Satz fehlt')
  check('der Schalter „weniger Bewegung simulieren" ist da',
    motionView.text.includes('data-motion-reduced') && motionView.text.includes('data-motion-play'),
    'Schalter oder Abspiel-Knopf fehlen')

  // ── EIN ANDERES TEMPO ZIEHT ALLES MIT ──────────────────────────────────
  const pickSnappy = await call(motionBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('motion'), slots: { 'l.tempo': { value: 'snappy' } } },
  })
  check('ein anderes Tempo lässt sich wählen',
    pickSnappy.status === 200, `${pickSnappy.status} ${pickSnappy.text.slice(0, 160)}`)
  const snappyView = await motionPage()
  check('… die Seite zeigt es als gewählt',
    /data-motion-tempo="snappy"[^>]*aria-pressed="true"/.test(snappyView.text),
    'die Karte „snappy" ist nicht als gewählt markiert')
  check('… die Tabelle rechnet neu (60/120/192)',
    tokenRow(snappyView.text, 'fast').includes('data-motion-duration="60"')
    && tokenRow(snappyView.text, 'base').includes('data-motion-duration="120"')
    && tokenRow(snappyView.text, 'slow').includes('data-motion-duration="192"'),
    'die Tabelle steht noch auf dem ruhigen Tempo')
  check('… die Szene läuft mit der neuen Dauer',
    bigScene(snappyView.text).includes('--ds-dur:120ms')
    && !bigScene(snappyView.text).includes('--ds-dur:240ms'),
    'in der Szene steht noch die alte Dauer')
  check('… und der Dauer-Deckel der Regeln wandert mit',
    snappyView.text.includes('Nichts läuft länger als 192 ms')
    && snappyView.text.includes('Kein Anlauf und kein Ausklang'),
    'Deckel oder Kurven-Regel stehen noch auf „ruhig"')

  // ── EIN KINETISCHES ZEICHEN SCHREIBT SEINE EIGENE REGEL ────────────────
  const pickKinetic = await call(motionBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: { revision: await stepRevision('motion'), slots: { 'l.logo': { value: 'yes' } } },
  })
  check('das kinetische Zeichen lässt sich wählen',
    pickKinetic.status === 200, `${pickKinetic.status} ${pickKinetic.text.slice(0, 160)}`)
  const kineticView = await motionPage()
  check('… und die Regel dazu nennt den Aufbau von 800 ms',
    kineticView.text.includes('800 ms') && kineticView.text.includes('Fassung ohne Bewegung'),
    'die Regel zum kinetischen Zeichen fehlt')

  // ── EINE ERFUNDENE ID IST KEINE WAHL (Invariante `oneOf`, D7) ──────────
  const proseTempo = await call(motionBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('motion'),
      slots: { 'l.tempo': { value: 'zügig, aber nicht hektisch', confirmed: true } },
    },
  })
  check('ein erfundenes Tempo wird abgewiesen — `invariant_violated`',
    proseTempo.status >= 400 && proseTempo.json?.reason === 'invariant_violated',
    `${proseTempo.status} ${proseTempo.text.slice(0, 200)}`)
  const proseLogo = await call(motionBase, {
    method: 'PATCH',
    cookie: account.cookie,
    body: {
      revision: await stepRevision('motion'),
      slots: { 'l.logo': { value: 'vielleicht später', confirmed: true } },
    },
  })
  check('dasselbe für ein „vielleicht" beim Zeichen',
    proseLogo.status >= 400 && proseLogo.json?.reason === 'invariant_violated',
    `${proseLogo.status} ${proseLogo.text.slice(0, 200)}`)

  // ── DAS KAPITEL LÄSST SICH ZU ENDE GEHEN ───────────────────────────────
  //
  // `l.transitions` und `l.rules` schreibt sonst der Browser (s. Kopf); hier
  // stehen die Werte in der FORM, die die Regeln erzeugen — vier beschriftete
  // Blöcke und sechs Zeilen, zum ruhigen Tempo.
  const calmEasing = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
  const transitionsValue = [
    `## motion.fast\n120 ms · ${calmEasing} · Hover, Fokus, kleine Zustände.`,
    `## motion.base\n240 ms · ${calmEasing} · Karten, Einblendungen, Menüs.`,
    `## motion.slow\n384 ms · ${calmEasing} · Seitenwechsel, große Flächen.`,
    `## motion.stagger\n60 ms · ${calmEasing} · Versatz zwischen Geschwistern (Listen, Karten).`,
  ].join('\n\n')
  const motionRulesValue = [
    'Bewegung erklärt einen Zusammenhang oder sie entfällt — Dekoration bewegt sich nie.',
    'Nur zwei Eigenschaften gleichzeitig: Deckkraft und eine Verschiebung. Keine Rotation, keine Skalierung von Text.',
    'Kein Überschwingen: die Kurve läuft aus, sie federt nie — das ruhige Tempo lebt vom Ausklang.',
    'Das Zeichen steht still — auch im Vorspann eines Videos. Es gibt keine bewegte Fassung, die jemand pflegen müsste.',
    'Nichts läuft länger als 384 ms — das ist motion.slow. Wer mehr braucht, hat eine Animation und keinen Übergang.',
    'Bei „weniger Bewegung" im Betriebssystem steht der Endzustand sofort — keine langsamere Ersatz-Animation, kein Ausblenden „light".',
  ].map(line => `- ${line}`).join('\n')
  await seedConfirmed('motion', {
    'l.tempo': 'calm',
    'l.transitions': transitionsValue,
    'l.logo': 'no',
    'l.rules': motionRulesValue,
  })

  const motionAcceptance = await call(`${motionBase}/acceptance`, { cookie: account.cookie })
  const motionPending = (motionAcceptance.json?.sessions ?? []).filter(entry => entry.required && !entry.confirmed)
  check('nach den vier Bestätigungen steht keine Pflicht-Session mehr offen',
    motionAcceptance.status === 200 && motionPending.length === 0,
    `${motionAcceptance.status} · offen: ${JSON.stringify(motionPending.map(entry => entry.slotId))}`)

  let motionRevision = motionAcceptance.json?.revision ?? 0
  for (const entry of (motionAcceptance.json?.sessions ?? []).filter(row => row.confirmed && !row.accepted)) {
    const taken = await call(`${motionBase}/sessions/${entry.slotId}/accept`, {
      method: 'POST', cookie: account.cookie, body: { revision: motionRevision },
    })
    if (taken.status !== 200) {
      check(`Abnahme ${entry.slotId}`, false, `${taken.status} ${taken.text.slice(0, 160)}`)
      break
    }
    motionRevision = taken.json?.revision ?? motionRevision
  }
  const motionDone = await call(`${motionBase}/complete`, {
    method: 'POST', cookie: account.cookie, body: { confidence: 'fits' },
  })
  check('das letzte Kapitel `motion` lässt sich abnehmen und schliessen',
    motionDone.status === 200, `${motionDone.status} ${motionDone.text.slice(0, 160)}`)

  // ── DIE SCHICHT IST DAMIT VOLL ─────────────────────────────────────────
  //
  // Der eigene Stand der Schicht steht am Rail-Layer („N von 6 Kapiteln",
  // D1) — er ist der einzige Ort, an dem sich „fertig" ablesen lässt, solange
  // Kapitel 10 noch die Schranke zeigt (das volle Kapitel kommt mit D8).
  const fullView = await motionPage()
  check('die Leiste zeigt die Schicht als „6 von 6 Kapiteln"',
    fullView.status === 200 && fullView.text.includes('6 von 6 Kapiteln'),
    `${fullView.status} — ${(fullView.text.match(/\d von 6 Kapiteln/) ?? ['nichts gefunden'])[0]}`)
  /**
   * DER ERGEBNIS-PUNKT IST FREI, SOBALD SECHS KAPITEL FERTIG SIND.
   *
   * Er trägt im Markup KEINE Adresse: `BwProgressRail` rendert ihn als Knopf,
   * der beim Klick navigiert, und gibt ihn genau bei `state === 'done'` frei —
   * und dieser Zustand ist `doneCount === 6`. Geprüft wird deshalb die
   * TATSACHE dahinter (sechs `done` in der Journey) plus die Beschriftung auf
   * der Seite; eine Prüfung auf `href` suchte etwas, das es nicht gibt.
   */
  const designJourney = (await call(`/api/brand/profiles/${profileId}`, { cookie: account.cookie }))
    .json?.journey ?? []
  const designStates = ['dna', 'color', 'type', 'mark', 'imagery', 'motion']
    .map(key => designJourney.find(entry => entry.stepKey === key)?.state)
  check('… und der Ergebnis-Punkt „Visuelle Identität" ist frei — sechs Kapitel `done`',
    fullView.text.includes('Visuelle Identität') && designStates.every(state => state === 'done'),
    JSON.stringify(designStates))

  const motionStep = await call(motionBase, { cookie: account.cookie })
  check('… das Kapitel steht auf `done` und trägt seine vier Werte',
    motionStep.json?.storedState === 'done'
    && motionStep.json?.slots?.['l.tempo']?.confirmed === 'calm'
    && String(motionStep.json?.slots?.['l.transitions']?.confirmed ?? '').includes('motion.slow')
    && String(motionStep.json?.slots?.['l.rules']?.confirmed ?? '').split('\n').length === 6,
    `${motionStep.json?.storedState} ${JSON.stringify(Object.keys(motionStep.json?.slots ?? {}))}`)

  // ══ 31 · Das Ergebnis: Preset, Kapitel 10, Board, Snapshot v2 (D8) ═══════
  //
  // ── WAS DIESER ABSCHNITT PRÜFT ──────────────────────────────────────────
  // Die REGELN (Rückwege der sechs Kapitel, `buildBrandDesign`, der Renderer
  // mit und ohne Preset, v1/v2) sind vollständig in
  // `tests/brandDesignValues.test.ts` und `tests/brandFoundationDesign.test.ts`
  // belegt. HIER wird geprüft, was ein Unit-Test nicht sehen kann: dass das
  // Preset an einer ECHTEN Marke aus ECHTEN Zeilen entsteht, dass die
  // Leseansicht Kapitel 10 wirklich VOLL malt, dass die eigene Board-Route
  // dem Besitzer gehört — und dass im geteilten Abbild kein Entwurf, kein
  // Vorbild und keine Lesung steht.
  //
  // Er läuft NACH Abschnitt 30: dort sind alle sechs Kapitel abgenommen, und
  // genau das ist die Bedingung für ein Preset.
  console.log('\n31 · Brand Design: Preset, Kapitel 10, Board und Snapshot v2 (D8)')

  const designApi = await call(`${base}/design`, { cookie: account.cookie })
  check('die Preset-Route antwortet — sechs von sechs Kapiteln',
    designApi.status === 200 && designApi.json?.done === 6 && designApi.json?.total === 6,
    `${designApi.status} ${designApi.text.slice(0, 200)}`)

  const preset = designApi.json?.preset ?? null
  /**
   * DIE ERWARTETEN WERTE STEHEN ALS LITERAL (Beweis-Regel 1): sie sind die,
   * die die Abschnitte 25 bis 30 wirklich bestätigt haben — Basisfarbe
   * `#4a3123`, Paar `editorial`, Tempo `calm`, Zeichen-Richtung `word`.
   */
  check('das Preset steht — aus den bestätigten Werten der sechs Kapitel',
    preset !== null
    && preset.color?.base === '#4a3123'
    && preset.type?.pair === 'editorial'
    && preset.motion?.tempo === 'calm'
    && preset.mark?.kind === 'word',
    JSON.stringify({
      base: preset?.color?.base,
      pair: preset?.type?.pair,
      tempo: preset?.motion?.tempo,
      kind: preset?.mark?.kind,
    }))
  check('… mit elf Rampen-Stufen hell UND dunkel, fünf Rollen, sechs geprüften Paaren',
    Object.keys(preset?.color?.rampLight ?? {}).length === 11
    && Object.keys(preset?.color?.rampDark ?? {}).length === 11
    && (preset?.color?.roles ?? []).length === 5
    && (preset?.color?.contrastPairs ?? []).length === 6,
    JSON.stringify({
      light: Object.keys(preset?.color?.rampLight ?? {}).length,
      dark: Object.keys(preset?.color?.rampDark ?? {}).length,
      roles: (preset?.color?.roles ?? []).length,
      pairs: (preset?.color?.contrastPairs ?? []).length,
    }))
  check('… acht gerechnete Setzungen als SVG (nicht aus dem Slot gelesen)',
    (preset?.mark?.examples ?? []).length === 8
    && (preset?.mark?.examples ?? []).every(svg => svg.startsWith('<svg') && svg.endsWith('</svg>')),
    String((preset?.mark?.examples ?? []).length))
  check('… und die vier Übergangs-Tokens des ruhigen Tempos (120/240/384/60)',
    JSON.stringify((preset?.motion?.transitions ?? []).map(token => token.durationMs))
    === JSON.stringify([120, 240, 384, 60]),
    JSON.stringify((preset?.motion?.transitions ?? []).map(token => token.durationMs)))

  // ── DIE EIGENE ANSICHT GEHÖRT DEM BESITZER ────────────────────────────
  const boardOwn = await call(`/de/brand/${profileId}/design`, { cookie: account.cookie })
  check('die Board-Seite antwortet dem Besitzer (200, mit dem Board darin)',
    boardOwn.status === 200 && boardOwn.text.includes('data-design-board'),
    `${boardOwn.status} ${boardOwn.text.length} Zeichen`)
  check('… und sie ist NICHT die Sperr-Fläche',
    !boardOwn.text.includes('data-design-locked'), 'die Sperr-Fläche steht da')
  const boardForeign = await call(`/de/brand/${profileId}/design`, { cookie: stranger.cookie })
  const boardGuest = await call(`/de/brand/${profileId}/design`)
  check('fremd und ohne Anmeldung: 404, wie überall in diesem Layer',
    boardForeign.status === 404 && boardGuest.status === 404,
    `${boardForeign.status}/${boardGuest.status}`)
  const boardApiForeign = await call(`${base}/design`, { cookie: stranger.cookie })
  check('… die Route ebenso (404, nicht 403)',
    boardApiForeign.status === 404, String(boardApiForeign.status))

  // ── KAPITEL 10 IST VOLL ───────────────────────────────────────────────
  const foundationApi = await call(`${base}/foundation`, { cookie: account.cookie })
  const visualChapter = (foundationApi.json?.view?.chapters ?? [])
    .find(chapter => chapter.id === 'visuell')
  check('die Leseansicht liefert Kapitel 10 als EINEN design-Block, abgenommen',
    visualChapter?.state === 'done'
    && JSON.stringify((visualChapter?.blocks ?? []).map(block => block.kind)) === '["design"]',
    JSON.stringify({
      state: visualChapter?.state,
      kinds: (visualChapter?.blocks ?? []).map(block => block.kind),
    }))
  check('… der Block trägt KEINE Entwurfs-Ids, nur ihre Zahl',
    visualChapter?.blocks?.[0]?.keptDrafts === 0
    && !('keptDrafts' in (visualChapter?.blocks?.[0]?.preset?.mark ?? {})),
    JSON.stringify(Object.keys(visualChapter?.blocks?.[0]?.preset?.mark ?? {})))
  /**
   * DER ZÄHLER RECHNET KAPITEL 10 MIT — als GENAU EINS, nicht als sechs.
   *
   * Verglichen wird gegen die Kapitel-Liste derselben Antwort: eine feste Zahl
   * stünde hier falsch, sobald dieses Test-Branding einen Baustein mehr oder
   * weniger auf dem Weg hat (dieser Beweis lässt bewusst Kapitel offen).
   * Die ZUSAGE ist die Differenz, und die ist 1.
   */
  const foundationSteps = foundationApi.json?.chapters ?? []
  const acceptedSteps = foundationSteps.filter(chapter => chapter.storedState === 'done').length
  check('… und der Zähler rechnet Kapitel 10 mit — als EINS, nicht als sechs',
    foundationApi.json?.accepted?.total === foundationSteps.length + 1
    && foundationApi.json?.accepted?.chapters === acceptedSteps + 1,
    JSON.stringify({
      accepted: foundationApi.json?.accepted,
      steps: foundationSteps.length,
      done: acceptedSteps,
    }))

  const designReadPage = await call(`/de/brand/${profileId}/foundation`, { cookie: account.cookie })
  check('die Leseansicht malt die Vitrine — Board als Kopf, fünf Abschnitte',
    designReadPage.status === 200
    && designReadPage.text.includes('data-design-chapter')
    && designReadPage.text.includes('data-design-board'),
    `${designReadPage.status} ${designReadPage.text.length} Zeichen`)
  check('… mit allen fünf Sprungmarken (Farbwelt, Typografie, Zeichen, Bild, Bewegung)',
    ['farbwelt', 'typografie', 'zeichen', 'bildsprache', 'bewegung']
      .every(section => designReadPage.text.includes(`id="visuell-${section}"`)),
    'eine Sprungmarke fehlt')
  check('… und die Schranke ist weg (kein „folgt in Brand Design" mehr)',
    !designReadPage.text.includes('folgt in Brand Design'),
    'die Schranke steht noch da')
  check('… die Farbwelt steht mit ihrer Basisfarbe und beiden Rampen da',
    designReadPage.text.includes('#4a3123')
    && designReadPage.text.includes(preset.color.rampDark[900]),
    'Basisfarbe oder Dunkel-Rampe fehlen')
  check('… die Wortmarke ist gesetzt (SVG mit dem Markennamen)',
    designReadPage.text.includes('<svg') && designReadPage.text.includes('Kailua Coffee'),
    'kein gesetztes Zeichen auf der Seite')

  const documentPage = await call(`/de/brand/${profileId}/document`, { cookie: account.cookie })
  check('„Euer Branding" zeigt denselben Abschnitt — nicht sechs leere Kapitel',
    documentPage.status === 200
    && documentPage.text.includes('data-design-chapter')
    && !documentPage.text.includes('id="dna"'),
    `${documentPage.status} ${documentPage.text.length} Zeichen`)

  // ── DER SNAPSHOT STEIGT AUF v2 ────────────────────────────────────────
  const designShare = await call(`${base}/share`, { method: 'POST', cookie: account.cookie, body: {} })
  const shareToken = designShare.json?.token ?? ''
  check('ein Link lässt sich erzeugen', designShare.status === 200 && shareToken.length === 64,
    `${designShare.status} ${designShare.text.slice(0, 160)}`)

  const shareRow = await tablesDB.getRow({
    databaseId, tableId: 'brand_shares', rowId: designShare.json?.shareId ?? 'none',
  }).catch(() => null)
  const designSnapshot = shareRow ? JSON.parse(shareRow.snapshot) : null
  check('der eingefrorene Snapshot trägt `schemaVersion: 2` und das Preset',
    designSnapshot?.schemaVersion === 2 && designSnapshot?.design?.color?.base === '#4a3123',
    JSON.stringify({ version: designSnapshot?.schemaVersion, base: designSnapshot?.design?.color?.base }))
  check('… mit `presetId: design:<profileId>` und der Preset-Fassung',
    designSnapshot?.presetId === `design:${profileId}` && designSnapshot?.presetVersion === '1',
    JSON.stringify({ id: designSnapshot?.presetId, version: designSnapshot?.presetVersion }))
  check('… und OHNE die behaltenen Entwürfe (§1.11 b)',
    designSnapshot?.design && !('keptDrafts' in designSnapshot.design.mark),
    JSON.stringify(Object.keys(designSnapshot?.design?.mark ?? {})))

  /**
   * DIE GEGENPROBE DES ABBILDS: drei Sorten, die NIE reisen dürfen — die
   * Entwürfe (D5c), die Vorbilder (D2a) und die Lesung (D2b). Geprüft wird
   * das rohe JSON, nicht die gerenderte Seite: die API-Antwort steht daneben
   * und ist mit dem Token ohne Browser abrufbar.
   */
  const rawSnapshot = JSON.stringify(designSnapshot ?? {})
  check('kein Vorbild, keine Lesung, kein Entwurf im Abbild',
    !rawSnapshot.includes('g.inspiration')
    && !rawSnapshot.includes('g.reading')
    && !rawSnapshot.includes('j.drafts'),
    'ein interner Slot steht im Snapshot')

  const sharePage = await call(`/brand/share/${shareToken}`)
  check('die Empfänger-Seite zeigt dasselbe volle Kapitel 10',
    sharePage.status === 200
    && sharePage.text.includes('data-design-chapter')
    && sharePage.text.includes('data-design-board'),
    `${sharePage.status} ${sharePage.text.length} Zeichen`)
  check('… und weiterhin nichts Internes',
    !sharePage.text.includes('data-design-drafts'),
    'der Entwurfs-Hinweis steht in der öffentlichen Ansicht')

  /**
   * EIN v1-SNAPSHOT BLEIBT LESBAR (§2.7 des BF1-Konzepts): so sah jede Zeile
   * vor D8 aus. Der Renderer fragt nach dem FELD, nicht nach der Zahl — ein
   * alter Link zeigt deshalb weiter Richtung und Schranke statt einer leeren
   * Seite.
   */
  const legacyToken = randomBytes(32).toString('hex')
  const legacyShare = await tablesDB.createRow({
    databaseId,
    tableId: 'brand_shares',
    rowId: ID.unique(),
    data: {
      profileId,
      tokenHash: createHash('sha256').update(legacyToken, 'utf8').digest('hex'),
      snapshot: JSON.stringify({
        schemaVersion: 1,
        title: 'Kailua Coffee',
        contentLocale: 'de',
        story: '',
        chapters: [{ stepKey: 'context', slots: [{ slotId: 'a.pitch', value: 'D8-ALTLINK' }] }],
        presetId: 'warm-editorial',
        presetVersion: '1',
      }),
      publishedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    },
  })
  /**
   * GEPRÜFT WIRD SPRACH-NEUTRAL: `/brand/share/:token` hat kein Locale-Präfix
   * und rendert deshalb ENGLISCH. Ein deutscher Satz als Haken wäre hier immer
   * rot — beim Bau am eigenen Lauf gefunden. `fd-dir-strip` ist der Streifen
   * der gewählten RICHTUNG (Paket G4) und damit der Beweis, dass der alte
   * Zweig gerendert hat.
   */
  const legacyPage = await call(`/brand/share/${legacyToken}`)
  check('ein v1-Link ist weiter lesbar — Festlegung UND Richtung, ohne Preset',
    legacyPage.status === 200
    && legacyPage.text.includes('D8-ALTLINK')
    && legacyPage.text.includes('fd-dir-strip')
    && !legacyPage.text.includes('data-design-chapter'),
    `${legacyPage.status} ${legacyPage.text.length} Zeichen · Richtung: `
    + `${legacyPage.text.includes('fd-dir-strip')} · Preset: `
    + `${legacyPage.text.includes('data-design-chapter')}`)
  await tablesDB.deleteRow({ databaseId, tableId: 'brand_shares', rowId: legacyShare.$id })
    .catch(() => {})

  /**
   * DIE GEGENPROBE ZUM PRESET: nimmt man EINEM Kapitel die Abnahme, fällt das
   * ganze Preset weg — und Kapitel 10 ist wieder die Schranke. Eine Prüfung,
   * die nur den fertigen Zustand kennt, wäre auch für eine Regel grün, die
   * gar nicht nachsieht.
   */
  await setStepState(profileId, 'imagery', 'active')
  const withoutOne = await call(`${base}/design`, { cookie: account.cookie })
  check('GEGENPROBE: eine zurückgenommene Abnahme ⇒ kein Preset, Stand 5 von 6',
    withoutOne.json?.preset === null && withoutOne.json?.done === 5,
    JSON.stringify({ preset: withoutOne.json?.preset, done: withoutOne.json?.done }))
  const lockedBoard = await call(`/de/brand/${profileId}/design`, { cookie: account.cookie })
  check('… die Board-Seite wird zur ruhigen Sperr-Fläche statt zu einem 404',
    lockedBoard.status === 200 && lockedBoard.text.includes('data-design-locked'),
    `${lockedBoard.status} ${lockedBoard.text.length} Zeichen`)
  const lockedFoundation = await call(`/de/brand/${profileId}/foundation`, { cookie: account.cookie })
  check('… und Kapitel 10 zeigt wieder die Schranke',
    lockedFoundation.text.includes('folgt in Brand Design')
    && !lockedFoundation.text.includes('data-design-chapter'),
    'die Schranke ist nicht zurückgekommen')
  await setStepState(profileId, 'imagery', 'done')

  // ── 31.–33. Die drei Werkstatt-Kapitel von Book & Kit (K5) ──────────────
  /*
   * SIE LAUFEN GANZ AM ENDE, weil sie den fertigen Zustand brauchen: die
   * Foundation steht, das Preset steht, und die Freischaltung der ABLEITUNG
   * (K1) ist die einzige Tatsache, die dieser Abschnitt selbst herstellt.
   *
   * ER SCHREIBT DIE SLOTS OHNE ROUTE (`setSlots`) — dieselbe Entscheidung wie
   * in jedem Abschnitt davor: geprüft wird die AUSKUNFT über die Werte, nicht
   * der Weg, auf dem sie entstanden sind (der hat seinen eigenen Beweis).
   */
  const factSecret = `GEHEIM-UMSATZ-${stamp}`
  const factPublic = 'Gegründet 2026 in Kailua auf Oʻahu.'

  await setSlots(profileId, 'nomenclature', {
    'm.types': { confirmed: '- product\n- place' },
    'm.patterns': {
      confirmed: '## product\nOrt + Erntemonat — kein Fantasiename · Kona Februar 2026 · '
        + 'aus dem Architektur-Modell\n\n## place\nDachmarke + Stadtteil, nie eine Nummer · '
        + 'Kailua Coffee Co. Kaimukī · aus dem Wert Nähe',
    },
    'm.rules': { confirmed: '- Die Dachmarke steht vorn.' },
  })
  await setSlots(profileId, 'aiguide', {
    'n.scope': { confirmed: 'drafts' },
    'n.review': { confirmed: 'every' },
    'n.guardrails': {
      confirmed: '## Ton-Parameter\nruhig — kurze Hauptsätze\n\n## Tabus\nPremium\n\n'
        + '## Markenzeichen-Schreibweisen\nKailua Coffee Co. — mit Punkt\n\n'
        + '## No-go-Themen\nGesundheitsversprechen',
    },
  })
  await setSlots(profileId, 'presskit', {
    'p.facts': { confirmed: `- ${factPublic}` },
  })
  /*
   * `a.facts` GEHÖRT IN DEN KONTEXT — die Zeile darf die bestehenden Werte des
   * Kapitels nicht verlieren, sonst prüfen die Abschnitte davor rückwirkend
   * etwas anderes. Gelesen, ergänzt, zurückgeschrieben.
   */
  const contextRow = await tablesDB.getRow({
    databaseId, tableId: 'brand_steps', rowId: `${profileId}_context`,
  })
  const contextSlots = JSON.parse(contextRow.slots || '{}')
  contextSlots['a.facts'] = { confirmed: `- ${factSecret}` }
  await setSlots(profileId, 'context', contextSlots)

  // ── 31. Die Werkstatt-Quellen ──────────────────────────────────────────
  /*
   * ZUERST DIE SPERRE, DANN DIE AUSKUNFT: ohne Freischaltung antwortet die
   * Route 403 mit `derivation_locked` (nicht 404 — der Sperrsatz braucht den
   * Code, K1). Sie ist der Zustand JEDER Marke vor dem Kauf, und ein Beweis,
   * der nur den offenen Fall kennt, sagt über sie nichts.
   */
  const lockedWorkshop = await call(`${base}/kit/workshop`, { cookie: account.cookie })
  check('ohne Freischaltung ⇒ 403 `derivation_locked` (K1)',
    lockedWorkshop.status === 403 && lockedWorkshop.json?.reason === 'derivation_locked',
    `${lockedWorkshop.status} ${JSON.stringify(lockedWorkshop.json)}`)

  await tablesDB.updateRow({
    databaseId,
    tableId: 'brand_profiles',
    rowId: profileId,
    data: { derivationUnlockedAt: new Date().toISOString(), derivationUnlockedVia: 'operator' },
  })

  const workshop = await call(`${base}/kit/workshop`, { cookie: account.cookie })
  check('die Werkstatt-Quellen kommen beim Besitzer an — vier Teile, `private, no-store`',
    workshop.status === 200
    && String(workshop.headers['cache-control'] || '').includes('no-store')
    && Array.isArray(workshop.json?.prompts)
    && Array.isArray(workshop.json?.facts)
    && Array.isArray(workshop.json?.contactTemplates)
    && typeof workshop.json?.summary === 'string',
    `${workshop.status} · ${workshop.headers['cache-control']}`)

  check('… drei Prompt-Vorlagen, PUR gerechnet (§2.11: null KI-Aufrufe)',
    (workshop.json?.prompts ?? []).map(entry => entry.id).join(',') === 'system,social,email',
    JSON.stringify((workshop.json?.prompts ?? []).map(entry => entry.id)))

  check('… die Fakten-Liste trägt den internen Eintrag — hier und NUR hier',
    (workshop.json?.facts ?? []).includes(factSecret),
    JSON.stringify(workshop.json?.facts))

  check('… die Vorlage „Konto-Inhaber" ist dabei und trägt KEINE Telefonnummer',
    (workshop.json?.contactTemplates ?? []).some(entry => entry.id === 'account')
    && !(workshop.json?.contactTemplates ?? []).some(entry => 'phone' in entry),
    JSON.stringify(workshop.json?.contactTemplates))

  const foreignAccount = await makeAccount('kit-foreign')
  const foreignWorkshop = await call(`${base}/kit/workshop`, { cookie: foreignAccount.cookie })
  check('GEGENPROBE: ein fremdes Konto bekommt 404, nicht 403 (Datentür)',
    foreignWorkshop.status === 404,
    `${foreignWorkshop.status} ${JSON.stringify(foreignWorkshop.json)}`)

  // ── 32. Die Reise-Regel der Fakten (§2.12 Nr. 2) ───────────────────────
  const brandMd = await call(`${base}/kit/brand.md`, { cookie: account.cookie })
  const brandJson = await call(`${base}/kit/brand.json`, { cookie: account.cookie })
  check('`a.facts` steht ROH in KEINER Kit-Datei',
    brandMd.status === 200 && brandJson.status === 200
    && !brandMd.text.includes(factSecret) && !brandJson.text.includes(factSecret),
    `md: ${brandMd.text.includes(factSecret)} · json: ${brandJson.text.includes(factSecret)}`)
  check('GEGENPROBE: der in `p.facts` freigegebene Eintrag reist sehr wohl',
    brandMd.text.includes(factPublic) || brandJson.text.includes(factPublic),
    'ohne diese Zeile wäre der Beweis auch ohne `p.facts` grün')

  // ── 33. Wer entwirft und wer nicht ─────────────────────────────────────
  const scopeRun = await call(`${base}/steps/aiguide/generate`, {
    method: 'POST', cookie: account.cookie, body: { slotId: 'n.scope' },
  })
  check('eine Katalog-Wahl hat keinen Entwurf ⇒ 400 `slot_not_generated`',
    scopeRun.status === 400 && scopeRun.json?.reason === 'slot_not_generated',
    `${scopeRun.status} ${JSON.stringify(scopeRun.json)}`)

  await setSlots(profileId, 'nomenclature', { 'm.types': { confirmed: '' } })
  const patternsCold = await call(`${base}/steps/nomenclature/generate`, {
    method: 'POST', cookie: account.cookie, body: { slotId: 'm.patterns' },
  })
  check('`m.patterns` ohne gewählte Typen ⇒ 409 `not_ready`',
    patternsCold.status === 409 && patternsCold.json?.reason === 'not_ready',
    `${patternsCold.status} ${JSON.stringify(patternsCold.json)}`)

  await setSlots(profileId, 'nomenclature', { 'm.types': { confirmed: '- product' } })
  const patternsWarm = await call(`${base}/steps/nomenclature/generate`, {
    method: 'POST', cookie: account.cookie, body: { slotId: 'm.patterns' },
  })
  check('GEGENPROBE: mit gewählten Typen läuft derselbe Aufruf durch (kein 409)',
    patternsWarm.status !== 409,
    `${patternsWarm.status} ${JSON.stringify(patternsWarm.json)}`)

}
catch (error) {
  fail++
  console.error('\n✗ Abbruch:', error instanceof Error ? error.message : error)
}
finally {
  // Vorbilder zuerst: an jeder Zeile hängt eine DATEI im Bucket, und die
  // Löschroute des Profils läuft hier ohne Cookie (401). Ein Beweis, der
  // Fremdwerke im Speicher liegen lässt, räumt nicht auf.
  for (const id of cleanup.inspiration) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_inspiration', rowId: id }).catch(() => {})
    await storage.deleteFile({ bucketId: 'brand-inspiration', fileId: id }).catch(() => {})
  }
  for (const id of cleanup.profiles) {
    const rest = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_inspiration',
      queries: [Query.equal('profileId', id), Query.limit(100)],
    }).catch(() => ({ rows: [] }))
    for (const row of rest.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_inspiration', rowId: row.$id }).catch(() => {})
      await storage.deleteFile({ bucketId: 'brand-inspiration', fileId: row.$id }).catch(() => {})
    }
  }
  // Die KI-Entwürfe (D5c) — dieselbe Regel wie eine Zeile darüber: an jeder
  // Zeile hängt eine Datei im Bucket `brand-drafts` (Zeilen-Id = Datei-Id).
  for (const id of cleanup.drafts) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_mark_drafts', rowId: id }).catch(() => {})
    await storage.deleteFile({ bucketId: 'brand-drafts', fileId: id }).catch(() => {})
  }
  for (const id of cleanup.profiles) {
    const rest = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_mark_drafts',
      queries: [Query.equal('profileId', id), Query.limit(100)],
    }).catch(() => ({ rows: [] }))
    for (const row of rest.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_mark_drafts', rowId: row.$id }).catch(() => {})
      await storage.deleteFile({ bucketId: 'brand-drafts', fileId: row.$id }).catch(() => {})
    }
  }
  for (const id of cleanup.messages) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_messages', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.profiles) {
    await call(`/api/brand/profiles/${id}`, { method: 'DELETE' }).catch(() => {})
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_profiles', rowId: id }).catch(() => {})
    for (const stepKey of [
      'context', 'pvm', 'architecture', 'values', 'archetype', 'manifesto', 'verbal', 'naming', 'result',
      // Schicht 2 (Brand Design D1): sechs weitere Zeilen. Sie entstehen bei
      // der Anlage (Journey) UND beim Freischalten — wer sie hier vergisst,
      // lässt nach jedem Lauf sechs Waisen in `brand_steps` liegen.
      'dna', 'color', 'type', 'mark', 'imagery', 'motion',
    ]) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_steps', rowId: `${id}_${stepKey}` })
        .catch(() => {})
    }
    const rest = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_messages',
      queries: [Query.equal('profileId', id), Query.limit(200)],
    }).catch(() => ({ rows: [] }))
    for (const row of rest.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_messages', rowId: row.$id }).catch(() => {})
    }
  }
  for (const id of cleanup.profiles) {
    const shares = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_shares',
      queries: [Query.equal('profileId', id), Query.limit(100)],
    }).catch(() => ({ rows: [] }))
    for (const row of shares.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_shares', rowId: row.$id }).catch(() => {})
    }
  }
  for (const id of cleanup.profiles) {
    const findings = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_findings',
      queries: [Query.equal('profileId', id), Query.limit(200)],
    }).catch(() => ({ rows: [] }))
    for (const row of findings.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_findings', rowId: row.$id }).catch(() => {})
    }
  }
  for (const id of cleanup.profiles) {
    const events = await tablesDB.listRows({
      databaseId,
      tableId: 'brand_events',
      queries: [Query.equal('profileId', id), Query.limit(200)],
    }).catch(() => ({ rows: [] }))
    for (const row of events.rows) {
      await tablesDB.deleteRow({ databaseId, tableId: 'brand_events', rowId: row.$id }).catch(() => {})
    }
  }
  for (const id of cleanup.access) {
    await tablesDB.deleteRow({ databaseId, tableId: 'brand_access', rowId: id }).catch(() => {})
  }
  for (const id of cleanup.users) {
    await users.delete({ userId: id }).catch(() => {})
  }
  if (cleanup.aiFlag) {
    if (cleanup.aiFlag.existed) {
      await tablesDB.updateRow({
        databaseId,
        tableId: 'app_config',
        rowId: 'global',
        data: { brandAiEnabled: cleanup.aiFlag.before },
      }).catch(() => {})
    }
    else {
      await tablesDB.deleteRow({ databaseId, tableId: 'app_config', rowId: 'global' }).catch(() => {})
    }
  }

  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Prüfungen bestanden`)
  process.exit(fail === 0 ? 0 : 1)
}
