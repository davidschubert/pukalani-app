/**
 * Die Karte der Pukalani-Vorschaubilder (1200×630) als eigenständiges HTML.
 *
 * Eigene Datei seit 2026-11-20: dieselbe Karte zeichnet auch das Vorschaubild
 * der Hilfe (`scripts/og-site-cards.mjs`) — die Hilfe trägt die Chrome der
 * Marke, also auch ihr Bild. `foot` ist die Adresse in der Fußzeile.
 */
const escapeHtml = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Die Karte als eigenständiges HTML — Marken-Look wie die Site (puka + Licht). */
export function cardHtml({ title, sub, foot = 'pukalani.app' }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; }
  body {
    font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
    background: linear-gradient(150deg, hsl(220 16% 95%) 0%, hsl(35 90% 93%) 62%, hsl(38 96% 84%) 100%);
    color: hsl(220 40% 13%);
    position: relative; overflow: hidden;
    padding: 72px 80px;
    display: flex; flex-direction: column; justify-content: space-between;
  }
  /* die puka: Sonne, die durch die Wolken bricht */
  .glow {
    position: absolute; top: -320px; right: -220px; width: 900px; height: 900px;
    border-radius: 50%;
    background: radial-gradient(circle at center,
      hsl(38 96% 60% / 0.95) 0%, hsl(38 96% 60% / 0.45) 32%,
      hsl(35 90% 88% / 0.25) 55%, transparent 72%);
  }
  .brand { position: relative; display: flex; align-items: center; gap: 16px; }
  .brand svg { width: 44px; height: 44px; }
  .brand span { font-size: 34px; font-weight: 800; letter-spacing: -0.5px; }
  .body { position: relative; max-width: 900px; }
  .sub {
    font-size: 24px; font-weight: 700; letter-spacing: 2.5px;
    text-transform: uppercase; color: hsl(26 90% 42%); margin-bottom: 22px;
  }
  h1 { font-size: 76px; line-height: 1.04; font-weight: 850; letter-spacing: -2.5px; }
  .foot {
    position: relative; display: flex; align-items: center; gap: 14px;
    font-size: 22px; font-weight: 600; color: hsl(220 18% 32%);
  }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: hsl(26 90% 48%); }
</style></head>
<body>
  <div class="glow"></div>
  <div class="brand">
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="s" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="hsl(40 98% 66%)"/><stop offset="70%" stop-color="hsl(32 94% 54%)"/>
        <stop offset="100%" stop-color="hsl(26 90% 48%)"/></radialGradient></defs>
      <circle cx="16" cy="16" r="14" stroke="hsl(220 40% 13%)" stroke-opacity="0.28" stroke-width="2" fill="none"/>
      <circle cx="16" cy="16" r="7.5" fill="url(#s)"/>
      <g stroke="url(#s)" stroke-width="2" stroke-linecap="round">
        <line x1="16" y1="1.5" x2="16" y2="5"/><line x1="16" y1="27" x2="16" y2="30.5"/>
        <line x1="1.5" y1="16" x2="5" y2="16"/><line x1="27" y1="16" x2="30.5" y2="16"/>
      </g>
    </svg>
    <span>Pukalani</span>
  </div>
  <div class="body">
    <p class="sub">${escapeHtml(sub)}</p>
    <h1>${escapeHtml(title)}</h1>
  </div>
  <div class="foot"><span class="dot"></span><span>${escapeHtml(foot)}</span></div>
</body></html>`
}
