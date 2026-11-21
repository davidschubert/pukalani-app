import { z } from 'zod'
import { onboardingSiteSchema } from '../../../../schemas/onboarding'
import { checkInviteCode, releaseInviteCodeUse, reserveInviteCodeUse, type InviteCheck } from '../../../utils/inviteCodes'
import { withControlLock } from '../../../utils/controlLock'
import { markCodeRedeemed } from '../../../utils/inviteRequests'
import { readOnboardingGate } from '../../../utils/onboardingGate'
import { provisionCommunity } from '../../../utils/onboardingProvision'
import { requireOnboardingCaller, verifyRuntimeIdentity } from '../../../utils/onboardingService'
import { isNameReservedInDb } from '../../../utils/reservedNames'

/**
 * Self-Service: neue Community anlegen (SAAS-ROADMAP #1, Schritt 7 des Wizards).
 *
 * Aufrufer ist die PLATFORM-App, nicht der Browser — deshalb zwei Beweise
 * (Service-Secret + Appwrite-JWT des Nutzers, s. onboardingService.ts). Das
 * Control Plane prüft die Identität selbst; es glaubt dem Aufrufer nichts.
 *
 * Kein `requirePermission`: das ist bewusst KEINE Betreiber-Route. Autorisiert
 * wird über (a) das gültige JWT eines Runtime-Users mit BESTÄTIGTER Adresse,
 * (b) einen gültigen Einladungs-Code (solange das Tor zu ist) und (c) das
 * Konto-Kontingent. Die Testphase vergibt `provisionCommunity` einmal je Konto.
 */
const bodySchema = z.object({
  jwt: z.string().min(1).max(4096),
  site: onboardingSiteSchema,
}).strict()

