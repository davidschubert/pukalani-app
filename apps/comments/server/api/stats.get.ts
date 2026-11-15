/**
 * Öffentliche Eckdaten für die Landingpage (aktive Kommentare + Konten) —
 * nur für eine Installation OHNE Mandanten, mit Mandant 404 (BE-023).
 * Logik, Zwischenspeicher und Begründung: `readProjectStats` im comments-
 * Layer (packages/comments/server/utils/projectStats.ts), dort auch getestet.
 */
export default defineEventHandler(event => readProjectStats(event))
