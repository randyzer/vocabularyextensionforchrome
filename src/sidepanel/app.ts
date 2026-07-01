import {
  OPTIONAL_ORIGINS,
  PENDING_DIGEST_KEY,
} from '../shared/constants';
import type { Settings } from '../shared/models';
import { send } from './api';
import { renderDigests } from './views/digests';
import { renderSettings } from './views/settings';
import { renderCurrent } from './views/current';
import { renderVocabulary } from './views/vocabulary';

type Route = 'current' | 'vocabulary' | 'digests' | 'settings';

const sidePanelOrigins = import.meta.env.MODE === 'test'
  ? ['http://127.0.0.1/*']
  : OPTIONAL_ORIGINS;

function appendTextElement(
  tagName: 'h1' | 'p',
  text: string,
): HTMLElement {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

export async function startSidePanel(root: HTMLElement): Promise<void> {
  const [settings, permitted, pending] = await Promise.all([
    send<Settings>({ type: 'GET_SETTINGS' }),
    browser.permissions.contains({ origins: sidePanelOrigins }),
    browser.storage.session.get(PENDING_DIGEST_KEY),
  ]);

  if (!permitted) {
    const heading = appendTextElement('h1', '语境生词本');
    const description = appendTextElement(
      'p',
      '只在本机处理你稳定悬停的单词和句子。',
    );
    const status = appendTextElement(
      'p',
      settings.hostPermissionOnboardingComplete
        ? '网页权限当前未启用，可重新授权。'
        : '开始前，需要允许插件读取你打开的英语网页。',
    );
    status.className = 'status';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '允许在英语网页上取词';
    button.addEventListener('click', async () => {
      button.disabled = true;

      try {
        const granted = await browser.permissions.request({
          origins: sidePanelOrigins,
        });
        await send({
          type: 'SAVE_SETTINGS',
          patch: { hostPermissionOnboardingComplete: granted },
        });
        await send({ type: 'SYNC_CONTENT_REGISTRATION' });

        if (granted) {
          await startSidePanel(root);
          return;
        }

        status.textContent = '未获得网页权限，你可以稍后再次尝试。';
      } catch (error) {
        status.textContent = error instanceof Error
          ? `启用失败：${error.message}`
          : '启用失败，请重试。';
      } finally {
        button.disabled = false;
      }
    });

    root.replaceChildren(heading, description, status, button);
    return;
  }

  let route: Route = pending[PENDING_DIGEST_KEY] ? 'digests' : 'current';
  const shell = document.createElement('div');
  shell.className = 'panel-shell';

  const header = document.createElement('header');
  header.className = 'panel-header';

  const heading = appendTextElement('h1', '语境生词本');
  const description = appendTextElement('p', '把遇见过的单词留在它原来的句子里。');
  header.append(heading, description);

  const nav = document.createElement('nav');
  nav.className = 'panel-nav';

  const content = document.createElement('main');
  content.className = 'panel-content';

  const render = async (): Promise<void> => {
    for (const button of nav.querySelectorAll<HTMLButtonElement>('button')) {
      const isCurrent = button.dataset.route === route;
      button.toggleAttribute('aria-current', isCurrent);
    }

    if (route === 'current') {
      await renderCurrent(content, () => void render());
      return;
    }

    if (route === 'vocabulary') {
      await renderVocabulary(content);
      return;
    }

    if (route === 'digests') {
      await renderDigests(content, () => void render());
      return;
    }

    await renderSettings(content, () => void render());
  };

  for (const [value, label] of [
    ['current', '本期'],
    ['vocabulary', '生词库'],
    ['digests', '周报'],
    ['settings', '设置'],
  ] as const) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.route = value;
    button.textContent = label;
    button.addEventListener('click', () => {
      route = value;
      void render();
    });
    nav.append(button);
  }

  shell.append(header, nav, content);
  root.replaceChildren(shell);
  await render();
}
