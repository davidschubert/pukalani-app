/**
 * BEWEIS FÜR BS1 R1c — DIE UNTERNEHMER-BESTÄTIGUNG IST EINE TATSACHE AM KONTO,
 * KEINE FORMULARVALIDIERUNG (Davids Entscheidung vom 2026-09-08: branding.supply
 * nimmt nur Unternehmen und Selbstständige auf, B2B).
 *
 * Geprüft werden vier Zusagen, jede mit ihrer Gegenprobe:
 *
 *   A) Die App MIT `pukalani.auth.businessOnly` zeigt das Pflicht-Häkchen samt
 *      Begründung — in beiden Sprachen, server-gerendert.
 *   B) Die App OHNE den Schalter zeigt es NICHT. Beide Server laufen gegen
 *      DIESELBE Appwrite-Instanz und denselben Code; unterschiedlich ist nur
 *      die App-Config. Ohne diese Gegenprobe wäre A wertlos — sie liefe auch
 *      grün, wenn das Häkchen fest eingebaut wäre.
 *   C) Eine echte Registrierung auf der B2B-App hinterlässt
 *      `businessConfirmedAt` in den Prefs, NEBEN den AGB-Feldern aus R1 —
 *      das ist zugleich der Beweis, dass die beiden Schreiber sich nicht
 *      gegenseitig aus dem Prefs-Fach werfen (`updatePrefs` ERSETZT).
 *   D) Dieselbe Registrierung auf der App ohne Schalter hinterlässt KEIN
 *      `businessConfirmedAt`.
 *
 * WAS HIER BEWUSST NICHT GEPRÜFT WIRD: „Registrierung ohne Häkchen ⇒ 400".
 * Das Feld `business` reist gar nicht zum Server (wie `terms` seit jeher, s.
 * `RegisterForm.vue`) — die Pflicht ist eine Zod-Regel im Formular und steht
 * als solche in `tests/businessConfirmation.test.ts`. Ein Route-Test dafür würde eine
 * Zusage messen, die es nicht gibt.
 *
 * AUFRUF (zwei Dev-Server aus DEMSELBEN Worktree, sonst misst man fremden Code):
 *
 *   NUXT_PUBLIC_AUTH_OAUTH_PROVIDERS=google \
 *     pnpm --filter branding exec nuxi dev --port 3021
 *   pnpm --filter portfolio exec nuxi dev --port 3020
 *   node --env-file=apps/branding/.env \
 *     packages/core/scripts/verify-business-confirmation.mjs
 *
 * Der Provider-Schalter ist NUR fürs Messen da: ohne ihn gibt es lokal keine
 * Social-Login-Fläche, und die Sperre daran ist dann nicht prüfbar (der Lauf
 * sagt es dann und zählt sie nicht mit).
 *
 * B2B_PORT / PLAIN_PORT überschreiben die Ports.
 */
import { request } from 'node:http'
import { Client, Users } from 'node-appwrite'

const B2B_PORT = Number(process.env.B2B_PORT || 3021)
const PLAIN_PORT = Number(process.env.PLAIN_PORT || 3020)
const HOST = process.env.VERIFY_HOST || 'localhost'

const endpoint = process.env.NUXT_PUBLIC_APPWRITE_ENDPOINT
const project = process.env.NUXT_PUBLIC_APPWRITE_PROJECT_ID
const key = process.env.NUXT_APPWRITE_KEY

if (!endpoint || !project || !key) {
  console.error('✗ Env unvollständig (NUXT_PUBLIC_APPWRITE_ENDPOINT + _PROJECT_ID + NUXT_APPWRITE_KEY nötig).')
  process.exit(1)
}

const users = new Users(new Client().setEndpoint(endpoint).setProject(project).setKey(key))

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

