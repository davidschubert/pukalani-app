import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * DER WÄCHTER FÜR FEST GENANNTE TEXT-SCHLÜSSEL (`pnpm check:i18n-keys`, Teil 2,
 * Q03 — 2026-11-20).
 *
 * Anlass: `t('ui.close')` stand zehn Wochen auf einem Knopf, den Schlüssel gab
 * es in keiner Sprachdatei. vue-i18n zeigt dann den Schlüssel selbst.
 *
 * Der Test lässt das ECHTE Skript laufen, gegen einen kleinen Probe-Baum: zwei
 * Apps (`shop` mit dem Layer `extra`, `solo` ohne), dazu `core`. Sauber ⇒
 * grün. Dann je ein eingebauter Fehler: der Wächter muss rot werden und Datei,
 * Zeile, Schlüssel und App nennen. Und die Formen, die er bewusst nicht liest,
 * bleiben grün — ein Wächter mit Fehlalarmen wird abgeschaltet.
 *
 * WAS DER TEST NICHT BEWEIST: dass der echte Code sauber ist. Das sagt der
 * Lauf selbst, bei jedem Lint.
 */

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const SCRIPT = join(REPO, 'scripts', 'check-i18n-keys.mjs')

let root: string

function write(relativePath: string, content: string) {
  const file = join(root, relativePath)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
  return file
}

function run() {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, PUKALANI_CHECK_ROOT: root },
  })
  return { code: result.status, out: `${result.stdout}${result.stderr}` }
}

/** Legt eine Datei in den Probe-Baum, lässt den Wächter laufen und nimmt sie wieder heraus. */
function withFile(relativePath: string, content: string) {
  const file = write(relativePath, content)
  try {
    return run()
  }
  finally {
    rmSync(file)
  }
}

