import { z } from 'zod'
import {
  MAX_NAV_ENTRIES,
  MAX_NAV_LABEL,
  MAX_NAV_TARGET,
  communityNavConfigFits,
  isCustomNavLinkId,
  isGroupNavId,
  isSafeExternalNavTarget,
  isSafeInternalNavTarget,
} from '../../core/shared/communityNavigation'

type TranslateFn = (key: string) => string
const identity: TranslateFn = key => key

// Registry-Ids (`feed`), CMS-Seiten (`page-imprint`), eigene Links (`link-1`).
// Bewusst eng: die Id ist ein SCHLÜSSEL, kein Text — sie wird nie angezeigt.
const navIdRe = /^[A-Za-z0-9][A-Za-z0-9\-_.]{0,63}$/

/**
 * DAS MENÜ EINER COMMUNITY SPEICHERN (U15 Teil 1).
 *
 * Die Regel selbst (was ein gespeichertes Dokument BEDEUTET) steht in
 * `core/shared/communityNavigation.ts`; hier steht, was überhaupt hinein darf.
 * Beides prüft dieselben Prädikate — die Route validiert beim SCHREIBEN, die
 * Auflösungsregel noch einmal beim LESEN (Begründung dort: das Dokument ist
 * JSON in einer Spalte und überlebt jede Schema-Änderung).
 *
 * ── UMBENENNEN JA, UMLENKEN NEIN ──────────────────────────────────────────
 * Ein Eintrag, der ein PRODUKT meint, darf kein eigenes `to` tragen. Das ist
 * die schärfste Zusage dieses Schemas und der Grund, warum sie hier steht und
 * nicht nur im Editor: dürfte der Owner das Ziel eines bestehenden Eintrags
 * setzen, könnte „Beiträge" im Kopf der eigenen Community auf eine fremde
 * Adresse zeigen — ein Link, dem der Besucher vertraut, weil er aussieht wie
 * Teil der Seite. Wer irgendwo anders hin verlinken will, legt einen EIGENEN
 * Link an; der sieht im Editor auch aus wie einer.
 *
 * ── WAS HIER NICHT GEPRÜFT WERDEN KANN ────────────────────────────────────
 * Ob ein interner Link auf eine Seite zeigt, die es in DIESER Community
 * wirklich gibt. Das braucht Daten (die veröffentlichten Slugs), also prüft es
 * die Route nach der Schema-Prüfung. Hier bleibt die FORM: ein Pfad, kein
 * Schema, kein `//host`, kein `..`.
 *
 * ── UNTERPUNKTE (U15 Teil 3, 2026-09-08) ──────────────────────────────────
 * Zwei neue Zusagen, und beide sind hier FAIL-LOUD, obwohl die Leseregel sie
 * fail-soft noch einmal abfängt. Das ist keine Doppelung ohne Grund: beim
 * SCHREIBEN sitzt ein Mensch davor, der eine Antwort verdient — ein still
 * ausgerichteter Eintrag sähe im Editor wie ein Speicherfehler aus.
 *
 *  - Eine GRUPPE (`group-<n>`) hat einen Text und KEIN Ziel. Ein Ziel an einer
 *    Gruppe wäre genau die Umlenkung, die der Absatz darüber verbietet, nur
 *    unter neuem Namen.
 *  - `parent` muss auf eine Id IM DOKUMENT zeigen, die selbst kein `parent`
 *    trägt: GENAU EINE EBENE (Davids Entscheidung). Eine zweite Ebene wäre
 *    nicht bloss ungerendert, sie wäre eine Zusage, die die Regel bricht.
 */
