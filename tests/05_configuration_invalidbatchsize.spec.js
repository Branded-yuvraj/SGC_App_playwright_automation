import { test, expect } from '@playwright/test';
import 'dotenv/config';

// Helper function to reset batch size back to 200 after each test
async function resetBatchSize(page) {
    try {
        await page.goto(process.env.SN_URL);
        await page.getByRole('menuitem', { name: 'All' }).click();
        
        const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
        if (await clearFilterButton.isVisible().catch(() => false)) {
            await clearFilterButton.click();
        }

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

        const batchSizeField = guidedSetupFrame.locator('div:nth-child(15) > .col-md-9 > .bigid-value-width');
        await batchSizeField.waitFor({ state: 'visible', timeout: 30_000 });
        await batchSizeField.click();
        await batchSizeField.press('ControlOrMeta+a');
        await batchSizeField.fill('200');
        
        await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
        await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
        console.log('[Cleanup] Batch size successfully reset to 200.');
    } catch (error) {
        console.error('[Cleanup Error] Failed to reset batch size to 200:', error);
    }
}

test.afterEach(async ({ page }) => {
    await resetBatchSize(page);
});

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
    const batchSizeField = guidedSetupFrame.locator('div:nth-child(15) > .col-md-9 > .bigid-value-width');
    await batchSizeField.fill('-10');
    await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();

    // --- Expect validation to block it ---
    await expect(guidedSetupFrame.getByText('Configuration could not be')).toBeVisible();
    await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
});