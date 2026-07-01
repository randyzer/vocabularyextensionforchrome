import path from 'node:path';
import {
  chromium,
  expect,
  test as base,
  type BrowserContext,
} from '@playwright/test';

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  context: async ({}, use) => {
    const extensionPath = path.resolve('.output/chrome-mv3-test');
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0]
      ?? await context.waitForEvent('serviceworker');
    await use(worker.url().split('/')[2] as string);
  },
});

export { expect };
