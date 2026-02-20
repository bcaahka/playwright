import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',

  timeout: 90 * 1000,
  expect: { timeout: 15 * 1000 }, // Увеличили глобальный таймаут ожиданий до 15 сек

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,

  reporter: [
    ['html', { outputFolder: './playwright-report', open: 'never' }],
    isCI ? ['github'] : ['list'],
  ],

  use: {
    baseURL: 'https://192.168.253.40:6161',
    ignoreHTTPSErrors: true,

    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',

    headless: isCI,
    launchOptions: {
      slowMo: isCI ? 0 : 50,
    },

    // --- ГАРАНТИЯ АНГЛИЙСКОГО ИНТЕРФЕЙСА В JENKINS ---
    locale: 'en-US',
    timezoneId: 'Europe/London',
  },

  projects: [
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
      },
    },
  ],
});
