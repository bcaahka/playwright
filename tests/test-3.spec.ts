import { test, expect } from '@playwright/test';

const MAILHOG_API = 'http://192.168.200.190:8025/api/v2/messages';

/*** Получаем ID последнего письма */
async function getLastEmailId(): Promise<string | null> {
  const res = await fetch(MAILHOG_API);
  const data: { items?: Array<{ ID: string }> } = await res.json();
  return data.items?.[0]?.ID ?? null;
}

/*** Ждём новое письмо по ID и возвращаем HTML */
async function waitForNewEmail(
  previousId: string | null,
  timeout = 20000,
  interval = 1000,
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const res = await fetch(MAILHOG_API);
    const data: {
      items?: Array<{ ID: string; Content?: { Body?: string }; Raw?: { Data?: string } }>;
    } = await res.json();

    const latest = data.items?.[0];

    if (latest && latest.ID !== previousId) {
      return latest.Content?.Body ?? latest.Raw?.Data ?? '';
    }

    await new Promise<void>((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('New email not received');
}

/*** Парсим 6-значный OTP из HTML письма */
function extractOtpFromMailhogHtml(rawHtml: string): string {
  const normalized = rawHtml.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const match = normalized.match(/<strong>\s*(\d{6})\s*<\/strong>/i);
  if (!match) throw new Error('OTP not found in email');
  return match[1];
}

test('Full flow: Login + OTP + PIN + Enable + Home check + YouTube in another tab', async ({
  page,
  context,
}) => {
  // =====================================================
  // 🎵 YOUTUBE — В ДРУГОЙ ВКЛАДКЕ
  // =====================================================
  const ytPage = await context.newPage();

  await ytPage.goto('https://www.youtube.com/watch?v=xcZ3ZdrzxF0', {
    waitUntil: 'domcontentloaded',
  });

  // cookies
  const cookieTexts = ['Accept all', 'I agree', 'Agree', 'Accept'];
  for (const text of cookieTexts) {
    const btn = ytPage.getByText(text, { exact: true });
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      break;
    }
  }

  // play + sound
  await ytPage.waitForSelector('video');
  await ytPage.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>('video');
    if (!video) return;
    video.muted = false;
    video.volume = 1;
    video.play();
  });

  console.log('🎶 YouTube играет в отдельной вкладке');

  // =====================================================
  // 🚀 ОСНОВНОЙ ТЕСТ (ГЛАВНАЯ ВКЛАДКА)
  // =====================================================

  await page.bringToFront(); // 🔑 ВАЖНО

  const lastEmailId = await getLastEmailId();
  console.log('📨 LAST EMAIL ID BEFORE LOGIN:', lastEmailId);

  await page.goto('https://192.168.253.40:6161');

  // Навигация
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

  // ===== OTP =====
  const emailHtml = await waitForNewEmail(lastEmailId);
  const otp = extractOtpFromMailhogHtml(emailHtml);
  console.log('✅ OTP:', otp);

  await page.getByPlaceholder('------').fill(otp);

  // ===== PIN PAGE =====
  await expect(page.getByText('Create your PIN-code')).toBeVisible({ timeout: 10000 });

  // 🔑 ОБЯЗАТЕЛЬНО возвращаем фокус
  await page.bringToFront();

  // ===== PIN =====
  const pin = '123456';
  const pinFields = page.locator('.pin-field');
  await expect(pinFields).toHaveCount(6);

  for (let i = 0; i < pin.length; i++) {
    const field = pinFields.nth(i);
    await field.focus();
    await field.press(pin[i]);
    console.log(`✔ Ввели ${pin[i]} в поле ${i + 1}`);
  }

  // ===== Enable =====
  const enableBtn = page.getByText('Enable', { exact: true });
  await expect(enableBtn).toBeVisible();
  await enableBtn.click();

  // ===== Home =====
  await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();

  console.log('✅ Тест завершён, YouTube продолжает играть 🎧');

  // =====================================================
  // 🎨 THEME TEST — DARK MODE
  // =====================================================

  const profileTab = page.getByRole('tab', { name: 'Profile' });
  await expect(profileTab).toBeVisible();
  await profileTab.click();

  const themeButton = page.getByText('ThemeLight', { exact: true });
  await expect(themeButton).toBeVisible();
  await themeButton.click();

  const darkThemeCheckbox = page.locator('div').filter({ hasText: /^Dark$/ });

  await expect(darkThemeCheckbox).toBeVisible();
  await darkThemeCheckbox.click();

  // ===== ASSERT DARK THEME ENABLED =====

  // вариант 1 (если есть класс/атрибут)
  // await expect(page.locator('body')).toHaveClass(/dark/i);

  // вариант 2 (fallback — фон тёмный)
  const bgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  expect(bgColor).not.toBe('rgb(255, 255, 255)');

  console.log('🌙 Dark theme enabled successfully');
});
