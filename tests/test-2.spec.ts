import { test, expect, Page } from '@playwright/test';

const CONFIG = {
  URL: 'https://192.168.253.40:6161',
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
    await pinFields.nth(i).type(pin[i], { delay: 100 });
  }

  logOk('PIN entered successfully');
}

test.describe.configure({ mode: 'serial' });

test.describe('BynexE2E', () => {
  let page: Page;
  let lastEmailId: string | null;
  const SELL_AMOUNT = 0.01;

  let isExchangeSkipped = false;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    lastEmailId = await getLastEmailId();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: Login, OTP and PIN creation', async () => {
    await page.goto(CONFIG.URL);

    await page.getByRole('button').first().click();
    await page.getByRole('button').nth(1).click();
    await page.getByRole('button').nth(2).click();
    await page.getByRole('button').first().click();
    await page.getByRole('button').nth(1).click();
    await page.getByRole('button').nth(2).click();
    await page.getByRole('button').nth(4).click();
    await page.getByRole('button').nth(4).click();
    await page.getByText('Test0', { exact: true }).click();

    await page.getByRole('textbox', { name: 'Login or E-mail' }).fill(CONFIG.USER.email);
    await page.getByRole('textbox', { name: 'Password' }).fill(CONFIG.USER.pass);
    await page.getByRole('button', { name: 'Submit' }).click();

    const emailHtml = await waitForNewEmail(lastEmailId);
    const otp = extractOtp(emailHtml);
    await page.getByPlaceholder('------').fill(otp);
    logOk('OTP entered');

    const pinPageText = page.getByText('Create your PIN-code');
    await expect(pinPageText).toBeVisible({ timeout: 10000 });
    await enterPin(page, CONFIG.USER.pin);

    const enableBtn = page.getByText('Enable', { exact: true });
    try {
      await enableBtn.waitFor({ state: 'visible', timeout: 5000 });
      await enableBtn.click();
      logOk('"Enable" button clicked');
    } catch {
      logInfo('"Enable" button skipped (not visible in CI)');
    }

    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 20000 });
  });

  test('Step 2: Dark Theme Persistence after Reload', async () => {
    await page.getByRole('tab', { name: 'Profile' }).click();
    await page.getByText('ThemeLight', { exact: true }).click();

    const darkThemeCheckbox = page.locator('div').filter({ hasText: /^Dark$/ });
    await darkThemeCheckbox.click();

    const bgColorBefore = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(bgColorBefore).not.toBe('rgb(255, 255, 255)');

    logInfo('Reloading page');
    await page.goto('about:blank');
    await page.goto(CONFIG.URL, { waitUntil: 'networkidle' });

    await enterPin(page, CONFIG.USER.pin);
    await expect(page.getByRole('tab', { name: 'Home' })).toBeVisible({ timeout: 20000 });

    const bgColorAfter = await page.evaluate(
      () => window.getComputedStyle(document.body).backgroundColor,
    );
    expect(bgColorAfter).not.toBe('rgb(255, 255, 255)');
  });

  test('Step 3: BTC Exchange Logic', async () => {
    await page.getByRole('tab', { name: 'Wallets' }).click();
    await page.getByRole('img').nth(1).click();
    await page.waitForTimeout(1000);

    const btcWalletBlock = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'BTC' }) })
      .first();
    const btcBalanceDiv = btcWalletBlock.locator('div.MuiTypography-root.css-9a9k88').first();

    const oldBalanceText = await btcBalanceDiv.innerText();
    const oldBalance = parseFloat(oldBalanceText.replace(/\s/g, '').replace(',', '.'));
    logInfo('Previous BTC balance', oldBalance);

    if (oldBalance < SELL_AMOUNT) {
      isExchangeSkipped = true;
      logWarn(
        `Insufficient funds for exchange. Required: ${SELL_AMOUNT}, Actual: ${oldBalance}`,
      );
      test.skip(true, `Insufficient BTC balance. Required: ${SELL_AMOUNT}, Actual: ${oldBalance}`);
    }

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

    await page.waitForTimeout(500);
    await page.locator('button').nth(5).click();
    await page.waitForTimeout(500);
    await page.getByText('Done').click();

    await page.getByRole('tab', { name: 'Wallets' }).click();

    const btcWalletBlockNew = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'BTC' }) })
      .first();
    const btcBalanceDivNew = btcWalletBlockNew.locator('div.MuiTypography-root.css-9a9k88').first();

    let newBalance = oldBalance;
    const maxRetries = 60;

    logInfo('Waiting for balance update');
    for (let i = 0; i < maxRetries; i++) {
      const newBalanceText = await btcBalanceDivNew.innerText();
      const cleanedText = newBalanceText.replace(/\s/g, '').replace(',', '.');
      newBalance = parseFloat(cleanedText);

      if (!isNaN(newBalance) && newBalance !== oldBalance) break;
      await page.waitForTimeout(500);
    }

    logInfo('New BTC balance', newBalance);
    expect(newBalance).toBeLessThan(oldBalance);
    expect(newBalance).toBeLessThanOrEqual(oldBalance - SELL_AMOUNT + 0.0001);
  });

  test('Step 4: Verify Transaction History', async () => {
    if (isExchangeSkipped) {
      test.skip(true, 'Exchange was skipped due to low balance, no history to verify.');
    }

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

    await page.getByRole('button').first().click();
  });

  test('Step 5: Check "Hide Empty Balances" Filter', async () => {
    await page.getByRole('tab', { name: 'Wallets' }).click();

    const walletRows = page
      .locator('div[class*="MuiStack-root"]')
      .filter({ has: page.locator('p') });
    await expect(walletRows.first()).toBeVisible();

    const countBefore = await walletRows.count();

    const hideCheckbox = page.getByRole('checkbox', { name: 'Hide empty balances' });
    await hideCheckbox.click();
    await page.waitForTimeout(1000);

    const countAfter = await walletRows.count();
    expect(countAfter).toBeLessThanOrEqual(countBefore);

    await hideCheckbox.click();
  });

  test('Step 6: Fiat Withdrawal (USD)', async () => {
    logInfo('Starting fiat withdrawal');
    const WITHDRAW_AMOUNT = 150;

    await page.getByRole('tab', { name: 'Wallets' }).click();
    await page.getByRole('tab', { name: 'Fiat' }).click();

    const hideCheckbox = page.getByRole('checkbox', { name: 'Hide empty balances' });
    if ((await hideCheckbox.isVisible()) && (await hideCheckbox.isChecked())) {
      await hideCheckbox.uncheck();
      await page.waitForTimeout(500);
    }

    const hiddenAsterisks = page.getByText('***').first();
    if (await hiddenAsterisks.isVisible()) {
      await page.getByRole('img').nth(1).click();
      await page.waitForTimeout(1000);
    }

    const usdWalletBlock = page
      .locator('div.MuiStack-root.css-1kled2g', { has: page.locator('p', { hasText: 'USD' }) })
      .filter({ hasText: 'Доллар США' })
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

    if (currentUsdBalance < WITHDRAW_AMOUNT) {
      logWarn(
        `Insufficient USD for withdrawal. Required: ${WITHDRAW_AMOUNT}, Actual: ${currentUsdBalance}`,
      );
      test.skip(
        true,
        `Insufficient USD balance. Required: ${WITHDRAW_AMOUNT}, Actual: ${currentUsdBalance}`,
      );
    }

    await page
      .locator('div')
      .filter({ hasText: /^USDДоллар США$/ })
      .first()
      .click();
    await page
      .locator('div')
      .filter({ hasText: /^Withdraw$/ })
      .click();

    await page.waitForTimeout(500);
    await page.locator('div').filter({ hasText: 'Bank transferWithdrawal by' }).nth(5).click();

    const radioBtn = page.getByRole('button', { name: 'Test25 IBAN' }).getByRole('radio');
    await radioBtn.click();

    await page.getByRole('button', { name: 'Continue' }).click();

    const amountFieldWrapper = page
      .locator('div')
      .filter({ hasText: /^USDMAX$/ })
      .nth(1);
    await amountFieldWrapper.locator('input').fill(WITHDRAW_AMOUNT.toString());
    await page.getByRole('button', { name: 'Withdraw' }).click();

    const successMsg = page.getByText('We have received your');
    await expect(successMsg).toBeVisible({ timeout: 15000 });
    logOk('Withdrawal success message appeared');

    await page.getByText('Got it').click();
    await expect(successMsg).toBeHidden();
    logOk('Fiat withdrawal flow completed successfully');
  });

  test('Step 7: Logout & Security Check', async () => {
    await page.getByRole('tab', { name: 'Profile' }).click();

    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });

    const logoutBtn = page
      .locator('div')
      .filter({ hasText: /^Logout$/ })
      .nth(2);
    await logoutBtn.scrollIntoViewIfNeeded();
    await logoutBtn.click();

    const loginInput = page.getByRole('textbox', { name: 'Login or E-mail' });
    await expect(loginInput).toBeVisible({ timeout: 15000 });

    logInfo('Checking back button hijacking');
    await page.goBack();
    await expect(page.getByRole('tab', { name: 'Home' })).toBeHidden();

    const pinScreen = page.getByText(/Create your PIN-code|Enter your PIN-code/i);
    await expect(loginInput.or(pinScreen).first()).toBeVisible();
    logOk('Session securely terminated');
  });
});
