import { z } from 'zod'
import { displayNameField } from './auth'
import type { TranslateFn } from './auth'

const identity: TranslateFn = key => key

export function createProfileSchema(t: TranslateFn = identity) {
  return z.object({
    // Profil = der zweite Hebel aus dem Vorfall 2026-10-27 („Name ändern" +
    // „Mail erneut senden") — dieselbe Regel wie bei der Registrierung.
    name: displayNameField(t),
    bio: z.string().max(500, t('validation.bioMax')).optional(),
    // Wird ins native Appwrite-Phone-Feld geschrieben → strenges E.164
    // (Start mit '+', max. 15 Ziffern, keine Leerzeichen). Leer = Feld löschen.
    phone: z.string()
      .optional()
      .refine(value => !value || /^\+[1-9]\d{1,14}$/.test(value), t('validation.phoneFormat')),
    // Erlaubt die relative Storage-URL (/api/storage/<bucket>/<id>, Upload-Pfad)
    // ODER eine externe https-URL (BYO-Avatar im No-Bucket-Fallback). Andere
    // Schemata (javascript:, data:, http:) und Freitext werden abgewiesen — das
    // Feld landet als <img src> auch bei anderen Betrachtern.
    avatarUrl: z.string()
      .max(2048, t('validation.urlInvalid'))
      .refine(
        value => !value || value.startsWith('/api/storage/') || /^https:\/\//i.test(value),
        t('validation.urlInvalid'),
      )
      .optional(),
    /**
     * FREIWILLIGER STANDORT (Mitglieder-Karte, Etappe 1 — 2026-08-23).
     *
     * ALLE DREI FELDER ODER GAR KEINES: der Wert entsteht ausschliesslich
     * durch die AUSWAHL eines Ortes im Picker, und dabei stehen Label und
     * Koordinaten gemeinsam fest. Ein Label ohne Koordinaten wäre auf der
     * Karte unsichtbar, Koordinaten ohne Label ein Punkt ohne Namen — beides
     * ist kein halber Standort, sondern ein kaputter. Erzwungen wird das vom
     * Objekt selbst: seine drei Felder sind Pflicht.
     *
     * `null` heißt LÖSCHEN (das X im Feld), `undefined` heißt NICHT ANGEFASST.
     * Der Unterschied ist wichtig, weil die Route die prefs komplett
     * zurückschreibt: ohne diese Trennung nähme jedes Speichern eines anderen
     * Feldes den Standort mit weg.
     *
     * `label` kommt vom Server (`cityLabel()`), wird hier aber trotzdem
     * begrenzt — ein Client schickt, was er will, und das Feld wird anderen
     * Mitgliedern gezeigt.
     */
    location: z.object({
      label: z.string().min(1).max(120),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
    }).nullable().optional(),
  })
}

export const profileSchema = createProfileSchema()

export type ProfileInput = z.infer<typeof profileSchema>