export function createCommunityNavigationSchema(t: TranslateFn = identity) {
  const entrySchema = z.object({
    id: z.string().trim().regex(navIdRe, t('pages.navigation.validation.idInvalid')),
    hidden: z.boolean().optional(),
    label: z.string().trim().max(MAX_NAV_LABEL, t('pages.navigation.validation.labelMax')).optional(),
    to: z.string().trim().max(MAX_NAV_TARGET, t('pages.navigation.validation.targetMax')).optional(),
    external: z.boolean().optional(),
    // Dieselbe enge Form wie `id` — es IST eine Id, kein Text.
    parent: z.string().trim().regex(navIdRe, t('pages.navigation.validation.idInvalid')).optional(),
  }).strict().superRefine((entry, ctx) => {
    const custom = isCustomNavLinkId(entry.id)

    if (isGroupNavId(entry.id)) {
      // Ein Wort, das aufklappt: Text Pflicht, Ziel verboten.
      if (entry.to !== undefined || entry.external !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['to'], message: t('pages.navigation.validation.groupNoTarget') })
      }
      if (!entry.label) {
        ctx.addIssue({ code: 'custom', path: ['label'], message: t('pages.navigation.validation.labelRequired') })
      }
      return
    }

    if (!custom) {
      // Umbenennen ja, umlenken nein (s. Kopf).
      if (entry.to !== undefined || entry.external !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['to'], message: t('pages.navigation.validation.notRetargetable') })
      }
      return
    }

    if (!entry.label) {
      ctx.addIssue({ code: 'custom', path: ['label'], message: t('pages.navigation.validation.labelRequired') })
    }
    const to = entry.to ?? ''
    if (!to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: t('pages.navigation.validation.targetRequired') })
      return
    }
    const ok = entry.external === true ? isSafeExternalNavTarget(to) : isSafeInternalNavTarget(to)
    if (!ok) {
      ctx.addIssue({
        code: 'custom',
        path: ['to'],
        message: entry.external === true
          ? t('pages.navigation.validation.externalInvalid')
          : t('pages.navigation.validation.internalInvalid'),
      })
    }
  })

  return z.object({
    entries: z.array(entrySchema).max(MAX_NAV_ENTRIES, t('pages.navigation.validation.tooMany')),
  }).strict().superRefine((value, ctx) => {
    const seen = new Set<string>()
    for (const entry of value.entries) {
      if (seen.has(entry.id)) {
        ctx.addIssue({ code: 'custom', path: ['entries'], message: t('pages.navigation.validation.duplicateId') })
        break
      }
      seen.add(entry.id)
    }

    /**
     * GENAU EINE EBENE — die Prüfung, die nur über das GANZE Dokument geht
     * (U15 Teil 3). Ein einzelner Eintrag kann sie nicht bestehen oder
     * verfehlen: ob sein `parent` zulässig ist, hängt an einem ANDEREN Eintrag.
     *
     * Drei Ablehnungen, alle mit derselben Begründung `parentInvalid`: der
     * Hauptpunkt steht nicht im Dokument · der Eintrag zeigt auf sich selbst ·
     * der Hauptpunkt ist selbst ein Kind (das wäre Ebene zwei).
     */
    const parentOf = new Map(value.entries.map(entry => [entry.id, entry.parent]))
    for (const entry of value.entries) {
      if (entry.parent === undefined) continue
      const invalid = entry.parent === entry.id
        || !parentOf.has(entry.parent)
        || parentOf.get(entry.parent) !== undefined
      if (invalid) {
        ctx.addIssue({ code: 'custom', path: ['entries'], message: t('pages.navigation.validation.parentInvalid') })
        break
      }
    }

    // Die Spalte ist die Grenze (MAX_NAV_CONFIG_CHARS) — ein sauberes 400 mit
    // Begründung statt eines 500 aus Appwrite.
    if (!communityNavConfigFits(value)) {
      ctx.addIssue({ code: 'custom', path: ['entries'], message: t('pages.navigation.validation.tooLarge') })
    }
  })
}

// Server-seitige Instanz (Fehlertexte = Keys; die UI validiert mit t()) —
// dasselbe Muster wie `pageUpsertSchema` daneben.
export const communityNavigationSchema = createCommunityNavigationSchema()
