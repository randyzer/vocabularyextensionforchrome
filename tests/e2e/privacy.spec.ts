import { expect, test } from './fixtures';

test('does not activate on input or code and sends no external requests', async ({
  context,
}) => {
  const worker = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker');

  await worker.evaluate(async () => {
    const chromeApi = (globalThis as typeof globalThis & {
      chrome: {
        scripting: {
          registerContentScripts(scripts: unknown[]): Promise<void>;
        };
      };
    }).chrome;
    await chromeApi.scripting.registerContentScripts([{
      id: 'e2e-privacy-hover',
      js: ['hover.js'],
      matches: ['http://127.0.0.1/*'],
      runAt: 'document_idle',
    }]);
  });

  const externalRequests: string[] = [];
  const page = await context.newPage();
  page.on('request', (request) => {
    const url = new URL(request.url());

    if (
      !['chrome-extension:'].includes(url.protocol)
      && url.origin !== 'http://127.0.0.1:4173'
    ) {
      externalRequests.push(request.url());
    }
  });
  await page.goto('http://127.0.0.1:4173/article.html');
  await page.locator('input').hover();
  await page.waitForTimeout(700);
  await expect(page.locator('[data-context-vocabulary-ui]')).toHaveAttribute(
    'data-state',
    'hidden',
  );
  await page.locator('code').hover();
  await page.waitForTimeout(700);
  await expect(page.locator('[data-context-vocabulary-ui]')).toHaveAttribute(
    'data-state',
    'hidden',
  );
  expect(externalRequests).toEqual([]);
});
