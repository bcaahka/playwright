import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',

  timeout: 90 * 1000,
  expect: { timeout: 10 * 1000 },

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

    // --- ФИКС ЛОКАЛИ И ЧАСОВОГО ПОЯСА ---
    // Форсируем английский язык интерфейса (браузер передаст заголовок Accept-Language: en-US)
    locale: 'en-US',
    // Жестко фиксируем часовой пояс (полезно, если в тестах есть проверки времени/истории)
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
