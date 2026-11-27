import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * JEDE STELLE, DIE `brand_profiles` LIEST, HAT EINE ENTSCHEIDUNG ZUM
 * PAPIERKORB (WH1).
 *
 * Eine gelöschte Marke ist nur dann „überall weg", wenn jeder Leser sie
 * ausblendet — oder bewusst nicht. Die meisten Wege laufen über
 * `loadOwnedProfile`; die Dateien hier lesen die Tabelle daran vorbei. Eine
 * NEUE Datei, die `BRAND_PROFILES_TABLE` anfasst, ist rot, bis hier steht,
 * was sie mit einer gelöschten Marke tut. Muster: `user-data-coverage.test.ts`.
 *
 * GRENZE: der Test sieht nur, DASS eine Entscheidung dasteht. Dass sie
 * stimmt, belegen `route-roles-profile-trash.test.ts` und
 * `brandUserDataStrict.test.ts`.
 */

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..', '..')

const DECISIONS: Record<string, string> = {
  // ── blendet aus ───────────────────────────────────────────────────────────
  'packages/brand/server/utils/brandStore.ts':
    'loadOwnedProfile: 404; loadOwnedTrashedProfile: nur gelöschte; listBrandProfilesForOwner: filtert; listOwnedBrandProfileIds: BEWUSST alle (Kontolöschung muss den Papierkorb finden); touchProfile schreibt nur nach loadOwnedProfile',
  'packages/brand/server/api/brand/profiles/index.get.ts': 'Liste: Query.isNull(erasedAt)',
  'packages/brand/server/api/brand/profiles/scores.get.ts': 'Punktzahlen: Query.isNull(erasedAt)',
  'packages/brand/server/api/brand/check.post.ts': 'eigene Marke am Check: gelöscht ⇒ 404 profile_not_found',
  'packages/brand/server/utils/brandIntroCall.ts': 'Herkunft der Gesprächsanfrage: gelöscht ⇒ keine Marke',
  'packages/brand/server/utils/brandMarketVisibility.ts': 'Marktvergleich: gelöscht ⇒ nicht freigegeben, fehlt in der Kandidatenliste',
  'packages/brand/server/utils/brandDesignUnlock.ts': 'Betreiber-Liste und -Laden: Query.isNull bzw. 404',
  // ── der Papierkorb selbst ─────────────────────────────────────────────────
  'packages/brand/server/utils/brandProfileTrash.ts': 'setzt, liest und leert erasedAt; der Lauf liest nur gelöschte',
  'packages/brand/server/api/brand/profiles/[id]/index.delete.ts': 'liest die Zeile selbst, damit ein zweites Löschen nach 502 wiederholt',
  // ── schreibt nur, nach der Besitz-Prüfung über loadOwnedProfile ──────────
  'packages/brand/server/api/brand/profiles/index.post.ts': 'legt eine NEUE Marke an — es gibt keine gelöschte',
  'packages/brand/server/utils/brandPublications.ts':
    'Sichtbarkeit: nur nach loadOwnedProfile; Betreiber-Besitzer-Karte: nur Konto-Id zu einer Veröffentlichung, die das Löschen schon zurückgezogen hat',
  'packages/brand/server/utils/brandDerivationUnlock.ts': 'Betreiber schreibt die Freischaltung an eine Id; harmlos, die Marke bleibt versteckt',
  'packages/brand/server/api/brand/admin/profiles/[id]/design-lock.post.ts': 'nach loadBrandProfileForOperator (404 für gelöschte)',
  'packages/brand/server/api/brand/admin/profiles/[id]/design-unlock.post.ts': 'nach loadBrandProfileForOperator (404 für gelöschte)',
  // ── fragt nur „gibt es die Zeile noch?" für einen laufenden Lauf ─────────
  'packages/brand/server/api/brand/profiles/[id]/check.post.ts': 'brandRunProfileExists: eine gelöschte Marke darf ihr Ergebnis noch ablegen (kommt beim Zurückholen mit)',
  'packages/brand/server/api/brand/profiles/[id]/inspiration/read.post.ts': 'brandRunProfileExists, wie oben',
  'packages/brand/server/api/brand/profiles/[id]/mark/drafts/index.post.ts': 'brandRunProfileExists, wie oben',
  'packages/brand/server/utils/brandDocumentReviewRun.ts': 'brandRunProfileExists, wie oben',
  // ── Auskunft und Kontolöschung ────────────────────────────────────────────
  'packages/brand/server/utils/brandUserData.ts': 'BEWUSST ohne Filter: Auskunft nennt, Kontolöschung löscht auch Marken im Papierkorb',
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.nuxt' || name === '.output') continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (name.endsWith('.ts')) out.push(path)
  }
  return out
}

function readers(): string[] {
  const found: string[] = []
  for (const layer of readdirSync(join(ROOT, 'packages'))) {
    let files: string[]
    try {
      files = walk(join(ROOT, 'packages', layer, 'server'))
    }
    catch {
      continue
    }
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      // Nur echte Aufrufe, keine Erwähnung im Kommentar und keine reine
      // Import-Zeile, die den Namen weiterreicht.
      const uses = source.split('\n').some(line =>
        /BRAND_PROFILES_TABLE/.test(line) && !/^\s*(\*|\/\/|import\b)/.test(line) && !/^\s*BRAND_PROFILES_TABLE,?\s*$/.test(line))
      if (uses) found.push(relative(ROOT, file))
    }
  }
  return found.sort()
}

describe('Leser von brand_profiles (WH1)', () => {
  const found = readers()

  it('findet überhaupt Leser (Gegenprobe gegen einen kaputten Scan)', () => {
    expect(found).toContain('packages/brand/server/utils/brandStore.ts')
    expect(found.length).toBeGreaterThan(10)
  })

  it.each(found)('%s hat eine Entscheidung', (file) => {
    expect(DECISIONS[file], `${file} liest brand_profiles — Entscheidung zum Papierkorb in DECISIONS eintragen`).toBeTruthy()
  })

  it('keine Entscheidung für eine Datei, die es nicht mehr gibt', () => {
    expect(Object.keys(DECISIONS).filter(file => !found.includes(file))).toEqual([])
  })
})
