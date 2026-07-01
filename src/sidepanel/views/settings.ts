import { OPTIONAL_ORIGINS } from '../../shared/constants';
import type { Settings } from '../../shared/models';
import { send } from '../api';

const settingsOrigins = import.meta.env.MODE === 'test'
  ? ['http://127.0.0.1/*']
  : OPTIONAL_ORIGINS;

function createToggle(
  settings: Settings,
  labelText: string,
  key: 'enabled' | 'autoSpeak' | 'saveSource',
  refresh: () => void,
): HTMLElement {
  const label = document.createElement('label');
  label.className = 'settings-toggle';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = settings[key];
  input.addEventListener('change', async () => {
    await send({
      type: 'SAVE_SETTINGS',
      patch: { [key]: input.checked },
    });
    refresh();
  });

  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(input, text);

  return label;
}

export async function renderSettings(
  container: HTMLElement,
  refresh: () => void,
): Promise<void> {
  const [settings, permitted] = await Promise.all([
    send<Settings>({ type: 'GET_SETTINGS' }),
    browser.permissions.contains({ origins: settingsOrigins }),
  ]);
  container.replaceChildren();

  const section = document.createElement('section');
  section.className = 'settings-panel';

  const form = document.createElement('form');
  form.className = 'settings-form';

  const rateLabel = document.createElement('label');
  rateLabel.className = 'settings-range';
  rateLabel.textContent = `发音速度 ${settings.speechRate.toFixed(1)}x`;

  const rate = document.createElement('input');
  rate.type = 'range';
  rate.min = '0.5';
  rate.max = '2';
  rate.step = '0.1';
  rate.value = String(settings.speechRate);
  rate.addEventListener('change', async () => {
    await send({
      type: 'SAVE_SETTINGS',
      patch: { speechRate: Number(rate.value) },
    });
    refresh();
  });
  rateLabel.append(rate);

  const disabledSites = document.createElement('div');
  disabledSites.className = 'settings-disabled-sites';
  disabledSites.textContent = settings.disabledOrigins.length > 0
    ? `已停用站点：${settings.disabledOrigins.join('，')}`
    : '当前没有停用站点。';

  const disableSite = document.createElement('button');
  disableSite.type = 'button';
  disableSite.textContent = '输入要停用的站点';
  disableSite.addEventListener('click', async () => {
    const origin = prompt('输入完整来源，例如 https://example.com');

    if (!origin) {
      return;
    }

    await send({
      type: 'SAVE_SETTINGS',
      patch: {
        disabledOrigins: [...settings.disabledOrigins, origin],
      },
    });
    refresh();
  });

  const permission = document.createElement('button');
  permission.type = 'button';
  permission.textContent = permitted
    ? '网页权限已授予'
    : '检查或重新授予网页权限';
  permission.disabled = permitted;
  permission.addEventListener('click', async () => {
    const granted = await browser.permissions.request({
      origins: settingsOrigins,
    });
    await send({
      type: 'SAVE_SETTINGS',
      patch: { hostPermissionOnboardingComplete: granted },
    });
    await send({ type: 'SYNC_CONTENT_REGISTRATION' });
    refresh();
  });

  const exportButton = document.createElement('button');
  exportButton.type = 'button';
  exportButton.textContent = '导出 JSON';
  exportButton.addEventListener('click', async () => {
    const payload = await send({
      type: 'EXPORT_DATA',
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `context-vocabulary-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];

    if (!file) {
      return;
    }

    await send({
      type: 'IMPORT_DATA',
      payload: JSON.parse(await file.text()),
    });
    refresh();
  });

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.textContent = '删除全部本地数据';
  clearButton.addEventListener('click', async () => {
    if (!confirm('删除后无法恢复，确定继续？')) {
      return;
    }

    await send({ type: 'CLEAR_ALL_DATA' });
    refresh();
  });

  form.append(
    createToggle(settings, '启用取词', 'enabled', refresh),
    createToggle(settings, '自动发音', 'autoSpeak', refresh),
    createToggle(settings, '保存原网页来源', 'saveSource', refresh),
    rateLabel,
    disabledSites,
    disableSite,
    permission,
    exportButton,
    importInput,
    clearButton,
  );
  section.append(form);
  container.append(section);
}
