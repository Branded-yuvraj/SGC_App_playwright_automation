import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('Save valid BigID credentials', async ({ page }) => {
  test.setTimeout(120_000); // this flow is slow (guided setup + workflow studio) — give it 2 min

  // --- Navigate to the BigID Guided Setup via global search ---
  // (no login here — the session is already authenticated via storageState)
  await page.goto(process.env.SN_URL);
  await page.getByRole('menuitem', { name: 'All' }).click();
  await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('Big');
  await page.getByRole('link', { name: 'Setup 1 of' }).click();

  // --- Open the Guided Setup deep link recorded by codegen ---
  await page.goto(
    'https://dev403923.service-now.com/now/nav/ui/classic/params/target/%24guided_setup.do%23%2Fcontent%2F5ab5cb379371021047d3b0a08bba100c%3Ffocus%3D38388f3b9371021047d3b0a08bba1078%26group_focuses%3D%26home_options%3Dintro%26scroll_to%3D%26filter%3Dall'
  );

  const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
  await guidedSetupFrame
    .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
    .click();
  await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Connection' }).click();

  // --- Clicking "Configure" opens the connection editor in a new tab/popup ---
  const connectionPagePromise = page.waitForEvent('popup');
  await guidedSetupFrame
    .getByRole('link', { name: 'Configure Click to configure task Configure Connection' })
    .click();
  const connectionPage = await connectionPagePromise;

  // Give Workflow Studio time to actually finish loading before we touch it
  await connectionPage.waitForLoadState('load');

  // --- Fill in the connection details ---
  const connectionFrame = connectionPage.locator('iframe[title="connections-dashboard"]').contentFrame();
  await connectionFrame
    .getByRole('button', { name: 'Edit Connection SG-BigID' })
    .click({ timeout: 60_000 }); // this specific button can be slow to render

  const rootUrlField = connectionFrame.getByRole('textbox', { name: ' Root URL' });
  await rootUrlField.click();
  await rootUrlField.press('ControlOrMeta+a');
  await rootUrlField.fill(process.env.BIGID_ROOT_URL);

  const apiKeyField = connectionFrame.getByRole('textbox', { name: ' API Key' });
  await apiKeyField.click();
  await apiKeyField.fill(process.env.BIGID_API_KEY);

  await connectionFrame.getByRole('button', { name: 'Save' }).click();

  // TODO: assert the success message/state here before closing the modal

  await guidedSetupFrame.getByRole('button', { name: ' Close modal' }).click();
});