const locale = (messages: object) => `${JSON.stringify(messages, null, 2)}\n`

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'check-i18n-keys-'))

  write('apps/shop/nuxt.config.ts', 'export default { extends: [\'../../packages/extra\', \'../../packages/core\'] }\n')
  write('apps/solo/nuxt.config.ts', 'export default { extends: [\'../../packages/core\'] }\n')

  write('packages/core/i18n/locales/de.json', locale({ ui: { save: 'Speichern', cancel: 'Abbrechen' } }))
  write('packages/core/i18n/locales/en.json', locale({ ui: { save: 'Save', cancel: 'Cancel' } }))
  write('packages/extra/i18n/locales/de.json', locale({ extra: { title: 'Titel', onlyGerman: 'Nur deutsch' } }))
  write('packages/extra/i18n/locales/en.json', locale({ extra: { title: 'Title' } }))
  write('apps/shop/i18n/locales/de.json', locale({ shop: { hello: 'Hallo' } }))
  write('apps/shop/i18n/locales/en.json', locale({ shop: { hello: 'Hello' } }))

  write('packages/core/app/components/SaveButton.vue', '<template>\n  <button>{{ t(\'ui.save\') }}</button>\n</template>\n')
  write('packages/extra/app/pages/extra.vue', '<template>\n  <h1>{{ $t(\'extra.title\') }}</h1>\n</template>\n')
  write('apps/shop/app/pages/index.vue', '<template>\n  <p>{{ t(\'shop.hello\') }} {{ t(\'extra.title\') }}</p>\n</template>\n')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('check:i18n-keys — fest genannte Schlüssel', () => {
  it('ein sauberer Baum ist grün und nennt, wie viel er gelesen hat', () => {
    const { code, out } = run()
    expect(out).toContain('4 fest genannte Schlüssel in 3 Dateien')
    expect(code).toBe(0)
  })

  it('GEGENPROBE: ein Schlüssel, den es nicht gibt, ist rot — mit Datei, Zeile, Schlüssel und App', () => {
    const { code, out } = withFile(
      'packages/extra/app/components/CloseButton.vue',
      '<template>\n  <div>\n    <button :label="t(\'ui.close\')" />\n  </div>\n</template>\n',
    )
    expect(code).toBe(1)
    expect(out).toContain('packages/extra/app/components/CloseButton.vue:3')
    expect(out).toContain('„ui.close"')
    expect(out).toContain('fehlt in App „shop": de, en')
    // `solo` bringt den Layer `extra` nicht mit — dort läuft die Datei nie.
    expect(out).not.toContain('„solo"')
  })

  it('ein Schlüssel nur in EINER Sprache ist rot und nennt die fehlende', () => {
    const { code, out } = withFile('packages/extra/app/pages/german.vue', '<template>\n  <p>{{ t(\'extra.onlyGerman\') }}</p>\n</template>\n')
    expect(code).toBe(1)
    expect(out).toContain('„extra.onlyGerman"')
    expect(out).toContain('fehlt in App „shop": en')
  })

  it('eine Layer-Datei muss in JEDER App aufgehen, die den Layer mitbringt', () => {
    // `shop.hello` kennt nur die App `shop`; der Core läuft auch in `solo`.
    const { code, out } = withFile('packages/core/app/components/Hello.vue', '<template>\n  <p>{{ t(\'shop.hello\') }}</p>\n</template>\n')
    expect(code).toBe(1)
    expect(out).toContain('packages/core/app/components/Hello.vue:2')
    expect(out).toContain('fehlt in App „solo": de, en')
    expect(out).not.toContain('fehlt in App „shop"')
  })

  it.each([
    ['$t im Markup', '<template>\n  <p>{{ $t(\'nope.dollar\') }}</p>\n</template>\n', 'nope.dollar'],
    ['i18n.t im Skript', '<script setup lang="ts">\nconst label = i18n.t("nope.member")\n</script>\n', 'nope.member'],
    ['keypath', '<template>\n  <i18n-t keypath="nope.keypath" tag="p" />\n</template>\n', 'nope.keypath'],
    ['fester Schlüssel in Backticks', '<script setup lang="ts">\nconst label = t(`nope.backtick`)\n</script>\n', 'nope.backtick'],
    ['mit Werten als zweitem Argument', '<script setup lang="ts">\nconst label = t(\'nope.params\', { count: 2 })\n</script>\n', 'nope.params'],
    ['nach einer Adresse mit // in derselben Zeile', '<script setup lang="ts">\nconst url = \'https://example.test\'; const label = t(\'nope.afterUrl\')\n</script>\n', 'nope.afterUrl'],
    ['in shared/', 'export const label = (t: (key: string) => string) => t(\'nope.shared\')\n', 'nope.shared'],
  ])('GEGENPROBE: %s wird gelesen', (name, content, key) => {
    const path = name === 'in shared/' ? 'apps/shop/shared/label.ts' : 'apps/shop/app/components/Probe.vue'
    const { code, out } = withFile(path, content)
    expect(out).toContain(`„${key}"`)
    expect(code).toBe(1)
  })

  it.each([
    ['Zeilen-Kommentar', '<script setup lang="ts">\n// früher: t(\'gone.line\')\nconst label = t(\'ui.save\')\n</script>\n'],
    ['Block-Kommentar', '<script setup lang="ts">\n/**\n * t(\'gone.block\') gab es einmal.\n */\nconst label = t(\'ui.save\')\n</script>\n'],
    ['Kommentar im Markup', '<template>\n  <!-- {{ t(\'gone.markup\') }} -->\n  <p>{{ t(\'ui.save\') }}</p>\n</template>\n'],
    ['zusammengesetzt mit ${}', '<script setup lang="ts">\nconst label = (x: string) => t(`gone.${x}.title`)\n</script>\n'],
    ['zusammengesetzt mit +', '<script setup lang="ts">\nconst label = (x: string) => t(\'gone.\' + x)\n</script>\n'],
    ['te() fragt nur nach', '<script setup lang="ts">\nconst has = te(\'gone.maybe\')\n</script>\n'],
    ['ein längerer Name, der auf t endet', '<script setup lang="ts">\nconst value = format(\'gone.format\')\n</script>\n'],
  ])('kein Fehlalarm: %s', (_name, content) => {
    const { code, out } = withFile('apps/shop/app/components/Probe.vue', content)
    expect(out).not.toContain('gone.')
    expect(code).toBe(0)
  })

  it('kein Fehlalarm: server/ hat eigene Text-Hilfen und bleibt draußen', () => {
    const { code } = withFile('packages/extra/server/utils/seed.ts', 'export const title = (t: (key: string) => string) => t(\'title\')\n')
    expect(code).toBe(0)
  })

  it('kein Fehlalarm: Test-Dateien bleiben draußen', () => {
    const { code } = withFile('apps/shop/app/utils/label.test.ts', 'export const label = (t: (key: string) => string) => t(\'gone.test\')\n')
    expect(code).toBe(0)
  })
})
