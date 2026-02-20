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
  // Ждем только первое поле - это безопасно и не ломает логику
  await expect(pinFields.first()).toBeVisible({ timeout: 15000 });

  await expect(pinFields).toHaveCount(pin.length);
  for (let i = 0; i < pin.length; i++) {
    await pinFields.nth(i).focus();
    await pinFields.nth(i).press(pin[i]);
  }
  console.log('🔓 PIN entered successfully');
}

// ==========================================
// 2. TEST SUITE (SERIAL MODE)
// ==========================================

test.describe.configure({ mode: 'serial' });

test.describe('E2E User Journey: Login -> Settings -> Finance -> History', () => {
  let page: Page;
  let lastEmailId: string | null;

  // Константа суммы для использования в Шаге 3 и Шаге 4
  const SELL_AMOUNT = 0.01;

  test.beforeAll(async ({ browser }) => {
    // Единая страница для сохранения сессии между шагами
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

    const enableBtn = page.getByText('Enable', { exact: true });
    await enableBtn.click();

    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible();
  });

  // -----------------------------------------------------------------------
  // TEST 2: SETTINGS & PERSISTENCE
  // -----------------------------------------------------------------------
  test('Step 2: Dark Theme Persistence after Reload', async () => {
    // Navigate to Profile
    await page.getByRole('tab', { name: 'Profile' }).click();
    await page.getByText('ThemeLight', { exact: true }).click();

    // Enable Dark
    const darkThemeCheckbox = page.locator('div').filter({ hasText: /^Dark$/ });
    await darkThemeCheckbox.click();

    const bgColorBefore = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(bgColorBefore).not.toBe('rgb(255, 255, 255)');
    console.log('🌙 Dark theme enabled (before reload):', bgColorBefore);

    // --- SPA RELOAD ---
    console.log('🔄 Reloading page...');
    await page.goto('about:blank');
    await page.goto(CONFIG.URL, { waitUntil: 'networkidle' });

    // --- PIN AFTER RELOAD ---
    const pinPageAfterReload = page.getByText('Enter your PIN-code');
    await expect(pinPageAfterReload).toBeVisible({ timeout: 15000 });

    await enterPin(page, CONFIG.USER.pin);
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 15000 });

    // --- CHECK PERSISTENCE ---
    const bgColorAfter = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(bgColorAfter).not.toBe('rgb(255, 255, 255)');
    console.log('✅ Dark theme persisted');
  });

  // -----------------------------------------------------------------------
  // TEST 3: FINANCE (LOGIC FROM ORIGINAL)
  // -----------------------------------------------------------------------
  test('Step 3: BTC Exchange Logic', async () => {
    await page.getByRole('tab', { name: 'Wallets' }).click();
    // Show Balance (Eye icon)
    await page.getByRole('img').nth(1).click();

    // Find BTC Block (Твой оригинальный селектор CSS)
    const btcWalletBlock = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'BTC' }) })
      .first();

    const btcBalanceDiv = btcWalletBlock.locator('div.MuiTypography-root.css-9a9k88').first();

    // Read Old Balance
    const oldBalanceText = await btcBalanceDiv.innerText();
    const oldBalance = parseFloat(oldBalanceText.replace(/\s/g, '').replace(',', '.'));
    console.log('💰 Старый баланс BTC:', oldBalance);

    // Go to Exchange
    await page
      .locator('div')
      .filter({ hasText: /^BTCBitcoin$/ })
      .first()
      .click();
    await page
      .locator('div')
      .filter({ hasText: /^Exchange$/ })
      .click();

    // Execute Trade
    await page.locator('#sell').fill(SELL_AMOUNT.toString());
    await page.getByRole('button', { name: 'Exchange' }).click();

    // Confirm (nth 5)
    await page.locator('button').nth(5).click();
    await page.getByText('Done').click();

    // Return to Wallets
    await page.getByRole('tab', { name: 'Wallets' }).click();

    // Wait for Update
    const btcWalletBlockNew = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'BTC' }) })
      .first();
    const btcBalanceDivNew = btcWalletBlockNew.locator('div.MuiTypography-root.css-9a9k88').first();

    let newBalance = oldBalance;
    const maxRetries = 20;

    console.log('⏳ Waiting for balance update...');
    for (let i = 0; i < maxRetries; i++) {
      const newBalanceText = await btcBalanceDivNew.innerText();
      const cleanedText = newBalanceText.replace(/\s/g, '').replace(',', '.');
      newBalance = parseFloat(cleanedText);

      if (!isNaN(newBalance) && newBalance !== oldBalance) break;
      await page.waitForTimeout(500);
    }

    console.log('💰 Новый баланс BTC:', newBalance);
    // Assertion
    expect(Math.abs(newBalance - (oldBalance - SELL_AMOUNT))).toBeLessThan(1e-8);
  });

  // -----------------------------------------------------------------------
  // TEST 4: HISTORY CHECK (NEW)
  // -----------------------------------------------------------------------
  test('Step 4: Verify Transaction History', async () => {
    console.log('📜 Checking Transaction History...');

    // 1. Go to Profile
    await page.getByRole('tab', { name: 'Profile' }).click();

    // 2. Click "Transaction history"
    await page
      .locator('div')
      .filter({ hasText: /^Transaction history$/ })
      .click();

    // 3. Switch to "Exchange" tab
    await page.getByRole('tab', { name: 'Exchange' }).click();

    // Даем немного времени списку подгрузиться
    await page.waitForTimeout(1000);

    // 4. Находим первую запись в списке
    // Используем универсальный селектор для строки списка MUI (Stack)
    // first() берет самую верхнюю (свежую) запись
    const latestTx = page.locator('div[class*="MuiStack-root"]').first();

    await expect(latestTx).toBeVisible();

    // 5. Проверяем детали:
    // - Должно быть упоминание BTC (валюта)
    // - Должно быть упоминание 0.01 (сумма)
    const txText = await latestTx.innerText();
    console.log(`📝 Latest Transaction Record:\n${txText}`);

    expect(txText).toContain('BTC');
    expect(txText).toContain(SELL_AMOUNT.toString());

    console.log('✅ History check passed!');
  });

  // -----------------------------------------------------------------------
  // TEST 5: UI FUNCTIONALITY (Hide Empty Balances)
  // -----------------------------------------------------------------------
  test('Step 5: Check "Hide Empty Balances" Filter', async () => {
    console.log('👀 Checking UI Filter...');

    // 1. Выходим из истории транзакций (Твой локатор)
    await page.getByRole('button').first().click();

    // 2. Возвращаемся в кошельки (Твой локатор)
    await page.getByRole('tab', { name: 'Wallets' }).click();

    // Ждем отрисовки списка кошельков
    const walletRows = page
      .locator('div[class*="MuiStack-root"]')
      .filter({ has: page.locator('p') });
    await expect(walletRows.first()).toBeVisible();

    const countBefore = await walletRows.count();
    console.log(`🔹 Wallets count before hide: ${countBefore}`);

    // 3. Кликаем чекбокс (Твой локатор)
    const hideCheckbox = page.getByRole('checkbox', { name: 'Hide empty balances' });
    await hideCheckbox.click(); // Или await hideCheckbox.check();

    // Даем UI время на фильтрацию списка
    await page.waitForTimeout(1000);

    const countAfter = await walletRows.count();
    console.log(`🔹 Wallets count after hide: ${countAfter}`);

    // Проверяем логику: строк должно стать меньше или столько же (но точно не больше)
    expect(countAfter).toBeLessThanOrEqual(countBefore);

    // Снимаем галочку, возвращаем как было
    await hideCheckbox.click();
  });

  // -----------------------------------------------------------------------
  // TEST 6: SECURITY & LOGOUT
  // -----------------------------------------------------------------------
  test('Step 6: Logout & Security Check', async () => {
    console.log('🔒 Performing Logout...');

    // 1. Идем в профиль (учитываем возможный русский язык)
    await page.getByRole('tab', { name: /Profile|Профиль/i }).click();

    // 2. ВАЖНО: Подготавливаем перехватчик системного диалога ДО клика
    // page.once сработает ровно один раз при появлении алерта
    page.once('dialog', async (dialog) => {
      console.log(`💬 Native Dialog appeared: "${dialog.message()}"`);
      await dialog.accept(); // Нажимаем "ОК" (Продолжить)
    });

    // 3. Находим кнопку выхода (Logout или Выход)
    const logoutBtn = page
      .locator('div')
      .filter({ hasText: /^Logout|Выход$/i })
      .last();

    // Скроллим вниз
    await logoutBtn.scrollIntoViewIfNeeded();

    // Кликаем (после этого появится диалог и Playwright сам нажмет ОК благодаря коду выше)
    await logoutBtn.click();

    // 4. Проверяем, что нас выкинуло на экран авторизации
    // Ищем инпут логина (надежный маркер того, что мы разлогинены)
    const loginInput = page.getByRole('textbox', { name: /Login|E-mail|Логин/i });
    await expect(loginInput).toBeVisible({ timeout: 15000 });
    console.log('✅ Redirected to Login page');

    // 5. SECURITY CHECK: Попытка вернуться назад (Back button hijacking)
    console.log('🕵️ Checking Session Termination (Back Button)...');
    await page.goBack();

    // Мы НЕ должны попасть обратно в профиль. Нас должно оставить на странице логина.
    await expect(loginInput).toBeVisible();
    console.log('✅ Session securely terminated');
  });
});
