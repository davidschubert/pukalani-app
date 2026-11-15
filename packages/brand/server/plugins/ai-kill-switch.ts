import { readBrandAiEnabled } from '../utils/brandGenerators'

/**
 * MELDET DEN KI-ABSCHALTER DIESES LAYERS BEIM CORE AN (P17, BE-006).
 *
 * `app_config.brandAiEnabled` fragt ab hier jeder der fünf KI-Transporte vor
 * dem Senden — auf dieser Instanz also JEDER bezahlte Aufruf, auch künftige
 * Routen und die Core-Konsumenten (Übersetzung, Moderations-Hilfe), ohne dass
 * eine Route daran denken muss. Fail-closed bleibt es: eine unlesbare Zeile
 * heisst „aus" (`readBrandAiEnabled`).
 */
export default defineNitroPlugin(() => {
  registerAiKillSwitch('brand', readBrandAiEnabled)
})