export default defineEventHandler(async (event) => {
  await requireOnboardingCaller(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  const identity = await verifyRuntimeIdentity(event, body.jwt)

  /**
   * EINE COMMUNITY ANLEGEN VERLANGT EINE BESTÄTIGTE ADRESSE (BE-015, Davids
   * Entscheidung 2026-11-16) — mit und ohne Einladungs-Code, VOR allem anderen:
   * vor dem Namen, vor dem Code (kein Code wird verbraucht) und vor der
   * Sperre. Die Testphase gibt es einmal je Konto; ein Konto, dessen Adresse
   * niemandem nachweislich gehört, ist zu billig, um daran etwas zu hängen.
   * Der Grund reist als `email_unverified` — der Wizard sagt dann, was zu tun
   * ist (`onboarding.errors.verifyFirst`).
   */
  if (identity.emailVerified !== true) {
    logEvent('warn', 'onboarding.unverified_rejected', { runtimeUserId: identity.userId })
    throw createError({ status: 403, statusText: 'Email not verified', data: { code: 'email_unverified' } })
  }

  // Gesperrte Namen, Teil 2: das Zod-Schema hat die Code-Basisliste geprüft,
  // hier kommt die Betreiber-Zusatzliste dazu (control-027). VOR dem
  // Einladungs-Code, damit ein reservierter Name keinen Code kostet.
  //
  // 409 „nicht verfügbar", nicht 403 „verboten": für den Nutzer ist das
  // dieselbe Tatsache wie ein schon vergebener Name — er soll einen anderen
  // wählen, nicht überlegen, was er falsch gemacht hat. Der wahre Grund steht
  // im Log, nicht in der Antwort.
  if (await isNameReservedInDb(event, body.site.slug)) {
    logEvent('warn', 'onboarding.slug_reserved', {
      slug: body.site.slug,
      runtimeUserId: identity.userId,
    })
    throw createError({ status: 409, statusText: 'Slug not available' })
  }

  // Early-Access-Tor — aber nur, solange der Betreiber es angeschaltet lässt
  // (U2, Davids Entscheidung 1 vom 2026-08-10). DIESE Stelle ist die Wahrheit:
  // der Wizard überspringt das Code-Feld anhand desselben Zustands, aber wer
  // die Route direkt ruft, wird hier abgewiesen — und wer bei offenem Tor
  // ohne Code kommt, kommt durch, egal was ein Client behauptet.
  const { inviteRequired } = await readOnboardingGate(event)
  let invite: InviteCheck | null = null

  if (inviteRequired) {
    // Nach außen bleibt jede Ablehnung dieselbe Antwort (kein Code-Ratespiel),
    // der Grund steht nur im Log. Die Adresse geht mit: ein an jemanden
    // vergebener Code (control-017) gilt NUR für dessen Konto — weiterleiten
    // bringt nichts. Ein FEHLENDER Code ist seit U2 im Schema erlaubt und
    // fällt hier auf denselben stummen Weg wie ein falscher.
    invite = await checkInviteCode(event, body.site.inviteCode ?? '', Date.now(), identity.email, identity.emailVerified)
    if (!invite.valid) {
      logEvent('warn', 'onboarding.invite_rejected', {
        reason: invite.reason,
        runtimeUserId: identity.userId,
      })
      // DIE EINE AUSNAHME von „jede Ablehnung sieht gleich aus": eine
      // unbestätigte Adresse. Sie ist erst erreichbar, NACHDEM die Adresse zum
      // gebundenen Code gepasst hat — der Code gehört dem Fragenden also
      // nachweislich, es ist nichts zu erraten. Ohne diesen Grund stünde ein
      // eingeladener Kunde vor einem „geht nicht" ohne Ausweg; mit ihm sagt der
      // Wizard, was zu tun ist (Bestätigungsmail anfordern).
      throw createError({
        status: 403,
        statusText: 'Invalid invite code',
        ...(invite.reason === 'unverified_email' ? { data: { code: 'email_unverified' } } : {}),
      })
    }
  }

  const code = invite?.row ?? null

  /**
   * DIE REGELN DIESER ANLAGE HALTEN UNTER GLEICHZEITIGEN ANFRAGEN (BE-013).
   *
   *  - KONTINGENT JE KONTO: `provisionCommunity` zählt die eigenen Communities
   *    und legt danach an. Zwei gleichzeitige Anfragen desselben Kontos sähen
   *    beide „noch keine" — deshalb läuft Zählen-und-Anlegen unter der Sperre
   *    (scope `onboarding`, Gegenstand Projekt + Konto). Der Zweite liest
   *    danach die Community des Ersten: gleiche Adresse ⇒ `reused`, andere ⇒
   *    das Kontingent lehnt ab.
   *  - EINLADUNGS-CODE: die Einlösung wird VOR der Anlage atomar reserviert
   *    (`reserveInviteCodeUse`, die Datenbank hält `maxUses`). Ein erschöpfter
   *    Code bekommt dieselbe stumme Antwort wie jeder ungültige. Scheitert
   *    die Anlage, geht die Einlösung zurück; ein Retry, der die eigene
   *    Community wiederfindet (`reused`), kostet keine zweite.
   *
   * Bei OFFENEM Tor ist `code` null: ein mitgeschickter Code wird dann gar
   * nicht erst geprüft und deshalb auch nicht verbraucht — er soll noch gelten,
   * wenn der Betreiber das Tor wieder schließt.
   */
  const result = await withControlLock(event, { scope: 'onboarding', subject: `${identity.projectId}:${identity.userId}` }, async () => {
    if (code && await reserveInviteCodeUse(event, code) === 'exhausted') {
      logEvent('warn', 'onboarding.invite_rejected', {
        reason: 'exhausted',
        runtimeUserId: identity.userId,
      })
      throw createError({ status: 403, statusText: 'Invalid invite code' })
    }

    let provisioned: Awaited<ReturnType<typeof provisionCommunity>>
    try {
      provisioned = await provisionCommunity(event, identity, {
        name: body.site.name,
        slug: body.site.slug,
        vibe: body.site.vibe,
        /**
         * NUR WAS GEFRAGT WURDE (U12). Seit der Wizard drei Dinge fragt, kommen
         * `purpose`/`memberRange`/`goal` nur noch aus einer älteren platform —
         * fehlen sie, stehen sie auch nicht im Profil. Ein gesetzter Default wäre
         * eine erfundene Antwort und später nicht mehr von einer echten zu
         * unterscheiden (Begründung im Kopf von schemas/onboarding.ts).
         */
        profile: {
          ...(body.site.purpose ? { purpose: body.site.purpose } : {}),
          ...(body.site.memberRange ? { memberRange: body.site.memberRange } : {}),
          category: body.site.category,
          ...(body.site.goal ? { goal: body.site.goal } : {}),
          ...(body.site.description ? { description: body.site.description } : {}),
          // Hauptsprache (Q10): die Sprache, in der der Owner den Wizard
          // durchlaufen hat — seine Sprache ist die Vorgabe, ändern kann er
          // sie im Dashboard (Name und Beschreibung).
          ...(body.site.locale ? { locale: body.site.locale } : {}),
        },
        inviteCode: code,
      })
    }
    catch (error) {
      if (code) await releaseInviteCodeUse(event, code, 'provision_failed')
      throw error
    }
    if (code && provisioned.reused) await releaseInviteCodeUse(event, code, 'reused')
    return provisioned
  })

  if (!result.reused && code) {
    // Rückschreibung: aus „zugewiesen" wird die TATSACHE „eingelöst am … →
    // diese Community". Ohne sie wüsste der Betreiber nie, ob seine Einladung
    // angekommen ist — und genau das ist die Frage, die er stellt.
    await markCodeRedeemed(event, code, result.communityId)
  }

  return result
})
