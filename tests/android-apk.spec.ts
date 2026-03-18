import { _android as android, test, expect, Page } from '@playwright/test';

const CONFIG = {
  MAILHOG_API: 'http://192.168.200.190:8025/api/v2/messages',
  USER: {
    email: 'bcaahkaassist@gmail.com',
    pass: 'Danilka1337$',
    pin: '123456',
  },
};

function logInfo(message: string, ...args: unknown[]) {
  console.log(`[INFO] ${message}`, ...args);
}

function logOk(message: string, ...args: unknown[]) {
  console.log(`[OK] ${message}`, ...args);
}

function logWarn(message: string, ...args: unknown[]) {
  console.log(`[WARN] ${message}`, ...args);
}

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
  throw new Error('New email was not received within timeout');
}

function extractOtp(rawHtml: string): string {
  const normalized = rawHtml.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const match = normalized.match(/<strong>\s*(\d{6})\s*<\/strong>/i);
  if (!match) throw new Error('OTP not found in email');
  return match[1];
}

async function enterPin(page: Page, pin: string) {
  const pinFields = page.locator('.pin-field');
  await expect(pinFields.first()).toBeVisible({ timeout: 15000 });
  await expect(pinFields).toHaveCount(pin.length);

  for (let i = 0; i < pin.length; i++) {
    await pinFields.nth(i).focus();
    await pinFields.nth(i).type(pin[i], { delay: 50 });
  }

  logOk('PIN entered successfully');
}

