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
  throw new Error('⚠️ New email not received within timeout');
}

function extractOtpFromMailhogHtml(rawHtml: string): string {
  const normalized = rawHtml.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const match = normalized.match(/<strong>\s*(\d{6})\s*<\/strong>/i);
  if (!match) throw new Error('⚠️ OTP not found in email');
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
test('Full flow + Dark Theme Persistence + localStorage + BTC Exchange', async ({ page }) => {
  const lastEmailId = await getLastEmailId();

  // ===== LOGIN FLOW =====
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
  await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();

  // ===== DARK THEME =====
  const profileTab = page.getByRole('tab', { name: 'Profile' });
  await profileTab.click();
  await page.getByText('ThemeLight', { exact: true }).click();
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

  // ===== BTC EXCHANGE FLOW =====

  // --- 1. Перейти в Wallets ---
  await page.getByRole('tab', { name: 'Wallets' }).click();

  // --- 2. Нажать глазок, чтобы видеть балансы (один раз) ---
  await page.getByRole('img').nth(1).click();

  // --- 3. Найти блок BTC и баланс ---
  const btcWalletBlock = page
    .locator('div.MuiStack-root.css-1kled2g', {
      has: page.locator('p', { hasText: 'BTC' }),
    })
    .first();
  const btcBalanceDiv = btcWalletBlock.locator('div.MuiTypography-root.css-9a9k88').first();

  // --- 4. Считываем старый баланс BTC ---
  const oldBalanceText = await btcBalanceDiv.innerText();
  const oldBalance = parseFloat(oldBalanceText.replace(/\s/g, '').replace(',', '.'));
  console.log('💰 Старый баланс BTC:', oldBalance);

  // --- 5. Клик на блок BTC перед Exchange ---
  const btcBlockForExchange = page
    .locator('div')
    .filter({ hasText: /^BTCBitcoin$/ })
    .first();
  await btcBlockForExchange.click();

  // --- 6. Переход в Exchange ---
  await page
    .locator('div')
    .filter({ hasText: /^Exchange$/ })
    .click();

  // --- 7. Ввод суммы для продажи ---
  const sellAmount = 0.01; // немного увеличено для надежности
  await page.locator('#sell').fill(sellAmount.toString());

  // --- 8. Нажатие кнопки Exchange ---
  await page.getByRole('button', { name: 'Exchange' }).click();

  // --- 9. Подтверждение (пятая кнопка) ---
  await page.locator('button').nth(5).click();

  // --- 10. Ждём завершения ---
  await page.getByText('Done').click();

  // --- 11. Возврат в Wallets ---
  await page.getByRole('tab', { name: 'Wallets' }).click();

  // --- 12. Ждём обновления баланса BTC ---
  const btcWalletBlockNew = page
    .locator('div.MuiStack-root.css-1kled2g', {
      has: page.locator('p', { hasText: 'BTC' }),
    })
    .first();
  const btcBalanceDivNew = btcWalletBlockNew.locator('div.MuiTypography-root.css-9a9k88').first();

  let newBalance = oldBalance;
  const maxRetries = 20;
  for (let i = 0; i < maxRetries; i++) {
    const newBalanceText = await btcBalanceDivNew.innerText();
    const cleanedText = newBalanceText.replace(/\s/g, '').replace(',', '.');
    newBalance = parseFloat(cleanedText);
    if (!isNaN(newBalance) && newBalance !== oldBalance) break;
    await page.waitForTimeout(500);
  }

  console.log('💰 Новый баланс BTC:', newBalance);

  // --- 13. Проверка, что баланс уменьшился на sellAmount ---
  expect(Math.abs(newBalance - (oldBalance - sellAmount))).toBeLessThan(1e-8);
});
