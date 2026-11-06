import { Account, AppwriteException, Client, ID, Query } from 'node-appwrite'
import { z } from 'zod'
import { createAdminClient, requestLocale, setSessionCookie } from '../../lib/appwrite'
import { registerSchema } from '../../../schemas/auth'

/**
 * Der Token gehört NICHT ins geteilte `registerSchema`: das trägt auch das
 * Formular, und dort hat er nichts zu suchen. Hier, an der einen Route, die ihn
 * auswertet, ist er ausdrücklich — und in derselben Form geprüft wie überall
 * sonst (64 Hex, wie ihn `community_invites` vergibt).
 */
const signupSchema = registerSchema.extend({
  inviteToken: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  /**
   * Zulassungs-Code eines Produkt-Layers (Brand-Beta, …) — NICHT der
   * Community-Einladungstoken darüber. Der Core kennt sein Format bewusst
   * nicht (Prüfung, Adressbindung, Ablauf, Widerruf gehören dem registrierten
   * Provider, s. server/utils/signupAdmission.ts); hier steht nur eine Schranke
   * gegen Riesen-Bodies.
   */
  admissionCode: z.string().trim().min(1).max(200).optional(),
  /**
   * Turnstile-Token (Bot-Beweis, Vorfall 2026-10-27) — aus demselben Grund
   * wie `inviteToken` NICHT im geteilten Schema: das Formular-Schema prüft
   * Eingaben eines Menschen, der Token ist ein Ausweis des Browsers. Ohne
   * konfigurierte Schlüssel fehlt er und wird nie gelesen. 4096 ist eine
   * Schranke gegen Riesen-Bodies, kein Format (Cloudflare nennt keins).
   */
  turnstileToken: z.string().max(4096).optional(),
})

/**
 * Account + Session in einem Request (AdminClient: users.write + sessions.write).
 * Validierung zentral via Zod — ungültiger Body wirft 400.
 */
