import { test, expect, Page } from '@playwright/test';

const MAILHOG_API = 'http://192.168.200.190:8025/api/v2/messages';

async function getLastEmailId(): Promise<string | null> {
  const res = await fetch(MAILHOG_API);
  const data: { items?: Array<{ ID: string }> } = await res.json();
  return data.items?.[0]?.ID ?? null;
}

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

function extractOtpFromMailhogHtml(rawHtml: string): string {
  const normalized = rawHtml.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const match = normalized.match(/<strong>\s*(\d{6})\s*<\/strong>/i);
  if (!match) throw new Error('OTP not found in email');
  return match[1];
}

// ---------------- HELPER: ENTER PIN ----------------
async function enterPin(page: Page, pin: string) {
  const pinFields = page.locator('.pin-field');
  await expect(pinFields).toHaveCount(pin.length);
  for (let i = 0; i < pin.length; i++) {
    await pinFields.nth(i).focus();
    await pinFields.nth(i).press(pin[i]);
  }
  console.log('🔓 PIN entered successfully');
}

// ---------------- MAIN TEST ----------------
test('Full flow + Dark Theme Persistence + localStorage', async ({ page }) => {
  const lastEmailId = await getLastEmailId();

  // ===== LOGIN FLOW =====
  await page.goto('https://192.168.253.40:6161');
  // Навигация до формы логина
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
  await page.getByPlaceholder('------').fill(otp);
  console.log('✔ OTP entered');

  // ===== CREATE PIN =====
  const pinPageText = page.getByText('Create your PIN-code');
  await expect(pinPageText).toBeVisible({ timeout: 10000 });
  const PIN = '123456';
  await enterPin(page, PIN);

  const enableBtn = page.getByText('Enable', { exact: true });
  await enableBtn.click();

  const homeTab = page.getByRole('tab', { name: 'Home' });
  await expect(homeTab).toBeVisible();

  // ===== DARK THEME =====
  const profileTab = page.getByRole('tab', { name: 'Profile' });
  await profileTab.click();

  const themeButton = page.getByText('ThemeLight', { exact: true });
  await themeButton.click();

  const darkThemeCheckbox = page.locator('div').filter({ hasText: /^Dark$/ });
  await darkThemeCheckbox.click();

  const bgColorBefore = await page.evaluate(
    () => window.getComputedStyle(document.body).backgroundColor,
  );
  expect(bgColorBefore).not.toBe('rgb(255, 255, 255)');
  console.log('🌙 Dark theme enabled (before reload):', bgColorBefore);

  // ---- LOG localStorage BEFORE RELOAD ----
  const lsBefore = await page.evaluate(() => {
    const storage: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) storage[key] = localStorage.getItem(key) as string;
    }
    return storage;
  });
  console.log('💾 localStorage before reload:', lsBefore);

  // ---- SPA-SAFE RELOAD ----
  await page.goto('about:blank');
  await page.goto('https://192.168.253.40:6161', { waitUntil: 'networkidle' });

  // ---- ENTER PIN AFTER RELOAD ----
  const pinPageAfterReload = page.getByText('Enter your PIN-code');
  await expect(pinPageAfterReload).toBeVisible({ timeout: 15000 });
  await enterPin(page, PIN);

  // ---- BACK TO HOME ----
  await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15000 });

  // ---- CHECK BG COLOR AFTER RELOAD ----
  const bgColorAfter = await page.evaluate(
    () => window.getComputedStyle(document.body).backgroundColor,
  );
  expect(bgColorAfter).not.toBe('rgb(255, 255, 255)');
  console.log('🔄 Dark theme persisted after SPA-safe reload + PIN:', bgColorAfter);

  // ---- LOG localStorage AFTER RELOAD ----
  const lsAfter = await page.evaluate(() => {
    const storage: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) storage[key] = localStorage.getItem(key) as string;
    }
    return storage;
  });
  console.log('💾 localStorage after reload:', lsAfter);

  // OPTIONAL: ASSERT THEME KEY EXISTS IN localStorage
  const themeKey = Object.keys(lsAfter).find((key) => key.toLowerCase().includes('theme'));
  if (themeKey) {
    console.log(`✅ Dark theme key in localStorage: ${themeKey} = ${lsAfter[themeKey]}`);
  } else {
    console.warn('⚠️ Dark theme key not found in localStorage!');
  }
});
