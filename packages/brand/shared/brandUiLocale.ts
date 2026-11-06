/**
 * IN WELCHER SPRACHE REDET GEORGE? — die Sprache der SEITE, auf der der Mensch
 * gerade steht (Davids Befund aus dem Live-Walkthrough, 2026-09-02).
 *
 * ── DER BEFUND ────────────────────────────────────────────────────────────
 * Die Oberfläche stand auf Englisch (EN-Route, ohne `/de`-Präfix), Georges
 * Rahmung kam auf Deutsch. Ursache: der Generator las die Wizard-Sprache aus
 * dem Cookie `i18n_redirected`. Das Cookie sagt aber, was der Mensch EINMAL
 * gewählt hat — nicht, welche Seite er GERADE offen hat. Wer über einen Link
 * auf der englischen Fassung landet, hat ein deutsches Cookie und eine
 * englische Seite, und das Cookie gewann.
 *
 * ── WER ES WEISS, SAGT ES ─────────────────────────────────────────────────
 * Der Browser kennt die Sprache seiner Route sicher (`useI18n().locale`), der
 * Server kann sie aus einem Request auf `/api/**` nicht ableiten — dort steht
 * kein Locale-Präfix. Also reist sie im Rumpf mit. Sie ist damit EINGABE und
 * wird wie jede Eingabe geprüft: nur bekannte Sprachen kommen durch, alles
 * andere fällt auf die Inhaltssprache zurück (die immer da ist).
 *
 * ── NUR DIE RAHMUNG, NIE DER INHALT ───────────────────────────────────────
 * Der SLOT-Text bleibt `contentLocale` — das ist die Sprache der Marke, sie
 * wird bei der Anlage fixiert und ändert sich nie mit der Oberfläche. Was hier
 * umschaltet, ist ausschliesslich Georges Ansprache: Chat-Zug, Rückfrage,
 * Rahmung. Eine Marke in Deutsch, besprochen auf Englisch, ist ein gültiger
 * Fall — und genau der, den David gesehen hat.
 */

/**
 * Die Sprachen, in denen dieser Layer eine Oberfläche HAT (`i18n/locales/`).
 * Kein Pukalani-Sonderwissen: es ist die Liste seiner eigenen Katalog-Dateien.
 */
export const BRAND_UI_LOCALES = ['de', 'en'] as const

export type BrandUiLocale = (typeof BRAND_UI_LOCALES)[number]

export function isBrandUiLocale(value: unknown): value is BrandUiLocale {
  return typeof value === 'string' && (BRAND_UI_LOCALES as readonly string[]).includes(value)
}

/**
 * Die Sprache für Georges Ansprache. `fallback` ist die INHALTSSPRACHE — der
 * Fall, in dem er mit hoher Wahrscheinlichkeit richtig liegt, wenn niemand
 * etwas Besseres mitgeschickt hat (alter Client, direkter API-Aufruf).
 */
export function resolveBrandUiLocale(raw: unknown, fallback: string): string {
  return isBrandUiLocale(raw) ? raw : fallback
}
