import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      SKIP_ENV_VALIDATION: 'true',
      WHATSAPP_APP_SECRET: 'test_app_secret',
      CHAKRA_WEBHOOK_HMAC_SECRET: '',
      WEBHOOK_SKIP_SIGNATURE: 'false',
      DATABASE_URL: 'postgresql://ci:ci@localhost:5432/test',
    },
    include: ['src/**/*.test.ts'],
  },
})
