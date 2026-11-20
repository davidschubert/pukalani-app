import type { FormErrorEvent } from '@nuxt/ui'

/**
 * Fokus nach einem gescheiterten Absenden (UX-005, Q08).
 *
 * Ein Fehlertext unter einem Feld ist richtig mit dem Feld verbunden
 * (`aria-invalid`, `aria-describedby`), wird aber erst vorgelesen, wenn das
 * Feld den Fokus bekommt. Ohne diese Hilfe blieb der Fokus auf dem Knopf —
 * oder fiel auf die Seite.
 *
 * WARUM VERZÖGERT (gemessen, 2026-11-21): `UForm` sperrt während des
 * Absendens ALLE seine Felder und gibt sie erst frei, wenn der eigene
 * `@submit`-Handler zurück ist bzw. NACH dem `@error`-Ereignis. Ein `focus()`
 * im selben Zug trifft ein gesperrtes Feld und tut nichts — ohne Fehler, ohne
 * Warnung. Ein `nextTick()` reicht im `@submit`-Handler nicht (er läuft noch
 * IM Absenden); der nächste Makro-Takt liegt sicher hinter Freigabe und
 * Zeichnen.
 */
function focusLater(find: () => HTMLElement | null | undefined) {
  setTimeout(() => find()?.focus(), 0)
}

/**
 * Hängt an `@error` eines `UForm`: die Prüfung nennt die Felder in der
 * Reihenfolge des Schemas, das erste mit einer Kennung bekommt den Fokus.
 */
export function focusFirstFormError(event: FormErrorEvent) {
  const id = event.errors.find(error => error.id)?.id
  if (id) focusLater(() => document.getElementById(id))
}

/**
 * Nach einer Ablehnung durch den SERVER (falsches Passwort) gibt es kein
 * einzelnes fehlerhaftes Feld. Der Fokus geht in das Feld, das der Mensch als
 * Nächstes ändern wird — die Meldung selbst sagt `role="alert"` an.
 */
export function focusFormField(root: HTMLElement | null | undefined, name: string) {
  focusLater(() => root?.querySelector<HTMLElement>(`[name="${name}"]`))
}
