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
 * SEIT 2026-11-16 PRÜFT DER SERVER (SEC-008): `POST /api/auth/signup` verlangt
 * `terms: true` und — in einer App mit `businessOnly` — `business: true` im
 * Rumpf, sonst 400 `terms_required` bzw. `business_required` VOR der Anlage.
 * Der Nachweis ist je Bestätigung EINE Zeile in `consent_records`; die
 * Prefs-Felder gehören dem Konto und belegen allein nichts. Dieser Beweis
 * schickt deshalb die Felder mit und prüft dazu:
 *
 *   E) Ohne `business` (bzw. ohne `terms`) lehnt die B2B-App ab, und es
 *      entsteht KEIN Konto.
 *   F) Nach der Anlage stehen in `consent_records` genau die zwei Zeilen
 *      (`terms`, `business`), beide über den Weg `password`; auf der App ohne
 *      den Schalter entsteht für DENSELBEN Rumpf keine `business`-Zeile.
 *
 * (Bis dahin stand hier, „ohne Häkchen ⇒ 400" sei keine Zusage, weil das Feld
 * nicht zum Server reise. Das Skript schickte die Felder nie, und die Route
 * lehnte seit dem 2026-11-16 jede seiner Anlagen ab.)
 *
 * DAS SKRIPT SETZT SEINE ANNAHME SELBST: die Registrierung ist in beiden Apps
 * für die Dauer des Laufs offen (`app_config.registrationEnabled`) und steht
 * danach wieder wie vorher. Aufgeräumt wird je Projekt mit Nachzählen
 * (`createEinzelCleanup`): Konten und alle Zeilen, die an ihnen hängen.
 *
 * AUFRUF (zwei Dev-Server aus DEMSELBEN Worktree, sonst misst man fremden Code;
 * die zwei Apps haben je ein EIGENES Projekt — das der B2B-App kommt aus der
 * Umgebung, das der Gegenprobe aus `PLAIN_ENV_FILE`, Standard
 * `apps/portfolio/.env`):
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
 * B2B_PORT / PLAIN_PORT überschreiben die Ports. Läuft seit dem 2026-11-28
 * nachts auf der Bühne (`scripts/buehne/beweise.mjs`, BT1 a): dort stehen
 * branding.supply und die Studio-Site als vierter und fünfter Server.
 */
import '../../../scripts/lib/assert-target.mjs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Q,
  createEinzelCleanup,
  createHttpCaller,
  generatePassword,
  isNotFound,
  probeEmail,
  readEnvFile,
  runStamp,
} from '../../../scripts/lib/probe-stage.mjs'

const SCRIPT = 'verify-business-confirmation'
// Auf der Bühne (nachts, BT1 a) setzt der Läufer BRANDING_PORT und
// PORTFOLIO_PORT / PORTFOLIO_ENV_FILE; von Hand gelten B2B_PORT / PLAIN_PORT.
const B2B_PORT = Number(process.env.B2B_PORT || process.env.BRANDING_PORT || 3021)
const PLAIN_PORT = Number(process.env.PLAIN_PORT || process.env.PORTFOLIO_PORT || 3020)
const HOST = process.env.VERIFY_HOST || 'localhost'
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const PLAIN_ENV_FILE = resolve(ROOT, process.env.PLAIN_ENV_FILE || process.env.PORTFOLIO_ENV_FILE || 'apps/portfolio/.env')

/** Die Fassung der AGB, die `apps/branding/app/app.config.ts` nennt (`termsVersion`). */
const B2B_TERMS_VERSION = '2026-09-draft-1'

function projectOf(env, label) {
  if (!env.NUXT_PUBLIC_APPWRITE_ENDPOINT || !env.NUXT_PUBLIC_APPWRITE_PROJECT_ID || !env.NUXT_APPWRITE_KEY) {
    console.error(`✗ Env der ${label} unvollständig (NUXT_PUBLIC_APPWRITE_ENDPOINT + _PROJECT_ID + NUXT_APPWRITE_KEY nötig).`)
    process.exit(1)
  }
  // `createEinzelCleanup` prüft das Ziel (lokal durch, sonst nur mit Bestätigung).
  const cleanup = createEinzelCleanup({ script: SCRIPT, env })
  return {
    label,
    projectId: env.NUXT_PUBLIC_APPWRITE_PROJECT_ID,
    databaseId: env.NUXT_PUBLIC_APPWRITE_DATABASE_ID || 'main',
    pool: cleanup.pool,
    cleanup,
    /** Vorwert von `registrationEnabled`, falls dieser Lauf ihn umgestellt hat. */
    registrationBefore: undefined,
  }
}

let plainEnv
try {
  plainEnv = readEnvFile(PLAIN_ENV_FILE)
}
catch {
  console.error(`✗ Env-Datei der Gegenprobe nicht lesbar: ${PLAIN_ENV_FILE.replace(`${ROOT}/`, '')} (PLAIN_ENV_FILE setzen).`)
  process.exit(1)
}
const b2bProject = projectOf(process.env, 'B2B-App')
const plainProject = projectOf(plainEnv, 'Gegenprobe')
if (b2bProject.projectId === plainProject.projectId) {
  console.error('✗ B2B-App und Gegenprobe zeigen auf dasselbe Projekt — die Gegenprobe braucht ihre eigene App mit eigenem Projekt.')
  process.exit(1)
}

