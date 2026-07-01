import { expect, test } from './fixtures';

test('repeated weekly alarms keep one period digest', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  const count = await page.evaluate(async () => {
    const chromeApi = (globalThis as typeof globalThis & {
      chrome: {
        runtime: {
          sendMessage(message: unknown): Promise<{ data: unknown[] }>;
        };
      };
    }).chrome;
    await chromeApi.runtime.sendMessage({ type: 'TEST_FIRE_ALARM' });
    await chromeApi.runtime.sendMessage({ type: 'TEST_FIRE_ALARM' });
    const response = await chromeApi.runtime.sendMessage({
      type: 'LIST_DIGESTS',
    });
    return response.data.length;
  });

  expect(count).toBe(1);
});
