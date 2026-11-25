/**
 * RU1 (c) — ein Dateiname ist kein Link.
 *
 * Die Link-Erweiterung von Tiptap verlinkt beim Tippen und Einfügen alles,
 * was wie ein Host aussieht. `README.md` ist für sie ein Host in Moldau
 * (`.md`), `package.json`, `nuxt.config.ts` und `app.vue` ebenso. In einer
 * Ticket-Beschreibung sind das fast immer Dateinamen, und aus ihnen wurde
 * `[README.md](http://README.md)` — so stand es dann auch im Auftrag an den
 * Agenten (Klick-Probe vom 2026-11-21).
 *
 * Die Regel hier verlinkt von selbst NUR, was eindeutig eine Adresse ist:
 * mit Schema (`https://…`, `mailto:…`) oder mit `www.` vorn. Ein Link über
 * den Knopf der Werkzeugleiste bleibt jederzeit möglich.
 */
export function shouldAutoLinkTicketText(text: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return true
  if (/^mailto:/i.test(text)) return true
  return /^www\.[^\s.]+\.[^\s]+/i.test(text)
}
