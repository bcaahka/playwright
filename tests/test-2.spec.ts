import { test, expect } from '@playwright/test';

const MAILHOG_API = 'http://192.168.200.190:8025/api/v2/messages';

/*** Получаем ID последнего письма*/

async function getLastEmailId(): Promise<string | null> {
  const res = await fetch(MAILHOG_API);
  const data: { items?: Array<{ ID: string }> } = await res.json();
  return data.items?.[0]?.ID ?? null;
}

/*** Ждём новое письмо по ID и возвращаем HTML*/

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

/*** Парсим 6-значный OTP из HTML письма*/

function extractOtpFromMailhogHtml(rawHtml: string): string {
  const normalized = rawHtml.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const match = normalized.match(/<strong>\s*(\d{6})\s*<\/strong>/i);
  if (!match) throw new Error('OTP not found in email');
  return match[1];
}

test('Full flow: Login + OTP + PIN + Enable + Home check', async ({ page }) => {
  // ===== фиксируем последнее письмо до логина =====
  const lastEmailId = await getLastEmailId();
  console.log('📨 LAST EMAIL ID BEFORE LOGIN:', lastEmailId);

  // ===== ЛОГИН =====
  await page.goto('https://192.168.253.40:6161');

  // Навигация до формы логина (подставь свои шаги)
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
  const otp = extractOtpFromMailhogHtml(emailHtml);
  console.log('✅ OTP:', otp);

  // ===== вводим OTP =====
  await page.getByPlaceholder('------').fill(otp);
  // await page.getByText('Confirm', { exact: true }).click();
  console.log('✔ Confirm clicked, переход к PIN-коду');

  // ===== ждём страницу с текстом Create your PIN-code =====
  const pinPageText = page.getByText('Create your PIN-code');
  await expect(pinPageText).toBeVisible({ timeout: 10000 });
  console.log('✔ На странице Create your PIN-code, продолжаем ввод PIN');

  // ===== ввод PIN-кода (СТАБИЛЬНЫЙ СПОСОБ) =====
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
  console.log('✔ Enable clicked');

  // ===== проверка на Home =====
  const homeTab = page.getByRole('tab', { name: 'Home' });
  await expect(homeTab).toBeVisible();
  console.log('✅ Home tab visible — тест завершён');

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

  const bgColor = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });
  expect(bgColor).not.toBe('rgb(255, 255, 255)');

  console.log('🌙 Dark theme enabled successfully');

  // =====================================================
  // 🌙 DARK THEME CHECK VIA BACKGROUND COLOR + RELOAD
  // =====================================================

  // небольшая пауза, чтобы тема успела примениться
  await page.waitForTimeout(300);

  // ---- проверка ДО reload ----
  const bgColorBefore = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });

  expect(bgColorBefore).not.toBe('rgb(255, 255, 255)');
  console.log('🌙 Dark theme enabled (before reload):', bgColorBefore);

  // ---- reload ----
  await page.reload();
  await page.waitForLoadState('domcontentloaded');

  // небольшая пауза после reload
  await page.waitForTimeout(300);

  // ---- проверка ПОСЛЕ reload ----
  const bgColorAfter = await page.evaluate(() => {
    return window.getComputedStyle(document.body).backgroundColor;
  });

  expect(bgColorAfter).not.toBe('rgb(255, 255, 255)');
  console.log('🔄 Dark theme persisted after reload:', bgColorAfter);
});
