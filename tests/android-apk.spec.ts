import { _android as android, test, expect, Page } from '@playwright/test';

// Запрещаем параллельный запуск (критично для ADB)
test.skip(({ browserName }) => browserName !== 'chromium', 'Android tests should only run once');

// ==========================================
// 1. CONFIG & HELPERS
// ==========================================
const CONFIG = {
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
    await pinFields.nth(i).type(pin[i], { delay: 50 });
  }
  console.log('🔓 PIN entered successfully');
}

// ==========================================
// 2. ANDROID APK TEST SUITE
// ==========================================
test.describe('Android APK - Full Smoke Suite', () => {
  test.setTimeout(180000);

  test('End-to-End User Journey inside APK', async () => {
    console.log('📱 Подключение к Android устройству...');
    const [device] = await android.devices();
    if (!device) throw new Error('❌ Устройство не найдено.');

    const APP_PACKAGE = 'by.erpbel.hermes';
    const SELL_AMOUNT_BTC = 0.01;
    const WITHDRAW_AMOUNT_USD = 150;
    let isBtcExchangeSkipped = false;

    console.log('🧹 Очистка данных приложения...');
    await device.shell(`pm clear ${APP_PACKAGE}`);
    console.log('🚀 Запуск APK...');
    await device.shell(`monkey -p ${APP_PACKAGE} -c android.intent.category.LAUNCHER 1`);
    console.log('🕸️ Подключение к WebView...');

    const webview = await device.webView({ pkg: APP_PACKAGE });
    const page = await webview.page();
    const lastEmailId = await getLastEmailId();
    await page.waitForLoadState('networkidle');

    // ---------------------------------------------------------
    // STEP 1: LOGIN & ONBOARDING
    // ---------------------------------------------------------
    console.log('🔐 Пробуем открыть секретное меню...');
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
        console.log('✅ Секретное меню прокликано!');
      }
    } catch (e) {
      console.log('⚠️ Секретное меню не найдено. Идем дальше.');
    }

    console.log('📝 Форма логина...');
    await page.getByRole('textbox', { name: /Login or E-mail|Логин/i }).fill(CONFIG.USER.email);
    await page.getByRole('textbox', { name: /Password|Пароль/i }).fill(CONFIG.USER.pass);
    await device.shell('input keyevent 111');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Submit|Войти|Продолжить/i }).click();

    console.log('📧 Ожидание OTP...');
    const emailHtml = await waitForNewEmail(lastEmailId);
    const otp = extractOtp(emailHtml);
    await page.getByPlaceholder('------').fill(otp);
    await device.shell('input keyevent 111');
    console.log(`✔ OTP введен`);

    console.log('🔐 Создание PIN...');
    const pinPageText = page.getByText(/Create your PIN-code|Создайте PIN-код/i);
    await expect(pinPageText).toBeVisible({ timeout: 15000 });
    await enterPin(page, CONFIG.USER.pin);

    console.log('⚙️ Пропуск биометрии...');
    try {
      const skipBiometricsBtn = page.getByText(/Пока пропустить|Пропустить|Skip/i).first();
      await skipBiometricsBtn.waitFor({ state: 'visible', timeout: 8000 });
      await skipBiometricsBtn.click();
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('ℹ️ Окно биометрии не появилось.');
    }

    console.log('👀 Ожидание Dashboard...');
    await expect(page.getByRole('tab', { name: /Home|Главная/i })).toBeVisible({ timeout: 20000 });

    // ---------------------------------------------------------
    // STEP 2: DARK THEME
    // ---------------------------------------------------------
    console.log('🎨 Включение темной темы...');
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
      console.log(`⚠️ ВНИМАНИЕ: Фон остался белым: ${bgColorAfter}.`);
    } else {
      console.log(`✅ Темная тема включена! Фон: ${bgColorAfter}`);
    }

    // ---------------------------------------------------------
    // STEP 3: BTC EXCHANGE
    // ---------------------------------------------------------
    console.log('💱 Обмен BTC...');
    await page.getByRole('tab', { name: /Wallets|Кошельки/i }).click();
    await page.getByRole('img').nth(1).click();
    await page.waitForTimeout(1000);

    const btcWalletBlock = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'BTC' }) })
      .first();
    const btcBalanceDiv = btcWalletBlock.locator('div.MuiTypography-root.css-9a9k88').first();
    const oldBalanceText = await btcBalanceDiv.innerText();
    const oldBalance = parseFloat(oldBalanceText.replace(/\s/g, '').replace(',', '.'));
    console.log('💰 Старый баланс BTC:', oldBalance);

    if (oldBalance < SELL_AMOUNT_BTC) {
      isBtcExchangeSkipped = true;
      console.log(`⚠️ Недостаточно BTC. Пропускаем обмен.`);
    } else {
      console.log('Кликаем на кошелек BTC...');
      await page
        .locator('div')
        .filter({ hasText: /^BTCBitcoin|BTCБиткоин$/i })
        .first()
        .click();

      console.log('Переходим на таб Exchange...');
      await page
        .getByText(/Exchange|Обмен/i, { exact: true })
        .first()
        .click();

      console.log('Вводим сумму...');
      const sellInput = page.locator('#sell');
      await sellInput.click();
      await sellInput.clear();
      await sellInput.pressSequentially(SELL_AMOUNT_BTC.toString(), { delay: 100 });
      await device.shell('input keyevent 111');

      console.log('Нажимаем кнопку обмена (Экран ввода)...');
      await page
        .locator('button')
        .filter({ hasText: /Exchange|Обменять/i })
        .first()
        .click();

      console.log('Ждем модалку подтверждения...');
      await page.waitForTimeout(1000);

      console.log('Нажимаем кнопку Подтвердить (Обменять)...');
      const confirmBtn = page
        .locator('button')
        .filter({ hasText: /Confirm|Обменять|Подтвердить/i })
        .last();
      await confirmBtn.click();

      await page.waitForTimeout(1000);
      console.log('Нажимаем Done (Готово)...');
      await page
        .getByText(/Done|Готово/i)
        .first()
        .click();

      await page.getByRole('tab', { name: /Wallets|Кошельки/i }).click();

      let newBalance = oldBalance;
      console.log('⏳ Ожидание обновления баланса...');
      for (let i = 0; i < 40; i++) {
        const newBalanceText = await btcBalanceDiv.innerText();
        newBalance = parseFloat(newBalanceText.replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(newBalance) && newBalance !== oldBalance) break;
        await page.waitForTimeout(500);
      }

      console.log('💰 Новый баланс BTC:', newBalance);
      expect(newBalance).toBeLessThan(oldBalance);
    }

    // ---------------------------------------------------------
    // STEP 4: HISTORY CHECK
    // ---------------------------------------------------------
    if (!isBtcExchangeSkipped) {
      console.log('📜 Проверка истории транзакций...');
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

    // ---------------------------------------------------------
    // STEP 5: FIAT WITHDRAWAL (USD)
    // ---------------------------------------------------------
    console.log('💸 Вывод фиата (USD)...');
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
    console.log(`💵 Текущий баланс USD: ${currentUsdBalance}`);

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
      console.log('✅ Заявка на вывод создана!');

      await page.getByText(/Got it|Понятно/i).click();
      await expect(successMsg).toBeHidden();
    } else {
      console.log('⚠️ Пропуск вывода USD (недостаточно средств).');
    }

    // ---------------------------------------------------------
    // STEP 6: LOGOUT
    // ---------------------------------------------------------
    console.log('🔒 Выход из аккаунта...');
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
    console.log('✅ Успешный выход');

    await device.close();
  });
});
