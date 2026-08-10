import { test } from '@playwright/test';
import 'dotenv/config';

const authFile = 'playwright/.auth/user.json';

test('login and save session', async ({ page }) => {
  await page.goto(process.env.SN_URL);
  await page.getByRole('textbox', { name: 'User name' }).fill(process.env.SN_USER);
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.SN_PASS);
  await page.getByRole('button', { name: 'Log in' }).click();

  await page.getByRole('textbox', { name: 'User name' }).waitFor({ state: 'hidden' });

  await page.context().storageState({ path: authFile });
});