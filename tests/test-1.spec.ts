import { test, expect } from '@playwright/test';

const MAILHOG_API = 'http://192.168.200.190:8025/api/v2/messages';

/**
 * Получаем ID последнего письма
 */
async function getLastEmailId(): Promise<string | null> {
  const res = await fetch(MAILHOG_API);
  const data: {
    items?: Array<{ ID: string }>;
  } = await res.json();

  return data.items?.[0]?.ID ?? null;
}

/**
 * Ждём новое письмо по ID и возвращаем HTML
 */
async function waitForNewEmail(
  previousId: string | null,
  timeout: number = 20000,
  interval: number = 1000,
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const res = await fetch(MAILHOG_API);
    const data: {
      items?: Array<{
        ID: string;
        Content?: { Body?: string };
        Raw?: { Data?: string };
      }>;
    } = await res.json();

    const latest = data.items?.[0];

    if (latest && latest.ID !== previousId) {
      return latest.Content?.Body ?? latest.Raw?.Data ?? '';
    }

    await new Promise<void>((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('New email not received');
}

/**
 * Парсим 6-значный OTP из HTML письма
 */
function extractOtpFromMailhogHtml(rawHtml: string): string {
  const normalized: string = rawHtml.replace(/=\r?\n/g, '').replace(/=3D/g, '=');

  const match: RegExpMatchArray | null = normalized.match(/<strong>\s*(\d{6})\s*<\/strong>/i);

  if (!match) {
    throw new Error('OTP not found in email');
  }

  return match[1];
}

test('Login + OTP via MailHog', async ({ page }) => {
  // ===== фиксируем последнее письмо ДО логина =====
  const lastEmailId = await getLastEmailId();
  console.log('📨 LAST EMAIL ID BEFORE LOGIN:', lastEmailId);

  // ===== ЛОГИН =====
  await page.goto('https://192.168.253.40:6161');

  await page.getByRole('button').first().click();
  await page.getByRole('button').nth(1).click();
  await page.getByRole('button').nth(2).click();
  await page.getByRole('button').first().click();
  await page.getByRole('button').nth(1).click();
  await page.getByRole('button').nth(2).click();
  await page.getByRole('button').nth(4).click();
  await page.getByRole('button').nth(4).click();

  await page.getByText('Test0', { exact: true }).click();

  await page.getByRole('textbox', { name: 'Login or E-mail' }).fill('bcaahkaassist@gmail.com');

  await page.getByRole('textbox', { name: 'Password' }).fill('Danilka1337$');

  await page.getByRole('button', { name: 'Submit' }).click();

  // ===== ждём новое письмо =====
  const emailHtml = await waitForNewEmail(lastEmailId);

  // ===== вытаскиваем OTP =====
  const otp = extractOtpFromMailhogHtml(emailHtml);
  console.log('✅ OTP:', otp);

  // ===== вводим OTP =====
  await page.getByPlaceholder('------').fill(otp);
  await page.getByText('Confirm', { exact: true }).click();

  // ===== проверка =====
  await expect(page.locator('text=Registration confirmed')).toBeVisible();
});
