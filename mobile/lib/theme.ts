import { colorScheme } from 'nativewind'
import { appStorage } from '@/lib/appStorage'

export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'wa-theme'

export function applyTheme(pref: ThemePref): void {
  colorScheme.set(pref)
}

export async function loadThemePref(): Promise<ThemePref> {
  const v = await appStorage.getItem(KEY)
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export async function setThemePref(pref: ThemePref): Promise<void> {
  await appStorage.setItem(KEY, pref)
  applyTheme(pref)
}

/** Apply the saved theme preference on boot. Defaults to following the device. */
export async function initTheme(): Promise<void> {
  applyTheme(await loadThemePref())
}
