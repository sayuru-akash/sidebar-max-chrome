import { test } from '@playwright/test';

test.skip(
  !process.env.EXTENSION_PATH,
  'Set EXTENSION_PATH to a built extension output to run end-to-end coverage.',
);

test('sidepanel extension placeholder', async () => {
  // Loading MV3 extensions in Playwright requires a built extension directory and
  // a local Chromium launch configuration. This placeholder keeps the E2E shape in repo.
});
