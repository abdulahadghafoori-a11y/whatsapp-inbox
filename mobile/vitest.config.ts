import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Mirrors the `@/*` -> `./*` path alias from tsconfig so unit tests can import
// app modules. Only pure-logic modules (and modules whose native deps are
// mocked in the test) are covered here — RN/Expo native modules are not loaded.
const rootDir = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: `${rootDir}/` }],
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
})
