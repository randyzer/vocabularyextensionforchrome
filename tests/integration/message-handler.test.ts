import { describe, expect, it, vi } from 'vitest';
import { createMessageHandler } from '../../src/background/message-handler';
import type { RouterDependencies } from '../../src/background/message-handler';
import type { Settings } from '../../src/shared/models';

const settings: Settings = {
  enabled: true,
  autoSpeak: true,
  speechRate: 1.25,
  saveSource: true,
  notificationHour: 9,
  notificationMinute: 0,
  disabledOrigins: [],
  hostPermissionOnboardingComplete: false,
  schemaVersion: 1,
};

function createDependencies(): RouterDependencies {
  return {
    lookup: vi.fn(),
    speak: vi.fn(),
    saveCapture: vi.fn(),
    deleteCapture: vi.fn(),
    undoCapture: vi.fn(),
    listCaptures: vi.fn(),
    updateCapture: vi.fn(),
    listDigests: vi.fn(),
    getDigest: vi.fn(),
    getSettings: vi.fn().mockResolvedValue(settings),
    saveSettings: vi.fn(),
    syncContentRegistration: vi.fn(),
  };
}

const capturePayload = {
  surfaceWord: 'Ultimately',
  sentence: 'The proposal was ultimately rejected.',
  wordStart: 17,
  wordEnd: 27,
  sourceTitle: 'Article',
  sourceUrl: 'https://example.com/article',
};

describe('message handler', () => {
  it('rejects malformed requests before dependencies run', async () => {
    const dependencies = createDependencies();
    const handler = createMessageHandler(dependencies);

    const response = await handler({ type: 'LOOKUP_WORD', word: '' });

    expect(response).toEqual({ ok: false, error: 'INVALID_REQUEST' });
    expect(dependencies.lookup).not.toHaveBeenCalled();
  });

  it('returns an offline dictionary lookup result', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.lookup).mockResolvedValue({
      lookupStatus: 'found',
      entry: { lemma: 'ultimately', definitionsZh: ['最终'] },
    });

    await expect(createMessageHandler(dependencies)({
      type: 'LOOKUP_WORD',
      word: 'Ultimately',
    })).resolves.toEqual({
      ok: true,
      data: {
        lookupStatus: 'found',
        entry: { lemma: 'ultimately', definitionsZh: ['最终'] },
      },
    });
  });

  it('does not save a word missing from the offline dictionary', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.lookup).mockResolvedValue({
      lookupStatus: 'not_found',
    });

    await expect(createMessageHandler(dependencies)({
      type: 'SAVE_CAPTURE',
      payload: capturePayload,
    })).resolves.toEqual({ ok: false, error: 'WORD_NOT_FOUND' });
    expect(dependencies.saveCapture).not.toHaveBeenCalled();
  });

  it('passes the dictionary entry to capture persistence', async () => {
    const dependencies = createDependencies();
    const entry = { lemma: 'ultimately', definitionsZh: ['最终'] };
    const saved = { capture: { id: crypto.randomUUID() }, savedAt: 100 };
    vi.mocked(dependencies.lookup).mockResolvedValue({
      lookupStatus: 'found',
      entry,
    });
    vi.mocked(dependencies.saveCapture).mockResolvedValue(saved as never);

    await expect(createMessageHandler(dependencies)({
      type: 'SAVE_CAPTURE',
      payload: capturePayload,
    })).resolves.toEqual({ ok: true, data: saved });
    expect(dependencies.saveCapture).toHaveBeenCalledWith(
      capturePayload,
      entry,
    );
  });

  it('removes page-level source details when source saving is disabled', async () => {
    const dependencies = createDependencies();
    const entry = { lemma: 'ultimately', definitionsZh: ['最终'] };
    const saved = { capture: { id: crypto.randomUUID() }, savedAt: 100 };

    vi.mocked(dependencies.lookup).mockResolvedValue({
      lookupStatus: 'found',
      entry,
    });
    vi.mocked(dependencies.getSettings).mockResolvedValue({
      ...settings,
      saveSource: false,
    });
    vi.mocked(dependencies.saveCapture).mockResolvedValue(saved as never);

    await expect(createMessageHandler(dependencies)({
      type: 'SAVE_CAPTURE',
      payload: capturePayload,
    })).resolves.toEqual({ ok: true, data: saved });
    expect(dependencies.saveCapture).toHaveBeenCalledWith(
      {
        ...capturePayload,
        sourceTitle: '',
        sourceUrl: 'https://example.com/',
      },
      entry,
    );
  });

  it('uses the configured speech rate', async () => {
    const dependencies = createDependencies();

    await expect(createMessageHandler(dependencies)({
      type: 'SPEAK_WORD',
      word: 'ultimately',
    })).resolves.toEqual({ ok: true });
    expect(dependencies.speak).toHaveBeenCalledWith('ultimately', 1.25);
  });

  it('returns explicit dependency errors', async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.lookup).mockRejectedValue(
      new Error('DICTIONARY_UNAVAILABLE'),
    );

    await expect(createMessageHandler(dependencies)({
      type: 'LOOKUP_WORD',
      word: 'ultimately',
    })).resolves.toEqual({
      ok: false,
      error: 'DICTIONARY_UNAVAILABLE',
    });
  });

  it('routes content registration synchronization', async () => {
    const dependencies = createDependencies();

    await expect(createMessageHandler(dependencies)({
      type: 'SYNC_CONTENT_REGISTRATION',
    })).resolves.toEqual({ ok: true });
    expect(dependencies.syncContentRegistration).toHaveBeenCalledOnce();
  });
});