let pass = 0
let fail = 0
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  ✔ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`) }
}

const callers = new Map()
/** Seiten wie ein Browser (`Accept: text/html`), Routen als JSON — je Port ein Aufrufer. */
function call(port, path, { method = 'GET', body } = {}) {
  if (!callers.has(port)) callers.set(port, createHttpCaller({ port }))
  const caller = callers.get(port)
  return method === 'GET' ? caller.page(HOST, path) : caller.call(HOST, path, { method, body })
}

/** Registrierung für die Dauer des Laufs öffnen; der Vorwert wird gemerkt. */
async function openRegistration(project) {
  let row
  try {
    row = await project.pool.getRow(project.databaseId, 'app_config', 'global')
  }
  catch (error) {
    // Ohne Zeile gelten die Vorgaben der App (Registrierung offen).
    if (isNotFound(error)) return
    throw error
  }
  if (row.registrationEnabled === false) {
    project.registrationBefore = false
    await project.pool.updateRow(project.databaseId, 'app_config', 'global', { registrationEnabled: true })
  }
}

async function restoreRegistration(project) {
  if (project.registrationBefore === undefined) return
  await project.pool.updateRow(project.databaseId, 'app_config', 'global', { registrationEnabled: project.registrationBefore })
}

const DE_LABEL = 'Ich handle als Unternehmer/in oder Selbstständige/r, nicht als Verbraucher/in'
// Seit Q16 (2026-11-21) mit „ß" — die erste Nacht auf der Bühne war daran rot.
const DE_NOTICE = 'Unser Angebot richtet sich ausschließlich an Unternehmen und Selbstständige'
const EN_LABEL = 'I am acting as a business or self-employed person, not as a consumer'
const EN_NOTICE = 'Our offer is intended for businesses and self-employed people only'

const stamp = runStamp()

/** Das Konto zu einer Adresse im Projekt der App, sonst `null`. */
async function findAccount(project, email) {
  const list = await project.pool.get('/users', [Q.equal('email', [email]), Q.limit(1)])
  return list.users?.[0] ?? null
}

/**
 * Eine Registrierung über die echte Route. `consent` sind die Felder, die das
 * Formular seit SEC-008 mitschickt; ein angelegtes Konto steht sofort im
 * Aufräum-Register seines Projekts.
 */
async function signup(port, project, tag, consent) {
  const email = probeEmail(`r1c-${tag}`, stamp)
  const res = await call(port, '/api/auth/signup', {
    method: 'POST',
    body: { name: 'R1c Beweis', email, password: generatePassword(), ...consent },
  })
  // Die Route gibt die Id nicht zurück — über die Adresse nachschlagen. Auch
  // nach einer Ablehnung: ein Konto, das trotzdem entstand, wäre der Befund
  // (und muss wieder weg).
  const user = await findAccount(project, email)
  if (user) project.cleanup.track('account', user.$id)
  return { ok: res.status === 200 || res.status === 201, email, user, res }
}

/** Die Zustimmungs-Zeilen eines Kontos als `art:weg:fassung`, sortiert. */
async function consentRows(project, userId) {
  const { rows } = await project.pool.listRows(project.databaseId, 'consent_records', [Q.equal('userId', [userId]), Q.limit(25)])
  return rows.map(row => `${row.kind}:${row.way}:${row.version ?? ''}`).sort()
}

// Ohne lesbares Schema fände das Aufräumen die Zeilen nicht, die die App bei
// einer Registrierung anlegt (Zustimmung, Aktivität, Protokoll) — dann lieber
// gar nicht erst anlegen.
for (const project of [b2bProject, plainProject]) {
  if (!await project.cleanup.schemaReadable()) {
    console.error(`✗ ${project.label}: das Schema des Projekts „${project.projectId}" ist mit diesen Schlüsseln nicht lesbar (NUXT_APPWRITE_MIGRATIONS_KEY in der Env-Datei?) — ohne es ließe der Lauf Zeilen liegen.`)
    process.exit(1)
  }
}

