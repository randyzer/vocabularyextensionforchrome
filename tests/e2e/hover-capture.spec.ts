import { expect, test } from './fixtures';

test('hovering a word saves a highlighted source sentence', async ({
  context,
  extensionId,
}) => {
  const worker = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker');
  const extensionPage = await context.newPage();
  await extensionPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

  await worker.evaluate(async () => {
    const chromeApi = (globalThis as typeof globalThis & {
      chrome: {
        scripting: {
          registerContentScripts(scripts: unknown[]): Promise<void>;
        };
      };
    }).chrome;
    await chromeApi.scripting.registerContentScripts([{
      id: 'e2e-hover',
      js: ['hover.js'],
      matches: ['http://127.0.0.1/*'],
      runAt: 'document_idle',
    }]);
  });
  await extensionPage.evaluate(async () => {
    const chromeApi = (globalThis as typeof globalThis & {
      chrome: {
        runtime: {
          sendMessage(message: unknown): Promise<unknown>;
        };
      };
    }).chrome;
    await chromeApi.runtime.sendMessage({
      type: 'SAVE_SETTINGS',
      patch: {
        hostPermissionOnboardingComplete: true,
        autoSpeak: false,
      },
    });
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/article.html');
  await page.locator('#target-word').hover();
  await page.waitForTimeout(2_500);

  await extensionPage.reload();
  await expect(extensionPage.locator('mark')).toHaveText('ultimately');
});
