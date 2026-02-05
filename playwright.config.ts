import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    headless: false,
    launchOptions: {
      slowMo: 400, // замедление действий для отладки
    },
  },

  projects: [
    // 🖥 Desktop Chrome
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
      },
    },

    // 📱 Mobile Chrome
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'], // мобильный viewport + UA
        browserName: 'chromium',
      },
    },
  ],
});
