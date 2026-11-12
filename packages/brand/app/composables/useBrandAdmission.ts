import { brandGuestStartPath } from '../../shared/brandAdmissionView'
import type { BrandAdmissionResponse } from '../../shared/types/brand'

/**
 * „IST DIE ANMELDUNG OFFEN?" für Seiten — EIN Abruf, EIN Schlüssel.
 *
 * Startseite, Über-uns, Team, Produktseite und Einladungs-Seite fragen
 * dasselbe; der feste `key` sorgt dafür, dass ein Seitenaufbau die Route nur
 * einmal trifft und der Browser die Antwort des Servers übernimmt (kein
 * zweiter Abruf, kein Springen der Knöpfe nach dem Laden).
 *
 * Der Vorgabewert ist „nicht offen": so lange nichts bekannt ist, zeigt die
 * Seite den Weg über die Einladung — der funktioniert in jedem Modus.
 *
 * `guestStartPath` ist der Weg eines GASTES zum Start (`/register` oder
 * `/invite`, ohne Sprach-Präfix — der Aufrufer reicht ihn durch `localePath`).
 * Er steht hier, damit eine App die pure Regel nicht über die Layer-Grenze
 * importieren muss.
 */
export async function useBrandAdmission() {
  const { data } = await useFetch<BrandAdmissionResponse>('/api/brand/admission', {
    key: 'brand-admission',
    default: (): BrandAdmissionResponse => ({ mode: 'closed', signupOpen: false }),
  })
  const signupOpen = computed(() => data.value?.signupOpen === true)
  const guestStartPath = computed(() => brandGuestStartPath(signupOpen.value))
  return { admission: data, signupOpen, guestStartPath }
}
