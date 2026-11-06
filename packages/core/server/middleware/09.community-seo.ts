/**
 * Sucheinstellung der Community fürs Seiten-SSR (U15 Teil 2) — läuft nach
 * Dateiname NACH 00.tenant.ts (tenant). Die Zahl-Präfixe sind seit E8-4
 * Pflicht: Nitro sortiert die Middleware lexikografisch.
 *
 * Warum diese Middleware existiert: das robots-Signal muss auf JEDER Seite der
 * Community stehen, nicht nur auf ihrer Startseite — sonst indexiert eine
 * Suchmaschine genau die Unterseiten, über die sie hereinkommt. Der EINE
 * Kopf-Aufruf, der das schreiben darf, ist `useLocaleSeoHead()` in der
 * `app.vue`; der braucht den Wert also, BEVOR die erste Seite rendert. Ein
 * Nachtrag aus einer Komponente käme für einen Crawler zu spät (er liest das
 * SSR-HTML) und wäre die zweite Stelle, die robots schreibt.
 *
 * Der App-Plugin `community-seo.server.ts` spiegelt von hier in den Payload.
 *
 * BEWUSST NUR Seiten-SSR (dieselbe Grenze wie 07.community-role.ts):
 * /api/*-Routen bauen keinen Kopf, und interne Pfade (/_nuxt, /_i18n, …)
 * erst recht nicht. Ohne diese Zeile liefe der Zwischenspeicher-Blick — und
 * alle 30 s ein Appwrite-Aufruf — auch an jedem Bild und jedem
 * Locale-Abruf entlang.
 *
 * KOSTEN: ein Appwrite-Lesezugriff je Community und 30 Sekunden
 * (`readCommunitySeo` cacht mandanten-gescopt, auch das leere Ergebnis).
 * Dieselbe Grössenordnung wie die Rollen-Auflösung eine Datei darüber.
 *
 * Fail-soft: `readCommunitySeo` wirft nicht (s. dort). Ohne Mandant — Silo,
 * Kontroll-Host, Playground — passiert hier gar nichts, und der Kopf bleibt
 * exakt der von vor U15.
 */
export default defineEventHandler(async (event) => {
  // Seit 2026-09-08 liest auch der SILO seine Zeile (`instance`) — vorher
  // blieb der Sucheintrag dort ohne Wirkung (Regel: shared/communitySettingsRow.ts).
  const communityId = communitySettingsRowIdFor(event)
  if (!communityId) return

  const path = event.path.split('?')[0] ?? ''
  if (path.startsWith('/api/') || path.startsWith('/_')) return

  event.context.communitySeo = await readCommunitySeo(event, communityId)
})
