import process from 'node:process'
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    [
      'html',
      { open: 'never' },
    ],
  ],
  use: {
    baseURL: 'http://127.0.0.1:5186',
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5186 --strictPort',
      url: 'http://127.0.0.1:5186',
      reuseExistingServer: false,
    },
    {
      command: 'node tests/static-server.mjs',
      url: 'http://127.0.0.1:4174/repository/',
      reuseExistingServer: false,
    },
  ],
})
