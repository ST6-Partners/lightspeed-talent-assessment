import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './client/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: true,
    timeout: 30_000,
  },

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
