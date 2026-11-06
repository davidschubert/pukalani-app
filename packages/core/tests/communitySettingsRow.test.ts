import { describe, expect, it } from 'vitest'
import { INSTANCE_SETTINGS_ROW_ID, communitySettingsRowId } from '../shared/communitySettingsRow'
import { INSTANCE_NAV_ROW_ID, communityNavRowId } from '../shared/communityNavigation'

describe('communitySettingsRowId — EINE Regel für Navigation, Sucheintrag, Weiterleitungen', () => {
  it('Pool-Mandant: seine communityId', () => {
    expect(communitySettingsRowId({ communityId: 'c-1' })).toBe('c-1')
  })
  it('Silo (kein Mandant): die Instanz-Zeile', () => {
    expect(communitySettingsRowId(null)).toBe(INSTANCE_SETTINGS_ROW_ID)
    expect(communitySettingsRowId(undefined)).toBe(INSTANCE_SETTINGS_ROW_ID)
  })
  it('Kontroll-Host: keine Zeile', () => {
    expect(communitySettingsRowId(null, true)).toBeNull()
    expect(communitySettingsRowId({ communityId: 'c-1' }, true)).toBeNull()
  })
  it('GEGENPROBE: Mandant ohne communityId ist fail-closed', () => {
    expect(communitySettingsRowId({})).toBeNull()
  })
  it('die Row-Id ist eine GÜLTIGE Appwrite-Id (kein führender Unterstrich — 2026-09-08 mit 500 erwischt)', () => {
    expect(INSTANCE_SETTINGS_ROW_ID).toMatch(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,35}$/)
  })
  it('die Navigation nutzt DIESELBE Regel (kein zweiter Weg)', () => {
    expect(communityNavRowId).toBe(communitySettingsRowId)
    expect(INSTANCE_NAV_ROW_ID).toBe(INSTANCE_SETTINGS_ROW_ID)
  })
})
