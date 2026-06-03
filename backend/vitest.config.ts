import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      SKIP_ENV_VALIDATION: 'true',
      WHATSAPP_APP_SECRET: 'test_app_secret',
    },
    include: ['src/**/*.test.ts'],
  },
})
