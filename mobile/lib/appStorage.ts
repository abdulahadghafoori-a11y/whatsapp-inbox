import * as FileSystem from 'expo-file-system/legacy'

const DIR = `${FileSystem.documentDirectory ?? ''}wa-inbox-storage/`

export type AppStorage = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

function filePath(key: string) {
  const safe = encodeURIComponent(key)
  return `${DIR}${safe}.json`
}

async function ensureDir() {
  if (!FileSystem.documentDirectory) return false
  try {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true })
    return true
  } catch {
    return false
  }
}

/** File-based KV store — works in Expo Go (no AsyncStorage native module required). */
export const appStorage: AppStorage = {
  async getItem(key) {
    if (!(await ensureDir())) return null
    try {
      const path = filePath(key)
      const info = await FileSystem.getInfoAsync(path)
      if (!info.exists) return null
      return await FileSystem.readAsStringAsync(path)
    } catch {
      return null
    }
  },

  async setItem(key, value) {
    if (!(await ensureDir())) return
    try {
      await FileSystem.writeAsStringAsync(filePath(key), value)
    } catch {
      // ignore — offline features degrade gracefully
    }
  },

  async removeItem(key) {
    if (!(await ensureDir())) return
    try {
      await FileSystem.deleteAsync(filePath(key), { idempotent: true })
    } catch {
      // ignore
    }
  },
}
