import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: ({ mode }) => ({
    name: '语境生词本',
    description: '悬停查词、保存原句并生成每周本地复习周报。',
    permissions: [
      'storage',
      'alarms',
      'notifications',
      'tts',
      'sidePanel',
      'scripting',
    ],
    optional_host_permissions: ['http://*/*', 'https://*/*'],
    host_permissions: mode === 'test' ? ['http://127.0.0.1/*'] : undefined,
    action: {
      default_title: '打开语境生词本',
    },
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
  }),
});