test.describe('Android APK - Full Smoke Suite', () => {
  test.setTimeout(180000);

  test('End-to-End User Journey inside APK', async () => {
    logInfo('Connecting to Android device');
    let device: Awaited<ReturnType<typeof android.devices>>[number] | undefined;

    try {
      [device] = await android.devices();
    } catch (error) {
      logWarn('Unable to get Android devices list. Skipping test.', error);
      test.skip(true, 'Android device is not connected');
      return;
    }

    if (!device) {
      logWarn('Android device is not connected. Skipping test.');
      test.skip(true, 'Android device is not connected');
      return;
    }

    const APP_PACKAGE = 'by.erpbel.hermes';
    const SELL_AMOUNT_BTC = 0.01;
    const WITHDRAW_AMOUNT_USD = 150;
    let isBtcExchangeSkipped = false;

    logInfo('Clearing application data');
    await device.shell(`pm clear ${APP_PACKAGE}`);
    logInfo('Launching APK');
    await device.shell(`monkey -p ${APP_PACKAGE} -c android.intent.category.LAUNCHER 1`);
    logInfo('Connecting to WebView');

    const webview = await device.webView({ pkg: APP_PACKAGE });
    const page = await webview.page();
    const lastEmailId = await getLastEmailId();
    await page.waitForLoadState('networkidle');

    logInfo('Trying to open hidden menu');
    try {
      const firstBtn = page.getByRole('button').first();
      await firstBtn.waitFor({ state: 'visible', timeout: 10000 });
      await firstBtn.click({ delay: 50 });
      await page.getByRole('button').nth(1).click({ delay: 50 });
      await page.getByRole('button').nth(2).click({ delay: 50 });
      await page.getByRole('button').first().click({ delay: 50 });
      await page.getByRole('button').nth(1).click({ delay: 50 });
      await page.getByRole('button').nth(2).click({ delay: 50 });
      await page.getByRole('button').nth(4).click({ delay: 50 });
      await page.getByRole('button').nth(4).click({ delay: 50 });

      const test0Btn = page.getByText('Test0', { exact: true });
      if (await test0Btn.isVisible({ timeout: 2000 })) {
        await test0Btn.click();
        logOk('Hidden menu opened');
      }
    } catch {
      logWarn('Hidden menu was not found, continuing');
    }

    logInfo('Filling login form');
    await page.getByRole('textbox', { name: /Login or E-mail|Логин/i }).fill(CONFIG.USER.email);
    await page.getByRole('textbox', { name: /Password|Пароль/i }).fill(CONFIG.USER.pass);
    await device.shell('input keyevent 111');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Submit|Войти|Продолжить/i }).click();

    logInfo('Waiting for OTP');
    const emailHtml = await waitForNewEmail(lastEmailId);
    const otp = extractOtp(emailHtml);
    await page.getByPlaceholder('------').fill(otp);
    await device.shell('input keyevent 111');
    logOk('OTP entered');

    logInfo('Creating PIN');
    const pinPageText = page.getByText(/Create your PIN-code|Создайте PIN-код/i);
    await expect(pinPageText).toBeVisible({ timeout: 15000 });
    await enterPin(page, CONFIG.USER.pin);

    logInfo('Trying to skip biometrics');
    try {
      const skipBiometricsBtn = page.getByText(/Пока пропустить|Пропустить|Skip/i).first();
      await skipBiometricsBtn.waitFor({ state: 'visible', timeout: 8000 });
      await skipBiometricsBtn.click();
      await page.waitForTimeout(1000);
    } catch {
      logInfo('Biometrics prompt did not appear');
    }

    logInfo('Waiting for dashboard');
    await expect(page.getByRole('tab', { name: /Home|Главная/i })).toBeVisible({ timeout: 20000 });

    logInfo('Enabling dark theme');
    await page.getByRole('tab', { name: /Profile|Профиль/i }).click();
    await page.getByText(/ThemeLight|Светлая/i, { exact: true }).click();
    await page.waitForTimeout(500);

    const darkThemeCheckbox = page.locator('input[type="checkbox"]').nth(1);
    await darkThemeCheckbox.click({ force: true });
    await expect(page.getByRole('tab', { name: /Profile|Профиль/i })).toBeVisible({
      timeout: 5000,
    });
    await page.waitForTimeout(1000);

    const bgColorAfter = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    if (bgColorAfter === 'rgb(255, 255, 255)' || bgColorAfter === 'rgba(0, 0, 0, 0)') {
      logWarn(`Background remained light: ${bgColorAfter}`);
    } else {
      logOk(`Dark theme enabled. Background: ${bgColorAfter}`);
    }

    logInfo('Starting BTC exchange');
    await page.getByRole('tab', { name: /Wallets|Кошельки/i }).click();
    await page.getByRole('img').nth(1).click();
    await page.waitForTimeout(1000);

    const btcWalletBlock = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'BTC' }) })
      .first();
    const btcBalanceDiv = btcWalletBlock.locator('div.MuiTypography-root.css-9a9k88').first();
    const oldBalanceText = await btcBalanceDiv.innerText();
    const oldBalance = parseFloat(oldBalanceText.replace(/\s/g, '').replace(',', '.'));
    logInfo('Previous BTC balance', oldBalance);

    if (oldBalance < SELL_AMOUNT_BTC) {
      isBtcExchangeSkipped = true;
      logWarn('Insufficient BTC balance, skipping exchange');
    } else {
      logInfo('Opening BTC wallet');
      await page
        .locator('div')
        .filter({ hasText: /^BTCBitcoin|BTCБиткоин$/i })
        .first()
        .click();

      logInfo('Opening Exchange tab');
      await page
        .getByText(/Exchange|Обмен/i, { exact: true })
        .first()
        .click();

      logInfo('Entering sell amount');
      const sellInput = page.locator('#sell');
      await sellInput.click();
      await sellInput.clear();
      await sellInput.pressSequentially(SELL_AMOUNT_BTC.toString(), { delay: 100 });
      await device.shell('input keyevent 111');

      logInfo('Submitting exchange');
      await page
        .locator('button')
        .filter({ hasText: /Exchange|Обменять/i })
        .first()
        .click();

      logInfo('Waiting for confirmation modal');
      await page.waitForTimeout(1000);

      logInfo('Confirming exchange');
      const confirmBtn = page
        .locator('button')
        .filter({ hasText: /Confirm|Обменять|Подтвердить/i })
        .last();
      await confirmBtn.click();

      await page.waitForTimeout(1000);
      logInfo('Closing success modal');
      await page
        .getByText(/Done|Готово/i)
        .first()
        .click();

      await page.getByRole('tab', { name: /Wallets|Кошельки/i }).click();

      let newBalance = oldBalance;
      logInfo('Waiting for balance update');
      for (let i = 0; i < 40; i++) {
        const newBalanceText = await btcBalanceDiv.innerText();
        newBalance = parseFloat(newBalanceText.replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(newBalance) && newBalance !== oldBalance) break;
        await page.waitForTimeout(500);
      }

      logInfo('New BTC balance', newBalance);
      expect(newBalance).toBeLessThan(oldBalance);
    }

    if (!isBtcExchangeSkipped) {
      logInfo('Checking transaction history');
      await page.getByRole('tab', { name: /Profile|Профиль/i }).click();
      await page
        .locator('div')
        .filter({ hasText: /^Transaction history|История транзакций$/i })
        .click();
      await page.getByRole('tab', { name: /Exchange|Обмен$/i }).click();

      await page.waitForTimeout(1000);
      const latestTx = page.locator('div[class*="MuiStack-root"]').first();
      await expect(latestTx).toBeVisible();

      const txText = await latestTx.innerText();
      expect(txText).toContain('BTC');
      expect(txText).toContain(SELL_AMOUNT_BTC.toString());
      await page.getByRole('button').first().click();
    }

    logInfo('Starting fiat withdrawal (USD)');
    await page.getByRole('tab', { name: /Wallets|Кошельки/i }).click();
    await page.getByRole('tab', { name: /Fiat|Фиат/i }).click();

    const hiddenAsterisks = page.getByText('***').first();
    if (await hiddenAsterisks.isVisible()) {
      await page.getByRole('img').nth(1).click();
      await page.waitForTimeout(1000);
    }

    const usdWalletBlock = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'USD' }) })
      .filter({ hasText: /Доллар США|US Dollar/i })
      .first();

    const usdBalanceDiv = usdWalletBlock.locator('div.MuiTypography-root.css-9a9k88').first();
    await expect(usdBalanceDiv).toBeVisible({ timeout: 10000 });

    const usdBalanceText = await usdBalanceDiv.innerText();

    let cleanedText = usdBalanceText.replace(/\s|\u00A0|USD/g, '');
    if (cleanedText.includes(',') && cleanedText.includes('.')) {
      cleanedText = cleanedText.replace(/,/g, '');
    } else {
      cleanedText = cleanedText.replace(',', '.');
    }

    const currentUsdBalance = parseFloat(cleanedText);
    logInfo('Current USD balance', currentUsdBalance);

    if (currentUsdBalance >= WITHDRAW_AMOUNT_USD) {
      await usdWalletBlock.click();
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: /Withdraw|Вывод/i }).click();
      await page.waitForTimeout(500);

      await page
        .locator('div')
        .filter({ hasText: /Bank transfer|Банковский перевод/i })
        .nth(5)
        .click();
      const radioBtn = page.getByRole('button', { name: 'Test25 IBAN' }).getByRole('radio');
      await radioBtn.click();
      await page.getByRole('button', { name: /Continue|Продолжить/i }).click();

      const amountFieldWrapper = page
        .locator('div')
        .filter({ hasText: /^USDMAX$/i })
        .nth(1);
      const usdInput = amountFieldWrapper.locator('input');
      await usdInput.click();
      await usdInput.clear();
      await usdInput.pressSequentially(WITHDRAW_AMOUNT_USD.toString(), { delay: 100 });
      await device.shell('input keyevent 111');

      await page.getByRole('button', { name: /Withdraw|Вывести/i }).click();

      const successMsg = page.getByText(/We have received your|Мы получили ваш/i);
      await expect(successMsg).toBeVisible({ timeout: 15000 });
      logOk('Withdrawal request created');

      await page.getByText(/Got it|Понятно/i).click();
      await expect(successMsg).toBeHidden();
    } else {
      logWarn('Skipping USD withdrawal due to low balance');
    }

    logInfo('Logging out');
    await page.getByRole('tab', { name: /Profile|Профиль/i }).click();

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    const logoutBtn = page
      .locator('div')
      .filter({ hasText: /^Logout|Выход$/i })
      .last();
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();

    const loginInput = page.getByRole('textbox', { name: /Login or E-mail|Логин/i });
    await expect(loginInput).toBeVisible({ timeout: 15000 });
    logOk('Logout successful');

    await device.close();
  });
});
