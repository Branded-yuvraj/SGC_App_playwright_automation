import { test, expect } from '@playwright/test';
import 'dotenv/config';


test('TC-006: Batch size 0 or -ve should be rejected', async ({ page }) => {
    test.setTimeout(120_000);

    // --- Navigate to Configuration Form ---
    await page.goto(process.env.SN_URL);
    await page.getByRole('menuitem', { name: 'All' }).click();
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await page.waitForLoadState('networkidle');

    const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .click({ timeout: 160_000 });
    await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
        .click();

    // --- Enter invalid batch size ---
    const batchSizeField = guidedSetupFrame.locator('div:nth-child(15) > .col-md-9 > .bigid-value-width');
    await batchSizeField.fill('0');
    await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();

    // --- Expect validation to block it ---
    await expect(guidedSetupFrame.getByText('Configuration could not be')).toBeVisible();
    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
});

test('TC-007: Negative batch size should be rejected', async ({ page }) => {
    test.setTimeout(120_000);

    // --- Navigate to Configuration Form ---
    await page.goto(process.env.SN_URL);
    await page.getByRole('menuitem', { name: 'All' }).click();
    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
    await page.getByRole('link', { name: 'Setup 1 of' }).click();
    await page.waitForLoadState('networkidle');

    const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .click({ timeout: 160_000 });
    await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
        .click();

    // --- Enter invalid (negative) batch size ---
    // Spreadsheet test data says -10; you validated with -100 manually — using
    // the spec's value here, but either negative number should hit the same validation.
    const batchSizeField = guidedSetupFrame.locator('div:nth-child(15) > .col-md-9 > .bigid-value-width');
    await batchSizeField.fill('-10');
    await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();

    // --- Expect validation to block it ---
    await expect(guidedSetupFrame.getByText('Configuration could not be')).toBeVisible();
    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
});