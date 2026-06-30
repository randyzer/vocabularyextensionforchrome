import { DictionaryEngine } from '../dictionary/engine';
import type { LookupResult } from '../dictionary/types';
import {
  extensionRequestSchema,
  type ExtensionResponse,
} from '../shared/messages';
import {
  deleteCapture,
  listCaptures,
  saveCapture,
  undoCapture,
  updateCapture,
} from '../storage/capture-repository';
import {
  getDigest,
  listDigests,
} from '../storage/digest-repository';
import {
  getSettings,
  saveSettings,
} from '../storage/settings-repository';
import { ensureContentRegistration } from './content-registration';
import { speakWord } from './speech-service';

export interface RouterDependencies {
  lookup(word: string): Promise<LookupResult>;
  speak(word: string, rate: number): Promise<void>;
  saveCapture: typeof saveCapture;
  deleteCapture: typeof deleteCapture;
  undoCapture: typeof undoCapture;
  listCaptures: typeof listCaptures;
  updateCapture: typeof updateCapture;
  listDigests: typeof listDigests;
  getDigest: typeof getDigest;
  getSettings: typeof getSettings;
  saveSettings: typeof saveSettings;
  syncContentRegistration: typeof ensureContentRegistration;
}

export function createMessageHandler(dependencies: RouterDependencies) {
  return async (raw: unknown): Promise<ExtensionResponse> => {
    const parsed = extensionRequestSchema.safeParse(raw);

    if (!parsed.success) {
      return { ok: false, error: 'INVALID_REQUEST' };
    }

    try {
      const request = parsed.data;

      switch (request.type) {
        case 'LOOKUP_WORD':
          return {
            ok: true,
            data: await dependencies.lookup(request.word),
          };
        case 'SPEAK_WORD': {
          const settings = await dependencies.getSettings();
          await dependencies.speak(request.word, settings.speechRate);
          return { ok: true };
        }
        case 'SAVE_CAPTURE': {
          const lookup = await dependencies.lookup(
            request.payload.surfaceWord,
          );

          if (lookup.lookupStatus !== 'found') {
            return { ok: false, error: 'WORD_NOT_FOUND' };
          }

          const settings = await dependencies.getSettings();
          const payload = settings.saveSource
            ? request.payload
            : {
                ...request.payload,
                sourceTitle: '',
                sourceUrl: new URL('/', request.payload.sourceUrl).toString(),
              };

          return {
            ok: true,
            data: await dependencies.saveCapture(
              payload,
              lookup.entry,
            ),
          };
        }
        case 'UNDO_CAPTURE':
          await dependencies.undoCapture(
            request.captureId,
            request.savedAt,
          );
          return { ok: true };
        case 'DELETE_CAPTURE':
          await dependencies.deleteCapture(request.id);
          return { ok: true };
        case 'LIST_CAPTURES':
          return {
            ok: true,
            data: await dependencies.listCaptures(request.filter),
          };
        case 'UPDATE_CAPTURE':
          return {
            ok: true,
            data: await dependencies.updateCapture(
              request.id,
              request.mastered,
            ),
          };
        case 'LIST_DIGESTS':
          return {
            ok: true,
            data: await dependencies.listDigests(),
          };
        case 'GET_DIGEST':
          return {
            ok: true,
            data: await dependencies.getDigest(request.digestId),
          };
        case 'GET_SETTINGS':
          return {
            ok: true,
            data: await dependencies.getSettings(),
          };
        case 'SAVE_SETTINGS':
          return {
            ok: true,
            data: await dependencies.saveSettings(request.patch),
          };
        case 'SYNC_CONTENT_REGISTRATION':
          await dependencies.syncContentRegistration();
          return { ok: true };
        default:
          return { ok: false, error: 'NOT_IMPLEMENTED' };
      }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      };
    }
  };
}

const dictionary = new DictionaryEngine();

export const handleMessage = createMessageHandler({
  lookup: (word) => dictionary.lookup(word),
  speak: speakWord,
  saveCapture,
  deleteCapture,
  undoCapture,
  listCaptures,
  updateCapture,
  listDigests,
  getDigest,
  getSettings,
  saveSettings,
  syncContentRegistration: ensureContentRegistration,
});
