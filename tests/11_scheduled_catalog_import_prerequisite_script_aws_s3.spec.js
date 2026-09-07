import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Add Key Value to Affected CIs', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(process.env.SN_URL);

  // Open CI Class Manager
  await page.getByRole('menuitem', { name: 'All' }).click();

  await page
    .getByRole('textbox', { name: 'Enter search term to filter' })
    .fill('ci class');

  await page.getByRole('link', { name: /CI Class Manager/i }).click();

  const frame = page.locator('iframe[name="gsft_main"]').contentFrame();

  await frame.getByRole('button', { name: 'Toggle hierarchy' }).click();

  await frame
    .getByRole('searchbox', { name: 'Search CI Classes' })
    .fill('aws s3');

  await frame.getByRole('option', { name: /AWS S3 Endpoint/i }).click();

  await frame
    .getByRole('button', { name: /AWS S3 Endpoint/i })
    .click();

  await frame
    .getByRole('button', { name: /Show information for Class Info - Identification Rule/i })
    .click();

  await frame.getByRole('button', { name: /Add related entry/i }).click();

  // The "Create Related Entry" panel needs a moment to fully finish
  // rendering/animating before its dropdown is actually interactive —
  // confirmed by testing this is what fixes the flaky click.
  await page.waitForTimeout(2_000);

  await frame.locator('a').filter({ hasText: 'Affected CIs' }).click();

  const select2Search = frame.locator('.select2-drop-active input.select2-input');
  await select2Search.waitFor({ state: 'visible', timeout: 60_000 });
  await select2Search.fill('key');

  await frame.getByRole('option', { name: 'Key Value' }).waitFor({ state: 'visible', timeout: 30_000 });
  await frame.getByRole('option', { name: 'Key Value' }).click();

  const availableList = frame.getByLabel('Available', { exact: true });
  await availableList.selectOption([{ label: 'Key' }, { label: 'Value' }]);

  await frame.getByRole('button', { name: /Add selected items to the/i }).click();

  await frame.getByRole('button', { name: 'Save' }).click();

  await page.waitForTimeout(5_000);



  // --- Navigate to Guided Setup and mark "Create Key-Value Pair" as complete ---
  await page.getByRole('menuitem', { name: 'All' }).click();

  const clearFilterButton = page.getByRole('button', { name: 'Clear filter' });
  if (await clearFilterButton.isVisible().catch(() => false)) {
    await clearFilterButton.click();
  }

  await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('bigid');
  await page.getByRole('link', { name: 'Setup 1 of' }).click();

  const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();

  await guidedSetupFrame
    .getByRole('button', { name: 'Select chain item to goto Create Key-Value Pair' })
    .click();

  await page.waitForTimeout(2000);

  const taskInProgressLink = guidedSetupFrame.getByRole('link', {
    name: ' Task in progress Create Key-Value Related Entry for AWS S3 Endpoint'
  });

  if (await taskInProgressLink.isVisible().catch(() => false)) {
    await taskInProgressLink.click();

    await page.waitForTimeout(2000);

    await guidedSetupFrame
      .getByRole('button', {
        name: 'Mark as Complete Click to mark complete task Create Key-Value Related Entry for AWS S3 Endpoint',
        exact: true
      })
      .click();

    await expect(
      guidedSetupFrame.getByRole('button', {
        name: 'Mark as Incomplete Click to mark incomplete task Create Key-Value Related Entry for AWS S3 Endpoint',
        exact: true
      })
    ).toBeVisible();
  } else {
    console.log('Task already completed. Skipping Mark as Complete step.');
  }
  // If the task is still in progress, open it and mark it complete. If it's already
  // completed, the in-progress link won't be there and there's nothing more to do.
  // const createKeyInProgressLink = guidedSetupFrame.getByRole('link', { name: ' Task in progress Create Key-Value Related Entry for AWS S3 Endpoint' });
  // if (await createKeyInProgressLink.isVisible().catch(() => false)) {
  //   await createKeyInProgressLink.click();
  //   await guidedSetupFrame
  //     .getByRole('button', { name: 'Mark as Complete Click to mark complete task Create Key-Value Related Entry for AWS S3 Endpoint', exact: true })
  //     .click();
  // }
});