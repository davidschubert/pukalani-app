import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Echtes gpg mit Wegwerf-Schlüsseln, für Tests der Backup-Skripte (BU1 b).
 *
 * Auf dem Mac fehlt gpg oft — dann laufen die Tests, die es brauchen, nicht
 * (`skipIf`). In der CI (Linux, `CI` gesetzt) MUSS es da sein: dort wird ein
 * fehlendes gpg rot, damit der Beweis nicht still ausfällt.
 */
export const HAS_GPG = spawnSync('gpg', ['--version'], { encoding: 'utf8' }).status === 0
export const GPG_REQUIRED = Boolean(process.env.CI)

export interface ThrowawayKey {
  home: string
  pub: string
  fingerprint: string
}

/** Erzeugt ein Schlüsselpaar ohne Passwort in `<root>/<name>.home`. */
export function makeKey(root: string, name: string): ThrowawayKey {
  const home = join(root, `${name}.home`)
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const gen = spawnSync('gpg', ['--batch', '--quiet', '--homedir', home, '--pinentry-mode', 'loopback', '--passphrase', '',
    '--quick-generate-key', `Wegwerf ${name}`, 'future-default', 'default', 'never'], { encoding: 'utf8' })
  if (gen.status !== 0) throw new Error(`gpg --quick-generate-key: ${gen.stderr}`)
  const pub = join(root, `${name}.pub.asc`)
  const exported = spawnSync('gpg', ['--batch', '--quiet', '--homedir', home, '--armor', '--export'], { encoding: 'utf8' })
  writeFileSync(pub, exported.stdout)
  const listing = spawnSync('gpg', ['--batch', '--homedir', home, '--with-colons', '--fingerprint'], { encoding: 'utf8' }).stdout
  const fingerprint = listing.split('\n').find(l => l.startsWith('fpr:'))?.split(':')[9] ?? ''
  if (!/^[0-9A-F]{40}$/.test(fingerprint)) throw new Error(`Fingerabdruck nicht lesbar: ${listing}`)
  return { home, pub, fingerprint }
}

/** Entschlüsselt mit dem privaten Teil; wirft, wenn es nicht geht. */
export function decrypt(key: ThrowawayKey, file: string, out: string) {
  const result = spawnSync('gpg', ['--batch', '--quiet', '--homedir', key.home, '--pinentry-mode', 'loopback', '--passphrase', '',
    '--output', out, '--decrypt', file], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`gpg --decrypt: ${result.stderr}`)
}

/** Beendet den gpg-agent, den ein Schlüssel-Home gestartet hat. */
export function stopAgent(key: ThrowawayKey) {
  spawnSync('gpgconf', ['--homedir', key.home, '--kill', 'all'])
}
