// Zero-Downtime-Deploy (A.10-Muster):
// pm2-Cluster fuer portfolio.pukalani.app auf Port 3002; Script zeigt auf den
// current-Symlink, die Server-.env wird beim (Re-)Load geparst.
const fs = require('node:fs')

const ENV_FILE = '/home/ploi/portfolio.pukalani.app/.env'
const CURRENT = '/home/ploi/releases/portfolio/current'

function parseEnvFile(path) {
  const env = {}
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || match[1].startsWith('#')) continue
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1)
    }
    env[match[1]] = value
  }
  return env
}

module.exports = {
  apps: [
    {
      name: 'portfoliopukalaniapp',
      script: `${CURRENT}/server/index.mjs`,
      // cwd EXPLIZIT (3. pm2-Falle, 2026-07-26): ohne cwd friert pm2 das
      // Shell-cwd des ERSTSTARTS ein — als das Verzeichnis der alten
      // studio-Site geloescht wurde, konnte pm2 portfolio nicht mehr
      // spawnen (ENOENT, errored, Site down). CURRENT existiert, solange
      // es die App gibt.
      cwd: CURRENT,
      exec_mode: 'cluster',
      instances: 1,
      kill_timeout: 8000,
      // SPEICHERGRENZE (WA1 c, 2026-11-28): pm2 startet den Prozess neu,
      // wenn er darüber liegt. Höchster Wert der täglichen Wächter-Läufe
      // vom 23. bis 28.11.: 303 MB — die Grenze liegt bei etwa dem
      // Doppelten, weil ein zu knapper Wert schon einmal eine Seite im
      // Kreis neu gestartet hat. Wirkt beim nächsten Ausliefern
      // (`pm2 startOrReload … --update-env` übernimmt sie). Höher setzen,
      // wenn der tägliche Lauf Neustarts ohne Ausliefern zeigt.
      max_memory_restart: '640M',
      env: {
        ...parseEnvFile(ENV_FILE),
        PORT: 3002,
        HOST: '127.0.0.1',
        NODE_ENV: 'production',
      },
    },
  ],
}
