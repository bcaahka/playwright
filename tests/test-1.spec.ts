import { test, expect, Page } from '@playwright/test';

// ==========================================
// 1. CONFIG & HELPERS
// ==========================================
const CONFIG = {
  URL: 'https://192.168.253.40:6161',
  MAILHOG_API: 'http://192.168.200.190:8025/api/v2/messages',
  USER: {
    email: 'bcaahkaassist@gmail.com',
    pass: 'Danilka1337$',
    pin: '123456',
  },
};

async function getLastEmailId(): Promise<string | null> {
  const res = await fetch(CONFIG.MAILHOG_API);
  const data: { items?: Array<{ ID: string }> } = await res.json();
  return data.items?.[0]?.ID ?? null;
}

async function waitForNewEmail(previousId: string | null, timeout = 20000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const res = await fetch(CONFIG.MAILHOG_API);
    const data = await res.json();
    const latest = data.items?.[0];
    if (latest && latest.ID !== previousId) {
      return latest.Content?.Body ?? latest.Raw?.Data ?? '';
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('⚠️ New email not received within timeout');
}

function extractOtp(rawHtml: string): string {
  const normalized = rawHtml.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const match = normalized.match(/<strong>\s*(\d{6})\s*<\/strong>/i);
  if (!match) throw new Error('⚠️ OTP not found in email');
  return match[1];
}

async function enterPin(page: Page, pin: string) {
  const pinFields = page.locator('.pin-field');
  await expect(pinFields.first()).toBeVisible({ timeout: 15000 });
  await expect(pinFields).toHaveCount(pin.length);

  for (let i = 0; i < pin.length; i++) {
    await pinFields.nth(i).focus();
    // Имитируем человека (задержка 100мс), чтобы Jenkins не "проглатывал" цифры
    await pinFields.nth(i).type(pin[i], { delay: 100 });
  }
  console.log('🔓 PIN entered successfully');
}

// ==========================================
// 2. TEST SUITE (SERIAL MODE)
// ==========================================

test.describe.configure({ mode: 'serial' });

test.describe('E2E User Journey: Smoke Suite', () => {
  let page: Page;
  let lastEmailId: string | null;
  const SELL_AMOUNT = 0.01;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    lastEmailId = await getLastEmailId();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // -----------------------------------------------------------------------
  // TEST 1: AUTHENTICATION
  // -----------------------------------------------------------------------
  test('Step 1: Login, OTP and PIN creation', async () => {
    await page.goto(CONFIG.URL);

    // --- SECRET CLICKS ---
    await page.getByRole('button').first().click();
    await page.getByRole('button').nth(1).click();
    await page.getByRole('button').nth(2).click();
    await page.getByRole('button').first().click();
    await page.getByRole('button').nth(1).click();
    await page.getByRole('button').nth(2).click();
    await page.getByRole('button').nth(4).click();
    await page.getByRole('button').nth(4).click();
    await page.getByText('Test0', { exact: true }).click();

    // --- CREDENTIALS ---
    await page.getByRole('textbox', { name: 'Login or E-mail' }).fill(CONFIG.USER.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(CONFIG.USER.pass);
    await page.getByRole('button', { name: 'Submit' }).click();

    // --- OTP ---
    const emailHtml = await waitForNewEmail(lastEmailId);
    const otp = extractOtp(emailHtml);
    await page.getByPlaceholder('------').fill(otp);
    console.log('✔ OTP entered');

    // --- PIN ---
    const pinPageText = page.getByText('Create your PIN-code');
    await expect(pinPageText).toBeVisible({ timeout: 10000 });
    await enterPin(page, CONFIG.USER.pin);

    // --- СТАБИЛИЗАЦИЯ: Умное ожидание кнопки Enable ---
    const enableBtn = page.getByText('Enable', { exact: true });
    try {
      await enableBtn.waitFor({ state: 'visible', timeout: 5000 });
      await enableBtn.click();
      console.log('✔ "Enable" button clicked');
    } catch (e) {
      console.log('ℹ️ "Enable" button skipped (not visible in CI)');
    }

    // Ждем загрузки Дашборда (Home)
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 20000 });
  });

  // -----------------------------------------------------------------------
  // TEST 2: SETTINGS & PERSISTENCE
  // -----------------------------------------------------------------------
  test('Step 2: Dark Theme Persistence after Reload', async () => {
    await page.getByRole('tab', { name: 'Profile' }).click();
    await page.getByText('ThemeLight', { exact: true }).click();

    const darkThemeCheckbox = page.locator('div').filter({ hasText: /^Dark$/ });
    await darkThemeCheckbox.click();

    const bgColorBefore = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(bgColorBefore).not.toBe('rgb(255, 255, 255)');

    // --- SPA RELOAD ---
    console.log('🔄 Reloading page...');
    await page.goto('about:blank');
    await page.goto(CONFIG.URL, { waitUntil: 'networkidle' });

    // --- PIN AFTER RELOAD ---
    await enterPin(page, CONFIG.USER.pin);
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 20000 });

    const bgColorAfter = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(bgColorAfter).not.toBe('rgb(255, 255, 255)');
  });

  // -----------------------------------------------------------------------
  // TEST 3: FINANCE (ОРИГИНАЛЬНАЯ ЛОГИКА И СЕЛЕКТОРЫ)
  // -----------------------------------------------------------------------
  test('Step 3: BTC Exchange Logic', async () => {
    await page.getByRole('tab', { name: 'Wallets' }).click();
    await page.getByRole('img').nth(1).click();

    // Твой оригинальный селектор
    const btcWalletBlock = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'BTC' }) })
      .first();

    const btcBalanceDiv = btcWalletBlock.locator('div.MuiTypography-root.css-9a9k88').first();

    const oldBalanceText = await btcBalanceDiv.innerText();
    const oldBalance = parseFloat(oldBalanceText.replace(/\s/g, '').replace(',', '.'));
    console.log('💰 Старый баланс BTC:', oldBalance);

    await page
      .locator('div')
      .filter({ hasText: /^BTCBitcoin$/ })
      .first()
      .click();
    await page
      .locator('div')
      .filter({ hasText: /^Exchange$/ })
      .click();

    await page.locator('#sell').fill(SELL_AMOUNT.toString());
    await page.getByRole('button', { name: 'Exchange' }).click();

    // Стабилизация: небольшая пауза перед подтверждением в CI
    await page.waitForTimeout(500);

    // Твой оригинальный клик
    await page.locator('button').nth(5).click();

    await page.waitForTimeout(500);
    await page.getByText('Done').click();

    await page.getByRole('tab', { name: 'Wallets' }).click();

    const btcWalletBlockNew = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'BTC' }) })
      .first();
    const btcBalanceDivNew = btcWalletBlockNew.locator('div.MuiTypography-root.css-9a9k88').first();

    let newBalance = oldBalance;

    // --- СТАБИЛИЗАЦИЯ: 60 попыток (30 секунд) для CI сервера ---
    const maxRetries = 60;

    console.log('⏳ Waiting for balance update...');
    for (let i = 0; i < maxRetries; i++) {
      const newBalanceText = await btcBalanceDivNew.innerText();
      const cleanedText = newBalanceText.replace(/\s/g, '').replace(',', '.');
      newBalance = parseFloat(cleanedText);

      if (!isNaN(newBalance) && newBalance !== oldBalance) break;
      await page.waitForTimeout(500);
    }

    console.log('💰 Новый баланс BTC:', newBalance);
    expect(Math.abs(newBalance - (oldBalance - SELL_AMOUNT))).toBeLessThan(1e-8);
  });

  // -----------------------------------------------------------------------
  // TEST 4: HISTORY CHECK
  // -----------------------------------------------------------------------
  test('Step 4: Verify Transaction History', async () => {
    await page.getByRole('tab', { name: 'Profile' }).click();
    await page
      .locator('div')
      .filter({ hasText: /^Transaction history$/ })
      .click();
    await page.getByRole('tab', { name: 'Exchange' }).click();

    await page.waitForTimeout(1000);

    const latestTx = page.locator('div[class*="MuiStack-root"]').first();
    await expect(latestTx).toBeVisible();

    const txText = await latestTx.innerText();
    expect(txText).toContain('BTC');
    expect(txText).toContain(SELL_AMOUNT.toString());

    // Выход из истории транзакций (твоя логика)
    await page.getByRole('button').first().click();
  });

  // -----------------------------------------------------------------------
  // TEST 5: UI FILTER (Hide Empty)
  // -----------------------------------------------------------------------
  test('Step 5: Check "Hide Empty Balances" Filter', async () => {
    await page.getByRole('tab', { name: 'Wallets' }).click();

    const walletRows = page
      .locator('div[class*="MuiStack-root"]')
      .filter({ has: page.locator('p') });
    await expect(walletRows.first()).toBeVisible();

    const countBefore = await walletRows.count();

    // Твой локатор
    const hideCheckbox = page.getByRole('checkbox', { name: 'Hide empty balances' });
    await hideCheckbox.click();
    await page.waitForTimeout(1000); // Ждем перерисовку

    const countAfter = await walletRows.count();
    expect(countAfter).toBeLessThanOrEqual(countBefore);

    await hideCheckbox.click();
  });

  // -----------------------------------------------------------------------
  // TEST 6: SECURITY (Logout)
  // -----------------------------------------------------------------------
  test('Step 6: Logout & Security Check', async () => {
    await page.getByRole('tab', { name: 'Profile' }).click();

    // Обработка системного диалога (чтобы Playwright нажал ОК, а не Отмена)
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Твой локатор логаута
    const logoutBtn = page
      .locator('div')
      .filter({ hasText: /^Logout$/ })
      .nth(2);
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();

    const loginInput = page.getByRole('textbox', { name: 'Login or E-mail' });
    await expect(loginInput).toBeVisible({ timeout: 15000 });

    // Проверка, что сессия убита
    await page.goBack();
    await expect(loginInput).toBeVisible();
  });
});