export default defineEventHandler(async (event) => {
  const appConfig = await getAppConfig(event)
  /**
   * ZULASSUNG (Brand-Beta-Naht): ein registrierter Provider darf die
   * geschlossene INSTANZ-Registrierung für genau diese Anlage öffnen — und
   * sonst nichts. `maintenanceMode` steht deshalb in einer eigenen Bedingung
   * und ist durch keine Einladung umgehbar; die Mandanten-Sperre weiter unten
   * ebenso wenig.
   *
   * Ohne Provider ist das hier Zeile für Zeile das alte Verhalten: gleiche
   * Reihenfolge (Schalter VOR dem Body), gleicher Status, gleiche Meldung.
   * Mit Provider muss der Body vorgezogen werden — er trägt Adresse und Code,
   * und ohne beides kann niemand entscheiden.
   */
  if (appConfig.maintenanceMode || (!appConfig.registrationEnabled && !hasSignupAdmissionProvider())) {
    throw createError({ status: 403, statusText: 'Registration is currently disabled' })
  }

  const { email, password, name, inviteToken, admissionCode, turnstileToken } = await readValidatedBody(event, signupSchema.parse)

  // Identische Meldung wie oben: ein falscher, abgelaufener, widerrufener oder
  // fehlender Code sieht aus wie eine schlicht geschlossene Registrierung
  // (keine Enumeration).
  if (!appConfig.registrationEnabled && !(await signupAdmissionOpensRegistration(event, { email, inviteCode: admissionCode }))) {
    throw createError({ status: 403, statusText: 'Registration is currently disabled' })
  }

  /**
   * Zweite, MANDANTEN-Ebene (S1): app_config ist EINE Row pro Projekt — im Pool
   * teilen sich alle Communities sie, der Schalter oben kann also nicht pro
   * Community stehen. tenants.openRegistration kann es (control-018).
   *
   * EINE EINLADUNG ÖFFNET DIE TÜR — für genau die eingeladene Adresse (Davids
   * Entscheidung 2026-08-15). Ohne das war eine geschlossene Community für
   * Eingeladene OHNE Pukalani-Konto gar nicht betretbar, obwohl der
   * Einladungs-Dialog es zusagt. Die Adressbindung steckt in
   * `inviteOpensRegistrationFor` und ist der Grund, warum ein weitergeleiteter
   * Link kein Generalschlüssel ist.
   *
   * Die Reihenfolge ist Absicht: erst der billige Schalter, dann der Body, dann
   * die Naht ins Control Plane. Wer ohne Token kommt, kostet keinen Netzaufruf.
   */
  if (!tenantRegistrationOpen(event) && !(await inviteOpensRegistrationFor(event, inviteToken, email))) {
    throw createError({ status: 403, statusText: 'Registration is closed' })
  }

  /**
   * BOT-BEWEIS (Vorfall 2026-10-27: 209 Spam-Verifizierungsmails). Bewusst
   * HINTER allen Registrierungs-Schaltern — eine geschlossene Tür antwortet
   * wie bisher, ohne Cloudflare-Aufruf und ohne Mail — und VOR
   * `account.create`, dem ersten Schritt, an dem eine Mail hängt. Ohne
   * Schlüssel ein No-Op (server/utils/turnstile.ts).
   */
  await requireTurnstile(event, 'signup', turnstileToken)

  const { account } = createAdminClient(event)

  // Appwrite-Fehler kapseln: doppelte E-Mail (409) sauber melden, Rest generisch —
  // keine Appwrite-Fehlerdetails an den Client leaken.
  let session
  try {
    await account.create({ userId: ID.unique(), email, password, name })
    session = await account.createEmailPasswordSession({ email, password })
  }
  catch (error) {
    if (error instanceof AppwriteException) {
      if (error.code === 409) {
        throw createError({ status: 409, statusText: 'Email already registered' })
      }
      // Das E-Mail-Format ist bereits Zod-validiert → ein 4xx von Appwrite hier
      // ist faktisch eine Email-Policy-Ablehnung (Wegwerf-/Free-Provider, seit
      // Appwrite 1.9.5 in Auth → Security konfigurierbar). 422 → eigene Meldung.
      if (error.code >= 400 && error.code < 500) {
        throw createError({ status: 422, statusText: 'Email not allowed' })
      }
    }
    throw createError({ status: 400, statusText: 'Registration failed' })
  }

  setSessionCookie(event, session.secret, session.expire)
  await logAuthEvent(event, 'user.login', { userId: session.userId, name, method: 'signup' })

  /**
   * BEITRITT (A5, Davids Entscheidung 1 vom 2026-07-29). Wer sich AUF DEM
   * MANDANTEN-HOST ein Konto anlegt, tritt dieser Community bei — deutlicher
   * wird eine Absicht nicht, und der Feed sagt drei Zeilen weiter unten
   * ohnehin schon „ist der Community beigetreten". Jetzt steht es auch in
   * `community_members`, also in etwas, das man entziehen kann.
   *
   * Hier ist der beste Moment, den es gibt: das Label steht damit VOR dem
   * ersten Seitenaufruf und lange vor dem Realtime-Socket.
   *
   * `sessionSecret` + `userId` explizit — die Session ist eine Millisekunde alt
   * und steckt noch nicht im Request-Cookie (dasselbe Problem wie bei der
   * Verifizierungs-Mail unten). No-Op auf Kontroll-Hosts und in Silo-Apps.
   * Der Registrierungs-Schalter der Community ist oben schon geprüft
   * (assertTenantRegistrationOpen); das Control Plane prüft ihn erneut selbst.
   */
  await joinCommunity(event, 'registration', { sessionSecret: session.secret, userId: session.userId })

  /**
   * AGB-ZUSTIMMUNG MIT FASSUNG (BS1 R1) — hier ist die Zustimmung eine
   * Tatsache: ohne das Häkchen kommt dieses Formular gar nicht bis zum POST
   * (`createRegisterFormSchema`, `requireTerms`). Der Server prüft sie nicht
   * nach (er bekommt sie bewusst nicht, s. `RegisterForm.vue`), er hält fest,
   * WELCHE Fassung diese App zum Zeitpunkt der Anlage ausgeliefert hat.
   * No-Op in jeder App ohne `pukalani.auth.termsUrl`. Best-effort.
   */
  await recordTermsAcceptance(event, session.userId)

  /**
   * UNTERNEHMER-BESTÄTIGUNG (BS1 R1c) — dieselbe Arbeitsteilung eine Zeile
   * darüber, nur mit einem eigenen Schalter: ohne das zweite Häkchen kommt
   * dieses Formular nicht bis zum POST (`requireBusiness`), festgehalten
   * wird aber, was der Server selbst weiß — dass DIESE App nur Unternehmen
   * aufnimmt. No-Op ohne `pukalani.auth.businessOnly`. Best-effort.
   */
  await recordBusinessConfirmation(event, session.userId)

  // Nicht-blockierende E-Mail-Verifizierung (pukalani.auth.verification): die
  // Bestätigungs-Mail geht über die Instanz-SMTP raus, der User ist trotzdem
  // sofort eingeloggt. Best-effort — ein Mail-Fehler darf den Signup nie
  // kippen. Der frische Session-Secret ist noch nicht im Request-Cookie,
  // daher ein eigener Client statt createSessionClient(event).
  const config = useRuntimeConfig(event)
  const appConfig2 = useAppConfig() as { pukalani?: { auth?: { verification?: boolean } } }
  if (appConfig2.pukalani?.auth?.verification && config.public.appUrl) {
    try {
      const client = new Client()
        .setEndpoint(config.public.appwriteEndpoint)
        .setProject(config.public.appwriteProjectId)
        .setSession(session.secret)
      const locale = requestLocale(event)
      if (locale) client.setLocale(locale)
      await new Account(client).createVerification({ url: `${config.public.appUrl}/verify` })
    }
    catch (error) {
      console.error('[core] Verifizierungs-Mail nach Signup fehlgeschlagen:', error)
    }
  }

  // Activity-Feed: „ist der Community beigetreten" (best-effort). Bewusst NUR
  // hier — der OTP-Flow legt User schon beim Token-Versand an (unverifiziert),
  // dort wäre der Eintrag verfrüht.
  await recordActivity(event, {
    actorId: session.userId,
    actorName: name,
    type: 'user.joined',
    objectType: 'user',
    objectId: session.userId,
    link: '/',
  })
  // Meilenstein („Die Community hat N Mitglieder") — best-effort wie der Feed
  const { users } = createAdminClient(event)
  const totalUsers = await users.list({ queries: [Query.limit(1)] }).then(r => r.total).catch(() => 0)
  await maybeRecordMilestone(event, { type: 'milestone.members', count: totalUsers })

  return { ok: true }
})
