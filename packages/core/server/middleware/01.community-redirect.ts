import type { H3Event } from 'h3'
import { resolveCommunityRedirect } from '../../shared/communityRedirects'

/**
 * WEITERLEITUNGEN DER COMMUNITY (U15 Teil 3) — alte Adresse ⇒ neue Adresse,
 * bevor irgendetwas anderes passiert.
 *
 * ── WARUM 01 UND NICHT 10 ─────────────────────────────────────────────────
 * Nitro sortiert die Middleware lexikografisch, die Zahl-Präfixe sind seit
 * E8-4 Pflicht. `01.community-redirect.ts` läuft damit NACH `00.tenant.ts`
 * (die Community muss aufgelöst sein) und VOR allem anderen — insbesondere vor
 * `02.auth.ts`, `06.community-label.ts`, `07.community-role.ts` und
 * `09.community-seo.ts`.
 *
 * DAS IST DAS KOSTEN-ARGUMENT, und es geht in beide Richtungen:
 *
 *  - EIN TREFFER kostet nichts ausser dem Nachschlagen. Der Besucher bekommt
 *    seine 301, und der Server hat dafür WEDER eine Sitzung aufgelöst, NOCH
 *    ein Label vergeben, NOCH eine Rolle nachgeschlagen, NOCH den Sucheintrag
 *    gelesen, NOCH eine Seite gerendert. Liefe diese Datei als `10.`, zahlte
 *    jede Weiterleitung den vollen Aufbau einer Seite, die niemand zu sehen
 *    bekommt.
 *  - EIN FEHLTREFFER — also praktisch jeder Seitenaufruf — kostet EINEN Blick
 *    in einen mandanten-gescopten Microcache (30 s, `null` wird mitgecacht).
 *    Das ist dieselbe Grössenordnung wie `09.community-seo.ts` eine Datei
 *    weiter unten und wie die Rollen-Auflösung darüber. Auf einer Community
 *    OHNE Weiterleitungen wird ein Appwrite-404 gelesen und 30 Sekunden lang
 *    beantwortet; danach ist es ein `Map.get()`.
 *
 * Sie sortiert übrigens VOR `01.control-center.ts` („comm" < "cont"). Das ist
 * harmlos und bleibt es: auf einem Kontroll-Host gibt es keinen Mandanten,
 * also steigt diese Datei in der ersten Zeile aus.
 *
 * ── SIE LÄUFT AUCH VOR `08.trailing-slash.ts`, UND DAS IST ABSICHT ────────
 * Preis: `/alt/` ist hier noch nicht kanonisiert. Deshalb normalisiert die
 * REGEL selbst (`normalizeRedirectPath`) — `/alt/` trifft dieselbe Zeile wie
 * `/alt`, und der Besucher wird EINMAL umgeleitet statt zweimal (erst
 * Schrägstrich weg, dann umgezogen). Gewinn: siehe oben, nichts von dem, was
 * zwischen 02 und 09 passiert, wird für eine Weiterleitung bezahlt.
 *
 * ── NUR LESENDE ANFRAGEN ──────────────────────────────────────────────────
 * GET und HEAD, sonst nichts. Ein 301 auf ein POST darf der Browser als GET
 * wiederholen (RFC 9110) — das Formular wäre still verschwunden. Wer eine
 * Adresse umzieht, meint Seiten, die man AUFRUFT; die Schreibwege sind
 * `/api/*` und liegen ohnehin ausserhalb.
 *
 * ── DER QUERY-STRING BLEIBT ───────────────────────────────────────────────
 * Genau wie bei `08.trailing-slash.ts`. Eine Weiterleitung, die `?utm_source=`
 * oder `?token=` verschluckt, ist der Grund, warum die Kampagne oder der
 * Einladungslink danach nicht mehr funktioniert. Beim internen Ziel wird
 * angehängt, beim externen ebenso — dort mit `&`, falls das Ziel selbst schon
 * Parameter trägt.
 *
 * Fail-soft: `readCommunityRedirects` wirft nicht (s. dort). Ohne Mandant —
 * Silo, Kontroll-Host, Playground — passiert hier gar nichts.
 */
export default defineEventHandler(async (event) => {
  // Seit 2026-09-08 liest auch der SILO seine Zeile (`instance`) — vorher
  // brach die Middleware ohne Mandant ab, und eine dort gespeicherte
  // Weiterleitung hätte nie gegriffen (Regel: shared/communitySettingsRow.ts).
  // Instanzen ohne die Tabelle kosten einen 404 je 30 s (Negativ-Cache).
  const communityId = communitySettingsRowIdFor(event)
  if (!communityId) return

  if (event.method !== 'GET' && event.method !== 'HEAD') return

  const url = getRequestURL(event)
  const path = url.pathname
  // Server-Routen und Nuxt-Interna fasst diese Fläche nie an. Die Regel prüft
  // dasselbe noch einmal (fail-closed gegen Zeilen, die die Sperrliste nicht
  // kannten) — hier steht es, damit der Zwischenspeicher-Blick gar nicht erst
  // an jedem Bild und jedem Locale-Abruf entlangläuft.
  if (path.startsWith('/api/') || path.startsWith('/_')) return

  const config = await readCommunityRedirects(event, communityId)
  if (!config || config.rules.length === 0) return

  const hit = resolveCommunityRedirect(config, path, localeCodes(event))
  if (!hit) return

  return sendRedirect(event, withQuery(hit.to, url.search), hit.status)
})

/**
 * Die konfigurierten Sprachen dieser App — für das Sprach-Präfix der Regel.
 *
 * @nuxtjs/i18n legt sie in `runtimeConfig.public.i18n.locales` ab, je nach
 * Konfiguration als Zeichenkette oder als Objekt mit `code`. Beides wird
 * gelesen; was nicht passt, fällt weg. FEHLT die Angabe, ist die Liste leer —
 * dann gibt es kein Präfix, und es zählen nur exakte Treffer. Das ist die
 * richtige Rückfallebene: lieber eine Weiterleitung weniger als eine, die ein
 * erstes Pfad-Segment für eine Sprache hält, die es gar nicht gibt.
 */
function localeCodes(event: H3Event): string[] {
  const raw = (useRuntimeConfig(event).public as { i18n?: { locales?: unknown } }).i18n?.locales
  if (!Array.isArray(raw)) return []
  const codes: string[] = []
  for (const entry of raw) {
    if (typeof entry === 'string') codes.push(entry)
    else if (entry && typeof entry === 'object' && typeof (entry as { code?: unknown }).code === 'string') {
      codes.push((entry as { code: string }).code)
    }
  }
  return codes
}

/** Ziel + mitgebrachte Parameter — `?` oder `&`, je nachdem was das Ziel hat. */
function withQuery(to: string, search: string): string {
  if (!search) return to
  return to.includes('?') ? `${to}&${search.slice(1)}` : `${to}${search}`
}
