import { startSidePanel } from '../../src/sidepanel/app';

const rootCandidate = document.querySelector<HTMLElement>('#app');

if (!rootCandidate) {
  throw new Error('Missing #app root');
}

const root: HTMLElement = rootCandidate;

void startSidePanel(root).catch((error: unknown) => {
  root.textContent = error instanceof Error
    ? `初始化失败：${error.message}`
    : '初始化失败，请重新打开侧边栏。';
});