try {
  console.log(`\nBS1-R1c-Beweis — B2B-App :${B2B_PORT} (Projekt ${b2bProject.projectId}), Gegenprobe :${PLAIN_PORT} (Projekt ${plainProject.projectId})\n`)
  await openRegistration(b2bProject)
  await openRegistration(plainProject)

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

  // ── E) Ohne die Bestätigung lehnt der Server ab (SEC-008) ──────────────
  console.log('\nE) Registrierung auf der B2B-App OHNE die Bestätigungen')
  const noBusiness = await signup(B2B_PORT, b2bProject, 'no-business', { terms: true })
  check('ohne `business` ⇒ 400 `business_required`',
    noBusiness.res.status === 400 && noBusiness.res.json?.reason === 'business_required',
    `status ${noBusiness.res.status} ${JSON.stringify(noBusiness.res.json)}`)
  check('… und es ist KEIN Konto entstanden', noBusiness.user === null, noBusiness.email)
  const noTerms = await signup(B2B_PORT, b2bProject, 'no-terms', { business: true })
  check('ohne `terms` ⇒ 400 `terms_required`',
    noTerms.res.status === 400 && noTerms.res.json?.reason === 'terms_required',
    `status ${noTerms.res.status} ${JSON.stringify(noTerms.res.json)}`)
  check('… und es ist KEIN Konto entstanden', noTerms.user === null, noTerms.email)

  // ── C) Eine echte Anlage hinterlässt die Tatsache ──────────────────────
  console.log('\nC) Registrierung auf der B2B-App')
  const before = Date.now()
  const b2b = await signup(B2B_PORT, b2bProject, 'b2b', { terms: true, business: true })
  check('POST /api/auth/signup legt ein Konto an', b2b.ok, `status ${b2b.res.status} ${JSON.stringify(b2b.res.json)}`)
  if (b2b.ok) {
    check('… das Konto ist auffindbar', Boolean(b2b.user), b2b.email)
    const prefs = b2b.user?.prefs ?? {}
    const at = typeof prefs.businessConfirmedAt === 'string' ? prefs.businessConfirmedAt : ''
    check('… prefs.businessConfirmedAt ist gesetzt', at.length > 0, JSON.stringify(prefs))
    const confirmedAt = at ? Date.parse(at) : Number.NaN
    check('… und ist ein frischer ISO-Zeitstempel', Number.isFinite(confirmedAt) && confirmedAt >= before - 60_000 && confirmedAt <= Date.now() + 60_000, at)
    /**
     * Der MERGE-Beweis: `updatePrefs` ERSETZT das ganze Fach. Liefen die
     * beiden Schreiber (R1 und R1c) nacheinander ohne Spread, stünde hier nur
     * noch das Feld des zweiten. Beide Felder nebeneinander heißt: gemergt.
     */
    check('… die AGB-Felder aus R1 stehen unversehrt daneben (Merge)',
      typeof prefs.termsAcceptedAt === 'string' && prefs.termsAcceptedAt.length > 0
      && prefs.termsVersion === B2B_TERMS_VERSION, JSON.stringify(prefs))
    // F) Der eigentliche Nachweis: je Bestätigung eine Zeile, Weg `password`.
    const rows = b2b.user ? await consentRows(b2bProject, b2b.user.$id) : []
    check('… `consent_records` trägt genau die zwei Zeilen (business, terms), Weg `password`',
      JSON.stringify(rows) === JSON.stringify(['business:password:', `terms:password:${B2B_TERMS_VERSION}`]), JSON.stringify(rows))
  }

  // ── D) Gegenprobe: dieselbe Anlage ohne den Schalter ───────────────────
  console.log('\nD) Gegenprobe — DERSELBE Rumpf auf der App ohne den Schalter')
  const plain = await signup(PLAIN_PORT, plainProject, 'plain', { terms: true, business: true })
  check('POST /api/auth/signup legt ein Konto an', plain.ok, `status ${plain.res.status} ${JSON.stringify(plain.res.json)}`)
  if (plain.ok) {
    check('… das Konto ist auffindbar', Boolean(plain.user), plain.email)
    const prefs = plain.user?.prefs ?? {}
    check('… prefs tragen KEIN businessConfirmedAt', !('businessConfirmedAt' in prefs), JSON.stringify(prefs))
    const rows = plain.user ? await consentRows(plainProject, plain.user.$id) : []
    check('… und `consent_records` trägt KEINE `business`-Zeile', !rows.some(row => row.startsWith('business:')), JSON.stringify(rows))
  }
}
catch (error) {
  fail++
  console.error('\n✗ Lauf abgebrochen:', error instanceof Error ? error.message : error)
}
finally {
  let removed = 0
  for (const project of [b2bProject, plainProject]) {
    try {
      await restoreRegistration(project)
    }
    catch {
      fail++
      console.log(`  ✗ ${project.label}: \`registrationEnabled\` ließ sich nicht zurückstellen — bitte von Hand auf ${project.registrationBefore} setzen.`)
    }
    try {
      const { deleted, leftovers } = await project.cleanup.run()
      removed += Object.values(deleted).reduce((sum, n) => sum + n, 0)
      if (leftovers.length) {
        fail++
        console.log(`  ✗ ${project.label}: nach dem Aufräumen übrig — ${leftovers.join(', ')}`)
      }
    }
    catch (error) {
      fail++
      console.log(`  ✗ ${project.label}: Aufräumen gescheitert — ${error instanceof Error ? error.message : error}`)
    }
  }
  console.log(`\n${fail === 0 ? '✔' : '✗'} ${pass}/${pass + fail} Zusagen erfüllt (aufgeräumt: ${removed} Konten und Zeilen, nachgezählt)\n`)
  process.exit(fail === 0 ? 0 : 1)
}
