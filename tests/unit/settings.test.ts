import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  isOriginEnabled,
  sanitizeSettings,
} from '../../src/storage/settings-repository';

describe('settings', () => {
  it('defaults to enabled local behavior and Monday 09:00', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      enabled: true,
      autoSpeak: true,
      speechRate: 1,
      saveSource: true,
      notificationHour: 9,
      notificationMinute: 0,
    });
  });

  it('clamps invalid speech and notification values', () => {
    expect(sanitizeSettings({
      speechRate: 9,
      notificationHour: -3,
      notificationMinute: 80,
    })).toMatchObject({
      speechRate: 2,
      notificationHour: 0,
      notificationMinute: 59,
    });
  });

  it('drops unknown settings and invalid origins', () => {
    const input = {
      enabled: false,
      disabledOrigins: [
        'https://example.com',
        'javascript:alert(1)',
        'https://example.com',
      ],
      analyticsEnabled: true,
    };

    const settings = sanitizeSettings(input);

    expect(settings.enabled).toBe(false);
    expect(settings.disabledOrigins).toEqual(['https://example.com']);
    expect(settings).not.toHaveProperty('analyticsEnabled');
  });

  it('disables globally paused and explicitly excluded origins', () => {
    expect(isOriginEnabled(DEFAULT_SETTINGS, 'https://example.com')).toBe(true);
    expect(
      isOriginEnabled(
        { ...DEFAULT_SETTINGS, enabled: false },
        'https://example.com',
      ),
    ).toBe(false);
    expect(
      isOriginEnabled(
        {
          ...DEFAULT_SETTINGS,
          disabledOrigins: ['https://example.com'],
        },
        'https://example.com',
      ),
    ).toBe(false);
  });
});
