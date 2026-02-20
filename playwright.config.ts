import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  // Ищем тесты просто в папке tests внутри текущего проекта
  testDir: './tests',

  timeout: 90 * 1000,
  expect: { timeout: 10 * 1000 },

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,

  reporter: [
    // Сохраняем отчет в локальную папку playwright-report (ее и ждет Jenkins)
    ['html', { outputFolder: './playwright-report', open: 'never' }],
    isCI ? ['github'] : ['list'],
  ],

  use: {
    baseURL: 'https://192.168.253.40:6161',
    ignoreHTTPSErrors: true,

    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',

    headless: isCI,
    launchOptions: {
      slowMo: isCI ? 0 : 350,
    },
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
