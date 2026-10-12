
import {chromium, type FullConfig} from '@playwright/test';
import {assertTestWorld} from './foundry.js';

async function globalSetup(config: FullConfig) {
  // TODO: this should probably be done before each test instead of globally
  // this will allow us to use specific accounts for each test, and in turn run tests in parallel
  const { baseURL, storageState, channel } = config.projects[0].use;
  // Never join a world outside the test-world allowlist (FVTT_TEST_WORLDS), even on a reused server.
  if (baseURL) await assertTestWorld(baseURL);
  const browser = await chromium.launch({ channel });
  const page = await browser.newPage();
  /*
  await page.goto(baseURL!);
  await page.getByLabel('User Name').fill('user');
  await page.getByLabel('Password').fill('password');
  await page.getByText('Sign in').click();
  await page.context().storageState({ path: storageState as string });
  await browser.close();

  */
  if (!baseURL) throw new Error('Playwright baseURL is not configured');
  await page.goto(new URL('/join', baseURL).href);
  await page.getByRole('combobox').selectOption('Gamemaster');
  await page.getByRole('button', { name: 'Join Game' }).click();
  // The world can take well over expect's 5 s default to load; wait for Foundry itself.
  await page.waitForURL(/\/game$/, { timeout: 60_000 });
  await page.waitForFunction(() => (globalThis as any).game?.ready === true, null, { timeout: 120_000 });

  await page.context().storageState({ path: storageState as string });
  await browser.close();
}

export default globalSetup;
