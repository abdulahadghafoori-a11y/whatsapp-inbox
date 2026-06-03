import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Minimal valid 1x1 PNG (Expo Go dev; replace with real branding for production).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const files = ['icon.png', 'splash.png', 'adaptive-icon.png', 'notification-icon.png']

await mkdir(root, { recursive: true })
for (const name of files) {
  await writeFile(join(root, name), PNG)
}
console.log('Created placeholder assets in mobile/assets/')