/** node:http, weil `fetch` einen eigenen Host-Header verwirft; ::1 = Nitro. */
function call(port, path, { method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null
    const req = request({
      host: '::1',
      port,
      path,
      method,
      headers: {
        host: HOST,
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let text = ''
      res.on('data', chunk => text += chunk)
      res.on('end', () => {
        let json = null
        try { json = JSON.parse(text) }
        catch { /* HTML */ }
        resolve({ status: res.statusCode, json, text })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    // Der erste Aufruf einer SEITE kompiliert sie im Dev-Server (~25 s).
    req.setTimeout(180_000, () => req.destroy(new Error('Zeitüberschreitung')))
    req.end()
  })
}

const DE_LABEL = 'Ich handle als Unternehmer/in oder Selbstständige/r, nicht als Verbraucher/in'
const DE_NOTICE = 'Unser Angebot richtet sich ausschliesslich an Unternehmen und Selbstständige'
const EN_LABEL = 'I am acting as a business or self-employed person, not as a consumer'
const EN_NOTICE = 'Our offer is intended for businesses and self-employed people only'

const created = []

async function signup(port, label) {
  const email = `r1c-${label}-${Date.now()}@example.test`
  const res = await call(port, '/api/auth/signup', {
    method: 'POST',
    body: { name: 'R1c Beweis', email, password: `Pw-${Date.now()}-x!A1` },
  })
  if (res.status !== 200 && res.status !== 201) {
    return { ok: false, email, res }
  }
  // Die Route gibt die Id nicht zurück — über die Adresse nachschlagen.
  const list = await users.list({ queries: [], search: email })
  const user = list.users.find(u => u.email === email)
  if (user) created.push(user.$id)
  return { ok: true, email, user, res }
}

try {
  console.log(`\nBS1-R1c-Beweis — B2B-App :${B2B_PORT}, Gegenprobe :${PLAIN_PORT}, Projekt ${project}\n`)

  // ── A) Die B2B-App zeigt das Pflicht-Häkchen ───────────────────────────
  console.log('A) App MIT pukalani.auth.businessOnly')
  const de = await call(B2B_PORT, '/de/register')
  check('/de/register antwortet 200', de.status === 200, `status ${de.status}`)
  check('… rendert das Registrierungs-Formular', de.text.includes('data-register-form'))
  check('… zeigt das Unternehmer-Häkchen', de.text.includes('data-business-check'))
  check('… mit dem deutschen Text', de.text.includes(DE_LABEL))
  check('… und der Begründung daneben', de.text.includes('data-business-notice') && de.text.includes(DE_NOTICE))
  check('… KEINE rohen i18n-Schlüssel (Compiler-Falle)', !de.text.includes('auth.register.businessLabel'))

  const en = await call(B2B_PORT, '/register')
  check('/register (en) antwortet 200', en.status === 200, `status ${en.status}`)
  check('… zeigt denselben Text auf Englisch', en.text.includes(EN_LABEL) && en.text.includes(EN_NOTICE))
  check('… und NICHT die deutsche Fassung', !en.text.includes(DE_LABEL))

  /**
   * Der Google-Knopf ist die Hintertür, wenn man ihn lässt (U14): er muss beim
   * Aufbau gesperrt sein, weil beide Häkchen noch offen sind. Nur prüfbar,
   * wenn die Instanz überhaupt einen Provider anbietet — sonst ist die Fläche
   * gar nicht da, und ein „grün" wäre hier eine Lüge.
   */
  if (de.text.includes('data-oauth-buttons')) {
    const oauthBlock = de.text.slice(de.text.indexOf('data-oauth-buttons'))
    check('… Social-Login ist gesperrt, solange ein Häkchen offen ist', oauthBlock.includes('disabled'))
  }
  else {
    console.log('  – Social-Login lokal nicht konfiguriert — Sperre nicht prüfbar (in Prod: providers[\'google\'])')
  }

  /**
   * Der CODE-WEG trägt dasselbe Häkchen — aber nur im register-Modus. Prüfbar
   * nur, wenn die App `pukalani.auth.otp` anhat; sonst leitet die Seite um,
   * und eine Prüfung darauf wäre eine Behauptung über eine Seite, die es hier
   * nicht gibt. (Gemessen mit vorübergehend gesetztem `otp: true` am
   * 2026-09-08: Häkchen + Begründung stehen auf /de/register/code, NICHT auf
   * /de/login/code.)
   */
  const otpRegister = await call(B2B_PORT, '/de/register/code')
  if (otpRegister.status === 200) {
    check('/de/register/code zeigt dasselbe Häkchen', otpRegister.text.includes('data-business-check') && otpRegister.text.includes(DE_LABEL))
    const otpLogin = await call(B2B_PORT, '/de/login/code')
    check('… und die reine Code-ANMELDUNG fragt nichts ab', otpLogin.status === 200 && !otpLogin.text.includes('data-business-check'))
  }
  else {
    console.log(`  – Code-Anmeldung in dieser App aus (pukalani.auth.otp) — /de/register/code antwortet ${otpRegister.status}`)
  }

  // ── B) Gegenprobe: dieselbe Codebasis ohne den Schalter ────────────────
  console.log('\nB) Gegenprobe — App OHNE den Schalter (derselbe Code, dieselbe Instanz)')
  const plainDe = await call(PLAIN_PORT, '/de/register')
  check('/de/register antwortet 200', plainDe.status === 200, `status ${plainDe.status}`)
  check('… rendert das Registrierungs-Formular', plainDe.text.includes('data-register-form'))
  check('… zeigt KEIN Unternehmer-Häkchen', !plainDe.text.includes('data-business-check'))
  check('… und KEINE Begründung', !plainDe.text.includes('data-business-notice') && !plainDe.text.includes(DE_LABEL))

  // ── C) Eine echte Anlage hinterlässt die Tatsache ──────────────────────
  console.log('\nC) Registrierung auf der B2B-App')
  const before = Date.now()
  const b2b = await signup(B2B_PORT, 'b2b')
  check('POST /api/auth/signup legt ein Konto an', b2b.ok, `status ${b2b.res.status} ${JSON.stringify(b2b.res.json)}`)
  if (b2b.ok) {
    check('… das Konto ist auffindbar', Boolean(b2b.user), b2b.email)
    const prefs = b2b.user?.prefs ?? {}
    const at = typeof prefs.businessConfirmedAt === 'string' ? prefs.businessConfirmedAt : ''
    check('… prefs.businessConfirmedAt ist gesetzt', at.length > 0, JSON.stringify(prefs))
    const stamp = at ? Date.parse(at) : Number.NaN
    check('… und ist ein frischer ISO-Zeitstempel', Number.isFinite(stamp) && stamp >= before - 60_000 && stamp <= Date.now() + 60_000, at)
    /**
     * Der MERGE-Beweis: `updatePrefs` ERSETZT das ganze Fach. Liefen die
     * beiden Schreiber (R1 und R1c) nacheinander ohne Spread, stünde hier nur
     * noch das Feld des zweiten. Beide Felder nebeneinander heißt: gemergt.
     */
    check('… die AGB-Felder aus R1 stehen unversehrt daneben (Merge)',
      typeof prefs.termsAcceptedAt === 'string' && prefs.termsAcceptedAt.length > 0
      && prefs.termsVersion === '2026-09-draft-1', JSON.stringify(prefs))
  }

  // ── D) Gegenprobe: dieselbe Anlage ohne den Schalter ───────────────────
  console.log('\nD) Gegenprobe — Registrierung auf der App ohne den Schalter')
  const plain = await signup(PLAIN_PORT, 'plain')
  check('POST /api/auth/signup legt ein Konto an', plain.ok, `status ${plain.res.status} ${JSON.stringify(plain.res.json)}`)
  if (plain.ok) {
    const prefs = plain.user?.prefs ?? {}
    check('… prefs tragen KEIN businessConfirmedAt', !('businessConfirmedAt' in prefs), JSON.stringify(prefs))
  }
}
catch (error) {
  fail++
  console.error('\n✗ Lauf abgebrochen:', error instanceof Error ? error.message : error)
}
finally {
  for (const id of created) {
    try { await users.delete({ userId: id }) }
    catch { console.log(`  ! Testkonto ${id} blieb stehen — bitte von Hand löschen.`) }
  }
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Zusagen erfüllt (${created.length} Testkonten wieder entfernt)\n`)
  process.exit(fail === 0 ? 0 : 1)
}
