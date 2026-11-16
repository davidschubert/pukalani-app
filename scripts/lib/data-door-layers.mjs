/**
 * DIE LAYER HINTER DER DATENTÜR — eine Liste, gegen die Migrationen geprüft
 * (OPS-012, GA1 P20).
 *
 * In `server/api/**` und `server/plugins/**` dieser Layer verbietet ESLint
 * rohes `.tablesDB` (eslint.config.mjs, Block „DATENTÜR-BACKSTOP"; Regel in
 * `.claude/rules/tenant-isolation.md`). Bis P20 stand die Liste dort als elf
 * Zeilen von Hand, mit dem Satz „neue Pool-Layer kommen in diese Liste,
 * sobald ihre Tabellen communityId tragen" — eine Regel für Menschen.
 *
 * Jetzt liest ESLint die Liste von hier, und `pnpm check:manifests` hält sie
 * gegen die Migrationen: legt ein Layer eine Spalte `communityId` an, steht er
 * hier — in der Liste oder mit Grund in den Ausnahmen. Ein Eintrag, zu dem es
 * nichts mehr gibt, ist rot.
 */

/**
 * `scope: 'api+plugins'` ist der Normalfall. `admin` steht nur mit seinen
 * Routen hier: der Layer besitzt keine mandantenfähigen Tabellen, seine
 * Routen LESEN aber fremde (Audit-Befund 2026-08-01).
 */
export const DATA_DOOR_LAYERS = [
  { layer: 'comments', scope: 'api+plugins' },
  { layer: 'posts', scope: 'api+plugins' },
  { layer: 'events', scope: 'api+plugins' },
  { layer: 'courses', scope: 'api+plugins' },
  { layer: 'pages', scope: 'api+plugins' },
  { layer: 'moderation', scope: 'api+plugins' },
  { layer: 'media', scope: 'api+plugins' },
  { layer: 'activity', scope: 'api+plugins' },
  { layer: 'analytics', scope: 'api+plugins' },
  // messages (2026-08-05): alle vier Tabellen tragen communityId. Die EINE
  // bewusste Ausnahme (die mandantenübergreifende Sperr-Abfrage) liegt in
  // server/utils und damit außerhalb des Scopes.
  { layer: 'messages', scope: 'api+plugins' },
  { layer: 'admin', scope: 'api' },
]

/** Layer mit `communityId`-Tabellen, die BEWUSST nicht hinter der Tür stehen. */
export const DATA_DOOR_EXEMPT = {
  control: 'Control Plane: per Definition mandantenübergreifend (tenant-isolation.md, „AUSSERHALB der Tür erlaubt"). `communityId` ist dort ein Fremdschlüssel auf die Community-Zeile, kein Scope der Anfrage; die Grenze ziehen die Rollen-Gates der Routen.',
  system: 'Fundament: notifications, activities und community_handles werden nur über Core-Hilfen mit eigener Scope-Regel gelesen und geschrieben (notify(), notificationScope.ts, Aktivitäts- und Handle-Hilfen); der Layer selbst hat keine Route auf diese Tabellen.',
}

/** Die `files`-Muster für den ESLint-Block. */
export function dataDoorGlobs() {
  return DATA_DOOR_LAYERS.flatMap(({ layer, scope }) => (scope === 'api'
    ? [`packages/${layer}/server/api/**`]
    : [`packages/${layer}/server/api/**`, `packages/${layer}/server/plugins/**`]))
}

/**
 * @param {object} input
 * @param {{ key: string, tenantTables: string[], hasServerApi: boolean }[]} input.layers  alle Layer unter packages/
 * @param {{ layer: string, scope: string }[]} [input.door]
 * @param {Record<string, string>} [input.exempt]
 * @returns {string[]}
 */
export function dataDoorProblems({ layers, door = DATA_DOOR_LAYERS, exempt = DATA_DOOR_EXEMPT }) {
  const problems = []
  const byKey = new Map(layers.map(layer => [layer.key, layer]))
  const inDoor = new Set(door.map(entry => entry.layer))

  for (const layer of layers) {
    if (!layer.tenantTables.length) continue
    if (inDoor.has(layer.key) || layer.key in exempt) continue
    problems.push(`packages/${layer.key}: die Migrationen legen \`communityId\` an (${layer.tenantTables.join(', ')}), der Layer steht aber nicht hinter der Datentür — in DATA_DOOR_LAYERS (scripts/lib/data-door-layers.mjs) aufnehmen, damit ESLint rohes tablesDB in seinen Routen verbietet, oder mit Grund in DATA_DOOR_EXEMPT eintragen.`)
  }
  for (const { layer } of door) {
    const known = byKey.get(layer)
    if (!known) problems.push(`DATA_DOOR_LAYERS: „${layer}" — den Layer gibt es nicht (mehr). Eintrag streichen.`)
    else if (!known.hasServerApi) problems.push(`DATA_DOOR_LAYERS: „${layer}" hat kein server/api/ (mehr) — die Regel hat dort nichts zu prüfen. Eintrag streichen.`)
  }
  for (const [layer, reason] of Object.entries(exempt)) {
    if ((reason ?? '').trim().length < 40) problems.push(`DATA_DOOR_EXEMPT: „${layer}" — ohne tragfähigen Grund.`)
    if (inDoor.has(layer)) problems.push(`DATA_DOOR_EXEMPT: „${layer}" steht auch in DATA_DOOR_LAYERS — eins von beiden streichen.`)
    else if (!byKey.get(layer)?.tenantTables.length) problems.push(`DATA_DOOR_EXEMPT: „${layer}" legt keine \`communityId\`-Spalte (mehr) an — die Ausnahme nimmt nichts aus. Eintrag streichen.`)
  }
  return problems
}
