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
    `${process.env.SN_URL}/now/nav/ui/classic/params/target/%24guided_setup.do%23%2Fcontent%2F5ab5cb379371021047d3b0a08bba100c%3Ffocus%3D38388f3b9371021047d3b0a08bba1078%26group_focuses%3D%26home_options%3Dintro%26scroll_to%3D%26filter%3Dall`
  );

  const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
  await guidedSetupFrame
    .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
    .click();
  // On the first run, "Configure Connection" hasn't been completed yet, so it shows
  // up as "Task in progress" instead of "Task completed". Handle both cases, and
  // remember which one we hit so we know whether it still needs to be marked complete.
  const taskInProgressLink = guidedSetupFrame.getByRole('link', { name: ' Task in progress Configure' });
  const taskCompletedLink = guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Connection' });

  const needsMarkAsComplete = await taskInProgressLink.isVisible().catch(() => false);
  if (needsMarkAsComplete) {
    await taskInProgressLink.click();
  } else {
    await taskCompletedLink.click();
  }

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

  // On first-time setup there's no existing connection yet, so the button reads
  // "Configure Connection" instead of "Edit Connection". Handle both cases.
  const configureConnectionButton = connectionFrame.getByRole('button', { name: 'Configure Connection SG-BigID' });
  const editConnectionButton = connectionFrame.getByRole('button', { name: 'Edit Connection SG-BigID' });

  if (await configureConnectionButton.isVisible().catch(() => false)) {
    await configureConnectionButton.click({ timeout: 60_000 }); // this specific button can be slow to render
  } else {
    await editConnectionButton.click({ timeout: 60_000 }); // this specific button can be slow to render
  }

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

  if (needsMarkAsComplete) {
    // "Mark as Complete" doesn't live on the original guided setup frame we started on —
    // it's on the guided setup dashboard view, so navigate there first.
    await page.goto(
      `${process.env.SN_URL}/now/nav/ui/classic/params/target/%24guided_setup.do%23%2Fcontent%2F38388f3b9371021047d3b0a08bba1078%3Ffocus%3Dc885634d8339f61058669529feaad38a%26group_focuses%3D%26home_options%3Ddashboard%26scroll_to%3D%26filter%3Dall`
    );
    const markCompleteFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
    await markCompleteFrame
      .getByRole('button', { name: 'Mark as Complete Click to mark complete task Configure Connection' })
      .click();
  }
});



// import { test, expect } from '@playwright/test';
// import 'dotenv/config';

// test('Save valid BigID credentials', async ({ page }) => {
//   test.setTimeout(120_000); // this flow is slow (guided setup + workflow studio) — give it 2 min

//   // --- Navigate to the BigID Guided Setup via global search ---
//   // (no login here — the session is already authenticated via storageState)
//   await page.goto(process.env.SN_URL);
//   await page.getByRole('menuitem', { name: 'All' }).click();
//   await page.getByRole('textbox', { name: 'Enter search term to filter' }).fill('Big');
//   await page.getByRole('link', { name: 'Setup 1 of' }).click();

//   // --- Open the Guided Setup deep link recorded by codegen ---
//   await page.goto(
//     `${process.env.SN_URL}/now/nav/ui/classic/params/target/%24guided_setup.do%23%2Fcontent%2F5ab5cb379371021047d3b0a08bba100c%3Ffocus%3D38388f3b9371021047d3b0a08bba1078%26group_focuses%3D%26home_options%3Dintro%26scroll_to%3D%26filter%3Dall`
//   );

//   const guidedSetupFrame = page.locator('iframe[name="gsft_main"]').contentFrame();
//   await guidedSetupFrame
//     .getByRole('button', { name: 'Select chain item to goto Configure Connection and Properties' })
//     .click();
//   await guidedSetupFrame.getByRole('link', { name: ' Task completed Configure Connection' }).click();

//   // --- Clicking "Configure" opens the connection editor in a new tab/popup ---
//   const connectionPagePromise = page.waitForEvent('popup');
//   await guidedSetupFrame
//     .getByRole('link', { name: 'Configure Click to configure task Configure Connection' })
//     .click();
//   const connectionPage = await connectionPagePromise;

//   // Give Workflow Studio time to actually finish loading before we touch it
//   await connectionPage.waitForLoadState('load');

//   // --- Fill in the connection details ---
//   const connectionFrame = connectionPage.locator('iframe[title="connections-dashboard"]').contentFrame();
//   await connectionFrame
//     .getByRole('button', { name: 'Edit Connection SG-BigID' })
//     .click({ timeout: 60_000 }); // this specific button can be slow to render

//   const rootUrlField = connectionFrame.getByRole('textbox', { name: ' Root URL' });
//   await rootUrlField.click();
//   await rootUrlField.press('ControlOrMeta+a');
//   await rootUrlField.fill(process.env.BIGID_ROOT_URL);

//   const apiKeyField = connectionFrame.getByRole('textbox', { name: ' API Key' });
//   await apiKeyField.click();
//   await apiKeyField.fill(process.env.BIGID_API_KEY);

//   await connectionFrame.getByRole('button', { name: 'Save' }).click();

//   // TODO: assert the success message/state here before closing the modal

//   await guidedSetupFrame.getByRole('button', { name: ' Close modal' }).click();
// });