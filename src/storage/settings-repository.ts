import { SCHEMA_VERSION, SETTINGS_KEY } from '../shared/constants';
import type { Settings } from '../shared/models';

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  autoSpeak: true,
  speechRate: 1,
  saveSource: true,
  notificationHour: 9,
  notificationMinute: 0,
  disabledOrigins: [],
  hostPermissionOnboardingComplete: false,
  schemaVersion: SCHEMA_VERSION,
};

export function sanitizeSettings(input: Partial<Settings>): Settings {
  return {
    enabled: typeof input.enabled === 'boolean'
      ? input.enabled
      : DEFAULT_SETTINGS.enabled,
    autoSpeak: typeof input.autoSpeak === 'boolean'
      ? input.autoSpeak
      : DEFAULT_SETTINGS.autoSpeak,
    saveSource: typeof input.saveSource === 'boolean'
      ? input.saveSource
      : DEFAULT_SETTINGS.saveSource,
    speechRate: Math.min(2, Math.max(0.5, input.speechRate ?? 1)),
    notificationHour: Math.min(
      23,
      Math.max(0, Math.trunc(input.notificationHour ?? 9)),
    ),
    notificationMinute: Math.min(
      59,
      Math.max(0, Math.trunc(input.notificationMinute ?? 0)),
    ),
    disabledOrigins: [...new Set(input.disabledOrigins ?? [])]
      .filter((origin) => /^https?:\/\/[^/]+$/.test(origin)),
    hostPermissionOnboardingComplete:
      typeof input.hostPermissionOnboardingComplete === 'boolean'
        ? input.hostPermissionOnboardingComplete
        : DEFAULT_SETTINGS.hostPermissionOnboardingComplete,
    schemaVersion: SCHEMA_VERSION,
  };
}

export async function getSettings(): Promise<Settings> {
  const stored = await browser.storage.local.get(SETTINGS_KEY);
  return sanitizeSettings(
    (stored[SETTINGS_KEY] as Partial<Settings> | undefined) ?? {},
  );
}

export async function saveSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  const settings = sanitizeSettings({ ...(await getSettings()), ...patch });
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
  return settings;
}

export function isOriginEnabled(settings: Settings, origin: string): boolean {
  return settings.enabled && !settings.disabledOrigins.includes(origin);
}
