import { defineConfig, devices } from '@playwright/test';

// Определяем, работаем ли мы в CI (Docker)
const isCI = !!process.env.CI;

const TEST_DIR = isCI ? '/app/tests' : './tests';
const REPORT_DIR = isCI ? '/app/playwright-report' : './results/report';

export default defineConfig({
  testDir: TEST_DIR,

  // Максимальное время на 1 тест (по умолчанию 30с, для E2E криптобиржи маловато)
  timeout: 90 * 1000,

  expect: {
    // Таймаут для каждого expect() по умолчанию (увеличил с 5с до 10с для SPA)
    timeout: 10 * 1000,
  },

  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined, // 1 воркер в CI спасает от блокировок БД

  reporter: [
    ['html', { outputFolder: REPORT_DIR, open: 'never' }],
    // Добавляем list репортер для красивого вывода в консоль
    isCI ? ['github'] : ['list'],
  ],

  use: {
    // Базовый URL. Теперь в тестах можно писать просто: await page.goto('/');
    baseURL: 'https://192.168.253.40:6161',

    ignoreHTTPSErrors: true,

    // ВАЖНО: 'retain-on-failure' сохранит видео и логи ТОЛЬКО если тест упал.
    // Это сэкономит гигабайты места и ускорит прохождение тестов!
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',

    headless: isCI,

    launchOptions: {
      // 300ms — это слишком медленно. 50ms достаточно, чтобы успеть увидеть глазами,
      // но не уснуть перед монитором.
      slowMo: isCI ? 0 : 350,
    },
  },

  projects: [
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
        // Можно добавить язык и локаль, чтобы тесты не зависели от языка системы локально
        locale: 'en-US',
        timezoneId: 'Europe/London',
      },
    },
  ],
});
