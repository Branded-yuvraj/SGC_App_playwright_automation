import { test, expect } from '@playwright/test';
import 'dotenv/config';

test('user can log in to ServiceNow', async ({ page }) => {
  await page.goto(process.env.SN_URL);

  await page.getByRole('textbox', { name: 'User name' }).fill(process.env.SN_USER);
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.SN_PASS);
  await page.getByRole('button', { name: 'Log in' }).click();

  // assertion: prove login actually worked —
  // if the username field is gone, we're no longer on the login page
  await expect(page.getByRole('textbox', { name: 'User name' })).not.toBeVisible();
});