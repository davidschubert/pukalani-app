import type { BrandAdmissionMode } from './brandAccess'

/**
 * WAS DIE OBERFLÄCHE ÜBER DIE AUFNAHME WISSEN MUSS — pur, damit Startseite,
 * Einladungs-Seite und Produktseiten dieselbe Antwort geben.
 *
 * ── WARUM ES DAS BRAUCHT (Davids Entscheidung 2026-11-12: offene Beta) ─────
 * Der Server kannte den Modus `open` seit P1b, die Oberfläche nicht: jeder
 * Start-Knopf führte Gäste auf `/invite`, und die Texte sagten „geschlossene
 * Beta", auch als die Anmeldung längst offen war. Die Site widersprach damit
 * ihrem eigenen Verhalten. Diese Datei ist die EINE Stelle, an der aus dem
 * Zustand des Servers ein Weg für Gäste wird.
 *
 * ── ZWEI SCHALTER, EINE ANTWORT ───────────────────────────────────────────
 * „Offen" ist die Anmeldung nur, wenn BEIDES stimmt: der Wizard nimmt jedes
 * bestätigte Konto (`brandAdmissionMode = open`) UND die Kontoanlage selbst
 * ist an (`registrationEnabled`). Mit nur einem von beiden stünde ein Gast
 * entweder vor einer geschlossenen Registrierung oder mit Konto vor einem 404.
 * In jedem anderen Fall bleibt der bisherige Weg über die Einladung.
 */
export interface BrandAdmissionFacts {
  mode: BrandAdmissionMode
  registrationEnabled: boolean
}

export function brandSignupOpen(facts: BrandAdmissionFacts): boolean {
  return facts.mode === 'open' && facts.registrationEnabled
}

/** Wohin der Start-Knopf einen GAST führt. Eingeloggte gehen in ihre Marken. */
export function brandGuestStartPath(signupOpen: boolean): '/register' | '/invite' {
  return signupOpen ? '/register' : '/invite'
}
