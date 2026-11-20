import { z } from 'zod'
import type { DependencyTicketInput } from '../../../../../core/shared/dependencyTicket'
import type { DependencyTicketResponse } from '../../../../shared/types/system'
import { ALL_DEP_NAMES, latestAppwriteVersion, latestVersion, pkgVersion } from '../../../utils/dependencies'
import { readManifest, usableVersion } from '../../../utils/systemManifestRead'
import { softFail } from '../../../../../core/server/utils/softFail'

const schema = z.object({
  kind: z.enum(['package', 'appwrite']),
  /** Nur bei kind 'package' — bei 'appwrite' setzt die Route den Namen selbst. */
  name: z.string().min(1).optional(),
})

/**
 * „Prüfen, ob wir updaten können" — legt zu einer VERALTETEN Version ein Ticket
 * im Board an (Fragenkatalog + bekannte Kopplungen; danach läuft die bestehende
 * KI-Triage). Gilt für npm-Pakete UND für die Appwrite-Serverversion.
 *
 * Der Weg dorthin läuft über den core-Vertrag `createDependencyUpdateTicket`
 * (CONCEPT A14): admin und tickets sind zwei Produkt-Layer und kennen einander
 * nicht — Cross-Layer geht nur als expliziter Vertrag über core.
 * Läuft in dieser App kein Board, antwortet die Route 404 — wie eine Datentür,
 * die es hier gar nicht gibt, statt eines Fehlers über eine fremde Fähigkeit.
 *
 * Anders als `update.post.ts` ist das hier NICHT dev-only: ein Ticket ist eine
 * Notiz, kein Eingriff ins Repo — genau in Produktion sieht der Betreiber ja,
 * dass etwas veraltet ist.
 */
export default defineEventHandler(async (event): Promise<DependencyTicketResponse> => {
  requirePermission(event, 'system.manage')

  const body = await readValidatedBody(event, schema.parse)
  const config = useRuntimeConfig(event)

  let input: DependencyTicketInput

  if (body.kind === 'appwrite') {
    // Laufende Serverversion LIVE (öffentlicher health/version-Endpoint, kein
    // Key nötig) — genau die Quelle, aus der die Systemseite sie anzeigt.
    // Fremde URL, `, string` — Begruendung in
    // apps/platform/server/utils/tenantBrandMark.ts.
    const versionRes = await $fetch<{ version: string }>(`${config.public.appwriteEndpoint}/health/version`, {
      headers: { 'X-Appwrite-Project': config.public.appwriteProjectId },
    }).catch(softFail('admin:api/admin/system/dependency-ticket.post:$fetch', null))
    const to = await latestAppwriteVersion()
    if (!to) {
      throw createError({ status: 502, statusText: 'Could not resolve latest version' })
    }
    input = {
      kind: 'appwrite',
      // Fester Name, nicht `appwrite`: das npm-Paket `appwrite` (Web-SDK) gibt
      // es wirklich, und beide teilen sich den Dedup-Schlüsselraum.
      name: 'appwrite-server',
      from: versionRes?.version ?? 'unknown',
      to,
    }
  }
  else {
    const name = body.name ?? ''
    // Whitelist wie im Update-Endpunkt: nur bekannte Pakete, keine beliebigen
    // Namen aus dem Body.
    if (!ALL_DEP_NAMES.includes(name)) {
      throw createError({ status: 400, statusText: 'Unknown dependency' })
    }
    // VERSION: Manifest zuerst (der Build-Stand IST der ausgelieferte Stand),
    // Laufzeit-Auflösung nur als Rückfall — dieselbe Vorfahrt wie in system.get.ts.
    const manifest = readManifest(config.adminSystemManifest)
    const fromManifest = manifest?.dependencies.find(dep => dep.name === name)?.version
    const to = await latestVersion(name)
    if (!to) {
      throw createError({ status: 502, statusText: 'Could not resolve latest version' })
    }
    input = {
      kind: 'package',
      name,
      from: usableVersion(fromManifest) ? fromManifest : pkgVersion(name),
      to,
    }
  }

  if (!hasDependencyTicketCreator()) {
    throw createError({ status: 404, statusText: 'Tickets not available' })
  }

  const result = await createDependencyUpdateTicket(event, input)
  if (!result) {
    throw createError({ status: 404, statusText: 'Tickets not available' })
  }

  // Protokoll NACH dem Erfolg — kein Eintrag über ein Ticket, das nie entstand.
  await recordAudit(event, {
    action: 'system.dependency_ticket_created',
    targetType: 'dependency',
    targetId: input.name,
    targetName: input.name,
    metadata: { from: input.from, to: input.to, ticketId: result.ticketId },
  })

  return { ticketId: result.ticketId, name: input.name, from: input.from, to: input.to }
})
