import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Add Key Value to File System', async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto(process.env.SN_URL);

  // Open CI Class Manager
  await page.getByRole('menuitem', { name: 'All' }).click();

  await page
    .getByRole('textbox', { name: 'Enter search term to filter' })
    .fill('ci class');

  await page.getByRole('link', { name: 'CI Class Manager 1 of' }).click();

  const frame = page.locator('iframe[name="gsft_main"]').contentFrame();

  await frame.getByRole('button', { name: 'Toggle hierarchy' }).click();

  await frame
    .getByRole('searchbox', { name: 'Search CI Classes' })
    .fill('file system');

  // The class search results list re-renders via ng-repeat/filter as you type,
  // and with more candidate matches (File System, NAS/NFS/SMB File system,
  // File System Snapshot) it can take a moment to settle before the exact
  // option is stably clickable.
  await page.waitForTimeout(2_000);

  const fileSystemOption = frame.getByRole('option', { name: /^File System$/i });
  await fileSystemOption.waitFor({ state: 'visible', timeout: 15_000 });
  await fileSystemOption.click();

  const fileSystemButton = frame.getByRole('button', { name: /^File System(,|$)/ });

  if (!(await fileSystemButton.isVisible().catch(() => false))) {
    // Neither "File System" nor "File System, Contains..." matched — log
    // every button whose accessible name mentions "File System" so we can
    // see the real text this instance renders instead of guessing blindly.
    const candidates = await frame.getByRole('button', { name: /File System/i }).all();
    console.log(`No match for "File System" — found ${candidates.length} candidate button(s):`);
    for (const el of candidates) {
      console.log(' ->', JSON.stringify(await el.getAttribute('aria-label')));
    }
  }

  await fileSystemButton.click({ timeout: 15_000 });

  await frame
    .getByRole('button', { name: 'Show information for Class Info - Identification Rule' })
    .click();

  await frame.getByRole('button', { name: 'Add related entry' }).click();

  // Confirmed fix: the panel needs a moment to finish rendering before its
  // dropdown is actually interactive
  await page.waitForTimeout(2_000);

  await frame.locator('a').filter({ hasText: 'Affected CIs' }).click();

  const select2Search = frame.locator('.select2-drop-active input.select2-input');
  await select2Search.waitFor({ state: 'visible', timeout: 60_000 });
  await select2Search.fill('key');

  await frame.getByRole('option', { name: 'Key Value' }).waitFor({ state: 'visible', timeout: 30_000 });
  await frame.getByRole('option', { name: 'Key Value' }).click();

  const availableList = frame.getByLabel('Available', { exact: true });
  await availableList.selectOption([{ label: 'Key' }, { label: 'Value' }]);

  await frame.getByRole('button', { name: /Add selected items to the/ }).click();

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
    name: ' Task in progress Create Key-Value Related Entry for File System'
  });

  if (await taskInProgressLink.isVisible().catch(() => false)) {
    await taskInProgressLink.click();

    await page.waitForTimeout(2000);

    await guidedSetupFrame
      .getByRole('button', {
        name: 'Mark as Complete Click to mark complete task Create Key-Value Related Entry for File System',
        exact: true
      })
      .click();

    await expect(
      guidedSetupFrame.getByRole('button', {
        name: 'Mark as Incomplete Click to mark incomplete task Create Key-Value Related Entry for File System',
        exact: true
      })
    ).toBeVisible();
  } else {
    console.log('Task already completed. Skipping Mark as Complete step.');
  }


});