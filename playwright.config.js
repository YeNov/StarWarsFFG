// @ts-check
import { defineConfig, devices } from '@playwright/test';

// The Foundry test tier: tests/README.md. The server is tools/foundry-test-server.mjs (webServer below).
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${process.env.FVTT_PORT ?? 30000}`;

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: require.resolve('./playwright/setup.ts'),
  /* Run tests in files in parallel */
  fullyParallel: false, // TODO: investigate if we can figure out a way to do this
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Every spec shares one Foundry world, and the functional run checks that world for leaks, so
     specs must never run at the same time. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['list'], ['html', { open: 'never' }]],
  /* Starts Foundry on the test world unless the port already serves it. */
  webServer: {
    command: 'node tools/foundry-test-server.mjs',
    url: new URL('/api/status', baseURL).href,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    baseURL,
    storageState: 'state.json',
    trace: 'on-first-retry',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        /* Foundry V14 needs Chromium 146 or newer; PLAYWRIGHT_CHANNEL=chrome uses the installed
           Google Chrome when Playwright's own Chromium is older (tests/README.md, "Browser"). */
        channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
        /* The device preset pins the user agent of Playwright's own Chromium; Foundry checks the
           browser version from it, so let the browser report its real one. */
        userAgent: undefined,
        viewport: {
          width: 1440,
          height: 900
        },
        launchOptions: {
          // force GPU acceleration
          args: [
            '--ignore-gpu-blocklist',
            '--use-gl=angle',
            '--use-angle=gl-egl',
          ]
        },
      },
    },
    // TODO: re-enable all browsers
    /*
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    */
  ],
  // custom stuff added here
  expect: {
    timeout: 5_000,
  },
});
