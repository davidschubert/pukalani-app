/**
 * Der EINE Weg der Wächter auf den App-Server (CI1 a, 2026-11-18): das Tor
 * `ops/app-watch-gate.sh`, von Hand eingespielt unter `WATCH_GATE`. Die
 * Prüf-Skripte schicken nur noch seine festen Worte — dieselbe Befehlszeile
 * mit freiem Schlüssel (die Shell führt das Tor mit Parametern aus) und mit
 * festem Befehl (sshd führt das Tor aus, die Zeile steht in
 * `SSH_ORIGINAL_COMMAND`).
 *
 * Exit-Codes des Tors, die nicht vom ausgeführten Prüf-Skript kommen:
 *   6   ein Stück auf dem Server fehlt (App-Liste, Prüf-Skript) — nicht geprüft
 *   64  Wort oder Angabe nicht erlaubt (auch: das Tor kennt das Wort noch nicht)
 */
export const WATCH_GATE = '/home/ploi/ops/app-watch-gate.sh'
export const GATE_NOT_CHECKED = 6
export const GATE_REJECTED = 64

/** Ziel-Server; in der CI aus `PUKALANI_OPS_SSH`. */
export const APP_SERVER = process.env.PUKALANI_OPS_SSH || 'ploi@49.13.211.173'

/**
 * Die Argumente für `ssh`: ein Tor-Wort mit seinen Angaben. Die Angaben
 * kommen aus dem Repo (Namen aus `ops/apps.conf`, Zahlen, ein ISO-Zeitpunkt)
 * — das Tor prüft sie trotzdem selbst.
 */
export function gateSshArgs(server, word, ...args) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', server, [WATCH_GATE, word, ...args].join(' ')]
}
