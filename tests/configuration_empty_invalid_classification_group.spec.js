import { test, expect } from '@playwright/test';
import 'dotenv/config';

const classificationGroupField = (frame) => frame.getByRole('textbox').first();

async function navigateToConfigureProperties(page) {
    await page.goto(process.env.SN_URL);
    await page.getByRole('menuitem', { name: 'All' }).click();

    const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
    if (await clearFilterButton.isVisible().catch(() => false)) {
        await clearFilterButton.click();
    }

    await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
    await page.getByRole('link', { name: 'Setup 1 of' }).click();

    const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    await guidedSetupFrame
        .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
        .click({ timeout: 60_000 });
    await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Properties' }).click();
    await guidedSetupFrame
        .getByRole('link', { name: 'Configure Click to configure task Configure Properties' })
        .click();

    return guidedSetupFrame;
}

test.describe('TC-011: Invalid Classification Group', () => {
    test.afterEach(async ({ page }) => {
        // ALWAYS restore a valid Classification Group afterward, even if the
        // test above fails partway — TC-005/TC-010 and others assume it's set.
        const guidedSetupFrame = await navigateToConfigureProperties(page);
        const field = classificationGroupField(guidedSetupFrame);
        await field.dblclick();
        await field.fill(process.env.CLASSIFICATION_GROUP_NAME);
        await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();
        await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
    });

    test('TC-011: Non-existent Classification Group is rejected', async ({ page }) => {
        test.setTimeout(120_000);

        const guidedSetupFrame = await navigateToConfigureProperties(page);
        const field = classificationGroupField(guidedSetupFrame);

        await field.dblclick();
        await field.fill('abc');
        await guidedSetupFrame.getByRole('toolbar').getByRole('button', { name: 'Save and Validate' }).click();

        await expect(guidedSetupFrame.getByText('The classification group does')).toBeVisible();
        await guidedSetupFrame.getByRole('button', { name: 'OK', exact: true }).click();
    });
});